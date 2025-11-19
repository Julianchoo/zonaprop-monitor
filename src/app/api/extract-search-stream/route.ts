import { NextRequest } from "next/server";
import { extractSearchResultsParallel } from "@/lib/search-scraper";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";

// Vercel hobby plan limit is 300 seconds
// With parallel processing (5 concurrent), 10 properties takes ~10-15s
export const maxDuration = 60;

export async function POST(request: NextRequest) {
  try {
    // Check authentication
    const session = await auth.api.getSession({
      headers: await headers(),
    });

    if (!session) {
      return new Response(
        JSON.stringify({ error: "No autorizado. Por favor inicia sesión." }),
        { status: 401 }
      );
    }

    const body = await request.json();
    const { searchUrl, urls, startIndex = 0, limit = 10, concurrency = 5, skipImages = false } = body;

    // If URLs are provided, process them directly (chunked processing)
    if (urls && Array.isArray(urls)) {
      console.log(`Processing chunk: ${startIndex} to ${startIndex + limit} (concurrency: ${concurrency}, skipImages: ${skipImages})`);

      // Create a readable stream for SSE
      const encoder = new TextEncoder();
      const stream = new ReadableStream({
        async start(controller) {
          try {
            for await (const update of extractSearchResultsParallel(
              '',
              limit,
              urls,
              startIndex,
              concurrency,
              skipImages
            )) {
              const data = `data: ${JSON.stringify(update)}\n\n`;
              controller.enqueue(encoder.encode(data));
            }
            controller.close();
          } catch (error) {
            console.error("Error in stream:", error);
            const errorData = `data: ${JSON.stringify({
              type: 'error',
              error: error instanceof Error ? error.message : 'Error desconocido'
            })}\n\n`;
            controller.enqueue(encoder.encode(errorData));
            controller.close();
          }
        },
      });

      return new Response(stream, {
        headers: {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
          'Connection': 'keep-alive',
        },
      });
    }

    // If searchUrl is provided, just return the URLs (first step)
    if (!searchUrl || typeof searchUrl !== 'string') {
      return new Response(
        JSON.stringify({ error: "Se requiere una URL de búsqueda o lista de URLs" }),
        { status: 400 }
      );
    }

    if (!searchUrl.includes("zonaprop.com")) {
      return new Response(
        JSON.stringify({ error: "La URL debe ser de zonaprop.com" }),
        { status: 400 }
      );
    }

    console.log(`Extracting URLs from search page: ${searchUrl}`);

    // Just extract and return URLs (no scraping yet)
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        try {
          for await (const update of extractSearchResultsParallel(searchUrl, -1)) {
            // Only send the 'urls' event, stop before scraping
            if (update.type === 'urls') {
              const data = `data: ${JSON.stringify(update)}\n\n`;
              controller.enqueue(encoder.encode(data));
              controller.close();
              return;
            }
          }
          controller.close();
        } catch (error) {
          console.error("Error in stream:", error);
          const errorData = `data: ${JSON.stringify({
            type: 'error',
            error: error instanceof Error ? error.message : 'Error desconocido'
          })}\n\n`;
          controller.enqueue(encoder.encode(errorData));
          controller.close();
        }
      },
    });

    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
      },
    });
  } catch (error) {
    console.error("Error in extract-search-stream API:", error);
    return new Response(
      JSON.stringify({
        error: "Error interno del servidor",
        details: error instanceof Error ? error.message : "Error desconocido",
      }),
      { status: 500 }
    );
  }
}
