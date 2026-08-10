import React from 'react';
import { StyleSheet, View } from 'react-native';
import { Card } from '@/components/Card';
import { PressableScale } from '@/components/PressableScale';
import { Text } from '@/components/Text';
import { color, space } from '@/theme/tokens';

const TILE = 28;
/** Separators start after the glyph tile, iOS-style. */
const SEPARATOR_INSET = space.lg + TILE + space.md;

type Props = {
  /** An emoji or text glyph rendered inside the tinted tile. */
  glyph: string;
  tint: string;
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
  glyph,
  tint,
  label,
  value,
  destructive,
  onPress,
}: Props): React.JSX.Element {
  const body = (
    <View style={styles.row}>
      <View style={[styles.tile, { backgroundColor: tint }]}>
        <Text style={styles.glyph}>{glyph}</Text>
      </View>
      <Text
        variant="bodyMedium"
        numberOfLines={1}
        style={[styles.label, destructive ? { color: color.danger } : null]}
      >
        {label}
      </Text>
      {value != null ? (
        <Text variant="caption" style={styles.value}>
          {value}
        </Text>
      ) : onPress ? (
        <Text style={styles.chevron}>›</Text>
      ) : null}
    </View>
  );

  if (!onPress) return body;

  // The wrapper's label replaces the child text for screen readers, so the
  // value has to be folded in — a Units row that never announces mph or km/h
  // is unusable with VoiceOver.
  return (
    <PressableScale
      onPress={onPress}
      silent
      accessibilityRole="button"
      accessibilityLabel={value != null ? `${label}, ${value}` : label}
      accessibilityValue={value != null ? { text: value } : undefined}
    >
      {body}
    </PressableScale>
  );
}

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
      <Text variant="caption" style={styles.sectionTitle}>
        {title.toUpperCase()}
      </Text>
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
  tile: {
    width: TILE,
    height: TILE,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  glyph: { fontSize: 15, lineHeight: 20, color: color.text1, textAlign: 'center' },
  label: { flex: 1 },
  value: { color: color.text3 },
  chevron: { fontSize: 20, lineHeight: 22, color: color.text3 },
  section: { marginTop: space.xl },
  sectionTitle: { color: color.text3, letterSpacing: 1, marginBottom: space.sm },
  // Rows own their padding so separators can run full-bleed from the inset.
  card: { padding: 0, overflow: 'hidden' },
  separator: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: color.hairline,
    marginLeft: SEPARATOR_INSET,
  },
});
