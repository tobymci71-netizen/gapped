/**
 * The kill switch is only as good as the build number it compares.
 *
 * It used to read `Constants.expoConfig`, which is app.json embedded at build
 * time. Under remote versioning EAS never writes the build number there, so
 * every EAS build reported null and the gate never consulted the server. These
 * pin the replacement: the native number on iOS, and null — fail open —
 * whenever the number cannot be trusted.
 */

import { currentBuildNumber, resolveBuildNumber } from '../version-gate';

// What an EAS release build reports: CFBundleVersion natively, and an embedded
// app.json with no buildNumber in it.
jest.mock('expo-constants', () => ({
  __esModule: true,
  default: { platform: { ios: { buildNumber: '42' } }, expoConfig: { ios: {}, android: {} } },
}));

const release = { platform: 'ios' as const, isDev: false };

describe('currentBuildNumber', () => {
  const g = globalThis as unknown as { __DEV__: boolean };
  const wasDev = g.__DEV__;
  afterEach(() => {
    g.__DEV__ = wasDev;
  });

  test('a release build reads the native number, not the embedded app.json', () => {
    g.__DEV__ = false;
    expect(currentBuildNumber('ios')).toBe(42);
  });

  test('a release Android build stands down rather than borrow the iOS number', () => {
    g.__DEV__ = false;
    expect(currentBuildNumber('android')).toBeNull();
  });
});

describe('resolveBuildNumber', () => {
  test('reads the native iOS build number (CFBundleVersion)', () => {
    expect(resolveBuildNumber({ ...release, iosBuildNumber: '42' })).toBe(42);
  });

  test('Expo Go has no native build number: fail open', () => {
    expect(resolveBuildNumber({ ...release, iosBuildNumber: null })).toBeNull();
    expect(resolveBuildNumber({ ...release, iosBuildNumber: undefined })).toBeNull();
  });

  test('a dev client stands down even though its plist says "1"', () => {
    expect(resolveBuildNumber({ ...release, isDev: true, iosBuildNumber: '1' })).toBeNull();
  });

  test('Android stands down rather than borrow the iOS counter', () => {
    expect(
      resolveBuildNumber({ platform: 'android', isDev: false, iosBuildNumber: '42' }),
    ).toBeNull();
  });

  test.each(['1.0.3', '12a', '', '  ', '-3', '0', '1e3'])(
    '%j is not a build number we can compare: fail open',
    (raw) => {
      expect(resolveBuildNumber({ ...release, iosBuildNumber: raw })).toBeNull();
    },
  );

  test('surrounding whitespace is tolerated', () => {
    expect(resolveBuildNumber({ ...release, iosBuildNumber: ' 17 ' })).toBe(17);
  });
});
