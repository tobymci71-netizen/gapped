import React from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { type SharedValue, useAnimatedStyle } from 'react-native-reanimated';
import { alpha, color, glow, slant, space } from '@/theme/tokens';
import { dotEmphasis, dotsOpacity, INTRO_PAGE_COUNT } from './introTimeline';

/** A page mark's length at rest, and lit for the page in view. */
const MARK = 10;
const LIT = 24;
const MARK_HEIGHT = 3;
/** The slot's height: a touch target for the adjustable control it is. */
const HEADER_HEIGHT = 44;

type Props = {
  /** Scroll offset in pages: 0 on the first page, 1.5 halfway to the third. */
  position: SharedValue<number>;
  /** The page most in view. */
  page: number;
  /** Move to a page; VoiceOver's swipe up/down on the control calls it. */
  onSelectPage: (page: number) => void;
  /** Hidden from VoiceOver while the splash is still up. */
  hidden: boolean;
};

/**
 * The carousel's header slot: the page marks. On the first page they are
 * out of the way of the welcome scene and its G mark, and they arrive as
 * that page is swiped away (dotsOpacity, ./introTimeline); the mark goes the
 * other way, so the two never overprint.
 *
 * The marks are short slanted dashes, the logo's lean, like lane markings;
 * the page in view is a lit red one, the way the tab bar lights the active
 * tab. The light slides between marks with the finger.
 *
 * For VoiceOver it is one adjustable control, "Gapped, page 2 of 4", that
 * swipes up and down through the pages, so the page position and a way to
 * change it are there on every page, the first included, where the marks are
 * not drawn.
 */
export function IntroHeader({ position, page, onSelectPage, hidden }: Props) {
  const dotsStyle = useAnimatedStyle(() => ({ opacity: dotsOpacity(position.value) }));

  return (
    <View
      style={styles.slot}
      accessible={!hidden}
      accessibilityElementsHidden={hidden}
      importantForAccessibility={hidden ? 'no-hide-descendants' : 'auto'}
      accessibilityRole="adjustable"
      accessibilityLabel="Gapped"
      accessibilityValue={{ text: `Page ${page + 1} of ${INTRO_PAGE_COUNT}` }}
      accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
      onAccessibilityAction={(e) => {
        if (e.nativeEvent.actionName === 'increment') onSelectPage(page + 1);
        if (e.nativeEvent.actionName === 'decrement') onSelectPage(page - 1);
      }}
    >
      <Animated.View style={[styles.layer, styles.marks, dotsStyle]}>
        {Array.from({ length: INTRO_PAGE_COUNT }, (_, i) => (
          <PageMark key={i} index={i} position={position} />
        ))}
      </Animated.View>
    </View>
  );
}

/**
 * One page mark. Its length and light are read off the scroll offset rather
 * than the settled page, so the light travels with the finger.
 */
function PageMark({ index, position }: { index: number; position: SharedValue<number> }) {
  const size = useAnimatedStyle(() => ({
    width: MARK + (LIT - MARK) * dotEmphasis(position.value, index),
  }));
  // The light is a second layer that fades in over the unlit mark: its glow
  // is a fixed shadow, so only an opacity animates.
  const light = useAnimatedStyle(() => ({ opacity: dotEmphasis(position.value, index) }));
  return (
    <Animated.View style={[styles.mark, size]}>
      <View style={[StyleSheet.absoluteFill, styles.unlit]} />
      <Animated.View style={[StyleSheet.absoluteFill, styles.lit, light]} />
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  slot: {
    height: HEADER_HEIGHT,
    alignItems: 'center',
    justifyContent: 'center',
  },
  layer: {
    ...StyleSheet.absoluteFill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  marks: { flexDirection: 'row', gap: space.sm },
  mark: { height: MARK_HEIGHT, transform: slant.transform },
  unlit: { borderRadius: 1, backgroundColor: color.outline },
  lit: {
    borderRadius: 1,
    backgroundColor: color.accent,
    boxShadow: `0 0 ${glow.tight}px ${alpha(color.accent, 0.8)}`,
  },
});
