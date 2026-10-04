/**
 * Build-time feature flags.
 *
 * These are plain constants, not remote config: flipping one is a code change
 * and a build, which is the point. A flag that can change under a shipped app
 * is a behaviour that cannot be reviewed.
 */

/**
 * Show the road-legal acknowledgement during onboarding.
 *
 * Gapped puts a public top-speed leaderboard on top of public roads. That is a
 * product risk and an App Store review risk, and the product call about how to
 * resolve it has not been made. This is the reversible minimum: a single
 * acknowledgement screen that costs one tap and can be removed by setting this
 * to false — no routes deleted, no state removed, nothing to unpick.
 *
 * Set false and the onboarding flow (src/onboarding/flow.ts) goes straight from
 * the attribution question to setup, the progress bar counts 12 steps instead
 * of 13, `safetyAccepted` stays false, and nothing else changes.
 */
export const SAFETY_ACKNOWLEDGEMENT = true;

/**
 * The rule the drive HUD is held to, stated where it can be found.
 *
 * NOTHING in the app may prompt, nudge, congratulate or notify toward speed
 * while a drive is in progress. Live speed on the HUD is fine — it is a
 * speedometer, and hiding it would make the app less safe, not more. What is
 * not fine is anything that rewards a number going up in the moment: a "new
 * personal best!" toast at 90 mph, a haptic when a record falls, a
 * notification, a streak nudge.
 *
 * As of this constant, the app complies: the only celebratory haptic
 * (`haptic.personalBest`) fires from a `lastSummary` effect, which runs when a
 * drive FINALISES, and there are no notifications in the project at all.
 *
 * This is a constraint on new code, not a switch. It is a constant so that a
 * search for it lands here.
 */
export const NO_IN_DRIVE_SPEED_NUDGES = true;

/**
 * Show the Gapped Pro paywall at the end of onboarding.
 *
 * Off until RevenueCat is wired. The paywall's purchase and restore are stubs,
 * and a TestFlight or App Store build must not ship a button that cannot
 * charge — so with this false, "You're all set" finishes onboarding directly
 * and the paywall route is never reached. Even when on, the paywall is always
 * dismissible: closing it completes onboarding exactly as buying would
 * (docs/ONBOARDING.md, rule 5).
 */
export const ONBOARDING_PAYWALL = false;

/**
 * Display strings for the paywall's plan cards, in GBP.
 *
 * PLACEHOLDERS. Nothing has been priced: these exist so the plan cards can be
 * laid out, and they are replaced by RevenueCat's localised `priceString`s when
 * purchases are wired. There is deliberately no reference or struck-through
 * "was" price — Gapped's first screens must not invent a discount any more than
 * a number (docs/ONBOARDING.md, rule 1). Only read when ONBOARDING_PAYWALL is
 * true.
 */
export const PAYWALL_PLACEHOLDER_PRICES = {
  yearly: '£29.99 / year',
  weekly: '£2.99 / week',
} as const;
