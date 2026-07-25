import {
  addBins,
  binLabel,
  BIN_COUNT,
  binsFor,
  binTotal,
  emptyBins,
  speedBins,
} from '../distribution';
import { cleanCruise, traceFromSpeeds } from './fixtures';

describe('speedBins', () => {
  test('an empty trace bins nothing', () => {
    const bins = speedBins([]);
    expect(binTotal(bins, 'metric')).toBe(0);
    expect(binTotal(bins, 'imperial')).toBe(0);
  });

  test('a single fix is not a distribution', () => {
    expect(binTotal(speedBins(traceFromSpeeds([20])), 'metric')).toBe(0);
  });

  test('every gated sample lands in exactly one band', () => {
    const fixes = traceFromSpeeds(Array.from({ length: 40 }, (_, i) => i), { accuracyM: 5 });
    const bins = speedBins(fixes);
    expect(binTotal(bins, 'metric')).toBe(40);
    expect(binTotal(bins, 'imperial')).toBe(40);
  });

  test('fixes rejected by accuracy gating are not binned', () => {
    const bins = speedBins(traceFromSpeeds(Array(20).fill(20), { accuracyM: 500 }));
    expect(binTotal(bins, 'metric')).toBe(0);
  });

  test('a steady 20 m/s cruise sits in the 72 km/h and 44 mph bands', () => {
    const bins = speedBins(cleanCruise());
    // 20 m/s = 72 km/h → the 60–80 band (index 3); 44.7 mph → 40–50 (index 4)
    expect(bins.kmh[3]).toBeGreaterThan(50);
    expect(bins.mph[4]).toBeGreaterThan(50);
    expect(bins.kmh[4]).toBe(0);
    expect(bins.mph[3]).toBe(0);
  });

  test('speeds past the top band land in the open-ended bin, not out of range', () => {
    const bins = speedBins(traceFromSpeeds(Array(10).fill(90), { accuracyM: 5 }));
    // 90 m/s = 324 km/h / 201 mph — beyond every closed band
    expect(bins.kmh[BIN_COUNT - 1]).toBe(10);
    expect(bins.mph[BIN_COUNT - 1]).toBe(10);
  });
});

describe('addBins', () => {
  test('summing is per band and per unit', () => {
    const a = speedBins(traceFromSpeeds(Array(10).fill(20), { accuracyM: 5 }));
    const b = speedBins(traceFromSpeeds(Array(10).fill(20), { accuracyM: 5 }));
    const total = addBins(a, b);
    expect(binTotal(total, 'metric')).toBe(20);
    expect(binTotal(total, 'imperial')).toBe(20);
  });

  test('adding an empty histogram changes nothing', () => {
    const a = speedBins(cleanCruise());
    expect(addBins(a, emptyBins())).toEqual(a);
  });
});

describe('binsFor and labels', () => {
  test('unit preference selects the matching histogram', () => {
    const bins = speedBins(cleanCruise());
    expect(binsFor(bins, 'imperial')).toBe(bins.mph);
    expect(binsFor(bins, 'metric')).toBe(bins.kmh);
  });

  test('labels are closed bands until the last, which is open-ended', () => {
    expect(binLabel(0, 'imperial')).toBe('0–10');
    expect(binLabel(4, 'imperial')).toBe('40–50');
    expect(binLabel(BIN_COUNT - 1, 'imperial')).toBe('100+');
    expect(binLabel(0, 'metric')).toBe('0–20');
    expect(binLabel(BIN_COUNT - 1, 'metric')).toBe('200+');
  });
});
