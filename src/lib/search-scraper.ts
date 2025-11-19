import { scrapeMultipleListings, scrapeZonapropListing, PropertyData } from './scraper';

export interface SearchScraperResult {
  success: boolean;
  totalUrls: number;
  propertyUrls?: string[];
  error?: string;
}

/**
 * Extract all property URLs from a Zonaprop search page (with pagination)
 */
export async function scrapeSearchPageUrls(searchUrl: string, maxPages: number = 20): Promise<SearchScraperResult> {
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

    // First, navigate to the first page to get total count
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
    await new Promise(resolve => setTimeout(resolve, 3000));

    // Extract total number of results from the page
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const totalResultsInfo = await (page as any).evaluate(() => {
      // Look for text like "402 Propiedades e inmuebles..."
      const headingSelectors = ['h1', '.postings-title', '[class*="title"]', '[class*="heading"]'];
      const debugTexts: string[] = [];

      for (const selector of headingSelectors) {
        const elements = document.querySelectorAll(selector);
        for (const element of elements) {
          const text = element.textContent || '';
          debugTexts.push(`${selector}: "${text.substring(0, 100)}"`);
          // Match patterns like "402 Propiedades" or "402 Propiedades e inmuebles"
          const match = text.match(/(\d+)\s+Propiedades/i);
          if (match) {
            return {
              totalResults: parseInt(match[1], 10),
              text: text.trim(),
              debugTexts
            };
          }
        }
      }
      return { totalResults: 0, text: '', debugTexts };
    });

    console.log(`Total results from page: ${totalResultsInfo.totalResults} (${totalResultsInfo.text})`);
    if (totalResultsInfo.debugTexts && totalResultsInfo.debugTexts.length > 0) {
      console.log('Debug heading texts:', totalResultsInfo.debugTexts.slice(0, 5));
    }

    // Extract pagination links to understand URL format
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const paginationInfo = await (page as any).evaluate(() => {
      const paginationLinks: string[] = [];
      // Look for pagination links
      const links = document.querySelectorAll('a[href*="pagina"]');
      links.forEach((link) => {
        const href = link.getAttribute('href');
        if (href) paginationLinks.push(href);
      });
      return { paginationLinks: paginationLinks.slice(0, 5) };
    });

    console.log('Pagination link examples:', paginationInfo.paginationLinks);

    // Build list of all page URLs to scrape
    const pageUrls: string[] = [searchUrl]; // Page 1 (already on it)

    // Calculate how many pages we need
    const propertiesPerPage = 30;
    const totalPages = totalResultsInfo.totalResults > 0
      ? Math.min(Math.ceil(totalResultsInfo.totalResults / propertiesPerPage), maxPages)
      : maxPages;

    // Use the actual pagination links we found, or construct them if needed
    if (paginationInfo.paginationLinks.length > 0) {
      // Extract unique page numbers from pagination links
      const pageNumbers = new Set<number>();
      paginationInfo.paginationLinks.forEach((link: string) => {
        const match = link.match(/pagina-(\d+)/);
        if (match) {
          pageNumbers.add(parseInt(match[1], 10));
        }
      });

      // Build URLs for pages 2 through totalPages
      for (let i = 2; i <= totalPages; i++) {
        // Use the pattern from actual pagination links
        const pageUrl = searchUrl.replace(/\.html$/, `-pagina-${i}.html`);
        pageUrls.push(pageUrl);
      }
    } else {
      // Fallback: construct URLs manually
      for (let i = 2; i <= totalPages; i++) {
        const pageUrl = searchUrl.replace(/\.html$/, `-pagina-${i}.html`);
        pageUrls.push(pageUrl);
      }
    }

    console.log(`Will scrape ${pageUrls.length} pages to get all ${totalResultsInfo.totalResults} properties`);

    const allPropertyUrls = new Set<string>();

    // Loop through all page URLs
    for (let currentPage = 1; currentPage <= pageUrls.length; currentPage++) {
      const pageUrl = pageUrls[currentPage - 1];

      console.log(`Extracting from page ${currentPage}/${pageUrls.length}: ${pageUrl}`);

      // Navigate to page if not already there (we already navigated to page 1)
      if (currentPage > 1) {
        const pageResponse = await page.goto(pageUrl, {
          waitUntil: 'domcontentloaded',
          timeout: 60000,
        });

        console.log(`Page ${currentPage} response status: ${pageResponse?.status()}`);

        if (!pageResponse || pageResponse.status() !== 200) {
          console.log(`Page ${currentPage} returned error ${pageResponse?.status()}, stopping pagination`);
          break;
        }

        // Wait for dynamic content to load
        await new Promise(resolve => setTimeout(resolve, 3000));
      }

      console.log(`Extracting property URLs from page ${currentPage}...`);

      // Extract all property URLs from the current search results page
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

        debugInfo.push(`Property URLs found on this page: ${urls.length}`);

        return { urls, debugInfo };
      });

      console.log('Debug info:', extractionResult.debugInfo);
      console.log(`Found ${extractionResult.urls.length} property URLs on page ${currentPage}`);

      // Add URLs to our set (automatically handles duplicates)
      const beforeCount = allPropertyUrls.size;
      extractionResult.urls.forEach((url: string) => allPropertyUrls.add(url));
      const newUrlsAdded = allPropertyUrls.size - beforeCount;

      console.log(`Added ${newUrlsAdded} new unique URLs (total: ${allPropertyUrls.size})`);

      // Add a small delay between page requests
      if (currentPage < pageUrls.length) {
        await new Promise(resolve => setTimeout(resolve, 1000 + Math.random() * 1000));
      }
    }

    await browser.close();

    const propertyUrls = Array.from(allPropertyUrls);

    console.log(`Total unique property URLs found across ${pageUrls.length} pages: ${propertyUrls.length}`);

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

    // If maxProperties is 0 or negative, return ALL URLs without limit
    if (maxProperties <= 0) {
      urlsToExtract = searchResult.propertyUrls;
    } else {
      urlsToExtract = searchResult.propertyUrls.slice(0, maxProperties);
    }
    totalFoundInSearch = searchResult.totalUrls;

    // Send initial URLs only if this is the first call (not chunked)
    yield {
      type: 'urls' as const,
      urls: searchResult.propertyUrls, // Return ALL URLs for frontend to decide
      totalFoundInSearch: totalFoundInSearch,
    };
  }

  // If maxProperties is 0 or negative, just return URLs without scraping
  if (maxProperties <= 0) {
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

    // If maxProperties is 0 or negative, return ALL URLs without limit
    if (maxProperties <= 0) {
      urlsToExtract = searchResult.propertyUrls;
    } else {
      urlsToExtract = searchResult.propertyUrls.slice(0, maxProperties);
    }
    totalFoundInSearch = searchResult.totalUrls;

    // Send initial URLs only if this is the first call (not chunked)
    yield {
      type: 'urls' as const,
      urls: searchResult.propertyUrls, // Return ALL URLs for frontend to decide
      totalFoundInSearch: totalFoundInSearch,
    };
  }

  // If maxProperties is 0 or negative, just return URLs without scraping
  if (maxProperties <= 0) {
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
