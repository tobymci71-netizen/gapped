import { useIsFocused } from 'expo-router';
import React, { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, {
  cancelAnimation,
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';
import { Text } from '@/components/Text';
import { useReducedMotion } from '@/lib/useReducedMotion';
import { ambient } from '@/theme/motion';
import { alpha, color, glow, space } from '@/theme/tokens';
import type { IdleStatus } from './driveTabModel';

const DOT = 7;
/** The ring grows from 0.4× to 1.5× of this, as the mock's ::after does. */
const RING = DOT + 10;

/**
 * The mono line over the car's name: "● Standby — GPS ready". The dot is the
 * GPS light: white and pulsing once a position is in hand, a still white dot
 * while the first fix is on its way, a hollow grey ring when location is off.
 * One element to VoiceOver, read as a sentence.
 */
export function StatusLine({ status }: { status: IdleStatus }) {
  return (
    <View
      style={styles.row}
      accessible
      accessibilityRole="text"
      accessibilityLabel={status.spoken}
    >
      <GpsLight tone={status.tone} />
      <Text variant="mono" style={styles.text}>
        {status.state}
      </Text>
      <View style={styles.dash} />
      <Text variant="mono" style={styles.text}>
        {status.gps}
      </Text>
    </View>
  );
}

function GpsLight({ tone }: { tone: IdleStatus['tone'] }) {
  const reduced = useReducedMotion();
  const focused = useIsFocused();
  const pulsing = tone === 'ready' && focused && !reduced;
  const t = useSharedValue(0);

  useEffect(() => {
    if (!pulsing) {
      cancelAnimation(t);
      t.set(0);
      return;
    }
    t.set(0);
    t.set(
      withRepeat(
        withTiming(1, { duration: ambient.pulse, easing: Easing.out(Easing.ease) }),
        -1,
        false,
      ),
    );
    return () => cancelAnimation(t);
  }, [pulsing, t]);

  // Still (Reduce Motion, or not ready), the ring is simply not there.
  const ring = useAnimatedStyle(() => ({
    opacity: pulsing ? 1 - t.get() : 0,
    transform: [{ scale: 0.4 + 1.1 * t.get() }],
  }));

  return (
    <View style={styles.light}>
      <Animated.View style={[styles.ring, ring]} />
      <View
        style={[
          styles.dot,
          tone === 'ready' ? styles.dotLit : tone === 'waiting' ? styles.dotWaiting : styles.dotOff,
        ]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    columnGap: space.sm + 2,
    rowGap: 2,
  },
  text: { color: color.text2 },
  dash: { width: 14, height: 1, backgroundColor: color.outline },
  // The ring overhangs the dot; the negative margin keeps the dot on the gutter line.
  light: {
    width: RING,
    height: RING,
    alignItems: 'center',
    justifyContent: 'center',
    marginHorizontal: -(RING - DOT) / 2,
  },
  ring: {
    position: 'absolute',
    width: RING,
    height: RING,
    borderRadius: RING / 2,
    borderWidth: 1,
    borderColor: alpha(color.text1, 0.6),
  },
  dot: { width: DOT, height: DOT, borderRadius: DOT / 2 },
  // A light, so it may glow: white, not red — red is for the drive itself.
  dotLit: {
    backgroundColor: color.text1,
    boxShadow: `0 0 ${glow.tight}px ${alpha(color.text1, 0.7)}`,
  },
  dotWaiting: { backgroundColor: color.text2 },
  dotOff: { borderWidth: 1, borderColor: color.text3 },
});
