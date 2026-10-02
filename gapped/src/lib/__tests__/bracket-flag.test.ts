/**
 * Re-decoding a VIN must not reset the Modified switch. The decode response
 * carries the flag only inside its bracket key, so that is where Garage reads
 * it from — and a key it cannot read must say "unknown", not "stock".
 */

import { bracketKey } from '@/vehicles/brackets';
import { modifiedFromBracketKey } from '../bracket-flag';

describe('modifiedFromBracketKey', () => {
  test('reads the flag from keys built by bracketKey, both ways', () => {
    for (const isModified of [true, false]) {
      const key = bracketKey({
        drivetrain: 'rwd',
        curbWeightKg: 1400,
        factoryPowerHp: 300,
        isModified,
      });
      expect(modifiedFromBracketKey(key)).toBe(isModified);
    }
  });

  test('open-class keys with no drivetrain still carry it', () => {
    const key = bracketKey({
      drivetrain: null,
      curbWeightKg: null,
      factoryPowerHp: null,
      isModified: true,
    });
    expect(modifiedFromBracketKey(key)).toBe(true);
  });

  test.each([undefined, null, 42, '', 'rwd', 'rwd|tuned|pw3', 'rwd|modified', 'a|stock|b|c'])(
    '%j is unknown, never read as stock',
    (key) => {
      expect(modifiedFromBracketKey(key)).toBeNull();
    },
  );
});
