import { ordinal, pickBestBoard, scoreCandidate } from '../select';

describe('narrowest-board selection (§C1)', () => {
  test('podium on a narrow board beats a bad global rank', () => {
    const best = pickBestBoard([
      { label: 'Global · all-time', rank: 8412, size: 20000, narrowness: 0 },
      { label: 'RWD · Yorkshire · today', rank: 3, size: 14, narrowness: 3 },
    ]);
    expect(best?.label).toBe('RWD · Yorkshire · today');
  });

  test('a genuinely good global rank wins over a board of one', () => {
    const best = pickBestBoard([
      { label: 'Global · today', rank: 2, size: 4000, narrowness: 0 },
      { label: 'AWD · Cumbria · today', rank: 1, size: 1, narrowness: 3 },
    ]);
    expect(best?.label).toBe('Global · today');
  });

  test('being alone on a board still beats ranking bottom-half', () => {
    const best = pickBestBoard([
      { label: 'Global · week', rank: 900, size: 1000, narrowness: 0 },
      { label: 'Bracket · week', rank: 1, size: 1, narrowness: 3 },
    ]);
    expect(best?.label).toBe('Bracket · week');
  });

  test('narrowness only breaks ties between equal ranks', () => {
    const a = scoreCandidate({ label: 'a', rank: 1, size: 50, narrowness: 0 });
    const b = scoreCandidate({ label: 'b', rank: 1, size: 50, narrowness: 3 });
    expect(b).toBeGreaterThan(a);
    // ...but never lifts a worse rank above a better one
    const worseButNarrow = scoreCandidate({ label: 'c', rank: 30, size: 50, narrowness: 3 });
    expect(a).toBeGreaterThan(worseButNarrow);
  });

  test('empty candidates yield null', () => {
    expect(pickBestBoard([])).toBeNull();
  });
});

describe('ordinal', () => {
  test('English ordinals including the teens', () => {
    expect(ordinal(1)).toBe('1st');
    expect(ordinal(2)).toBe('2nd');
    expect(ordinal(3)).toBe('3rd');
    expect(ordinal(4)).toBe('4th');
    expect(ordinal(11)).toBe('11th');
    expect(ordinal(12)).toBe('12th');
    expect(ordinal(13)).toBe('13th');
    expect(ordinal(21)).toBe('21st');
    expect(ordinal(103)).toBe('103rd');
  });
});
