/**
 * Vehicle-class brackets (spec Phase 4 / §4.2). The difference between
 * "fastest phone in the world" and "fastest stock Miata in Colorado."
 *
 * bracket_key format: '{drivetrain}|{mod}|{pw-tier}' — e.g. 'rwd|stock|pw2'.
 * Deterministic, stable, and denormalised onto leaderboard_entries so board
 * queries never join. Null components degrade gracefully: a vehicle with no
 * power/weight data lands in the open tier for its drivetrain.
 */

export type Drivetrain = 'fwd' | 'rwd' | 'awd' | '4wd';

export type BracketInput = {
  drivetrain: Drivetrain | null;
  curbWeightKg: number | null;
  factoryPowerHp: number | null;
  isModified: boolean;
};

/**
 * Power-to-weight tiers in hp/tonne. Boundaries chosen so common enthusiast
 * cars split sensibly:
 *   pw1 < 100 (city cars) · pw2 100–170 (warm hatches, Miata) ·
 *   pw3 170–260 (hot hatches, GTI/Golf R) · pw4 260–400 (sports cars) ·
 *   pw5 400+ (supercars)
 */
export const PW_TIERS: { key: string; maxHpPerTonne: number }[] = [
  { key: 'pw1', maxHpPerTonne: 100 },
  { key: 'pw2', maxHpPerTonne: 170 },
  { key: 'pw3', maxHpPerTonne: 260 },
  { key: 'pw4', maxHpPerTonne: 400 },
  { key: 'pw5', maxHpPerTonne: Infinity },
];

export function powerToWeightHpPerTonne(
  factoryPowerHp: number | null,
  curbWeightKg: number | null,
): number | null {
  if (!factoryPowerHp || !curbWeightKg || factoryPowerHp <= 0 || curbWeightKg <= 0) return null;
  return factoryPowerHp / (curbWeightKg / 1000);
}

export function pwTier(hpPerTonne: number | null): string {
  if (hpPerTonne == null) return 'open';
  for (const t of PW_TIERS) {
    if (hpPerTonne < t.maxHpPerTonne) return t.key;
  }
  return 'pw5';
}

/**
 * Self-declared modification always flags the vehicle out of stock brackets
 * (and its runs stay unverified for bracket purposes — an honest declared mod
 * is not an accusation, it's a different class).
 */
export function bracketKey(input: BracketInput): string {
  const dt = input.drivetrain ?? 'any';
  const mod = input.isModified ? 'modified' : 'stock';
  const tier = pwTier(powerToWeightHpPerTonne(input.factoryPowerHp, input.curbWeightKg));
  return `${dt}|${mod}|${tier}`;
}

/** Human-readable bracket label for board headers. */
export function bracketLabel(key: string): string {
  const [dt, mod, tier] = key.split('|');
  const dtLabel =
    { fwd: 'FWD', rwd: 'RWD', awd: 'AWD', '4wd': '4WD', any: 'All drivetrains' }[dt] ?? dt;
  const tierLabel =
    {
      pw1: '<100 hp/t',
      pw2: '100–170 hp/t',
      pw3: '170–260 hp/t',
      pw4: '260–400 hp/t',
      pw5: '400+ hp/t',
      open: 'Open class',
    }[tier] ?? tier;
  const modLabel = mod === 'stock' ? 'Stock' : 'Modified';
  return `${dtLabel} · ${modLabel} · ${tierLabel}`;
}
