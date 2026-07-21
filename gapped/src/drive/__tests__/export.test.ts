import { CSV_HEADER, toCsv, toGpx } from '../export';
import { cleanCruise } from './fixtures';

describe('GPX export', () => {
  const gpx = toGpx(cleanCruise(), 'Morning blast <&> "test"');

  test('valid envelope and namespaces', () => {
    expect(gpx).toContain('<?xml version="1.0" encoding="UTF-8"?>');
    expect(gpx).toContain('xmlns="http://www.topografix.com/GPX/1/1"');
    expect(gpx).toContain('creator="Gapped"');
  });

  test('name is XML-escaped', () => {
    expect(gpx).toContain('Morning blast &lt;&amp;&gt; &quot;test&quot;');
  });

  test('one trkpt per fix, with time and speed', () => {
    const count = (gpx.match(/<trkpt /g) ?? []).length;
    expect(count).toBe(cleanCruise().length);
    expect(gpx).toContain('<time>');
    expect(gpx).toContain('<gapped:speed>');
  });

  test('altitude omitted when absent, not zero-filled', () => {
    const noAlt = cleanCruise().map((f) => ({ ...f, altitudeM: null }));
    expect(toGpx(noAlt, 't')).not.toContain('<ele>');
  });
});

describe('CSV export', () => {
  test('header plus one row per fix', () => {
    const fixes = cleanCruise();
    const csv = toCsv(fixes);
    const lines = csv.trim().split('\n');
    expect(lines[0]).toBe(CSV_HEADER);
    expect(lines.length).toBe(fixes.length + 1);
  });

  test('missing values are empty cells, never zeros', () => {
    const fixes = cleanCruise().map((f) => ({ ...f, speedMs: null, pressureHpa: null }));
    const csv = toCsv(fixes);
    const firstRow = csv.split('\n')[1].split(',');
    expect(firstRow[3]).toBe(''); // speed_ms
    expect(firstRow[10]).toBe(''); // pressure_hpa
  });

  test('column count matches header on every row', () => {
    const cols = CSV_HEADER.split(',').length;
    const csv = toCsv(cleanCruise());
    for (const line of csv.trim().split('\n')) {
      expect(line.split(',').length).toBe(cols);
    }
  });
});
