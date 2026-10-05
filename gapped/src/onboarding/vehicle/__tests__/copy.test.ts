/**
 * Make-proof sentences. Mostly the contract's copy verbatim. The share line
 * names the kind, because the share it prints is within one vehicle kind, and
 * the ranked line says "on Gapped", because the count is of onboarded drivers,
 * not of drivers on a board.
 */

import { closerLine, earlyCopy, rankedLine, rankLine, shareLine } from '../copy';

describe('ranked copy', () => {
  it('names the make and its place', () => {
    expect(rankedLine('BSA')).toBe('BSA drivers are already on Gapped');
    expect(rankedLine('  BSA ')).toBe('BSA drivers are already on Gapped');
    expect(rankLine(11)).toBe('#11 most popular on Gapped');
  });

  it('names the kind the share is of', () => {
    expect(shareLine(1.6, 'bike')).toBe('2% of all Gapped bike drivers');
    expect(shareLine(0.4, 'car')).toBe('<1% of all Gapped car drivers');
  });

  it('swaps the noun in the closer', () => {
    expect(closerLine('car')).toBe('Your car connects you with drivers who share it.');
    expect(closerLine('bike')).toBe('Your bike connects you with drivers who share it.');
  });
});

describe('earlyCopy', () => {
  it('invites without a number', () => {
    const copy = earlyCopy('BSA');
    expect(copy.title).toBe('Be one of the first BSA drivers on the board');
    expect(copy.body).toBe('Each verified BSA drive is added to the board as it comes in.');
    expect(`${copy.title} ${copy.body}`).not.toMatch(/\d/);
  });

  it('reads cleanly with no make at all', () => {
    expect(earlyCopy(null).title).toBe('Be one of the first drivers on the board');
    expect(earlyCopy('   ').body).toBe('Each verified drive is added to the board as it comes in.');
  });

  it('does not frame a drive as a race', () => {
    for (const make of ['BSA', null]) {
      const { title, body } = earlyCopy(make);
      expect(`${title} ${body}`).not.toMatch(/beat|race|fastest|win\b|compet/i);
    }
  });
});
