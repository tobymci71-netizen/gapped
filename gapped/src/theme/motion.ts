/**
 * Motion tokens — defined once, imported everywhere. Never inline a duration.
 * Spec: BUILD-PROMPT-PHASE-2.md §A1.
 */

import { Easing } from 'react-native-reanimated';

export const duration = {
  instant: 100, // state flips, toggles
  fast: 180, // button press, tab switch
  base: 280, // card entrance, sheet
  slow: 460, // screen transition, hero reveal
  epic: 900, // celebration, verification grant
} as const;

/** Springs — use these, not durations, for anything physical. */
export const spring = {
  /** snappy UI response */
  snap: { damping: 18, stiffness: 320, mass: 0.7 },
  /** the speedometer needle: slight overshoot, settles fast */
  needle: { damping: 14, stiffness: 180, mass: 1.1 },
  /** sheets and cards: soft, no visible bounce */
  soft: { damping: 24, stiffness: 180, mass: 1.0 },
  /** celebration: pronounced overshoot */
  bouncy: { damping: 9, stiffness: 220, mass: 0.9 },
} as const;

export const easing = {
  standard: Easing.bezier(0.2, 0, 0, 1), // most things
  decel: Easing.bezier(0, 0, 0, 1), // entering
  accel: Easing.bezier(0.3, 0, 1, 1), // exiting
} as const;

/** ms between children in a list entrance. Cap staggered rows at 8. */
export const stagger = 45;
export const STAGGER_CAP = 8;
