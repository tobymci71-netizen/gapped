import { FlashList } from '@shopify/flash-list';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  TextInput,
  useWindowDimensions,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BottomSheet } from '@/components/BottomSheet';
import { Entrance } from '@/components/Entrance';
import { PressableScale } from '@/components/PressableScale';
import { Text } from '@/components/Text';
import { haptic } from '@/lib/haptics';
import { color, font, radius, space, type, textStyle } from '@/theme/tokens';
import { exactEntry } from '@/vehicles/catalog';

/**
 * Search-and-pick sheet for make and model. Free-text fallback is always one
 * tap away: a picker that cannot represent someone's vehicle is a churn event,
 * so `onManualEntry` receives whatever they typed.
 */

type Props<T> = {
  visible: boolean;
  onClose: () => void;
  title: string;
  /** Full candidate list is derived by the caller from the query. */
  search: (query: string) => T[];
  onSelect: (value: T) => void;
  placeholder?: string;
  /** Optional chips rendered above the list when the query is empty. */
  shortcuts?: T[];
  /** Rendered as a final row: 'Can&apos;t find it? Enter manually'. */
  onManualEntry?: (typed: string) => void;
};

export function SearchableListSheet({
  visible,
  onClose,
  title,
  search,
  onSelect,
  placeholder = 'Search…',
  shortcuts,
  onManualEntry,
}: Props<string>): React.JSX.Element {
  const [query, setQuery] = useState('');
  const inputRef = useRef<TextInput>(null);
  const { height: windowHeight } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  /** Bottom edge of the KeyboardAvoidingView, in its parent's coordinates. */
  const [kavBottom, setKavBottom] = useState<number | null>(null);

  // Every open starts clean — a query left over from last time reads as a
  // broken list rather than a filtered one.
  useEffect(() => {
    if (visible) setQuery('');
  }, [visible]);

  const results = useMemo(() => search(query), [search, query]);
  const trimmed = query.trim();
  const showShortcuts = trimmed.length === 0 && !!shortcuts && shortcuts.length > 0;

  /*
   * Every way out drops the keyboard as the sheet starts to leave, rather than
   * when its Modal finally unmounts at the end of the exit spring. The screen
   * underneath avoids the keyboard too, so until then it stayed squeezed as the
   * sheet slid off it.
   */
  const close = useCallback(() => {
    Keyboard.dismiss();
    onClose();
  }, [onClose]);

  const choose = useCallback(
    (value: string) => {
      haptic.selection();
      onSelect(value);
      close();
    },
    [onSelect, close],
  );

  const enterManually = useCallback(() => {
    if (!onManualEntry) return;
    // Nothing typed yet: "Enter manually" means "let me type it", so open the
    // field rather than closing the sheet on an empty value the caller drops.
    if (!trimmed) {
      inputRef.current?.focus();
      return;
    }
    haptic.selection();
    onManualEntry(trimmed);
    close();
  }, [onManualEntry, trimmed, close]);

  /*
   * Return commits what was typed when that is unambiguous: the exact
   * catalogue entry if there is one, otherwise the typed text itself when
   * nothing in the list matches. With partial matches showing it only drops
   * the keyboard, as before — guessing which row was meant is worse than
   * letting them tap it.
   */
  const submit = useCallback(() => {
    if (!trimmed) return;
    const exact = exactEntry(results, trimmed);
    if (exact) choose(exact);
    else if (results.length === 0) enterManually();
  }, [trimmed, results, choose, enterManually]);

  /*
   * keyboardVerticalOffset is how far the view sits below where it thinks it
   * is. KeyboardAvoidingView measures itself with onLayout, which is relative
   * to its parent (the sheet body), so it took its own top to be y = 0 and its
   * bottom to be the body's height — 180–220pt above the truth on a
   * bottom-anchored sheet. It padded for a fraction of the keyboard and left
   * the bottom of the list and the manual-entry row underneath it.
   *
   * BottomSheet anchors the sheet to the bottom of a full-screen Modal and pads
   * it by the bottom inset, so this view's real bottom edge is
   * `windowHeight - insets.bottom`. The offset is the gap between that and the
   * bottom it measured.
   */
  const keyboardOffset = kavBottom == null ? 0 : windowHeight - insets.bottom - kavBottom;

  return (
    <BottomSheet visible={visible} onClose={close} title={title}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={keyboardOffset}
        onLayout={(e) => {
          const { y, height } = e.nativeEvent.layout;
          setKavBottom(y + height);
        }}
      >
        <View style={styles.searchField}>
          <Magnifier />
          <TextInput
            ref={inputRef}
            style={styles.input}
            placeholder={placeholder}
            placeholderTextColor={color.text2}
            value={query}
            onChangeText={setQuery}
            autoCapitalize="none"
            autoCorrect={false}
            returnKeyType="search"
            onSubmitEditing={submit}
            accessibilityLabel={title}
          />
        </View>

        {showShortcuts ? (
          <View style={styles.chips}>
            {shortcuts.map((s) => (
              <PressableScale
                key={s}
                style={styles.chip}
                onPress={() => choose(s)}
                silent
                accessibilityRole="button"
                accessibilityLabel={s}
              >
                <Text variant="caption" style={styles.chipLabel}>
                  {s}
                </Text>
              </PressableScale>
            ))}
          </View>
        ) : null}

        {/*
          The list fades in once, as a whole. Per-row entrances replayed:
          FlashList recycles cells across indices, and wrapping only the first
          rows changed a recycled cell's root element, so scrolling back up or
          typing remounted rows that then faded in again.
        */}
        <Entrance style={styles.list}>
          <FlashList
            data={results}
            keyExtractor={(item: string) => item}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="on-drag"
            renderItem={({ item }: { item: string }) => (
              <PressableScale
                style={styles.row}
                onPress={() => choose(item)}
                silent
                accessibilityRole="button"
                accessibilityLabel={item}
              >
                <Text variant="bodyMedium">{item}</Text>
              </PressableScale>
            )}
            ListEmptyComponent={
              // Nothing in the catalogue, but something typed: offer it as the
              // answer, at the top where the keyboard cannot cover it. Most
              // makes have no model list at all, so for them this is the
              // main path, not a fallback — it should not read as an error.
              trimmed && onManualEntry ? (
                <PressableScale
                  style={styles.row}
                  onPress={enterManually}
                  silent
                  accessibilityRole="button"
                  accessibilityLabel={`Use ${trimmed}`}
                >
                  <Text variant="bodyMedium" style={styles.useTyped} numberOfLines={1}>
                    Use “{trimmed}”
                  </Text>
                </PressableScale>
              ) : (
                <Text variant="body" style={styles.empty}>
                  {trimmed ? `Nothing matches “${trimmed}”` : 'Nothing to show yet.'}
                </Text>
              )
            }
          />
        </Entrance>

        {onManualEntry ? (
          <PressableScale
            style={styles.manualRow}
            onPress={enterManually}
            silent
            accessibilityRole="button"
          >
            <Text variant="caption" style={styles.manualLabel}>
              Can&apos;t find it? Enter manually
            </Text>
          </PressableScale>
        ) : null}
      </KeyboardAvoidingView>
    </BottomSheet>
  );
}

/** Drawn rather than set in a font: no glyph fallback to go wrong. */
function Magnifier(): React.JSX.Element {
  return (
    <View style={styles.magnifier}>
      <View style={styles.magnifierLens} />
      <View style={styles.magnifierHandle} />
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  searchField: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 48,
    borderRadius: radius.card,
    backgroundColor: color.surface2,
    marginHorizontal: space.lg,
    paddingHorizontal: space.md,
    gap: space.sm,
  },
  input: {
    flex: 1,
    color: color.text1,
    fontFamily: font.body,
    ...textStyle(type.body),
    // Android centres single-line inputs badly without this.
    paddingVertical: 0,
  },
  magnifier: { width: 16, height: 16, justifyContent: 'center', alignItems: 'center' },
  magnifierLens: {
    width: 11,
    height: 11,
    borderRadius: 6,
    borderWidth: 1.5,
    borderColor: color.text3,
    marginTop: -2,
    marginLeft: -2,
  },
  magnifierHandle: {
    position: 'absolute',
    right: 1,
    bottom: 1,
    width: 6,
    height: 1.5,
    borderRadius: 1,
    backgroundColor: color.text3,
    transform: [{ rotate: '45deg' }],
  },
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: space.sm,
    paddingHorizontal: space.lg,
    marginTop: space.md,
  },
  chip: {
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: color.hairline,
    backgroundColor: color.surface2,
    paddingHorizontal: space.md,
    paddingVertical: 7,
  },
  chipLabel: { color: color.text1 },
  list: { flex: 1, marginTop: space.sm },
  row: {
    minHeight: 50,
    justifyContent: 'center',
    paddingHorizontal: space.lg,
    borderBottomWidth: 1,
    borderBottomColor: color.surface2,
  },
  empty: { padding: space.xl, textAlign: 'center' },
  // accentHot: red text on the sheet must clear AA; racing red does not.
  useTyped: { color: color.accentHot },
  manualRow: {
    paddingVertical: space.md,
    alignItems: 'center',
    borderTopWidth: 1,
    borderTopColor: color.hairline,
  },
  manualLabel: { color: color.accentHot, textDecorationLine: 'underline' },
});
