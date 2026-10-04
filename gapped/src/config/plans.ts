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
  | 'unlimitedGarage'
  | 'cloudSync';

export type PlanFeature = { key: PlanFeatureKey; feature: string; free: boolean; pro: boolean };

export const PLAN_MATRIX: readonly PlanFeature[] = [
  { key: 'recordDrives', feature: 'Record unlimited drives', free: true, pro: true },
  { key: 'driveHistory', feature: 'View your own drive history', free: true, pro: true },
  { key: 'ownStats', feature: 'All your own stats (speed, G, 0–60)', free: true, pro: true },
  { key: 'export', feature: 'GPX / CSV export', free: true, pro: true },
  { key: 'shareCards', feature: 'Share cards', free: true, pro: true },
  { key: 'friends', feature: 'Friends & friends board', free: true, pro: true },
  { key: 'privacy', feature: 'Privacy zones & route trimming', free: true, pro: true },
  {
    key: 'boardPlacement',
    feature: 'Global & country leaderboard placement',
    free: false,
    pro: true,
  },
  { key: 'classBrackets', feature: 'Vehicle-class brackets', free: false, pro: true },
  { key: 'advancedTelemetry', feature: 'Advanced telemetry breakdowns', free: false, pro: true },
  { key: 'videoOverlay', feature: 'Telemetry overlay on your video', free: false, pro: true },
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
  text: 'Share cards stay free. Pro adds class brackets, board placement and deeper telemetry.',
  claims: {
    free: ['shareCards'],
    proOnly: ['classBrackets', 'boardPlacement', 'advancedTelemetry'],
  },
} as const satisfies {
  text: string;
  claims: { free: readonly PlanFeatureKey[]; proOnly: readonly PlanFeatureKey[] };
};
