/**
 * The words on the country step: the count line under the map, and the
 * country's name as it sits in a sentence.
 *
 * Pure, so every variant of the line can be read in a test. Which variant
 * shows is not decided here — `countryProof` (../proofVariants) holds the
 * thresholds, and this only words its answer (docs/ONBOARDING.md, "Country").
 */

import type { Country } from '@/data/countries';
import type { CountryProof } from '../proofVariants';

/**
 * Names that take "the" inside a sentence and do not say so themselves.
 * "Drivers from the United Kingdom", never "drivers from United Kingdom",
 * which is how the reference app reads and the first thing a British driver
 * would notice. Rule-shaped names (…Islands, …Republic, United …) are caught
 * by THE_PATTERN; these are the rest.
 */
const TAKES_THE = new Set(['BS', 'BQ', 'GM', 'IM', 'KM', 'MV', 'NL', 'PH', 'SC']);
const THE_PATTERN = /^(United |U\.S\. )|(Islands|Republic|Territory|Territories)$/;

/** The name as it reads mid-sentence: "the Netherlands", "France". */
export function countryInSentence(country: Pick<Country, 'code' | 'name'>): string {
  return TAKES_THE.has(country.code) || THE_PATTERN.test(country.name)
    ? `the ${country.name}`
    : country.name;
}

/**
 * Thousands separated with commas, always. Not toLocaleString: it varies by
 * device (and by Hermes build), and a count that reads "20.890" on one phone
 * and "20 890" on another is a count nobody trusts.
 */
export function formatCount(n: number): string {
  const whole = Math.max(0, Math.round(n));
  return String(whole).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

export type CountryLine =
  | {
      kind: 'count';
      /** The number, already counted to — the big figure. */
      n: number;
      /** The rest of the sentence, after the number. */
      text: string;
    }
  | {
      kind: 'early';
      /** The line in place of a number. */
      text: string;
      /** The quieter line under it. */
      detail: string;
    };

/** The count line for `proof` in `country` (docs/ONBOARDING.md, "Country"). */
export function countryLine(proof: CountryProof, country: Pick<Country, 'code' | 'name'>): CountryLine {
  const from = countryInSentence(country);
  switch (proof.kind) {
    case 'yesterday':
      return { kind: 'count', n: proof.n, text: `drivers from ${from} drove with Gapped yesterday` };
    case 'onBoard':
      return { kind: 'count', n: proof.n, text: `drivers from ${from} are on the board` };
    case 'early':
      return {
        kind: 'early',
        text: `Be the first from ${from} on the board`,
        // "The {Country} board": the leading article is already there, so the
        // bare name — "The United Kingdom board", not "The the …".
        detail: `The ${country.name} board fills one verified run at a time.`,
      };
  }
}

/** The whole line as VoiceOver should read it, number included. */
export function spokenCountryLine(line: CountryLine): string {
  return line.kind === 'count' ? `${formatCount(line.n)} ${line.text}` : `${line.text}. ${line.detail}`;
}
