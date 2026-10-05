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
 *
 * Nothing here is shown while SHOW_PRO is off (src/config/flags.ts), which it
 * is until purchases work: /plans redirects, the paywall is never reached and
 * no screen draws a PRO chip. The rows stay so the locks
 * (src/lib/entitlements.ts) have something to enforce when it turns on.
 */

import { ONBOARDING_PAYWALL, SHOW_PRO } from './flags';

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
  | 'export'
  | 'unlimitedGarage';

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
 *
 * Every row is something the app does today. The matrix used to promise a
 * telemetry overlay on your video and restoring your drives on a new phone,
 * neither of which exists; a published plan is a promise, and a paid row
 * that cannot be delivered is one App Review rejects (2.1). They come back
 * when they are built, with a lock in src/lib/__tests__/proLocks.test.ts.
 */
export const PLAN_MATRIX: readonly PlanFeature[] = [
  { key: 'recordDrives', feature: 'Record unlimited drives', free: true, pro: true },
  { key: 'coreStats', feature: 'Top speed & 0–60, verified', free: true, pro: true },
  // Free: the board is the product. Onboarding sells it ("Each verified drive
  // is added to the board", "{n} drivers from {Country} are on the board"),
  // and a Free run that never placed would make those screens untrue.
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
  // Route trimming, not "privacy zones": the zone maths exists
  // (src/drive/privacy.ts) but nothing in the app lets anyone draw one. The
  // trimmed start and end are real, on every published route and share card.
  {
    key: 'privacy',
    feature: 'Route start & end trimmed for privacy',
    free: true,
    pro: true,
  },
  {
    key: 'garage',
    feature:
      FREE_LIMITS.garageVehicles === 1
        ? '1 car in your garage'
        : `${FREE_LIMITS.garageVehicles} cars in your garage`,
    free: true,
    pro: true,
  },
  { key: 'fullHistory', feature: 'Full drive history', free: false, pro: true },
  { key: 'advancedTelemetry', feature: 'Cornering G & full telemetry', free: false, pro: true },
  { key: 'classBrackets', feature: 'Vehicle-class brackets', free: false, pro: true },
  { key: 'unlimitedFriends', feature: 'Unlimited friends', free: false, pro: true },
  { key: 'cleanShareCards', feature: 'Clean share cards', free: false, pro: true },
  { key: 'export', feature: 'GPX / CSV export', free: false, pro: true },
  { key: 'unlimitedGarage', feature: 'Unlimited garage', free: false, pro: true },
];

/**
 * The onboarding paywall's pitch, under "See more in every drive": what Pro
 * adds, then what stays free.
 *
 * It used to be a small print line under "Share your best drives", there to
 * admit that share cards were free. Pro is depth now, so the depth is the
 * pitch, and the sentence that sells it is the one that is checked. `claims`
 * is what the sentence asserts, row by row, and the test holds each one to
 * PLAN_MATRIX and to a word in the text — so a change to the matrix that
 * makes the sentence false fails a test rather than shipping.
 */
export const PAYWALL_PRO_NOTE = {
  text: 'Pro adds your full drive history, cornering G, class brackets and clean share cards. Recording and the boards stay free.',
  claims: {
    free: ['recordDrives', 'boardPlacement'],
    proOnly: ['fullHistory', 'advancedTelemetry', 'classBrackets', 'cleanShareCards'],
  },
} as const satisfies {
  text: string;
  claims: { free: readonly PlanFeatureKey[]; proOnly: readonly PlanFeatureKey[] };
};

export type ProPlan = 'monthly' | 'weekly';

/**
 * The ways Pro is sold, in the paywall's order; the first is preselected.
 * Monthly and weekly only, nothing longer, and no trial.
 */
export const PRO_PLANS: readonly { key: ProPlan; title: string; period: string }[] = [
  { key: 'monthly', title: 'Monthly', period: 'monthly' },
  { key: 'weekly', title: 'Weekly', period: 'weekly' },
];

// ---------------------------------------------------------------------------
// Where the Pro surfaces lead. Pure, over an explicit flag that defaults to
// the build's, so both states are tested without rebuilding (plans.test.ts).

/**
 * Where a "leads to Pro" tap goes (useGoPro, src/components/ProBadge.tsx):
 * the published matrix while Pro is shown, and nowhere while it is not. A
 * tap that opened /plans with SHOW_PRO off would only bounce off its
 * redirect.
 */
export function goProRoute(showPro: boolean = SHOW_PRO): '/plans' | null {
  return showPro ? '/plans' : null;
}

/**
 * Where /plans sends someone instead of drawing the matrix, or null to draw
 * it. Kept as a screen for when Pro ships; until then a deep link or a stale
 * push lands on the You tab. Not onboarded, it is onboarding: /plans sits
 * outside both guards (app/_layout.tsx), and the tabs are behind one.
 */
export function plansRedirect(
  onboarded: boolean,
  showPro: boolean = SHOW_PRO,
): '/(tabs)/you' | '/onboarding' | null {
  if (showPro) return null;
  return onboarded ? '/(tabs)/you' : '/onboarding';
}

/**
 * Where the onboarding paywall sends someone when it is switched off, or null
 * to draw it. The flow never routes there with the flag off; this is for a
 * deep link. To the start of onboarding, not past its end: closing the
 * paywall finishes onboarding, so a link straight to it would otherwise skip
 * every step before it, the safety and terms steps among them.
 */
export function paywallRedirect(paywallOn: boolean = ONBOARDING_PAYWALL): '/onboarding' | null {
  return paywallOn ? null : '/onboarding';
}
