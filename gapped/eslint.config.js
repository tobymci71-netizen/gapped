// https://docs.expo.dev/guides/using-eslint/
const { defineConfig } = require('eslint/config');
const expoConfig = require('eslint-config-expo/flat');

module.exports = defineConfig([
  expoConfig,
  {
    ignores: ['dist/*', '.expo/*', 'supabase/functions/node_modules/*'],
  },
  {
    rules: {
      /**
       * React Compiler rules, downgraded to warnings rather than switched off.
       *
       * This codebase predates the compiler, and the two rules below fire on
       * patterns that are correct here:
       *
       *  - `set-state-in-effect` flags seeding a clock before its interval
       *    starts, clearing the live route when location permission is lost,
       *    and reloading the drive list on focus. Each is a deliberate,
       *    commented reset; restructuring them would churn the recording hot
       *    path for no behavioural gain.
       *  - `purity`/`immutability` cannot model Reanimated worklets, so every
       *    `sharedValue.value = x` inside a gesture callback reads as mutating
       *    a frozen value. That assignment *is* the Reanimated API.
       *
       * Warnings, not off: real instances of both are worth seeing in new
       * code. An always-red lint is one nobody reads, which costs more than
       * the rules are worth.
       */
      'react-hooks/set-state-in-effect': 'warn',
      'react-hooks/immutability': 'warn',
      'react-hooks/purity': 'warn',
    },
  },
  {
    // Optional native modules are resolved with require() on purpose: a static
    // import makes a missing module a bundle-time crash instead of a graceful
    // degrade. See the comments at each call site.
    files: ['src/components/DriveMap.tsx', 'src/lib/attestation.ts'],
    rules: { '@typescript-eslint/no-require-imports': 'off' },
  },
]);
