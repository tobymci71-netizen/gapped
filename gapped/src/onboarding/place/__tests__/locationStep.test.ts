/**
 * Every state the OS can leave location permission in, and what the step
 * says and offers for it. The rule the table enforces: a button that cannot
 * do anything is never shown, and nothing here blocks onboarding.
 */

import {
  advancesOnAnswer,
  LOCATION_ACTION_LABEL,
  LOCATION_NOTE_TEXT,
  LOCATION_STATUS_LABEL,
  locationAction,
  locationCaption,
  locationNote,
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

describe('locationNote: recording with the screen locked', () => {
  test('before the tap, it says what to pick when iOS asks about Always', () => {
    expect(locationNote({ permission: 'unknown', background: 'undetermined' }, 'enable', false)).toBe(
      'chooseAlways',
    );
    expect(LOCATION_NOTE_TEXT.chooseAlways).toBe(
      'When iOS asks, choose Change to Always Allow so a drive keeps recording with the screen locked. Gapped only records during a drive.',
    );
  });

  test('while the dialogs are up it keeps saying so, even with foreground already in', () => {
    // Foreground answered, background not yet: not a warning, a dialog away.
    expect(locationNote({ permission: 'granted', background: 'undetermined' }, 'continue', true)).toBe(
      'chooseAlways',
    );
  });

  test('While Using only: says recording stops at screen lock, and how to fix it', () => {
    for (const background of ['denied', 'undetermined'] as const) {
      expect(locationNote({ permission: 'granted', background }, 'continue', false)).toBe('screenLock');
    }
    expect(LOCATION_NOTE_TEXT.screenLock).toMatch(/stop recording when the screen locks/);
    expect(LOCATION_NOTE_TEXT.screenLock).toMatch(/Settings/);
    expect(LOCATION_NOTE_TEXT.screenLock).toMatch(/Always/);
  });

  test('Always: nothing to say', () => {
    expect(locationNote({ permission: 'granted', background: 'granted' }, 'continue', false)).toBeNull();
  });

  test('location off: the caption covers it, except where asking is still the way in', () => {
    expect(locationNote({ permission: 'denied', background: 'denied' }, 'settings', false)).toBeNull();
    expect(locationNote({ permission: 'denied', background: 'denied' }, 'continue', false)).toBeNull();
    expect(locationNote({ permission: 'denied', background: 'denied' }, 'enable', false)).toBe('chooseAlways');
    expect(locationNote({ permission: 'unknown', background: 'undetermined' }, 'retry', false)).toBe(
      'chooseAlways',
    );
  });

  test('the step waits on the warning, and moves on by itself otherwise', () => {
    expect(advancesOnAnswer('screenLock')).toBe(false);
    expect(advancesOnAnswer(null)).toBe(true);
    expect(advancesOnAnswer('chooseAlways')).toBe(true);
  });

  test('never claims Gapped records outside a drive', () => {
    for (const text of Object.values(LOCATION_NOTE_TEXT)) {
      expect(text).not.toMatch(/all the time|always records|in the background at all times/i);
    }
  });
});
