import React, { useEffect } from 'react';
import { Linking, StyleSheet, View } from 'react-native';
import { useSharedValue, withTiming } from 'react-native-reanimated';
import { PressableScale } from '@/components/PressableScale';
import { OnSurface, Text } from '@/components/Text';
import { haptic } from '@/lib/haptics';
import { CheckBoxMark, panel, RowLight } from '@/onboarding/ui/choice';
import { duration, easing } from '@/theme/motion';
import { color, font, space, type } from '@/theme/tokens';
import type { ConsentLink } from './consentCopy';

/** The box's side. */
const BOX = 26;
/** Apple's minimum touch target, for the links inside a sentence. */
const HIT = 44;

/** Stretches a link's touch area to HIT above and below its line of text. */
const LINK_SLOP = {
  top: (HIT - type.legal.lineHeight) / 2,
  bottom: (HIT - type.legal.lineHeight) / 2,
  left: space.xs,
  right: space.xs,
};

/** Opens one of the public pages (src/config/links.ts) in the browser. */
export function openPage(url: string): void {
  Linking.openURL(url).catch(() => undefined);
}

/**
 * One box a driver ticks to agree to something: the safety step's two and
 * the trust step's one (TERMS_ROUTE). A whole-row checkbox — the label is
 * part of the target — on a night panel; ticked, the box fills white with a
 * check and the row's light comes on down its left edge, as every chosen row
 * in the flow does. VoiceOver reads it as a checkbox with its state.
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
      <RowLight on={on} />
      <CheckBoxMark on={on} size={BOX} />
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
            hitSlop={LINK_SLOP}
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
    ...panel,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    minHeight: 56,
    padding: space.lg,
    overflow: 'hidden',
  },
  checkLabel: { flex: 1, color: color.text1 },
  // A word space between runs; a run too long for the line wraps inside itself.
  sentence: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', columnGap: space.xs },
  sentenceCentred: { justifyContent: 'center' },
  centred: { textAlign: 'center' },
  // The 44pt target comes from hitSlop, not height: a 44pt-tall link made
  // every line it sat on 44pt tall, and a sentence that wrapped read as two
  // separate lines with a gap between them.
  link: { justifyContent: 'center' },
  // White and underlined, as every link in the flow (NightLink): red is
  // light, and a link is not one. The underline says "link" to anyone.
  linkText: {
    color: color.text1,
    fontFamily: font.bodyMedium,
    textDecorationLine: 'underline',
  },
});
