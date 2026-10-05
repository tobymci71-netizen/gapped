/**
 * Config plugin: Gapped declares one iOS background mode, `location`.
 *
 * expo-task-manager's own config plugin adds `fetch` to UIBackgroundModes on
 * every build that installs it, whether or not anything uses Background Fetch.
 * Gapped uses task-manager for one task, the background location stream
 * (src/drive/backgroundTask.ts), and registers no fetch task — so the binary
 * claimed a background mode it never uses, which App Review asks about
 * (Guideline 2.5.4: a background mode must serve the feature it names).
 *
 * This takes `fetch` back out and makes sure `location` is there. Any other
 * mode a future plugin adds is left alone: removing one silently would break
 * whatever needed it; src/lib/__tests__/app-config.test.ts pins the list instead.
 *
 * Order matters. Info.plist mods run newest-registered first, and the
 * auto-applied task-manager plugin is registered after everything in app.json,
 * so its mod runs before this one whatever the list order. This plugin is
 * first in app.json's list anyway, so that if expo-task-manager is ever listed
 * there explicitly, it can only be listed after this — and still run before.
 *
 * Check the result without a prebuild:
 *
 *   npx expo config --type introspect --json   (ios.infoPlist.UIBackgroundModes)
 */

const { withInfoPlist } = require('expo/config-plugins');

/** Modes Gapped never uses but a dependency's plugin declares anyway. */
const UNUSED_MODES = ['fetch'];

/**
 * The background modes to ship, from the ones the plugins produced. Pure, so
 * the test can hold it to `location` without running a prebuild.
 *
 * @param {unknown} modes UIBackgroundModes as the plugins left it
 * @returns {string[]}
 */
function locationOnlyBackgroundModes(modes) {
  const list = Array.isArray(modes) ? modes.filter((m) => typeof m === 'string') : [];
  const kept = list.filter((m) => !UNUSED_MODES.includes(m));
  if (!kept.includes('location')) kept.unshift('location');
  return [...new Set(kept)];
}

/** @type {import('expo/config-plugins').ConfigPlugin} */
const withLocationOnlyBackgroundModes = (config) =>
  withInfoPlist(config, (cfg) => {
    cfg.modResults.UIBackgroundModes = locationOnlyBackgroundModes(cfg.modResults.UIBackgroundModes);
    return cfg;
  });

module.exports = withLocationOnlyBackgroundModes;
module.exports.locationOnlyBackgroundModes = locationOnlyBackgroundModes;
