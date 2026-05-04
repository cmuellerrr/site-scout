import puppeteer, { Browser, Page, KnownDevices } from 'puppeteer';

let browser: Browser | null = null;

async function getBrowser(): Promise<Browser> {
  if (browser?.connected) return browser;
  const args = ['--disable-dev-shm-usage', '--disable-gpu'];
  if (process.platform === 'linux') {
    args.push('--no-sandbox', '--disable-setuid-sandbox');
  }
  browser = await puppeteer.launch({ headless: true, args });
  return browser;
}

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

export async function takeScreenshot(url: string, mobile: boolean): Promise<Buffer> {
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
    await autoScroll(page);
    await page.waitForNetworkIdle({ idleTime: 2000, timeout: 15000 }).catch(() => {});
    await new Promise((resolve) => setTimeout(resolve, 1500));
    await page.evaluate(() => window.scrollTo(0, 0));

    const buf = await page.screenshot({ fullPage: true, type: 'jpeg', quality: 85 });
    return Buffer.from(buf);
  } finally {
    await page.close();
  }
}
