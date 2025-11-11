/**
 * Get browser instance with correct configuration for environment
 * Uses chromium for serverless (Vercel) and regular puppeteer for local dev
 */
export async function getBrowser() {
  const isProduction = process.env.NODE_ENV === 'production';

  if (isProduction) {
    // Use chromium for serverless environment
    const chromium = await import('@sparticuz/chromium');
    const puppeteerCore = await import('puppeteer-core');

    return await puppeteerCore.default.launch({
      args: chromium.default.args,
      defaultViewport: { width: 1920, height: 1080 },
      executablePath: await chromium.default.executablePath(),
      headless: true,
    });
  } else {
    // Use regular puppeteer for local development
    const puppeteer = (await import('puppeteer')).default;

    return await puppeteer.launch({
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-blink-features=AutomationControlled',
        '--disable-features=IsolateOrigins,site-per-process',
        '--disable-web-security',
        '--disable-features=site-per-process',
        '--lang=es-AR',
      ],
    });
  }
}
