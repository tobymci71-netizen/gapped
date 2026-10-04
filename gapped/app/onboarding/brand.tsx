import React from 'react';
import { StyleSheet, useWindowDimensions, View } from 'react-native';
import { Button } from '@/components/Button';
import { Entrance } from '@/components/Entrance';
import { OnboardingFrame } from '@/components/OnboardingFrame';
import { vehicleNoun } from '@/onboarding/flow';
import { brandProof } from '@/onboarding/proofVariants';
import { useOnboardingAdvance } from '@/onboarding/useOnboardingAdvance';
import { EarlyProof, ProofSkeleton, RankedProof } from '@/onboarding/vehicle/MakeProof';
import { useMakePopularity } from '@/onboarding/vehicle/useMakePopularity';
import { useProfile } from '@/state/profile';

/**
 * Step 2, make proof (docs/ONBOARDING.md). `make_popularity` for the person's
 * kind, handed to `brandProof`, which alone decides whether the ranked
 * variant may be shown; offline, slow, or below its thresholds, this is the
 * early variant, which has no number in it.
 *
 * Continue is live throughout. Proof is a beat in the flow, not a gate: a
 * person on a slow network is never held here for a chart.
 */
export default function BrandStep() {
  const advance = useOnboardingAdvance('/onboarding/brand');
  const kind = useProfile((s) => s.vehicleKind) ?? 'car';
  const make = useProfile((s) => s.vehicleMake);
  const model = useProfile((s) => s.vehicleModel);
  const photoUri = useProfile((s) => s.vehiclePhotoUri);
  const noun = vehicleNoun(kind);

  const data = useMakePopularity(kind);
  const proof = data.status === 'ready' ? brandProof(data.rows, make) : null;

  const { width, height } = useWindowDimensions();
  const artSize = Math.round(Math.min(260, width * 0.66, height * 0.32));

  return (
    <OnboardingFrame
      route="/onboarding/brand"
      footer={<Button label="Continue" variant="light" onPress={advance} />}
    >
      <View style={styles.body}>
        {proof === null ? (
          data.status === 'loading' && data.skeleton ? (
            <Entrance>
              <ProofSkeleton />
            </Entrance>
          ) : null
        ) : proof.kind === 'ranked' && make ? (
          <Entrance>
            <RankedProof proof={proof} make={make} noun={noun} />
          </Entrance>
        ) : (
          <EarlyProof kind={kind} make={make} model={model} photoUri={photoUri} artSize={artSize} />
        )}
      </View>
    </OnboardingFrame>
  );
}

const styles = StyleSheet.create({
  // Fills the room under the progress bar, so the early variant can centre
  // itself in it; the ranked variant starts from the top.
  body: { flex: 1 },
});
