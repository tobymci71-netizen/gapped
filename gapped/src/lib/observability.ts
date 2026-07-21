/**
 * Sentry + PostHog wiring (Phase 1 checklist). Both initialise only when
 * their keys are present, so local dev without credentials stays silent.
 *
 * Env:
 *   EXPO_PUBLIC_SENTRY_DSN
 *   EXPO_PUBLIC_POSTHOG_API_KEY
 *   EXPO_PUBLIC_POSTHOG_HOST (optional, defaults to https://us.i.posthog.com)
 */

import * as Sentry from '@sentry/react-native';
import PostHog from 'posthog-react-native';

const sentryDsn = process.env.EXPO_PUBLIC_SENTRY_DSN;
const posthogKey = process.env.EXPO_PUBLIC_POSTHOG_API_KEY;

export let posthog: PostHog | null = null;

export function initObservability(): void {
  if (sentryDsn) {
    Sentry.init({ dsn: sentryDsn, tracesSampleRate: 0.1 });
  }
  if (posthogKey) {
    posthog = new PostHog(posthogKey, {
      host: process.env.EXPO_PUBLIC_POSTHOG_HOST ?? 'https://us.i.posthog.com',
    });
  }
}

export function track(
  event: string,
  properties?: Record<string, string | number | boolean | null>,
): void {
  posthog?.capture(event, properties);
}
