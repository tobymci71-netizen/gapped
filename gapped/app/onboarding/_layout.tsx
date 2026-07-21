import { Stack } from 'expo-router';
import React from 'react';
import { color } from '@/theme/tokens';

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
