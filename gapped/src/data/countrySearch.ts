/**
 * Search for the country picker: what someone types → which rows, in which
 * order.
 *
 * The list holds CLDR short names ('United Kingdom', 'Türkiye', 'Côte
 * d’Ivoire'), which are not what most people type. A plain substring filter
 * sent 'uk' to Ukraine alone, found nothing at all for 'usa', 'britain',
 * 'turkey' or 'turkiye', and listed Australia, Austria and four others above
 * the United States for 'us'. The country decides which national board a
 * driver lands on, so the common names have to find the right row, and find it
 * first.
 *
 * Search only ever *ranks rows from COUNTRIES*. It cannot produce a code that
 * is not in the list, so none of this weakens the one-code-per-country rule in
 * countries.ts: a synonym is a way to find the GB row, never a second GB.
 */

import { COUNTRIES, type Country } from './countries';

/**
 * Everyday names → canonical code, for the names CLDR's short form does not
 * contain. Keys are written already folded (see `fold`).
 *
 * Hand-written rather than generated, unlike countries.aliases.json, because
 * the failure mode is different: a missing entry here means a search shows the
 * row a little later, not a nation split across two boards. The test suite
 * still checks every target is a code we ship.
 *
 * COUNTRY_ALIASES is deliberately NOT searched. Its keys are retired ISO codes,
 * and two of them are prefixes people really type: 'an' (→ Curaçao) would put
 * Curaçao above Andorra and Angola, 'bu' (→ Myanmar) above Bulgaria and
 * Burundi. 'uk' is the only one anyone means, so it is listed here instead.
 */
const SYNONYMS: Readonly<Record<string, string>> = {
  usa: 'US',
  america: 'US',
  'united states of america': 'US',
  uk: 'GB',
  britain: 'GB',
  'great britain': 'GB',
  england: 'GB',
  scotland: 'GB',
  wales: 'GB',
  'northern ireland': 'GB',
  turkey: 'TR',
  holland: 'NL',
  'ivory coast': 'CI',
  uae: 'AE',
  emirates: 'AE',
  'czech republic': 'CZ',
  swaziland: 'SZ',
  macedonia: 'MK',
  'cabo verde': 'CV',
  'east timor': 'TL',
  'holy see': 'VA',
  drc: 'CD',
  'democratic republic of the congo': 'CD',
  'republic of the congo': 'CG',
  'russian federation': 'RU',
  palestine: 'PS',
  'viet nam': 'VN',
};

/**
 * Normalise for comparison: lowercase, accents off, punctuation out.
 *
 *   'Türkiye'               → 'turkiye'
 *   'Côte d’Ivoire'         → 'cote divoire'   (and "cote d'ivoire" folds the same)
 *   'U.S. Virgin Islands'   → 'us virgin islands'
 *   'Bosnia & Herzegovina'  → 'bosnia and herzegovina'
 *   'Guinea-Bissau'         → 'guinea bissau'
 *
 * Applied to both sides, so whatever someone types meets the names on equal
 * terms. NFD splits an accented letter into the letter and a combining mark,
 * which the range below then drops.
 */
export function fold(s: string): string {
  let out = s.toLowerCase();
  // Guarded rather than assumed: if a runtime lacks normalize, accents simply
  // stay on and the synonyms above still catch the names that matter most.
  if (typeof out.normalize === 'function') out = out.normalize('NFD');
  return out
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/&/g, ' and ')
    .replace(/['\u2019.]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

type Entry = {
  country: Country;
  code: string;
  /** Folded name plus any synonyms and spelled-out forms. */
  keys: string[];
};

function buildIndex(list: readonly Country[]): Entry[] {
  const extra = new Map<string, string[]>();
  for (const [name, code] of Object.entries(SYNONYMS)) {
    extra.set(code, [...(extra.get(code) ?? []), name]);
  }
  return list.map((country) => {
    const name = fold(country.name);
    const keys = [name, ...(extra.get(country.code) ?? [])];
    // CLDR abbreviates 'St.'; people also type it out.
    if (name.startsWith('st ')) keys.push(`saint ${name.slice(3)}`);
    return { country, code: country.code.toLowerCase(), keys };
  });
}

const INDEX = buildIndex(COUNTRIES);

/**
 * How well `q` (already folded) matches an entry. Lower is better; null is no
 * match.
 *
 *   0  the code itself, a whole name or a synonym      'us', 'uk', 'turkey'
 *   1  the start of a name or synonym                  'germ', 'brit'
 *   2  the start of any later word                     'korea', 'kingdom'
 *   3  anywhere                                        'stan'
 */
function tier(entry: Entry, q: string): number | null {
  if (entry.code === q || entry.keys.includes(q)) return 0;
  if (entry.keys.some((k) => k.startsWith(q))) return 1;
  if (entry.keys.some((k) => k.split(' ').some((w) => w.startsWith(q)))) return 2;
  if (entry.keys.some((k) => k.includes(q))) return 3;
  return null;
}

/**
 * Rows matching `query`, best first; ties keep the list's alphabetical order.
 * An empty query returns the whole list unchanged.
 */
export function searchCountries(
  query: string,
  list: readonly Country[] = COUNTRIES,
): readonly Country[] {
  if (!query.trim()) return list;
  // 'The Gambia', 'the Netherlands': the article never helps narrow it down.
  const q = fold(query).replace(/^the /, '');
  // Typed something, but nothing that can match a name (punctuation, another
  // script): that is no results, not the whole list.
  if (!q) return [];
  const index = list === COUNTRIES ? INDEX : buildIndex(list);
  return index
    .map((entry, order) => ({ entry, order, t: tier(entry, q) }))
    .filter((x): x is { entry: Entry; order: number; t: number } => x.t !== null)
    .sort((a, b) => a.t - b.t || a.order - b.order)
    .map((x) => x.entry.country);
}

/** Exposed for the tests: every synonym must point at a row that ships. */
export const COUNTRY_SYNONYMS = SYNONYMS;
