"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Loader2, AlertCircle, Download } from "lucide-react";
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

interface ExtractionResult {
  success: boolean;
  total: number;
  extracted: number;
  failed: number;
  results: PropertyData[];
  errors: Array<{ url: string; error: string }>;
}

export default function ExtractPage() {
  const { data: session, isPending } = useSession();
  const [urls, setUrls] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<ExtractionResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Redirect if not authenticated
  if (!isPending && !session) {
    redirect("/");
  }

  const handleExtract = async () => {
    setLoading(true);
    setError(null);
    setResult(null);

    try {
      // Parse URLs from textarea
      const urlList = urls
        .split("\n")
        .map((url) => url.trim())
        .filter((url) => url.length > 0);

      if (urlList.length === 0) {
        setError("Por favor ingresa al menos una URL");
        setLoading(false);
        return;
      }

      if (urlList.length > 20) {
        setError("Máximo 20 URLs permitidas por solicitud");
        setLoading(false);
        return;
      }

      const response = await fetch("/api/extract", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ urls: urlList }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Error al extraer datos");
      }

      setResult(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error desconocido");
    } finally {
      setLoading(false);
    }
  };

  const handleExportCSV = () => {
    if (!result || result.results.length === 0) return;

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

    const rows = result.results.map((prop) => [
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
    link.download = `zonaprop-${new Date().toISOString().split("T")[0]}.csv`;
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
          <h1 className="text-3xl font-bold">Extracción Rápida</h1>
          <p className="text-muted-foreground mt-2">
            Pega hasta 20 URLs de Zonaprop (una por línea) para extraer los datos
          </p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>URLs de Zonaprop</CardTitle>
            <CardDescription>
              Ingresa las URLs de las propiedades que deseas analizar
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Textarea
              placeholder="https://www.zonaprop.com.ar/propiedades/..."
              value={urls}
              onChange={(e) => setUrls(e.target.value)}
              rows={8}
              disabled={loading}
            />
            <Button
              onClick={handleExtract}
              disabled={loading || !urls.trim()}
              size="lg"
            >
              {loading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Extrayendo...
                </>
              ) : (
                "Extraer Datos"
              )}
            </Button>
          </CardContent>
        </Card>

        {error && (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {result && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-2xl font-bold">Resultados</h2>
                <p className="text-muted-foreground">
                  {result.extracted} de {result.total} propiedades extraídas
                </p>
              </div>
              {result.results.length > 0 && (
                <Button onClick={handleExportCSV} variant="outline">
                  <Download className="mr-2 h-4 w-4" />
                  Exportar CSV
                </Button>
              )}
            </div>

            {result.results.length > 0 && (
              <div className="border rounded-lg overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-muted">
                    <tr>
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
                    {result.results.map((prop, index) => (
                      <tr key={index} className="hover:bg-muted/50">
                        <td className="px-4 py-3">
                          {prop.imageUrl ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              src={prop.imageUrl}
                              alt={prop.nombre}
                              className="w-20 h-20 object-cover rounded"
                              loading="lazy"
                            />
                          ) : (
                            <div className="w-20 h-20 bg-muted rounded flex items-center justify-center text-xs text-muted-foreground">
                              Sin foto
                            </div>
                          )}
                        </td>
                        <td className="px-4 py-3 text-sm max-w-xs truncate" title={prop.nombre}>
                          {prop.nombre}
                        </td>
                        <td className="px-4 py-3 text-sm">{prop.direccion || "-"}</td>
                        <td className="px-4 py-3 text-sm">{prop.barrio || "-"}</td>
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
            )}

            {result.errors.length > 0 && (
              <Alert>
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>
                  <div className="font-medium mb-2">
                    {result.errors.length} URL(s) fallaron:
                  </div>
                  <ul className="list-disc list-inside space-y-1 text-sm">
                    {result.errors.map((err, index) => (
                      <li key={index}>
                        <span className="text-muted-foreground">{err.url}</span>
                        <span className="ml-2">- {err.error}</span>
                      </li>
                    ))}
                  </ul>
                </AlertDescription>
              </Alert>
            )}
          </div>
        )}
      </div>
    </main>
  );
}
