import React from 'react';
import { GappedMark } from '@/components/brand/GappedMark';

/**
 * The G mark at the head of setup and the paywall — the splash's mark at
 * header size, as the reference carries its own through to the last screens.
 * The red streaks are tail lights, so it carries its red glow.
 *
 * Read as "Gapped": on these screens it is the only statement of the brand.
 */
export function Wordmark() {
  return <GappedMark size="sm" glow accessibilityLabel="Gapped" />;
}
