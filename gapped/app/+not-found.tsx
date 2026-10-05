import { Redirect } from 'expo-router';
import React from 'react';

/**
 * Any path the app has no screen for — a stale or mistyped gapped:// link, a
 * route a later build removed — goes to the start, which sends a driver to the
 * Drive tab or onboarding as their profile says (app/index.tsx).
 *
 * expo-router's own not-found screen is a developer page ("Unmatched Route",
 * a link to the sitemap) that no one using the app should ever land on. The
 * sitemap itself is turned off in app.json (expo-router plugin, sitemap:
 * false) for the same reason.
 */
export default function NotFound() {
  return <Redirect href="/" />;
}
