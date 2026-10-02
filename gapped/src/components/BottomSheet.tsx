import { BlurView } from 'expo-blur';
import React, { useEffect, useMemo, useState } from 'react';
import {
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  useWindowDimensions,
  View,
} from 'react-native';
import { Gesture, GestureDetector, GestureHandlerRootView } from 'react-native-gesture-handler';
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { OnSurface, Text } from '@/components/Text';
import { useReducedMotion } from '@/lib/useReducedMotion';
import { duration, spring } from '@/theme/motion';
import { color, space } from '@/theme/tokens';

/**
 * Modal bottom sheet — the host for the make/model pickers.
 * Springs up on open; dismissed by backdrop tap, hardware back, a downward
 * drag on the grabber, a tap on the grabber, or VoiceOver's escape scrub.
 */

type Props = {
  visible: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  /** Fraction of screen height, default 0.82 */
  heightFraction?: number;
};

/** Past a quarter of the sheet's travel, or faster than this, and it goes. */
const DISMISS_TRAVEL_FRACTION = 0.25;
const DISMISS_VELOCITY = 800;

const SHEET_RADIUS = 22;

/**
 * Widens the grabber's tap area without moving the layout. Sideways only:
 * above it the sheet's clipped edge drops any slop from hit-testing, and below
 * it the full-width title sits on top and takes the touch first. That leaves a
 * 24 pt-tall strip, which is fine for what it is — a secondary way to close
 * for touch (the scrim and the drag are the primary ones), and for VoiceOver
 * a focusable element whose size does not matter.
 */
const GRABBER_HIT_SLOP = { left: 12, right: 12 } as const;

/**
 * expo-blur on Android needs a `blurTarget` ref to the view it blurs, and that
 * ref cannot cross a Modal boundary — so only iOS gets glass. Android gets a
 * heavier flat scrim, which is the same effect minus the decoration.
 */
const GLASS = Platform.OS === 'ios';
const SCRIM = GLASS ? 'rgba(0, 0, 0, 0.40)' : 'rgba(0, 0, 0, 0.66)';

export function BottomSheet({
  visible,
  onClose,
  title,
  children,
  heightFraction = 0.82,
}: Props): React.JSX.Element {
  const { height: windowHeight } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const reduced = useReducedMotion();

  const sheetHeight = Math.round(windowHeight * heightFraction);

  // `mounted` lags `visible` so the exit animation finishes before the Modal
  // unmounts — Modal itself has no animation (animationType="none").
  const [mounted, setMounted] = useState(visible);

  const translateY = useSharedValue(sheetHeight);
  const progress = useSharedValue(0);
  /** Sheet height on the UI thread, so gesture worklets read the current value. */
  const sheetH = useSharedValue(sheetHeight);
  /** Fling velocity handed from the dismiss gesture to the exit spring. */
  const exitVelocity = useSharedValue(0);
  /**
   * `visible` on the UI thread, cleared the moment a close starts.
   *
   * A sheet on its way out must ignore the pan. A drag write to translateY
   * cancels the running exit spring, and that spring's completion callback is
   * the only thing that unmounts the Modal — so a grab during the exit left the
   * sheet stuck open with `visible` already false, and nothing could close it.
   */
  const open = useSharedValue(visible);
  /** Where the sheet was when the current drag took hold. */
  const dragStart = useSharedValue(0);

  useEffect(() => {
    sheetH.value = sheetHeight;
  }, [sheetHeight, sheetH]);

  useEffect(() => {
    if (visible) {
      open.value = true;
      setMounted(true);
      exitVelocity.value = 0;
      progress.value = 0;
      translateY.value = reduced ? 0 : sheetH.value;
      progress.value = withTiming(1, { duration: duration.base });
      if (!reduced) translateY.value = withSpring(0, spring.soft);
      return;
    }

    open.value = false;
    progress.value = withTiming(0, { duration: duration.base }, (finished) => {
      'worklet';
      // Reduced motion has no travel, so the fade owns the unmount.
      if (finished && reduced) runOnJS(setMounted)(false);
    });
    if (!reduced) {
      translateY.value = withSpring(
        sheetH.value,
        // energyThreshold well above the 6e-9 default: the sheet snaps home once
        // it is off screen instead of riding spring.soft's long settling tail,
        // so the Modal unmounts when the user perceives it as gone.
        { ...spring.soft, velocity: exitVelocity.value, energyThreshold: 1e-5 },
        (finished) => {
          'worklet';
          if (finished) runOnJS(setMounted)(false);
        },
      );
    }
  }, [visible, reduced, progress, translateY, sheetH, exitVelocity, open]);

  // The worklets below use get()/set() rather than `.value`: the React hooks
  // lint treats a hook's return value as immutable and flags property writes
  // inside a memoised callback, and get()/set() are Reanimated's spelling for
  // exactly that case.
  const pan = useMemo(
    () =>
      Gesture.Pan()
        // Both directions, though the sheet only travels down, and enabled
        // under reduced motion, where it moves nothing. The grabber is a press
        // target (the Close control), and a press survives a pull that stays
        // within Pressable's 20 pt press rect — so a tug on it, upward being
        // the natural try at expanding a half-height sheet, released as a tap
        // and closed it. Claiming every drag cancels the press (an activating
        // handler cancels the JS touch); the clamp in onUpdate keeps an upward
        // one from moving the sheet.
        .activeOffsetY([-6, 6])
        .onStart((e) => {
          // Continue from where the sheet is — it may still be springing in —
          // and net out the activation slop, so the grab neither snaps the
          // sheet to the finger's absolute travel nor jumps 6 pt on take-off.
          dragStart.set(translateY.get() - e.translationY);
        })
        .onUpdate((e) => {
          // Reduced motion is opacity-only, so there is nothing to drag.
          if (reduced || !open.get()) return;
          translateY.set(Math.max(0, dragStart.get() + e.translationY));
        })
        .onEnd((e) => {
          if (reduced || !open.get()) return;
          // Judged on where the sheet is, not on finger travel, now that a
          // drag can start from somewhere other than fully open.
          const dismissed =
            translateY.get() > sheetH.get() * DISMISS_TRAVEL_FRACTION ||
            e.velocityY > DISMISS_VELOCITY;
          if (dismissed) {
            open.set(false);
            // Carry the fling into the exit rather than waiting a frame for the
            // parent to flip `visible`; the effect then restarts the identical
            // spring from this position and owns the unmount. This spring can
            // unmount too, so the Modal never outlives the sheet on the word of
            // a parent whose onClose leaves `visible` untouched.
            exitVelocity.set(e.velocityY);
            translateY.set(
              withSpring(
                sheetH.get(),
                { ...spring.soft, velocity: e.velocityY, energyThreshold: 1e-5 },
                (finished) => {
                  'worklet';
                  if (finished) runOnJS(setMounted)(false);
                },
              ),
            );
            runOnJS(onClose)();
          } else {
            translateY.set(withSpring(0, spring.soft));
          }
        }),
    [reduced, onClose, translateY, sheetH, exitVelocity, open, dragStart],
  );

  const scrimStyle = useAnimatedStyle(() => ({ opacity: progress.value }));
  // Both properties are always present: a style whose keys change between runs
  // leaves the dropped property stuck at its last value.
  const sheetStyle = useAnimatedStyle(() => ({
    opacity: reduced ? progress.value : 1,
    transform: [{ translateY: reduced ? 0 : translateY.value }],
  }));

  return (
    <Modal
      visible={mounted}
      transparent
      animationType="none"
      statusBarTranslucent
      onRequestClose={onClose}
    >
      {/* Gestures inside a Modal need their own root — the app's root view does
          not extend into the modal's native window.
          Inert once closing: the Modal stays up until the exit spring settles,
          and in that tail the faded scrim and the departing sheet must not
          take a tap or a grab. */}
      <GestureHandlerRootView style={styles.root} pointerEvents={visible ? 'auto' : 'none'}>
        <Animated.View style={[StyleSheet.absoluteFill, scrimStyle]}>
          {GLASS ? (
            <BlurView tint="dark" intensity={24} style={StyleSheet.absoluteFill} />
          ) : null}
          {/* Hidden from screen readers: VoiceOver cannot reach it anyway (the
              sheet is accessibilityViewIsModal, which hides its siblings), and
              on Android a full-screen "Close" would duplicate the grabber's. */}
          <Pressable
            style={[StyleSheet.absoluteFill, styles.scrim]}
            onPress={onClose}
            accessible={false}
            importantForAccessibility="no"
          />
        </Animated.View>

        <Animated.View
          accessibilityViewIsModal
          // VoiceOver's two-finger Z scrub. Escape bubbles up from whichever
          // row has focus, so this one handler covers every sheet.
          onAccessibilityEscape={onClose}
          style={[
            styles.sheet,
            { height: sheetHeight, paddingBottom: insets.bottom },
            sheetStyle,
          ]}
        >
          <GestureDetector gesture={pan}>
            <View style={styles.header}>
              {/* The grabber doubles as the sheet's Close control: it has to
                  live inside the modal view for VoiceOver to reach it, and a
                  drag past 6 pt either way still belongs to the pan. */}
              <Pressable
                onPress={onClose}
                accessibilityRole="button"
                accessibilityLabel="Close"
                hitSlop={GRABBER_HIT_SLOP}
                style={styles.grabberHit}
              >
                <View style={styles.grabber} />
              </Pressable>
              <Text variant="cardTitle" style={styles.title}>
                {title}
              </Text>
            </View>
          </GestureDetector>
          {/* surface1: muted text in a sheet needs the lighter grey, as on a Card. */}
          <View style={styles.body}>
            <OnSurface>{children}</OnSurface>
          </View>
        </Animated.View>
      </GestureHandlerRootView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, justifyContent: 'flex-end' },
  scrim: { backgroundColor: SCRIM },
  sheet: {
    backgroundColor: color.surface1,
    borderTopLeftRadius: SHEET_RADIUS,
    borderTopRightRadius: SHEET_RADIUS,
    borderTopWidth: 1,
    borderColor: color.hairline,
    overflow: 'hidden',
  },
  header: { paddingBottom: space.md },
  // Carries the spacing that used to sit around the bare grabber (header
  // paddingTop above it, the title's marginTop below), so the layout is
  // unchanged and that spacing becomes tap area.
  grabberHit: {
    alignSelf: 'center',
    paddingTop: space.sm,
    paddingBottom: space.md,
    paddingHorizontal: space.lg,
  },
  grabber: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: color.disabled,
  },
  title: { textAlign: 'center' },
  body: { flex: 1 },
});
