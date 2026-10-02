/**
 * Foreground location permission, read as the three facts the Drive tab acts
 * on. Pure, so the mapping is testable without a device.
 *
 * `status` alone hid two states that both leave the app recording nothing
 * while it shows "Start drive" as if all were well:
 *
 *  - Denied for good. Once iOS has a refusal (or Android a "Don't ask again"),
 *    requestForegroundPermissionsAsync resolves 'denied' instantly with no
 *    dialog, so "Enable location" is permanently inert. Only Settings can
 *    resolve it, and `canAskAgain` is how we know to send the user there.
 *  - Granted, but approximate. iOS with Precise Location off and Android with
 *    only COARSE both report status 'granted'. Their fixes are kilometres
 *    wide with no speed, so every one fails the 20 m accuracy gate and the
 *    drive summarises to zero — and auto-start never sees a speed to arm on.
 */

import type { LocationPermissionResponse } from 'expo-location';

export type LocationAccess = {
  permission: 'unknown' | 'granted' | 'denied';
  /** False once the OS will no longer show its prompt. */
  canAskAgain: boolean;
  /** False when access is granted but approximate. */
  precise: boolean;
};

export function readLocationAccess(
  r: Pick<LocationPermissionResponse, 'status' | 'canAskAgain' | 'ios' | 'android'>,
): LocationAccess {
  const permission =
    r.status === 'granted' ? 'granted' : r.status === 'denied' ? 'denied' : 'unknown';
  return {
    permission,
    canAskAgain: r.canAskAgain,
    // Absent details (older OS, web) read as precise: below iOS 14 there is no
    // approximate mode to be in.
    precise: r.ios?.accuracy !== 'reduced' && r.android?.accuracy !== 'coarse',
  };
}
