import { Redirect } from 'expo-router';
import React from 'react';
import { useProfile } from '@/state/profile';

export default function Index() {
  const onboarded = useProfile((s) => s.onboarded);
  return onboarded ? <Redirect href="/(tabs)/drive" /> : <Redirect href="/onboarding" />;
}
