import React, { useCallback, useMemo, useState } from 'react';
import { StyleSheet, useWindowDimensions, View } from 'react-native';
import Animated, {
  interpolateColor,
  useAnimatedStyle,
  useDerivedValue,
  withTiming,
} from 'react-native-reanimated';
import { CarSilhouette } from '@/components/CarSilhouette';
import { PressableScale } from '@/components/PressableScale';
import { SearchableListSheet } from '@/components/SearchableListSheet';
import { Text } from '@/components/Text';
import { useReducedMotion } from '@/lib/useReducedMotion';
import { duration } from '@/theme/motion';
import { color, radius, space } from '@/theme/tokens';
import {
  modelsForMake,
  popularMakes,
  searchMakes,
  searchModels,
  VehicleKindKey,
} from '@/vehicles/catalog';
import { bodyTypeLabel, inferBodyType } from '@/vehicles/bodyType';

type Props = {
  kind: VehicleKindKey;
  make: string | null;
  model: string | null;
  onMakeChange: (make: string) => void;
  onModelChange: (model: string) => void;
};

const MAX_CIRCLE = 280;

export function VehicleChooser({
  kind,
  make,
  model,
  onMakeChange,
  onModelChange,
}: Props): React.JSX.Element {
  const { width } = useWindowDimensions();
  const reduced = useReducedMotion();
  const [sheet, setSheet] = useState<'none' | 'make' | 'model'>('none');

  const diameter = Math.min(MAX_CIRCLE, Math.round(width * 0.68));
  const revealed = !!make && !!model;

  const bodyType = useMemo(
    () =>
      revealed
        ? inferBodyType(kind, make as string, model as string)
        : kind === 'motorbike'
          ? 'motorbike'
          : 'saloon',
    [revealed, kind, make, model],
  );

  const progress = useDerivedValue(
    () => withTiming(revealed ? 1 : 0, { duration: reduced ? duration.instant : duration.base }),
    [revealed, reduced],
  );

  const ringStyle = useAnimatedStyle(() => ({
    borderColor: interpolateColor(progress.value, [0, 1], [color.hairline, color.accent]),
    borderWidth: 1 + progress.value * 0.5,
  }));
  const glowStyle = useAnimatedStyle(() => ({ opacity: progress.value * 0.5 }));

  // Changing the make invalidates the model: a Golf is not a Golf on a Ford.
  const chooseMake = useCallback(
    (next: string) => {
      if (next !== make) onModelChange('');
      onMakeChange(next);
    },
    [make, onMakeChange, onModelChange],
  );

  const searchMakeList = useCallback((q: string) => searchMakes(kind, q, 60), [kind]);
  const searchModelList = useCallback(
    (q: string) => (make ? searchModels(kind, make, q, 80) : []),
    [kind, make],
  );

  const hasModelList = !!make && modelsForMake(kind, make).length > 0;

  return (
    <View style={styles.root}>
      <View style={[styles.circleWrap, { height: diameter }]}>
        <Animated.View
          style={[
            styles.glow,
            {
              width: diameter * 1.06,
              height: diameter * 1.06,
              borderRadius: diameter,
            },
            glowStyle,
          ]}
        />
        <Animated.View
          style={[
            styles.circle,
            { width: diameter, height: diameter, borderRadius: diameter / 2 },
            ringStyle,
          ]}
        >
          <CarSilhouette
            bodyType={bodyType}
            size={diameter * 0.78}
            revealKey={`${bodyType}:${make ?? ''}:${model ?? ''}`}
            color={revealed ? color.accent : color.text3}
          />
          {!revealed ? (
            <Text variant="caption" style={styles.hint}>
              {`Select a make and model\nto see your ride`}
            </Text>
          ) : null}
        </Animated.View>
      </View>

      {revealed ? (
        <View style={styles.caption}>
          <Text variant="cardTitle" numberOfLines={1}>
            {make} {model}
          </Text>
          <Text variant="caption">{bodyTypeLabel(bodyType)}</Text>
        </View>
      ) : null}

      <Field
        label={make ?? 'Select make'}
        filled={!!make}
        onPress={() => setSheet('make')}
      />
      <Field
        label={model || 'Select model'}
        filled={!!model}
        disabled={!make}
        onPress={() => setSheet('model')}
      />

      <SearchableListSheet
        visible={sheet === 'make'}
        onClose={() => setSheet('none')}
        title="Select make"
        placeholder={kind === 'motorbike' ? 'Search makes — try “duc”' : 'Search makes — try “merc”'}
        search={searchMakeList}
        shortcuts={popularMakes(kind)}
        onSelect={chooseMake}
        onManualEntry={(typed) => {
          if (typed) chooseMake(typed);
        }}
      />
      <SearchableListSheet
        visible={sheet === 'model'}
        onClose={() => setSheet('none')}
        title="Select model"
        placeholder={hasModelList ? 'Search models' : 'Type your model'}
        search={searchModelList}
        onSelect={onModelChange}
        onManualEntry={(typed) => {
          if (typed) onModelChange(typed);
        }}
      />
    </View>
  );
}

function Field({
  label,
  filled,
  disabled,
  onPress,
}: {
  label: string;
  filled: boolean;
  disabled?: boolean;
  onPress: () => void;
}): React.JSX.Element {
  return (
    <PressableScale
      onPress={onPress}
      disabled={disabled}
      silent
      accessibilityRole="button"
      accessibilityState={{ disabled: !!disabled }}
      style={[styles.field, disabled ? styles.fieldDisabled : null]}
    >
      <Text
        variant="bodyMedium"
        style={[styles.fieldLabel, filled ? undefined : styles.fieldPlaceholder]}
        numberOfLines={1}
      >
        {label}
      </Text>
      <Text style={styles.chevron}>⌄</Text>
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, gap: space.md },
  circleWrap: { alignItems: 'center', justifyContent: 'center' },
  glow: { position: 'absolute', backgroundColor: color.accentDim },
  circle: {
    backgroundColor: color.surface2,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  hint: {
    position: 'absolute',
    bottom: '18%',
    textAlign: 'center',
    color: color.text3,
  },
  caption: { alignItems: 'center', gap: 2 },
  field: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    height: 56,
    borderRadius: radius.card,
    backgroundColor: color.surface1,
    borderWidth: 1,
    borderColor: color.hairline,
    paddingHorizontal: space.lg,
  },
  fieldDisabled: { opacity: 0.45 },
  // flex so a long catalogue make ellipsizes instead of shoving the chevron out.
  fieldLabel: { flex: 1 },
  fieldPlaceholder: { color: color.text3 },
  chevron: { color: color.text3, fontSize: 20, marginTop: -8 },
});
