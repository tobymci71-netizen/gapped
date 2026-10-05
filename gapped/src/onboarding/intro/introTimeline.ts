/**
 * Step 0 of onboarding as numbers: the splash's beats, the carousel's pages
 * and the cornering demo's timeline. The welcome hero's own numbers are in
 * ./hero/heroMath.
 *
 * docs/ONBOARDING.md ("Steps", "Copy", "Sound") is the contract. The timings
 * come from the reference recording, measured frame by frame rather than
 * guessed: a ~0.4 s fade-in, a ~1.5 s hold, a ~0.8 s needle sweep and one
 * ~2 s cornering interpolation that holds its end pose.
 *
 * Pure: no React, no Reanimated, no native modules, so the tests run without
 * a device. The functions the UI thread calls every frame are worklets and
 * allocate nothing.
 */

import { SHOW_PRO } from '@/config/flags';
import type { PlanFeatureKey } from '@/config/plans';
import type { VehicleKind } from '@/state/profile';
import { vehicleNoun } from '../flow';

// ─── Splash ──────────────────────────────────────────────────────────────────

/** The splash's G mark fades in from this scale to 1 (the reference's ~0.96). */
export const SPLASH_START_SCALE = 0.96;

/**
 * How long the landed mark holds before it rises into the welcome scene.
 * Measured from the reference, where its wordmark sat for ~1.5 s
 * after landing while the sting rang out. The sting decays to silence at
 * 1.5 s too (scripts/generate-sting.py), so the move starts as it ends.
 */
export const SPLASH_HOLD_MS = 1500;

/**
 * A sting that cannot start within this long of the mark landing is
 * dropped. Arriving late, over the move into the header, it would mark a
 * moment that has already passed; silence is better than a sound out of sync.
 */
export const STING_GRACE_MS = 250;

/** A view's frame in window coordinates, as `measureInWindow` reports it. */
export type Rect = { x: number; y: number; width: number; height: number };

/** How the splash mark travels: centre to centre, scaling to fit. */
export type Landing = { dx: number; dy: number; scale: number };

/**
 * The transform that lays the splash mark exactly over the hero's.
 *
 * Both are the same artwork, so the ratio of their widths is the ratio of
 * their sizes. Scaling happens about the view's centre, so moving the centres
 * together is the whole translation. Null when either frame has not been laid
 * out: the caller crossfades instead, which is also the reduced-motion path.
 */
export function landingFor(from: Rect | null, to: Rect | null): Landing | null {
  if (!from || !to) return null;
  if (!(from.width > 0) || !(to.width > 0)) return null;
  const centre = (r: Rect) => ({ x: r.x + r.width / 2, y: r.y + r.height / 2 });
  const a = centre(from);
  const b = centre(to);
  return { dx: b.x - a.x, dy: b.y - a.y, scale: to.width / from.width };
}

// ─── Carousel ────────────────────────────────────────────────────────────────

export type IntroPageKey = 'welcome' | 'stack' | 'corner' | 'built';

export type IntroPageCopy = {
  key: IntroPageKey;
  title: string;
  subtitle: string | null;
  /** What VoiceOver should say for the subtitle where "0–60" reads badly. */
  spokenSubtitle?: string;
  /** The footer button's label on this page. */
  cta: string;
  /**
   * The Pro-only PLAN_MATRIX row this page demos, if any. While Pro is shown
   * (SHOW_PRO), the page wears the PRO chip over its title and VoiceOver
   * hears "Gapped Pro" with it (marksPro). This marks which plan the feature
   * is in, as the Plans screen's PRO column does, not whether this account
   * can use it. The test holds it to the matrix.
   */
  proFeature?: PlanFeatureKey;
};

/** The welcome statement, one sentence a line; the last is lit (red). */
export const WELCOME_LINES = ['Every drive.', 'Measured.', 'Verified.'] as const;

/**
 * docs/ONBOARDING.md, "Carousel". Gapped's words, in the reference's shape.
 *
 * What these pages promise for every drive has to be in Free (PLAN_MATRIX,
 * src/config/plans.ts): the first page used to say "Top speed, 0–60 and every
 * corner", and cornering G is Pro. The cornering demo stays, as page 3, and
 * says it is Pro whenever Pro is shown.
 *
 * Calm, and about the person's own drives: these are public roads, and
 * nothing here makes a speed a contest. The welcome (Nightrun-Welcome) names
 * no figure at all: it says every drive is measured and verified, and how —
 * GPS, then a check on the server before anything counts. "Before it counts"
 * rather than the mock's "so every number you see is real": two pages on,
 * the board card may show labelled sample rows, and the first screen should
 * not promise more than the app does.
 */
export const INTRO_PAGES: readonly IntroPageCopy[] = [
  {
    key: 'welcome',
    title: WELCOME_LINES.join(' '),
    subtitle: 'Gapped logs each drive with GPS and checks it on our servers before it counts.',
    cta: 'Get started',
  },
  {
    key: 'stack',
    title: 'See where you stack up',
    subtitle: 'Your drives. Your friends. Your place on the board.',
    cta: 'Next',
  },
  {
    key: 'corner',
    title: 'See more in every drive.',
    subtitle: null,
    cta: 'Next',
    proFeature: 'advancedTelemetry',
  },
  {
    key: 'built',
    title: 'Built by drivers',
    subtitle: 'From drivers. For drivers.',
    cta: 'Set up my car',
  },
];

export const INTRO_PAGE_COUNT = INTRO_PAGES.length;

/**
 * The footer label for a page. The last one names the vehicle: someone who
 * chose Motorbike on the ride step and came Back to the carousel is setting up
 * a bike, and "Set up my car" would say otherwise.
 */
export function ctaFor(page: number, kind: VehicleKind | null | undefined): string {
  const copy = INTRO_PAGES[clampPage(page, INTRO_PAGE_COUNT)];
  return copy.key === 'built' ? `Set up my ${vehicleNoun(kind)}` : copy.cta;
}

/** How a Pro page names the plan aloud, where the chip is only seen. */
const PRO_SPOKEN = 'Gapped Pro';

/**
 * Whether a page wears the PRO chip and names the plan aloud: it demos a
 * Pro-only row, and Pro is shown at all (SHOW_PRO). With Pro hidden, as it
 * is until purchases work, every account has every feature, and a chip or a
 * spoken "Gapped Pro" would name a plan nobody can buy.
 *
 * `showPro` defaults to the build's flag; the tests pass both.
 */
export function marksPro(copy: IntroPageCopy, showPro: boolean = SHOW_PRO): boolean {
  return showPro && copy.proFeature != null;
}

/**
 * The page's title as VoiceOver reads it: a Pro page says so first, in the
 * order the chip and the title are drawn. The PRO chip itself is hidden from
 * VoiceOver (src/components/ProBadge.tsx), so this is where it is heard.
 */
export function spokenTitle(copy: IntroPageCopy, showPro: boolean = SHOW_PRO): string {
  return marksPro(copy, showPro) ? `${PRO_SPOKEN}. ${copy.title}` : copy.title;
}

/**
 * What VoiceOver announces when the button, not a swipe, changes the page.
 * The button keeps focus, so without this the new page arrives in silence.
 */
export function pageAnnouncement(page: number, showPro: boolean = SHOW_PRO): string {
  const i = clampPage(page, INTRO_PAGE_COUNT);
  const title = spokenTitle(INTRO_PAGES[i], showPro).replace(/\.$/, '');
  return `${title}. Page ${i + 1} of ${INTRO_PAGE_COUNT}.`;
}

function clampPage(page: number, count: number): number {
  'worklet';
  return Math.min(count - 1, Math.max(0, Math.round(page)));
}

export function clamp01(x: number): number {
  'worklet';
  return x < 0 ? 0 : x > 1 ? 1 : x;
}

/**
 * The first page carries the G mark (the hero's, which the splash lands on)
 * and the rest carry the page dots, as the reference trades its wordmark for
 * dots. They trade places with the finger: the mark is gone by the middle of
 * the first swipe and the dots arrive over its second half, so the two never
 * overprint. `pos` is the scroll offset in pages (0 = first page, 1.5 =
 * halfway from the second to the third).
 */
export function wordmarkOpacity(pos: number): number {
  'worklet';
  return 1 - clamp01(pos * 2);
}

export function dotsOpacity(pos: number): number {
  'worklet';
  return clamp01(pos * 2 - 1);
}

/** 1 for the page in view, falling to 0 one page away: the active dot's pill. */
export function dotEmphasis(pos: number, index: number): number {
  'worklet';
  return clamp01(1 - Math.abs(pos - index));
}

/** The page most in view: the page the button acts on and VoiceOver reads. */
export function nearestPage(pos: number, count: number): number {
  'worklet';
  return clampPage(pos, count);
}

/**
 * Bit i is set while any of page i is on screen. A page off screen can reset
 * its demo unseen, and one coming on screen can start it as it slides in.
 * Sub-pixel slivers left by paging count as off.
 */
export function onScreenMask(pos: number, count: number): number {
  'worklet';
  let mask = 0;
  for (let i = 0; i < count; i++) {
    if (Math.abs(pos - i) < 0.995) mask |= 1 << i;
  }
  return mask;
}

export function isOnScreen(mask: number, page: number): boolean {
  return (mask & (1 << page)) !== 0;
}

// ─── Page 3: the cornering demo ──────────────────────────────────────────────

/** The one interpolation that drives every moving part of the demo. */
export const CORNERING_DEMO_MS = 2000;

/**
 * The demo's numbers (docs/ONBOARDING.md, "Carousel" 3). Signed g: positive is
 * a right-hand corner, negative a left.
 *
 * The reference swung its marker across zero while its number only rose, and
 * raised its LEFT peak during a RIGHT-hand lean, so number, marker and peaks
 * disagreed with each other mid-swing. Gapped's demo is internally true at
 * every frame: the car enters a right-hander already pulling 0.12 g and builds
 * to 0.94 g. The hero number and the marker read the same value throughout.
 * The right peak is the most rightward g so far, which on a rising timeline is
 * the live value. The left peak, 0.88 g, was set in an earlier corner, so it
 * holds: a peak only changes when it is beaten, and a left one cannot be
 * beaten while turning right.
 */
export const CORNERING_START_G = 0.12;
export const CORNERING_END_G = 0.94;
export const CORNERING_LEFT_PEAK_G = 0.88;

/** The arc's reach each side: 1.0 g at the ends, 0.5 g halfway, 0 at the top. */
export const GAUGE_MAX_G = 1;

export const GAUGE_LABELS: readonly { g: number; text: string }[] = [
  { g: -1, text: '1.0' },
  { g: -0.5, text: '0.5' },
  { g: 0, text: '0' },
  { g: 0.5, text: '0.5' },
  { g: 1, text: '1.0' },
];

/**
 * Body roll per g of cornering, degrees. A road car rolls a few degrees at
 * the limit; 5°/g puts this one at 4.7° on the final frame. A car rolls AWAY
 * from the corner (a motorbike leans into it), so a right-hander tips the
 * roof left: counter-clockwise, seen from behind.
 */
export const ROLL_DEG_PER_G = 5;

/** The lateral g at timeline progress `p` (0 → 1, already eased). */
export function corneringG(p: number): number {
  'worklet';
  return CORNERING_START_G + (CORNERING_END_G - CORNERING_START_G) * clamp01(p);
}

/** The right-hand peak at `p`: the most rightward g so far. */
export function rightPeakG(p: number): number {
  'worklet';
  return Math.max(0, corneringG(p));
}

function clampG(g: number): number {
  'worklet';
  return Math.max(-GAUGE_MAX_G, Math.min(GAUGE_MAX_G, g));
}

/** The marker's angle in radians, clockwise from 12 o'clock. ±1 g is ±90°. */
export function gaugeAngle(g: number): number {
  'worklet';
  return (clampG(g) / GAUGE_MAX_G) * (Math.PI / 2);
}

/**
 * How far along the arc `g` sits, as a fraction of the path. The arc is drawn
 * left end to right end over the top, so −1 g is 0, zero is 0.5 and +1 g is 1.
 */
export function arcPosition(g: number): number {
  'worklet';
  return (clampG(g) / GAUGE_MAX_G + 1) / 2;
}

/** The lit stretch of arc runs from zero to the marker, on whichever side. */
export function litStart(g: number): number {
  'worklet';
  return Math.min(0.5, arcPosition(g));
}

export function litEnd(g: number): number {
  'worklet';
  return Math.max(0.5, arcPosition(g));
}

/** Body roll in degrees, screen-clockwise positive (see ROLL_DEG_PER_G). */
export function bodyRollDeg(g: number): number {
  'worklet';
  return -clampG(g) * ROLL_DEG_PER_G;
}

/**
 * A point on the gauge at `radius` from the centre, at the angle for `g`, for
 * placing ticks and scale labels.
 */
export function pointOnGauge(
  cx: number,
  cy: number,
  radius: number,
  g: number,
): { x: number; y: number } {
  const a = gaugeAngle(g);
  return { x: cx + radius * Math.sin(a), y: cy - radius * Math.cos(a) };
}

/**
 * g in hundredths, the unit the readouts change in. The UI thread hands the
 * JS thread a new number only when this changes, about 80 times over the
 * whole demo rather than once a frame.
 */
export function gHundredths(g: number): number {
  'worklet';
  return Math.round(g * 100);
}

/** "0.94": two decimals, the precision the drive summary reports g to. */
export function formatG(hundredths: number): string {
  return (hundredths / 100).toFixed(2);
}

/**
 * The demo as one VoiceOver label. The gauge is a picture of a reading, not a
 * reading, so it says so first, and gives the end state the animation holds.
 * While Pro is shown it names the plan too: someone who swipes straight onto
 * the gauge has not heard the title's "Gapped Pro", and cornering G is Pro.
 * With Pro hidden it is just a demo.
 */
export function corneringDemoLabel(showPro: boolean = SHOW_PRO): string {
  return (
    `${showPro ? `${PRO_SPOKEN} demo` : 'Demo'}. ` +
    `Cornering G: ${formatG(gHundredths(CORNERING_END_G))} g through a right-hand corner. ` +
    `Peak cornering G: left ${formatG(gHundredths(CORNERING_LEFT_PEAK_G))} g, ` +
    `right ${formatG(gHundredths(CORNERING_END_G))} g.`
  );
}

/** The cornering demo's label in this build. */
export const CORNERING_DEMO_LABEL = corneringDemoLabel();
