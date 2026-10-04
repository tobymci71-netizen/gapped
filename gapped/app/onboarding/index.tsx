import { useFocusEffect } from 'expo-router';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  AccessibilityInfo,
  BackHandler,
  StyleSheet,
  useWindowDimensions,
  View,
} from 'react-native';
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
import { Button } from '@/components/Button';
import { Screen } from '@/components/Screen';
import { useReducedMotion } from '@/lib/useReducedMotion';
import { BoardPage } from '@/onboarding/intro/BoardPage';
import { BuiltPage } from '@/onboarding/intro/BuiltPage';
import { CorneringPage } from '@/onboarding/intro/CorneringPage';
import { DialPage } from '@/onboarding/intro/DialPage';
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
import { useOnboardingAdvance } from '@/onboarding/useOnboardingAdvance';
import { offerLocaleUnitDefault } from '@/onboarding/vehicle/deviceUnits';
import { useProfile } from '@/state/profile';

/**
 * splash: the wordmark is arriving and holding; the carousel is hidden and inert.
 * moving: the wordmark is travelling into the header; the carousel fades up.
 * done:   the header owns the wordmark; the carousel is live.
 */
type Phase = 'splash' | 'moving' | 'done';

/** Page indices, by what is on them. */
const DIAL = 0;
const BOARD = 1;
const CORNERING = 2;
const BUILT = 3;

/**
 * Step 0 of onboarding (docs/ONBOARDING.md): the splash, then a four-page
 * carousel. Track every drive → See where you stack up → See more in every
 * drive → Built by drivers. The last button goes to the first step in the
 * flow registry, via useOnboardingAdvance; nothing here names the next route.
 *
 * The splash is an overlay on the carousel rather than a screen before it,
 * so the wordmark can travel into the carousel's real header and land there
 * (./Splash explains). It runs once per launch; a remount opens on the
 * carousel.
 *
 * The pager is a paging ScrollView whose offset is mirrored onto the UI
 * thread. Everything that follows the finger (the header's wordmark/dots
 * handoff, the dots' pill) reads that offset directly; the JS thread only
 * hears which page is nearest and which pages are on screen, which is what
 * starts and rewinds each page's demo.
 */
export default function Intro() {
  const advance = useOnboardingAdvance('/onboarding');
  const reduced = useReducedMotion();
  const { width } = useWindowDimensions();
  const kind = useProfile((s) => s.vehicleKind);

  const [phase, setPhase] = useState<Phase>(() => (splashHasRun() ? 'done' : 'splash'));
  const skipSplash = phase === 'done';
  /** The header wordmark, hidden until the splash mark lands on it. */
  const markShown = useSharedValue(skipSplash ? 1 : 0);
  /** The carousel's content and button, hidden under the splash. */
  const reveal = useSharedValue(skipSplash ? 1 : 0);
  const markRef = useRef<View>(null);
  const live = phase === 'done';
  const arrived = useArrived(!skipSplash);

  // The welcome dial is the first speed anyone sees, so it should already be
  // in their road unit. Idempotent, and it never touches a finished profile.
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

  const [page, setPage] = useState(DIAL);
  const pageRef = useRef(DIAL);
  /** Bit i: page i is (partly) on screen. */
  const [onScreen, setOnScreen] = useState(1 << DIAL);
  /** Bit i: page i has been on screen at least once. */
  const [seen, setSeen] = useState(1 << DIAL);

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

  const contentStyle = useAnimatedStyle(() => ({ opacity: reveal.value }));
  // The button arrives a beat after the content it belongs to.
  const footerStyle = useAnimatedStyle(() => ({
    opacity: clamp01((reveal.value - 0.25) / 0.75),
  }));

  const hiddenPage = (i: number) => !live || page !== i;

  return (
    <View style={styles.root}>
      <Screen
        scroll={false}
        style={styles.bleed}
        footer={
          <Animated.View
            style={footerStyle}
            pointerEvents={live ? 'auto' : 'none'}
            accessibilityElementsHidden={!live}
            importantForAccessibility={live ? 'auto' : 'no-hide-descendants'}
          >
            <Button label={ctaFor(page, kind)} variant="light" onPress={onNext} />
          </Animated.View>
        }
      >
        <IntroHeader
          position={position}
          markShown={markShown}
          page={page}
          onSelectPage={(p) => goTo(p, true)}
          markRef={markRef}
          hidden={!live}
        />
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
            <DialPage
              onVerticalDrag={settle}
              copy={INTRO_PAGES[DIAL]}
              width={width}
              hidden={hiddenPage(DIAL)}
              play={live && page === DIAL}
              reveal={reveal}
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
      </Screen>

      {phase === 'done' ? null : (
        <Splash
          start={arrived}
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
  root: { flex: 1 },
  // Full-bleed: the pager's pages are the window's width, and each page puts
  // the gutter back itself (IntroPage).
  bleed: { paddingHorizontal: 0, paddingBottom: 0 },
  pager: { flex: 1 },
});
