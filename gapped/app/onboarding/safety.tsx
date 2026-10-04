import React, { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, {
  interpolateColor,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { Button } from '@/components/Button';
import { Entrance } from '@/components/Entrance';
import { OnboardingFrame } from '@/components/OnboardingFrame';
import { PressableScale } from '@/components/PressableScale';
import { OnSurface, Text } from '@/components/Text';
import { haptic } from '@/lib/haptics';
import {
  CheckGlyph,
  EyeGlyph,
  GaugeGlyph,
  ParkGlyph,
  PhoneGlyph,
} from '@/onboarding/identity/glyphs';
import { useOnboardingAdvance } from '@/onboarding/useOnboardingAdvance';
import { useProfile } from '@/state/profile';
import { duration, easing } from '@/theme/motion';
import { color, radius, space } from '@/theme/tokens';

/** The lime glyph tiles beside each guideline. */
const TILE = 40;
/** The acknowledgement's box. */
const BOX = 26;

/**
 * The guidelines, word for word as they were. Each emoji they used to lead
 * with is now a drawn glyph: docs/ONBOARDING.md rules out emoji in the flow's
 * chrome, and the emoji also rendered differently on every OS version.
 */
const GUIDELINES: { Glyph: typeof GaugeGlyph; text: string }[] = [
  { Glyph: GaugeGlyph, text: 'Obey local traffic laws and speed limits. Never drive recklessly.' },
  { Glyph: ParkGlyph, text: 'Start and stop recording only while safely parked.' },
  { Glyph: PhoneGlyph, text: 'Use a phone holder, just like with any navigation app.' },
  { Glyph: EyeGlyph, text: 'Never touch your phone while driving. Eyes on the road.' },
];

const ACKNOWLEDGEMENT = 'I acknowledge these guidelines and agree to drive responsibly.';

/**
 * The road-safety acknowledgement (docs/ONBOARDING.md, step 13, rule 4): the
 * app's record that a public speed board was accepted for responsible use.
 * The last question before setup, so it is the last thing read before the app
 * opens.
 *
 * Restyled to the flow — surface2 cards, lime glyphs, the white pill — and
 * otherwise unchanged in meaning: the same four guidelines, the same box that
 * must be ticked, the same `acceptSafety()` on agreeing, and the same line
 * that the driving is the driver's responsibility. With SAFETY_ACKNOWLEDGEMENT
 * off the flow never reaches this step, and `safetyAccepted` stays false.
 */
export default function SafetyStep() {
  const advance = useOnboardingAdvance('/onboarding/safety');
  const acceptSafety = useProfile((s) => s.acceptSafety);
  const [checked, setChecked] = useState(false);

  const on = useSharedValue(0);
  useEffect(() => {
    on.set(withTiming(checked ? 1 : 0, { duration: duration.fast, easing: easing.standard }));
  }, [checked, on]);
  const box = useAnimatedStyle(() => ({
    backgroundColor: interpolateColor(on.value, [0, 1], [color.surface2, color.accent]),
    borderColor: interpolateColor(on.value, [0, 1], [color.text3, color.accent]),
  }));
  const tick = useAnimatedStyle(() => ({ opacity: on.value }));

  return (
    <OnboardingFrame
      route="/onboarding/safety"
      title="Before you drive"
      subtitle="Important reminders to stay safe."
      footer={
        <Button
          label="I agree"
          variant="light"
          disabled={!checked}
          onPress={() => {
            acceptSafety();
            advance();
          }}
        />
      }
    >
      <Entrance index={0}>
        <View style={styles.card}>
          <OnSurface>
            {GUIDELINES.map(({ Glyph, text }) => (
              <View key={text} style={styles.row}>
                <View style={styles.tile}>
                  <Glyph size={22} color={color.accent} />
                </View>
                <Text variant="body" style={styles.guideline}>
                  {text}
                </Text>
              </View>
            ))}
          </OnSurface>
        </View>
      </Entrance>

      <Entrance index={1}>
        <PressableScale
          silent
          onPress={() => {
            haptic.selection();
            setChecked((c) => !c);
          }}
          accessibilityRole="checkbox"
          accessibilityLabel={ACKNOWLEDGEMENT}
          accessibilityState={{ checked }}
          style={styles.ack}
        >
          <Animated.View style={[styles.box, box]}>
            <Animated.View style={tick}>
              <CheckGlyph size={18} color={color.onAccent} />
            </Animated.View>
          </Animated.View>
          <OnSurface>
            <Text variant="body" style={styles.ackLabel}>
              {ACKNOWLEDGEMENT}
            </Text>
          </OnSurface>
        </PressableScale>
      </Entrance>

      <Entrance index={2}>
        <Text variant="legal">
          You are solely responsible for your driving. Gapped is a tracking tool and does not
          encourage speeding or dangerous driving.
        </Text>
      </Entrance>
    </OnboardingFrame>
  );
}

const styles = StyleSheet.create({
  card: {
    gap: space.lg,
    padding: space.lg,
    borderRadius: radius.card,
    backgroundColor: color.surface2,
  },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  tile: {
    width: TILE,
    height: TILE,
    borderRadius: 12,
    backgroundColor: color.accentTile,
    alignItems: 'center',
    justifyContent: 'center',
  },
  guideline: { flex: 1, color: color.text1 },
  ack: {
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
  ackLabel: { flex: 1, color: color.text1 },
});
