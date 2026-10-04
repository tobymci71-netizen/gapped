/**
 * Every state the OS can leave location permission in, and what the step
 * says and offers for it. The rule the table enforces: a button that cannot
 * do anything is never shown, and nothing here blocks onboarding.
 */

import {
  LOCATION_ACTION_LABEL,
  LOCATION_STATUS_LABEL,
  locationAction,
  locationCaption,
  locationStatus,
} from '../locationStep';

describe('locationStatus', () => {
  test.each([
    ['unknown', 'Not requested'],
    ['granted', 'Allowed'],
    ['denied', 'Not allowed'],
  ] as const)('%s reads %s', (permission, label) => {
    expect(LOCATION_STATUS_LABEL[locationStatus(permission)]).toBe(label);
  });
});

describe('locationAction', () => {
  test('never asked: ask', () => {
    expect(locationAction({ permission: 'unknown', canAskAgain: true }, 'none')).toBe('enable');
  });

  test('refused, but the OS will ask again (Android, first refusal): ask again', () => {
    expect(locationAction({ permission: 'denied', canAskAgain: true }, 'none')).toBe('enable');
  });

  test('refused for good: only Settings can change it', () => {
    expect(locationAction({ permission: 'denied', canAskAgain: false }, 'none')).toBe('settings');
  });

  test('already allowed: nothing to ask', () => {
    expect(locationAction({ permission: 'granted', canAskAgain: true }, 'none')).toBe('continue');
  });

  test('a request that threw is retried, whatever the permission says', () => {
    for (const permission of ['unknown', 'granted', 'denied'] as const) {
      expect(locationAction({ permission, canAskAgain: false }, 'failed')).toBe('retry');
    }
  });

  test('just answered, either way: Continue, never Open Settings flashing before the step leaves', () => {
    for (const permission of ['granted', 'denied'] as const) {
      for (const canAskAgain of [true, false]) {
        expect(locationAction({ permission, canAskAgain }, 'answered')).toBe('continue');
      }
    }
  });

  test('labels', () => {
    expect(LOCATION_ACTION_LABEL).toEqual({
      enable: 'Enable location',
      settings: 'Open Settings',
      retry: 'Try again',
      continue: 'Continue',
    });
  });
});

describe('locationCaption', () => {
  test('says it is optional, and why it matters', () => {
    expect(locationCaption('enable')).toBe('Optional now. Recording a drive needs location.');
    expect(locationCaption('settings')).toMatch(/^Optional now\./);
    expect(locationCaption('settings')).toMatch(/Settings/);
    expect(locationCaption('retry')).toMatch(/try again/);
  });
});
