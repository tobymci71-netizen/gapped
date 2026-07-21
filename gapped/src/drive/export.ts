/**
 * GPX and CSV generation — pure string builders, unit-tested. Neither
 * incumbent offers any export in any format; this is the cheapest trust
 * purchase in the category (spec §4.7). Users can always take their data out.
 */

import { Fix } from './types';

function isoTime(t: number): string {
  return new Date(t).toISOString();
}

function xmlEscape(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * GPX 1.1 track. Includes speed via the GPX extensions namespace; altitude
 * only when present — absent data is omitted, never zero-filled.
 */
export function toGpx(fixes: Fix[], name: string): string {
  const points = fixes
    .map((f) => {
      const ele = f.altitudeM != null ? `\n        <ele>${f.altitudeM.toFixed(1)}</ele>` : '';
      const speed =
        f.speedMs != null
          ? `\n        <extensions><gapped:speed>${f.speedMs.toFixed(2)}</gapped:speed></extensions>`
          : '';
      return `      <trkpt lat="${f.lat.toFixed(7)}" lon="${f.lon.toFixed(7)}">${ele}
        <time>${isoTime(f.t)}</time>${speed}
      </trkpt>`;
    })
    .join('\n');

  return `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="Gapped"
     xmlns="http://www.topografix.com/GPX/1/1"
     xmlns:gapped="https://gapped.app/gpx/v1">
  <trk>
    <name>${xmlEscape(name)}</name>
    <trkseg>
${points}
    </trkseg>
  </trk>
</gpx>
`;
}

export const CSV_HEADER =
  'time_iso,lat,lon,speed_ms,accuracy_m,altitude_m,heading,accel_x_g,accel_y_g,accel_z_g,pressure_hpa';

export function toCsv(fixes: Fix[]): string {
  const rows = fixes.map((f) =>
    [
      isoTime(f.t),
      f.lat.toFixed(7),
      f.lon.toFixed(7),
      f.speedMs?.toFixed(3) ?? '',
      f.accuracyM?.toFixed(1) ?? '',
      f.altitudeM?.toFixed(1) ?? '',
      f.heading?.toFixed(1) ?? '',
      f.accelX?.toFixed(4) ?? '',
      f.accelY?.toFixed(4) ?? '',
      f.accelZ?.toFixed(4) ?? '',
      f.pressureHpa?.toFixed(2) ?? '',
    ].join(','),
  );
  return [CSV_HEADER, ...rows].join('\n') + '\n';
}
