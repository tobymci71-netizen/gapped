import { FlashList } from '@shopify/flash-list';
import React, { useMemo, useState } from 'react';
import { StyleSheet, TextInput, View } from 'react-native';
import { type Country, type CountryCode } from '@/data/countries';
import { searchCountries } from '@/data/countrySearch';
import { Entrance } from '@/components/Entrance';
import { PressableScale } from '@/components/PressableScale';
import { useFooterHeight } from '@/components/Screen';
import { Text } from '@/components/Text';
import { haptic } from '@/lib/haptics';
import { color, font, glyph, radius, space, type, textStyle } from '@/theme/tokens';

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
 * the way in by `canonicaliseCountry`, not offered on the way out. Typing "uk"
 * still finds the United Kingdom row: see src/data/countrySearch.ts.
 */

export function CountryPicker({
  selected,
  onSelect,
}: {
  selected: string | null;
  onSelect: (code: CountryCode) => void;
}) {
  const [query, setQuery] = useState('');
  const footerHeight = useFooterHeight();

  const results = useMemo(() => searchCountries(query), [query]);

  return (
    <View style={styles.sheet}>
      <View style={styles.grabber} />
      <Text variant="cardTitle" style={styles.title}>
        Select country
      </Text>
      <TextInput
        style={styles.search}
        placeholder="Search countries…"
        placeholderTextColor={color.text2}
        value={query}
        onChangeText={setQuery}
        autoCapitalize="none"
        autoCorrect={false}
      />
      {/*
        The list fades in once, as a whole. Per-row entrances replayed: FlashList
        recycles cells across indices, and wrapping only the first rows changed
        a recycled cell's root element, so scrolling back to the top or typing
        a query remounted rows that then faded in again.
      */}
      <Entrance style={styles.list}>
        <FlashList
          data={results}
          keyExtractor={(c: Country) => c.code}
          keyboardShouldPersistTaps="handled"
          // Searching leaves little room above the keyboard; a drag says the
          // typing is done and the list wants the space back.
          keyboardDismissMode="on-drag"
          /*
           * The screen's footer is opaque and sits over the bottom of the
           * list, so without this the final entry — Zimbabwe — could never be
           * scrolled clear of the Continue button. Reserving the footer's own
           * measured height (safe-area inset included) lets the list scroll
           * past it rather than stopping underneath it.
           */
          contentContainerStyle={{ paddingBottom: footerHeight }}
          renderItem={({ item }: { item: Country }) => {
            const isSelected = selected === item.code;
            return (
              <PressableScale
                silent
                onPress={() => {
                  haptic.selection();
                  onSelect(item.code);
                }}
                // The name alone: the flag would otherwise be read out first
                // ("flag: United Kingdom, United Kingdom"), and the selected
                // state was only ever a colour, which VoiceOver cannot see.
                accessibilityRole="button"
                accessibilityLabel={item.name}
                accessibilityState={{ selected: isSelected }}
                style={styles.row}
              >
                <Text style={styles.flag}>{item.flag}</Text>
                <Text
                  variant="bodyMedium"
                  numberOfLines={1}
                  style={[styles.name, isSelected ? { color: color.accent } : null]}
                >
                  {item.name}
                </Text>
                {/* Selection shown by a mark as well as by colour. */}
                {isSelected ? <Text style={styles.check}>✓</Text> : null}
              </PressableScale>
            );
          }}
          ListEmptyComponent={
            <Text variant="body" style={styles.empty}>
              No country matches “{query}”.
            </Text>
          }
        />
      </Entrance>
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
    ...textStyle(type.body),
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
  flag: { fontSize: 22, lineHeight: 28 },
  // flex so a long name ellipsizes before it can push the check mark out.
  name: { flex: 1 },
  check: { ...textStyle(glyph.xl), color: color.accent },
  empty: { padding: space.lg, textAlign: 'center' },
});
