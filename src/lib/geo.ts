export interface GeoPoint {
  lat: number;
  lng: number;
}

/** Polygon drawn on the map, as an ordered list of vertices (not closed). */
export type GeoPolygon = GeoPoint[];

const MAX_POLYGON_POINTS = 500;

/**
 * Validate and normalize an untrusted polygon (e.g. from a request body).
 * Returns null if it's not a usable polygon.
 */
export function parsePolygon(value: unknown): GeoPolygon | null {
  if (!Array.isArray(value) || value.length < 3 || value.length > MAX_POLYGON_POINTS) {
    return null;
  }

  const points: GeoPolygon = [];
  for (const point of value) {
    if (!point || typeof point !== "object") return null;
    const { lat, lng } = point as Record<string, unknown>;
    if (
      typeof lat !== "number" ||
      typeof lng !== "number" ||
      !Number.isFinite(lat) ||
      !Number.isFinite(lng) ||
      Math.abs(lat) > 90 ||
      Math.abs(lng) > 180
    ) {
      return null;
    }
    points.push({ lat, lng });
  }

  return points;
}

/**
 * Ray casting point-in-polygon test. Treats lng as x and lat as y, which is
 * accurate enough for city-sized areas.
 */
export function isPointInPolygon(point: GeoPoint, polygon: GeoPolygon): boolean {
  let inside = false;

  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const xi = polygon[i].lng;
    const yi = polygon[i].lat;
    const xj = polygon[j].lng;
    const yj = polygon[j].lat;

    const intersects =
      yi > point.lat !== yj > point.lat &&
      point.lng < ((xj - xi) * (point.lat - yi)) / (yj - yi) + xi;

    if (intersects) inside = !inside;
  }

  return inside;
}
