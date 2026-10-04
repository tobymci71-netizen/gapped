import { useEffect, useRef, useState } from 'react';
import { Keyboard, type KeyboardEvent, LayoutAnimation, Platform } from 'react-native';

/**
 * Whether the keyboard is up, with layout changes made in response riding the
 * keyboard's own curve.
 *
 * The one copy in the app: OnboardingFrame used to keep a private twin for a
 * heading that collapsed over the old inline country list, removed with that
 * list. iOS announces the keyboard before it moves (`Will*`), so a
 * LayoutAnimation armed in that event lands in the same commit as
 * KeyboardAvoidingView's padding and moves with the keyboard rather than
 * after it. Android reports after the fact (`Did*`) with no duration, so there
 * the change is immediate. Views that unmount in that commit fade out, and
 * views that mount fade in, instead of popping.
 *
 * `animate` is false while the step is covered by another or Reduce Motion is
 * on: a covered step must not arm an animation for the screen on top, and
 * Reduce Motion gets the end state.
 */
export function useKeyboardShown(animate: boolean): boolean {
  const [shown, setShown] = useState(() => Keyboard.isVisible());
  const current = useRef(shown);

  useEffect(() => {
    const ios = Platform.OS === 'ios';
    const handler = (next: boolean) => (e: KeyboardEvent) => {
      // iOS repeats Will-Show when the keyboard only changes shape (the
      // suggestions bar appearing). Arming an animation with nothing to
      // animate would animate whatever renders next instead.
      if (next === current.current) return;
      current.current = next;
      if (animate && e.duration > 0) {
        const type = LayoutAnimation.Types[e.easing] ?? LayoutAnimation.Types.keyboard;
        LayoutAnimation.configureNext({
          duration: e.duration,
          update: { duration: e.duration, type },
          create: { duration: e.duration, type, property: 'opacity' },
          delete: { duration: e.duration, type, property: 'opacity' },
        });
      }
      setShown(next);
    };
    const subs = [
      Keyboard.addListener(ios ? 'keyboardWillShow' : 'keyboardDidShow', handler(true)),
      Keyboard.addListener(ios ? 'keyboardWillHide' : 'keyboardDidHide', handler(false)),
    ];
    return () => subs.forEach((s) => s.remove());
  }, [animate]);

  return shown;
}
