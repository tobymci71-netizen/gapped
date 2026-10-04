import { FlashList, type FlashListRef } from '@shopify/flash-list';
import React, { useCallback, useMemo, useRef, useState } from 'react';
import {
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  TextInput,
  useWindowDimensions,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BottomSheet } from '@/components/BottomSheet';
import { PressableScale } from '@/components/PressableScale';
import { Text } from '@/components/Text';
import { countryByCode, type Country, type CountryCode } from '@/data/countries';
import { searchCountries } from '@/data/countrySearch';
import { haptic } from '@/lib/haptics';
import { color, font, glyph, radius, space, textStyle, type } from '@/theme/tokens';
import { countryRegion } from './countryDots';
import { deviceCountry } from './deviceCountry';
import { CheckIcon, CloseIcon, MagnifierIcon } from './icons';

type Props = {
  visible: boolean;
  selected: CountryCode | null;
  onSelect: (code: CountryCode) => void;
  onClose: () => void;
};

type Row = { country: Country; region: string | null; suggested: boolean };

/** Rows of context left above the selected country when the sheet reopens on it. */
const CONTEXT_ROWS = 2;

/**
 * "Select country" — the country step's sheet (docs/ONBOARDING.md, "Country"):
 * flag, name and region on every row, search pinned to the bottom.
 *
 * The list and its search are the app's own: COUNTRIES (one canonical code
 * per country, so a pick can never split a national board) ranked by
 * searchCountries, which is what makes "uk", "usa", "holland" and "turkey" find
 * the right row first. What is new here is only the presentation the
 * reference uses — a region line, the field at the bottom where a thumb is —
 * and a suggested first row from the phone's own region, which is offered but
 * never chosen for anyone (deviceCountry.ts says why).
 *
 * A tap chooses and closes: the proof screen behind it crossfades to the new
 * country as the sheet goes, which is the confirmation.
 */
export function CountrySheet({ visible, selected, onSelect, onClose }: Props) {
  const [query, setQuery] = useState('');
  const list = useRef<FlashListRef<Row>>(null);
  const { height: windowHeight } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const [kavBottom, setKavBottom] = useState<number | null>(null);

  // Every open starts clean: a query left from last time reads as a broken
  // list. Reset as the sheet opens, not as it closes, so the list does not
  // jump back to A while it is still sliding away.
  const [wasVisible, setWasVisible] = useState(visible);
  // The country chosen when the sheet opened, for the suggested row below:
  // read at the open so a pick does not reshuffle the list as it slides away.
  const [openedWith, setOpenedWith] = useState(selected);
  if (visible !== wasVisible) {
    setWasVisible(visible);
    if (visible) {
      setQuery('');
      setOpenedWith(selected);
    }
  }

  const suggestion = useMemo(() => countryByCode(deviceCountry()) ?? null, []);

  const rows = useMemo<Row[]>(() => {
    const found = searchCountries(query).map((country) => ({
      country,
      region: countryRegion(country.code),
      suggested: false,
    }));
    // Not once it is the country already chosen: two ticked rows, one of them
    // pinned above Afghanistan, would read as two answers.
    if (query.trim() || !suggestion || suggestion.code === openedWith) return found;
    return [{ country: suggestion, region: countryRegion(suggestion.code), suggested: true }, ...found];
  }, [query, suggestion, openedWith]);

  // Reopening to change a country lands on the current one, with a couple of
  // rows above it, instead of at Afghanistan. Read once, when the list mounts
  // (the sheet mounts its content on every open).
  const selectedIndex = rows.findIndex((r) => r.country.code === selected);
  const initialIndex = selectedIndex > 0 ? Math.max(0, selectedIndex - CONTEXT_ROWS) : undefined;

  const close = useCallback(() => {
    Keyboard.dismiss();
    onClose();
  }, [onClose]);

  const choose = useCallback(
    (code: CountryCode) => {
      haptic.selection();
      onSelect(code);
      close();
    },
    [onSelect, close],
  );

  const search = useCallback((text: string) => {
    setQuery(text);
    // Results are ranked best-first, so a new query belongs at the top of the
    // list, not wherever the last one was scrolled to.
    list.current?.scrollToOffset({ offset: 0, animated: false });
  }, []);

  /*
   * Return chooses only when there is nothing to guess: one row left. With
   * several it just puts the keyboard away so the list can be seen, as the
   * make and model sheets do.
   */
  const submit = useCallback(() => {
    const only = query.trim() && rows.length === 1 ? rows[0] : null;
    if (only) choose(only.country.code);
    else Keyboard.dismiss();
  }, [query, rows, choose]);

  // KeyboardAvoidingView measures itself relative to its parent, the sheet
  // body, and so believes its bottom edge is far higher than it is on a
  // bottom-anchored sheet. Its real bottom is the window's, less the inset
  // BottomSheet pads by. SearchableListSheet explains this at length.
  const keyboardOffset = kavBottom == null ? 0 : windowHeight - insets.bottom - kavBottom;

  return (
    <BottomSheet visible={visible} onClose={close} title="Select country" heightFraction={0.86}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={keyboardOffset}
        onLayout={(e) => {
          const { y, height } = e.nativeEvent.layout;
          setKavBottom(y + height);
        }}
      >
        <View style={styles.flex}>
          <FlashList
            ref={list}
            data={rows}
            keyExtractor={(r: Row) => (r.suggested ? `suggested-${r.country.code}` : r.country.code)}
            initialScrollIndex={initialIndex}
            // A filter is not a feed: when the rows change, the list should not
            // try to hold on to whatever row was on screen before.
            maintainVisibleContentPosition={{ disabled: true }}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="on-drag"
            renderItem={({ item }: { item: Row }) => (
              <CountryRow row={item} selected={item.country.code === selected} onPress={choose} />
            )}
            ListEmptyComponent={
              <Text variant="body" style={styles.empty}>
                No country matches “{query.trim()}”.
              </Text>
            }
          />
        </View>

        <View style={styles.searchBar}>
          <View style={styles.searchField}>
            <MagnifierIcon />
            <TextInput
              style={styles.input}
              placeholder="Search country"
              placeholderTextColor={color.text2}
              value={query}
              onChangeText={search}
              autoCapitalize="none"
              autoCorrect={false}
              returnKeyType="search"
              onSubmitEditing={submit}
              accessibilityLabel="Search countries"
            />
            {query ? (
              <Pressable
                onPress={() => search('')}
                accessibilityRole="button"
                accessibilityLabel="Clear search"
                hitSlop={8}
                style={styles.clear}
              >
                <CloseIcon color={color.text1} />
              </Pressable>
            ) : null}
          </View>
        </View>
      </KeyboardAvoidingView>
    </BottomSheet>
  );
}

function CountryRow({
  row,
  selected,
  onPress,
}: {
  row: Row;
  selected: boolean;
  onPress: (code: CountryCode) => void;
}) {
  const { country, region, suggested } = row;
  // Name, then region: the flag would otherwise be read first ("flag: Italy,
  // Italy"), and "selected" is announced from the state, not a colour.
  const label = [country.name, suggested ? 'suggested' : null, region].filter(Boolean).join(', ');
  return (
    <PressableScale
      silent
      onPress={() => onPress(country.code)}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ selected }}
      style={styles.row}
    >
      <Text style={styles.flag} importantForAccessibility="no">
        {country.flag}
      </Text>
      <View style={styles.rowText}>
        <Text variant="bodyMedium" numberOfLines={1}>
          {country.name}
        </Text>
        {suggested || region ? (
          <Text variant="caption" numberOfLines={1}>
            {suggested ? <Text style={styles.suggested}>Suggested{region ? ' · ' : ''}</Text> : null}
            {region}
          </Text>
        ) : null}
      </View>
      {selected ? <CheckIcon /> : null}
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    minHeight: 60,
    paddingVertical: space.sm,
    paddingHorizontal: space.lg,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: color.hairline,
  },
  flag: textStyle(glyph.huge),
  // flex so a long name ellipsizes before it can push the check out.
  rowText: { flex: 1, minWidth: 0 },
  suggested: { color: color.accent },
  empty: { padding: space.xl, textAlign: 'center' },
  searchBar: {
    paddingHorizontal: space.lg,
    paddingTop: space.md,
    paddingBottom: space.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: color.hairline,
    backgroundColor: color.surface1,
  },
  searchField: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 48,
    borderRadius: radius.pill,
    backgroundColor: color.surface2,
    paddingLeft: space.lg,
    paddingRight: space.xs,
    gap: space.sm,
  },
  input: {
    flex: 1,
    minHeight: 44,
    color: color.text1,
    fontFamily: font.body,
    ...textStyle(type.body),
    // Android centres single-line inputs badly without this.
    paddingVertical: 0,
  },
  clear: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: color.disabled,
  },
});
