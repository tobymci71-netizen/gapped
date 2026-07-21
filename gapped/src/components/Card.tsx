import React from 'react';
import { StyleSheet, View, ViewProps } from 'react-native';
import { color, radius, space } from '@/theme/tokens';

export function Card({ style, ...rest }: ViewProps) {
  return <View {...rest} style={[styles.card, style]} />;
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
