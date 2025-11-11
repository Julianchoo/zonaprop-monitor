export interface PropertyData {
  url: string;
  nombre: string;
  direccion: string;
  barrio: string;
  m2Cubiertos: number | null;
  m2Totales: number | null;
  cochera: string | null;
  dormitorios: number | null;
  bano: number | null;
  precio: number | null;
  moneda: string | null; // USD or ARS
  expensas: number | null;
  precioM2: number | null; // calculated: precio / m2Totales
}

export interface ScraperResult {
  success: boolean;
  data?: PropertyData;
  error?: string;
}

/**
 * Extract numeric value from string
 * e.g., "150 m²" -> 150, "$250.000" -> 250000
 */
function extractNumber(text: string | null | undefined): number | null {
  if (!text) return null;

  // Remove non-numeric characters except dots and commas
  const cleaned = text.replace(/[^\d.,]/g, '');

  // Remove dots used as thousands separators and replace comma with dot
  const normalized = cleaned.replace(/\./g, '').replace(/,/g, '.');

  const num = parseFloat(normalized);
  return isNaN(num) ? null : num;
}

/**
 * Scrape a single Zonaprop listing
 */
export async function scrapeZonapropListing(url: string): Promise<ScraperResult> {
  let browser;

  try {
    // Use regular puppeteer with manual evasion techniques
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

    // Manual anti-detection: Override navigator.webdriver
    await page.evaluateOnNewDocument(() => {
      Object.defineProperty(navigator, 'webdriver', {
        get: () => undefined,
      });

      // Override the plugins array
      Object.defineProperty(navigator, 'plugins', {
        get: () => [1, 2, 3, 4, 5],
      });

      // Override the languages property
      Object.defineProperty(navigator, 'languages', {
        get: () => ['es-AR', 'es', 'en'],
      });

      // Add chrome object
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (window as any).chrome = {
        runtime: {},
      };

      // Override permissions
      const originalQuery = window.navigator.permissions.query;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      window.navigator.permissions.query = (parameters: any) =>
        parameters.name === 'notifications'
          ? Promise.resolve({ state: 'denied' } as PermissionStatus)
          : originalQuery(parameters);
    });

    // Set realistic viewport and user agent
    await page.setViewport({ width: 1920, height: 1080 });
    await page.setUserAgent(
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36'
    );

    // Set additional headers
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

    console.log(`Navigating to: ${url}`);

    // Navigate to the listing
    const response = await page.goto(url, {
      waitUntil: 'domcontentloaded',
      timeout: 60000,
    });

    // Wait for dynamic content to load
    await new Promise(resolve => setTimeout(resolve, 2000));

    console.log(`Response status: ${response?.status()}`);
    console.log(`Final URL: ${page.url()}`);

    // Check if we got a valid response
    if (!response || response.status() !== 200) {
      await browser.close();
      return {
        success: false,
        error: `HTTP ${response?.status() || 'unknown'}: No se pudo acceder a la página`,
      };
    }

    // Add small random delay to appear more human-like
    await new Promise(resolve => setTimeout(resolve, Math.random() * 2000 + 1000));

    // Get page title to verify we're on the right page
    const pageTitle = await page.title();
    console.log(`Page title: ${pageTitle}`);

    // Extract data from the page
    const data = await page.evaluate(() => {
      // Helper to get text content safely
      const getText = (selector: string): string | null => {
        const element = document.querySelector(selector);
        return element?.textContent?.trim() || null;
      };

      // Extract property title from h1
      const nombre = getText('h1') || '';

      // Extract address from location section
      const addressElement = document.querySelector('.section-location-property');
      const fullAddress = addressElement?.textContent?.trim() || '';
      // Format: "Street at Number, Neighborhood, City"
      const addressParts = fullAddress.split(',').map(s => s.trim());
      const direccion = addressParts[0] || '';
      const barrio = addressParts[1] || '';

      // Get all text content for searching features
      const allText = document.body.textContent || '';

      // Extract price from price container
      const priceElement = document.querySelector('.price-value, .price-item-container');
      let precioText = priceElement?.textContent?.trim() || '';

      // Extract currency (USD or ARS) - check the price element first
      let moneda = null;
      if (precioText.includes('USD')) {
        moneda = 'USD';
      } else if (precioText.includes('ARS')) {
        moneda = 'ARS';
      } else if (precioText.includes('$')) {
        // If only $ is present, assume ARS
        moneda = 'ARS';
      }

      // Clean up the price text - extract just the number
      // Format: "venta USD 850.000" -> "850.000"
      const precioMatch = precioText.match(/(?:USD|ARS|\$)\s*([\d.,]+)/i);
      if (precioMatch) {
        precioText = precioMatch[1];
      } else {
        // Try to extract any number
        const numberMatch = precioText.match(/([\d.,]+)/);
        if (numberMatch) {
          precioText = numberMatch[1];
        }
      }

      // Extract expenses from dedicated element
      let expensasText = '';
      const expensasElement = document.querySelector('.price-expenses, .price-extra');
      if (expensasElement) {
        const expensasFullText = expensasElement.textContent?.trim() || '';
        // Extract the number from "Expensas $ 600.000"
        const expensasMatch = expensasFullText.match(/\$?\s*([\d.,]+)/);
        if (expensasMatch) {
          expensasText = expensasMatch[1];
        }
      }

      // Extract property details from H2 (format: "Departamento · 110m² · 4 ambientes")
      const h2Elements = document.querySelectorAll('h2');
      let propertyDetailsText = '';
      h2Elements.forEach(h2 => {
        const text = h2.textContent?.trim() || '';
        if (text.includes('m²') || text.includes('ambiente')) {
          propertyDetailsText = text;
        }
      });

      // Parse the details from the H2 text
      // Format: "Departamento · 110m² · 4 ambientes"
      let m2TotalesText = '';
      let ambientesText = '';

      // Extract m² (could be m² totales or just m²)
      const m2Match = propertyDetailsText.match(/(\d+(?:[.,]\d+)?)\s*m²/i);
      if (m2Match) {
        m2TotalesText = m2Match[1];
      }

      // Extract ambientes
      const ambientesMatch = propertyDetailsText.match(/(\d+)\s*ambientes?/i);
      if (ambientesMatch) {
        ambientesText = ambientesMatch[1];
      }

      // Try to find more specific features from feature list items
      let m2CubiertosText = '';
      let cochera = null;
      let dormitorios = null;
      let bano = null;

      // Look for m² in list items with class "icon-feature"
      const featureItems = document.querySelectorAll('.icon-feature, li.icon-feature');
      featureItems.forEach(item => {
        const text = item.textContent?.trim() || '';

        // Match "380 m² cub." or "380m² cubiertos"
        const m2CubMatch = text.match(/(\d+(?:[.,]\d+)?)\s*m²?\s*(?:cub|cubiertos?)/i);
        if (m2CubMatch) {
          m2CubiertosText = m2CubMatch[1];
        }

        // Match "2300 m² tot." or "2300m² totales"
        const m2TotMatch = text.match(/(\d+(?:[.,]\d+)?)\s*m²?\s*(?:tot|totales?)/i);
        if (m2TotMatch) {
          m2TotalesText = m2TotMatch[1];
        }
      });

      // Fallback: Look for covered area in all text
      if (!m2CubiertosText) {
        const m2CubiertosMatch = allText.match(/(\d+(?:[.,]\d+)?)\s*m²?\s*cubiertos?/i);
        if (m2CubiertosMatch) {
          m2CubiertosText = m2CubiertosMatch[1];
        }
      }

      // Look for cochera/garage
      if (/cochera|garage|estacionamiento/i.test(allText)) {
        const cocheraMatch = allText.match(/(\d+)\s*(?:cochera|garage)/i);
        cochera = cocheraMatch ? cocheraMatch[1] : '1';
      }

      // Look for dormitorios/bedrooms
      const dormitoriosMatch = allText.match(/(\d+)\s*dormitorios?|(\d+)\s*habitaciones?/i);
      if (dormitoriosMatch) {
        dormitorios = dormitoriosMatch[1] || dormitoriosMatch[2];
      }

      // Look for bathrooms
      const banoMatch = allText.match(/(\d+)\s*baños?/i);
      if (banoMatch) {
        bano = banoMatch[1];
      }

      return {
        nombre,
        direccion,
        barrio,
        precioText,
        moneda,
        expensasText,
        m2CubiertosText,
        m2TotalesText,
        cochera,
        dormitorios: dormitorios || ambientesText, // Use ambientes as fallback for dormitorios
        bano,
        propertyDetails: propertyDetailsText, // For debugging
      };
    });

    await browser.close();

    console.log('Raw extracted data:', data);

    // Parse numeric values
    const precio = extractNumber(data.precioText);
    const expensas = extractNumber(data.expensasText);
    const m2Cubiertos = extractNumber(data.m2CubiertosText);
    const m2Totales = extractNumber(data.m2TotalesText);
    const dormitoriosNum = extractNumber(data.dormitorios);
    const banoNum = extractNumber(data.bano);

    // Calculate price per square meter
    const precioM2 = precio && m2Totales ? Math.round(precio / m2Totales) : null;

    const propertyData: PropertyData = {
      url,
      nombre: data.nombre,
      direccion: data.direccion,
      barrio: data.barrio,
      m2Cubiertos,
      m2Totales,
      cochera: data.cochera,
      dormitorios: dormitoriosNum,
      bano: banoNum,
      precio,
      moneda: data.moneda,
      expensas,
      precioM2,
    };

    console.log('Extracted data:', propertyData);

    return {
      success: true,
      data: propertyData,
    };
  } catch (error) {
    console.error('Scraping error:', error);
    if (browser) {
      await browser.close();
    }
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Error desconocido al extraer datos',
    };
  }
}

/**
 * Scrape multiple Zonaprop listings with delays between requests
 */
export async function scrapeMultipleListings(
  urls: string[],
  delayMs: number = 3000
): Promise<ScraperResult[]> {
  const results: ScraperResult[] = [];

  for (let i = 0; i < urls.length; i++) {
    const url = urls[i];
    console.log(`Scraping ${i + 1}/${urls.length}: ${url}`);

    const result = await scrapeZonapropListing(url);
    results.push(result);

    // Add delay between requests (except for the last one)
    if (i < urls.length - 1) {
      const delay = delayMs + Math.random() * 2000; // Add randomness
      console.log(`Waiting ${Math.round(delay)}ms before next request...`);
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }

  return results;
}
