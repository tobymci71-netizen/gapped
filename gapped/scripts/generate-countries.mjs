#!/usr/bin/env node
/**
 * Generates src/data/countries.json — the country list the picker renders and
 * the canonical set the database constrains against.
 *
 *   npm run generate:countries
 *
 * ─── WHY THIS SCRIPT EXISTS ──────────────────────────────────────────────────
 * countries.json used to be a committed blob with no provenance: no package,
 * no generator, no stated source. Nobody could say where its 264 entries came
 * from, which meant nobody could say whether a given code belonged there. That
 * is a supply-chain problem — an unverifiable dependency that happens to live
 * in our own repo. This script makes the list reproducible and diffable: run
 * it, and the output either matches what is committed or you get a diff that
 * says exactly what moved and why.
 *
 * ─── SOURCE AND VERSION ──────────────────────────────────────────────────────
 * Source: the CLDR region data bundled with Node's ICU. No network, no npm
 * dependency — the pin is the ICU version, which is recorded in
 * src/data/countries.provenance.json on every run. Regenerating under a
 * different Node/ICU may legitimately change display names (CLDR renames
 * countries); it must NOT change the set of codes, and the assertions at the
 * bottom of this file fail the run loudly if it does.
 *
 * ─── HOW THE SET IS DERIVED ──────────────────────────────────────────────────
 * 1. Enumerate every AA–ZZ pair ICU recognises as a region.
 * 2. Drop CLDR aliases (UK→GB, ZR→CD, …). These are the duplicates that split
 *    one country across two leaderboards. See src/data/countries.ts.
 * 3. Drop the codes in NOT_ASSIGNED below — reserved and sentinel codes that
 *    are not assigned ISO 3166-1 country codes.
 * 4. Add back the codes in EXCEPTIONS — deliberate, reasoned deviations.
 *
 * Steps 3 and 4 are explicit data, not clever filters, and that is deliberate.
 * A filter that "happens to exclude" a code excludes it silently; a named list
 * with a reason survives regeneration, shows up in review, and tells the next
 * person why somebody's country is or isn't in the picker.
 */

import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

/**
 * Codes ICU knows about that are NOT assigned ISO 3166-1 alpha-2 country
 * codes. Every one of these has a reason and, except where noted, a correct
 * ISO code its residents use instead.
 *
 * Removing a code here removes a country from the picker. Do not add to this
 * list without checking who it strands.
 */
const NOT_ASSIGNED = {
  AC: 'Exceptionally reserved (Ascension Island). Residents use SH — St Helena, Ascension and Tristan da Cunha.',
  TA: 'Exceptionally reserved (Tristan da Cunha). Residents use SH.',
  CP: 'Exceptionally reserved (Clipperton Island). Uninhabited; sovereignty FR.',
  DG: 'Exceptionally reserved (Diego Garcia). Falls under IO.',
  EA: 'Exceptionally reserved (Ceuta & Melilla). Residents use ES.',
  IC: 'Exceptionally reserved (Canary Islands). Residents use ES.',
  CQ: 'Exceptionally reserved for Sark (2019). Sark is in the Bailiwick of Guernsey; residents use GG.',
  ZZ: 'CLDR sentinel for an unknown region. Never a real answer to "where do you drive?".',
  XK: 'User-assigned (Kosovo). No ISO 3166-1 code exists — see EXCEPTIONS.',
  // Supranational and CLDR-only codes. ICU lists these as regions, but none is
  // a country and none is somewhere a person drives.
  EU: 'Exceptionally reserved (European Union). Supranational, not a country.',
  EZ: 'Exceptionally reserved (Eurozone). Supranational, not a country.',
  UN: 'Exceptionally reserved (United Nations). An organisation, not a country.',
  QO: 'CLDR macroregion (Outlying Oceania). Not an ISO 3166-1 code at all.',
  XA: "ICU pseudo-locale for accent testing. Not a place. Ships in ICU's region data.",
  XB: 'ICU pseudo-locale for bidi testing. Not a place.',
};

/**
 * Codes we ship even though they are not ISO-assigned. Each needs a reason
 * strong enough to justify deviating from the standard the DB constraint is
 * built on.
 */
const EXCEPTIONS = {
  XK: [
    'Kosovo. ~1.8M people and no ISO 3166-1 code exists, so unlike every other',
    'entry in NOT_ASSIGNED there is no correct fallback: the nearest code is RS,',
    'which is factually wrong and, on an app with public national leaderboards,',
    'gratuitously so. XK sits in the XA–XZ range that ISO 3166-1 reserves for',
    'user assignment, so shipping it is conformant with the standard rather than',
    'a deviation from it, and it is what the EU, IMF, World Bank and Unicode all',
    'use in practice.',
  ].join(' '),
};

/** Expected sizes. Asserted below so an ICU upgrade cannot quietly move them. */
const EXPECTED_ASSIGNED = 249;
const EXPECTED_TOTAL = 250;

const AZ = [...'ABCDEFGHIJKLMNOPQRSTUVWXYZ'];
const displayNames = new Intl.DisplayNames(['en'], { type: 'region' });

/** ICU renders a code it does not recognise by echoing it back. */
const known = (code) => displayNames.of(code) !== code;

/**
 * CLDR canonicalisation. `und-UK` canonicalises to `und-GB`, which is how the
 * deprecated and reserved aliases are detected — by asking the same library
 * that renders them, rather than by comparing display names. Two codes can
 * share a name without being aliases, and aliases can differ in name, so name
 * comparison is not a sound test. It found 6 of the 14 when we tried it.
 */
const canonicalOf = (code) => {
  const [tag] = Intl.getCanonicalLocales(`und-${code}`);
  return tag.split('-')[1] ?? code;
};

// ── Derive ───────────────────────────────────────────────────────────────────

const recognised = [];
for (const a of AZ) for (const b of AZ) if (known(a + b)) recognised.push(a + b);

const aliases = {};
const canonical = [];
for (const code of recognised) {
  const target = canonicalOf(code);
  if (target !== code) aliases[code] = target;
  else canonical.push(code);
}

const assigned = canonical.filter((c) => !(c in NOT_ASSIGNED));
const shipped = [...assigned, ...Object.keys(EXCEPTIONS)].sort();

// ── Assert ───────────────────────────────────────────────────────────────────
// These are the guard rails. If a future ICU adds, removes or reclassifies a
// region, the run fails here with a readable diff instead of silently shipping
// a different world.

const fail = (msg) => {
  console.error(`\n✗ ${msg}\n`);
  console.error('  This is a guard rail, not a bug. The set of countries changed');
  console.error('  under a new ICU/CLDR version. Review the diff, decide whether');
  console.error('  the change is correct, then update the expected counts and the');
  console.error('  NOT_ASSIGNED / EXCEPTIONS lists in this file to match.\n');
  process.exit(1);
};

if (assigned.length !== EXPECTED_ASSIGNED) {
  fail(`expected ${EXPECTED_ASSIGNED} assigned ISO 3166-1 codes, derived ${assigned.length}`);
}
if (shipped.length !== EXPECTED_TOTAL) {
  fail(`expected ${EXPECTED_TOTAL} shipped codes, derived ${shipped.length}`);
}
for (const code of Object.keys(EXCEPTIONS)) {
  if (!(code in NOT_ASSIGNED)) {
    fail(`${code} is in EXCEPTIONS but not NOT_ASSIGNED — an exception to nothing`);
  }
}
// The Crown Dependencies and Gibraltar are regular assigned codes, not reserved
// ones. They are asserted by name because the maintainer lives in one of them
// and a silent trim would lock him out of his own app.
for (const code of ['GG', 'JE', 'IM', 'GI']) {
  if (!shipped.includes(code)) fail(`${code} must ship — it is an assigned ISO 3166-1 code`);
}

// ── Emit ─────────────────────────────────────────────────────────────────────

/** Regional indicator symbols: 'GB' → 🇬🇧. Composes for any A–Z pair. */
const flagOf = (code) =>
  String.fromCodePoint(...[...code].map((ch) => 0x1f1e6 + ch.charCodeAt(0) - 65));

const countries = shipped.map((code) => ({
  code,
  name: displayNames.of(code),
  flag: flagOf(code),
}));
countries.sort((a, b) => a.name.localeCompare(b.name, 'en'));

// One country per line. The committed file used to be minified onto a single
// line, which made every regeneration a 250-country diff and hid what actually
// changed. A file whose purpose is to be reviewed should be reviewable.
const lines = countries.map((c) => `  ${JSON.stringify(c)}`).join(',\n');
writeFileSync(join(root, 'src/data/countries.json'), `[\n${lines}\n]\n`);

/**
 * The alias map, emitted rather than hand-written. Every key is a code a user
 * or an old client might present; every value is the canonical code we store.
 * Generating it is the point: a hand-maintained map drifts from the code list,
 * and an alias we miss is a country silently split across two leaderboards.
 *
 * Aliases whose target is not itself shipped would canonicalise a user onto a
 * code the picker cannot render, so they are dropped with a warning rather
 * than emitted.
 */
const shippedSet = new Set(shipped);
const aliasMap = {};
for (const [from, to] of Object.entries(aliases)) {
  if (shippedSet.has(to)) aliasMap[from] = to;
  else console.warn(`  ! alias ${from}→${to} dropped: ${to} is not shipped`);
}
writeFileSync(
  join(root, 'src/data/countries.aliases.json'),
  `${JSON.stringify(aliasMap, null, 2)}\n`,
);

const provenance = {
  $comment: 'Generated by scripts/generate-countries.mjs — do not edit by hand.',
  source: "CLDR region data bundled with Node's ICU (no network, no npm dependency)",
  generator: 'scripts/generate-countries.mjs',
  versions: {
    node: process.version,
    icu: process.versions.icu,
    cldr: process.versions.cldr,
    unicode: process.versions.unicode,
  },
  counts: {
    recognisedByIcu: recognised.length,
    cldrAliases: Object.keys(aliases).length,
    assignedIso3166_1: assigned.length,
    exceptions: Object.keys(EXCEPTIONS).length,
    shipped: countries.length,
  },
  aliases,
  notAssigned: NOT_ASSIGNED,
  exceptions: EXCEPTIONS,
};
writeFileSync(
  join(root, 'src/data/countries.provenance.json'),
  `${JSON.stringify(provenance, null, 2)}\n`,
);

console.log(`ICU ${process.versions.icu} / CLDR ${process.versions.cldr}`);
console.log(`  ${recognised.length} regions recognised by ICU`);
console.log(`  − ${Object.keys(aliases).length} CLDR aliases`);
console.log(`  − ${Object.keys(NOT_ASSIGNED).length - Object.keys(EXCEPTIONS).length} not assigned`);
console.log(`  + ${Object.keys(EXCEPTIONS).length} exception (${Object.keys(EXCEPTIONS).join(', ')})`);
console.log(`  = ${countries.length} shipped  (${assigned.length} assigned + ${Object.keys(EXCEPTIONS).length})`);
console.log('\nWrote src/data/countries.json and src/data/countries.provenance.json');
