"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Loader2, AlertCircle, Download, Search } from "lucide-react";
import { useSession } from "@/lib/auth-client";
import { redirect } from "next/navigation";

interface PropertyData {
  url: string;
  imageUrl: string | null;
  nombre: string;
  direccion: string;
  barrio: string;
  m2Cubiertos: number | null;
  m2Totales: number | null;
  cochera: string | null;
  dormitorios: number | null;
  bano: number | null;
  precio: number | null;
  moneda: string | null;
  expensas: number | null;
  precioM2: number | null;
}

interface PropertyRow extends Partial<PropertyData> {
  url: string;
  status: 'pending' | 'scraping' | 'completed' | 'error';
  error?: string;
}

export default function ExtractSearchPage() {
  const { data: session, isPending } = useSession();
  const [searchUrl, setSearchUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [properties, setProperties] = useState<PropertyRow[]>([]);
  const [totalFoundInSearch, setTotalFoundInSearch] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Redirect if not authenticated
  if (!isPending && !session) {
    redirect("/");
  }

  const handleExtract = async () => {
    setLoading(true);
    setError(null);
    setProperties([]);
    setTotalFoundInSearch(null);

    try {
      const trimmedUrl = searchUrl.trim();

      if (!trimmedUrl) {
        setError("Por favor ingresa una URL de búsqueda");
        setLoading(false);
        return;
      }

      if (!trimmedUrl.includes("zonaprop.com")) {
        setError("La URL debe ser de zonaprop.com");
        setLoading(false);
        return;
      }

      // Step 1: Get all URLs from search page
      const response = await fetch("/api/extract-search-stream", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ searchUrl: trimmedUrl }),
      });

      if (!response.ok) {
        throw new Error("Error al iniciar extracción");
      }

      const reader = response.body?.getReader();
      const decoder = new TextDecoder();

      if (!reader) {
        throw new Error("No se pudo leer la respuesta");
      }

      let allUrls: string[] = [];

      // Read the URLs response
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value);
        const lines = chunk.split('\n\n');

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const data = JSON.parse(line.slice(6));

            if (data.type === 'urls') {
              allUrls = data.urls;
              // Initialize properties with pending status
              setProperties(data.urls.map((url: string) => ({
                url,
                status: 'pending' as const,
              })));
              setTotalFoundInSearch(data.totalFoundInSearch);
            } else if (data.type === 'error') {
              throw new Error(data.error);
            }
          }
        }
      }

      if (allUrls.length === 0) {
        throw new Error("No se encontraron propiedades");
      }

      // Step 2: Process URLs in chunks of 10
      const CHUNK_SIZE = 10;
      for (let i = 0; i < allUrls.length; i += CHUNK_SIZE) {
        await processChunk(allUrls, i, CHUNK_SIZE);
      }

      setLoading(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error desconocido");
      setLoading(false);
    }
  };

  const processChunk = async (allUrls: string[], startIndex: number, chunkSize: number) => {
    try {
      const response = await fetch("/api/extract-search-stream", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          urls: allUrls,
          startIndex,
          limit: chunkSize
        }),
      });

      if (!response.ok) {
        throw new Error(`Error procesando chunk ${startIndex}`);
      }

      const reader = response.body?.getReader();
      const decoder = new TextDecoder();

      if (!reader) {
        throw new Error("No se pudo leer la respuesta");
      }

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value);
        const lines = chunk.split('\n\n');

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const data = JSON.parse(line.slice(6));

            switch (data.type) {
              case 'scraping':
                // Mark property as currently scraping
                setProperties(prev => prev.map((prop, idx) =>
                  idx === data.index ? { ...prop, status: 'scraping' as const } : prop
                ));
                break;

              case 'property':
                // Update property with scraped data
                setProperties(prev => prev.map((prop, idx) =>
                  idx === data.index ? { ...data.data, status: 'completed' as const } : prop
                ));
                break;

              case 'error_property':
                // Mark property as error
                setProperties(prev => prev.map((prop, idx) =>
                  idx === data.index ? { ...prop, status: 'error' as const, error: data.error } : prop
                ));
                break;

              case 'error':
                console.error(`Error in chunk ${startIndex}:`, data.error);
                // Mark remaining properties in this chunk as error
                for (let i = startIndex; i < Math.min(startIndex + chunkSize, properties.length); i++) {
                  setProperties(prev => prev.map((prop, idx) =>
                    idx === i && prop.status === 'pending' ? { ...prop, status: 'error' as const, error: 'Error en el chunk' } : prop
                  ));
                }
                break;
            }
          }
        }
      }
    } catch (err) {
      console.error(`Error processing chunk ${startIndex}:`, err);
      // Mark chunk properties as error but continue with next chunk
    }
  };

  const handleExportCSV = () => {
    const completedProperties = properties.filter(p => p.status === 'completed');
    if (completedProperties.length === 0) return;

    const headers = [
      "Nombre",
      "Dirección",
      "Barrio",
      "M2 Cubiertos",
      "M2 Totales",
      "Cochera",
      "Dormitorios",
      "Baño",
      "Precio",
      "Moneda",
      "Expensas",
      "$/m2",
      "URL",
    ];

    const rows = completedProperties.map((prop) => [
      prop.nombre,
      prop.direccion,
      prop.barrio,
      prop.m2Cubiertos ?? "",
      prop.m2Totales ?? "",
      prop.cochera ?? "",
      prop.dormitorios ?? "",
      prop.bano ?? "",
      prop.precio ?? "",
      prop.moneda ?? "",
      prop.expensas ?? "",
      prop.precioM2 ?? "",
      prop.url,
    ]);

    const csvContent = [
      headers.join(","),
      ...rows.map((row) =>
        row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(",")
      ),
    ].join("\n");

    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `zonaprop-busqueda-${new Date().toISOString().split("T")[0]}.csv`;
    link.click();
  };

  if (isPending) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  return (
    <main className="flex-1 container mx-auto px-4 py-8 max-w-7xl">
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold">Extraer Búsqueda</h1>
          <p className="text-muted-foreground mt-2">
            Pega una URL de búsqueda de Zonaprop para extraer todas las propiedades de los resultados
          </p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>URL de Búsqueda</CardTitle>
            <CardDescription>
              Ejemplo: https://www.zonaprop.com.ar/departamentos-venta-belgrano.html
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Input
              placeholder="https://www.zonaprop.com.ar/departamentos-venta-..."
              value={searchUrl}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setSearchUrl(e.target.value)}
              disabled={loading}
            />
            <div className="flex items-start gap-3">
              <Button
                onClick={handleExtract}
                disabled={loading || !searchUrl.trim()}
                size="lg"
              >
                {loading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Extrayendo búsqueda...
                  </>
                ) : (
                  <>
                    <Search className="mr-2 h-4 w-4" />
                    Extraer Búsqueda
                  </>
                )}
              </Button>
              {!loading && (
                <Alert className="flex-1">
                  <AlertDescription className="text-sm">
                    Se extraerán hasta 50 propiedades de la búsqueda. Este proceso puede tardar varios minutos (~2 min por cada 30 propiedades).
                  </AlertDescription>
                </Alert>
              )}
              {loading && (
                <Alert className="flex-1">
                  <AlertDescription className="text-sm font-medium">
                    Extrayendo propiedades... Por favor no cierres esta página. Esto puede tardar varios minutos.
                  </AlertDescription>
                </Alert>
              )}
            </div>
          </CardContent>
        </Card>

        {error && (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {properties.length > 0 && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-2xl font-bold">Resultados</h2>
                <p className="text-muted-foreground">
                  {properties.filter(p => p.status === 'completed').length} de {properties.length} propiedades extraídas
                  {totalFoundInSearch && totalFoundInSearch > properties.length && (
                    <span className="text-amber-600 dark:text-amber-400">
                      {" "}(Se encontraron {totalFoundInSearch} en total, limitado a {properties.length})
                    </span>
                  )}
                </p>
              </div>
              {properties.some(p => p.status === 'completed') && (
                <Button onClick={handleExportCSV} variant="outline">
                  <Download className="mr-2 h-4 w-4" />
                  Exportar CSV
                </Button>
              )}
            </div>

            <div className="border rounded-lg overflow-x-auto">
              <table className="w-full">
                <thead className="bg-muted">
                  <tr>
                    <th className="px-4 py-3 text-left text-sm font-medium">Estado</th>
                    <th className="px-4 py-3 text-left text-sm font-medium">Foto</th>
                    <th className="px-4 py-3 text-left text-sm font-medium">Nombre</th>
                    <th className="px-4 py-3 text-left text-sm font-medium">Dirección</th>
                    <th className="px-4 py-3 text-left text-sm font-medium">Barrio</th>
                    <th className="px-4 py-3 text-left text-sm font-medium">M² Cub</th>
                    <th className="px-4 py-3 text-left text-sm font-medium">M² Tot</th>
                    <th className="px-4 py-3 text-left text-sm font-medium">Cochera</th>
                    <th className="px-4 py-3 text-left text-sm font-medium">Dorm</th>
                    <th className="px-4 py-3 text-left text-sm font-medium">Baño</th>
                    <th className="px-4 py-3 text-left text-sm font-medium">Precio</th>
                    <th className="px-4 py-3 text-left text-sm font-medium">Moneda</th>
                    <th className="px-4 py-3 text-left text-sm font-medium">Expensas</th>
                    <th className="px-4 py-3 text-left text-sm font-medium">$/m²</th>
                    <th className="px-4 py-3 text-left text-sm font-medium">URL</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {properties.map((prop, index) => (
                    <tr
                      key={index}
                      className={
                        prop.status === 'scraping'
                          ? "bg-blue-50 dark:bg-blue-950/30"
                          : prop.status === 'error'
                          ? "bg-red-50 dark:bg-red-950/30"
                          : "hover:bg-muted/50"
                      }
                    >
                      <td className="px-4 py-3 text-sm">
                        {prop.status === 'scraping' && (
                          <Loader2 className="h-4 w-4 animate-spin text-blue-600" />
                        )}
                        {prop.status === 'pending' && (
                          <span className="text-muted-foreground">⏳</span>
                        )}
                        {prop.status === 'completed' && (
                          <span className="text-green-600">✓</span>
                        )}
                        {prop.status === 'error' && (
                          <span className="text-red-600" title={prop.error}>✗</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        {prop.imageUrl ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={prop.imageUrl}
                            alt={prop.nombre || 'Propiedad'}
                            className="w-20 h-20 object-cover rounded"
                            loading="lazy"
                          />
                        ) : prop.status === 'completed' ? (
                          <div className="w-20 h-20 bg-muted rounded flex items-center justify-center text-xs text-muted-foreground">
                            Sin foto
                          </div>
                        ) : (
                          <div className="w-20 h-20 bg-muted/50 rounded" />
                        )}
                      </td>
                      <td className="px-4 py-3 text-sm max-w-xs truncate" title={prop.nombre}>
                        {prop.nombre || <span className="text-muted-foreground italic">Pendiente...</span>}
                      </td>
                      <td className="px-4 py-3 text-sm">
                        {prop.direccion || <span className="text-muted-foreground">-</span>}
                      </td>
                      <td className="px-4 py-3 text-sm">
                        {prop.barrio || <span className="text-muted-foreground">-</span>}
                      </td>
                      <td className="px-4 py-3 text-sm">{prop.m2Cubiertos ?? "-"}</td>
                      <td className="px-4 py-3 text-sm">{prop.m2Totales ?? "-"}</td>
                      <td className="px-4 py-3 text-sm">{prop.cochera ?? "-"}</td>
                      <td className="px-4 py-3 text-sm">{prop.dormitorios ?? "-"}</td>
                      <td className="px-4 py-3 text-sm">{prop.bano ?? "-"}</td>
                      <td className="px-4 py-3 text-sm">
                        {prop.precio ? prop.precio.toLocaleString() : "-"}
                      </td>
                      <td className="px-4 py-3 text-sm">{prop.moneda || "-"}</td>
                      <td className="px-4 py-3 text-sm">
                        {prop.expensas ? prop.expensas.toLocaleString() : "-"}
                      </td>
                      <td className="px-4 py-3 text-sm">
                        {prop.precioM2 ? prop.precioM2.toLocaleString() : "-"}
                      </td>
                      <td className="px-4 py-3 text-sm">
                        <a
                          href={prop.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-primary hover:underline"
                        >
                          Ver
                        </a>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

          </div>
        )}
      </div>
    </main>
  );
}
