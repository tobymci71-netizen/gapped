import React from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { FadeIn, FadeInDown, FadeOut, LinearTransition } from 'react-native-reanimated';
import { SlantTag } from '@/components/brand/SlantTag';
import { Button } from '@/components/Button';
import { PressableScale } from '@/components/PressableScale';
import { ProBadge } from '@/components/ProBadge';
import { Text } from '@/components/Text';
import { haptic } from '@/lib/haptics';
import { useReducedMotion } from '@/lib/useReducedMotion';
import { vehicleNoun } from '@/onboarding/flow';
import { panel } from '@/onboarding/ui/choice';
import type { ExtraVehicle, VehicleKind } from '@/state/profile';
import { duration, easing } from '@/theme/motion';
import { color, radius, slant, space } from '@/theme/tokens';
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
 * when there is one, with make and model under it), and a "Main car" tag.
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
        <SlantTag label={`Main ${noun}`} size="sm" decorative style={styles.mainTag} />
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
          <View style={styles.plusPlate} />
          <PlusIcon />
        </View>
        <Text variant="bodyMedium">Add another {noun}</Text>
      </PressableScale>
    </Animated.View>
  );
}

/**
 * In place of "+ Add another car" when a Free garage is full (garageAccess.ts):
 * the PRO chip and the line saying more cars are Pro, leading to Gapped Pro.
 * The add row's card and height, so the list does not jump between the two.
 */
export function ProVehicleRow({ line, onPress }: { line: string; onPress: () => void }) {
  const motion = useRowMotion();
  return (
    <Animated.View {...motion}>
      <PressableScale
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel={line}
        accessibilityHint="Shows what Gapped Pro adds."
        style={[styles.card, styles.addRow]}
      >
        {/* The chip sits where the plus tile does, so the two lines align. */}
        <View style={styles.badgeSlot}>
          <ProBadge />
        </View>
        <Text variant="bodyMedium" style={styles.rowLabel}>
          {line}
        </Text>
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
        white plates a thumb apart made it a guess which one moved on. Until
        the vehicle is chosen it wears the flat disabled plate.
      */}
      <Button label="Add to garage" variant="secondary" disabled={!ready} onPress={onAdd} />
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
    ...panel,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.lg,
    padding: space.lg,
  },
  cardText: { flex: 1, gap: 2 },
  thumb: {
    borderRadius: THUMB_RADIUS,
    backgroundColor: color.surface2,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  mainTag: { marginTop: space.xs },
  extra: { paddingVertical: space.md, paddingRight: space.xs },
  extraInfo: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: space.lg },
  remove: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  addRow: { minHeight: 56, paddingVertical: space.md },
  // A slanted outlined plate with a white plus: an action, not a light.
  plus: { width: 32, height: 32, alignItems: 'center', justifyContent: 'center' },
  plusPlate: {
    ...StyleSheet.absoluteFill,
    borderRadius: radius.xs,
    borderWidth: 1,
    borderColor: color.outline,
    transform: slant.transform,
  },
  // The plus tile's width at least; the chip grows past it with Dynamic Type.
  badgeSlot: { minWidth: 32 },
  // Wraps rather than running off the card at large Dynamic Type.
  rowLabel: { flex: 1 },
  composer: {
    ...panel,
    gap: space.md,
    padding: space.lg,
  },
  cancel: {
    minHeight: 44,
    alignSelf: 'center',
    justifyContent: 'center',
    paddingHorizontal: space.lg,
  },
  cancelLabel: { color: color.text2 },
});
