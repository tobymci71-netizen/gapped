import React, { useEffect, useState } from 'react';
import { StyleSheet, useWindowDimensions, View, type LayoutChangeEvent } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withTiming,
} from 'react-native-reanimated';
import { Numeral, OnSurface, Text } from '@/components/Text';
import { countryByCode } from '@/data/countries';
import { speedForDisplay, type UnitPref } from '@/drive/units';
import { useReducedMotion } from '@/lib/useReducedMotion';
import { focusOption } from '@/onboarding/flow';
import type { Focus } from '@/state/profile';
import { duration, easing } from '@/theme/motion';
import { color, font, glyph, radius, space, textStyle, type } from '@/theme/tokens';
import { countryInSentence } from './countryCopy';
import {
  PROOF_POINTS,
  SAMPLE_FRIENDS,
  SAMPLE_RANK,
  SAMPLE_TOP_SPEED_ROW,
  SAMPLE_ZERO_SIXTY_S,
  rankPosition,
  type ProofPoint,
} from './focusProof';
import { FocusIcon } from './FocusRow';
import { CheckIcon, PodiumIcon, PulseIcon, TrendIcon } from './icons';
import { easeOutCubic, useCountUp, useProgress } from './useCountUp';

/**
 * What the focus proof takes from the person: their kind of vehicle, their
 * unit and their country. Never their car itself — every figure on these
 * cards is a labelled sample, and a sample figure beside their real car would
 * read as a claim about it (focusProof.ts, SAMPLE_TOP_SPEED_ROW).
 */
export type ProofContext = {
  noun: 'car' | 'bike';
  unitPref: UnitPref;
  country: string | null;
};

/** The appear motion: ~0.5 s, decelerating, as the reference's bars grow. */
const APPEAR = duration.slow;
/** "Grey first, lime a beat later." */
const BEAT = duration.fast;

/**
 * Ceiling on how far the small capitals (SAMPLE, VERIFIED, YOUR FOCUS) scale,
 * as the board caps its row chips: they are labels on a badge, not reading
 * text, and at the accessibility sizes they outgrew the card they label.
 */
const TAG_MAX_SCALE = 2;

/**
 * Ceiling on the cards' display figures (127, 5.02, #7), as on the
 * carousel's cornering card: uncapped, "5.02" at the largest text size was
 * wider than the card. The words around them scale freely.
 */
const FIGURE_MAX_SCALE = 1.5;

/**
 * Past this text scale, rows that sit side by side stack instead (the
 * carousel's board card switches at the same point): three proof marks in a
 * row broke "Progress" mid-word, and the board row's name was squeezed to a
 * letter a line by its figure.
 */
const LARGE_TEXT = 1.5;

/**
 * The focus proof's visual, one per focus (docs/ONBOARDING.md, "Focus proof").
 * Each animates in once when the step appears and then holds still; reduced
 * motion gets the end state. Every figure on these cards is a sample, says so
 * on the card, and says so first to VoiceOver.
 *
 * `play` is the step having arrived (./useArrival). Until then every visual
 * holds its start state, so the half-second of growth happens where it can be
 * seen rather than under the push transition.
 */
export function FocusProofVisual({
  focus,
  context,
  play,
}: {
  focus: Focus;
  context: ProofContext;
  play: boolean;
}) {
  switch (focus) {
    case 'topSpeed':
      return <TopSpeedCard context={context} play={play} />;
    case 'zeroToSixty':
      return <ZeroSixtyCard play={play} />;
    case 'localRanking':
      return <RankCard context={context} play={play} />;
    case 'beatFriends':
      return <FriendsCard context={context} play={play} />;
  }
}

/** The pill at the top that repeats the answer just given. */
export function FocusPill({ focus }: { focus: Focus }) {
  const option = focusOption(focus);
  return (
    <View
      style={styles.pill}
      accessible
      accessibilityLabel={`Your focus: ${option.spoken ?? option.label}`}
    >
      <FocusIcon focus={focus} size={16} tint={color.accent} />
      <Text variant="caption" style={styles.pillLabel}>
        {option.label}
      </Text>
      <Text style={styles.pillEyebrow} maxFontSizeMultiplier={TAG_MAX_SCALE}>
        YOUR FOCUS
      </Text>
    </View>
  );
}

const POINT_ICON: Record<ProofPoint, (p: { color: string }) => React.JSX.Element> = {
  'Real drive data': PulseIcon,
  'Progress history': TrendIcon,
  'Ranking context': PodiumIcon,
};

/** The three lime marks under every variant. */
export function ProofPoints() {
  const large = useWindowDimensions().fontScale > LARGE_TEXT;
  return (
    <View style={[styles.points, large && styles.pointsLarge]}>
      {PROOF_POINTS.map((p) => {
        const Icon = POINT_ICON[p];
        return (
          <View key={p} style={[styles.point, large && styles.pointLarge]} accessible accessibilityLabel={p}>
            <Icon color={color.accent} />
            {/* legal, a step under caption: at caption size "Progress history"
                broke onto two lines in a third of a 375pt screen. */}
            <Text variant="legal" style={[styles.pointLabel, large && styles.pointLabelLarge]}>
              {p}
            </Text>
          </View>
        );
      })}
    </View>
  );
}

// ─── shared pieces ─────────────────────────────────────────────────────────

function SampleTag() {
  return (
    <View style={styles.sampleTag}>
      <Text style={styles.sampleText} maxFontSizeMultiplier={TAG_MAX_SCALE}>
        SAMPLE
      </Text>
    </View>
  );
}

function Card({
  title,
  label,
  children,
}: {
  title: React.ReactNode;
  /** What VoiceOver reads for the whole card, starting with "Sample". */
  label: string;
  children: React.ReactNode;
}) {
  // At large sizes the tag takes its own line above the title: beside it, it
  // squeezed "Friends · top speed" to a word a line and broke "Friends".
  const large = useWindowDimensions().fontScale > LARGE_TEXT;
  return (
    <View style={styles.card} accessible accessibilityRole="image" accessibilityLabel={label}>
      <OnSurface>
        <View style={[styles.cardHead, large && styles.cardHeadLarge]}>
          <View style={[styles.cardTitle, large && styles.cardTitleLarge]}>{title}</View>
          <SampleTag />
        </View>
        {children}
      </OnSurface>
    </View>
  );
}

/**
 * A shared value that runs 0 → 1 once, `delay` after `play` turns true, and
 * holds at 0 until then.
 */
function useAppear(play: boolean, delay = 0, ms: number = APPEAR) {
  const reduced = useReducedMotion();
  const v = useSharedValue(reduced ? 1 : 0);
  useEffect(() => {
    if (reduced) {
      v.set(1);
      return;
    }
    if (!play) return;
    v.set(withDelay(delay, withTiming(1, { duration: ms, easing: easing.decel })));
  }, [reduced, play, delay, ms, v]);
  return v;
}

function displaySpeed(ms: Parameters<typeof speedForDisplay>[0], unitPref: UnitPref) {
  const { value, unit } = speedForDisplay(ms, unitPref);
  return { value: Math.round(value), unit };
}

function VerifiedChip({ play, delay }: { play: boolean; delay: number }) {
  const v = useAppear(play, delay, duration.base);
  // Set down rather than popped: a small settle in scale, no overshoot.
  const style = useAnimatedStyle(() => ({
    opacity: v.get(),
    transform: [{ scale: 0.92 + 0.08 * v.get() }],
  }));
  return (
    <Animated.View style={[styles.verified, style]}>
      <CheckIcon size={12} color={color.verified} />
      <Text style={styles.verifiedText} maxFontSizeMultiplier={TAG_MAX_SCALE}>
        VERIFIED
      </Text>
    </Animated.View>
  );
}

// ─── Top speed: a board row with the VERIFIED chip ─────────────────────────

function TopSpeedCard({ context, play }: { context: ProofContext; play: boolean }) {
  const { value, unit } = displaySpeed(SAMPLE_TOP_SPEED_ROW.topSpeed, context.unitPref);
  const shown = useCountUp(value, APPEAR, play);
  const large = useWindowDimensions().fontScale > LARGE_TEXT;
  return (
    <Card
      label={`Sample board row: ${SAMPLE_TOP_SPEED_ROW.name}, ${SAMPLE_TOP_SPEED_ROW.vehicle}, ${value} ${unit}, verified.`}
      title={
        <>
          <View style={styles.liveDot} />
          <Text variant="caption" style={styles.cardTitleText}>
            Top speed
          </Text>
        </>
      }
    >
      <View style={[styles.boardRow, large && styles.boardRowLarge]}>
        <View style={[styles.boardWho, large && styles.boardWhoLarge]}>
          <Text variant="bodyMedium" numberOfLines={2}>
            {SAMPLE_TOP_SPEED_ROW.name}
          </Text>
          <Text variant="caption">{SAMPLE_TOP_SPEED_ROW.vehicle}</Text>
        </View>
        <View style={[styles.boardValue, large && styles.boardValueLarge]}>
          <View style={styles.valueLine}>
            <Numeral size={glyph.display.size} maxFontSizeMultiplier={FIGURE_MAX_SCALE}>
              {Math.round(shown)}
            </Numeral>
            <Text variant="caption" maxFontSizeMultiplier={FIGURE_MAX_SCALE}>
              {unit}
            </Text>
          </View>
          {/* Lands once the figure has: counted, then checked. */}
          <VerifiedChip play={play} delay={APPEAR} />
        </View>
      </View>
    </Card>
  );
}

// ─── 0–60: a sample timer running to 60 ────────────────────────────────────

/** The run, compressed: a stopwatch at real speed would hold the step for five seconds. */
const LAUNCH_MS = duration.epic + duration.base;

function ZeroSixtyCard({ play }: { play: boolean }) {
  const t = useProgress(LAUNCH_MS, play);
  // The clock runs straight; the speed climbs fast and tapers, as a launch does.
  const seconds = (SAMPLE_ZERO_SIXTY_S * t).toFixed(2);
  const speed = easeOutCubic(t);
  return (
    <Card
      label={`Sample launch: zero to sixty miles per hour in ${SAMPLE_ZERO_SIXTY_S} seconds, from a standstill of at least two seconds with a one-foot rollout.`}
      title={
        <Text variant="caption" style={styles.cardTitleText}>
          0–60 mph
        </Text>
      }
    >
      {/* The rules beside the clock, as an instrument would print its
          conditions next to the reading: the time only counts because of them. */}
      <View style={styles.timerRow}>
        <View style={styles.timer}>
          <Numeral
            size={type.heroNumeral.size}
            color={t >= 1 ? color.accent : color.text1}
            maxFontSizeMultiplier={FIGURE_MAX_SCALE}
          >
            {seconds}
          </Numeral>
          <Text variant="body" maxFontSizeMultiplier={FIGURE_MAX_SCALE}>
            s
          </Text>
        </View>
        <View style={styles.rules}>
          {/* No-break spaces: a figure and its unit stay on one line. */}
          {['Standstill ≥\u00A02\u00A0s', '1\u00A0ft rollout'].map((r) => (
            <View key={r} style={styles.rule}>
              <CheckIcon size={12} color={color.accent} />
              <Text variant="caption" style={styles.ruleText}>
                {r}
              </Text>
            </View>
          ))}
        </View>
      </View>
      <View style={styles.track}>
        <View style={[styles.trackFill, { width: `${speed * 100}%` }]} />
      </View>
      <View style={styles.trackLabels}>
        <Text variant="caption">0</Text>
        <Text variant="caption">60 mph</Text>
      </View>
    </Card>
  );
}

// ─── Local ranking: a sample rank card ─────────────────────────────────────

function RankCard({ context, play }: { context: ProofContext; play: boolean }) {
  const country = countryByCode(context.country);
  const [trackWidth, setTrackWidth] = useState(0);
  const v = useAppear(play, BEAT);
  const target = rankPosition(SAMPLE_RANK.rank, SAMPLE_RANK.of);
  // Comes in from the back of the field and settles at its place.
  const marker = useAnimatedStyle(() => ({
    opacity: v.get(),
    transform: [{ translateX: trackWidth * (1 - (1 - target) * v.get()) }],
  }));
  const where = country ? countryInSentence(country) : 'your country';
  return (
    <Card
      label={`Sample rank card: number ${SAMPLE_RANK.rank} of ${SAMPLE_RANK.of} in ${where}, among ${context.noun}s like yours.`}
      title={
        <Text variant="caption" style={styles.cardTitleText} numberOfLines={2}>
          {country ? `${country.flag} ${country.name}` : 'Your country'}
        </Text>
      }
    >
      <View style={styles.rankLine}>
        <Numeral size={type.heroNumeral.size} color={color.accent} maxFontSizeMultiplier={FIGURE_MAX_SCALE}>
          #{SAMPLE_RANK.rank}
        </Numeral>
        <Text variant="body">
          of {SAMPLE_RANK.of} {context.noun}s like yours
        </Text>
      </View>
      <View
        style={styles.rankTrack}
        onLayout={(e: LayoutChangeEvent) => setTrackWidth(e.nativeEvent.layout.width)}
      >
        <View style={styles.rankRail} />
        <Animated.View style={[styles.rankMarker, marker]} />
      </View>
      <View style={styles.trackLabels}>
        <Text variant="caption">#1</Text>
        <Text variant="caption">#{SAMPLE_RANK.of}</Text>
      </View>
    </Card>
  );
}

// ─── Beat friends: a sample friends board ──────────────────────────────────

function FriendsCard({ context, play }: { context: ProofContext; play: boolean }) {
  const rows = SAMPLE_FRIENDS.map((f) => ({ ...f, ...displaySpeed(f.topSpeed, context.unitPref) }));
  const max = Math.max(...rows.map((r) => r.value));
  const spoken = rows.map((r) => `${r.you ? 'you' : r.name}, ${r.value} ${r.unit}`).join('; ');
  return (
    <Card
      label={`Sample friends board, top speed: ${spoken}.`}
      title={
        <Text variant="caption" style={styles.cardTitleText}>
          Friends · top speed
        </Text>
      }
    >
      <View style={styles.friends}>
        {rows.map((r) => (
          <FriendRow
            key={r.name}
            name={r.you ? 'You' : r.name}
            value={`${r.value} ${r.unit}`}
            share={r.value / max}
            you={!!r.you}
            play={play}
          />
        ))}
      </View>
    </Card>
  );
}

function FriendRow({
  name,
  value,
  share,
  you,
  play,
}: {
  name: string;
  value: string;
  share: number;
  you: boolean;
  play: boolean;
}) {
  // Grey bars first, then yours a beat later: the eye lands on it last.
  const v = useAppear(play, you ? BEAT : 0);
  const bar = useAnimatedStyle(() => ({ transform: [{ scaleX: share * v.get() }] }));
  return (
    <View style={styles.friend}>
      {/* Chart labels, capped as the board caps its figures: uncapped, the
          largest sizes cut "sample_friend_1" to "samp…", which is the one part
          of the name that says it is not a person. Wraps rather than cuts. */}
      <View style={styles.friendHead}>
        <Text
          variant="caption"
          style={you ? styles.you : styles.friendName}
          maxFontSizeMultiplier={TAG_MAX_SCALE}
        >
          {name}
        </Text>
        <Text
          variant="caption"
          style={you ? styles.you : styles.friendName}
          maxFontSizeMultiplier={TAG_MAX_SCALE}
        >
          {value}
        </Text>
      </View>
      <View style={styles.barTrack}>
        <Animated.View style={[styles.bar, you && styles.barYou, bar]} />
      </View>
    </View>
  );
}

const BAR = 8;

const styles = StyleSheet.create({
  pill: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'center',
    // At the largest text sizes the label and YOUR FOCUS wrap inside the pill
    // rather than running off both edges of the screen.
    maxWidth: '100%',
    columnGap: space.sm,
    minHeight: 36,
    paddingHorizontal: space.md,
    paddingVertical: space.xs,
    borderRadius: radius.pill,
    backgroundColor: color.surface2,
  },
  pillLabel: { color: color.text1, fontFamily: font.bodySemibold },
  pillEyebrow: { ...textStyle(glyph.sm), color: color.text2, letterSpacing: 1 },
  points: { flexDirection: 'row', gap: space.sm },
  pointsLarge: { flexDirection: 'column', gap: space.md },
  point: { flex: 1, alignItems: 'center', gap: space.xs, minWidth: 0 },
  pointLarge: { flex: 0, flexDirection: 'row', gap: space.md },
  pointLabel: { textAlign: 'center', color: color.text2 },
  pointLabelLarge: { flex: 1, textAlign: 'left' },
  // surface2, as every card in the flow (docs/ONBOARDING.md, "Look and motion").
  card: {
    backgroundColor: color.surface2,
    borderRadius: radius.card,
    padding: space.lg,
    gap: space.md,
  },
  cardHead: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  cardHeadLarge: { flexDirection: 'column-reverse', alignItems: 'flex-start' },
  cardTitle: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: space.sm },
  cardTitleLarge: { flex: 0, alignSelf: 'stretch' },
  cardTitleText: { color: color.text1, fontFamily: font.bodySemibold, flexShrink: 1 },
  liveDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: color.accent },
  // text2, not text3: the tag sits on surface2, where text3 falls short of AA.
  sampleTag: {
    borderWidth: 1,
    borderColor: color.text2,
    borderRadius: 4,
    paddingHorizontal: 5,
    paddingVertical: 1,
  },
  sampleText: { ...textStyle(glyph.sm), color: color.text2, letterSpacing: 1, fontFamily: font.bodySemibold },
  boardRow: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  boardRowLarge: { flexDirection: 'column', alignItems: 'stretch' },
  boardWho: { flex: 1, gap: 2 },
  boardWhoLarge: { flex: 0 },
  boardValue: { alignItems: 'flex-end', gap: space.xs },
  boardValueLarge: { alignItems: 'flex-start' },
  valueLine: { flexDirection: 'row', alignItems: 'baseline', gap: space.xs },
  verified: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    borderWidth: 1,
    borderColor: color.verified,
    borderRadius: 4,
    paddingHorizontal: 5,
    paddingVertical: 1,
  },
  verifiedText: { ...textStyle(glyph.sm), color: color.verified, letterSpacing: 1, fontFamily: font.bodySemibold },
  timerRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    justifyContent: 'space-between',
    columnGap: space.lg,
  },
  timer: { flexDirection: 'row', alignItems: 'baseline', gap: space.xs },
  track: {
    height: BAR,
    borderRadius: BAR / 2,
    backgroundColor: color.hairline,
    overflow: 'hidden',
  },
  trackFill: { height: BAR, borderRadius: BAR / 2, backgroundColor: color.accent },
  trackLabels: { flexDirection: 'row', justifyContent: 'space-between', marginTop: -space.xs },
  // flexShrink, so at large sizes a rule wraps inside the card instead of
  // running out of its right edge.
  rules: { gap: space.xs, flexShrink: 1 },
  rule: { flexDirection: 'row', alignItems: 'center', gap: space.xs },
  ruleText: { flexShrink: 1 },
  rankLine: { flexDirection: 'row', alignItems: 'baseline', flexWrap: 'wrap', gap: space.sm },
  rankTrack: { height: 16, justifyContent: 'center' },
  rankRail: { height: 2, borderRadius: 1, backgroundColor: color.disabled },
  rankMarker: {
    position: 'absolute',
    left: -7,
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: color.accent,
    borderWidth: 3,
    borderColor: color.surface2,
  },
  friends: { gap: space.md },
  friend: { gap: space.xs },
  friendHead: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    columnGap: space.sm,
  },
  friendName: { color: color.text1, flexShrink: 1 },
  you: { color: color.accent, fontFamily: font.bodySemibold },
  barTrack: { height: BAR, borderRadius: BAR / 2, backgroundColor: color.hairline, overflow: 'hidden' },
  bar: {
    height: BAR,
    width: '100%',
    borderRadius: BAR / 2,
    backgroundColor: color.text3,
    // Scaled, not resized: width cannot be animated on the UI thread.
    transformOrigin: 'left center',
  },
  barYou: { backgroundColor: color.accent },
});
