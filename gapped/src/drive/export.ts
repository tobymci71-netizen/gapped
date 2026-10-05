/**
 * GPX and CSV generation — pure string builders, unit-tested. Neither
 * incumbent offers any export in any format (spec §4.7).
 *
 * Export is a Pro row of the plans matrix (PLAN_MATRIX 'export'). The lock
 * lives with the drive screen's other gates (exportView,
 * src/drive/driveAccess.ts), not here: these stay pure and ungated, so
 * whatever is allowed to export gets the same full-resolution output.
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
 * The namespace of Gapped's GPX extension (gapped:speed). An identifier, never
 * fetched, but a URL all the same: under the project's GitHub Pages site, as
 * every public address the app names is (src/config/links.ts), not gapped.app.
 */
export const GPX_NAMESPACE = 'https://tobymci71-netizen.github.io/gapped/gpx/v1';

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
     xmlns:gapped="${GPX_NAMESPACE}">
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

/**
 * The human-facing stamp for an export's file name and GPX track name, e.g.
 * `2026-10-02T2130`, in the device's LOCAL time.
 *
 * It was `toISOString()` with the `Z` sliced off, which is UTC wearing a local
 * time's clothes: the drive the app lists at 21:30 on 2 Oct in New York was
 * exported as `…10-03T0130`, a different hour and day from the one the user
 * picked. Only the label is local — every `<time>` and `time_iso` cell stays
 * UTC ISO, which is what GPX and anything parsing the CSV expect.
 */
export function exportStamp(t: number): string {
  const d = new Date(t);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}${p(d.getMinutes())}`;
}
