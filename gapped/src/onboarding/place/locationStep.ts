/**
 * What the location step shows and offers, from the recorder's own permission
 * state (useDriveStore: `permission`, `canAskAgain`). Pure, so every state the
 * OS can leave us in has a test, and so the step never keeps a second, local
 * opinion of the permission that could drift from the one recording uses.
 *
 * The store re-reads the permission whenever the app returns to the
 * foreground (recorder.ts, syncPermission), so a change made in the Settings
 * app shows here without anyone tapping anything.
 */

import type { LocationAccess } from '@/drive/permission';

export type LocationStatus = 'notRequested' | 'allowed' | 'notAllowed';

/** The status at the end of the Location card (docs/ONBOARDING.md, "Location"). */
export const LOCATION_STATUS_LABEL: Record<LocationStatus, string> = {
  notRequested: 'Not requested',
  allowed: 'Allowed',
  notAllowed: 'Not allowed',
};

export function locationStatus(permission: LocationAccess['permission']): LocationStatus {
  return permission === 'granted' ? 'allowed' : permission === 'denied' ? 'notAllowed' : 'notRequested';
}

/**
 * The step's primary button.
 *
 *   enable    the OS can still show its dialog: ask
 *   settings  refused for good — iOS after any refusal, Android after "Don't
 *             ask again" — so the dialog would never appear and "Enable" would
 *             be a dead button. Only Settings can change it.
 *   retry     the last request threw (Android, granting with device Location
 *             off, then declining the "turn on location" dialog). The fix is a
 *             phone setting, not this app's permission, so ask again rather
 *             than send them to the app's settings page.
 *   continue  already allowed, nothing to ask; or the OS has just answered
 *             and the step is about to move on by itself, when a tap only
 *             skips the wait
 *
 * "Not now" sits under every one of these except continue. The step never
 * blocks (rule: optional now, recording needs it).
 */
export type LocationAction = 'enable' | 'settings' | 'retry' | 'continue';

/**
 * How the step's last request ended: none yet (or the step has been left and
 * come back to), the OS answered (either way), or the request threw.
 */
export type LastRequest = 'none' | 'answered' | 'failed';

export function locationAction(
  access: Pick<LocationAccess, 'permission' | 'canAskAgain'>,
  last: LastRequest,
): LocationAction {
  if (last === 'answered') return 'continue';
  if (last === 'failed') return 'retry';
  if (access.permission === 'granted') return 'continue';
  if (access.permission === 'denied' && !access.canAskAgain) return 'settings';
  return 'enable';
}

export const LOCATION_ACTION_LABEL: Record<LocationAction, string> = {
  enable: 'Enable location',
  settings: 'Open Settings',
  retry: 'Try again',
  continue: 'Continue',
};

/** The small print under the card. */
export function locationCaption(action: LocationAction): string {
  switch (action) {
    case 'settings':
      return "Optional now. Recording a drive needs location — allow it in Settings whenever you're ready.";
    case 'retry':
      return "Location couldn't start. Check Location is on for your phone, then try again.";
    default:
      return 'Optional now. Recording a drive needs location.';
  }
}
