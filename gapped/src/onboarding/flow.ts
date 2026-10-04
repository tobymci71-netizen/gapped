/**
 * The onboarding step list — the one place the order lives.
 *
 * docs/ONBOARDING.md is the contract; this is its table as data. Every step
 * asks `nextRoute` where to go rather than naming the next screen itself, so
 * reordering the flow, or switching a step off with a flag, is an edit here
 * and nowhere else. Before this file each screen hard-coded its successor and
 * its own "step N of 7", which is how a flag that removed a step left the bar
 * stopping short of full.
 *
 * Pure: no React, no router, no store. Route strings are plain literals so the
 * tests can run without expo-router; they are also valid typed-route hrefs, so
 * a screen can hand `nextRoute(...)` straight to `router.navigate`.
 */

import { ONBOARDING_PAYWALL, SAFETY_ACKNOWLEDGEMENT } from '@/config/flags';
import type { Attribution, Focus, VehicleKind } from '@/state/profile';

export type OnboardingRoute =
  | '/onboarding'
  | '/onboarding/ride'
  | '/onboarding/brand'
  | '/onboarding/garage'
  | '/onboarding/photo'
  | '/onboarding/unit'
  | '/onboarding/country'
  | '/onboarding/location'
  | '/onboarding/focus'
  | '/onboarding/focus-proof'
  | '/onboarding/username'
  | '/onboarding/trust'
  | '/onboarding/attribution'
  | '/onboarding/safety'
  | '/onboarding/setup'
  | '/onboarding/paywall';

export type OnboardingStepDef = {
  route: OnboardingRoute;
  /**
   * 1-based position on the progress bar, or null where the bar is hidden
   * (splash/carousel, setup, paywall). Derived from the order of the steps
   * that show it, never written by hand, so removing one renumbers the rest.
   */
  progress: number | null;
};

export type FlowOptions = {
  /** The road-safety acknowledgement step (SAFETY_ACKNOWLEDGEMENT). */
  safety: boolean;
  /** The Gapped Pro paywall after setup (ONBOARDING_PAYWALL). */
  paywall: boolean;
};

/**
 * Every step in order, with whether it shows the progress bar and which flag,
 * if any, can remove it. The safety step is the last question before setup by
 * rule (docs/ONBOARDING.md, rule 4), so switching it off shortens the bar from
 * the end and leaves every other step's number alone.
 */
const ALL_STEPS: readonly {
  route: OnboardingRoute;
  showsProgress: boolean;
  flag?: keyof FlowOptions;
}[] = [
  { route: '/onboarding', showsProgress: false },
  { route: '/onboarding/ride', showsProgress: true },
  { route: '/onboarding/brand', showsProgress: true },
  { route: '/onboarding/garage', showsProgress: true },
  { route: '/onboarding/photo', showsProgress: true },
  { route: '/onboarding/unit', showsProgress: true },
  { route: '/onboarding/country', showsProgress: true },
  { route: '/onboarding/location', showsProgress: true },
  { route: '/onboarding/focus', showsProgress: true },
  { route: '/onboarding/focus-proof', showsProgress: true },
  { route: '/onboarding/username', showsProgress: true },
  { route: '/onboarding/trust', showsProgress: true },
  { route: '/onboarding/attribution', showsProgress: true },
  { route: '/onboarding/safety', showsProgress: true, flag: 'safety' },
  { route: '/onboarding/setup', showsProgress: false },
  { route: '/onboarding/paywall', showsProgress: false, flag: 'paywall' },
];

export type OnboardingFlow = {
  steps: readonly OnboardingStepDef[];
  /** How many steps show the progress bar — the bar's 100%. */
  totalProgressSteps: number;
  /**
   * The step after `current`, or null when `current` is the last step and
   * onboarding should complete (completeOnboarding()). A route the flow does
   * not contain — a flagged-off step reached by a stale link — also returns
   * null rather than guessing.
   */
  nextRoute: (current: OnboardingRoute) => OnboardingRoute | null;
  /** The route's bar position, or null where the bar is hidden. */
  progressFor: (route: OnboardingRoute) => number | null;
};

/** Builds the flow for a given set of flags. Exported for the tests. */
export function createFlow(options: FlowOptions): OnboardingFlow {
  let n = 0;
  const steps: OnboardingStepDef[] = ALL_STEPS.filter((s) => !s.flag || options[s.flag]).map(
    (s) => ({ route: s.route, progress: s.showsProgress ? ++n : null }),
  );
  const index = new Map(steps.map((s, i) => [s.route, i]));

  return {
    steps,
    totalProgressSteps: n,
    nextRoute: (current) => {
      const i = index.get(current);
      if (i === undefined) return null;
      return steps[i + 1]?.route ?? null;
    },
    progressFor: (route) => {
      const i = index.get(route);
      return i === undefined ? null : steps[i].progress;
    },
  };
}

const FLOW = createFlow({ safety: SAFETY_ACKNOWLEDGEMENT, paywall: ONBOARDING_PAYWALL });

/** The steps this build runs, in order. */
export const ONBOARDING_STEPS = FLOW.steps;

/** 13, or 12 with SAFETY_ACKNOWLEDGEMENT off. The paywall never shows the bar. */
export const TOTAL_PROGRESS_STEPS = FLOW.totalProgressSteps;

/**
 * Where Continue goes from `current`. Null means "finish": the caller runs
 * completeOnboarding(), which flips the Stack.Protected guard in
 * app/_layout.tsx to the tabs. Screens should normally use
 * `useOnboardingAdvance` (./useOnboardingAdvance) rather than branching on
 * this themselves.
 */
export const nextRoute = FLOW.nextRoute;

/** The 1-based progress position for `route`, or null where the bar is hidden. */
export const progressFor = FLOW.progressFor;

/**
 * "car" or "bike", for copy that names the vehicle ("Add another car",
 * "Getting your car ready"). docs/ONBOARDING.md: choosing Motorbike swaps the
 * noun on the ride step and every step after it. Before a kind is chosen the
 * flow speaks about cars, which is what it leads with.
 */
export function vehicleNoun(kind: VehicleKind | null | undefined): 'car' | 'bike' {
  return kind === 'motorbike' ? 'bike' : 'car';
}

export type ChoiceOption<K extends string> = {
  key: K;
  /** The row's title, as printed. */
  label: string;
  /** The grey second line, where the design has one. */
  sublabel?: string;
  /**
   * What VoiceOver should say for `label` where the printed glyphs read badly
   * ("0–60", "X / Twitter"). Absent means the label already reads well.
   */
  spoken?: string;
};

/** "What matters to your drive?" — single select, required. */
export const FOCUS_OPTIONS: readonly ChoiceOption<Focus>[] = [
  { key: 'topSpeed', label: 'Top speed', sublabel: 'Track your verified top speed' },
  {
    key: 'zeroToSixty',
    label: '0–60',
    sublabel: 'Time your launches',
    spoken: 'Zero to sixty',
  },
  { key: 'localRanking', label: 'Local ranking', sublabel: 'See where you rank' },
  { key: 'beatFriends', label: 'Beat friends', sublabel: 'Compare real drive stats' },
];

/**
 * "How did you hear about us?" — single select, required. In the order the
 * design lists them; deliberately not alphabetical, and "Other" is not last,
 * matching the reference.
 */
export const ATTRIBUTION_OPTIONS: readonly ChoiceOption<Attribution>[] = [
  { key: 'tiktok', label: 'TikTok' },
  { key: 'appStore', label: 'App Store' },
  { key: 'friend', label: 'A friend' },
  { key: 'x', label: 'X / Twitter', spoken: 'X, formerly Twitter' },
  { key: 'other', label: 'Other' },
  { key: 'reddit', label: 'Reddit' },
  { key: 'youtube', label: 'YouTube' },
  { key: 'instagram', label: 'Instagram' },
];

/** The focus option for a key, for the focus-proof pill that repeats it. */
export function focusOption(key: Focus): ChoiceOption<Focus> {
  // FOCUS_OPTIONS covers every Focus; the test enforces it.
  return FOCUS_OPTIONS.find((o) => o.key === key) ?? FOCUS_OPTIONS[0];
}
