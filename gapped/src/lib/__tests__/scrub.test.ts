/**
 * The Sentry scrubber.
 *
 * This app records precise background location, and Sentry's default is to
 * attach every network URL, console line and navigation as a breadcrumb. The
 * realistic leak is not someone deciding to send coordinates — it is a
 * PostgREST URL with `?lat=eq.49.4657` riding along in a crash report nobody
 * inspected.
 *
 * So these tests are written as payloads that actually occur in this codebase,
 * not as abstract shapes.
 */

import { scrub } from '../scrub';

const s = (v: unknown) => JSON.stringify(scrub(v));

describe('coordinates never leave the device', () => {
  test('a Fix loses its position but keeps its diagnostics', () => {
    const fix = {
      t: 1_700_000_000_000,
      lat: 49.4657,
      lon: -2.5853,
      speedMs: 31.2,
      accuracyM: 4.1,
      isMock: false,
    };
    const out = scrub(fix) as Record<string, unknown>;

    expect(out.lat).toBe('[redacted]');
    expect(out.lon).toBe('[redacted]');
    // The useful part survives — a scrubber that redacts everything gets
    // switched off by the first person debugging a real crash.
    expect(out.speedMs).toBe(31.2);
    expect(out.accuracyM).toBe(4.1);
    expect(out.isMock).toBe(false);
  });

  test('nested contexts are reached, not just top-level keys', () => {
    const event = {
      contexts: { drive: { coords: { latitude: 49.4657, longitude: -2.5853 } } },
      extra: { lastFix: { lat: 49.4, lon: -2.5 } },
    };
    expect(s(event)).not.toContain('49.4');
    expect(s(event)).not.toContain('-2.5');
  });

  test('a PostgREST breadcrumb URL is defused', () => {
    const crumb = {
      category: 'fetch',
      data: {
        url: 'https://x.supabase.co/rest/v1/drives?lat=eq.49.46570&lon=eq.-2.58530',
        method: 'GET',
      },
    };
    // `url` is not in REDACT_KEYS — it is caught by the free-text pass, which
    // is why that pass exists at all.
    expect(s(crumb)).not.toContain('49.46570');
    expect(s(crumb)).toContain('fetch');
  });

  test('a bare coordinate pair inside a message is caught', () => {
    const out = scrub({ message: 'failed to snap 49.46570, -2.58530 to road' }) as {
      message: string;
    };
    expect(out.message).not.toContain('49.46570');
    expect(out.message).toContain('failed to snap');
  });

  test('WKT route geometry does not survive', () => {
    const out = scrub({
      route_full: 'LINESTRING(-2.5853 49.4657, -2.5860 49.4661)',
    }) as Record<string, unknown>;
    expect(out.route_full).toBe('[redacted]');
  });
});

describe('credentials and identifiers never leave the device', () => {
  test('tokens, keys and auth headers are removed', () => {
    const out = scrub({
      headers: { Authorization: 'Bearer eyJhbGciOi', apikey: 'sb_secret_123' },
      access_token: 'eyJhbGciOi',
    }) as Record<string, Record<string, unknown>>;

    expect(s(out)).not.toContain('eyJhbGciOi');
    expect(s(out)).not.toContain('sb_secret_123');
  });

  test('account identifiers are removed', () => {
    const out = scrub({
      profile_id: 'aaaaaaaa-1111-2222-3333-444444444444',
      email: 'someone@example.com',
      username: 'tobym',
    }) as Record<string, unknown>;

    expect(out.profile_id).toBe('[redacted]');
    expect(out.email).toBe('[redacted]');
    // Username is public on the boards, so it is deliberately NOT redacted —
    // it is the one identifier that makes a crash report actionable.
    expect(out.username).toBe('tobym');
  });
});

describe('the scrubber cannot make a crash worse', () => {
  test('deeply nested payloads terminate rather than recursing forever', () => {
    let deep: Record<string, unknown> = { lat: 1.23456 };
    for (let i = 0; i < 40; i++) deep = { nested: deep };
    expect(() => scrub(deep)).not.toThrow();
    expect(s(deep)).not.toContain('1.23456');
  });

  test('primitives, null and undefined pass through unharmed', () => {
    expect(scrub(null)).toBeNull();
    expect(scrub(undefined)).toBeUndefined();
    expect(scrub(42)).toBe(42);
    expect(scrub(true)).toBe(true);
  });

  test('arrays are walked', () => {
    const out = scrub([{ lat: 49.4657 }, { speedMs: 30 }]) as Record<string, unknown>[];
    expect(out[0].lat).toBe('[redacted]');
    expect(out[1].speedMs).toBe(30);
  });
});
