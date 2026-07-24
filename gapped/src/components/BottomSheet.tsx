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
import { Text } from '@/components/Text';
import { useReducedMotion } from '@/lib/useReducedMotion';
import { duration, spring } from '@/theme/motion';
import { color, space } from '@/theme/tokens';

/**
 * Modal bottom sheet — the host for the make/model pickers.
 * Springs up on open; dismissed by backdrop tap, hardware back, or a downward
 * drag on the grabber.
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

  useEffect(() => {
    sheetH.value = sheetHeight;
  }, [sheetHeight, sheetH]);

  useEffect(() => {
    if (visible) {
      setMounted(true);
      exitVelocity.value = 0;
      progress.value = 0;
      translateY.value = reduced ? 0 : sheetH.value;
      progress.value = withTiming(1, { duration: duration.base });
      if (!reduced) translateY.value = withSpring(0, spring.soft);
      return;
    }

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
  }, [visible, reduced, progress, translateY, sheetH, exitVelocity]);

  const pan = useMemo(
    () =>
      Gesture.Pan()
        // Reduced motion is opacity-only, so there is nothing to drag.
        .enabled(!reduced)
        .activeOffsetY(6)
        .onUpdate((e) => {
          translateY.value = Math.max(0, e.translationY);
        })
        .onEnd((e) => {
          const dismissed =
            e.translationY > sheetH.value * DISMISS_TRAVEL_FRACTION ||
            e.velocityY > DISMISS_VELOCITY;
          if (dismissed) {
            // Carry the fling into the exit rather than waiting a frame for the
            // parent to flip `visible`; the effect then restarts the identical
            // spring from this position and owns the unmount.
            exitVelocity.value = e.velocityY;
            translateY.value = withSpring(sheetH.value, {
              ...spring.soft,
              velocity: e.velocityY,
              energyThreshold: 1e-5,
            });
            runOnJS(onClose)();
          } else {
            translateY.value = withSpring(0, spring.soft);
          }
        }),
    [reduced, onClose, translateY, sheetH, exitVelocity],
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
          not extend into the modal's native window. */}
      <GestureHandlerRootView style={styles.root}>
        <Animated.View style={[StyleSheet.absoluteFill, scrimStyle]}>
          {GLASS ? (
            <BlurView tint="dark" intensity={24} style={StyleSheet.absoluteFill} />
          ) : null}
          <Pressable
            style={[StyleSheet.absoluteFill, styles.scrim]}
            onPress={onClose}
            accessibilityRole="button"
            accessibilityLabel="Close"
          />
        </Animated.View>

        <Animated.View
          accessibilityViewIsModal
          style={[
            styles.sheet,
            { height: sheetHeight, paddingBottom: insets.bottom },
            sheetStyle,
          ]}
        >
          <GestureDetector gesture={pan}>
            <View style={styles.header}>
              <View style={styles.grabber} />
              <Text variant="cardTitle" style={styles.title}>
                {title}
              </Text>
            </View>
          </GestureDetector>
          <View style={styles.body}>{children}</View>
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
  header: { paddingTop: space.sm, paddingBottom: space.md },
  grabber: {
    alignSelf: 'center',
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: color.disabled,
  },
  title: { textAlign: 'center', marginTop: space.md },
  body: { flex: 1 },
});
