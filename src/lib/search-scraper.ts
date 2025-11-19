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
    const { getBrowser } = await import('./browser');
    browser = await getBrowser();

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

    // Use a very realistic user agent
    await page.setUserAgent(
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    );

    // Set realistic headers that a real browser would send
    await page.setExtraHTTPHeaders({
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7',
      'Accept-Language': 'es-AR,es;q=0.9,en-US;q=0.8,en;q=0.7',
      'Accept-Encoding': 'gzip, deflate, br',
      'DNT': '1',
      'Connection': 'keep-alive',
      'Upgrade-Insecure-Requests': '1',
      'Sec-Fetch-Dest': 'document',
      'Sec-Fetch-Mode': 'navigate',
      'Sec-Fetch-Site': 'none',
      'Sec-Fetch-User': '?1',
      'Sec-Ch-Ua': '"Not_A Brand";v="8", "Chromium";v="120", "Google Chrome";v="120"',
      'Sec-Ch-Ua-Mobile': '?0',
      'Sec-Ch-Ua-Platform': '"Windows"',
    });

    console.log(`Navigating to search page: ${searchUrl}`);

    const response = await page.goto(searchUrl, {
      waitUntil: 'domcontentloaded',
      timeout: 60000,
    });

    console.log(`Response status: ${response?.status()}`);

    if (!response || response.status() !== 200) {
      await browser.close();
      return {
        success: false,
        totalUrls: 0,
        error: `HTTP ${response?.status() || 'unknown'}: No se pudo acceder a la página de búsqueda`,
      };
    }

    // Wait for dynamic content to load
    console.log('Waiting for dynamic content...');
    await new Promise(resolve => setTimeout(resolve, 5000)); // Increased to 5 seconds

    console.log(`Extracting property URLs from search page...`);

    // Extract all property URLs from the search results
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const extractionResult = await (page as any).evaluate(() => {
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
    console.log(`Found ${propertyUrls.length} property URLs`);

    // Take a screenshot for debugging in production
    if (process.env.NODE_ENV === 'production' && propertyUrls.length === 0) {
      console.log('No URLs found, taking screenshot for debugging...');
      const screenshot = await page.screenshot({ encoding: 'base64' });
      console.log(`Screenshot taken, length: ${screenshot.length}`);
    }

    await browser.close();

    if (propertyUrls.length === 0) {
      return {
        success: false,
        totalUrls: 0,
        error: 'No se encontraron propiedades en la página de búsqueda. Posible detección anti-scraping.',
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
  maxProperties: number = 50,
  existingUrls?: string[],
  startIndex: number = 0
) {
  let urlsToExtract: string[];
  let totalFoundInSearch: number;

  // If URLs are provided, use them (for chunked processing)
  if (existingUrls && existingUrls.length > 0) {
    urlsToExtract = existingUrls.slice(startIndex, startIndex + maxProperties);
    totalFoundInSearch = existingUrls.length;
  } else {
    // Step 1: Get all property URLs from search page
    const searchResult = await scrapeSearchPageUrls(searchUrl);

    if (!searchResult.success || !searchResult.propertyUrls) {
      yield {
        type: 'error' as const,
        error: searchResult.error || 'Error al extraer URLs de búsqueda',
      };
      return;
    }

    urlsToExtract = searchResult.propertyUrls.slice(0, maxProperties);
    totalFoundInSearch = searchResult.totalUrls;

    // Send initial URLs only if this is the first call (not chunked)
    yield {
      type: 'urls' as const,
      urls: searchResult.propertyUrls,
      totalFoundInSearch: totalFoundInSearch,
    };
  }

  // If maxProperties is 0, just return URLs without scraping
  if (maxProperties === 0) {
    return;
  }

  // Step 2: Extract data from each property URL one by one
  const results: PropertyData[] = [];
  const errors: Array<{ url: string; error: string }> = [];

  for (let i = 0; i < urlsToExtract.length; i++) {
    const url = urlsToExtract[i];
    const globalIndex = startIndex + i;

    // Notify which property is being scraped
    yield {
      type: 'scraping' as const,
      index: globalIndex,
      url,
      progress: globalIndex,
      total: totalFoundInSearch,
    };

    const result = await scrapeZonapropListing(url);

    if (result.success && result.data) {
      results.push(result.data);
      yield {
        type: 'property' as const,
        index: globalIndex,
        data: result.data,
      };
    } else {
      errors.push({ url, error: result.error || 'Error desconocido' });
      yield {
        type: 'error_property' as const,
        index: globalIndex,
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

/**
 * Extract property data with parallel scraping and progress updates
 * Scrapes multiple properties concurrently for faster processing
 */
export async function* extractSearchResultsParallel(
  searchUrl: string,
  maxProperties: number = 50,
  existingUrls?: string[],
  startIndex: number = 0,
  concurrency: number = 5,
  skipImages: boolean = false
) {
  let urlsToExtract: string[];
  let totalFoundInSearch: number;

  // If URLs are provided, use them (for chunked processing)
  if (existingUrls && existingUrls.length > 0) {
    urlsToExtract = existingUrls.slice(startIndex, startIndex + maxProperties);
    totalFoundInSearch = existingUrls.length;
  } else {
    // Step 1: Get all property URLs from search page
    const searchResult = await scrapeSearchPageUrls(searchUrl);

    if (!searchResult.success || !searchResult.propertyUrls) {
      yield {
        type: 'error' as const,
        error: searchResult.error || 'Error al extraer URLs de búsqueda',
      };
      return;
    }

    urlsToExtract = searchResult.propertyUrls.slice(0, maxProperties);
    totalFoundInSearch = searchResult.totalUrls;

    // Send initial URLs only if this is the first call (not chunked)
    yield {
      type: 'urls' as const,
      urls: searchResult.propertyUrls,
      totalFoundInSearch: totalFoundInSearch,
    };
  }

  // If maxProperties is 0, just return URLs without scraping
  if (maxProperties === 0) {
    return;
  }

  // Step 2: Extract data from properties in parallel batches
  const results: PropertyData[] = [];
  const errors: Array<{ url: string; error: string }> = [];

  // Process in batches of 'concurrency' size
  for (let batchStart = 0; batchStart < urlsToExtract.length; batchStart += concurrency) {
    const batchEnd = Math.min(batchStart + concurrency, urlsToExtract.length);
    const batch = urlsToExtract.slice(batchStart, batchEnd);

    // Notify which properties are being scraped
    for (let i = 0; i < batch.length; i++) {
      const globalIndex = startIndex + batchStart + i;
      yield {
        type: 'scraping' as const,
        index: globalIndex,
        url: batch[i],
        progress: globalIndex,
        total: totalFoundInSearch,
      };
    }

    // Scrape all properties in this batch concurrently
    const batchPromises = batch.map((url) => scrapeZonapropListing(url, skipImages));
    const batchResults = await Promise.all(batchPromises);

    // Process results and yield updates
    for (let i = 0; i < batchResults.length; i++) {
      const result = batchResults[i];
      const url = batch[i];
      const globalIndex = startIndex + batchStart + i;

      if (result.success && result.data) {
        results.push(result.data);
        yield {
          type: 'property' as const,
          index: globalIndex,
          data: result.data,
        };
      } else {
        errors.push({ url, error: result.error || 'Error desconocido' });
        yield {
          type: 'error_property' as const,
          index: globalIndex,
          url,
          error: result.error || 'Error desconocido',
        };
      }
    }

    // Add delay between batches (except for the last batch)
    if (batchEnd < urlsToExtract.length) {
      const delay = 1000 + Math.random() * 1000; // Shorter delay since we're doing parallel
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
