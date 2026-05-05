import EventEmitter from 'events';
import * as cheerio from 'cheerio';
import type { SitemapNode, LogEntry, CrawlErrorCode } from './types.js';
import { discoverSitemaps, getSitemapUrls } from './sitemap.js';

const REQUEST_TIMEOUT = 12000;
const MAX_TOTAL_URLS = 15000;
const BFS_CONCURRENCY = 10;

const SKIP_EXTENSIONS =
  /\.(jpg|jpeg|png|gif|svg|webp|ico|bmp|tiff|pdf|zip|tar|gz|7z|rar|mp4|mp3|wav|ogg|woff|woff2|ttf|eot|otf|css|js|mjs|ts|json|xml|txt|csv|xlsx|docx|pptx|ppt|xls|dmg|exe|pkg|deb|rpm)(\?.*)?$/i;

const LOCALE_RE = /^\/([a-z]{2}|[a-z]{2}-[a-z]{2,4})(\/|$)/i;

export interface CrawlOptions {
  filterLocales?: boolean;
  excludePaths?: string[];
}

function isExcluded(pathname: string, options: CrawlOptions): boolean {
  if (options.filterLocales && LOCALE_RE.test(pathname)) return true;
  if (options.excludePaths) {
    for (const prefix of options.excludePaths) {
      const p = prefix.endsWith('/') ? prefix.slice(0, -1) : prefix;
      if (pathname === p || pathname.startsWith(p + '/')) return true;
    }
  }
  return false;
}

export class CrawlError extends Error {
  constructor(public code: CrawlErrorCode, message: string) {
    super(message);
  }
}

// Strip www. and return base domain for same-domain checks
function getRootDomain(hostname: string): string {
  return hostname.replace(/^www\./, '');
}

function normalizeUrl(rawUrl: string): string {
  try {
    const u = new URL(rawUrl);
    u.hostname = u.hostname.toLowerCase();
    u.hash = '';
    u.search = ''; // strip all query params — path is canonical for site mapping
    // Normalize trailing slash (remove except for root)
    if (u.pathname !== '/' && u.pathname.endsWith('/')) {
      u.pathname = u.pathname.slice(0, -1);
    }
    return u.toString();
  } catch {
    return rawUrl;
  }
}

function normalizeRootUrl(input: string): string {
  let url = input.trim();
  if (!/^https?:\/\//i.test(url)) url = `https://${url}`;
  const u = new URL(url);
  u.hash = '';
  return u.toString();
}

function isSameDomain(url: string, rootDomain: string): boolean {
  try {
    const hostname = new URL(url).hostname.replace(/^www\./, '');
    return hostname === rootDomain;
  } catch {
    return false;
  }
}

function isHtmlLikePath(url: string): boolean {
  if (SKIP_EXTENSIONS.test(url)) return false;
  return true;
}

function getPathDepth(pathname: string): number {
  return pathname.split('/').filter(Boolean).length;
}

async function fetchWithTimeout(url: string, timeout = REQUEST_TIMEOUT): Promise<Response> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeout);
  try {
    return await fetch(url, {
      signal: ctrl.signal,
      redirect: 'follow',
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.5',
      },
    });
  } finally {
    clearTimeout(timer);
  }
}

/** Extract all same-domain links from HTML content */
function extractLinks(html: string, baseUrl: string, rootDomain: string): string[] {
  const $ = cheerio.load(html);
  const links = new Set<string>();

  $('a[href]').each((_, el) => {
    const href = $(el).attr('href');
    if (!href || href.startsWith('mailto:') || href.startsWith('tel:') || href.startsWith('javascript:')) return;
    try {
      const resolved = new URL(href, baseUrl).toString();
      if (isSameDomain(resolved, rootDomain) && isHtmlLikePath(resolved)) {
        links.add(normalizeUrl(resolved));
      }
    } catch {
      // skip
    }
  });

  return [...links];
}

/** Build the sitemap tree from a flat set of URLs */
function buildTree(urlSet: Map<string, string | null>, rootUrl: string): SitemapNode[] {
  const rootParsed = new URL(rootUrl);
  const origin = rootParsed.origin;
  const rootPathRaw = rootParsed.pathname.replace(/\/$/, '') || '/';

  // Normalize all paths
  const pathToUrl = new Map<string, string | null>();
  pathToUrl.set('/', rootUrl);

  for (const [, originalUrl] of urlSet) {
    if (!originalUrl) continue;
    try {
      const u = new URL(originalUrl);
      const path = u.pathname === '' ? '/' : u.pathname;
      const normalized = path.endsWith('/') && path !== '/' ? path.slice(0, -1) : path;
      if (!pathToUrl.has(normalized)) {
        pathToUrl.set(normalized, originalUrl);
      }
    } catch {
      // skip
    }
  }

  // Ensure all intermediate paths exist as synthetic nodes
  for (const [path] of [...pathToUrl]) {
    const parts = path.split('/').filter(Boolean);
    for (let i = 1; i < parts.length; i++) {
      const intermediate = '/' + parts.slice(0, i).join('/');
      if (!pathToUrl.has(intermediate)) {
        pathToUrl.set(intermediate, null); // synthetic
      }
    }
  }

  // Build node map
  const nodeMap = new Map<string, SitemapNode>();
  for (const [path, url] of pathToUrl) {
    nodeMap.set(path, { path, url, children: [], count: 0 });
  }

  // Wire parent -> child relationships
  for (const [path] of nodeMap) {
    if (path === '/') continue;
    const lastSlash = path.lastIndexOf('/');
    const parentPath = lastSlash === 0 ? '/' : path.substring(0, lastSlash);
    const parent = nodeMap.get(parentPath);
    const child = nodeMap.get(path)!;
    if (parent) {
      parent.children.push(child);
    } else {
      // Orphan: attach to root
      const root = nodeMap.get('/');
      if (root) root.children.push(child);
    }
  }

  // Sort children alphabetically
  for (const node of nodeMap.values()) {
    node.children.sort((a, b) => a.path.localeCompare(b.path));
  }

  // Count real (non-synthetic) descendants
  function countReal(node: SitemapNode): number {
    const selfCount = node.url !== null ? 1 : 0;
    const childCount = node.children.reduce((sum, c) => sum + countReal(c), 0);
    node.count = childCount;
    return selfCount + childCount;
  }

  // Count from the absolute root
  const absoluteRoot = nodeMap.get('/');
  if (!absoluteRoot) return [];
  countReal(absoluteRoot);

  // If rootUrl has a sub-path, return that subtree as the visual root
  const targetRoot = rootPathRaw !== '/' ? (nodeMap.get(rootPathRaw) ?? absoluteRoot) : absoluteRoot;
  return [targetRoot];
}

// ─── Crawler ────────────────────────────────────────────────────────────────

export class Crawler extends EventEmitter {
  private logs: LogEntry[] = [];

  private log(level: LogEntry['level'], message: string) {
    const entry: LogEntry = { level, message, timestamp: Date.now() };
    this.logs.push(entry);
    this.emit('log', entry);
  }

  private emitProgress(phase: 'sitemap' | 'bfs', crawled: number, total: number, found: number) {
    this.emit('progress', { phase, crawled, total, found });
  }

  getLogs(): LogEntry[] {
    return this.logs;
  }

  async crawl(inputUrl: string, depth: number, crawlOptions: CrawlOptions = {}): Promise<{ tree: SitemapNode[]; urlsCapped: boolean }> {
    this.logs = [];
    const rootUrl = normalizeRootUrl(inputUrl);
    const rootHostname = new URL(rootUrl).hostname;
    const rootDomain = getRootDomain(rootHostname);

    // If user entered a non-root path (e.g. qualcomm.com/automotive), restrict everything to that prefix
    const rootPathRaw = new URL(rootUrl).pathname.replace(/\/$/, '') || '/';
    const rootPathPrefix = rootPathRaw === '/' ? null : rootPathRaw; // null means "whole site"

    this.log('info', `Crawl started: ${rootUrl} | depth=${depth}`);

    // ── Pre-flight ───────────────────────────────────────────────────────
    this.log('info', 'Pre-flight check...');
    await this.preflight(rootUrl);
    this.log('info', 'Pre-flight passed');

    // urlSet: normalized URL string -> original URL string (or null for synthetic)
    const urlSet = new Map<string, string | null>();
    urlSet.set(normalizeUrl(rootUrl), rootUrl);
    let urlsCapped = false;

    // ── Phase 1: Sitemap ─────────────────────────────────────────────────
    this.log('info', 'Discovering sitemaps...');
    let sitemapYieldedResults = false;

    try {
      const sitemapFiles = await discoverSitemaps(rootUrl);

      if (sitemapFiles.length > 0) {
        // Prioritize root-level sitemaps (single path segment) before deep/specialized ones
        // e.g. /sitemap.xml comes before /newsroom/sitemap.xml or /shop/sitemap.xml
        const isRootLevel = (u: string) => new URL(u).pathname.split('/').filter(Boolean).length <= 1;
        const sorted = [
          ...sitemapFiles.filter(isRootLevel),
          ...sitemapFiles.filter(u => !isRootLevel(u)),
        ];
        this.log('info', `Found ${sorted.length} sitemap file(s): ${sorted.map(u => new URL(u).pathname).join(', ')}`);
        const sitemapEntries = await getSitemapUrls(sorted, rootDomain, rootPathPrefix);

        let added = 0;
        for (const { url } of sitemapEntries) {
          try {
            const pathname = new URL(url).pathname;
            if (isExcluded(pathname, crawlOptions)) continue;
          } catch { continue; }
          const norm = normalizeUrl(url);
          if (urlSet.has(norm)) continue;
          if (urlSet.size < MAX_TOTAL_URLS) {
            urlSet.set(norm, url);
            added++;
          } else {
            urlsCapped = true;
            break;
          }
        }
        this.log('info', `Sitemap yielded ${added} new URLs (${urlSet.size} total)`);
        this.emitProgress('sitemap', sitemapFiles.length, sitemapFiles.length, urlSet.size);
        sitemapYieldedResults = added > 0;
      } else {
        this.log('info', 'No sitemaps found');
      }
    } catch (e: any) {
      this.log('warn', `Sitemap phase failed: ${e.message}`);
    }

    // ── Phase 2: BFS Crawl ───────────────────────────────────────────────
    // If sitemap gave comprehensive coverage (200+ URLs), only do hop=0 to pick up orphaned
    // top-level pages. If moderate coverage (50+), cap at depth 2. Otherwise full BFS.
    const bfsMaxDepth = sitemapYieldedResults && urlSet.size >= 200
      ? 0
      : sitemapYieldedResults && urlSet.size >= 50
      ? Math.min(depth, 2)
      : depth;
    this.log('info', `BFS crawl: max hop depth=${bfsMaxDepth} (${sitemapYieldedResults ? 'supplementing sitemap' : 'primary discovery'})`);

    const visited = new Set<string>();
    // Track URLs already enqueued to avoid duplicate queue entries.
    // (visited only covers processed URLs; without queued, pages linked from N sources
    // get added N times and waste batch slots on early-return no-ops.)
    const queued = new Set<string>();
    const normRoot = normalizeUrl(rootUrl);
    queued.add(normRoot);
    const queue: Array<{ url: string; hop: number }> = [{ url: rootUrl, hop: 0 }];
    let crawledCount = 0;

    while (queue.length > 0 && urlSet.size < MAX_TOTAL_URLS) {
      // Pull a batch
      const batch = queue.splice(0, BFS_CONCURRENCY);

      await Promise.all(
        batch.map(async ({ url, hop }) => {
          const normUrl = normalizeUrl(url);
          if (visited.has(normUrl)) return;
          visited.add(normUrl);
          crawledCount++;

          if (hop > bfsMaxDepth) return;

          this.log('info', `[BFS] Fetching (hop ${hop}): ${url}`);

          let html: string;
          let finalUrl = url;
          try {
            const res = await fetchWithTimeout(url);
            finalUrl = res.url; // after redirects
            const ct = res.headers.get('content-type') || '';
            if (!ct.includes('text/html')) {
              this.log('info', `[BFS] Skipping non-HTML: ${url}`);
              return;
            }
            html = await res.text();
          } catch (e: any) {
            this.log('warn', `[BFS] Failed to fetch ${url}: ${e.message}`);
            return;
          }

          const links = extractLinks(html, finalUrl, rootDomain);
          let newCount = 0;

          for (const link of links) {
            const linkPath = new URL(link).pathname.replace(/\/$/, '');

            // Sub-path scope check
            if (rootPathPrefix) {
              if (linkPath !== rootPathPrefix && !linkPath.startsWith(rootPathPrefix + '/')) continue;
            }

            // Exclusion check
            if (isExcluded(new URL(link).pathname, crawlOptions)) continue;

            if (!urlSet.has(link)) {
              if (urlSet.size < MAX_TOTAL_URLS) {
                urlSet.set(link, link);
                newCount++;
              } else {
                urlsCapped = true;
              }
            }
            if (!queued.has(link) && hop < bfsMaxDepth) {
              if (getPathDepth(new URL(link).pathname) <= depth + (rootPathPrefix ? new URL(rootUrl).pathname.split('/').filter(Boolean).length : 0)) {
                queued.add(link);
                queue.push({ url: link, hop: hop + 1 });
              }
            }
          }

          if (newCount > 0) {
            this.log('info', `[BFS] Found ${newCount} new URLs on ${new URL(finalUrl).pathname}`);
          }

          this.emitProgress('bfs', crawledCount, queue.length + crawledCount, urlSet.size);
        })
      );
    }

    this.log('info', `BFS complete: ${crawledCount} pages crawled`);
    this.log('info', `Total URLs collected: ${urlSet.size}`);

    if (urlSet.size <= 1) {
      throw new CrawlError('blocked_empty', 'No URLs discovered. The site may block crawlers or serve content via JavaScript only.');
    }

    const tree = buildTree(urlSet, rootUrl);
    this.log('info', `Tree built successfully${urlsCapped ? ` (capped at ${MAX_TOTAL_URLS} URLs)` : ''}`);
    return { tree, urlsCapped };
  }

  private async preflight(url: string): Promise<void> {
    try {
      const res = await fetchWithTimeout(url, 15000);
      if (res.status === 404) throw new CrawlError('unreachable_404', `404 Not Found: ${url}`);
      if (res.status === 403 || res.status === 429) {
        throw new CrawlError('blocked_http', `HTTP ${res.status}: Access denied by server`);
      }
      if (res.status >= 500) {
        throw new CrawlError('unreachable_timeout', `Server error: HTTP ${res.status}`);
      }
    } catch (e: any) {
      if (e instanceof CrawlError) throw e;
      const msg = e.message || '';
      if (msg.includes('ENOTFOUND') || msg.includes('getaddrinfo')) {
        throw new CrawlError('unreachable_dns', `DNS lookup failed: ${url}`);
      }
      if (msg.includes('ECONNREFUSED')) {
        throw new CrawlError('unreachable_refused', `Connection refused: ${url}`);
      }
      if (msg.includes('abort') || msg.includes('timeout') || msg.includes('TimeoutError')) {
        throw new CrawlError('unreachable_timeout', `Request timed out: ${url}`);
      }
      throw new CrawlError('unreachable_timeout', `Pre-flight failed: ${msg}`);
    }
  }
}
