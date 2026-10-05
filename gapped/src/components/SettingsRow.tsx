import React from 'react';
import { StyleSheet, View } from 'react-native';
import { SectionHeader } from '@/components/brand/SectionHeader';
import { Card } from '@/components/Card';
import { Icon, type IconName } from '@/components/icons';
import { PressableScale } from '@/components/PressableScale';
import { Text } from '@/components/Text';
import { color, space } from '@/theme/tokens';

const ICON = 22;
/** Separators start after the icon, iOS-style. */
const SEPARATOR_INSET = space.lg + ICON + space.md;

type Props = {
  /** The row's stroke icon (components/icons.tsx). Never an emoji. */
  icon: IconName;
  label: string;
  /** Right-aligned muted value (e.g. a version number). Replaces the chevron. */
  value?: string;
  destructive?: boolean;
  /**
   * Omit to render a non-interactive row — no press, no chevron.
   * The press is silent: the caller fires the haptic, so a toggle row can use
   * `haptic.selection()` rather than the throttle swallowing it behind
   * PressableScale's default `haptic.press()`.
   */
  onPress?: () => void;
};

export function SettingsRow({
  icon,
  label,
  value,
  destructive,
  onPress,
}: Props): React.JSX.Element {
  const ink = destructive ? color.danger : color.text2;
  const body = (
    <View style={styles.row}>
      <View style={styles.icon}>
        <Icon name={icon} size={ICON} color={ink} />
      </View>
      <Text
        variant="bodyMedium"
        numberOfLines={1}
        style={[styles.label, destructive ? { color: color.danger } : null]}
      >
        {label}
      </Text>
      {value != null ? (
        // Data, so mono (Units, Country, the version), in the soft text.
        <Text variant="mono" style={styles.value}>
          {value}
        </Text>
      ) : onPress ? (
        // Decorative, so it only needs the 3:1 of a graphic; text3 is 6.06:1.
        <Icon name="chevronRight" size={18} color={color.text3} strokeWidth={2} />
      ) : null}
    </View>
  );

  if (!onPress) return body;

  // The wrapper's label replaces the child text for screen readers, so the
  // value must still be announced — a Units row that never says mph or km/h is
  // unusable with VoiceOver. accessibilityValue carries it: VoiceOver reads it
  // after the label and Android appends it to the content description. Folding
  // it into the label as well read it twice ("Units, km/h, km/h, button").
  return (
    <PressableScale
      onPress={onPress}
      silent
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityValue={value != null ? { text: value } : undefined}
    >
      {body}
    </PressableScale>
  );
}

/**
 * A titled group of rows: the title in the wide italic (SectionHeader), the
 * rows on one night panel with hairlines between them.
 */
export function SettingsSection({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}): React.JSX.Element {
  const rows = React.Children.toArray(children).filter(Boolean);
  return (
    <View style={styles.section}>
      <SectionHeader title={title} />
      <Card style={styles.card}>
        {rows.map((row, i) => (
          <View key={i}>
            {i > 0 ? <View style={styles.separator} /> : null}
            {row}
          </View>
        ))}
      </Card>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    minHeight: 52,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: space.lg,
    gap: space.md,
  },
  icon: { width: ICON, height: ICON, alignItems: 'center', justifyContent: 'center' },
  label: { flex: 1 },
  value: { color: color.text2 },
  section: { marginTop: space.lg },
  // Rows own their padding so separators can run full-bleed from the inset.
  card: { padding: 0, overflow: 'hidden' },
  separator: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: color.hairline,
    marginLeft: SEPARATOR_INSET,
  },
});
