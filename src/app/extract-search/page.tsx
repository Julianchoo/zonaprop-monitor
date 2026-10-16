"use client";

import { Suspense, useState, useEffect, useMemo } from "react";
import dynamic from "next/dynamic";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Loader2, AlertCircle, Download, Search, Save, MapPin } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { useSession } from "@/lib/auth-client";
import { redirect, useSearchParams } from "next/navigation";
import { isPointInPolygon, type GeoPolygon } from "@/lib/geo";
import type { ZoneMapMarker } from "@/components/map/zone-map";

// Leaflet needs `window`, so the map is only rendered on the client
const ZoneMap = dynamic(() => import("@/components/map/zone-map"), {
  ssr: false,
  loading: () => (
    <div className="flex h-[420px] w-full items-center justify-center rounded-lg border bg-muted/50">
      <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
    </div>
  ),
});

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
  latitud: number | null;
  longitud: number | null;
}

interface PropertyRow extends Partial<PropertyData> {
  url: string;
  status: 'pending' | 'scraping' | 'completed' | 'error';
  error?: string;
}

function ExtractSearchContent() {
  const { data: session, isPending } = useSession();
  const searchParams = useSearchParams();
  const savedSearchId = searchParams.get("savedSearchId");
  const [isSavingHistory, setIsSavingHistory] = useState(false);
  const [searchUrl, setSearchUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [properties, setProperties] = useState<PropertyRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [showAntiScrapingWarning, setShowAntiScrapingWarning] = useState(false);
  const [totalPropertiesInSearch, setTotalPropertiesInSearch] = useState(0);
  const [isSaveDialogOpen, setIsSaveDialogOpen] = useState(false);
  const [searchName, setSearchName] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [statusMessage, setStatusMessage] = useState("");
  const [polygon, setPolygon] = useState<GeoPolygon | null>(null);
  const [showOutsideZone, setShowOutsideZone] = useState(false);

  // Redirect if not authenticated
  if (!isPending && !session) {
    redirect("/");
  }

  // Populate searchUrl from URL params on mount
  useEffect(() => {
    const urlParam = searchParams.get("url");
    if (urlParam) {
      setSearchUrl(decodeURIComponent(urlParam));
    }
  }, [searchParams]);

  // Load the drawn zone of the saved search being re-run
  useEffect(() => {
    if (!savedSearchId) return;

    fetch(`/api/saved-searches/${savedSearchId}`)
      .then((response) => (response.ok ? response.json() : null))
      .then((data) => {
        if (data?.polygon) setPolygon(data.polygon);
      })
      .catch((err) => console.error("Error loading saved search:", err));
  }, [savedSearchId]);

  // Properties are filtered against the current zone, so redrawing it re-filters
  // already extracted results without scraping again.
  const isInZone = (prop: PropertyRow) => {
    if (!polygon) return true;
    if (prop.latitud == null || prop.longitud == null) return false;
    return isPointInPolygon({ lat: prop.latitud, lng: prop.longitud }, polygon);
  };

  const completedInZone = properties.filter(p => p.status === 'completed' && isInZone(p));
  const outsideZoneCount = properties.filter(p => p.status === 'completed' && !isInZone(p)).length;
  const visibleProperties = showOutsideZone
    ? properties
    : properties.filter(p => p.status !== 'completed' || isInZone(p));

  const mapMarkers = useMemo<ZoneMapMarker[]>(
    () =>
      properties
        .filter(p => p.status === 'completed' && p.latitud != null && p.longitud != null)
        .filter(p => {
          if (!polygon) return true;
          return isPointInPolygon({ lat: p.latitud!, lng: p.longitud! }, polygon);
        })
        .map(p => ({
          lat: p.latitud!,
          lng: p.longitud!,
          title: p.nombre || p.direccion || "Propiedad",
          subtitle: p.precio ? `${p.moneda ?? ""} ${p.precio.toLocaleString()}`.trim() : undefined,
          url: p.url,
        })),
    [properties, polygon]
  );

  const handleInitialCheck = async () => {
    setError(null);
    setStatusMessage("Iniciando conexión...");

    const trimmedUrl = searchUrl.trim();

    if (!trimmedUrl) {
      setError("Por favor ingresa una URL de búsqueda");
      return;
    }

    if (!trimmedUrl.includes("zonaprop.com")) {
      setError("La URL debe ser de zonaprop.com");
      return;
    }

    setLoading(true);

    try {
      // Step 1: Get all URLs from search page to show confirmation
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
      let initialBuffer = "";

      if (!reader) {
        throw new Error("No se pudo leer la respuesta");
      }

      // Read the URLs response
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        initialBuffer += decoder.decode(value, { stream: true });
        const lines = initialBuffer.split('\n\n');
        initialBuffer = lines.pop() || "";

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const data = JSON.parse(line.slice(6));

            if (data.type === 'urls') {
              const totalProps = data.urls.length;
              const totalInSearch = data.totalFoundInSearch || totalProps;
              const isLimited = data.limitedByAntiScraping || false;

              console.log(`🔍 Found ${totalProps} properties (${totalInSearch} total in search, limited: ${isLimited})`);
              setTotalPropertiesInSearch(totalInSearch);

              // Show warning if limited by anti-scraping
              if (isLimited && totalInSearch > totalProps) {
                setShowAntiScrapingWarning(true);
              }

              // Proceed directly with extraction (always ≤30 properties now)
              console.log(`✅ Proceeding with ${totalProps} properties`);
              await proceedWithExtraction(data.urls);
            } else if (data.type === 'error') {
              throw new Error(data.error);
            }
          }
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error desconocido");
      setLoading(false);
    }
  };

  const proceedWithExtraction = async (allUrls: string[]) => {
    setLoading(true);
    setError(null);
    setProperties([]);

    try {
      // Initialize properties with pending status
      setProperties(allUrls.map((url: string) => ({
        url,
        status: 'pending' as const,
      })));

      // Keep each serverless invocation below Vercel's 60 second limit.
      const CHUNK_SIZE = 2;
      const CONCURRENCY = 2;
      const skipImages = false; // Always get images for small searches

      for (let i = 0; i < allUrls.length; i += CHUNK_SIZE) {
        await processChunk(allUrls, i, CHUNK_SIZE, CONCURRENCY, skipImages);
      }

      setLoading(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error desconocido");
      setLoading(false);
    }
  };

  const handleSaveSearch = async () => {
    if (!searchName.trim() || !searchUrl.trim()) return;

    setIsSaving(true);
    try {
      const response = await fetch("/api/saved-searches", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name: searchName,
          url: searchUrl,
          polygon,
          initialResults: completedInZone,
        }),
      });

      if (!response.ok) {
        throw new Error("Error al guardar la búsqueda");
      }

      setIsSaveDialogOpen(false);
      setSearchName("");
      // Optional: Show success toast or message
      alert("Búsqueda guardada exitosamente");
    } catch (err) {
      console.error(err);
      alert("Error al guardar la búsqueda");
    } finally {
      setIsSaving(false);
    }
  };

  const handleExtract = async () => {
    await handleInitialCheck();
  };

  const processChunk = async (
    allUrls: string[],
    startIndex: number,
    chunkSize: number,
    concurrency: number = 5,
    skipImages: boolean = false
  ) => {
    try {
      const response = await fetch("/api/extract-search-stream", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          urls: allUrls,
          startIndex,
          limit: chunkSize,
          concurrency,
          skipImages
        }),
      });


      if (!response.ok) {
        throw new Error(`Error procesando chunk ${startIndex}`);
      }

      const reader = response.body?.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      if (!reader) {
        throw new Error("No se pudo leer la respuesta");
      }

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n\n');
        buffer = lines.pop() || "";

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const data = JSON.parse(line.slice(6));

            switch (data.type) {
              case 'status':
                setStatusMessage(data.message);
                break;

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
                setError(data.error || `Error procesando el lote ${startIndex + 1}`);
                // Mark remaining properties in this chunk as error
                for (let i = startIndex; i < Math.min(startIndex + chunkSize, allUrls.length); i++) {
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
      setError(err instanceof Error ? err.message : `Error procesando el lote ${startIndex + 1}`);
      // Mark chunk properties as error but continue with next chunk
      for (let i = startIndex; i < Math.min(startIndex + chunkSize, allUrls.length); i++) {
        setProperties(prev => prev.map((prop, idx) =>
          idx === i && prop.status === 'pending' ? { ...prop, status: 'error' as const, error: 'Error al procesar el lote' } : prop
        ));
      }
    }
  };

  // Auto-save history when extraction is complete and we have a savedSearchId
  const saveHistory = async () => {
    if (!savedSearchId || isSavingHistory || properties.length === 0) return;

    const completedProps = completedInZone;
    if (completedProps.length === 0) return;

    setIsSavingHistory(true);
    try {
      await fetch(`/api/saved-searches/${savedSearchId}/executions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ results: completedProps }),
      });
      // Optional: Show toast
    } catch (error) {
      console.error("Error saving history:", error);
    } finally {
      setIsSavingHistory(false);
    }
  };

  // Trigger save when loading finishes and we have results
  useEffect(() => {
    if (!loading && properties.length > 0 && savedSearchId) {
      saveHistory();
    }
  }, [loading, properties.length, savedSearchId]);

  const handleExportCSV = () => {
    const completedProperties = completedInZone;
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
      "Latitud",
      "Longitud",
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
      prop.latitud ?? "",
      prop.longitud ?? "",
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
            Pega una URL de búsqueda de Zonaprop y, si querés, dibujá en el mapa la zona exacta que te interesa
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
              <Dialog open={isSaveDialogOpen} onOpenChange={setIsSaveDialogOpen}>
                <DialogTrigger asChild>
                  <Button variant="outline" size="lg" disabled={!searchUrl.trim() || loading}>
                    <Save className="mr-2 h-4 w-4" />
                    Guardar
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Guardar Búsqueda</DialogTitle>
                    <DialogDescription>
                      Guardá esta búsqueda para volver a ejecutarla fácilmente más tarde.
                      {polygon && " La zona dibujada en el mapa se guarda junto con la búsqueda."}
                    </DialogDescription>
                  </DialogHeader>
                  <div className="grid gap-4 py-4">
                    <div className="grid grid-cols-4 items-center gap-4">
                      <Label htmlFor="name" className="text-right">
                        Nombre
                      </Label>
                      <Input
                        id="name"
                        value={searchName}
                        onChange={(e) => setSearchName(e.target.value)}
                        placeholder="Ej: Deptos Belgrano 3 amb"
                        className="col-span-3"
                      />
                    </div>
                  </div>
                  <DialogFooter>
                    <Button onClick={handleSaveSearch} disabled={isSaving || !searchName.trim()}>
                      {isSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                      Guardar
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
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
                    {statusMessage || "Extrayendo propiedades... Por favor no cierres esta página. Esto puede tardar varios minutos."}
                  </AlertDescription>
                </Alert>
              )}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <MapPin className="h-5 w-5" />
              Zona en el mapa
              <span className="text-sm font-normal text-muted-foreground">(opcional)</span>
            </CardTitle>
            <CardDescription>
              Dibujá un polígono para quedarte solo con las propiedades que caen dentro de esa zona.
              Los filtros de tipo, operación y precio siguen saliendo de la URL de Zonaprop. Como solo
              se leen las primeras 30 propiedades de la búsqueda, usá una URL de barrio que cubra la zona
              dibujada para obtener más resultados.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ZoneMap
              polygon={polygon}
              onPolygonChange={setPolygon}
              markers={mapMarkers}
              disabled={loading}
            />
          </CardContent>
        </Card>

        {showAntiScrapingWarning && (
          <Alert className="border-amber-200 bg-amber-50 dark:bg-amber-950/30 dark:border-amber-900">
            <AlertCircle className="h-4 w-4 text-amber-600" />
            <AlertDescription>
              <div className="space-y-2">
                <p className="font-semibold text-amber-900 dark:text-amber-100">
                  ⚠️ Limitación de Anti-Scraping
                </p>
                <p className="text-sm text-amber-800 dark:text-amber-200">
                  Se encontraron <strong>{totalPropertiesInSearch} propiedades</strong> en la búsqueda, pero Zonaprop bloquea el acceso a páginas adicionales.
                </p>
                <p className="text-sm text-amber-800 dark:text-amber-200">
                  Solo se pueden extraer las primeras <strong>30 propiedades</strong> debido a la protección anti-bot de Zonaprop.
                </p>
                <p className="text-sm text-amber-700 dark:text-amber-300 italic">
                  Tip: Refiná tu búsqueda en Zonaprop con más filtros para reducir los resultados a menos de 30 propiedades.
                </p>
              </div>
            </AlertDescription>
          </Alert>
        )}

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
                  {polygon && (
                    <span>
                      {" "}· {completedInZone.length} dentro de la zona dibujada
                    </span>
                  )}
                  {showAntiScrapingWarning && totalPropertiesInSearch > properties.length && (
                    <span className="text-amber-600 dark:text-amber-400">
                      {" "}({totalPropertiesInSearch} encontradas en total, limitado a primeras {properties.length} por anti-scraping)
                    </span>
                  )}
                </p>
              </div>
              <div className="flex items-center gap-2">
                {polygon && outsideZoneCount > 0 && (
                  <Button onClick={() => setShowOutsideZone(prev => !prev)} variant="ghost">
                    {showOutsideZone
                      ? "Ocultar fuera de zona"
                      : `Mostrar ${outsideZoneCount} fuera de zona`}
                  </Button>
                )}
                {completedInZone.length > 0 && (
                  <Button onClick={handleExportCSV} variant="outline">
                    <Download className="mr-2 h-4 w-4" />
                    Exportar CSV
                  </Button>
                )}
              </div>
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
                  {visibleProperties.map((prop) => (
                    <tr
                      key={prop.url}
                      className={
                        prop.status === 'scraping'
                          ? "bg-blue-50 dark:bg-blue-950/30"
                          : prop.status === 'error'
                            ? "bg-red-50 dark:bg-red-950/30"
                            : prop.status === 'completed' && !isInZone(prop)
                              ? "opacity-50"
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
                        {prop.status === 'completed' && isInZone(prop) && (
                          <span className="text-green-600">✓</span>
                        )}
                        {prop.status === 'completed' && !isInZone(prop) && (
                          <span
                            className="text-muted-foreground"
                            title={prop.latitud == null ? "Sin ubicación en el aviso" : "Fuera de la zona dibujada"}
                          >
                            <MapPin className="h-4 w-4" />
                          </span>
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
                            className="w-32 h-24 object-cover rounded"
                            loading="lazy"
                          />
                        ) : prop.status === 'completed' ? (
                          <div className="w-32 h-24 bg-muted rounded flex items-center justify-center text-xs text-muted-foreground">
                            Sin foto
                          </div>
                        ) : (
                          <div className="w-32 h-24 bg-muted/50 rounded" />
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

export default function ExtractSearchPage() {
  return (
    <Suspense
      fallback={(
        <div className="flex min-h-screen items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin" />
        </div>
      )}
    >
      <ExtractSearchContent />
    </Suspense>
  );
}
