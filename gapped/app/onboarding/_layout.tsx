import { Stack } from 'expo-router';
import React from 'react';
import { color } from '@/theme/tokens';

/**
 * Every forward step moves on with `router.navigate`, not `router.push`.
 *
 * In this stack the two differ in one way only: push always appends a new
 * screen, while navigate to the screen already on top is a no-op. A second
 * tap on Continue while the first push was still animating (iOS 26 accepts
 * touches mid-transition), or a permission request resolving twice, stacked a
 * duplicate step that Back then had to clear. Going back and forward again
 * still pushes a fresh step, because Back removes the old one.
 */
export default function OnboardingLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: color.canvas },
        animation: 'slide_from_right',
      }}
    />
  );
}
