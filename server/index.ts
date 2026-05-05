import express from 'express';
import cors from 'cors';
import type { Request, Response } from 'express';
import { Crawler, CrawlError, type CrawlOptions } from './crawler.js';
import type { SSEEvent } from './types.js';
import { takeScreenshot, getConcurrencyStats } from './screenshot.js';

const app = express();
const PORT = 3001;

app.use(cors());
app.use(express.json());

// ── Utility: write SSE event ─────────────────────────────────────────────────
function sseWrite(res: Response, event: SSEEvent) {
  res.write(`data: ${JSON.stringify(event)}\n\n`);
}

// ── POST /api/crawl ─────────────────────────────────────────────────────────
// Returns SSE stream of crawl events
app.get('/api/crawl', async (req: Request, res: Response) => {
  const { url, depth: depthStr } = req.query as { url?: string; depth?: string };

  if (!url) {
    res.status(400).json({ error: 'url is required' });
    return;
  }

  const depth = Math.min(Math.max(parseInt(depthStr || '3', 10), 1), 5);
  const filterLocales = req.query.filterLocales === 'true';
  const excludePathsStr = (req.query.excludePaths as string) || '';
  const excludePaths = excludePathsStr ? excludePathsStr.split(',').filter(Boolean) : [];
  const crawlOptions: CrawlOptions = { filterLocales, excludePaths };
  // SSE headers
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders();

  const crawler = new Crawler();

  // Pipe log events to SSE
  crawler.on('log', (entry) => {
    sseWrite(res, { type: 'log', ...entry });
  });

  crawler.on('progress', (data) => {
    sseWrite(res, { type: 'progress', ...data });
  });

  // Handle client disconnect
  req.on('close', () => {
    // Nothing to abort currently, but could add cancellation token here
  });

  try {
    const { tree, urlsCapped } = await crawler.crawl(url, depth, crawlOptions);
    sseWrite(res, { type: 'complete', data: tree, logs: crawler.getLogs(), urlsCapped });
  } catch (e: any) {
    if (e instanceof CrawlError) {
      sseWrite(res, {
        type: 'error',
        crawlError: e.code,
        message: e.message,
        logs: crawler.getLogs(),
      });
    } else {
      sseWrite(res, {
        type: 'error',
        crawlError: 'unreachable_timeout',
        message: e.message || 'Unknown error',
        logs: crawler.getLogs(),
      });
    }
  } finally {
    res.end();
  }
});

// ── GET /api/check-frameable ─────────────────────────────────────────────────
app.get('/api/check-frameable', async (req: Request, res: Response) => {
  const { url } = req.query as { url?: string };
  if (!url) { res.status(400).json({ error: 'url required' }); return; }

  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 12000);
    const response = await fetch(url, {
      signal: ctrl.signal,
      redirect: 'follow',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
      },
    });
    clearTimeout(timer);

    const xfo = response.headers.get('x-frame-options') || '';
    const csp = response.headers.get('content-security-policy') || '';

    if (/deny|sameorigin/i.test(xfo)) {
      res.json({ frameable: false, reason: `X-Frame-Options: ${xfo}` });
      return;
    }

    const frameAncestors = csp.match(/frame-ancestors\s+([^;]+)/i)?.[1] || '';
    if (frameAncestors && (frameAncestors.includes("'none'") || (!frameAncestors.includes('*')))) {
      const parsedUrl = new URL(url);
      if (!frameAncestors.includes(parsedUrl.hostname)) {
        res.json({ frameable: false, reason: `CSP frame-ancestors: ${frameAncestors}` });
        return;
      }
    }

    // Check for Cloudflare/JS frame-busting in body (first 100KB)
    const bodyText = (await response.text()).slice(0, 100 * 1024);
    if (bodyText.includes('top !== self') || bodyText.includes('top != self') || bodyText.includes('top.location')) {
      res.json({ frameable: false, reason: 'JS frame-busting detected' });
      return;
    }
    if (bodyText.includes('cf-browser-verification') || bodyText.includes('Checking your browser')) {
      res.json({ frameable: false, reason: 'Cloudflare challenge page' });
      return;
    }

    res.json({ frameable: true });
  } catch (e: any) {
    res.json({ frameable: false, reason: e.message });
  }
});

// ── GET /api/screenshot/status ────────────────────────────────────────────────
app.get('/api/screenshot/status', (_req: Request, res: Response) => {
  res.json(getConcurrencyStats());
});

// ── GET /api/screenshot ───────────────────────────────────────────────────────
app.get('/api/screenshot', async (req: Request, res: Response) => {
  const url = req.query.url as string;
  const mobile = req.query.mobile === 'true';
  const blockPopups = req.query.blockPopups !== 'false'; // default true

  if (!url) {
    res.status(400).json({ error: 'url required' });
    return;
  }

  try {
    const buf = await takeScreenshot(url, mobile, blockPopups);
    res.setHeader('Content-Type', 'image/jpeg');
    res.send(buf);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

app.listen(PORT, () => {
  console.log(`Scout server running on http://localhost:${PORT}`);
});
