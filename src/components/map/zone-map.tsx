"use client";

import { useEffect, useRef, useState } from "react";
import L from "leaflet";
import "@geoman-io/leaflet-geoman-free";
import "leaflet/dist/leaflet.css";
import "@geoman-io/leaflet-geoman-free/dist/leaflet-geoman.css";
import { Pencil, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { GeoPolygon } from "@/lib/geo";

export interface ZoneMapMarker {
  lat: number;
  lng: number;
  title: string;
  subtitle?: string;
  url: string;
}

interface ZoneMapProps {
  polygon: GeoPolygon | null;
  onPolygonChange: (polygon: GeoPolygon | null) => void;
  markers?: ZoneMapMarker[];
  disabled?: boolean;
}

// Buenos Aires (CABA)
const DEFAULT_CENTER: L.LatLngTuple = [-34.6037, -58.4416];
const DEFAULT_ZOOM = 12;

function layerToPolygon(layer: L.Polygon): GeoPolygon {
  const rings = layer.getLatLngs() as L.LatLng[][];
  return (rings[0] ?? []).map(({ lat, lng }) => ({ lat, lng }));
}

function samePolygon(a: GeoPolygon | null, b: GeoPolygon | null) {
  return JSON.stringify(a) === JSON.stringify(b);
}

function buildPopup(marker: ZoneMapMarker) {
  const container = document.createElement("div");

  const title = document.createElement("div");
  title.style.fontWeight = "600";
  title.textContent = marker.title;
  container.appendChild(title);

  if (marker.subtitle) {
    const subtitle = document.createElement("div");
    subtitle.textContent = marker.subtitle;
    container.appendChild(subtitle);
  }

  const link = document.createElement("a");
  link.href = marker.url;
  link.target = "_blank";
  link.rel = "noopener noreferrer";
  link.textContent = "Ver en Zonaprop";
  container.appendChild(link);

  return container;
}

export default function ZoneMap({ polygon, onPolygonChange, markers = [], disabled = false }: ZoneMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const zoneLayerRef = useRef<L.Polygon | null>(null);
  const markersLayerRef = useRef<L.LayerGroup | null>(null);
  // Last polygon we emitted or rendered, to tell external changes apart from our own
  const currentPolygonRef = useRef<GeoPolygon | null>(polygon);
  const onPolygonChangeRef = useRef(onPolygonChange);
  const [isDrawing, setIsDrawing] = useState(false);

  useEffect(() => {
    onPolygonChangeRef.current = onPolygonChange;
  }, [onPolygonChange]);

  const setZoneLayer = (layer: L.Polygon | null) => {
    const map = mapRef.current;
    if (!map) return;

    zoneLayerRef.current?.remove();
    zoneLayerRef.current = layer;
    if (!layer) return;

    layer.addTo(map);
    layer.pm.enable({ allowSelfIntersection: false });
    layer.on("pm:edit", () => {
      const updated = layerToPolygon(layer);
      currentPolygonRef.current = updated;
      onPolygonChangeRef.current(updated);
    });
  };

  // Create the map once
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const map = L.map(containerRef.current).setView(DEFAULT_CENTER, DEFAULT_ZOOM);
    mapRef.current = map;

    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
    }).addTo(map);

    markersLayerRef.current = L.layerGroup().addTo(map);

    map.pm.setLang("es");
    map.pm.setGlobalOptions({ allowSelfIntersection: false });

    map.on("pm:create", (event) => {
      const layer = event.layer as L.Polygon;
      // The drawn layer is added by geoman; re-add it through setZoneLayer to wire edit events
      layer.remove();
      setZoneLayer(layer);
      const created = layerToPolygon(layer);
      currentPolygonRef.current = created;
      onPolygonChangeRef.current(created);
    });

    map.on("pm:drawstart", () => setIsDrawing(true));
    map.on("pm:drawend", () => setIsDrawing(false));

    if (currentPolygonRef.current) {
      const layer = L.polygon(currentPolygonRef.current.map(({ lat, lng }) => [lat, lng] as L.LatLngTuple));
      setZoneLayer(layer);
      map.fitBounds(layer.getBounds(), { padding: [20, 20] });
    }

    return () => {
      map.remove();
      mapRef.current = null;
      zoneLayerRef.current = null;
      markersLayerRef.current = null;
    };
  }, []);

  // Sync polygons set from outside (e.g. loaded from a saved search or cleared)
  useEffect(() => {
    const map = mapRef.current;
    if (!map || samePolygon(polygon, currentPolygonRef.current)) return;

    currentPolygonRef.current = polygon;
    if (!polygon) {
      setZoneLayer(null);
      return;
    }

    const layer = L.polygon(polygon.map(({ lat, lng }) => [lat, lng] as L.LatLngTuple));
    setZoneLayer(layer);
    map.fitBounds(layer.getBounds(), { padding: [20, 20] });
  }, [polygon]);

  // Lock editing while a search is running
  useEffect(() => {
    const map = mapRef.current;
    const layer = zoneLayerRef.current;
    if (!map) return;

    if (disabled) {
      map.pm.disableDraw();
      layer?.pm.disable();
    } else {
      layer?.pm.enable({ allowSelfIntersection: false });
    }
  }, [disabled, polygon]);

  // Render result markers
  useEffect(() => {
    const group = markersLayerRef.current;
    if (!group) return;

    group.clearLayers();
    for (const marker of markers) {
      L.circleMarker([marker.lat, marker.lng], { radius: 7, weight: 2, fillOpacity: 0.8 })
        .bindPopup(buildPopup(marker))
        .addTo(group);
    }
  }, [markers]);

  const handleDraw = () => {
    const map = mapRef.current;
    if (!map) return;

    if (isDrawing) {
      map.pm.disableDraw();
      return;
    }

    map.pm.enableDraw("Polygon", { snappable: false });
  };

  const handleClear = () => {
    mapRef.current?.pm.disableDraw();
    setZoneLayer(null);
    currentPolygonRef.current = null;
    onPolygonChangeRef.current(null);
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="button"
          variant={isDrawing ? "secondary" : "outline"}
          size="sm"
          onClick={handleDraw}
          disabled={disabled}
        >
          {isDrawing ? <X className="mr-2 h-4 w-4" /> : <Pencil className="mr-2 h-4 w-4" />}
          {isDrawing ? "Cancelar dibujo" : polygon ? "Redibujar zona" : "Dibujar zona"}
        </Button>
        {polygon && (
          <Button type="button" variant="ghost" size="sm" onClick={handleClear} disabled={disabled}>
            <Trash2 className="mr-2 h-4 w-4" />
            Borrar zona
          </Button>
        )}
        <p className="text-sm text-muted-foreground">
          {isDrawing
            ? "Hacé clic en el mapa para marcar cada vértice y cerrá la zona haciendo clic en el primer punto."
            : polygon
              ? "Arrastrá los vértices para ajustar la zona."
              : "Sin zona dibujada: se usan solo los filtros de la URL de Zonaprop."}
        </p>
      </div>
      {/* isolate keeps Leaflet's high z-indexes from covering dialogs and menus */}
      <div ref={containerRef} className="isolate h-[420px] w-full rounded-lg border" />
    </div>
  );
}
