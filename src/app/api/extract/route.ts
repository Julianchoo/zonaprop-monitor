import { NextRequest, NextResponse } from "next/server";
import { scrapeMultipleListings } from "@/lib/scraper";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";

const MAX_URLS = 20;

export async function POST(request: NextRequest) {
  try {
    // Check authentication
    const session = await auth.api.getSession({
      headers: await headers(),
    });

    if (!session) {
      return NextResponse.json(
        { error: "No autorizado. Por favor inicia sesión." },
        { status: 401 }
      );
    }

    const body = await request.json();
    const { urls } = body;

    // Validate input
    if (!urls || !Array.isArray(urls)) {
      return NextResponse.json(
        { error: "Se requiere un array de URLs" },
        { status: 400 }
      );
    }

    if (urls.length === 0) {
      return NextResponse.json(
        { error: "Debe proporcionar al menos una URL" },
        { status: 400 }
      );
    }

    if (urls.length > MAX_URLS) {
      return NextResponse.json(
        { error: `Máximo ${MAX_URLS} URLs permitidas por solicitud` },
        { status: 400 }
      );
    }

    // Validate that all URLs are from Zonaprop
    const invalidUrls = urls.filter(
      (url: string) => !url.includes("zonaprop.com")
    );

    if (invalidUrls.length > 0) {
      return NextResponse.json(
        {
          error: "Todas las URLs deben ser de zonaprop.com",
          invalidUrls,
        },
        { status: 400 }
      );
    }

    console.log(`Starting extraction for ${urls.length} URLs...`);

    // Scrape the listings
    const results = await scrapeMultipleListings(urls);

    // Separate successful and failed results
    const successful = results.filter((r) => r.success);
    const failed = results.filter((r) => !r.success);

    console.log(
      `Extraction complete: ${successful.length} successful, ${failed.length} failed`
    );

    return NextResponse.json({
      success: true,
      total: urls.length,
      extracted: successful.length,
      failed: failed.length,
      results: successful.map((r) => r.data),
      errors: failed.map((r) => ({
        url: urls[results.indexOf(r)],
        error: r.error,
      })),
    });
  } catch (error) {
    console.error("Error in extract API:", error);
    return NextResponse.json(
      {
        error: "Error interno del servidor",
        details: error instanceof Error ? error.message : "Error desconocido",
      },
      { status: 500 }
    );
  }
}
