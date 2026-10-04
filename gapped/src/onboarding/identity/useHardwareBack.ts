import { useFocusEffect } from 'expo-router';
import { useCallback } from 'react';
import { BackHandler } from 'react-native';

/**
 * Takes over Android's back button while this step is on top.
 *
 * Setup and the paywall show no back chevron (the frame hides it wherever the
 * progress bar is hidden): by then the questions are answered and the person
 * is past the point of going back. On iOS the screens also switch the edge
 * swipe off (`gestureEnabled: false`); this is the same decision for the one
 * back control Android has. `onBack` says what back means instead — nothing at
 * all during setup, "close" on the paywall.
 *
 * Registered on focus only, so a step underneath never swallows a back press
 * meant for the screen above it.
 */
export function useHardwareBack(onBack: () => void): void {
  useFocusEffect(
    useCallback(() => {
      const sub = BackHandler.addEventListener('hardwareBackPress', () => {
        onBack();
        return true;
      });
      return () => sub.remove();
    }, [onBack]),
  );
}
