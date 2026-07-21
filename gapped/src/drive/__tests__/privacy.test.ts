import { sha256Hex } from '@/lib/sha256';
import {
  excludeZones,
  makePrivacyZone,
  trimDistances,
  TRIM_MAX_M,
  TRIM_MIN_M,
  trimRoute,
  trimRouteForSharing,
  ZONE_OFFSET_MAX_M,
  ZONE_OFFSET_MIN_M,
} from '../privacy';
import { decodePolyline, encodePolyline, routePolyline } from '../polyline';
import { haversineM, totalDistanceM } from '../stats';
import { traceFromSpeeds } from './fixtures';

describe('sha256 (FIPS 180-4 vectors)', () => {
  test('empty string', () => {
    expect(sha256Hex('')).toBe(
      'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
    );
  });
  test('abc', () => {
    expect(sha256Hex('abc')).toBe(
      'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
    );
  });
  test('long input (two blocks)', () => {
    expect(
      sha256Hex('abcdbcdecdefdefgefghfghighijhijkijkljklmklmnlmnomnopnopq'),
    ).toBe('248d6a61d20638b8e5c026930c3e6039a33ce45964ff2167f6ecedd419db06c1');
  });
});

describe('route trimming', () => {
  const salt = 'device-salt-1';
  const driveA = 'drive-aaaa';
  const driveB = 'drive-bbbb';

  test('trim distances land in the 1.0–1.7 mi band', () => {
    for (const id of [driveA, driveB, 'x', 'y', 'z']) {
      const { startTrimM, endTrimM } = trimDistances(salt, id);
      expect(startTrimM).toBeGreaterThanOrEqual(TRIM_MIN_M);
      expect(startTrimM).toBeLessThan(TRIM_MAX_M);
      expect(endTrimM).toBeGreaterThanOrEqual(TRIM_MIN_M);
      expect(endTrimM).toBeLessThan(TRIM_MAX_M);
    }
  });

  test('stable per drive, different across drives', () => {
    expect(trimDistances(salt, driveA)).toEqual(trimDistances(salt, driveA));
    expect(trimDistances(salt, driveA)).not.toEqual(trimDistances(salt, driveB));
    expect(trimDistances('other-salt', driveA)).not.toEqual(trimDistances(salt, driveA));
  });

  test('trims the right amount off each end of a long drive', () => {
    // 2000 s at 20 m/s = 40 km due north
    const fixes = traceFromSpeeds(Array.from({ length: 2000 }, () => 20));
    const trimmed = trimRoute(fixes, 2000, 3000);
    expect(trimmed.length).toBeGreaterThan(0);
    // first kept fix is ≥ 2000 m from the true start
    const startGap = haversineM(fixes[0].lat, fixes[0].lon, trimmed[0].lat, trimmed[0].lon);
    expect(startGap).toBeGreaterThanOrEqual(2000 - 25);
    // last kept fix is ≥ 3000 m from the true end
    const last = fixes[fixes.length - 1];
    const lastKept = trimmed[trimmed.length - 1];
    const endGap = haversineM(last.lat, last.lon, lastKept.lat, lastKept.lon);
    expect(endGap).toBeGreaterThanOrEqual(3000 - 25);
  });

  test('a short drive yields an empty shareable route — nothing leaks', () => {
    // ~1.2 km total: shorter than min trim on either end
    const fixes = traceFromSpeeds(Array.from({ length: 60 }, () => 20));
    expect(trimRouteForSharing(fixes, salt, driveA)).toEqual([]);
  });
});

describe('privacy zones', () => {
  const salt = 'device-salt-1';

  test('zone centre is offset 200–800 m from the true centre, deterministically', () => {
    const z1 = makePrivacyZone(51.5, -0.12, 300, salt, 'home');
    const z2 = makePrivacyZone(51.5, -0.12, 300, salt, 'home');
    expect(z1).toEqual(z2);
    const offset = haversineM(51.5, -0.12, z1.lat, z1.lon);
    expect(offset).toBeGreaterThanOrEqual(ZONE_OFFSET_MIN_M * 0.95);
    expect(offset).toBeLessThanOrEqual(ZONE_OFFSET_MAX_M * 1.05);
  });

  test('the widened radius still covers the true centre', () => {
    const z = makePrivacyZone(51.5, -0.12, 300, salt, 'work');
    expect(haversineM(51.5, -0.12, z.lat, z.lon)).toBeLessThanOrEqual(z.radiusM);
  });

  test('fixes inside a zone are excluded', () => {
    const fixes = traceFromSpeeds(Array.from({ length: 300 }, () => 20));
    const mid = fixes[150];
    const zone = { lat: mid.lat, lon: mid.lon, radiusM: 500 };
    const filtered = excludeZones(fixes, [zone]);
    expect(filtered.length).toBeLessThan(fixes.length);
    for (const f of filtered) {
      expect(haversineM(f.lat, f.lon, zone.lat, zone.lon)).toBeGreaterThan(500);
    }
  });
});

describe('polyline codec', () => {
  test("Google's documented example round-trips", () => {
    const pts = [
      { lat: 38.5, lon: -120.2 },
      { lat: 40.7, lon: -120.95 },
      { lat: 43.252, lon: -126.453 },
    ];
    const encoded = encodePolyline(pts);
    expect(encoded).toBe('_p~iF~ps|U_ulLnnqC_mqNvxq`@');
    const decoded = decodePolyline(encoded);
    decoded.forEach((p, i) => {
      expect(p.lat).toBeCloseTo(pts[i].lat, 5);
      expect(p.lon).toBeCloseTo(pts[i].lon, 5);
    });
  });

  test('a full trace round-trips within precision', () => {
    const fixes = traceFromSpeeds(Array.from({ length: 120 }, () => 25));
    const decoded = decodePolyline(routePolyline(fixes));
    expect(decoded.length).toBe(fixes.length);
    // 1e-5 degrees ≈ 1.1 m; check total length agrees within a few metres
    const origLen = totalDistanceM(fixes);
    let decLen = 0;
    for (let i = 1; i < decoded.length; i++) {
      decLen += haversineM(decoded[i - 1].lat, decoded[i - 1].lon, decoded[i].lat, decoded[i].lon);
    }
    expect(Math.abs(decLen - origLen)).toBeLessThan(20);
  });
});
