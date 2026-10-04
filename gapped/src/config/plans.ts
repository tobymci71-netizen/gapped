/**
 * The published free-vs-Pro matrix — table stakes #13. Neither incumbent
 * publishes one anywhere and both get punished for it in reviews. The /plans
 * screen ships it before the paywall exists, and its contents are a product
 * promise: nothing moves from Free to Pro after launch.
 *
 * Here rather than in app/plans.tsx so that anything else that describes the
 * plans — the onboarding paywall's "what Pro adds" line — is checked against
 * the same rows (src/config/__tests__/plans.test.ts) instead of restating
 * them by hand.
 */

export type PlanFeatureKey =
  // Free (and Pro)
  | 'recordDrives'
  | 'coreStats'
  | 'boardPlacement'
  | 'recentHistory'
  | 'friends'
  | 'shareCards'
  | 'privacy'
  | 'garage'
  // Pro only
  | 'fullHistory'
  | 'advancedTelemetry'
  | 'classBrackets'
  | 'unlimitedFriends'
  | 'cleanShareCards'
  | 'videoOverlay'
  | 'export'
  | 'unlimitedGarage'
  | 'cloudSync';

export type PlanFeature = { key: PlanFeatureKey; feature: string; free: boolean; pro: boolean };

/**
 * What Free is limited to where it is limited rather than excluded. One
 * source for the matrix's wording and for the checks that enforce it
 * (src/lib/entitlements.ts), so the two cannot drift.
 */
export const FREE_LIMITS = {
  /** Drive history Free can open: the last this-many days. */
  historyDays: 30,
  /** People a Free account can follow on the friends board. */
  friends: 5,
  /** Vehicles in a Free garage, the main one included. */
  garageVehicles: 1,
} as const;

/**
 * Free keeps the habit loop — record, see your top speed and 0–60, place on
 * the boards, share — and Pro is depth: the whole history, the telemetry,
 * class brackets, more people and more cars. Privacy is never a Pro feature.
 */
export const PLAN_MATRIX: readonly PlanFeature[] = [
  { key: 'recordDrives', feature: 'Record unlimited drives', free: true, pro: true },
  { key: 'coreStats', feature: 'Top speed & 0–60, verified', free: true, pro: true },
  // Free: the board is the product. Onboarding sells it ("Every verified run
  // lands on the board", "{n} drivers from {Country} are on the board"), and
  // a Free run that never placed would make those screens untrue.
  {
    key: 'boardPlacement',
    feature: 'Place on the global & country boards',
    free: true,
    pro: true,
  },
  {
    key: 'recentHistory',
    feature: `Last ${FREE_LIMITS.historyDays} days of drive history`,
    free: true,
    pro: true,
  },
  {
    key: 'friends',
    feature: `Friends board, up to ${FREE_LIMITS.friends} friends`,
    free: true,
    pro: true,
  },
  { key: 'shareCards', feature: 'Share cards (with Gapped badge)', free: true, pro: true },
  { key: 'privacy', feature: 'Privacy zones & route trimming', free: true, pro: true },
  {
    key: 'garage',
    feature: FREE_LIMITS.garageVehicles === 1 ? '1 car' : `${FREE_LIMITS.garageVehicles} cars`,
    free: true,
    pro: true,
  },
  { key: 'fullHistory', feature: 'Full drive history', free: false, pro: true },
  { key: 'advancedTelemetry', feature: 'Cornering G & full telemetry', free: false, pro: true },
  { key: 'classBrackets', feature: 'Vehicle-class brackets', free: false, pro: true },
  { key: 'unlimitedFriends', feature: 'Unlimited friends', free: false, pro: true },
  { key: 'cleanShareCards', feature: 'Clean share cards', free: false, pro: true },
  { key: 'videoOverlay', feature: 'Telemetry overlay on your video', free: false, pro: true },
  { key: 'export', feature: 'GPX / CSV export', free: false, pro: true },
  { key: 'unlimitedGarage', feature: 'Unlimited garage', free: false, pro: true },
  { key: 'cloudSync', feature: 'Cloud sync & backup', free: false, pro: true },
];

/**
 * The onboarding paywall's honesty line, under "Share your best drives".
 *
 * Share cards are free in the matrix, so a paywall that led with them and
 * stopped there would be selling something nobody has to pay for; this says
 * what Pro actually adds. `claims` is what the sentence asserts, row by row,
 * and the test holds each one to PLAN_MATRIX — so a change to the matrix that
 * makes the sentence false fails a test rather than shipping.
 */
export const PAYWALL_PRO_NOTE = {
  text: 'The boards stay free. Pro adds your full history, cornering G, class brackets and clean share cards.',
  claims: {
    free: ['boardPlacement'],
    proOnly: ['fullHistory', 'advancedTelemetry', 'classBrackets', 'cleanShareCards'],
  },
} as const satisfies {
  text: string;
  claims: { free: readonly PlanFeatureKey[]; proOnly: readonly PlanFeatureKey[] };
};

export type ProPlan = 'monthly' | 'weekly';

/**
 * The ways Pro is sold, in the paywall's order; the first is preselected.
 * Monthly and weekly only, nothing longer, and no trial: what the Plans screen
 * promises (PRO_PRICING_NOTE) is checked against this list.
 */
export const PRO_PLANS: readonly { key: ProPlan; title: string; period: string }[] = [
  { key: 'monthly', title: 'Monthly', period: 'monthly' },
  { key: 'weekly', title: 'Weekly', period: 'weekly' },
];

/**
 * The Plans screen's pricing line. It used to promise "one monthly and one
 * annual price, 3-day free trial" and a paywall "only after your first
 * recorded drive"; the paywall offers neither an annual plan nor a trial, and
 * it ends onboarding. This says only what the paywall does.
 */
export const PRO_PRICING_NOTE =
  'Pro pricing lands after the first release: one weekly and one monthly price. No discount wheels, no one-time offers, and the paywall always has a close button.';
