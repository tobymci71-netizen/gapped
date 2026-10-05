/**
 * Crash and error reporting.
 *
 * Both Sentry and PostHog initialise only when their keys are present, so a
 * checkout without credentials stays silent rather than erroring.
 *
 * Neither key is set for the App Store release, and that is a promise rather
 * than an omission: the privacy policy and app.json's privacy manifest say no
 * crash or analytics data is collected, and `npm run check:release` refuses a
 * production build that sets either. Turning one on means changing all three.
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

/**
 * Whether Sentry.init ran. Everything that reports checks it, so a build
 * without a DSN neither sends nor pretends to: the test crash below used to
 * crash such a build for real, with nowhere for the report to go.
 */
let sentryReady = false;

// ── Init ────────────────────────────────────────────────────────────────────

export function initObservability(): void {
  if (sentryDsn && !sentryReady) {
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
    sentryReady = true;
  }

  if (posthogKey && !posthog) {
    posthog = new PostHog(posthogKey, {
      host: process.env.EXPO_PUBLIC_POSTHOG_HOST ?? 'https://us.i.posthog.com',
    });
  }
}

/**
 * Product analytics. Deliberately anonymous: `identify()` is never called, so
 * PostHog holds a device-scoped id and no link to a Gapped account.
 *
 * Off for the App Store release (no key), so app.json's privacy manifest
 * declares no Product Interaction at all. Setting a key means declaring it
 * there (unlinked, Analytics) and in the privacy policy first — and if
 * identify() is ever added, as linked.
 */
export function track(
  event: string,
  properties?: Record<string, string | number | boolean | null>,
): void {
  posthog?.capture(event, scrub(properties) as typeof properties);
}

/**
 * Report an error the app caught and recovered from (the error boundary's
 * fallback screen). A no-op unless Sentry was initialised; scrubbed by
 * beforeSend like everything else when it was.
 */
export function reportError(error: unknown): void {
  if (!sentryReady) return;
  Sentry.captureException(error);
}

/**
 * Deliberate crash, for confirming that a build reports and that the stack
 * symbolicates. Nothing in the app calls it now; it is kept for a developer
 * to call from a dev build that has a DSN.
 *
 * A no-op unless Sentry was initialised. Without a DSN there is no report to
 * check, and the "test" was just a real crash in front of the person using
 * the app.
 *
 * Throws asynchronously so it escapes the React event handler and lands as an
 * unhandled error — a caught throw would be swallowed and prove nothing.
 */
export function triggerTestCrash(): void {
  if (!sentryReady) return;
  setTimeout(() => {
    throw new Error('Gapped test crash — deliberate');
  }, 0);
}
