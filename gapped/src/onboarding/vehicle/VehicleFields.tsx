import React, { useCallback, useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, Platform, StyleSheet, TextInput, View } from 'react-native';
import { PressableScale } from '@/components/PressableScale';
import { SearchableListSheet } from '@/components/SearchableListSheet';
import { Text } from '@/components/Text';
import { raisedPanel } from '@/onboarding/ui/choice';
import { NightLink } from '@/onboarding/ui/StepTitle';
import type { VehicleKind } from '@/state/profile';
import { color, font, inputText, space, type } from '@/theme/tokens';
import { MAKE_NOT_ALLOWED } from '@/lib/username';
import { modelsForMake, popularMakes, searchMakes, searchModels } from '@/vehicles/catalog';
import {
  cleanName,
  makeRefused,
  MAX_MAKE_LENGTH,
  MAX_MODEL_LENGTH,
  type VehicleDraft,
  withMake,
} from './draft';
import { CheckIcon, ChevronDownIcon } from './icons';
import { useRevealOnFocus } from './StepScroll';

type Props = {
  kind: VehicleKind;
  draft: VehicleDraft;
  onChange: (next: VehicleDraft) => void;
};

/** Field height: the 56pt row the rest of onboarding uses. */
const FIELD_HEIGHT = 56;

/**
 * "Select make" and "Select model", the "Not listed? Add it yourself" link,
 * and the typed fields that link opens — the choosing half of the ride step,
 * shared with the garage's "Add another car" so a second vehicle is chosen
 * exactly the way the first was.
 *
 * Controlled: the parent owns the draft. Picks go through the catalogue's
 * sheets (search, popular makes as chips, and their own "Enter manually"
 * row); "Add it yourself" swaps both rows for text fields in place, for a
 * vehicle the catalogue does not have. Model stays disabled until there is a
 * make, because a model list only exists per make.
 */
export function VehicleFields({ kind, draft, onChange }: Props) {
  const [sheet, setSheet] = useState<'none' | 'make' | 'model'>('none');
  const [typing, setTyping] = useState(false);
  const make = cleanName(draft.make);
  const model = cleanName(draft.model);

  const chooseMake = useCallback(
    (next: string) => onChange(withMake(draft, next)),
    [draft, onChange],
  );
  const chooseModel = useCallback(
    (next: string) => onChange({ ...draft, model: next }),
    [draft, onChange],
  );

  const searchMakeList = useCallback((q: string) => searchMakes(kind, q, 60), [kind]);
  const searchModelList = useCallback(
    (q: string) => (make ? searchModels(kind, make, q, 80) : []),
    [kind, make],
  );
  const hasModelList = !!make && modelsForMake(kind, make).length > 0;
  const linkLabel = typing ? 'Choose from the list instead' : 'Not listed? Add it yourself';
  // A make the server would refuse (draftReady holds Continue back for it).
  // Only a typed or "Enter manually" make can be one: the catalogue's pass.
  const refused = makeRefused(draft.make);

  // Spoken as it appears, as the username step does. iOS only: on Android the
  // caption's live region already reads it.
  useEffect(() => {
    if (refused && Platform.OS === 'ios') AccessibilityInfo.announceForAccessibility(MAKE_NOT_ALLOWED);
  }, [refused]);

  return (
    <View style={styles.root}>
      {typing ? (
        <TypedFields kind={kind} draft={draft} onChange={onChange} />
      ) : (
        <>
          <PickerField
            label="Make"
            value={make}
            refused={refused}
            placeholder="Select make"
            onPress={() => setSheet('make')}
          />
          <PickerField
            label="Model"
            value={model}
            placeholder="Select model"
            disabled={!make}
            disabledHint="Choose a make first"
            onPress={() => setSheet('model')}
          />
        </>
      )}

      {refused ? (
        <Text variant="caption" accessibilityLiveRegion="polite" style={styles.refused}>
          {MAKE_NOT_ALLOWED}
        </Text>
      ) : null}

      <NightLink label={linkLabel} role="button" onPress={() => setTyping((t) => !t)} />

      <SearchableListSheet
        visible={sheet === 'make'}
        onClose={() => setSheet('none')}
        title="Select make"
        placeholder={
          kind === 'motorbike' ? 'Search makes — try “duc”' : 'Search makes — try “merc”'
        }
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
        onSelect={chooseModel}
        onManualEntry={(typed) => {
          if (typed) chooseModel(typed);
        }}
      />
    </View>
  );
}

/**
 * A raised night panel that opens a picker: the value (or its placeholder)
 * on the left, a white check once chosen or a grey chevron before. The check
 * is the reference's own signal that a field is done.
 */
function PickerField({
  label,
  value,
  refused = false,
  placeholder,
  disabled = false,
  disabledHint,
  onPress,
}: {
  label: string;
  value: string;
  /** The value is one the server would refuse: no check, and VoiceOver says so. */
  refused?: boolean;
  placeholder: string;
  disabled?: boolean;
  disabledHint?: string;
  onPress: () => void;
}) {
  return (
    <PressableScale
      onPress={onPress}
      disabled={disabled}
      silent
      accessibilityRole="button"
      accessibilityLabel={
        value ? `${label}, ${value}${refused ? `. ${MAKE_NOT_ALLOWED}` : ''}` : placeholder
      }
      accessibilityHint={
        disabled ? disabledHint : `Opens a searchable list of ${label.toLowerCase()}s`
      }
      accessibilityState={{ disabled }}
      style={[styles.field, disabled ? styles.fieldDisabled : null]}
    >
      <Text
        variant="bodyMedium"
        style={[styles.fieldValue, value ? null : styles.placeholder]}
        numberOfLines={1}
      >
        {value || placeholder}
      </Text>
      {value && !refused ? <CheckIcon /> : <ChevronDownIcon />}
    </PressableScale>
  );
}

/**
 * Make and model as free text, for a vehicle the catalogue does not list.
 * Opened from the link, so it takes focus at once: the person has just said
 * they want to type.
 */
function TypedFields({ kind, draft, onChange }: Props) {
  const reveal = useRevealOnFocus();
  const makeWrap = useRef<View>(null);
  const modelWrap = useRef<View>(null);
  const makeInput = useRef<TextInput>(null);
  const modelInput = useRef<TextInput>(null);

  useEffect(() => {
    makeInput.current?.focus();
  }, []);

  return (
    <>
      <View ref={makeWrap} style={styles.field}>
        <TextInput
          selectionColor={color.text1}
          ref={makeInput}
          value={draft.make}
          onChangeText={(make) => onChange({ ...draft, make })}
          onFocus={() => reveal(makeWrap.current)}
          placeholder="Make"
          placeholderTextColor={color.text2}
          maxLength={MAX_MAKE_LENGTH}
          autoCapitalize="words"
          autoCorrect={false}
          returnKeyType="next"
          submitBehavior="submit"
          onSubmitEditing={() => modelInput.current?.focus()}
          accessibilityLabel={kind === 'motorbike' ? 'Bike make' : 'Car make'}
          style={styles.input}
        />
        {cleanName(draft.make) && !makeRefused(draft.make) ? <CheckIcon /> : null}
      </View>
      <View ref={modelWrap} style={styles.field}>
        <TextInput
          selectionColor={color.text1}
          ref={modelInput}
          value={draft.model}
          onChangeText={(model) => onChange({ ...draft, model })}
          onFocus={() => reveal(modelWrap.current)}
          placeholder="Model"
          placeholderTextColor={color.text2}
          maxLength={MAX_MODEL_LENGTH}
          autoCapitalize="words"
          autoCorrect={false}
          returnKeyType="done"
          accessibilityLabel={kind === 'motorbike' ? 'Bike model' : 'Car model'}
          style={styles.input}
        />
        {cleanName(draft.model) ? <CheckIcon /> : null}
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  root: { gap: space.md },
  field: {
    ...raisedPanel,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    minHeight: FIELD_HEIGHT,
    paddingHorizontal: space.lg,
  },
  fieldDisabled: { opacity: 0.45 },
  // flex so a long make ellipsizes instead of pushing the check out.
  fieldValue: { flex: 1 },
  placeholder: { color: color.text2 },
  input: {
    flex: 1,
    alignSelf: 'stretch',
    color: color.text1,
    fontFamily: font.bodyMedium,
    ...inputText(type.body),
    // Android pads single-line inputs; the row already sets the height.
    paddingVertical: 0,
  },
  refused: { color: color.warning, paddingHorizontal: space.lg },
});
