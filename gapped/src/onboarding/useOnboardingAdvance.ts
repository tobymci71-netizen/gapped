import { useRouter } from 'expo-router';
import { useCallback } from 'react';
import { Keyboard } from 'react-native';
import { useProfile } from '@/state/profile';
import { nextRoute, type OnboardingRoute } from './flow';

/**
 * Continue, from the step at `current`: on to the next step in the flow, or —
 * past the last one — out of onboarding.
 *
 * Finishing is completeOnboarding() and then a replace to the Drive tab,
 * exactly as the last step always did. completeOnboarding() is what matters: it
 * flips `onboarded`, and the Stack.Protected guard in app/_layout.tsx swaps
 * the whole stack to the tabs with nothing behind them. Which step is last
 * depends on the flags (setup, or the paywall when ONBOARDING_PAYWALL is on),
 * which is why no screen decides it for itself.
 *
 * `navigate`, not `push` (app/onboarding/_layout.tsx explains why), so a double
 * tap on Continue cannot stack the next step twice. The keyboard is dismissed
 * first: a field that keeps focus while the next step is pushed over it leaves
 * the keyboard up on a step with nothing to type into.
 */
export function useOnboardingAdvance(current: OnboardingRoute): () => void {
  const router = useRouter();
  const completeOnboarding = useProfile((s) => s.completeOnboarding);
  return useCallback(() => {
    Keyboard.dismiss();
    const next = nextRoute(current);
    if (next) {
      router.navigate(next);
      return;
    }
    completeOnboarding();
    router.replace('/(tabs)/drive');
  }, [current, router, completeOnboarding]);
}
