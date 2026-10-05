import React from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { Icon } from '@/components/icons';
import { PressableScale } from '@/components/PressableScale';
import { Text } from '@/components/Text';
import { color, space } from '@/theme/tokens';

type Action = {
  label: string;
  onPress: () => void;
  /** What VoiceOver says when the visible label is terse ("All drives" → "See all drives"). */
  accessibilityLabel?: string;
};

type Props = {
  title: string;
  /** A trailing link ("All drives ›"), in mono, with a 44pt target. */
  action?: Action;
  style?: StyleProp<ViewStyle>;
};

/**
 * A section's title in the wide italic, with an optional link on the right
 * (Nightrun-Drive's "Recent drives · All drives ›"). The title is a header to
 * VoiceOver, so the rotor can jump between sections.
 *
 * Lays out edge to edge of its parent: inside a gutter it lines up with the
 * gutter; above full-bleed rows give it `style={{ paddingHorizontal: 20 }}`.
 */
export function SectionHeader({ title, action, style }: Props): React.JSX.Element {
  return (
    <View style={[styles.row, style]}>
      <Text variant="title" accessibilityRole="header" style={styles.title} numberOfLines={2}>
        {title}
      </Text>
      {action ? (
        <PressableScale
          onPress={action.onPress}
          accessibilityRole="link"
          accessibilityLabel={action.accessibilityLabel ?? action.label}
          hitSlop={{ top: 4, bottom: 4 }}
          style={styles.action}
        >
          <Text variant="mono" style={styles.actionLabel}>
            {action.label}
          </Text>
          <Icon name="chevronRight" size={16} color={color.text2} strokeWidth={2} />
        </PressableScale>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: space.md,
  },
  title: { flexShrink: 1 },
  action: {
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    // The target reaches past the text; the negative margin keeps the
    // chevron's edge on the gutter line.
    paddingLeft: space.md,
    marginRight: -space.xs,
  },
  actionLabel: { color: color.text2 },
});
