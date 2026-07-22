import {
  allMakes,
  fuzzyScore,
  modelsForMake,
  popularMakes,
  searchMakes,
  searchModels,
} from '../catalog';

describe('vehicle catalogue dataset', () => {
  test('ships a full make list for cars and motorcycles', () => {
    expect(allMakes('car').length).toBeGreaterThan(200);
    expect(allMakes('motorbike').length).toBeGreaterThan(200);
  });

  test('popular shortlist is a subset of the full list', () => {
    for (const m of popularMakes('car')) {
      expect(allMakes('car').map((x) => x.toLowerCase())).toContain(m.toLowerCase());
    }
  });

  test('model lists exist for popular makes', () => {
    expect(modelsForMake('car', 'BMW').length).toBeGreaterThan(20);
    expect(modelsForMake('car', 'Volkswagen').length).toBeGreaterThan(10);
    expect(modelsForMake('motorbike', 'Ducati').length).toBeGreaterThan(10);
  });

  test('motorcycle model lists are not contaminated with cars', () => {
    // Honda's bike list must not contain the Civic
    const hondaBikes = modelsForMake('motorbike', 'Honda');
    expect(hondaBikes.length).toBeGreaterThan(10);
    expect(hondaBikes.map((m) => m.toLowerCase())).not.toContain('civic');
  });

  test('long-tail make has no models — the manual fallback covers it', () => {
    // any make outside the fetched set returns [], never throws
    expect(modelsForMake('car', 'Koenigsegg')).toEqual(expect.any(Array));
  });
});

describe('fuzzy search', () => {
  test('"merc" finds Mercedes-Benz first', () => {
    const results = searchMakes('car', 'merc');
    expect(results[0]).toBe('Mercedes-Benz');
  });

  test('prefix beats substring', () => {
    expect(fuzzyScore('bmw', 'BMW')).toBeGreaterThan(fuzzyScore('bmw', 'Bmw Alpina'));
  });

  test('word-prefix works on multi-word makes', () => {
    const results = searchMakes('car', 'rover');
    expect(results.some((r) => r.toLowerCase().includes('land rover'))).toBe(true);
  });

  test('model search narrows within the make', () => {
    const results = searchModels('car', 'Volkswagen', 'golf');
    expect(results.length).toBeGreaterThan(0);
    expect(results[0].toLowerCase()).toContain('golf');
  });

  test('no match returns empty, not garbage', () => {
    expect(searchMakes('car', 'zzzzqqqq')).toEqual([]);
  });
});
