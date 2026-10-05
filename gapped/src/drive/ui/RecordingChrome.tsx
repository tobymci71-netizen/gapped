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
import Svg, { Circle, Path } from 'react-native-svg';
import { PressableScale } from '@/components/PressableScale';
import { Text } from '@/components/Text';
import { useReducedMotion } from '@/lib/useReducedMotion';
import { ambient } from '@/theme/motion';
import { alpha, color, glow, radius, slant, space } from '@/theme/tokens';

/** Every map control is a 44pt target. */
export const MAP_CONTROL = 44;

/** A dark slanted plate under anything that floats on the map, for legibility. */
function Plate({ style }: { style?: object }) {
  return <View pointerEvents="none" style={[StyleSheet.absoluteFill, styles.plate, style]} />;
}

/**
 * "● Recording", top left over the live map. The dot is the one red light on
 * the live screen besides the route: a recording light, breathing slowly. It
 * says the recorder is running and nothing else — no speed, no target
 * (NO_IN_DRIVE_SPEED_NUDGES). Still under Reduce Motion or off focus.
 */
export function RecordingBadge() {
  const reduced = useReducedMotion();
  const focused = useIsFocused();
  const live = focused && !reduced;
  const level = useSharedValue(1);

  useEffect(() => {
    if (!live) {
      cancelAnimation(level);
      level.set(1);
      return;
    }
    level.set(
      withRepeat(
        withTiming(0.35, { duration: ambient.pulse / 2, easing: Easing.inOut(Easing.ease) }),
        -1,
        true,
      ),
    );
    return () => cancelAnimation(level);
  }, [live, level]);

  const dot = useAnimatedStyle(() => ({ opacity: level.get() }));

  return (
    <View style={styles.badge} accessible accessibilityRole="text" accessibilityLabel="Recording">
      <Plate />
      <Animated.View style={[styles.recDot, dot]} />
      <Text variant="mono" style={styles.badgeText} maxFontSizeMultiplier={1.4}>
        Recording
      </Text>
    </View>
  );
}

/** A crosshair: recentre on my position. */
function RecentreGlyph({ ink }: { ink: string }) {
  return (
    <Svg width={22} height={22} viewBox="0 0 24 24" fill="none">
      <Circle cx={12} cy={12} r={6.5} stroke={ink} strokeWidth={1.7} />
      <Circle cx={12} cy={12} r={1.6} fill={ink} />
      <Path
        d="M12 2.5v3.2M12 18.3v3.2M2.5 12h3.2M18.3 12h3.2"
        stroke={ink}
        strokeWidth={1.7}
        strokeLinecap="round"
      />
    </Svg>
  );
}

/**
 * The live map's two controls, top right: recentre, and the HUD toggle. The
 * HUD's label is white with the tab bar's red light under it while the speed
 * display shows, grey without.
 */
export function MapControls({
  canRecentre,
  onRecentre,
  hudVisible,
  onToggleHud,
}: {
  canRecentre: boolean;
  onRecentre: () => void;
  hudVisible: boolean;
  onToggleHud: () => void;
}) {
  return (
    <View style={styles.controls}>
      <PressableScale
        onPress={onRecentre}
        disabled={!canRecentre}
        silent={!canRecentre}
        accessibilityRole="button"
        accessibilityLabel="Recentre on my position"
        accessibilityState={{ disabled: !canRecentre }}
        style={[styles.control, !canRecentre && styles.controlOff]}
      >
        <Plate />
        <RecentreGlyph ink={color.text1} />
      </PressableScale>
      <PressableScale
        onPress={onToggleHud}
        accessibilityRole="button"
        accessibilityLabel={hudVisible ? 'Hide speed display' : 'Show speed display'}
        style={styles.control}
      >
        <Plate />
        <Text
          variant="monoSmall"
          style={[styles.hudLabel, { color: hudVisible ? color.text1 : color.text3 }]}
          maxFontSizeMultiplier={1.3}
        >
          HUD
        </Text>
        {hudVisible ? <View style={styles.hudLight} /> : null}
      </PressableScale>
    </View>
  );
}

const styles = StyleSheet.create({
  plate: {
    borderRadius: radius.sm,
    transform: slant.transform,
    backgroundColor: alpha(color.canvas, 0.86),
    borderWidth: 1,
    borderColor: color.hairline,
  },
  badge: {
    minHeight: 32,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    paddingHorizontal: space.md + 2,
    alignSelf: 'flex-start',
  },
  recDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: color.accent,
    // A light, so it glows.
    boxShadow: `0 0 ${glow.tight}px ${alpha(color.accent, 0.85)}`,
  },
  badgeText: { color: color.text1 },
  controls: { gap: space.md },
  control: {
    width: MAP_CONTROL,
    height: MAP_CONTROL,
    alignItems: 'center',
    justifyContent: 'center',
  },
  controlOff: { opacity: 0.45 },
  hudLabel: { letterSpacing: 0.6 },
  hudLight: {
    position: 'absolute',
    bottom: 9,
    width: 14,
    height: 2,
    borderRadius: 1,
    backgroundColor: color.accent,
    transform: slant.transform,
    boxShadow: `0 0 6px ${alpha(color.accent, 0.8)}`,
  },
});
