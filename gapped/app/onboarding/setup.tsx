import { Stack } from 'expo-router';
import React, { memo, useEffect, useMemo, useRef, useState } from 'react';
import {
  AccessibilityInfo,
  Image,
  StyleSheet,
  useWindowDimensions,
  View,
} from 'react-native';
import Animated, {
  Extrapolation,
  FadeIn,
  FadeOut,
  interpolate,
  interpolateColor,
  LinearTransition,
  type SharedValue,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { Button } from '@/components/Button';
import { OnboardingFrame } from '@/components/OnboardingFrame';
import { Text } from '@/components/Text';
import { syncIdentity } from '@/lib/sync';
import { useReducedMotion } from '@/lib/useReducedMotion';
import { vehicleNoun } from '@/onboarding/flow';
import {
  BarsGlyph,
  BikeGlyph,
  CarGlyph,
  DoneGlyph,
  ShieldCheckGlyph,
  SlidersGlyph,
  TrophyGlyph,
} from '@/onboarding/identity/glyphs';
import {
  type ChecklistItem,
  type ChecklistKey,
  checklistProgress,
  displayPercent,
  SETUP_SETTLE_MS,
  setupChecklist,
  setupPercent,
} from '@/onboarding/identity/setupTimeline';
import { useHardwareBack } from '@/onboarding/identity/useHardwareBack';
import { Wordmark } from '@/onboarding/identity/Wordmark';
import { saveOnboardingAnswers } from '@/onboarding/socialProof';
import { useOnboardingAdvance } from '@/onboarding/useOnboardingAdvance';
import { vehiclePhotoSource } from '@/onboarding/vehicle/vehiclePhoto';
import { useProfile, type VehicleKind } from '@/state/profile';
import { duration, easing } from '@/theme/motion';
import { alpha, color, font, glow, radius, slant, space, textStyle, type } from '@/theme/tokens';
import { VehicleRender } from '@/vehicles/art/VehicleRender';
import { inferBodyType } from '@/vehicles/bodyType';

/** The progress line under "Making it yours": the flow's own line, a red light at its head. */
const TRACK = 1;
const FILL = 2;
const HEAD = { width: 14, height: 3 } as const;
/**
 * The vehicle's drawn size by window height, or null to leave it out. The beat
 * runs with no input, so all of it has to fit without scrolling: on a 667pt
 * SE, at the full 148pt, the last row's caption was cut off under the footer
 * while it ticked. The car gives way, not the checklist the screen is about —
 * and at the accessibility text sizes it goes altogether, because the heading
 * already names it and the progress is the one thing here worth reading.
 */
function heroSizeFor(height: number, fontScale: number): number | null {
  if (fontScale > 1.3) return null;
  if (height < 700) return 80;
  if (height < 800) return 112;
  return 148;
}

const ANNOUNCE_DONE = "You're all set. Your next drive starts here.";

/**
 * How far the 30pt headings may grow with Dynamic Type. Already display size;
 * uncapped, at the accessibility sizes they took 40% of a 667pt screen and
 * pushed the checklist — what this screen is for — out of sight. The
 * checklist's own text is never capped.
 */
const HEADLINE_MAX_SCALE = 1.5;

/** Rows below a caption that appears or goes ease to their new place rather than jumping. */
const ROW_LAYOUT = LinearTransition.duration(duration.base).easing(easing.standard);

/** Back does nothing here: see useHardwareBack. */
const stay = () => undefined;

/** Rows still to tick show what they stand for; a ticked row shows the tick. */
const PENDING_GLYPH: Record<Exclude<ChecklistKey, 'vehicle'>, typeof CarGlyph> = {
  preferences: SlidersGlyph,
  stats: BarsGlyph,
  rankings: TrophyGlyph,
  setup: ShieldCheckGlyph,
};

function pendingGlyph(key: ChecklistKey, kind: VehicleKind | null): typeof CarGlyph {
  if (key === 'vehicle') return kind === 'motorbike' ? BikeGlyph : CarGlyph;
  return PENDING_GLYPH[key];
}

/**
 * The work behind the beat: the focus and attribution answers to
 * `onboarding_answers`, and the profile and vehicle to the server. Both are
 * best effort — saveOnboardingAnswers never rejects, syncIdentity never
 * throws — and neither waits on the other. With no backend both return at
 * once, and the beat is simply its minimum.
 *
 * Whatever does not land here lands later: completing onboarding triggers
 * syncIdentity again (app/_layout.tsx), and the answers stay in the profile
 * store for a retry.
 */
function runSetupWork(): Promise<unknown> {
  const { focus, attribution } = useProfile.getState();
  return Promise.allSettled([saveOnboardingAnswers({ focus, attribution }), syncIdentity()]);
}

/**
 * Drives setupTimeline.ts from the frame clock: the work starts once, the
 * percent is sampled every frame until it reaches 100.
 *
 * The bar reads a shared value, so it moves every frame on the UI thread; the
 * printed percent is React state, and setting it to the number it already
 * shows does not re-render — so the screen renders about once per percent,
 * not sixty times a second.
 */
function useSetupTimeline(): { shown: number; progress: SharedValue<number> } {
  const [shown, setShown] = useState(0);
  const progress = useSharedValue(0);
  const startedAt = useRef<number | null>(null);
  const workDoneAt = useRef<number | null>(null);

  useEffect(() => {
    // Once per screen, even though development runs every effect twice: the
    // refs survive the remount, so the second run picks up the same clock.
    // No timer for the cap: setupPercent gives up on the work at
    // SETUP_MAX_WAIT_MS by itself, so there is nothing here to outlive the
    // screen, and an answer arriving later is ignored there.
    if (startedAt.current === null) {
      const t0 = Date.now();
      startedAt.current = t0;
      const finish = () => {
        if (workDoneAt.current === null) workDoneAt.current = Date.now() - t0;
      };
      runSetupWork().then(finish, finish);
    }
    const t0 = startedAt.current;
    let frame = 0;
    const tick = () => {
      const p = setupPercent(Date.now() - t0, workDoneAt.current);
      progress.set(p / 100);
      setShown(displayPercent(p));
      if (p < 100) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [progress]);

  return { shown, progress };
}

/**
 * "Getting your car ready." → "You're all set." (docs/ONBOARDING.md, setup).
 *
 * A staged checklist over real work: the percent eases to 100 over at least
 * SETUP_MIN_MS while the answers are saved and the profile synced, each row
 * ticking as the percent crosses it, and the step only finishes once the
 * work has landed or been given up on (setupTimeline.ts). Then "You're all
 * set." and Continue, which completes onboarding — or opens the paywall when
 * ONBOARDING_PAYWALL is on (useOnboardingAdvance decides which).
 *
 * No back chevron, no progress bar, no edge swipe: the questions are answered.
 */
export default function SetupStep() {
  const advance = useOnboardingAdvance('/onboarding/setup');
  useHardwareBack(stay);

  const kind = useProfile((s) => s.vehicleKind);
  const make = useProfile((s) => s.vehicleMake);
  const model = useProfile((s) => s.vehicleModel);
  const photo = useProfile((s) => s.vehiclePhotoUri);
  const noun = vehicleNoun(kind);
  const items = useMemo(() => setupChecklist(noun), [noun]);

  const { shown, progress } = useSetupTimeline();
  const { done, active } = checklistProgress(shown, items);

  const [allSet, setAllSet] = useState(false);
  useEffect(() => {
    if (shown < 100) return;
    const t = setTimeout(() => {
      setAllSet(true);
      AccessibilityInfo.announceForAccessibility(ANNOUNCE_DONE);
    }, SETUP_SETTLE_MS);
    return () => clearTimeout(t);
  }, [shown]);

  const { height, fontScale } = useWindowDimensions();
  const heroSize = heroSizeFor(height, fontScale);

  return (
    <>
      <Stack.Screen options={{ gestureEnabled: false }} />
      <OnboardingFrame
        route="/onboarding/setup"
        footer={
          <Reveal visible={allSet}>
            <Button label="Continue" variant="light" disabled={!allSet} onPress={advance} />
          </Reveal>
        }
      >
        <View style={styles.top}>
          <Wordmark />
          <Heading allSet={allSet} noun={noun} />
          {heroSize ? (
            <VehicleHero kind={kind} make={make} model={model} photo={photo} size={heroSize} />
          ) : null}
        </View>

        <View style={styles.spacer} />

        <Animated.View layout={ROW_LAYOUT} style={styles.bottom}>
          <ProgressRow shown={shown} progress={progress} />
          <Checklist
            items={items}
            done={done}
            active={active}
            kind={kind}
            minHeight={checklistReserve(items.length, fontScale)}
          />
        </Animated.View>
      </OnboardingFrame>
    </>
  );
}

/**
 * The two headings, swapped in place: the old one is gone before the new one
 * arrives, because two headlines crossfading through each other read as one
 * smudge for a moment. Both are laid out at once and the box keeps the
 * taller, so the swap moves nothing around it.
 */
const Heading = memo(function Heading({ allSet, noun }: { allSet: boolean; noun: 'car' | 'bike' }) {
  const reduced = useReducedMotion();
  const t = useSharedValue(0);
  const [incomingHeight, setIncomingHeight] = useState(0);

  // standard, not decel: decel is so front-loaded that the first half of the
  // value went by in a few frames and the old heading simply cut out. With
  // standard the exit takes about a third of the time and the entrance the rest.
  useEffect(() => {
    t.set(withTiming(allSet ? 1 : 0, { duration: duration.slow, easing: easing.standard }));
  }, [allSet, t]);

  const outgoing = useAnimatedStyle(() => {
    const out = interpolate(t.value, [0, 0.5], [0, 1], Extrapolation.CLAMP);
    return { opacity: 1 - out, transform: [{ translateY: reduced ? 0 : -6 * out }] };
  });
  const incoming = useAnimatedStyle(() => {
    const into = interpolate(t.value, [0.45, 1], [0, 1], Extrapolation.CLAMP);
    return { opacity: into, transform: [{ translateY: reduced ? 0 : 8 * (1 - into) }] };
  });

  return (
    <View style={[styles.heading, { minHeight: incomingHeight }]}>
      <Animated.View
        style={outgoing}
        accessibilityElementsHidden={allSet}
        importantForAccessibility={allSet ? 'no-hide-descendants' : 'auto'}
      >
        <Text
          variant="headline"
          accessibilityRole="header"
          lineBreakStrategyIOS="standard"
          maxFontSizeMultiplier={HEADLINE_MAX_SCALE}
          style={styles.centerText}
        >
          {`Getting your ${noun} ready.`}
        </Text>
      </Animated.View>
      <Animated.View
        style={[styles.incoming, incoming]}
        onLayout={(e) => setIncomingHeight(e.nativeEvent.layout.height)}
        accessibilityElementsHidden={!allSet}
        importantForAccessibility={allSet ? 'auto' : 'no-hide-descendants'}
      >
        <Text
          variant="headline"
          accessibilityRole="header"
          maxFontSizeMultiplier={HEADLINE_MAX_SCALE}
          style={styles.centerText}
        >
          You&apos;re all set.
        </Text>
        <Text variant="callout" style={[styles.centerText, styles.subtitle]}>
          Your next drive starts here.
        </Text>
      </Animated.View>
    </View>
  );
});

/**
 * The person's car: their photo if they added one, otherwise its rendered
 * vehicle, tail lights on. Make (in mono) over model (in the wide italic), as
 * a car's name is set on the Drive tab.
 */
const VehicleHero = memo(function VehicleHero({
  kind,
  make,
  model,
  photo,
  size,
}: {
  kind: VehicleKind | null;
  make: string | null;
  model: string | null;
  photo: string | null;
  size: number;
}) {
  // The stored URI is re-anchored to this install's Documents folder first
  // (vehiclePhoto.ts: every screen that shows the photo goes through it — the
  // app container's path is not stable across updates). A file that is gone
  // anyway falls back to the render rather than a blank, remembered per URI.
  const source = useMemo(() => (photo ? vehiclePhotoSource(photo) : null), [photo]);
  const [failed, setFailed] = useState<string | null>(null);
  const bodyType = inferBodyType(
    kind === 'motorbike' ? 'motorbike' : 'car',
    make ?? '',
    model ?? '',
  );
  const name = [make, model].filter(Boolean).join(' ');

  return (
    <View style={styles.hero} accessible={!!name} accessibilityLabel={name || undefined}>
      {source && failed !== source ? (
        <Image
          source={{ uri: source }}
          onError={() => setFailed(source)}
          style={[styles.photo, { width: Math.round(size * 1.5), height: size }]}
          resizeMode="cover"
        />
      ) : (
        // From behind and to one side, lights catching: ready to drive.
        <VehicleRender
          bodyType={bodyType}
          view="rear34"
          width={Math.round(size * 1.7)}
          height={Math.round(size * 0.9)}
        />
      )}
      {make ? (
        <Text variant="mono" style={styles.make}>
          {make}
        </Text>
      ) : null}
      {model ? (
        <Text variant="cardTitle" style={styles.centerText}>
          {model}
        </Text>
      ) : null}
    </View>
  );
});

/**
 * "Making it yours … 42%" over the flow's progress line, its red light
 * travelling to the end; "Ready to drive 100%" once it lands.
 */
function ProgressRow({ shown, progress }: { shown: number; progress: SharedValue<number> }) {
  const [width, setWidth] = useState(0);
  const fill = useAnimatedStyle(() => ({ transform: [{ scaleX: progress.value }] }));
  // Clamped to the line: at 0% the light sits at its start rather than
  // hanging off it into the gutter.
  const head = useAnimatedStyle(() => ({
    transform: [
      { translateX: Math.max(0, progress.value * width - HEAD.width) },
      ...slant.transform,
    ],
  }));
  const label = shown >= 100 ? 'Ready to drive' : 'Making it yours';
  return (
    <View
      accessible
      accessibilityRole="progressbar"
      accessibilityLabel={label}
      accessibilityValue={{ min: 0, max: 100, now: shown }}
      style={styles.progress}
    >
      <View style={styles.progressRow}>
        <Text style={styles.progressLabel}>{label}</Text>
        <Text style={styles.percent}>{`${shown}%`}</Text>
      </View>
      <View style={styles.line} onLayout={(e) => setWidth(e.nativeEvent.layout.width)}>
        <View style={styles.track} />
        <Animated.View style={[styles.fill, fill]} />
        {width > 0 ? <Animated.View style={[styles.head, head]} /> : null}
      </View>
    </View>
  );
}

/**
 * The checklist's height with one caption showing. Exactly one row's caption
 * shows at a time, or none, so holding the list at this height stops the
 * bottom-anchored group bobbing up and down as captions come and go.
 */
function checklistReserve(rows: number, fontScale: number): number {
  const text = rows * type.caption.lineHeight + type.legal.lineHeight;
  return Math.ceil(text * fontScale) + (rows - 1) * space.sm;
}

const Checklist = memo(function Checklist({
  items,
  done,
  active,
  kind,
  minHeight,
}: {
  items: readonly ChecklistItem[];
  done: number;
  active: number | null;
  kind: VehicleKind | null;
  minHeight: number;
}) {
  return (
    <View style={[styles.list, { minHeight }]}>
      {items.map((item, i) => (
        <ChecklistRow
          key={item.key}
          item={item}
          done={i < done}
          active={i === active}
          Glyph={pendingGlyph(item.key, kind)}
        />
      ))}
    </View>
  );
});

/**
 * One row: grey glyph and label while waiting, then a white tick that grows in
 * (ease-out, no overshoot) as the label turns white. The row in progress shows
 * its caption.
 */
function ChecklistRow({
  item,
  done,
  active,
  Glyph,
}: {
  item: ChecklistItem;
  done: boolean;
  active: boolean;
  Glyph: typeof CarGlyph;
}) {
  const reduced = useReducedMotion();
  const { fontScale } = useWindowDimensions();
  const t = useSharedValue(done ? 1 : 0);
  useEffect(() => {
    t.set(withTiming(done ? 1 : 0, { duration: duration.base, easing: easing.decel }));
  }, [done, t]);

  const waiting = useAnimatedStyle(() => ({ opacity: 1 - t.value }));
  const ticked = useAnimatedStyle(() => ({
    opacity: t.value,
    transform: [{ scale: reduced ? 1 : 0.6 + 0.4 * t.value }],
  }));
  const label = useAnimatedStyle(() => ({
    color: interpolateColor(t.value, [0, 1], [color.text3, color.text1]),
  }));

  const state = done ? 'done' : active ? 'in progress' : 'waiting';
  return (
    <Animated.View
      layout={ROW_LAYOUT}
      style={styles.item}
      accessible
      accessibilityLabel={`${item.label}, ${state}`}
    >
      <View style={[styles.itemIcon, { height: type.caption.lineHeight * fontScale }]}>
        <Animated.View style={[styles.layer, waiting]}>
          <Glyph size={18} color={color.text3} />
        </Animated.View>
        <Animated.View style={[styles.layer, ticked]}>
          <DoneGlyph size={18} color={color.text1} tick={color.onLight} />
        </Animated.View>
      </View>
      <View style={styles.itemText}>
        <Animated.Text style={[styles.itemLabel, label]}>{item.label}</Animated.Text>
        {active && item.caption ? (
          <Animated.Text
            entering={FadeIn.duration(duration.base)}
            exiting={FadeOut.duration(duration.fast)}
            style={styles.itemCaption}
          >
            {item.caption}
          </Animated.Text>
        ) : null}
      </View>
    </Animated.View>
  );
}

/** Continue rises into place once the beat is over; until then it is neither seen nor reachable. */
function Reveal({ visible, children }: { visible: boolean; children: React.ReactNode }) {
  const reduced = useReducedMotion();
  const t = useSharedValue(0);
  useEffect(() => {
    t.set(withTiming(visible ? 1 : 0, { duration: duration.slow, easing: easing.decel }));
  }, [visible, t]);
  const style = useAnimatedStyle(() => ({
    opacity: t.value,
    transform: [{ translateY: reduced ? 0 : 12 * (1 - t.value) }],
  }));
  return (
    <Animated.View
      style={[style, { pointerEvents: visible ? 'auto' : 'none' }]}
      accessibilityElementsHidden={!visible}
      importantForAccessibility={visible ? 'auto' : 'no-hide-descendants'}
    >
      {children}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  top: { alignItems: 'center', gap: space.md },
  heading: { alignSelf: 'stretch', justifyContent: 'flex-start' },
  incoming: { position: 'absolute', top: 0, left: 0, right: 0 },
  centerText: { textAlign: 'center' },
  subtitle: { marginTop: space.md },
  hero: { alignItems: 'center', gap: space.xs },
  photo: { borderRadius: radius.card, backgroundColor: color.surface2, marginBottom: space.sm },
  make: { textAlign: 'center' },
  // Holds the checklist low, by the button, as the reference does — and is
  // the first thing to give way on a short screen.
  spacer: { flexGrow: 1 },
  bottom: { gap: space.lg },
  progress: { gap: space.sm },
  progressRow: { flexDirection: 'row', alignItems: 'baseline', gap: space.md },
  // The checklist's type is the reference's: small, set under a large
  // heading, so five rows and a caption sit in the room a 667pt phone has.
  progressLabel: {
    flex: 1,
    fontFamily: font.bodyMedium,
    ...textStyle(type.caption),
    color: color.text1,
  },
  percent: {
    fontFamily: font.monoMedium,
    ...textStyle(type.caption),
    color: color.text1,
    fontVariant: ['tabular-nums'],
  },
  line: { height: HEAD.height + glow.tight * 2, justifyContent: 'center' },
  track: { height: TRACK, backgroundColor: color.hairline },
  fill: {
    position: 'absolute',
    left: 0,
    right: 0,
    height: FILL,
    backgroundColor: alpha(color.accent, 0.55),
    // Scaled, not resized: width cannot be animated on the UI thread.
    transformOrigin: 'left center',
  },
  // The light at the head of the line: lit, so it glows.
  head: {
    position: 'absolute',
    left: 0,
    width: HEAD.width,
    height: HEAD.height,
    borderRadius: 1,
    backgroundColor: color.accent,
    boxShadow: `0 0 ${glow.tight}px 1px ${alpha(color.accent, 0.85)}`,
  },
  list: { gap: space.sm },
  item: { flexDirection: 'row', alignItems: 'flex-start', gap: space.md },
  // As tall as the label's first line (scaled with it above), so the glyph
  // centres on that line at every text size.
  itemIcon: { width: 20 },
  layer: { ...StyleSheet.absoluteFill, alignItems: 'center', justifyContent: 'center' },
  itemText: { flex: 1 },
  itemLabel: { fontFamily: font.bodyMedium, ...textStyle(type.caption) },
  itemCaption: { fontFamily: font.body, ...textStyle(type.legal), color: color.text2 },
});
