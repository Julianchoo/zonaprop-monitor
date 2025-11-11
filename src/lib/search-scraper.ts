import { scrapeMultipleListings, scrapeZonapropListing, PropertyData } from './scraper';

export interface SearchScraperResult {
  success: boolean;
  totalUrls: number;
  propertyUrls?: string[];
  error?: string;
}

/**
 * Extract all property URLs from a Zonaprop search page
 */
export async function scrapeSearchPageUrls(searchUrl: string): Promise<SearchScraperResult> {
  let browser;

  try {
    const puppeteer = (await import('puppeteer')).default;

    browser = await puppeteer.launch({
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

    const page = await browser.newPage();

    // Anti-detection (same as main scraper)
    await page.evaluateOnNewDocument(() => {
      Object.defineProperty(navigator, 'webdriver', {
        get: () => undefined,
      });

      Object.defineProperty(navigator, 'plugins', {
        get: () => [1, 2, 3, 4, 5],
      });

      Object.defineProperty(navigator, 'languages', {
        get: () => ['es-AR', 'es', 'en'],
      });

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (window as any).chrome = {
        runtime: {},
      };

      const originalQuery = window.navigator.permissions.query;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      window.navigator.permissions.query = (parameters: any) =>
        parameters.name === 'notifications'
          ? Promise.resolve({ state: 'denied' } as PermissionStatus)
          : originalQuery(parameters);
    });

    await page.setViewport({ width: 1920, height: 1080 });
    await page.setUserAgent(
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36'
    );

    await page.setExtraHTTPHeaders({
      'Accept-Language': 'es-AR,es;q=0.9,en-US;q=0.8,en;q=0.7',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
      'Accept-Encoding': 'gzip, deflate, br',
      'Cache-Control': 'max-age=0',
      'Sec-Fetch-Dest': 'document',
      'Sec-Fetch-Mode': 'navigate',
      'Sec-Fetch-Site': 'none',
      'Sec-Fetch-User': '?1',
      'Upgrade-Insecure-Requests': '1',
    });

    console.log(`Navigating to search page: ${searchUrl}`);

    const response = await page.goto(searchUrl, {
      waitUntil: 'domcontentloaded', // Less strict than networkidle2
      timeout: 60000, // 60 seconds for search pages (they can be slow)
    });

    // Wait a bit for dynamic content to load
    await new Promise(resolve => setTimeout(resolve, 3000));

    if (!response || response.status() !== 200) {
      await browser.close();
      return {
        success: false,
        totalUrls: 0,
        error: `HTTP ${response?.status() || 'unknown'}: No se pudo acceder a la página de búsqueda`,
      };
    }

    // Small delay to appear human-like
    await new Promise(resolve => setTimeout(resolve, Math.random() * 2000 + 1000));

    console.log(`Extracting property URLs from search page...`);

    // Extract all property URLs from the search results
    const extractionResult = await page.evaluate(() => {
      const urls: string[] = [];
      const debugInfo: string[] = [];

      // Try to find all links on the page
      const allLinks = document.querySelectorAll('a');
      debugInfo.push(`Total links found: ${allLinks.length}`);

      const seenUrls = new Set<string>();

      allLinks.forEach((element) => {
        const href = element.getAttribute('href');
        if (href && href.includes('/propiedades/')) {
          // Build full URL
          const fullUrl = href.startsWith('http') ? href : `https://www.zonaprop.com.ar${href}`;

          // Only add unique URLs
          if (!seenUrls.has(fullUrl)) {
            seenUrls.add(fullUrl);
            urls.push(fullUrl);
          }
        }
      });

      debugInfo.push(`Property URLs found: ${urls.length}`);

      return { urls, debugInfo };
    });

    const propertyUrls = extractionResult.urls;

    console.log('Debug info:', extractionResult.debugInfo);

    await browser.close();

    console.log(`Found ${propertyUrls.length} property URLs`);

    if (propertyUrls.length === 0) {
      return {
        success: false,
        totalUrls: 0,
        error: 'No se encontraron propiedades en la página de búsqueda',
      };
    }

    return {
      success: true,
      totalUrls: propertyUrls.length,
      propertyUrls,
    };
  } catch (error) {
    console.error('Search scraping error:', error);
    if (browser) {
      await browser.close();
    }
    return {
      success: false,
      totalUrls: 0,
      error: error instanceof Error ? error.message : 'Error desconocido al extraer URLs de búsqueda',
    };
  }
}

/**
 * Extract property data from a Zonaprop search URL
 * This combines scrapeSearchPageUrls + scrapeMultipleListings
 */
export async function extractSearchResults(searchUrl: string, maxProperties: number = 50) {
  // Step 1: Get all property URLs from search page
  const searchResult = await scrapeSearchPageUrls(searchUrl);

  if (!searchResult.success || !searchResult.propertyUrls) {
    return {
      success: false,
      error: searchResult.error || 'Error al extraer URLs de búsqueda',
    };
  }

  // Limit the number of properties to extract
  const urlsToExtract = searchResult.propertyUrls.slice(0, maxProperties);

  console.log(`Extracting data from ${urlsToExtract.length} properties (found ${searchResult.totalUrls} total)...`);

  // Step 2: Extract data from each property URL (reuse existing scraper)
  // Use 2 second delay instead of 3 to speed up the process
  const results = await scrapeMultipleListings(urlsToExtract, 2000);

  // Format results
  const successfulResults = results.filter(r => r.success && r.data).map(r => r.data!);
  const failedResults = results
    .map((r, idx) => ({ url: urlsToExtract[idx], result: r }))
    .filter(({ result }) => !result.success)
    .map(({ url, result }) => ({ url, error: result.error || 'Error desconocido' }));

  return {
    success: true,
    total: urlsToExtract.length,
    extracted: successfulResults.length,
    failed: failedResults.length,
    results: successfulResults,
    errors: failedResults,
    totalFoundInSearch: searchResult.totalUrls,
  };
}

/**
 * Extract property data with progress updates
 * Yields updates as properties are scraped
 */
export async function* extractSearchResultsWithProgress(
  searchUrl: string,
  maxProperties: number = 50
) {
  // Step 1: Get all property URLs from search page
  const searchResult = await scrapeSearchPageUrls(searchUrl);

  if (!searchResult.success || !searchResult.propertyUrls) {
    yield {
      type: 'error' as const,
      error: searchResult.error || 'Error al extraer URLs de búsqueda',
    };
    return;
  }

  // Limit the number of properties to extract
  const urlsToExtract = searchResult.propertyUrls.slice(0, maxProperties);

  // Send initial URLs
  yield {
    type: 'urls' as const,
    urls: urlsToExtract,
    totalFoundInSearch: searchResult.totalUrls,
  };

  // Step 2: Extract data from each property URL one by one
  const results: PropertyData[] = [];
  const errors: Array<{ url: string; error: string }> = [];

  for (let i = 0; i < urlsToExtract.length; i++) {
    const url = urlsToExtract[i];

    // Notify which property is being scraped
    yield {
      type: 'scraping' as const,
      index: i,
      url,
      progress: i,
      total: urlsToExtract.length,
    };

    const result = await scrapeZonapropListing(url);

    if (result.success && result.data) {
      results.push(result.data);
      yield {
        type: 'property' as const,
        index: i,
        data: result.data,
      };
    } else {
      errors.push({ url, error: result.error || 'Error desconocido' });
      yield {
        type: 'error_property' as const,
        index: i,
        url,
        error: result.error || 'Error desconocido',
      };
    }

    // Add delay between requests (except for the last one)
    if (i < urlsToExtract.length - 1) {
      const delay = 2000 + Math.random() * 2000;
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }

  // Send final summary
  yield {
    type: 'complete' as const,
    total: urlsToExtract.length,
    extracted: results.length,
    failed: errors.length,
    results,
    errors,
  };
}
