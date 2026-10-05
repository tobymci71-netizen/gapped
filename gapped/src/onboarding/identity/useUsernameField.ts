import { useCallback, useEffect, useRef, useState } from 'react';
import { AccessibilityInfo } from 'react-native';
import { isUsernameAvailable } from '@/lib/sync';
import { isUsernameAllowed, isValidUsername, normaliseUsername } from '@/lib/username';
import {
  type Availability,
  availabilityFrom,
  USERNAME_CHECK_TIMEOUT_MS,
  USERNAME_SETTLE_MS,
  usernameFieldState,
  type UsernameFieldState,
  withTimeout,
} from './usernameField';

export type UsernameField = {
  /** The field's text. */
  value: string;
  setValue: (raw: string) => void;
  /** Everything the screen draws: caption, tone, spinner, whether to allow saving. */
  field: UsernameFieldState;
  /** Typing has paused, or the field let go: judge `raw` now. */
  settle: (raw: string) => void;
  /** Record the server's refusal of `name` from a save, so the field shows it. */
  refuse: (name: string, verdict: 'taken' | 'not_allowed') => void;
};

/**
 * A username field's live state: the onboarding step and the edit-username
 * screen run exactly this, so the two can never disagree about a name.
 *
 * The availability check is asked once typing pauses (USERNAME_SETTLE_MS),
 * once per name, and never for a name the rules or the denylist mirror
 * already refuse — the server would only be asked who holds it. Answers are
 * remembered per name, so retyping a name already checked shows its verdict
 * at once; "could not ask" is not remembered, so retyping asks again.
 * usernameField.ts decides what each state looks like.
 */
export function useUsernameField(initial: string): UsernameField {
  const [value, setValue] = useState(initial);
  const [settledValue, setSettledValue] = useState(initial);
  const [verdicts, setVerdicts] = useState<Readonly<Record<string, Availability>>>({});

  const name = normaliseUsername(value);
  const field = usernameFieldState({
    raw: value,
    settled: settledValue === value,
    availability: verdicts[name] ?? 'unchecked',
  });

  // Callbacks below read these; render never does.
  const asked = useRef(new Set<string>());
  const alive = useRef(true);
  const latestName = useRef(name);
  useEffect(() => {
    latestName.current = name;
  }, [name]);
  // Set on every mount, not only cleared on unmount: development remounts
  // each screen once, and a flag that was only ever cleared stayed false after
  // that, dropping every verdict and leaving the spinner up for good.
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  const check = useCallback((n: string) => {
    if (asked.current.has(n)) return;
    asked.current.add(n);
    setVerdicts((v) => ({ ...v, [n]: 'checking' }));
    void withTimeout(isUsernameAvailable(n), USERNAME_CHECK_TIMEOUT_MS, null).then((free) => {
      if (!alive.current) return;
      const verdict = availabilityFrom(free);
      setVerdicts((v) => ({ ...v, [n]: verdict }));
      // "Available" changes no words on screen (the helper stays; only the
      // tick appears), so it is announced here, for the name still in the
      // field. "Taken" is a caption change, which the screen announces.
      if (verdict === 'available' && n === latestName.current) {
        AccessibilityInfo.announceForAccessibility(`${n} is available`);
      }
      // "Could not ask" is not remembered: retyping the name asks again.
      if (verdict === 'unknown') asked.current.delete(n);
    });
  }, []);

  const settle = useCallback(
    (raw: string) => {
      setSettledValue(raw);
      const n = normaliseUsername(raw);
      if (isValidUsername(n) && isUsernameAllowed(n)) check(n);
    },
    [check],
  );

  useEffect(() => {
    const timer = setTimeout(() => settle(value), USERNAME_SETTLE_MS);
    return () => clearTimeout(timer);
  }, [value, settle]);

  const refuse = useCallback((n: string, verdict: 'taken' | 'not_allowed') => {
    asked.current.add(n);
    setVerdicts((v) => ({ ...v, [n]: verdict }));
  }, []);

  return { value, setValue, field, settle, refuse };
}
