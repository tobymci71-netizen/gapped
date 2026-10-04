/**
 * Whether the garage offers "+ Add another car", or the Free plan's garage
 * limit in its place (PLAN_MATRIX 'garage' and 'unlimitedGarage'). Pure, so
 * the garage step's decisions (app/onboarding/garage.tsx) are tested against
 * an explicit Access rather than the build's flag.
 *
 * Only adding is limited. Choosing or replacing the main vehicle is not adding
 * one and never comes here, and vehicles already in a garage past the Free
 * limit (added before limits were enforced) stay listed and removable.
 */

import { type Access, canAddVehicle } from '@/lib/entitlements';

type Noun = 'car' | 'bike';

export type VehicleAdd =
  | { kind: 'open' }
  | {
      kind: 'locked';
      /** The row's sentence, and its VoiceOver label: it already says "Gapped Pro". */
      line: string;
    };

/**
 * `extraCount` is the vehicles besides the main one. The garage step comes
 * after the ride step, so the main vehicle is always there to count:
 * canAddVehicle takes the garage with it included.
 */
export function vehicleAdd(extraCount: number, noun: Noun, access: Access): VehicleAdd {
  if (canAddVehicle(1 + extraCount, access)) return { kind: 'open' };
  return { kind: 'locked', line: `More ${noun}s come with Gapped Pro.` };
}

/**
 * The step's subtitle. Open, it is the step's own. Locked, it stops at "keep
 * going": "build your garage later" is something a Free garage can do only
 * by going Pro, and the row below already says that.
 */
export function garageStepSubtitle(noun: Noun, add: VehicleAdd): string {
  return add.kind === 'open'
    ? `Optional. Your main ${noun} is set, so you can keep going and build your garage later.`
    : `Optional. Your main ${noun} is set, so you can keep going.`;
}
