import React from 'react';
import { Image, Platform, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { color } from '@/theme/tokens';

const MARK = require('../../../assets/brand/gapped-mark.png');

/** The mark's own proportions (assets/brand/gapped-mark.png, 748×409). */
const ASPECT = 748 / 409;

/** Widths the mockups use: the header mark, a card's, the welcome hero. */
export const GAPPED_MARK_SIZE = { sm: 64, md: 120, lg: 230 } as const;

type Props = {
  /** Width in points, or a named size. Height follows the mark's aspect. */
  size?: keyof typeof GAPPED_MARK_SIZE | number;
  /**
   * A soft red halo, as on the welcome screen. The mark's streaks are tail
   * lights, so it is one of the few things allowed to glow. iOS draws the
   * halo from the image's alpha, so it follows the G and the streaks rather
   * than the box; Android has no equivalent and shows the mark plain.
   */
  glow?: boolean;
  /**
   * Hidden from VoiceOver by default: beside the app's name, or in a header
   * whose screen already says where you are, the mark is decoration. Pass a
   * label ("Gapped") where it is the only statement of the brand.
   */
  accessibilityLabel?: string;
  style?: StyleProp<ViewStyle>;
};

/** The logo mark: a white G with the red streaks. */
export function GappedMark({ size = 'sm', glow = false, accessibilityLabel, style }: Props) {
  const width = typeof size === 'number' ? size : GAPPED_MARK_SIZE[size];
  const height = Math.round(width / ASPECT);
  const labelled = accessibilityLabel != null;
  return (
    <View
      style={[{ width, height }, glow && Platform.OS === 'ios' ? styles.glow : null, style]}
      accessible={labelled}
      accessibilityRole={labelled ? 'image' : undefined}
      accessibilityLabel={accessibilityLabel}
      accessibilityElementsHidden={!labelled}
      importantForAccessibility={labelled ? 'yes' : 'no-hide-descendants'}
    >
      <Image source={MARK} style={{ width, height }} resizeMode="contain" />
    </View>
  );
}

const styles = StyleSheet.create({
  // Legacy iOS shadow props, deliberately, not boxShadow: a CALayer shadow
  // with no shadowPath follows the layer's alpha, which is what makes it a
  // halo around the artwork. boxShadow would light up the bounding box.
  glow: {
    shadowColor: color.accent,
    shadowOpacity: 0.45,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 0 },
  },
});
