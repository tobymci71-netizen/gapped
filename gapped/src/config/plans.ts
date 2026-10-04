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
  | 'recordDrives'
  | 'driveHistory'
  | 'ownStats'
  | 'export'
  | 'shareCards'
  | 'friends'
  | 'privacy'
  | 'boardPlacement'
  | 'classBrackets'
  | 'advancedTelemetry'
  | 'videoOverlay'
  | 'garage'
  | 'unlimitedGarage'
  | 'cloudSync';

export type PlanFeature = { key: PlanFeatureKey; feature: string; free: boolean; pro: boolean };

/**
 * How many vehicles a Free garage holds, the main one included. Onboarding's
 * "Add another car" stops here (app/onboarding/garage.tsx); Pro lifts it.
 */
export const FREE_GARAGE_VEHICLES = 3;

export const PLAN_MATRIX: readonly PlanFeature[] = [
  { key: 'recordDrives', feature: 'Record unlimited drives', free: true, pro: true },
  { key: 'driveHistory', feature: 'View your own drive history', free: true, pro: true },
  { key: 'ownStats', feature: 'All your own stats (speed, G, 0–60)', free: true, pro: true },
  { key: 'export', feature: 'GPX / CSV export', free: true, pro: true },
  { key: 'shareCards', feature: 'Share cards', free: true, pro: true },
  { key: 'friends', feature: 'Friends & friends board', free: true, pro: true },
  { key: 'privacy', feature: 'Privacy zones & route trimming', free: true, pro: true },
  // Free: the board is the product. Onboarding sells it ("Every verified run
  // lands on the board", "{n} drivers from {Country} are on the board"), and
  // a Free run that never placed would make those screens untrue.
  {
    key: 'boardPlacement',
    feature: 'Global & country leaderboard placement',
    free: true,
    pro: true,
  },
  { key: 'classBrackets', feature: 'Vehicle-class brackets', free: false, pro: true },
  { key: 'advancedTelemetry', feature: 'Advanced telemetry breakdowns', free: false, pro: true },
  { key: 'videoOverlay', feature: 'Telemetry overlay on your video', free: false, pro: true },
  {
    key: 'garage',
    feature: `Up to ${FREE_GARAGE_VEHICLES} garage vehicles`,
    free: true,
    pro: true,
  },
  { key: 'unlimitedGarage', feature: 'Unlimited garage vehicles', free: false, pro: true },
  { key: 'cloudSync', feature: 'Cloud sync across devices', free: false, pro: true },
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
  text: 'Share cards and the boards stay free. Pro adds class brackets, deeper telemetry and a bigger garage.',
  claims: {
    free: ['shareCards', 'boardPlacement'],
    proOnly: ['classBrackets', 'advancedTelemetry', 'unlimitedGarage'],
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
