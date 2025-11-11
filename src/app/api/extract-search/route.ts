import { NextRequest, NextResponse } from "next/server";
import { extractSearchResults } from "@/lib/search-scraper";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";

const MAX_PROPERTIES = 50;

// Set timeout to 10 minutes (50 properties * ~4 seconds each = ~3.5 minutes + buffer)
export const maxDuration = 600;

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
    const { searchUrl } = body;

    // Validate input
    if (!searchUrl || typeof searchUrl !== 'string') {
      return NextResponse.json(
        { error: "Se requiere una URL de búsqueda" },
        { status: 400 }
      );
    }

    // Validate that URL is from Zonaprop
    if (!searchUrl.includes("zonaprop.com")) {
      return NextResponse.json(
        { error: "La URL debe ser de zonaprop.com" },
        { status: 400 }
      );
    }

    console.log(`Starting search extraction for: ${searchUrl}`);

    // Extract search results
    const result = await extractSearchResults(searchUrl, MAX_PROPERTIES);

    if (!result.success) {
      return NextResponse.json(
        { error: result.error || "Error al extraer búsqueda" },
        { status: 500 }
      );
    }

    console.log(
      `Search extraction complete: ${result.extracted} successful, ${result.failed} failed (${result.totalFoundInSearch} found in search)`
    );

    return NextResponse.json({
      success: true,
      total: result.total,
      extracted: result.extracted,
      failed: result.failed,
      results: result.results,
      errors: result.errors,
      totalFoundInSearch: result.totalFoundInSearch,
    });
  } catch (error) {
    console.error("Error in extract-search API:", error);
    return NextResponse.json(
      {
        error: "Error interno del servidor",
        details: error instanceof Error ? error.message : "Error desconocido",
      },
      { status: 500 }
    );
  }
}
