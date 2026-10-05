import React, { useRef } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { ProBadge } from '@/components/ProBadge';
import { Text } from '@/components/Text';
import { gutter, space } from '@/theme/tokens';
import { type IntroPageCopy, marksPro, spokenTitle } from './introTimeline';

type Props = {
  copy: IntroPageCopy;
  /** Page width: the window's, since the pager is full-bleed. */
  width: number;
  /** Off-page: hidden from VoiceOver so its focus stays on the page in view. */
  hidden: boolean;
  /** Heading above the visual (the cornering page, as in the reference), not under it. */
  headingFirst?: boolean;
  /** The page's object: the board card, the gauge, the car. */
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
 * One carousel page after the welcome: a visual and its heading, set on the
 * night the way the welcome sets its words — left-aligned, the title in the
 * wide italic, the line under it soft. A page that demos a Pro feature
 * (`copy.proFeature`) wears the PRO chip above its title, but only while Pro
 * is shown at all (marksPro, SHOW_PRO): until then it is a plain page, with no
 * chip and no "Gapped Pro" in its spoken title.
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
  const pro = marksPro(copy);
  const heading = (
    <View style={[styles.heading, headingFirst ? styles.headingFirst : styles.headingAfter]}>
      {pro ? (
        // Over the title, as an eyebrow.
        <View style={styles.chip}>
          <ProBadge />
        </View>
      ) : null}
      <Text
        variant="headline"
        accessibilityRole="header"
        // The chip is silent to VoiceOver, so the title says "Gapped Pro".
        accessibilityLabel={pro ? spokenTitle(copy) : undefined}
        // No one-word last line ("See where you stack / up").
        lineBreakStrategyIOS="push-out"
      >
        {copy.title}
      </Text>
      {copy.subtitle ? (
        <Text
          variant="callout"
          lineBreakStrategyIOS="push-out"
          accessibilityLabel={copy.spokenSubtitle}
          style={styles.subtitle}
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
  headingAfter: { marginTop: space.xxl },
  subtitle: { marginTop: space.sm },
  chip: { marginBottom: space.sm },
});
