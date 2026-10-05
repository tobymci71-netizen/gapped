import React from 'react';
import { StyleSheet, View, ViewProps } from 'react-native';
import { OnSurface } from '@/components/Text';
import { color, radius, space } from '@/theme/tokens';

/**
 * A night panel: surface1 inside a hairline, small radius. Nightrun is not
 * bubbly — the radius is a softened corner, not a pill. Use a Card for a
 * thing that is genuinely a separate object (a sheet's content, a car, a
 * form); a run of equal figures reads better as open stats on the night than
 * as a grid of identical boxes.
 */
export function Card({ style, children, ...rest }: ViewProps) {
  return (
    <View {...rest} style={[styles.card, style]}>
      {/* Raised surface: muted text inside steps up a shade (Text's OnSurface). */}
      <OnSurface>{children}</OnSurface>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: color.surface1,
    borderRadius: radius.card,
    borderWidth: 1,
    borderColor: color.hairline,
    padding: space.lg,
  },
});
