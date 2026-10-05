import React, { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Button } from '@/components/Button';
import { Entrance } from '@/components/Entrance';
import { OnboardingFrame } from '@/components/OnboardingFrame';
import { OnSurface, Text } from '@/components/Text';
import {
  EyeGlyph,
  GaugeGlyph,
  ParkGlyph,
  PhoneGlyph,
} from '@/onboarding/identity/glyphs';
import { ConsentCheck, LinkedSentence } from '@/onboarding/place/Consent';
import {
  AGE_CHECK,
  canAgree,
  GUIDELINES_CHECK,
  SAFETY_LINE,
  TERMS_SENTENCE,
} from '@/onboarding/place/consentCopy';
import { FlagIcon } from '@/onboarding/place/icons';
import { panel } from '@/onboarding/ui/choice';
import { useOnboardingAdvance } from '@/onboarding/useOnboardingAdvance';
import { useProfile } from '@/state/profile';
import { color, space } from '@/theme/tokens';

/** The glyph column beside each guideline: the glyphs line up, the words after them. */
const GLYPH_BOX = 28;

/**
 * The guidelines. The first is the line the public top-speed board rests on
 * (SAFETY_LINE): where those runs belong. The four after it are word for word
 * as they were. Each emoji they used to lead with is now a drawn glyph:
 * docs/ONBOARDING.md rules out emoji in the flow's chrome, and the emoji also
 * rendered differently on every OS version.
 */
const GUIDELINES: { Glyph: typeof GaugeGlyph; text: string }[] = [
  { Glyph: FlagIcon, text: SAFETY_LINE },
  { Glyph: GaugeGlyph, text: 'Obey local traffic laws and speed limits. Never drive recklessly.' },
  { Glyph: ParkGlyph, text: 'Start and stop recording only while safely parked.' },
  { Glyph: PhoneGlyph, text: 'Use a phone holder, just like with any navigation app.' },
  { Glyph: EyeGlyph, text: 'Never touch your phone while driving. Eyes on the road.' },
];

/**
 * The road-safety acknowledgement (docs/ONBOARDING.md, step 13, rule 4): the
 * app's record that a public speed board was accepted for responsible use,
 * and — as the last question before setup — where the driver agrees to the
 * Terms of Use and Privacy Policy and confirms they are 18 or older with a
 * valid driving licence. Whenever this step is in the flow it is the one that
 * asks (TERMS_ROUTE, src/onboarding/flow.ts).
 *
 * Two boxes, both required: the guidelines, and the age and licence. "I
 * agree" records both — `acceptSafety()` and `acceptTerms()`, the timestamp
 * sync sends to `onboarding_answers.terms_accepted_at` — and the sentence
 * under the boxes names the two documents, each a link to its page. With
 * SAFETY_ACKNOWLEDGEMENT off the flow never reaches this step,
 * `safetyAccepted` stays false, and the trust step asks for the terms instead.
 */
export default function SafetyStep() {
  const advance = useOnboardingAdvance('/onboarding/safety');
  const acceptSafety = useProfile((s) => s.acceptSafety);
  const acceptTerms = useProfile((s) => s.acceptTerms);
  const [guidelines, setGuidelines] = useState(false);
  const [age, setAge] = useState(false);
  const agreed = canAgree([guidelines, age]);

  return (
    <OnboardingFrame
      route="/onboarding/safety"
      title="Before you drive"
      subtitle="Important reminders to stay safe."
      footer={
        <Button
          label="I agree"
          variant="light"
          disabled={!agreed}
          onPress={() => {
            acceptSafety();
            acceptTerms();
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
                <View style={styles.glyph}>
                  <Glyph size={22} color={color.text2} />
                </View>
                <Text variant="body" style={styles.guideline}>
                  {text}
                </Text>
              </View>
            ))}
          </OnSurface>
        </View>
      </Entrance>

      <Entrance index={1} style={styles.checks}>
        <ConsentCheck
          label={GUIDELINES_CHECK}
          checked={guidelines}
          onToggle={() => setGuidelines((c) => !c)}
        />
        <ConsentCheck label={AGE_CHECK} checked={age} onToggle={() => setAge((c) => !c)} />
      </Entrance>

      <Entrance index={2}>
        <LinkedSentence runs={TERMS_SENTENCE} />
      </Entrance>

      <Entrance index={3}>
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
    ...panel,
    gap: space.lg,
    padding: space.lg,
  },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  glyph: { width: GLYPH_BOX, alignItems: 'center' },
  guideline: { flex: 1, color: color.text1 },
  checks: { gap: space.md },
});
