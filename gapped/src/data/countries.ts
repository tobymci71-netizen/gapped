/**
 * Countries: the single source of truth for what a country code may be.
 *
 * ─── THE BUG THIS PREVENTS ───────────────────────────────────────────────────
 * `board_top` filters leaderboard entries with `e.country = p_country`. If two
 * codes can mean the same country, that filter splits one nation across two
 * leaderboards: a driver who stored `UK` never appears on the `GB` board, and
 * neither board is the national board. Nothing errors, nothing looks broken —
 * there are simply two half-populated boards and no way to tell from the app.
 *
 * `UK` is not a typo and not an obsolete code. It is *exceptionally reserved*
 * in ISO 3166-1, CLDR maps it onto the same country as `GB`, and any locale or
 * region API can hand it to us. The same is true of fifteen others, including
 * codes for countries that no longer exist (`SU`→`RU`, `YU`→`RS`, `DD`→`DE`).
 *
 * ─── HOW IT IS PREVENTED ─────────────────────────────────────────────────────
 * Three layers, so no single mistake is enough:
 *
 *   1. The picker offers canonical codes only — countries.json holds nothing
 *      else (scripts/generate-countries.mjs).
 *   2. `canonicaliseCountry` runs on every write path, so a code arriving from
 *      persisted state, a locale API or an older build is normalised before it
 *      is stored. It returns a branded `CountryCode`, so "has been through
 *      canonicalisation" is a fact the compiler tracks rather than a habit.
 *   3. The database has a foreign key onto a `countries` table holding the same
 *      250 codes (migration 0010). Even a direct SQL write cannot create the
 *      bad state.
 *
 * The alias map is generated, not hand-written: see countries.aliases.json. A
 * hand-maintained map drifts from the code list, and a missed alias is a
 * country quietly split in two — the exact failure this file exists to stop.
 * Matching is exact after trim + uppercase. There is deliberately no fuzzy
 * matching: guessing what country someone meant is how you put a driver on the
 * wrong national board.
 *
 * ─── CASTS ───────────────────────────────────────────────────────────────────
 * This file is to `CountryCode` what src/types/boundary.ts is to the unit
 * brands: the one place a raw string is allowed to become a branded code. The
 * two casts below are the generated JSON (which the generator's assertions
 * guarantee) and the successful branch of `canonicaliseCountry`. A cast to
 * `CountryCode` anywhere else means a code was stored without anyone checking
 * it, which is the bug.
 */

import aliases from './countries.aliases.json';
import countries from './countries.json';

/**
 * A country code that has been through `canonicaliseCountry`. The brand is
 * erased at runtime — a `CountryCode` *is* its string — but it means a raw
 * `string` cannot be stored where a canonical code is required.
 */
declare const __countryBrand: unique symbol;
export type CountryCode = string & { readonly [__countryBrand]: 'iso-3166-1-canonical' };

export type Country = {
  /** Canonical ISO 3166-1 alpha-2 code (plus XK — see the generator). */
  code: CountryCode;
  name: string;
  flag: string;
};

/**
 * All shippable countries, sorted by name. 249 assigned ISO codes + XK.
 *
 * Branded one code at a time rather than casting the whole array through
 * `unknown`: a double cast would launder anything, whereas this is the same
 * single string→CountryCode step `canonicaliseCountry` makes, and it is sound
 * because the generator asserts the file's contents before writing it.
 */
export const COUNTRIES: readonly Country[] = countries.map((c) => ({
  ...c,
  code: c.code as CountryCode,
}));

/** Membership test set. Built once; `canonicaliseCountry` is on a write path. */
const CANONICAL = new Set<string>(COUNTRIES.map((c) => c.code));

/** Exact alias → canonical map, generated from CLDR. Keys are uppercase. */
export const COUNTRY_ALIASES: Readonly<Record<string, string>> = aliases;

/** Lookup by code, for rendering a flag or name next to a stored code. */
const BY_CODE = new Map<string, Country>(COUNTRIES.map((c) => [c.code, c]));

export function countryByCode(code: string | null | undefined): Country | undefined {
  return code == null ? undefined : BY_CODE.get(code);
}

/** True when `code` is exactly one of the 250 codes we store. */
export function isCanonicalCountry(code: string | null | undefined): code is CountryCode {
  return code != null && CANONICAL.has(code);
}

/**
 * Normalise a country code to the one canonical spelling we store.
 *
 *   'gb' → 'GB'      already canonical, just cased
 *   'UK' → 'GB'      exceptionally reserved alias
 *   'ZR' → 'CD'      formerly-used code (Zaire → DR Congo)
 *   'ZZ' → null      CLDR sentinel, not a country
 *   'QQ' → null      not a code at all
 *
 * Returns `null` for anything it cannot map, rather than passing the input
 * through. Storing `null` means "no country set", which is a state the app
 * already handles everywhere; storing an unrecognised code would be rejected
 * by the database constraint and would silently break the national board in
 * the meantime.
 */
export function canonicaliseCountry(input: string | null | undefined): CountryCode | null {
  if (input == null) return null;
  const code = input.trim().toUpperCase();
  if (code === '') return null;
  const resolved = COUNTRY_ALIASES[code] ?? code;
  return CANONICAL.has(resolved) ? (resolved as CountryCode) : null;
}
