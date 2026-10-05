/**
 * What onboarding asks a driver to agree to, word for word, and the rule that
 * decides when they have. These are the lines App Review reads (1.2, 1.4.1,
 * 5.1.1), and the links must land on the public pages in src/config/links.ts —
 * never gapped.app, never an email address.
 */

import { PRIVACY_URL, TERMS_URL } from '@/config/links';
import {
  AGE_CHECK,
  canAgree,
  GUIDELINES_CHECK,
  PRIVACY_LINK,
  PUBLIC_DATA_LINE,
  SAFETY_LINE,
  sentenceText,
  TERMS_LINK,
  TERMS_SENTENCE,
} from '../consentCopy';

describe('the words', () => {
  test('the safety line', () => {
    expect(SAFETY_LINE).toBe(
      'Top-speed and 0–60 runs belong on tracks and closed roads. Always obey speed limits.',
    );
  });

  test('the two boxes', () => {
    expect(GUIDELINES_CHECK).toBe('I acknowledge these guidelines and agree to drive responsibly.');
    expect(AGE_CHECK).toBe("I'm 18 or older and hold a valid driving licence.");
  });

  test('the agreement sentence names both documents', () => {
    expect(sentenceText(TERMS_SENTENCE)).toBe(
      'By continuing you agree to the Terms of Use and Privacy Policy',
    );
  });

  test('what is public, and what never is', () => {
    expect(PUBLIC_DATA_LINE).toBe(
      'Your username, country and run results, including the date of each drive, are public on the leaderboards. Your routes never are.',
    );
  });
});

describe('the links', () => {
  test('go to the public pages, by their names', () => {
    expect(TERMS_LINK).toEqual({ label: 'Terms of Use', url: TERMS_URL });
    expect(PRIVACY_LINK).toEqual({ label: 'Privacy Policy', url: PRIVACY_URL });
    expect(TERMS_SENTENCE.filter((r) => typeof r !== 'string')).toEqual([TERMS_LINK, PRIVACY_LINK]);
  });

  test('are https pages on the GitHub Pages site, not gapped.app or mail', () => {
    for (const { url } of [TERMS_LINK, PRIVACY_LINK]) {
      expect(url).toMatch(/^https:\/\/tobymci71-netizen\.github\.io\/gapped\//);
      expect(url).not.toMatch(/gapped\.app|mailto:|@/);
    }
  });

  test('no line carries an email address', () => {
    for (const line of [SAFETY_LINE, GUIDELINES_CHECK, AGE_CHECK, PUBLIC_DATA_LINE]) {
      expect(line).not.toMatch(/\S+@\S+/);
    }
  });
});

describe('canAgree', () => {
  test('every box shown must be ticked', () => {
    expect(canAgree([true, true])).toBe(true);
    expect(canAgree([true, false])).toBe(false);
    expect(canAgree([false, true])).toBe(false);
    expect(canAgree([true])).toBe(true);
    expect(canAgree([false])).toBe(false);
  });

  test('no boxes is not agreement', () => {
    expect(canAgree([])).toBe(false);
  });
});
