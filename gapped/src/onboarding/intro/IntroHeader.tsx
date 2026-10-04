import React from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, {
  interpolateColor,
  type SharedValue,
  useAnimatedStyle,
} from 'react-native-reanimated';
import { color, space } from '@/theme/tokens';
import { dotEmphasis, dotsOpacity, INTRO_PAGE_COUNT, wordmarkOpacity } from './introTimeline';
import { Wordmark } from './Wordmark';

/** Inactive dot diameter, and the active dot's pill length. */
const DOT = 6;
const PILL = 18;
/** The slot's height: a touch target for the adjustable control it is. */
const HEADER_HEIGHT = 44;

type Props = {
  /** Scroll offset in pages: 0 on the first page, 1.5 halfway to the third. */
  position: SharedValue<number>;
  /** 0 while the splash mark is still on its way here. */
  markShown: SharedValue<number>;
  /** The page most in view. */
  page: number;
  /** Move to a page; VoiceOver's swipe up/down on the control calls it. */
  onSelectPage: (page: number) => void;
  /** The wordmark's frame, for the splash to measure and land on. */
  markRef: React.RefObject<View | null>;
  /** Hidden from VoiceOver while the splash is still up. */
  hidden: boolean;
};

/**
 * The carousel's header slot: the wordmark on the first page, page dots on
 * the others, trading places as the first page is swiped away (as the
 * reference does). See wordmarkOpacity in ./introTimeline.
 *
 * For VoiceOver it is one adjustable control, "Gapped, page 2 of 4", that
 * swipes up and down through the pages, so the page position and a way to
 * change it are there on every page, the first included, where the dots are
 * not drawn.
 */
export function IntroHeader({ position, markShown, page, onSelectPage, markRef, hidden }: Props) {
  const markStyle = useAnimatedStyle(() => ({
    opacity: markShown.value * wordmarkOpacity(position.value),
  }));
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
      <Animated.View style={[styles.layer, markStyle]}>
        <View ref={markRef} collapsable={false}>
          <Wordmark size="header" />
        </View>
      </Animated.View>
      <Animated.View style={[styles.layer, styles.dots, dotsStyle]}>
        {Array.from({ length: INTRO_PAGE_COUNT }, (_, i) => (
          <Dot key={i} index={i} position={position} />
        ))}
      </Animated.View>
    </View>
  );
}

/**
 * One page dot. The active one is a white pill; the pill slides between dots
 * with the finger, because each dot's emphasis is read off the scroll offset
 * rather than off the settled page.
 */
function Dot({ index, position }: { index: number; position: SharedValue<number> }) {
  const style = useAnimatedStyle(() => {
    const e = dotEmphasis(position.value, index);
    return {
      width: DOT + (PILL - DOT) * e,
      backgroundColor: interpolateColor(e, [0, 1], [color.disabled, color.text1]),
    };
  });
  return <Animated.View style={[styles.dot, style]} />;
}

const styles = StyleSheet.create({
  slot: {
    height: HEADER_HEIGHT,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: space.sm,
  },
  layer: {
    ...StyleSheet.absoluteFill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dots: { flexDirection: 'row', gap: space.sm },
  dot: { height: DOT, borderRadius: DOT / 2 },
});
