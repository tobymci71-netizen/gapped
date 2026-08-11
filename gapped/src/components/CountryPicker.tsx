import { FlashList } from '@shopify/flash-list';
import React, { useMemo, useState } from 'react';
import { StyleSheet, TextInput, View } from 'react-native';
import countries from '@/data/countries.json';
import { Entrance } from '@/components/Entrance';
import { STAGGER_CAP } from '@/theme/motion';
import { PressableScale } from '@/components/PressableScale';
import { Text } from '@/components/Text';
import { haptic } from '@/lib/haptics';
import { color, font, radius, space, type } from '@/theme/tokens';

/**
 * Sheet-style searchable country picker — the pattern from TripRank's
 * "Select Country" sheet: grabber, title, search field, full flag list.
 * All 258 current ISO 3166-1 regions ship, so nobody's country is missing.
 * Withdrawn ISO 3166-3 codes are deliberately excluded: the generated list
 * carried DY, HV, UK, NH, VD and RH alongside their modern replacements, so
 * "United Kingdom" appeared twice — once as GB and once as UK with a flag
 * that does not render. Two codes for one country means two country
 * leaderboards for one country, since board_top filters on the code.
 */

type Country = { code: string; name: string; flag: string };

const ALL = countries as Country[];

export function CountryPicker({
  selected,
  onSelect,
}: {
  selected: string | null;
  onSelect: (code: string) => void;
}) {
  const [query, setQuery] = useState('');

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return ALL;
    return ALL.filter(
      (c) => c.name.toLowerCase().includes(q) || c.code.toLowerCase() === q,
    );
  }, [query]);

  return (
    <View style={styles.sheet}>
      <View style={styles.grabber} />
      <Text variant="cardTitle" style={styles.title}>
        Select country
      </Text>
      <TextInput
        style={styles.search}
        placeholder="Search countries…"
        placeholderTextColor={color.text3}
        value={query}
        onChangeText={setQuery}
        autoCapitalize="none"
        autoCorrect={false}
      />
      <View style={styles.list}>
        <FlashList
          data={results}
          keyExtractor={(c: Country) => c.code}
          keyboardShouldPersistTaps="handled"
          renderItem={({ item, index }: { item: Country; index: number }) => {
            const row = (
              <PressableScale
                silent
                onPress={() => {
                  haptic.selection();
                  onSelect(item.code);
                }}
                style={[styles.row, selected === item.code && styles.rowSelected]}
              >
                <Text style={styles.flag}>{item.flag}</Text>
                <Text
                  variant="bodyMedium"
                  numberOfLines={1}
                  style={selected === item.code ? { color: color.accent } : undefined}
                >
                  {item.name}
                </Text>
              </PressableScale>
            );
            // Only the first screenful staggers in. This list is 258 countries
            // and FlashList recycles cells, so an entrance on every row replays
            // the animation on every scroll — the same guard, and the same
            // reason, as SearchableListSheet.
            return index < STAGGER_CAP ? <Entrance index={index}>{row}</Entrance> : row;
          }}
          ListEmptyComponent={
            <Text variant="body" style={styles.empty}>
              No country matches “{query}”.
            </Text>
          }
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  sheet: {
    flex: 1,
    backgroundColor: color.surface1,
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    borderWidth: 1,
    borderColor: color.hairline,
    paddingHorizontal: space.lg,
    paddingTop: space.sm,
  },
  grabber: {
    alignSelf: 'center',
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: color.disabled,
    marginBottom: space.md,
  },
  title: { textAlign: 'center', marginBottom: space.md },
  search: {
    minHeight: 48,
    borderRadius: radius.card,
    backgroundColor: color.surface2,
    paddingHorizontal: space.lg,
    color: color.text1,
    fontFamily: font.body,
    fontSize: type.body,
  },
  list: { flex: 1, marginTop: space.sm },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    minHeight: 52,
    paddingHorizontal: space.xs,
    borderBottomWidth: 1,
    borderBottomColor: color.surface2,
  },
  rowSelected: {},
  flag: { fontSize: 22 },
  empty: { padding: space.lg, textAlign: 'center' },
});
