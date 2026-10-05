import { useFocusEffect, useIsFocused } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AccessibilityInfo,
  BackHandler,
  StyleSheet,
  useWindowDimensions,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, {
  scrollTo,
  useAnimatedReaction,
  useAnimatedRef,
  useAnimatedScrollHandler,
  useAnimatedStyle,
  useDerivedValue,
  useSharedValue,
} from 'react-native-reanimated';
import { scheduleOnRN, scheduleOnUI } from 'react-native-worklets';
import { NightBackdrop } from '@/components/brand/NightBackdrop';
import { Button } from '@/components/Button';
import { useReducedMotion } from '@/lib/useReducedMotion';
import { BoardPage } from '@/onboarding/intro/BoardPage';
import { BuiltPage } from '@/onboarding/intro/BuiltPage';
import { CorneringPage } from '@/onboarding/intro/CorneringPage';
import {
  COPY_ROWS,
  COPY_START,
  copyRowAt,
  fadeTopFor,
  heroBand,
  heroFit,
  MARK_BOX,
} from '@/onboarding/intro/hero/heroMath';
import { HeroScene } from '@/onboarding/intro/hero/HeroScene';
import { useHeroClock } from '@/onboarding/intro/hero/useHeroClock';
import { IntroHeader } from '@/onboarding/intro/IntroHeader';
import {
  clamp01,
  ctaFor,
  INTRO_PAGE_COUNT,
  INTRO_PAGES,
  isOnScreen,
  nearestPage,
  onScreenMask,
  pageAnnouncement,
} from '@/onboarding/intro/introTimeline';
import { Splash, splashHasRun } from '@/onboarding/intro/Splash';
import { useArrived } from '@/onboarding/intro/useArrived';
import { WelcomePage } from '@/onboarding/intro/WelcomePage';
import { useOnboardingAdvance } from '@/onboarding/useOnboardingAdvance';
import { offerLocaleUnitDefault } from '@/onboarding/vehicle/deviceUnits';
import { useProfile } from '@/state/profile';
import { gutter, space } from '@/theme/tokens';

/**
 * splash: the G mark is arriving and holding; the carousel is hidden and inert.
 * moving: the mark is rising into the welcome scene; the scene bursts in.
 * done:   the scene owns the mark; the carousel is live.
 */
type Phase = 'splash' | 'moving' | 'done';

/** Page indices, by what is on them. */
const WELCOME = 0;
const BOARD = 1;
const CORNERING = 2;
const BUILT = 3;

/**
 * Step 0 of onboarding (docs/ONBOARDING.md): the splash, then a four-page
 * carousel. The welcome (Nightrun-Welcome: "Every drive. Measured.
 * Verified." over a motorway at night) → See where you stack up → See more
 * in every drive → Built by drivers. The last button goes to the first step
 * in the flow registry, via useOnboardingAdvance; nothing here names the next
 * route.
 *
 * The welcome's scene (./hero) is drawn behind the whole carousel, full
 * bleed under the status bar and the button, and slides off with the first
 * page; the first page itself holds only the words, and the scene fits itself
 * to the room above them. The splash is an overlay rather than a screen
 * before it, so its G mark can rise into the scene's real mark and land
 * there (Splash explains). It runs once per launch; a remount opens on the
 * carousel, and the mark rises out of the vanishing point by itself.
 *
 * The pager is a paging ScrollView whose offset is mirrored onto the UI
 * thread. Everything that follows the finger (the scene sliding away, the
 * page marks) reads that offset directly; the JS thread only hears which page
 * is nearest and which pages are on screen, which is what starts and rewinds
 * each page's demo and pauses the scene when it is out of sight.
 */
export default function Intro() {
  const advance = useOnboardingAdvance('/onboarding');
  const reduced = useReducedMotion();
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const focused = useIsFocused();
  const kind = useProfile((s) => s.vehicleKind);

  const [phase, setPhase] = useState<Phase>(() => (splashHasRun() ? 'done' : 'splash'));
  /** Whether this mount opened on the splash: decided once, at mount. */
  const [withSplash] = useState(() => phase !== 'done');
  /** The scene's G mark, hidden until the splash mark lands on it. */
  const markShown = useSharedValue(withSplash ? 0 : 1);
  /** The carousel's scene, content and button, hidden under the splash. */
  const reveal = useSharedValue(withSplash ? 0 : 1);
  const markRef = useRef<View>(null);
  const live = phase === 'done';
  // Nothing moves until the screen has stopped sliding in.
  const arrived = useArrived(true);

  // The board card on the next page prints distances, so the unit should
  // already be the person's road unit. Idempotent, and it never touches a
  // finished profile.
  useEffect(() => {
    offerLocaleUnitDefault();
  }, []);

  // ── Pager ──────────────────────────────────────────────────────────────────
  const scrollRef = useAnimatedRef<Animated.ScrollView>();
  const scrollX = useSharedValue(0);
  const position = useDerivedValue(() => (width > 0 ? scrollX.value / width : 0));
  const onScroll = useAnimatedScrollHandler({
    onScroll: (e) => {
      scrollX.value = e.contentOffset.x;
    },
  });

  const [page, setPage] = useState(WELCOME);
  const pageRef = useRef(WELCOME);
  /** Bit i: page i is (partly) on screen. */
  const [onScreen, setOnScreen] = useState(1 << WELCOME);
  /** Bit i: page i has been on screen at least once. */
  const [seen, setSeen] = useState(1 << WELCOME);

  const onPage = useCallback((p: number) => {
    pageRef.current = p;
    setPage(p);
  }, []);
  const onMask = useCallback((m: number) => {
    setOnScreen(m);
    setSeen((s) => s | m);
  }, []);
  useAnimatedReaction(
    () => nearestPage(position.value, INTRO_PAGE_COUNT),
    (now, before) => {
      if (now !== before) scheduleOnRN(onPage, now);
    },
  );
  useAnimatedReaction(
    () => onScreenMask(position.value, INTRO_PAGE_COUNT),
    (now, before) => {
      if (now !== before) scheduleOnRN(onMask, now);
    },
  );

  /**
   * Scroll to a page. `announce` is for moves VoiceOver would otherwise miss:
   * the button keeps focus while the page changes beside it. A swipe needs no
   * announcement; the scroll view makes its own.
   */
  const goTo = useCallback(
    (target: number, announce: boolean) => {
      const p = Math.max(0, Math.min(INTRO_PAGE_COUNT - 1, target));
      if (p === pageRef.current) return;
      const x = p * width;
      const animated = !reduced;
      scheduleOnUI(() => {
        'worklet';
        scrollTo(scrollRef, x, 0, animated);
      });
      if (announce) AccessibilityInfo.announceForAccessibility(pageAnnouncement(p));
    },
    [width, reduced, scrollRef],
  );

  /**
   * Snap the pager to the nearest page if it has stopped between two.
   *
   * Each page scrolls vertically inside the horizontal pager. A vertical drag
   * that starts while the pager is still settling from a swipe halts the
   * pager where it is (iOS stops a decelerating scroll view on touch-down),
   * and since the inner view then owns the drag, the pager never gets the
   * touch-up that would page it home: it rested half on one page, half on the
   * next (seen on a simulator). A vertical drag is the one way in, so that is
   * where it is undone.
   */
  const settle = useCallback(() => {
    scheduleOnUI(() => {
      'worklet';
      if (width <= 0) return;
      const target = Math.round(scrollX.value / width) * width;
      if (Math.abs(scrollX.value - target) > 0.5) scrollTo(scrollRef, target, 0, true);
    });
  }, [width, scrollX, scrollRef]);

  const onNext = useCallback(() => {
    if (pageRef.current < INTRO_PAGE_COUNT - 1) goTo(pageRef.current + 1, true);
    else advance();
  }, [goTo, advance]);

  // Android's back button steps back through the pages before it leaves them.
  // Focus-scoped: with a later step on top, Back belongs to that step.
  useFocusEffect(
    useCallback(() => {
      const sub = BackHandler.addEventListener('hardwareBackPress', () => {
        if (pageRef.current === 0) return false;
        goTo(pageRef.current - 1, false);
        return true;
      });
      return () => sub.remove();
    }, [goTo]),
  );

  // ── Splash handoff ─────────────────────────────────────────────────────────
  const onMoveStart = useCallback(() => setPhase('moving'), []);
  const onSplashDone = useCallback(() => setPhase('done'), []);

  // ── The welcome scene ──────────────────────────────────────────────────────
  // It plays as the splash mark starts to rise into it, or, with no splash,
  // once the screen has arrived. It runs only while it can be seen: this
  // screen focused and the first page at least partly on screen.
  const play = withSplash ? phase !== 'splash' : arrived;
  const sceneVisible = focused && isOnScreen(onScreen, WELCOME);
  const clock = useHeroClock({
    play,
    running: sceneVisible,
    reduced,
    copyDelay: withSplash ? COPY_START.afterSplash : COPY_START.cold,
  });
  /** Window y of the welcome copy's first line, once laid out. */
  const [textTop, setTextTop] = useState<number | null>(null);
  const onTextTop = useCallback(
    (y: number) => setTextTop((before) => (before !== null && Math.abs(before - y) < 1 ? before : y)),
    [],
  );
  const fit = useMemo(
    () => heroFit({ width, ...heroBand({ height, insetTop: insets.top, textTop }) }),
    [width, height, insets.top, textTop],
  );
  const fadeTop = fadeTopFor(fit, textTop);

  const contentStyle = useAnimatedStyle(() => ({ opacity: reveal.value }));
  // The button arrives a beat after the content it belongs to, and on the
  // welcome it rises last, after the copy.
  const footerStyle = useAnimatedStyle(() => {
    const rise = copyRowAt(clock.copy.value, COPY_ROWS.button);
    return {
      opacity: clamp01((reveal.value - 0.25) / 0.75) * rise,
      transform: [{ translateY: 14 * (1 - rise) }],
    };
  });

  const hiddenPage = (i: number) => !live || page !== i;

  return (
    <View style={styles.root}>
      <NightBackdrop />
      <HeroScene
        width={width}
        height={height}
        fit={fit}
        fadeTop={fadeTop}
        kind={kind === 'motorbike' ? 'motorbike' : 'car'}
        clock={clock}
        reduced={reduced}
        markFromSplash={withSplash}
        markShown={markShown}
        markRef={markRef}
        scrollX={scrollX}
        reveal={reveal}
        grain={sceneVisible && play}
      />

      <View style={[styles.header, { paddingTop: insets.top + space.sm }]}>
        <IntroHeader
          position={position}
          page={page}
          onSelectPage={(p) => goTo(p, true)}
          hidden={!live}
        />
      </View>
      <Animated.View
        style={[styles.pager, contentStyle]}
        accessibilityElementsHidden={!live}
        importantForAccessibility={live ? 'auto' : 'no-hide-descendants'}
      >
        <Animated.ScrollView
          ref={scrollRef}
          horizontal
          pagingEnabled
          scrollEnabled={live}
          showsHorizontalScrollIndicator={false}
          onScroll={onScroll}
          scrollEventThrottle={16}
          decelerationRate="fast"
        >
          <WelcomePage
            onVerticalDrag={settle}
            copy={INTRO_PAGES[WELCOME]}
            width={width}
            hidden={hiddenPage(WELCOME)}
            cascade={clock.copy}
            onTextTop={onTextTop}
          />
          <BoardPage
            onVerticalDrag={settle}
            copy={INTRO_PAGES[BOARD]}
            width={width}
            hidden={hiddenPage(BOARD)}
            seen={isOnScreen(seen, BOARD)}
          />
          <CorneringPage
            onVerticalDrag={settle}
            copy={INTRO_PAGES[CORNERING]}
            width={width}
            hidden={hiddenPage(CORNERING)}
            active={live && page === CORNERING}
            onScreen={isOnScreen(onScreen, CORNERING)}
          />
          <BuiltPage
            onVerticalDrag={settle}
            copy={INTRO_PAGES[BUILT]}
            width={width}
            hidden={hiddenPage(BUILT)}
            onScreen={isOnScreen(seen, BUILT)}
          />
        </Animated.ScrollView>
      </Animated.View>
      <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, 16) + 14 }]}>
        <Animated.View
          style={footerStyle}
          pointerEvents={live ? 'auto' : 'none'}
          accessibilityElementsHidden={!live}
          importantForAccessibility={live ? 'auto' : 'no-hide-descendants'}
        >
          {/* The carousel's one action, a light like the scene's tail lights:
              the deep-red plate with the streak arrow. */}
          <Button label={ctaFor(page, kind)} onPress={onNext} />
        </Animated.View>
      </View>

      {phase === 'done' ? null : (
        <Splash
          start={arrived}
          size={Math.round(Math.min(MARK_BOX.width, width * 0.56))}
          target={markRef}
          markShown={markShown}
          reveal={reveal}
          onMoveStart={onMoveStart}
          onDone={onSplashDone}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  // Not Screen: the scene runs full bleed under the status bar and the
  // button, so this lays out its own header, pager and footer over it.
  root: { flex: 1 },
  header: { paddingHorizontal: gutter },
  // Full-bleed: the pager's pages are the window's width, and each page puts
  // the gutter back itself (IntroPage).
  pager: { flex: 1 },
  // No fill: the button floats on the night, and on the welcome on the
  // scene's darkest stretch of road.
  footer: { paddingHorizontal: gutter, paddingTop: space.md },
});
