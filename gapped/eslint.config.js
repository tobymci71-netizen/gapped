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

      /**
       * A bare number as `fontSize` is how clipped glyphs happen.
       *
       * React Native derives line height from the font's own metrics, which are
       * cut for Latin text. Anything taller — an emoji, a flag, a stacked
       * accent — overflows the line box and loses its top. Three onboarding
       * glyphs shipped clipped for exactly this reason and were each fixed by
       * hand, one screen at a time, which fixes the screen and not the cause.
       *
       * Sizes live in theme/tokens.ts, where every entry carries a lineHeight
       * it cannot be separated from, and are spread with textStyle().
       *
       * A warning rather than an error: roughly forty existing glyph sizes
       * (chevrons, emoji, icon characters) are still literals, and turning
       * those red would make the lint output unreadable, which is how a rule
       * stops being read. It holds the line for new code today; the remaining
       * migration is tracked in the report.
       */
      'no-restricted-syntax': [
        'warn',
        {
          selector: "Property[key.name='fontSize'][value.type='Literal']",
          message:
            'Use a token: `...textStyle(type.body)` or `...textStyle(glyph.md)` from @/theme/tokens. A raw fontSize has no paired lineHeight, which clips tall glyphs.',
        },
      ],
    },
  },
  {
    // tokens.ts is where the numbers are allowed to be numbers.
    files: ['src/theme/tokens.ts'],
    rules: { 'no-restricted-syntax': 'off' },
  },
  {
    // Optional native modules are resolved with require() on purpose: a static
    // import makes a missing module a bundle-time crash instead of a graceful
    // degrade. See the comments at each call site.
    files: ['src/components/DriveMap.tsx', 'src/lib/attestation.ts'],
    rules: { '@typescript-eslint/no-require-imports': 'off' },
  },
]);
