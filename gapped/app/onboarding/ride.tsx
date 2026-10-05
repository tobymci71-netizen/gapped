import React, { useRef, useState } from 'react';
import { StyleSheet, TextInput, useWindowDimensions, View } from 'react-native';
import { Button } from '@/components/Button';
import { OnboardingFrame } from '@/components/OnboardingFrame';
import { Text } from '@/components/Text';
import { vehicleNoun } from '@/onboarding/flow';
import { useOnboardingAdvance } from '@/onboarding/useOnboardingAdvance';
import {
  draftReady,
  type DraftsByKind,
  EMPTY_DRAFT,
  finishDraft,
  MAX_NICKNAME_LENGTH,
} from '@/onboarding/vehicle/draft';
import { SegmentedControl, type Segment } from '@/onboarding/vehicle/SegmentedControl';
import { StepHeading, StepScroll, useRevealOnFocus } from '@/onboarding/vehicle/StepScroll';
import { VehicleArt } from '@/onboarding/vehicle/VehicleArt';
import { raisedPanel } from '@/onboarding/ui/choice';
import { VehicleFields } from '@/onboarding/vehicle/VehicleFields';
import { discardVehiclePhoto } from '@/onboarding/vehicle/vehiclePhoto';
import { useProfile, type VehicleKind } from '@/state/profile';
import { color, font, inputText, space, type } from '@/theme/tokens';

const KINDS: readonly Segment<VehicleKind>[] = [
  { key: 'car', label: 'Car' },
  { key: 'motorbike', label: 'Motorbike' },
];

/**
 * Step 1, "Choose your ride" (docs/ONBOARDING.md). Car | Motorbike, make and
 * model from the catalogue (or typed, via "Not listed? Add it yourself"), an
 * optional nickname, and the silhouette resolving to the chosen body as the
 * picks land.
 *
 * Nothing is written to the profile until Continue. The picks are a draft,
 * remembered per kind, so an accidental flip to Motorbike and back gives the
 * car back instead of two empty fields — and a kind change only clears the
 * stored car (its nickname and photo with it, see setVehicleKind) once the
 * person commits to the other kind.
 */
export default function RideStep() {
  const advance = useOnboardingAdvance('/onboarding/ride');
  const setVehicleKind = useProfile((s) => s.setVehicleKind);
  const setVehicle = useProfile((s) => s.setVehicle);
  const setNickname = useProfile((s) => s.setNickname);

  // Seeded once from the profile, so Back from a later step finds the
  // answers as they were left.
  const [kind, setKind] = useState<VehicleKind>(() => useProfile.getState().vehicleKind ?? 'car');
  const [drafts, setDrafts] = useState<DraftsByKind>(() => {
    const p = useProfile.getState();
    const seeded = { car: EMPTY_DRAFT, motorbike: EMPTY_DRAFT };
    if (p.vehicleKind) {
      seeded[p.vehicleKind] = { make: p.vehicleMake ?? '', model: p.vehicleModel ?? '' };
    }
    return seeded;
  });
  const [nickname, setNicknameDraft] = useState(() => useProfile.getState().nickname ?? '');

  const draft = drafts[kind];
  const ready = draftReady(draft);
  const noun = vehicleNoun(kind);

  const { width, height } = useWindowDimensions();
  // Shrinks with a short screen so the two fields stay above the fold on a
  // 667pt phone; the step scrolls for whatever still does not fit.
  const artSize = Math.round(Math.min(240, width * 0.6, height * 0.3));

  const commit = () => {
    const vehicle = finishDraft(draft, kind);
    if (!vehicle) return;
    const before = useProfile.getState();
    if (before.vehicleKind !== kind) {
      // setVehicleKind drops the stored photo along with the old kind's
      // vehicle; the file it named goes too, rather than lingering unseen.
      discardVehiclePhoto(before.vehiclePhotoUri);
      setVehicleKind(kind);
    }
    setVehicle(vehicle.make, vehicle.model);
    setNickname(nickname);
    advance();
  };

  return (
    <OnboardingFrame
      route="/onboarding/ride"
      scroll={false}
      footer={<Button label="Continue" variant="light" disabled={!ready} onPress={commit} />}
    >
      <StepScroll>
        <StepHeading
          title="Choose your ride"
          subtitle={
            kind === 'motorbike'
              ? 'Start with the bike you ride most.'
              : 'Start with the car you drive most.'
          }
        />
        <SegmentedControl segments={KINDS} value={kind} onChange={setKind} />
        <View style={styles.art}>
          <VehicleArt
            kind={kind}
            make={draft.make}
            model={draft.model}
            size={artSize}
            tone={ready ? 'set' : 'idle'}
          />
        </View>
        <VehicleFields
          kind={kind}
          draft={draft}
          onChange={(next) => setDrafts((d) => ({ ...d, [kind]: next }))}
        />
        <NicknameField noun={noun} value={nickname} onChange={setNicknameDraft} />
      </StepScroll>
    </OnboardingFrame>
  );
}

/**
 * "Nickname · optional". Kept as typed until Continue: the store trims, and
 * trimming on every keystroke would eat the space between two words as it was
 * typed.
 */
function NicknameField({
  noun,
  value,
  onChange,
}: {
  noun: 'car' | 'bike';
  value: string;
  onChange: (next: string) => void;
}) {
  const reveal = useRevealOnFocus();
  const wrap = useRef<View>(null);
  return (
    <View ref={wrap} style={styles.nickname}>
      <Text variant="mono" importantForAccessibility="no" accessibilityElementsHidden>
        Nickname · optional
      </Text>
      <View style={styles.inputRow}>
        <TextInput
          selectionColor={color.text1}
          value={value}
          onChangeText={onChange}
          onFocus={() => reveal(wrap.current)}
          placeholder="Give it a name"
          placeholderTextColor={color.text2}
          maxLength={MAX_NICKNAME_LENGTH}
          autoCapitalize="words"
          autoCorrect={false}
          returnKeyType="done"
          accessibilityLabel="Nickname, optional"
          accessibilityHint={`What you call your ${noun}`}
          style={styles.input}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  art: { alignItems: 'center', paddingVertical: space.sm },
  nickname: { marginTop: space.sm, gap: space.sm },
  inputRow: {
    ...raisedPanel,
    minHeight: 56,
    justifyContent: 'center',
    paddingHorizontal: space.lg,
  },
  input: {
    alignSelf: 'stretch',
    minHeight: 56,
    color: color.text1,
    fontFamily: font.bodyMedium,
    ...inputText(type.body),
    // Android pads single-line inputs; the row already sets the height.
    paddingVertical: 0,
  },
});
