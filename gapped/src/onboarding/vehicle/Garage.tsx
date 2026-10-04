import React from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { FadeIn, FadeInDown, FadeOut, LinearTransition } from 'react-native-reanimated';
import { Button } from '@/components/Button';
import { PressableScale } from '@/components/PressableScale';
import { Text } from '@/components/Text';
import { haptic } from '@/lib/haptics';
import { useReducedMotion } from '@/lib/useReducedMotion';
import { vehicleNoun } from '@/onboarding/flow';
import type { ExtraVehicle, VehicleKind } from '@/state/profile';
import { duration, easing } from '@/theme/motion';
import { color, font, radius, space } from '@/theme/tokens';
import { draftReady, type DraftsByKind, vehicleTitle } from './draft';
import { CloseIcon, PlusIcon } from './icons';
import { SegmentedControl, type Segment } from './SegmentedControl';
import { VehicleArt } from './VehicleArt';
import { VehicleFields } from './VehicleFields';

/** Thumbnail edge on the main card and on extra rows. */
const MAIN_THUMB = 72;
const EXTRA_THUMB = 52;
/** A thumbnail's corners: the card's, less the inset, so the curves nest. */
const THUMB_RADIUS = radius.card - 4;
/** Travel for a row arriving in the list — Entrance's 12pt. */
const ROW_TRAVEL = 12;

const KINDS: readonly Segment<VehicleKind>[] = [
  { key: 'car', label: 'Car' },
  { key: 'motorbike', label: 'Motorbike' },
];

/**
 * Motion for a row joining or leaving the garage list, and for the rows below
 * it making room: ease-out, no spring. Reduced motion keeps the fades and
 * drops the travel and the reflow animation.
 */
function useRowMotion() {
  const reduced = useReducedMotion();
  return {
    entering: reduced
      ? FadeIn.duration(duration.fast)
      : FadeInDown.duration(duration.base).withInitialValues({
          transform: [{ translateY: ROW_TRAVEL }],
        }),
    exiting: FadeOut.duration(duration.fast),
    layout: reduced ? undefined : LinearTransition.duration(duration.base).easing(easing.decel),
  };
}

/** A vehicle's picture on a dark tile: photo if it has one, else its silhouette. */
function Thumb({
  kind,
  make,
  model,
  photoUri,
  size,
}: {
  kind: VehicleKind;
  make: string | null;
  model: string | null;
  photoUri?: string | null;
  size: number;
}) {
  return (
    <View style={[styles.thumb, { width: size, height: size }]}>
      <VehicleArt
        kind={kind}
        make={make}
        model={model}
        photoUri={photoUri}
        size={size}
        shape="square"
        photoRadius={THUMB_RADIUS}
      />
    </View>
  );
}

/**
 * The main vehicle, as chosen on the ride step: picture, name (the nickname
 * when there is one, with make and model under it), and the lime "Main car"
 * caption.
 */
export function MainVehicleCard({
  kind,
  make,
  model,
  nickname,
  photoUri,
}: {
  kind: VehicleKind;
  make: string | null;
  model: string | null;
  nickname: string | null;
  photoUri: string | null;
}) {
  const noun = vehicleNoun(kind);
  const { title, subtitle } = vehicleTitle({ nickname, make, model });
  return (
    <View
      style={styles.card}
      accessible
      accessibilityLabel={`Main ${noun}: ${[title, subtitle].filter(Boolean).join(', ')}`}
    >
      <Thumb kind={kind} make={make} model={model} photoUri={photoUri} size={MAIN_THUMB} />
      <View style={styles.cardText}>
        <Text variant="cardTitle" numberOfLines={2}>
          {title}
        </Text>
        {subtitle ? (
          <Text variant="caption" numberOfLines={1}>
            {subtitle}
          </Text>
        ) : null}
        <Text variant="caption" style={styles.mainCaption}>
          Main {noun}
        </Text>
      </View>
    </View>
  );
}

/** A vehicle added here, with a 44pt remove button. */
export function ExtraVehicleRow({
  vehicle,
  onRemove,
}: {
  vehicle: ExtraVehicle;
  onRemove: () => void;
}) {
  const motion = useRowMotion();
  const { title } = vehicleTitle(vehicle);
  const kindLabel = vehicle.kind === 'motorbike' ? 'Motorbike' : 'Car';
  return (
    <Animated.View {...motion} style={[styles.card, styles.extra]}>
      <View style={styles.extraInfo} accessible accessibilityLabel={`${title}, ${kindLabel}`}>
        <Thumb kind={vehicle.kind} make={vehicle.make} model={vehicle.model} size={EXTRA_THUMB} />
        <View style={styles.cardText}>
          <Text variant="bodyMedium" numberOfLines={2}>
            {title}
          </Text>
          <Text variant="caption">{kindLabel}</Text>
        </View>
      </View>
      <PressableScale
        onPress={() => {
          haptic.selection();
          onRemove();
        }}
        silent
        accessibilityRole="button"
        accessibilityLabel={`Remove ${title}`}
        style={styles.remove}
      >
        <CloseIcon />
      </PressableScale>
    </Animated.View>
  );
}

/** "+ Add another car": opens the composer in its place. */
export function AddVehicleRow({ noun, onPress }: { noun: 'car' | 'bike'; onPress: () => void }) {
  const motion = useRowMotion();
  return (
    <Animated.View {...motion}>
      <PressableScale
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel={`Add another ${noun}`}
        style={[styles.card, styles.addRow]}
      >
        <View style={styles.plus}>
          <PlusIcon />
        </View>
        <Text variant="bodyMedium">Add another {noun}</Text>
      </PressableScale>
    </Animated.View>
  );
}

export type ComposerState = { kind: VehicleKind; drafts: DraftsByKind };

/**
 * Choosing a second vehicle, in place — the ride step's own controls (kind,
 * then make and model, or typed), so nothing about it has to be learned
 * twice. Its own kind, defaulting to the main vehicle's: a car driver with a
 * bike in the garage is exactly who this is for.
 */
export function VehicleComposer({
  state,
  onChange,
  onAdd,
  onCancel,
}: {
  state: ComposerState;
  onChange: (next: ComposerState) => void;
  onAdd: () => void;
  onCancel: () => void;
}) {
  const motion = useRowMotion();
  const draft = state.drafts[state.kind];
  const ready = draftReady(draft);
  return (
    <Animated.View {...motion} style={styles.composer}>
      <SegmentedControl
        segments={KINDS}
        value={state.kind}
        onChange={(kind) => onChange({ ...state, kind })}
      />
      <VehicleFields
        kind={state.kind}
        draft={draft}
        onChange={(next) => onChange({ ...state, drafts: { ...state.drafts, [state.kind]: next } })}
      />
      {/*
        Outlined, not white: Continue below is the step's one primary, and two
        white pills a thumb apart made it a guess which one moved on. Dimmed
        until the vehicle is chosen — secondary has no disabled fill of its own.
      */}
      <Button
        label="Add to garage"
        variant="secondary"
        disabled={!ready}
        onPress={onAdd}
        style={ready ? undefined : styles.addDisabled}
      />
      <PressableScale
        onPress={onCancel}
        silent
        accessibilityRole="button"
        accessibilityLabel="Cancel"
        style={styles.cancel}
      >
        <Text variant="bodyMedium" style={styles.cancelLabel}>
          Cancel
        </Text>
      </PressableScale>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.lg,
    padding: space.lg,
    borderRadius: radius.card,
    backgroundColor: color.surface2,
  },
  cardText: { flex: 1, gap: 2 },
  thumb: {
    borderRadius: THUMB_RADIUS,
    backgroundColor: color.surface3,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  mainCaption: { color: color.accent, fontFamily: font.bodySemibold, marginTop: 2 },
  extra: { paddingVertical: space.md, paddingRight: space.xs },
  extraInfo: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: space.lg },
  remove: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  addRow: { minHeight: 56, paddingVertical: space.md },
  plus: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: color.accentTile,
    alignItems: 'center',
    justifyContent: 'center',
  },
  composer: {
    gap: space.md,
    padding: space.lg,
    borderRadius: radius.card,
    backgroundColor: color.surface1,
    borderWidth: 1,
    borderColor: color.hairline,
  },
  cancel: {
    minHeight: 44,
    alignSelf: 'center',
    justifyContent: 'center',
    paddingHorizontal: space.lg,
  },
  cancelLabel: { color: color.text2 },
  addDisabled: { opacity: 0.45 },
});
