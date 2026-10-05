import { useRouter } from 'expo-router';
import React, { useCallback } from 'react';
import { type StyleProp, type ViewStyle } from 'react-native';
import { SlantTag } from '@/components/brand/SlantTag';
import { SHOW_PRO } from '@/config/flags';
import { goProRoute } from '@/config/plans';

/**
 * The small "PRO" chip that marks a locked feature: a white-outlined SlantTag,
 * the same chip the board's SAMPLE and BENCHMARK labels use. Not red — a lock
 * is not a light. Decorative to VoiceOver: whatever it sits on says "Gapped
 * Pro" in its own label. It pins itself to the start of its line; pass
 * `style` to place it otherwise in a row. Grows with Dynamic Type to
 * maxFontScale.chip, as before.
 *
 * Draws nothing while SHOW_PRO is off: a chip names a plan that cannot be
 * bought yet. Every lock that wears one is off then too (SHOW_PRO is
 * PRO_LIMITS_ENFORCED), so this is the backstop, not the switch.
 */
export function ProBadge({ style }: { style?: StyleProp<ViewStyle> } = {}) {
  if (!SHOW_PRO) return null;
  return <SlantTag label="PRO" variant="white-outline" size="sm" decorative style={style} />;
}

/**
 * Where a Pro lock leads: the published Free-vs-Pro matrix today, and the
 * paywall once purchases are wired. Onboarding's garage step locks too, so
 * the destination has to be reachable before onboarding ends: /plans sits
 * outside the onboarded guard (app/_layout.tsx), and the paywall must as well.
 *
 * A no-op while SHOW_PRO is off (goProRoute, src/config/plans.ts): /plans
 * only redirects then, and nothing should lead anywhere it cannot sell.
 */
export function useGoPro(): () => void {
  const router = useRouter();
  return useCallback(() => {
    const to = goProRoute();
    if (to) router.push(to);
  }, [router]);
}
