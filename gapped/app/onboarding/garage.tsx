import React, { useState } from 'react';
import { LayoutAnimationConfig } from 'react-native-reanimated';
import { Button } from '@/components/Button';
import { OnboardingFrame } from '@/components/OnboardingFrame';
import { haptic } from '@/lib/haptics';
import { vehicleNoun } from '@/onboarding/flow';
import { useOnboardingAdvance } from '@/onboarding/useOnboardingAdvance';
import { EMPTY_DRAFT, finishDraft } from '@/onboarding/vehicle/draft';
import {
  AddVehicleRow,
  type ComposerState,
  ExtraVehicleRow,
  MainVehicleCard,
  VehicleComposer,
} from '@/onboarding/vehicle/Garage';
import { StepHeading, StepScroll } from '@/onboarding/vehicle/StepScroll';
import { useProfile } from '@/state/profile';

/**
 * Step 3, "Add more cars?" (docs/ONBOARDING.md). The main vehicle as a card,
 * any extra ones as removable rows, and "+ Add another car", which opens the
 * ride step's own controls in place for one more. Optional: Continue is
 * always live.
 *
 * Extras are written to the profile (`extraVehicles`) as they are added, so
 * Back and forward again finds them. They are for the person's garage, never
 * for ranking: the boards rank the main vehicle, and extras are to sync as
 * non-primary `vehicles` rows (docs/ONBOARDING.md, "Data").
 */
export default function GarageStep() {
  const advance = useOnboardingAdvance('/onboarding/garage');
  const kind = useProfile((s) => s.vehicleKind) ?? 'car';
  const make = useProfile((s) => s.vehicleMake);
  const model = useProfile((s) => s.vehicleModel);
  const nickname = useProfile((s) => s.nickname);
  const photoUri = useProfile((s) => s.vehiclePhotoUri);
  const extras = useProfile((s) => s.extraVehicles);
  const addExtraVehicle = useProfile((s) => s.addExtraVehicle);
  const removeExtraVehicle = useProfile((s) => s.removeExtraVehicle);
  const noun = vehicleNoun(kind);

  const [composer, setComposer] = useState<ComposerState | null>(null);

  /** Saves the composer's vehicle if it is complete; reports whether it did. */
  const commitComposer = (): boolean => {
    if (!composer) return false;
    const vehicle = finishDraft(composer.drafts[composer.kind], composer.kind);
    if (!vehicle) return false;
    addExtraVehicle({ kind: composer.kind, ...vehicle });
    setComposer(null);
    return true;
  };

  return (
    <OnboardingFrame
      route="/onboarding/garage"
      scroll={false}
      footer={
        <Button
          label="Continue"
          variant="light"
          onPress={() => {
            // A vehicle chosen in full but not yet added is plainly meant to
            // be kept; one half-chosen is dropped. Closing the composer as it
            // is saved also means Back cannot find it open and add it twice.
            commitComposer();
            advance();
          }}
        />
      }
    >
      <StepScroll>
        <StepHeading
          title={`Add more ${noun}s?`}
          subtitle={`Optional. Your main ${noun} is set, so you can keep going and build your garage later.`}
        />
        <MainVehicleCard
          kind={kind}
          make={make}
          model={model}
          nickname={nickname}
          photoUri={photoUri}
        />
        {/*
          Rows animate in as they are added, not when the step first
          appears: the step's own push is the entrance then, and a fade on a
          thumbnail's ancestor during the push stalled its silhouette part-way
          on device (src/onboarding/vehicle/VehicleArt.tsx).
        */}
        <LayoutAnimationConfig skipEntering>
          {extras.map((v) => (
            <ExtraVehicleRow key={v.id} vehicle={v} onRemove={() => removeExtraVehicle(v.id)} />
          ))}
          {composer ? (
            <VehicleComposer
              state={composer}
              onChange={setComposer}
              onAdd={() => {
                if (commitComposer()) haptic.selection();
              }}
              onCancel={() => setComposer(null)}
            />
          ) : (
            <AddVehicleRow
              noun={noun}
              onPress={() =>
                setComposer({ kind, drafts: { car: EMPTY_DRAFT, motorbike: EMPTY_DRAFT } })
              }
            />
          )}
        </LayoutAnimationConfig>
      </StepScroll>
    </OnboardingFrame>
  );
}
