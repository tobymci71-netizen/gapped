import React, { useRef } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { Text } from '@/components/Text';
import { gutter, space } from '@/theme/tokens';
import type { IntroPageCopy } from './introTimeline';

type Props = {
  copy: IntroPageCopy;
  /** Page width: the window's, since the pager is full-bleed. */
  width: number;
  /** Off-page: hidden from VoiceOver so its focus stays on the page in view. */
  hidden: boolean;
  /**
   * Heading above the visual, left-aligned (the cornering page, as in the
   * reference), instead of centred beneath it.
   */
  headingFirst?: boolean;
  /** The page's object: the dial, the board card, the gauge, the car. */
  children: React.ReactNode;
  /** A vertical drag began on this page (see the pager's `settle`). */
  onVerticalDrag?: () => void;
  /**
   * The page's visible window, in content coordinates: how far it is
   * scrolled and how tall it is. Reported on layout and as it scrolls, for a
   * page whose demo should wait until it is actually in view.
   */
  onViewport?: (top: number, height: number) => void;
};

/**
 * One carousel page: a visual and its heading.
 *
 * Each page scrolls vertically inside the horizontal pager. At 375×667 every
 * page fits; at the largest Dynamic Type sizes the copy outgrows the screen,
 * and a page that cannot scroll would push its last line under the button.
 * Short content stays centred (flexGrow + center) and does not rubber-band.
 */
export function IntroPage({
  copy,
  width,
  hidden,
  headingFirst = false,
  children,
  onVerticalDrag,
  onViewport,
}: Props) {
  const viewport = useRef({ top: 0, height: 0 });
  const heading = (
    <View style={[styles.heading, headingFirst ? styles.headingFirst : styles.headingAfter]}>
      <Text
        variant="headline"
        accessibilityRole="header"
        // No one-word last line ("See where you stack / up").
        lineBreakStrategyIOS="push-out"
        style={headingFirst ? undefined : styles.centerText}
      >
        {copy.title}
      </Text>
      {copy.subtitle ? (
        <Text
          variant="body"
          lineBreakStrategyIOS="push-out"
          accessibilityLabel={copy.spokenSubtitle}
          style={[styles.subtitle, !headingFirst && styles.centerText]}
        >
          {copy.subtitle}
        </Text>
      ) : null}
    </View>
  );

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
        onLayout={(e) => {
          viewport.current.height = e.nativeEvent.layout.height;
          onViewport?.(viewport.current.top, viewport.current.height);
        }}
        onScroll={
          onViewport
            ? (e) => {
                viewport.current.top = e.nativeEvent.contentOffset.y;
                onViewport(viewport.current.top, viewport.current.height);
              }
            : undefined
        }
        scrollEventThrottle={onViewport ? 32 : undefined}
      >
        {headingFirst ? heading : null}
        {children}
        {headingFirst ? null : heading}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  content: {
    flexGrow: 1,
    justifyContent: 'center',
    paddingHorizontal: gutter,
    paddingVertical: space.lg,
  },
  heading: { alignSelf: 'stretch' },
  headingFirst: { marginBottom: space.xl },
  headingAfter: { marginTop: space.xl },
  centerText: { textAlign: 'center' },
  subtitle: { marginTop: space.sm },
});
