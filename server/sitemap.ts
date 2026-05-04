const SITEMAP_FETCH_TIMEOUT = 15000;

async function fetchText(url: string): Promise<string> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), SITEMAP_FETCH_TIMEOUT);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      // Node.js fetch (undici) automatically decompresses gzip/brotli responses;
      // we must NOT try to decompress manually. Request identity to get raw text.
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; Scout/1.0; +https://scout.local)',
        'Accept-Encoding': 'identity',
      },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.text();
  } finally {
    clearTimeout(timer);
  }
}

/** Extract text content of all matching XML tags (handles multiline) */
function extractTagValues(xml: string, tagName: string): string[] {
  const results: string[] = [];
  const re = new RegExp(`<${tagName}[^>]*>\\s*([^<]+)\\s*</${tagName}>`, 'gi');
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml)) !== null) {
    const val = m[1].trim();
    if (val) results.push(val);
  }
  return results;
}

function isSitemapIndex(xml: string): boolean {
  return /<sitemapindex/i.test(xml);
}

/** Parse a sitemap (regular or index) and return all <loc> URLs */
async function parseSitemap(
  sitemapUrl: string,
  depth = 0,
  visited = new Set<string>()
): Promise<string[]> {
  if (depth > 3 || visited.has(sitemapUrl)) return [];
  visited.add(sitemapUrl);

  let xml: string;
  try {
    xml = await fetchText(sitemapUrl);
  } catch {
    return [];
  }

  if (isSitemapIndex(xml)) {
    const allChildren = extractTagValues(xml, 'loc');

    // Skip image/video/media sitemaps — they contain asset URLs, not pages
    const mediaPattern = /-(image|video|photo|media)\.(xml|xml\.gz)$/i;
    let candidates = allChildren.filter(u => !mediaPattern.test(u));

    // For large locale-heavy indexes, prefer non-locale children.
    // Locales appear as /ae/, /en-us/ in path segments OR as -en-us.xml filename suffixes.
    if (candidates.length > 15) {
      const localePathPattern = /\/[a-z]{2}(-[a-z]{2,3})?(\/[a-z]{2})?\/sitemap/i;
      const localeFilePattern = /-[a-z]{2}(-[a-z]{2})?(-[a-z]{2})?\.(xml|xml\.gz)$/i;
      const isLocale = (u: string) => localePathPattern.test(u) || localeFilePattern.test(u);
      const rootCandidates = candidates.filter(u => !isLocale(u));

      if (rootCandidates.length > 0) {
        // Non-locale sitemaps exist — prefer them
        candidates = rootCandidates;
      } else {
        // All locale-specific — prefer English (en-us, en-gb, en), fall back to first 10
        const enUs = candidates.filter(u => /-en-us\./i.test(u));
        const enAny = candidates.filter(u => /-en(-[a-z]{2})?\./i.test(u));
        candidates = enUs.length > 0 ? enUs : enAny.length > 0 ? enAny : candidates.slice(0, 10);
      }
    }

    const limited = candidates.slice(0, 40);
    const results: string[] = [];
    await Promise.all(
      limited.map(async (child) => {
        const urls = await parseSitemap(child, depth + 1, visited);
        results.push(...urls);
      })
    );
    return results;
  }

  // Regular sitemap
  return extractTagValues(xml, 'loc');
}

/** Discover all sitemap URLs for a given root URL */
export async function discoverSitemaps(rootUrl: string): Promise<string[]> {
  const origin = new URL(rootUrl).origin;
  const candidates: string[] = [];

  // 1. Check robots.txt
  try {
    const robotsText = await fetchText(`${origin}/robots.txt`);
    const sitemapLines = robotsText
      .split('\n')
      .filter((l) => /^sitemap:/i.test(l.trim()))
      .map((l) => l.replace(/^sitemap:\s*/i, '').trim())
      .filter((l) => l.startsWith('http'));
    candidates.push(...sitemapLines);
  } catch {
    // robots.txt not available
  }

  // 2. Common sitemap paths (if not already found via robots.txt)
  const commonPaths = [
    '/sitemap.xml',
    '/sitemap_index.xml',
    '/sitemap-index.xml',
    '/sitemap/sitemap-0.xml',  // Gatsby
    '/page-sitemap.xml',       // Yoast SEO
    '/wp-sitemap.xml',         // WordPress 5.5+
    '/sitemap1.xml',
    '/news-sitemap.xml',
  ];

  const alreadyFound = new Set(candidates.map((u) => new URL(u).pathname));

  for (const path of commonPaths) {
    if (!alreadyFound.has(path)) {
      candidates.push(`${origin}${path}`);
    }
  }

  // 3. Probe each candidate: only return ones that actually exist
  const valid: string[] = [];
  await Promise.all(
    candidates.map(async (url) => {
      try {
        const ctrl = new AbortController();
        const timer = setTimeout(() => ctrl.abort(), 8000);
        const res = await fetch(url, {
          method: 'HEAD',
          signal: ctrl.signal,
          headers: { 'User-Agent': 'Mozilla/5.0 (compatible; Scout/1.0)' },
        });
        clearTimeout(timer);
        if (res.ok) valid.push(url);
      } catch {
        // not available
      }
    })
  );

  return valid;
}

/** Fetch sitemap URLs and return all page URLs within the given domain */
const MAX_SITEMAP_URLS = 15000;

export async function getSitemapUrls(
  sitemapUrls: string[],
  rootDomain: string,
  rootPathPrefix: string | null = null
): Promise<{ url: string; sitemapUrl: string }[]> {
  const results: { url: string; sitemapUrl: string }[] = [];

  for (const sitemapUrl of sitemapUrls) {
    if (results.length >= MAX_SITEMAP_URLS) break;
    const urls = await parseSitemap(sitemapUrl);
    for (const u of urls) {
      if (results.length >= MAX_SITEMAP_URLS) break;
      try {
        const parsed = new URL(u);
        const hostname = parsed.hostname.replace(/^www\./, '');
        if (hostname !== rootDomain) continue;

        // If crawling a sub-path, restrict to URLs under that prefix
        if (rootPathPrefix) {
          const path = parsed.pathname.replace(/\/$/, '');
          if (path !== rootPathPrefix && !path.startsWith(rootPathPrefix + '/')) continue;
        }

        results.push({ url: u, sitemapUrl });
      } catch {
        // skip invalid URLs
      }
    }
  }

  return results;
}
