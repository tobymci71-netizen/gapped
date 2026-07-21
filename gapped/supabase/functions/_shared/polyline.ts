// AUTO-GENERATED from src/ by scripts/build-edge-shared.mjs — do not edit here.
/**
 * Google encoded-polyline algorithm (precision 5). Pure, dependency-free.
 * Used for share cards and the `route` column payload.
 */

import { Fix } from './types.ts';

function encodeValue(value: number, out: string[]): void {
  let v = value < 0 ? ~(value << 1) : value << 1;
  while (v >= 0x20) {
    out.push(String.fromCharCode((0x20 | (v & 0x1f)) + 63));
    v >>= 5;
  }
  out.push(String.fromCharCode(v + 63));
}

export function encodePolyline(points: { lat: number; lon: number }[]): string {
  const out: string[] = [];
  let prevLat = 0;
  let prevLon = 0;
  for (const p of points) {
    const lat = Math.round(p.lat * 1e5);
    const lon = Math.round(p.lon * 1e5);
    encodeValue(lat - prevLat, out);
    encodeValue(lon - prevLon, out);
    prevLat = lat;
    prevLon = lon;
  }
  return out.join('');
}

export function decodePolyline(encoded: string): { lat: number; lon: number }[] {
  const points: { lat: number; lon: number }[] = [];
  let index = 0;
  let lat = 0;
  let lon = 0;
  while (index < encoded.length) {
    for (const target of ['lat', 'lon'] as const) {
      let shift = 0;
      let result = 0;
      let byte: number;
      do {
        byte = encoded.charCodeAt(index++) - 63;
        result |= (byte & 0x1f) << shift;
        shift += 5;
      } while (byte >= 0x20);
      const delta = result & 1 ? ~(result >> 1) : result >> 1;
      if (target === 'lat') lat += delta;
      else lon += delta;
    }
    points.push({ lat: lat / 1e5, lon: lon / 1e5 });
  }
  return points;
}

export function routePolyline(fixes: Fix[]): string {
  return encodePolyline(fixes.map((f) => ({ lat: f.lat, lon: f.lon })));
}
