import { FlashList } from '@shopify/flash-list';
import React, { useMemo, useState } from 'react';
import { StyleSheet, TextInput, View } from 'react-native';
import countries from '@/data/countries.json';
import { Entrance } from '@/components/Entrance';
import { PressableScale } from '@/components/PressableScale';
import { Text } from '@/components/Text';
import { haptic } from '@/lib/haptics';
import { color, font, radius, space, type } from '@/theme/tokens';

/**
 * Sheet-style searchable country picker — the pattern from TripRank's
 * "Select Country" sheet: grabber, title, search field, full flag list.
 * All 264 ISO regions ship (generated from Intl at build time), so nobody's
 * country is missing.
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
          renderItem={({ item, index }: { item: Country; index: number }) => (
            <Entrance index={index}>
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
                  style={selected === item.code ? { color: color.accent } : undefined}
                >
                  {item.name}
                </Text>
              </PressableScale>
            </Entrance>
          )}
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
