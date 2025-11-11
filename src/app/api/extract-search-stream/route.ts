import { NextRequest } from "next/server";
import { extractSearchResultsWithProgress } from "@/lib/search-scraper";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";

export const maxDuration = 600;

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
    const { searchUrl } = body;

    // Validate input
    if (!searchUrl || typeof searchUrl !== 'string') {
      return new Response(
        JSON.stringify({ error: "Se requiere una URL de búsqueda" }),
        { status: 400 }
      );
    }

    // Validate that URL is from Zonaprop
    if (!searchUrl.includes("zonaprop.com")) {
      return new Response(
        JSON.stringify({ error: "La URL debe ser de zonaprop.com" }),
        { status: 400 }
      );
    }

    console.log(`Starting streaming search extraction for: ${searchUrl}`);

    // Create a readable stream for SSE
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        try {
          for await (const update of extractSearchResultsWithProgress(searchUrl, 50)) {
            // Send the update as SSE
            const data = `data: ${JSON.stringify(update)}\n\n`;
            controller.enqueue(encoder.encode(data));
          }

          // Close the stream
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
