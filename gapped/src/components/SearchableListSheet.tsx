import { FlashList } from '@shopify/flash-list';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';
import { BottomSheet } from '@/components/BottomSheet';
import { Entrance } from '@/components/Entrance';
import { PressableScale } from '@/components/PressableScale';
import { Text } from '@/components/Text';
import { haptic } from '@/lib/haptics';
import { STAGGER_CAP } from '@/theme/motion';
import { color, font, radius, space, type } from '@/theme/tokens';

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
  /** Rendered as a final row: 'Can't find it? Enter manually'. */
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

  // Every open starts clean — a query left over from last time reads as a
  // broken list rather than a filtered one.
  useEffect(() => {
    if (visible) setQuery('');
  }, [visible]);

  const results = useMemo(() => search(query), [search, query]);
  const trimmed = query.trim();
  const showShortcuts = trimmed.length === 0 && !!shortcuts && shortcuts.length > 0;

  const choose = useCallback(
    (value: string) => {
      haptic.selection();
      onSelect(value);
      onClose();
    },
    [onSelect, onClose],
  );

  const enterManually = useCallback(() => {
    if (!onManualEntry) return;
    haptic.selection();
    onManualEntry(trimmed);
    onClose();
  }, [onManualEntry, trimmed, onClose]);

  return (
    <BottomSheet visible={visible} onClose={onClose} title={title}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View style={styles.searchField}>
          <Magnifier />
          <TextInput
            style={styles.input}
            placeholder={placeholder}
            placeholderTextColor={color.text3}
            value={query}
            onChangeText={setQuery}
            autoCapitalize="none"
            autoCorrect={false}
            returnKeyType="search"
            accessibilityLabel={title}
          />
        </View>

        {showShortcuts ? (
          <View style={styles.chips}>
            {shortcuts.map((s) => (
              <PressableScale key={s} style={styles.chip} onPress={() => choose(s)} silent>
                <Text variant="caption" style={styles.chipLabel}>
                  {s}
                </Text>
              </PressableScale>
            ))}
          </View>
        ) : null}

        <View style={styles.list}>
          <FlashList
            data={results}
            keyExtractor={(item: string) => item}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="on-drag"
            renderItem={({ item, index }: { item: string; index: number }) => {
              const row = (
                <PressableScale style={styles.row} onPress={() => choose(item)} silent>
                  <Text variant="bodyMedium">{item}</Text>
                </PressableScale>
              );
              // Only the first screenful staggers in: FlashList recycles cells,
              // so an entrance on every row replays on every scroll.
              return index < STAGGER_CAP ? <Entrance index={index}>{row}</Entrance> : row;
            }}
            ListEmptyComponent={
              <Text variant="body" style={styles.empty}>
                Nothing matches “{trimmed}”
              </Text>
            }
          />
        </View>

        {onManualEntry ? (
          <PressableScale style={styles.manualRow} onPress={enterManually} silent>
            <Text variant="caption" style={styles.manualLabel}>
              Can't find it? Enter manually
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
    height: 48,
    borderRadius: radius.card,
    backgroundColor: color.surface2,
    marginHorizontal: space.lg,
    paddingHorizontal: space.md,
    gap: space.sm,
  },
  input: {
    flex: 1,
    height: '100%',
    color: color.text1,
    fontFamily: font.body,
    fontSize: type.body,
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
  manualRow: {
    paddingVertical: space.md,
    alignItems: 'center',
    borderTopWidth: 1,
    borderTopColor: color.hairline,
  },
  manualLabel: { color: color.accent, textDecorationLine: 'underline' },
});
