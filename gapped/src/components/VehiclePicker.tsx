import { FlashList } from '@shopify/flash-list';
import React, { useMemo, useState } from 'react';
import { StyleSheet, TextInput, View } from 'react-native';
import { Entrance } from '@/components/Entrance';
import { PressableScale } from '@/components/PressableScale';
import { Text } from '@/components/Text';
import { haptic } from '@/lib/haptics';
import {
  modelsForMake,
  popularMakes,
  searchMakes,
  searchModels,
  VehicleKindKey,
} from '@/vehicles/catalog';
import { color, font, radius, space, type } from '@/theme/tokens';

/**
 * Make/model picker (spec §B1): fuzzy search, popular shortlist above the
 * full A–Z, model list unlocked by make selection, free-text fallback always
 * available — a rigid picker that can't represent someone's car is a churn
 * event. Motorcycles get their own dataset.
 */

type Props = {
  kind: VehicleKindKey;
  onSelect: (make: string, model: string) => void;
};

export function VehiclePicker({ kind, onSelect }: Props) {
  const [stage, setStage] = useState<'make' | 'model'>('make');
  const [make, setMake] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [manual, setManual] = useState(false);
  const [manualText, setManualText] = useState('');

  const makeResults = useMemo(
    () => (stage === 'make' ? searchMakes(kind, query, 40) : []),
    [stage, kind, query],
  );
  const modelResults = useMemo(
    () => (stage === 'model' && make ? searchModels(kind, make, query, 60) : []),
    [stage, kind, make, query],
  );
  const popular = useMemo(() => popularMakes(kind), [kind]);
  const makeHasModels = make ? modelsForMake(kind, make).length > 0 : false;

  const pickMake = (m: string) => {
    haptic.selection();
    setMake(m);
    setQuery('');
    if (modelsForMake(kind, m).length > 0) {
      setStage('model');
    } else {
      // long-tail make with no model list — straight to manual model entry
      setStage('model');
      setManual(true);
    }
  };

  const pickModel = (model: string) => {
    haptic.selection();
    if (make) onSelect(make, model);
  };

  if (manual && stage === 'model' && make) {
    return (
      <View style={styles.container}>
        <Text variant="cardTitle">{make}</Text>
        <TextInput
          style={styles.input}
          placeholder="Type your model"
          placeholderTextColor={color.text3}
          value={manualText}
          onChangeText={setManualText}
          autoCapitalize="words"
          autoCorrect={false}
          autoFocus
        />
        <PressableScale
          style={[styles.row, manualText.trim().length === 0 && { opacity: 0.4 }]}
          onPress={() => manualText.trim() && pickModel(manualText.trim())}
          silent
        >
          <Text variant="bodyMedium" style={{ color: color.accent }}>
            Use “{manualText.trim() || '…'}”
          </Text>
        </PressableScale>
        {makeHasModels ? (
          <PressableScale style={styles.linkRow} onPress={() => setManual(false)} silent>
            <Text variant="caption">Back to the list</Text>
          </PressableScale>
        ) : (
          <PressableScale
            style={styles.linkRow}
            onPress={() => {
              setStage('make');
              setManual(false);
              setMake(null);
              setManualText('');
            }}
            silent
          >
            <Text variant="caption">Change make</Text>
          </PressableScale>
        )}
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {stage === 'model' && make ? (
        <PressableScale
          onPress={() => {
            setStage('make');
            setMake(null);
            setQuery('');
          }}
          silent
          style={styles.makeChipRow}
        >
          <Text variant="cardTitle" style={{ color: color.accent }}>
            {make}
          </Text>
          <Text variant="caption"> change</Text>
        </PressableScale>
      ) : null}

      <TextInput
        style={styles.input}
        placeholder={stage === 'make' ? 'Search makes — try “merc”' : 'Search models'}
        placeholderTextColor={color.text3}
        value={query}
        onChangeText={setQuery}
        autoCapitalize="none"
        autoCorrect={false}
      />

      {stage === 'make' && !query ? (
        <View style={styles.chips}>
          {popular.map((m) => (
            <PressableScale key={m} style={styles.chip} onPress={() => pickMake(m)} silent>
              <Text variant="caption" style={{ color: color.text1 }}>
                {m}
              </Text>
            </PressableScale>
          ))}
        </View>
      ) : null}

      <View style={styles.list}>
        <FlashList
          data={stage === 'make' ? makeResults : modelResults}
          keyExtractor={(item: string) => item}
          keyboardShouldPersistTaps="handled"
          renderItem={({ item, index }: { item: string; index: number }) => (
            <Entrance index={index}>
              <PressableScale
                style={styles.row}
                onPress={() => (stage === 'make' ? pickMake(item) : pickModel(item))}
                silent
              >
                <Text variant="bodyMedium">{item}</Text>
              </PressableScale>
            </Entrance>
          )}
          ListEmptyComponent={
            <Text variant="body" style={styles.empty}>
              Nothing matches “{query}”.
            </Text>
          }
        />
      </View>

      <PressableScale
        style={styles.linkRow}
        onPress={() => {
          if (stage === 'make') {
            // manual make + model in one: treat the query as the make
            const m = query.trim() || 'Custom';
            setMake(m);
            setStage('model');
            setManual(true);
          } else {
            setManual(true);
          }
        }}
        silent
      >
        <Text variant="caption" style={styles.link}>
          Can't find it? Enter manually
        </Text>
      </PressableScale>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, gap: space.md },
  input: {
    height: 52,
    borderRadius: radius.card,
    backgroundColor: color.surface1,
    borderWidth: 1,
    borderColor: color.hairline,
    paddingHorizontal: space.lg,
    color: color.text1,
    fontFamily: font.body,
    fontSize: type.body,
  },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  chip: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: color.hairline,
    backgroundColor: color.surface1,
    paddingHorizontal: space.md,
    paddingVertical: 7,
  },
  list: { flex: 1, minHeight: 200 },
  row: {
    minHeight: 50,
    justifyContent: 'center',
    paddingHorizontal: space.md,
    borderBottomWidth: 1,
    borderBottomColor: color.surface2,
  },
  makeChipRow: { flexDirection: 'row', alignItems: 'baseline' },
  linkRow: { paddingVertical: space.sm, alignItems: 'center' },
  link: { textDecorationLine: 'underline' },
  empty: { padding: space.lg, textAlign: 'center' },
});
