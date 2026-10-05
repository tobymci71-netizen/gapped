import { Redirect } from 'expo-router';
import React from 'react';
import { StyleSheet, View } from 'react-native';
import { GappedMark } from '@/components/brand/GappedMark';
import { color } from '@/theme/tokens';

/**
 * Any path the app has no screen for — a stale or mistyped gapped:// link, a
 * route a later build removed — goes to the start, which sends a driver to the
 * Drive tab or onboarding as their profile says (app/index.tsx).
 *
 * expo-router's own not-found screen is a developer page ("Unmatched Route",
 * a link to the sitemap) that no one using the app should ever land on. The
 * sitemap itself is turned off in app.json (expo-router plugin, sitemap:
 * false) for the same reason.
 *
 * The redirect happens once the route is focused, so this screen can be on
 * glass for a frame: the night with the mark on it rather than an empty
 * view. Decorative; nothing here is meant to be read.
 */
export default function NotFound() {
  return (
    <View style={styles.fill}>
      <GappedMark size="md" />
      <Redirect href="/" />
    </View>
  );
}

const styles = StyleSheet.create({
  fill: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: color.canvas,
  },
});
