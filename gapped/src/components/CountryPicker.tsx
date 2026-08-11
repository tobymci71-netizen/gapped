import { FlashList } from '@shopify/flash-list';
import React, { useMemo, useState } from 'react';
import { StyleSheet, TextInput, View } from 'react-native';
import { COUNTRIES, type Country, type CountryCode } from '@/data/countries';
import { Entrance } from '@/components/Entrance';
import { STAGGER_CAP } from '@/theme/motion';
import { PressableScale } from '@/components/PressableScale';
import { useFooterHeight } from '@/components/Screen';
import { Text } from '@/components/Text';
import { haptic } from '@/lib/haptics';
import { color, font, radius, space, type } from '@/theme/tokens';

/**
 * Sheet-style searchable country picker — the pattern from TripRank's
 * "Select Country" sheet: grabber, title, search field, full flag list.
 *
 * The list is canonical by construction: 249 assigned ISO 3166-1 alpha-2 codes
 * plus XK for Kosovo, which has no ISO code (see scripts/generate-countries.mjs
 * for why that exception exists). Because the picker can only offer codes that
 * are in the list, and the list holds exactly one code per country, selecting
 * here can never split a nation across two leaderboards — `board_top` filters
 * on the code, so two codes for one country would mean two half-populated
 * national boards with nothing to show which was real.
 *
 * Aliases such as UK, SU and ZR are absent deliberately. They are handled on
 * the way in by `canonicaliseCountry`, not offered on the way out.
 */

const ALL = COUNTRIES;

export function CountryPicker({
  selected,
  onSelect,
}: {
  selected: string | null;
  onSelect: (code: CountryCode) => void;
}) {
  const [query, setQuery] = useState('');
  const footerHeight = useFooterHeight();

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
          /*
           * The screen's footer is opaque and sits over the bottom of the
           * list, so without this the final entry — Zimbabwe — could never be
           * scrolled clear of the Continue button. Reserving the footer's own
           * measured height (safe-area inset included) lets the list scroll
           * past it rather than stopping underneath it.
           */
          contentContainerStyle={{ paddingBottom: footerHeight }}
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
