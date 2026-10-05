import React, { useEffect } from 'react';
import { Linking, StyleSheet, View } from 'react-native';
import Animated, {
  interpolateColor,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { PressableScale } from '@/components/PressableScale';
import { OnSurface, Text } from '@/components/Text';
import { haptic } from '@/lib/haptics';
import { CheckGlyph } from '@/onboarding/identity/glyphs';
import { duration, easing } from '@/theme/motion';
import { color, font, radius, space } from '@/theme/tokens';
import type { ConsentLink } from './consentCopy';

/** The box's side. */
const BOX = 26;
/** Apple's minimum touch target, for the links inside a sentence. */
const HIT = 44;

/** Opens one of the public pages (src/config/links.ts) in the browser. */
export function openPage(url: string): void {
  Linking.openURL(url).catch(() => undefined);
}

/**
 * One box a driver ticks to agree to something: the safety step's two and
 * the trust step's one (TERMS_ROUTE). A whole-row checkbox — the label is
 * part of the target — on the flow's surface2 card, with the lime fill
 * easing in. VoiceOver reads it as a checkbox with its state.
 */
export function ConsentCheck({
  label,
  checked,
  onToggle,
}: {
  label: string;
  checked: boolean;
  onToggle: () => void;
}) {
  const on = useSharedValue(checked ? 1 : 0);
  useEffect(() => {
    on.set(withTiming(checked ? 1 : 0, { duration: duration.fast, easing: easing.standard }));
  }, [checked, on]);
  const box = useAnimatedStyle(() => ({
    backgroundColor: interpolateColor(on.value, [0, 1], [color.surface2, color.accent]),
    borderColor: interpolateColor(on.value, [0, 1], [color.text3, color.accent]),
  }));
  const tick = useAnimatedStyle(() => ({ opacity: on.value }));

  return (
    <PressableScale
      silent
      onPress={() => {
        haptic.selection();
        onToggle();
      }}
      accessibilityRole="checkbox"
      accessibilityLabel={label}
      accessibilityState={{ checked }}
      style={styles.check}
    >
      <Animated.View style={[styles.box, box]}>
        <Animated.View style={tick}>
          <CheckGlyph size={18} color={color.onAccent} />
        </Animated.View>
      </Animated.View>
      <OnSurface>
        <Text variant="body" style={styles.checkLabel}>
          {label}
        </Text>
      </OnSurface>
    </PressableScale>
  );
}

/**
 * A sentence with links in it ("By continuing you agree to the Terms of Use
 * and Privacy Policy"), laid out as wrapping runs so each link can be a real
 * 44pt target rather than a nested span the size of its letters. Plain runs
 * read as text; each link reads as a link, by its name, and opens its page.
 */
export function LinkedSentence({
  runs,
  align = 'left',
}: {
  runs: readonly (string | ConsentLink)[];
  align?: 'left' | 'center';
}) {
  return (
    <View style={[styles.sentence, align === 'center' && styles.sentenceCentred]}>
      {runs.map((run) =>
        typeof run === 'string' ? (
          <Text key={run} variant="legal" style={align === 'center' && styles.centred}>
            {run}
          </Text>
        ) : (
          <PressableScale
            key={run.url}
            onPress={() => openPage(run.url)}
            accessibilityRole="link"
            accessibilityLabel={run.label}
            accessibilityHint="Opens in your browser"
            style={styles.link}
          >
            <Text variant="legal" style={styles.linkText}>
              {run.label}
            </Text>
          </PressableScale>
        ),
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  check: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    minHeight: 56,
    padding: space.lg,
    borderRadius: radius.card,
    backgroundColor: color.surface2,
  },
  box: {
    width: BOX,
    height: BOX,
    borderRadius: 8,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkLabel: { flex: 1, color: color.text1 },
  // A word space between runs; a run too long for the line wraps inside itself.
  sentence: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', columnGap: space.xs },
  sentenceCentred: { justifyContent: 'center' },
  centred: { textAlign: 'center' },
  link: { minHeight: HIT, justifyContent: 'center' },
  // Lime marks what can be tapped in this flow (the country chip); the
  // underline says "link" to anyone who cannot tell the colour apart.
  linkText: {
    color: color.accent,
    fontFamily: font.bodyMedium,
    textDecorationLine: 'underline',
  },
});
