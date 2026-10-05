import React, { useRef } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import Animated, { type SharedValue, useAnimatedStyle } from 'react-native-reanimated';
import { Text } from '@/components/Text';
import { color, gutter, space } from '@/theme/tokens';
import { COPY_ROWS, copyRowAt } from './hero/heroMath';
import { type IntroPageCopy, WELCOME_LINES } from './introTimeline';

/** How far each row of copy rises as it fades in (the mock's translateY(14px)). */
const RISE = 14;

type Props = {
  copy: IntroPageCopy;
  width: number;
  /** Off-page: hidden from VoiceOver so its focus stays on the page in view. */
  hidden: boolean;
  /** The copy cascade, 0 → 1 (useHeroClock's `copy`). */
  cascade: SharedValue<number>;
  /** Reports the window y of the first line, for the scene to fit above it. */
  onTextTop: (y: number) => void;
  /** A vertical drag began on this page (see the pager's `settle`). */
  onVerticalDrag?: () => void;
};

/**
 * Page 1, the welcome: "Every drive. / Measured. / Verified." over the
 * motorway (./hero/HeroScene, drawn behind the whole carousel and sliding
 * away with this page), and the line under it. Only the words live here; the
 * scene is laid out around where they land, so the copy sits low, by the
 * thumb and the button, at every phone size and text size.
 *
 * The three lines are one header to VoiceOver, read as the sentence they are.
 * "Verified." is lit: the one word in red, the light the rest of the app
 * keeps for things that are lit.
 *
 * Scrolls vertically like every carousel page, so at the largest text sizes
 * the copy stays reachable rather than running under the button.
 */
export function WelcomePage({ copy, width, hidden, cascade, onTextTop, onVerticalDrag }: Props) {
  const block = useRef<View>(null);
  return (
    <View
      style={{ width }}
      accessibilityElementsHidden={hidden}
      importantForAccessibility={hidden ? 'no-hide-descendants' : 'auto'}
    >
      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        alwaysBounceVertical={false}
        onScrollBeginDrag={onVerticalDrag}
      >
        <View
          ref={block}
          collapsable={false}
          onLayout={() => block.current?.measureInWindow((_x, y) => onTextTop(y))}
        >
          <View accessible accessibilityRole="header" accessibilityLabel={copy.title}>
            {WELCOME_LINES.map((line, i) => (
              <Row key={line} cascade={cascade} row={COPY_ROWS.title[i]}>
                <Text
                  variant="display"
                  numberOfLines={1}
                  adjustsFontSizeToFit
                  minimumFontScale={0.7}
                  style={i === WELCOME_LINES.length - 1 ? styles.lit : undefined}
                >
                  {line}
                </Text>
              </Row>
            ))}
          </View>
          {copy.subtitle ? (
            <Row cascade={cascade} row={COPY_ROWS.body}>
              <Text variant="callout" style={styles.body}>
                {copy.subtitle}
              </Text>
            </Row>
          ) : null}
        </View>
      </ScrollView>
    </View>
  );
}

/** One row of the copy, rising into place in turn. */
function Row({
  cascade,
  row,
  children,
}: {
  cascade: SharedValue<number>;
  row: number;
  children: React.ReactNode;
}) {
  const style = useAnimatedStyle(() => {
    const p = copyRowAt(cascade.value, row);
    return { opacity: p, transform: [{ translateY: RISE * (1 - p) }] };
  });
  return <Animated.View style={style}>{children}</Animated.View>;
}

const styles = StyleSheet.create({
  // Bottom-aligned: the words sit just over the button, the scene above them.
  content: {
    flexGrow: 1,
    justifyContent: 'flex-end',
    paddingHorizontal: gutter,
    paddingTop: space.lg,
    paddingBottom: space.md,
  },
  /**
   * Racing red as ink, on purpose and only here: at display size on the night
   * it is large text at 4.57:1 (AA asks 3:1), and the word is the light the
   * statement turns on. Everywhere else red text is accentHot.
   */
  lit: { color: color.accent },
  body: { marginTop: space.md, maxWidth: 340 },
});
