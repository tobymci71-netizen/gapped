import React from 'react';
import { StyleSheet, View, ViewProps } from 'react-native';
import { OnSurface } from '@/components/Text';
import { color, radius, space } from '@/theme/tokens';

export function Card({ style, children, ...rest }: ViewProps) {
  return (
    <View {...rest} style={[styles.card, style]}>
      {/* surface1: muted text inside a card needs the lighter grey to stay legible. */}
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
