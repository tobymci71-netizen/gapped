import React, { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withTiming,
} from 'react-native-reanimated';
import { StreakBar } from '@/components/brand/StreakArrow';
import { Entrance } from '@/components/Entrance';
import { Skeleton } from '@/components/Skeleton';
import { Numeral, Text } from '@/components/Text';
import { useReducedMotion } from '@/lib/useReducedMotion';
import { formatShare, type BrandProof, type MakeNeighbor } from '@/onboarding/proofVariants';
import { panel, RowLight } from '@/onboarding/ui/choice';
import type { VehicleKind } from '@/state/profile';
import { duration, easing, stagger } from '@/theme/motion';
import { color, font, radius, space, textStyle, type } from '@/theme/tokens';
import { closerLine, earlyCopy, rankedLine, rankLine, shareLine } from './copy';
import { barFraction, formatCount } from './numbers';
import { useRamp } from './useRamp';
import { VehicleArt } from './VehicleArt';

type Noun = 'car' | 'bike';
type Ranked = Extract<BrandProof, { kind: 'ranked' }>;

/** The streak's height on the make chart (StreakBar's own default). */
const BAR_HEIGHT = 6;

/**
 * Centred lines break the way iOS's own centred text does: "push-out" moves a
 * word down rather than leave one alone on the last line ("…drivers on the" /
 * "board"). No effect on Android, which has no equivalent.
 */
const BALANCED = 'push-out';

/**
 * How far the early variant's headline grows with Dynamic Type: the cap every
 * onboarding title uses (OnboardingFrame). It names the make, and a long one
 * ("Lamborghini") in the wide display face broke in half at about 3x.
 */
const HEADLINE_MAX_SCALE = 1.5;

/**
 * The ranked variant: a count that ticks up, the make's place, and the five
 * makes around it with bars that grow. Every figure on it is the server's
 * (src/onboarding/proofVariants decided it may be shown at all); nothing here
 * computes a number the server did not send, only how long to draw a bar.
 */
export function RankedProof({ proof, make, noun }: { proof: Ranked; make: string; noun: Noun }) {
  const shown = useRamp(proof.count, { durationMs: duration.slow });
  const maxShare = Math.max(0, ...proof.neighbors.map((n) => n.share));

  return (
    <View style={styles.ranked}>
      {/* One element for VoiceOver, read with the final count: the
          intermediate numbers of the tick are motion, not information. */}
      <View
        accessible
        accessibilityRole="header"
        accessibilityLabel={`${formatCount(proof.count)} ${rankedLine(make)}`}
        style={styles.hero}
      >
        <Numeral
          size={type.heroNumeral.size}
          numberOfLines={1}
          adjustsFontSizeToFit
          // A display numeral sized by its layout, like the wordmark.
          maxFontSizeMultiplier={1.3}
          style={styles.center}
        >
          {formatCount(shown)}
        </Numeral>
        <Text variant="cardTitle" style={styles.center} lineBreakStrategyIOS={BALANCED}>
          {rankedLine(make)}
        </Text>
      </View>
      <Text variant="bodySemibold" style={styles.center}>
        {rankLine(proof.rank)}
      </Text>

      <View style={styles.chart}>
        {proof.neighbors.map((n, i) => (
          <MakeRow key={n.make} row={n} index={i} fraction={barFraction(n.share, maxShare)} />
        ))}
      </View>

      <Text variant="mono" style={styles.center}>
        {shareLine(proof.share, noun)}
      </Text>
      <Text
        variant="callout"
        style={[styles.center, styles.closer]}
        lineBreakStrategyIOS={BALANCED}
      >
        {closerLine(noun)}
      </Text>
    </View>
  );
}

/**
 * One make on the chart, as the Ranks tab sets a board row: its place in
 * mono, the make, its share, and under them a light streak as long as its
 * share of the top make's. The person's own make is lit — a red light down
 * its left edge and the hot streak — and the rest are dimmer streaks. Each
 * streak draws in from the left, one stagger step after the row above, so
 * the chart reads top to bottom as it draws.
 */
function MakeRow({ row, index, fraction }: { row: MakeNeighbor; index: number; fraction: number }) {
  const reduced = useReducedMotion();
  const [width, setWidth] = useState(0);
  const grow = useSharedValue(reduced ? 1 : 0);
  useEffect(() => {
    grow.set(
      reduced
        ? 1
        : withDelay(
            index * stagger,
            withTiming(1, { duration: duration.slow, easing: easing.decel }),
          ),
    );
  }, [index, reduced, grow]);
  // The streak slides out from behind the row's left edge: its head arrives
  // last, as a light travelling would.
  const barStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: -(1 - grow.get()) * width * fraction }],
  }));

  const yours = row.isYours;
  const pct = `${formatShare(row.share)}%`;
  return (
    <View
      accessible
      accessibilityLabel={`Rank ${row.rank}, ${row.make}, ${pct}${yours ? ', your make' : ''}`}
      style={[styles.row, yours && styles.rowYours]}
    >
      {yours ? <RowLight /> : null}
      <View style={styles.rowLine}>
        <Text variant="mono" style={[styles.rank, yours && styles.rankYours]}>
          #{row.rank}
        </Text>
        <Text
          variant="bodyMedium"
          style={[styles.name, !yours && styles.nameOther]}
          numberOfLines={1}
        >
          {row.make}
        </Text>
        <Text style={[styles.pct, yours && styles.pctYours]}>{pct}</Text>
      </View>
      <View style={styles.barTrack} onLayout={(e) => setWidth(e.nativeEvent.layout.width)}>
        {width > 0 ? (
          <Animated.View style={barStyle}>
            <StreakBar width={width} progress={fraction} you={yours} />
          </Animated.View>
        ) : null}
      </View>
    </View>
  );
}

/**
 * The early variant: the person's vehicle, and an invitation with no number in
 * it. What the screen says offline, with no backend, and below the
 * thresholds — which, before launch, is everywhere.
 */
export function EarlyProof({
  kind,
  make,
  model,
  photoUri,
  artSize,
}: {
  kind: VehicleKind;
  make: string | null;
  model: string | null;
  photoUri: string | null;
  artSize: number;
}) {
  const copy = earlyCopy(make);
  return (
    <View style={styles.early}>
      {/*
        Not inside an Entrance: an opacity animation on an ancestor of the
        Skia canvas, started as the screen is pushed, stalled part-way on
        device and left the car at a third of its brightness. The silhouette
        fades and draws itself in, which is the entrance it needs.
      */}
      <VehicleArt kind={kind} make={make} model={model} photoUri={photoUri} size={artSize} />
      <Entrance index={1}>
        <Text
          variant="headline"
          accessibilityRole="header"
          maxFontSizeMultiplier={HEADLINE_MAX_SCALE}
          style={styles.center}
          lineBreakStrategyIOS={BALANCED}
        >
          {copy.title}
        </Text>
      </Entrance>
      <Entrance index={2}>
        <Text variant="body" style={styles.center} lineBreakStrategyIOS={BALANCED}>
          {copy.body}
        </Text>
      </Entrance>
    </View>
  );
}

/**
 * The ranked layout in outline, shown only if the answer is slow
 * (SKELETON_GRACE_MS). Shaped like the ranked variant because that is the one
 * worth waiting for; if the answer is the early variant instead, the swap is a
 * fade, not a jump.
 */
export function ProofSkeleton() {
  return (
    <View
      style={styles.ranked}
      accessible
      accessibilityRole="progressbar"
      accessibilityLabel="Loading drivers"
    >
      <View style={styles.hero}>
        <Skeleton style={styles.skelCount} />
        <Skeleton style={styles.skelLine} />
      </View>
      <Skeleton style={styles.skelShort} />
      <View style={styles.chart}>
        {[0.9, 0.7, 0.55, 0.45, 0.35].map((w, i) => (
          <View key={i} style={styles.row}>
            <Skeleton style={styles.skelName} />
            <Skeleton style={{ ...styles.skelBar, width: `${Math.round(w * 100)}%` as const }} />
          </View>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  ranked: { gap: space.md, paddingTop: space.xl },
  hero: { alignItems: 'center', gap: space.xs },
  center: { textAlign: 'center' },
  closer: { marginTop: space.sm },
  chart: { gap: space.xs, marginVertical: space.sm },
  row: {
    gap: space.sm,
    paddingVertical: space.sm,
    paddingHorizontal: space.md,
    borderRadius: radius.card,
    overflow: 'hidden',
  },
  rowYours: { ...panel },
  rowLine: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  rank: { minWidth: 36, fontVariant: ['tabular-nums'] },
  rankYours: { color: color.text2 },
  // text2 on the night, text1 on the lit row: the person's make leads.
  name: { flex: 1 },
  nameOther: { color: color.text2 },
  pct: {
    fontFamily: font.monoMedium,
    ...textStyle(type.caption),
    color: color.text2,
    fontVariant: ['tabular-nums'],
  },
  pctYours: { color: color.text1 },
  // Clips the streak while it slides in from the row's left edge.
  barTrack: { height: BAR_HEIGHT, overflow: 'hidden' },
  early: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: space.lg },
  skelCount: { width: 160, height: 52, borderRadius: radius.card / 2 },
  skelLine: { width: 240, height: 22 },
  skelShort: { width: 180, height: 18, alignSelf: 'center' },
  skelName: { width: 120, height: 14 },
  skelBar: { height: BAR_HEIGHT },
});
