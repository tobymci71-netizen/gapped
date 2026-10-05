import React from 'react';
import { StyleSheet, View } from 'react-native';
import { Button } from '@/components/Button';
import { Entrance } from '@/components/Entrance';
import { OnboardingFrame } from '@/components/OnboardingFrame';
import { ATTRIBUTION_OPTIONS } from '@/onboarding/flow';
import { BrandMark } from '@/onboarding/identity/glyphs';
import { SelectRow } from '@/onboarding/identity/SelectRow';
import { useOnboardingAdvance } from '@/onboarding/useOnboardingAdvance';
import { useProfile } from '@/state/profile';
import { space } from '@/theme/tokens';

/**
 * "How did you hear about us?" (docs/ONBOARDING.md, step 12). Single select,
 * required: Continue stays grey until a row is chosen.
 *
 * The answer goes into the profile store, not straight to the server: setup
 * sends it with the focus answer to `onboarding_answers` (own row only — never
 * the world-readable `profiles`), and it stays in the store for a retry if
 * that write misses.
 *
 * The reference raises an App Tracking Transparency prompt between trust and
 * this step. Gapped does not (rule 3): it does not track across other
 * companies' apps, and this question is the honest way to learn the same
 * thing.
 */
export default function AttributionStep() {
  const advance = useOnboardingAdvance('/onboarding/attribution');
  const attribution = useProfile((s) => s.attribution);
  const setAttribution = useProfile((s) => s.setAttribution);

  return (
    <OnboardingFrame
      route="/onboarding/attribution"
      title="How did you hear about us?"
      footer={
        <Button
          label="Continue"
          variant="light"
          disabled={!attribution}
          onPress={advance}
          // "Continue →": the logo's streak tip, drawn by Button, so
          // VoiceOver hears only "Continue".
          arrow
        />
      }
    >
      <View accessibilityRole="radiogroup" style={styles.list}>
        {ATTRIBUTION_OPTIONS.map((o, i) => (
          <Entrance key={o.key} index={i}>
            <SelectRow
              label={o.label}
              spoken={o.spoken}
              selected={attribution === o.key}
              onPress={() => setAttribution(o.key)}
              renderIcon={(ink, size) => <BrandMark mark={o.key} color={ink} size={size} />}
            />
          </Entrance>
        ))}
      </View>
    </OnboardingFrame>
  );
}

const styles = StyleSheet.create({
  list: { gap: space.sm },
});
