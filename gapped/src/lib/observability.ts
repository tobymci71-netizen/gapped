/**
 * Crash and error reporting.
 *
 * Both Sentry and PostHog initialise only when their keys are present, so a
 * checkout without credentials stays silent rather than erroring.
 *
 * Env (never committed — see .env.example):
 *   EXPO_PUBLIC_SENTRY_DSN
 *   EXPO_PUBLIC_POSTHOG_API_KEY
 *   EXPO_PUBLIC_POSTHOG_HOST (optional, defaults to https://us.i.posthog.com)
 *
 * Everything leaving the device passes through `scrub` first — see scrub.ts
 * for why that is not optional in an app that records precise location.
 */

import * as Sentry from '@sentry/react-native';
import PostHog from 'posthog-react-native';
import { scrub } from './scrub';

const sentryDsn = process.env.EXPO_PUBLIC_SENTRY_DSN;
const posthogKey = process.env.EXPO_PUBLIC_POSTHOG_API_KEY;

export let posthog: PostHog | null = null;

// ── Init ────────────────────────────────────────────────────────────────────

export function initObservability(): void {
  if (sentryDsn) {
    Sentry.init({
      dsn: sentryDsn,
      tracesSampleRate: 0.1,

      // The device's IP is location data at city granularity, and this app
      // already knows where the user is far more precisely. Nothing is gained
      // by sending it too.
      sendDefaultPii: false,

      /**
       * Last gate before anything leaves the device. Runs on every event
       * including native crashes forwarded to JS.
       */
      beforeSend(event) {
        return scrub(event) as typeof event;
      },

      /**
       * Breadcrumbs are the bigger risk. Sentry records fetch/XHR URLs
       * automatically, and this app talks to PostgREST with filters in the
       * query string — `?lat=eq.49.4657` is a breadcrumb by default.
       */
      beforeBreadcrumb(breadcrumb) {
        if (breadcrumb.category === 'console' && breadcrumb.level === 'debug') return null;
        return scrub(breadcrumb) as typeof breadcrumb;
      },
    });
  }

  if (posthogKey) {
    posthog = new PostHog(posthogKey, {
      host: process.env.EXPO_PUBLIC_POSTHOG_HOST ?? 'https://us.i.posthog.com',
    });
  }
}

/**
 * Product analytics. Deliberately anonymous: `identify()` is never called, so
 * PostHog holds a device-scoped id and no link to a Gapped account. The App
 * Privacy manifest declares Product Interaction as unlinked on that basis — if
 * identify() is ever added, app.json must change with it.
 */
export function track(
  event: string,
  properties?: Record<string, string | number | boolean | null>,
): void {
  posthog?.capture(event, scrub(properties) as typeof properties);
}

/**
 * Deliberate crash, for confirming that a build reports and that the stack
 * symbolicates. Reachable from Settings.
 *
 * Throws asynchronously so it escapes the React event handler and lands as an
 * unhandled error — a caught throw would be swallowed and prove nothing.
 */
export function triggerTestCrash(): void {
  setTimeout(() => {
    throw new Error('Gapped test crash — deliberate, triggered from Settings');
  }, 0);
}
