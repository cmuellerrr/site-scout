import puppeteer, { Browser, Page, KnownDevices } from 'puppeteer';

let browser: Browser | null = null;

// ── Concurrency semaphore ─────────────────────────────────────────────────────
const MAX_CONCURRENT_PAGES = 3;
let activePages = 0;
let queuedPages = 0;
const waiters: Array<() => void> = [];

async function acquire(): Promise<void> {
  if (activePages < MAX_CONCURRENT_PAGES) {
    activePages++;
    return;
  }
  queuedPages++;
  await new Promise<void>((resolve) => waiters.push(resolve));
  queuedPages--;
  activePages++;
}

function release(): void {
  activePages--;
  const next = waiters.shift();
  if (next) next();
}

export function getConcurrencyStats() {
  return { active: activePages, queued: queuedPages };
}

// ── Browser singleton ─────────────────────────────────────────────────────────
async function getBrowser(): Promise<Browser> {
  if (browser?.connected) return browser;
  const args = ['--disable-dev-shm-usage', '--disable-gpu'];
  if (process.platform === 'linux') {
    args.push('--no-sandbox', '--disable-setuid-sandbox');
  }
  browser = await puppeteer.launch({ headless: true, args });
  return browser;
}

// ── Cookie / consent banner dismissal ────────────────────────────────────────
async function dismissCookieBanners(page: Page): Promise<void> {
  try {
    // Known vendor-specific selectors (most reliable)
    const specificSelectors = [
      '#onetrust-accept-btn-handler',           // OneTrust
      '#CybotCookiebotDialogBodyButtonAccept',   // Cookiebot
      '.cky-btn-accept',                         // CookieYes
      '#gdpr-cookie-accept',
      '.cc-btn.cc-allow',
      '.cc-accept',
      '#accept-cookies',
      '.accept-cookies',
      '[data-testid*="accept" i]',
      '[aria-label*="accept all" i]',
      '[aria-label*="accept cookies" i]',
    ];

    for (const sel of specificSelectors) {
      try {
        const el = await page.$(sel);
        if (el) {
          await el.click();
          await new Promise((r) => setTimeout(r, 600));
          return;
        }
      } catch { /* selector may not exist — keep trying */ }
    }

    // Text-based fallback: match buttons/links by visible label
    const clicked = await page.evaluate(() => {
      const exactMatches = new Set([
        'accept all', 'accept cookies', 'accept all cookies',
        'allow all', 'allow cookies', 'i accept', 'i agree',
        'agree', 'got it', 'ok', 'okay',
      ]);
      const candidates = [
        ...document.querySelectorAll('button, a, [role="button"]'),
      ] as HTMLElement[];
      for (const el of candidates) {
        const text = (el.textContent ?? '').toLowerCase().trim();
        if (exactMatches.has(text)) {
          el.click();
          return true;
        }
      }
      return false;
    });

    if (clicked) await new Promise((r) => setTimeout(r, 600));
  } catch { /* non-fatal — best effort only */ }
}

// ── Auto-scroll ───────────────────────────────────────────────────────────────
async function autoScroll(page: Page): Promise<void> {
  await page.evaluate(async () => {
    await new Promise<void>((resolve) => {
      const step = 300;
      const interval = 150;
      let scrolled = 0;
      const timer = setInterval(() => {
        window.scrollBy(0, step);
        scrolled += step;
        if (scrolled >= document.documentElement.scrollHeight) {
          clearInterval(timer);
          resolve();
        }
      }, interval);
    });
  });
}

// ── Public API ────────────────────────────────────────────────────────────────
export async function takeScreenshot(url: string, mobile: boolean, blockPopups = true): Promise<Buffer> {
  await acquire();
  const b = await getBrowser();
  const page = await b.newPage();

  try {
    if (mobile) {
      await page.emulate(KnownDevices['iPhone 15 Pro']);
    } else {
      await page.setViewport({ width: 1440, height: 900 });
      await page.setUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36');
    }

    await page.goto(url, { waitUntil: 'networkidle2', timeout: 30000 });

    if (blockPopups) await dismissCookieBanners(page);

    await autoScroll(page);
    await page.waitForNetworkIdle({ idleTime: 2000, timeout: 15000 }).catch(() => {});
    await new Promise((resolve) => setTimeout(resolve, 1500));
    await page.evaluate(() => window.scrollTo(0, 0));

    const buf = await page.screenshot({ fullPage: true, type: 'jpeg', quality: 85 });
    return Buffer.from(buf);
  } finally {
    await page.close();
    release();
  }
}
