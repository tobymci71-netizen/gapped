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
 * Set false and the onboarding flow routes straight from username to the app,
 * `safetyAccepted` stays false, and nothing else changes.
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
