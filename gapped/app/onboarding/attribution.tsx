import React from 'react';
import { StyleSheet, useWindowDimensions, View } from 'react-native';
import { Button } from '@/components/Button';
import { Entrance } from '@/components/Entrance';
import { OnboardingFrame } from '@/components/OnboardingFrame';
import { ATTRIBUTION_OPTIONS } from '@/onboarding/flow';
import { ArrowRightGlyph, BrandMark } from '@/onboarding/identity/glyphs';
import { SelectRow } from '@/onboarding/identity/SelectRow';
import { useOnboardingAdvance } from '@/onboarding/useOnboardingAdvance';
import { useProfile } from '@/state/profile';
import { space } from '@/theme/tokens';

/** The Continue arrow at the default text size. */
const ARROW = 18;

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
  // "Continue →": the arrow is drawn, so VoiceOver hears only "Continue", and
  // it grows with the label as a symbol set beside text does (up to 2x).
  const { fontScale } = useWindowDimensions();
  const arrow = Math.round(ARROW * Math.min(Math.max(fontScale, 1), 2));

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
          trailing={(ink) => <ArrowRightGlyph size={arrow} color={ink} />}
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
