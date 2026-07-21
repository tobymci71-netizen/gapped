import { checkPlausibility } from '../plausibility';
import {
  cleanCruise,
  jetAccelTrace,
  mockProviderTrace,
  simulatedRoute,
  teleportSpoof,
  zeroSixtyPull,
} from './fixtures';

function check(report: ReturnType<typeof checkPlausibility>, name: string) {
  const c = report.checks.find((c) => c.check === name);
  expect(c).toBeDefined();
  return c!;
}

describe('plausibility envelope', () => {
  test('a genuine cruise passes every check', () => {
    const report = checkPlausibility(cleanCruise());
    expect(report.verdict).toBe('plausible');
    for (const c of report.checks) expect(c.pass).toBe(true);
  });

  test('a genuine 0-60 pull passes — hard driving is not cheating', () => {
    const report = checkPlausibility(zeroSixtyPull());
    expect(report.verdict).toBe('plausible');
  });

  test('mock-provider fixes are flagged', () => {
    const report = checkPlausibility(mockProviderTrace());
    expect(report.verdict).toBe('implausible');
    expect(check(report, 'mock_provider').pass).toBe(false);
  });

  test('teleport jumps are flagged', () => {
    const report = checkPlausibility(teleportSpoof());
    expect(report.verdict).toBe('implausible');
    expect(check(report, 'teleport').pass).toBe(false);
  });

  test('jet-grade sustained acceleration is flagged', () => {
    const report = checkPlausibility(jetAccelTrace());
    expect(report.verdict).toBe('implausible');
    expect(check(report, 'sustained_accel').pass).toBe(false);
  });

  test('zero accuracy jitter (simulator signature) is flagged', () => {
    const report = checkPlausibility(simulatedRoute());
    expect(report.verdict).toBe('implausible');
    expect(check(report, 'zero_jitter').pass).toBe(false);
  });

  test('every failed check carries a human-readable explanation — never silently drop a run', () => {
    const report = checkPlausibility(teleportSpoof());
    for (const c of report.checks) {
      expect(c.detail.length).toBeGreaterThan(10);
    }
  });
});
