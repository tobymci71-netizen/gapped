/**
 * The garage step's Free limit: one vehicle, the main one, and the add row
 * giving way to a Pro row only once limits are enforced. Unenforced, the step
 * is exactly what it was.
 */

import { FREE_LIMITS, PLAN_MATRIX } from '@/config/plans';
import type { Access } from '@/lib/entitlements';
import { garageStepSubtitle, vehicleAdd } from '../garageAccess';

const FREE: Access = { isPro: false, enforced: true };
const PRO: Access = { isPro: true, enforced: true };
const NOT_ENFORCED: Access = { isPro: false, enforced: false };

const ORIGINAL_SUBTITLE =
  'Optional. Your main car is set, so you can keep going and build your garage later.';

describe('vehicleAdd', () => {
  it('stays open at any size while limits are not enforced', () => {
    for (const extras of [0, 1, 5, 100]) {
      expect(vehicleAdd(extras, 'car', NOT_ENFORCED)).toEqual({ kind: 'open' });
    }
  });

  it('stays open for Pro', () => {
    for (const extras of [0, 1, 50]) {
      expect(vehicleAdd(extras, 'car', PRO)).toEqual({ kind: 'open' });
    }
  });

  it('locks a Free garage once the main vehicle fills it', () => {
    expect(FREE_LIMITS.garageVehicles).toBe(1);
    expect(vehicleAdd(0, 'car', FREE)).toEqual({
      kind: 'locked',
      line: 'More cars come with Gapped Pro.',
    });
  });

  it('stays locked, not broken, for a Free garage already past the limit', () => {
    // Extras added before enforcement are kept by the screen; only adding stops.
    expect(vehicleAdd(3, 'car', FREE).kind).toBe('locked');
  });

  it('says bikes for a motorbike rider', () => {
    expect(vehicleAdd(0, 'bike', FREE)).toEqual({
      kind: 'locked',
      line: 'More bikes come with Gapped Pro.',
    });
  });

  it('only claims what the matrix gives Pro and not Free', () => {
    const row = PLAN_MATRIX.find((r) => r.key === 'unlimitedGarage');
    expect(row).toMatchObject({ free: false, pro: true });
  });
});

describe('garageStepSubtitle', () => {
  it('is unchanged while adding is open', () => {
    expect(garageStepSubtitle('car', vehicleAdd(0, 'car', NOT_ENFORCED))).toBe(ORIGINAL_SUBTITLE);
    expect(garageStepSubtitle('car', vehicleAdd(4, 'car', PRO))).toBe(ORIGINAL_SUBTITLE);
  });

  it('does not promise a garage to build later when Free is full', () => {
    const subtitle = garageStepSubtitle('bike', vehicleAdd(0, 'bike', FREE));
    expect(subtitle).toBe('Optional. Your main bike is set, so you can keep going.');
    expect(subtitle).not.toMatch(/later/);
  });
});
