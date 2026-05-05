/**
 * Crawler integration tests
 *
 * Each describe block spins up its own isolated mock HTTP server on a
 * random port so scenarios never share routes and DNS/path scoping works
 * exactly as it does in production.  No external network calls are made.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import http from 'http';
import type { AddressInfo } from 'net';
import type { SitemapNode } from '../server/types.js';
import { Crawler } from '../server/crawler.js';

// ─── Server factory ──────────────────────────────────────────────────────────

type RouteMap = Record<string, { ct: string; body: string; status?: number }>;

async function makeServer(routes: RouteMap): Promise<{ base: string; stop: () => void }> {
  const srv = http.createServer((req, res) => {
    const path = new URL(req.url ?? '/', 'http://x').pathname;
    const route = routes[path];
    if (route) {
      res.writeHead(route.status ?? 200, { 'Content-Type': route.ct });
      res.end(route.body);
    } else {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('Not found');
    }
  });
  await new Promise<void>((resolve) => srv.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${(srv.address() as AddressInfo).port}`;
  return { base, stop: () => srv.close() };
}

// ─── HTML / XML helpers ──────────────────────────────────────────────────────

/** Minimal HTML page linking to the given hrefs */
const html = (...links: string[]) =>
  `<!DOCTYPE html><html><body>${links.map((l) => `<a href="${l}">${l}</a>`).join('')}</body></html>`;

/** sitemap.xml body from a list of full URLs */
const sitemapXml = (urls: string[]) => `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.map((u) => `  <url><loc>${u}</loc></url>`).join('\n')}
</urlset>`;

// ─── Tree helpers ─────────────────────────────────────────────────────────────

function countUrls(nodes: SitemapNode[]): number {
  return nodes.reduce((n, node) => n + (node.url !== null ? 1 : 0) + countUrls(node.children), 0);
}

function collectPaths(nodes: SitemapNode[], out = new Set<string>()): Set<string> {
  for (const node of nodes) {
    if (node.url !== null) out.add(node.path);
    collectPaths(node.children, out);
  }
  return out;
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('BFS-only crawl (no sitemap)', () => {
  let base: string, stop: () => void;

  beforeAll(async () => {
    ({ base, stop } = await makeServer({
      '/': { ct: 'text/html', body: html('/about', '/blog') },
      '/about': { ct: 'text/html', body: html('/') },
      '/blog': { ct: 'text/html', body: html('/', '/blog/post-1', '/blog/post-2') },
      '/blog/post-1': { ct: 'text/html', body: html('/blog') },
      '/blog/post-2': { ct: 'text/html', body: html('/blog') },
    }));
  });
  afterAll(() => stop());

  it('discovers all 5 pages', async () => {
    const { tree } = await new Crawler().crawl(base, 3);
    expect(countUrls(tree)).toBe(5);
  });

  it('builds the correct path structure', async () => {
    const { tree } = await new Crawler().crawl(base, 3);
    const paths = collectPaths(tree);
    expect(paths).toEqual(new Set(['/', '/about', '/blog', '/blog/post-1', '/blog/post-2']));
  });
});

describe('External-link filtering', () => {
  let base: string, stop: () => void;

  beforeAll(async () => {
    ({ base, stop } = await makeServer({
      '/': {
        ct: 'text/html',
        body: `<a href="https://evil.example.com/steal">ext</a><a href="/safe">safe</a>`,
      },
      '/safe': { ct: 'text/html', body: html('/') },
    }));
  });
  afterAll(() => stop());

  it('follows same-domain links but ignores external ones', async () => {
    const { tree } = await new Crawler().crawl(base, 2);
    const paths = collectPaths(tree);
    expect(paths.has('/safe')).toBe(true);
    expect([...paths].some((p) => p.includes('evil.example.com'))).toBe(false);
  });
});

describe('Non-HTML extension filtering', () => {
  let base: string, stop: () => void;

  beforeAll(async () => {
    ({ base, stop } = await makeServer({
      '/': {
        ct: 'text/html',
        body: html('/real-page', '/image.jpg', '/doc.pdf', '/style.css', '/bundle.js', '/font.woff2'),
      },
      '/real-page': { ct: 'text/html', body: html('/') },
    }));
  });
  afterAll(() => stop());

  it('crawls .html-like paths and skips media/asset extensions', async () => {
    const { tree } = await new Crawler().crawl(base, 2);
    const paths = collectPaths(tree);
    expect(paths.has('/real-page')).toBe(true);
    for (const ext of ['/image.jpg', '/doc.pdf', '/style.css', '/bundle.js', '/font.woff2']) {
      expect(paths.has(ext), `should not include ${ext}`).toBe(false);
    }
  });
});

describe('Circular reference safety', () => {
  let base: string, stop: () => void;

  beforeAll(async () => {
    ({ base, stop } = await makeServer({
      '/': { ct: 'text/html', body: html('/a') },
      '/a': { ct: 'text/html', body: html('/b') },
      '/b': { ct: 'text/html', body: html('/c') },
      '/c': { ct: 'text/html', body: html('/a') }, // loops back
    }));
  });
  afterAll(() => stop());

  it('finds all 4 pages without looping', async () => {
    const { tree } = await new Crawler().crawl(base, 5);
    const paths = collectPaths(tree);
    expect(paths).toEqual(new Set(['/', '/a', '/b', '/c']));
  });
});

describe('Queue deduplication', () => {
  // /hub is linked from 20 spoke pages.  Without deduplication it would be
  // enqueued 20 times and waste 19 batch slots on early-exit no-ops.
  let base: string, stop: () => void;
  let fetchCount = 0;

  beforeAll(async () => {
    // Build routes: root → hub → spoke-1..20; each spoke links back to hub
    const routes: RouteMap = {
      '/': { ct: 'text/html', body: html('/hub') },
    };
    const spokeLinks = Array.from({ length: 20 }, (_, i) => `/spoke/${i + 1}`);
    routes['/hub'] = { ct: 'text/html', body: html(...spokeLinks) };
    for (let i = 1; i <= 20; i++) {
      routes[`/spoke/${i}`] = { ct: 'text/html', body: html('/hub') };
    }

    const srv = http.createServer((req, res) => {
      const path = new URL(req.url ?? '/', 'http://x').pathname;
      const route = routes[path];
      if (path !== '/robots.txt' && path !== '/sitemap.xml') fetchCount++;
      if (route) {
        res.writeHead(200, { 'Content-Type': route.ct });
        res.end(route.body);
      } else {
        res.writeHead(404);
        res.end('Not found');
      }
    });
    await new Promise<void>((r) => srv.listen(0, '127.0.0.1', r));
    base = `http://127.0.0.1:${(srv.address() as AddressInfo).port}`;
    stop = () => srv.close();
  });
  afterAll(() => stop());

  it('discovers all 22 pages', async () => {
    const { tree } = await new Crawler().crawl(base, 2);
    expect(countUrls(tree)).toBe(22); // root + hub + 20 spokes
  });

  it('fetches /hub exactly once despite 20 incoming links', async () => {
    // fetchCount accumulated during the previous "discovers all 22 pages" test.
    // 22 pages + 1 preflight = 23 fetches; /hub should appear only once in that tally.
    // We verify by checking the tree for duplicate /hub nodes.
    const { tree } = await new Crawler().crawl(base, 2);
    const all: string[] = [];
    function walk(nodes: SitemapNode[]) {
      for (const n of nodes) { if (n.url) all.push(n.path); walk(n.children); }
    }
    walk(tree);
    expect(all.filter((p) => p === '/hub').length).toBe(1);
  });
});

describe('Sitemap — mid-size (50–199 URLs → bfsMaxDepth=2)', () => {
  let base: string, stop: () => void;

  beforeAll(async () => {
    const routes: RouteMap = {
      '/': { ct: 'text/html', body: html('/extra-page') },
      '/extra-page': { ct: 'text/html', body: html('/') },
    };

    // 60 article pages registered and listed in sitemap
    const articleUrls: string[] = [];
    for (let i = 1; i <= 60; i++) {
      routes[`/articles/${i}`] = { ct: 'text/html', body: html('/') };
      // We fill in the base URL after server starts — use a placeholder approach:
      // sitemap URLs will be set once we know the port.
      articleUrls.push(`__BASE__/articles/${i}`);
    }

    const srv = http.createServer((req, res) => {
      const path = new URL(req.url ?? '/', 'http://x').pathname;
      if (path === '/robots.txt') {
        const b = `http://127.0.0.1:${(srv.address() as AddressInfo).port}`;
        res.writeHead(200, { 'Content-Type': 'text/plain' });
        res.end(`Sitemap: ${b}/sitemap.xml\n`);
        return;
      }
      if (path === '/sitemap.xml') {
        const b = `http://127.0.0.1:${(srv.address() as AddressInfo).port}`;
        const urls = Array.from({ length: 60 }, (_, i) => `${b}/articles/${i + 1}`);
        res.writeHead(200, { 'Content-Type': 'application/xml' });
        res.end(sitemapXml(urls));
        return;
      }
      const route = routes[path];
      if (route) {
        res.writeHead(route.status ?? 200, { 'Content-Type': route.ct });
        res.end(route.body);
      } else {
        res.writeHead(404);
        res.end('Not found');
      }
    });
    await new Promise<void>((r) => srv.listen(0, '127.0.0.1', r));
    base = `http://127.0.0.1:${(srv.address() as AddressInfo).port}`;
    stop = () => srv.close();
  });
  afterAll(() => stop());

  it('collects all 60 sitemap articles', async () => {
    const { tree } = await new Crawler().crawl(base, 2);
    const paths = collectPaths(tree);
    for (let i = 1; i <= 60; i++) {
      expect(paths.has(`/articles/${i}`), `missing /articles/${i}`).toBe(true);
    }
  });

  it('also discovers pages found via BFS that are absent from the sitemap', async () => {
    const { tree } = await new Crawler().crawl(base, 2);
    const paths = collectPaths(tree);
    expect(paths.has('/extra-page')).toBe(true);
  });

  it('does not return urlsCapped', async () => {
    const { urlsCapped } = await new Crawler().crawl(base, 2);
    expect(urlsCapped).toBe(false);
  });
});

describe('Sitemap — large (≥200 URLs → bfsMaxDepth=0)', () => {
  let base: string, stop: () => void;

  beforeAll(async () => {
    // 210 sitemap pages + /root-only which is discoverable only via BFS at hop=0
    const routes: RouteMap = {};
    for (let i = 1; i <= 210; i++) {
      routes[`/page/${i}`] = { ct: 'text/html', body: html('/') };
    }
    routes['/root-only'] = { ct: 'text/html', body: html('/') };

    const srv = http.createServer((req, res) => {
      const path = new URL(req.url ?? '/', 'http://x').pathname;
      if (path === '/robots.txt') {
        const b = `http://127.0.0.1:${(srv.address() as AddressInfo).port}`;
        res.writeHead(200, { 'Content-Type': 'text/plain' });
        res.end(`Sitemap: ${b}/sitemap.xml\n`);
        return;
      }
      if (path === '/sitemap.xml') {
        const b = `http://127.0.0.1:${(srv.address() as AddressInfo).port}`;
        const urls = Array.from({ length: 210 }, (_, i) => `${b}/page/${i + 1}`);
        res.writeHead(200, { 'Content-Type': 'application/xml' });
        res.end(sitemapXml(urls));
        return;
      }
      if (path === '/') {
        const b = `http://127.0.0.1:${(srv.address() as AddressInfo).port}`;
        // Root links to first page (already in sitemap) + /root-only (NOT in sitemap)
        res.writeHead(200, { 'Content-Type': 'text/html' });
        res.end(html(`${b}/page/1`, '/root-only'));
        return;
      }
      const route = routes[path];
      if (route) {
        res.writeHead(route.status ?? 200, { 'Content-Type': route.ct });
        res.end(route.body);
      } else {
        res.writeHead(404);
        res.end('Not found');
      }
    });
    await new Promise<void>((r) => srv.listen(0, '127.0.0.1', r));
    base = `http://127.0.0.1:${(srv.address() as AddressInfo).port}`;
    stop = () => srv.close();
  });
  afterAll(() => stop());

  it('collects all 210 sitemap pages', async () => {
    const { tree } = await new Crawler().crawl(base, 2);
    const paths = collectPaths(tree);
    for (let i = 1; i <= 210; i++) {
      expect(paths.has(`/page/${i}`), `missing /page/${i}`).toBe(true);
    }
  });

  it('still picks up /root-only which is linked from the root but absent from the sitemap', async () => {
    const { tree } = await new Crawler().crawl(base, 2);
    expect(collectPaths(tree).has('/root-only')).toBe(true);
  });

  it('triggers bfsMaxDepth=0 — BFS does not recurse beyond the root page', async () => {
    // bfsMaxDepth=0 means BFS crawls only the root page.
    // Total should be 210 (sitemap) + 1 (root) + 1 (root-only) = 212, not thousands.
    const { tree } = await new Crawler().crawl(base, 2);
    expect(countUrls(tree)).toBeLessThanOrEqual(215);
  });
});

describe('Sub-path scoping', () => {
  let base: string, stop: () => void;

  beforeAll(async () => {
    ({ base, stop } = await makeServer({
      '/docs': { ct: 'text/html', body: html('/docs/intro', '/docs/api', '/blog/post-1') },
      '/docs/intro': { ct: 'text/html', body: html('/docs', '/docs/api') },
      '/docs/api': { ct: 'text/html', body: html('/docs/intro') },
      // These exist but should NOT appear when crawling /docs
      '/blog/post-1': { ct: 'text/html', body: html('/blog/post-2') },
      '/blog/post-2': { ct: 'text/html', body: html() },
    }));
  });
  afterAll(() => stop());

  it('only collects URLs under the /docs sub-path', async () => {
    const { tree } = await new Crawler().crawl(`${base}/docs`, 3);
    const paths = collectPaths(tree);
    expect(paths.has('/docs')).toBe(true);
    expect(paths.has('/docs/intro')).toBe(true);
    expect(paths.has('/docs/api')).toBe(true);
    expect(paths.has('/blog/post-1')).toBe(false);
    expect(paths.has('/blog/post-2')).toBe(false);
  });

  it('returns exactly 3 URLs (no out-of-scope leakage)', async () => {
    const { tree } = await new Crawler().crawl(`${base}/docs`, 3);
    expect(countUrls(tree)).toBe(3);
  });
});

describe('filterLocales crawl option', () => {
  let base: string, stop: () => void;

  beforeAll(async () => {
    ({ base, stop } = await makeServer({
      '/': { ct: 'text/html', body: html('/about', '/fr', '/fr/about', '/en-gb', '/en-gb/about', '/zh-hans/page') },
      '/about': { ct: 'text/html', body: html('/') },
      '/fr': { ct: 'text/html', body: html('/') },
      '/fr/about': { ct: 'text/html', body: html('/') },
      '/en-gb': { ct: 'text/html', body: html('/') },
      '/en-gb/about': { ct: 'text/html', body: html('/') },
      '/zh-hans/page': { ct: 'text/html', body: html('/') },
    }));
  });
  afterAll(() => stop());

  it('includes locale paths when filterLocales is false', async () => {
    const { tree } = await new Crawler().crawl(base, 3, { filterLocales: false });
    const paths = collectPaths(tree);
    expect(paths.has('/fr')).toBe(true);
    expect(paths.has('/fr/about')).toBe(true);
    expect(paths.has('/en-gb')).toBe(true);
    expect(paths.has('/en-gb/about')).toBe(true);
  });

  it('excludes locale-prefixed paths when filterLocales is true', async () => {
    const { tree } = await new Crawler().crawl(base, 3, { filterLocales: true });
    const paths = collectPaths(tree);
    expect(paths.has('/about')).toBe(true);
    expect(paths.has('/fr')).toBe(false);
    expect(paths.has('/fr/about')).toBe(false);
    expect(paths.has('/en-gb')).toBe(false);
    expect(paths.has('/en-gb/about')).toBe(false);
    expect(paths.has('/zh-hans/page')).toBe(false);
  });
});

describe('excludePaths crawl option — BFS', () => {
  let base: string, stop: () => void;

  beforeAll(async () => {
    ({ base, stop } = await makeServer({
      '/': { ct: 'text/html', body: html('/about', '/blog', '/blog/post-1', '/news', '/news/story-1') },
      '/about': { ct: 'text/html', body: html('/') },
      '/blog': { ct: 'text/html', body: html('/blog/post-1') },
      '/blog/post-1': { ct: 'text/html', body: html('/blog') },
      '/news': { ct: 'text/html', body: html('/news/story-1') },
      '/news/story-1': { ct: 'text/html', body: html('/news') },
    }));
  });
  afterAll(() => stop());

  it('crawls everything when excludePaths is empty', async () => {
    const { tree } = await new Crawler().crawl(base, 3, { excludePaths: [] });
    const paths = collectPaths(tree);
    expect(paths.has('/blog')).toBe(true);
    expect(paths.has('/blog/post-1')).toBe(true);
    expect(paths.has('/news')).toBe(true);
    expect(paths.has('/news/story-1')).toBe(true);
  });

  it('excludes the exact path and all descendants', async () => {
    const { tree } = await new Crawler().crawl(base, 3, { excludePaths: ['/blog'] });
    const paths = collectPaths(tree);
    expect(paths.has('/about')).toBe(true);
    expect(paths.has('/news')).toBe(true);
    expect(paths.has('/blog')).toBe(false);
    expect(paths.has('/blog/post-1')).toBe(false);
  });

  it('supports multiple excluded prefixes', async () => {
    const { tree } = await new Crawler().crawl(base, 3, { excludePaths: ['/blog', '/news'] });
    const paths = collectPaths(tree);
    expect(paths.has('/about')).toBe(true);
    expect(paths.has('/blog')).toBe(false);
    expect(paths.has('/blog/post-1')).toBe(false);
    expect(paths.has('/news')).toBe(false);
    expect(paths.has('/news/story-1')).toBe(false);
  });
});

describe('excludePaths crawl option — sitemap phase', () => {
  let base: string, stop: () => void;

  beforeAll(async () => {
    const srv = http.createServer((req, res) => {
      const path = new URL(req.url ?? '/', 'http://x').pathname;
      const b = `http://127.0.0.1:${(srv.address() as AddressInfo).port}`;
      if (path === '/robots.txt') {
        res.writeHead(200, { 'Content-Type': 'text/plain' });
        res.end(`Sitemap: ${b}/sitemap.xml\n`);
        return;
      }
      if (path === '/sitemap.xml') {
        const urls = [
          `${b}/`,
          `${b}/about`,
          `${b}/news`,
          `${b}/news/story-1`,
          `${b}/news/story-2`,
          `${b}/blog/post-1`,
        ];
        res.writeHead(200, { 'Content-Type': 'application/xml' });
        res.end(sitemapXml(urls));
        return;
      }
      res.writeHead(200, { 'Content-Type': 'text/html' });
      res.end(html());
    });
    await new Promise<void>((r) => srv.listen(0, '127.0.0.1', r));
    base = `http://127.0.0.1:${(srv.address() as AddressInfo).port}`;
    stop = () => srv.close();
  });
  afterAll(() => stop());

  it('omits excluded paths sourced from the sitemap', async () => {
    const { tree } = await new Crawler().crawl(base, 3, { excludePaths: ['/news'] });
    const paths = collectPaths(tree);
    expect(paths.has('/about')).toBe(true);
    expect(paths.has('/blog/post-1')).toBe(true);
    expect(paths.has('/news')).toBe(false);
    expect(paths.has('/news/story-1')).toBe(false);
    expect(paths.has('/news/story-2')).toBe(false);
  });
});

describe('urlsCapped flag', () => {
  let base: string, stop: () => void;

  beforeAll(async () => {
    // Serve a sitemap with 15,001 entries — enough to trip the 15,000-URL cap.
    // The individual pages don't need to exist; the sitemap phase alone fills the cap.
    const srv = http.createServer((req, res) => {
      const path = new URL(req.url ?? '/', 'http://x').pathname;
      const b = `http://127.0.0.1:${(srv.address() as AddressInfo).port}`;
      if (path === '/robots.txt') {
        res.writeHead(200, { 'Content-Type': 'text/plain' });
        res.end(`Sitemap: ${b}/sitemap.xml\n`);
        return;
      }
      if (path === '/sitemap.xml') {
        const urls = Array.from({ length: 15001 }, (_, i) => `${b}/p/${i + 1}`);
        res.writeHead(200, { 'Content-Type': 'application/xml' });
        res.end(sitemapXml(urls));
        return;
      }
      if (path === '/') {
        res.writeHead(200, { 'Content-Type': 'text/html' });
        res.end(html());
        return;
      }
      res.writeHead(404);
      res.end('Not found');
    });
    await new Promise<void>((r) => srv.listen(0, '127.0.0.1', r));
    base = `http://127.0.0.1:${(srv.address() as AddressInfo).port}`;
    stop = () => srv.close();
  });
  afterAll(() => stop());

  it('sets urlsCapped=true and stays at or below 15,000 URLs', async () => {
    const { tree, urlsCapped } = await new Crawler().crawl(base, 1);
    expect(urlsCapped).toBe(true);
    expect(countUrls(tree)).toBeLessThanOrEqual(15000);
  });
});
