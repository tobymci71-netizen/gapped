import { readLocationAccess } from '../permission';

type Response = Parameters<typeof readLocationAccess>[0];

/** The native shapes, as expo-location 57 reports them on each platform. */
function ios(status: string, canAskAgain: boolean, accuracy: 'full' | 'reduced'): Response {
  return { status, canAskAgain, ios: { scope: 'whenInUse', accuracy } } as unknown as Response;
}
function android(
  status: string,
  canAskAgain: boolean,
  accuracy: 'fine' | 'coarse' | 'none',
): Response {
  return { status, canAskAgain, android: { accuracy } } as unknown as Response;
}

describe('readLocationAccess', () => {
  test('granted with full accuracy is a working permission', () => {
    expect(readLocationAccess(ios('granted', true, 'full'))).toEqual({
      permission: 'granted',
      canAskAgain: true,
      precise: true,
    });
    expect(readLocationAccess(android('granted', true, 'fine')).precise).toBe(true);
  });

  test('iOS Precise Location off is granted but not precise', () => {
    const a = readLocationAccess(ios('granted', true, 'reduced'));
    expect(a.permission).toBe('granted');
    expect(a.precise).toBe(false);
  });

  test('Android approximate (COARSE only) is granted but not precise', () => {
    const a = readLocationAccess(android('granted', true, 'coarse'));
    expect(a.permission).toBe('granted');
    expect(a.precise).toBe(false);
  });

  test('a denial stays a denial — it was mapped to "unknown" at cold start', () => {
    expect(readLocationAccess(ios('denied', false, 'full'))).toEqual({
      permission: 'denied',
      canAskAgain: false,
      precise: true,
    });
  });

  test('canAskAgain is carried through, so a first Android denial can still prompt', () => {
    const a = readLocationAccess(android('denied', true, 'none'));
    expect(a.permission).toBe('denied');
    expect(a.canAskAgain).toBe(true);
  });

  test('never asked is unknown', () => {
    expect(readLocationAccess(ios('undetermined', true, 'full')).permission).toBe('unknown');
  });

  test('no platform details reads as precise', () => {
    const bare = { status: 'granted', canAskAgain: true } as unknown as Response;
    expect(readLocationAccess(bare).precise).toBe(true);
  });
});
