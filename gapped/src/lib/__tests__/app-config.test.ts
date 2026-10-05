/**
 * What the App Store build declares about itself — app.json, the background
 * modes plugin, the export options — and the launch rules for the screens that
 * link out of the app.
 *
 * Each of these is a line App Review or the App Privacy answers hold the app
 * to, and each lives in a file nobody reruns by hand: the purpose strings a
 * person reads before granting location, the background modes Info.plist
 * claims, the data types the privacy manifest says are collected. The
 * introspected Info.plist (npx expo config --type introspect) was checked by
 * hand when this was written; these pin its inputs so it stays that way.
 */

import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.join(__dirname, '../../..');
const read = (rel: string) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

type Plugin = string | [string, Record<string, unknown>];
const expo = JSON.parse(read('app.json')).expo as {
  version: string;
  ios: {
    buildNumber: string;
    infoPlist: Record<string, unknown>;
    privacyManifests: {
      NSPrivacyTracking: boolean;
      NSPrivacyCollectedDataTypes: {
        NSPrivacyCollectedDataType: string;
        NSPrivacyCollectedDataTypeLinked: boolean;
        NSPrivacyCollectedDataTypeTracking: boolean;
        NSPrivacyCollectedDataTypePurposes: string[];
      }[];
    };
  };
  plugins: Plugin[];
};

const pluginName = (p: Plugin) => (typeof p === 'string' ? p : p[0]);
const pluginOptions = (name: string) => {
  const p = expo.plugins.find((x) => pluginName(x) === name);
  return p && typeof p !== 'string' ? p[1] : undefined;
};

describe('version', () => {
  test('1.0.0, build 5', () => {
    expect(expo.version).toBe('1.0.0');
    expect(expo.ios.buildNumber).toBe('5');
  });
});

describe('background modes', () => {
  test('Info.plist asks for location only', () => {
    expect(expo.ios.infoPlist.UIBackgroundModes).toEqual(['location']);
  });

  test("the plugin that strips task-manager's fetch is applied, first", () => {
    // First, so that a plugin listed later (which runs earlier) cannot add
    // the mode back after it — see the plugin's header.
    expect(pluginName(expo.plugins[0])).toBe('./plugins/withLocationOnlyBackgroundModes');
  });

  test('the plugin keeps location and drops fetch, and nothing else', () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports -- a CommonJS config plugin
    const { locationOnlyBackgroundModes } = require(
      path.join(ROOT, 'plugins/withLocationOnlyBackgroundModes'),
    ) as { locationOnlyBackgroundModes: (m: unknown) => string[] };
    expect(locationOnlyBackgroundModes(['location', 'fetch'])).toEqual(['location']);
    expect(locationOnlyBackgroundModes(['fetch'])).toEqual(['location']);
    expect(locationOnlyBackgroundModes(undefined)).toEqual(['location']);
    expect(locationOnlyBackgroundModes(['location', 'location'])).toEqual(['location']);
    // Another mode is someone's feature; it is left for review, not removed.
    expect(locationOnlyBackgroundModes(['location', 'remote-notification', 'fetch'])).toEqual([
      'location',
      'remote-notification',
    ]);
  });
});

describe('purpose strings', () => {
  const location = pluginOptions('expo-location') ?? {};

  test('live in the expo-location plugin only, which overrides Info.plist anyway', () => {
    for (const key of [
      'NSLocationWhenInUseUsageDescription',
      'NSLocationAlwaysAndWhenInUseUsageDescription',
      'NSLocationAlwaysUsageDescription',
      'NSMotionUsageDescription',
    ]) {
      expect(expo.ios.infoPlist[key]).toBeUndefined();
    }
  });

  test('When In Use says drives are uploaded and ranked publicly, and routes are not shown', () => {
    expect(location.locationWhenInUsePermission).toBe(
      'Gapped records your drives from GPS: route, speed and distance. Each drive is uploaded, verified and its results appear on public leaderboards under your username. Your route is never shown to other drivers.',
    );
  });

  test('both Always strings say recording happens only during a drive', () => {
    const always =
      'Always access lets a drive keep recording when the screen is locked or the app is in the background. Gapped records location only during a drive, never continuously.';
    expect(location.locationAlwaysAndWhenInUsePermission).toBe(always);
    expect(location.locationAlwaysPermission).toBe(always);
  });

  test('Motion names both sensors and why', () => {
    const motion = String(location.motionUsagePermission);
    expect(motion).toMatch(/motion/i);
    expect(motion).toMatch(/barometric pressure/i);
    expect(motion).toMatch(/real/);
  });

  test('the photo library string is kept', () => {
    expect(pluginOptions('expo-image-picker')?.photosPermission).toBe(
      'Gapped uses your photo library so you can pick a picture of your car.',
    );
  });
});

describe('crash reporting', () => {
  test("Sentry's build plugin is not applied: no DSN ships, so nothing uploads source maps or symbols to it", () => {
    // The plugin adds a sentry-cli step to the release bundling phase, which
    // fails an archive that has no SENTRY_AUTH_TOKEN — for a reporter the App
    // Store build never starts (src/lib/observability.ts). Re-add it together
    // with a DSN and the privacy changes that needs.
    expect(expo.plugins.map(pluginName)).not.toContain('@sentry/react-native/expo');
  });
});

describe('backup', () => {
  test('AsyncStorage (and with it the anonymous session) is included in iCloud backups', () => {
    // false = not excluded. The default excludes it, so a phone restored from
    // a backup would come back with no session — a new anonymous account, and
    // the old one's drives and name stranded on the server.
    expect(expo.ios.infoPlist.RCTAsyncStorageExcludeFromBackup).toBe(false);
  });
});

describe('privacy manifest', () => {
  const types = expo.ios.privacyManifests.NSPrivacyCollectedDataTypes;
  type CollectedType = (typeof types)[number];
  const byType = (a: CollectedType, b: CollectedType) =>
    a.NSPrivacyCollectedDataType.localeCompare(b.NSPrivacyCollectedDataType);

  /**
   * The JSON block under "The privacy manifest must say the same" in the App
   * Privacy answer sheet — the answers App Store Connect is given. The manifest
   * and those answers are one claim made twice, so they are compared whole
   * rather than each against a list kept here.
   */
  function answerSheetManifest(): CollectedType[] {
    const sheet = read('docs/APP_PRIVACY_LABELS.md');
    const section = sheet.slice(sheet.indexOf('## The privacy manifest must say the same'));
    const block = section.match(/```json\n([\s\S]*?)```/);
    if (!block) throw new Error('no JSON block in the answer sheet');
    return JSON.parse(block[1]) as CollectedType[];
  }

  test('declares exactly what the App Privacy answer sheet declares', () => {
    expect([...types].sort(byType)).toEqual(answerSheetManifest().sort(byType));
  });

  test('declares nothing a crash reporter or analytics SDK would collect', () => {
    // Neither runs in the App Store build (src/lib/observability.ts).
    const declared = types.map((t) => t.NSPrivacyCollectedDataType);
    for (const absent of [
      'NSPrivacyCollectedDataTypeCrashData',
      'NSPrivacyCollectedDataTypePerformanceData',
      'NSPrivacyCollectedDataTypeOtherDiagnosticData',
      'NSPrivacyCollectedDataTypeProductInteraction',
    ]) {
      expect(declared).not.toContain(absent);
    }
  });

  test('all linked to the account, none used for tracking, every one for app functionality', () => {
    expect(expo.ios.privacyManifests.NSPrivacyTracking).toBe(false);
    for (const t of types) {
      expect(t.NSPrivacyCollectedDataTypeLinked).toBe(true);
      expect(t.NSPrivacyCollectedDataTypeTracking).toBe(false);
      expect(t.NSPrivacyCollectedDataTypePurposes).toContain(
        'NSPrivacyCollectedDataTypePurposeAppFunctionality',
      );
    }
  });
});

describe('router', () => {
  test('the generated sitemap route is off', () => {
    expect(pluginOptions('expo-router')).toEqual({ sitemap: false });
  });

  test('an unknown path redirects to the start rather than a developer page', () => {
    const notFound = read('app/+not-found.tsx');
    expect(notFound).toContain('<Redirect href="/" />');
  });

  test('the moderation screens are behind the onboarded guard', () => {
    const layout = read('app/_layout.tsx');
    const guarded = layout.slice(
      layout.indexOf('<Stack.Protected guard={onboarded}>'),
      layout.indexOf('</Stack.Protected>'),
    );
    expect(guarded).toContain('<Stack.Screen name="hidden-drivers" />');
    expect(guarded).toContain('<Stack.Screen name="edit-username" />');
    expect(layout).toContain('export function ErrorBoundary');
  });
});

describe('export options', () => {
  const plist = read('build/ExportOptions.plist');
  const value = (key: string) =>
    plist.match(new RegExp(`<key>${key}</key>\\s*<(?:string>([^<]*)</string|(true|false)/)>`));

  test.each([
    ['method', 'app-store-connect'],
    ['destination', 'upload'],
    ['teamID', 'X3YGYXTB3F'],
    ['signingStyle', 'automatic'],
  ])('%s is %s', (key, expected) => {
    expect(value(key)?.[1]).toBe(expected);
  });

  test('symbols upload, and Xcode leaves the version and build number alone', () => {
    expect(value('uploadSymbols')?.[2]).toBe('true');
    expect(value('manageAppVersionAndBuildNumber')?.[2]).toBe('false');
  });

  test('is tracked even though build/ is ignored', () => {
    const ignore = read('.gitignore');
    expect(ignore).toContain('/build/*');
    expect(ignore).toContain('!/build/ExportOptions.plist');
  });
});

describe('links out of the app', () => {
  // The screens this workstream owns. Every web page is a src/config/links.ts
  // URL; the contact address is not settled, so none may appear in the app.
  const files = [
    'app/settings.tsx',
    'app/drive/[id].tsx',
    'app/_layout.tsx',
    'app/+not-found.tsx',
    'src/components/UpdateRequired.tsx',
    'src/components/ErrorFallback.tsx',
  ];

  test.each(files)('%s has no email address, mailto or gapped.app link', (file) => {
    const src = read(file);
    expect(src).not.toMatch(/mailto:/);
    expect(src).not.toMatch(/gapped\.app/);
    expect(src).not.toMatch(/[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+\.[A-Za-z]{2,}/);
  });

  test('Settings opens each page from links.ts', () => {
    const settings = read('app/settings.tsx');
    for (const name of ['PRIVACY_URL', 'TERMS_URL', 'SUPPORT_URL', 'ACKNOWLEDGEMENTS_URL']) {
      expect(settings).toContain(`openURL(${name})`);
    }
  });

  test('nothing in the app names an email address, a mailto or gapped.app', () => {
    // Every source file the app is built from, not only the screens above:
    // the contact address is not settled, and gapped.app is a locked
    // WordPress. Tests are left out; they name these to refuse them.
    const sources: string[] = [];
    const walk = (dir: string) => {
      for (const entry of fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true })) {
        const rel = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          if (entry.name !== '__tests__') walk(rel);
        } else if (/\.(tsx?|js|json)$/.test(entry.name)) {
          sources.push(rel);
        }
      }
    };
    walk('app');
    walk('src');
    expect(sources.length).toBeGreaterThan(100);
    const offenders = sources.filter((rel) => {
      // Comments may say why these are absent; code and copy may not hold them.
      const code = read(rel)
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/(^|[^:])\/\/.*$/gm, '$1');
      return (
        /mailto:/.test(code) ||
        /gapped\.app/.test(code) ||
        /[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+\.[A-Za-z]{2,}/.test(code)
      );
    });
    expect(offenders).toEqual([]);
  });

  test('Update Required sends people to the App Store, not TestFlight', () => {
    const screen = read('src/components/UpdateRequired.tsx');
    expect(screen).toContain('Linking.openURL(APP_STORE_URL)');
    expect(screen).not.toMatch(/TestFlight/);
    expect(screen).not.toMatch(/TODO/);
  });
});
