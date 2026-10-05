import React from 'react';
import { StyleSheet, View } from 'react-native';
import { Icon } from '@/components/icons';
import { alpha, color, glow, slant } from '@/theme/tokens';

/**
 * Tab bar icons: the Nightrun stroke set (components/icons.tsx), with the
 * active tab's light — a small red slanted lamp on the bar's top edge, the
 * one red thing in the bar (Nightrun-Drive, Nightrun-Ranks).
 */

export type TabIconName = 'driving' | 'ranks' | 'garage' | 'you';

/**
 * Tab tints, shared with the navigator's label tints so icon and label cannot
 * drift apart. Active is white, not red: the light above it carries the red.
 * Inactive is text3, which clears AA on the night bar (6.32:1) for the 11pt
 * labels — an unselected tab is still a live control, not a disabled one.
 */
export const TAB_TINT = { active: color.text1, inactive: color.text3 } as const;

const SIZE = 24;

/**
 * Where the bar's top edge is, measured up from the icon's top: the uikit tab
 * item pads 5pt above its 28pt icon box, which centres this 24pt icon 2pt
 * down, and the light sits over the 1pt border above that.
 */
const LIGHT_TOP = -(5 + 2 + 1);

export function TabIcon({
  name,
  focused,
}: {
  name: TabIconName;
  focused: boolean;
}): React.JSX.Element {
  // The navigator draws the icon twice, focused and not, and cross-fades the
  // two; the light belongs to the focused copy, so it fades with it.
  return (
    <View style={styles.box}>
      {focused ? <View style={styles.light} /> : null}
      <Icon name={name} size={SIZE} color={focused ? TAB_TINT.active : TAB_TINT.inactive} />
    </View>
  );
}

const styles = StyleSheet.create({
  box: { width: SIZE, height: SIZE, alignItems: 'center' },
  light: {
    position: 'absolute',
    top: LIGHT_TOP,
    width: 24,
    height: 3,
    borderRadius: 1,
    backgroundColor: color.accent,
    transform: slant.transform,
    boxShadow: `0 0 ${glow.tight}px 1px ${alpha(color.accent, 0.85)}, 0 0 ${glow.soft}px 4px ${alpha(color.accent, 0.35)}`,
  },
});
