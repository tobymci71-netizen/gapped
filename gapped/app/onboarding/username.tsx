import { type NativeStackNavigationProp, useIsFocused, useNavigation } from 'expo-router';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  AccessibilityInfo,
  ActivityIndicator,
  Platform,
  StyleSheet,
  TextInput,
  useWindowDimensions,
  View,
} from 'react-native';
import Animated, {
  interpolateColor,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { Button } from '@/components/Button';
import { OnboardingFrame } from '@/components/OnboardingFrame';
import { Text } from '@/components/Text';
import { isUsernameAvailable } from '@/lib/sync';
import { isValidUsername, normaliseUsername } from '@/lib/username';
import { useReducedMotion } from '@/lib/useReducedMotion';
import { CheckGlyph, PersonGlyph } from '@/onboarding/identity/glyphs';
import { useKeyboardShown } from '@/onboarding/identity/useKeyboardShown';
import {
  type Availability,
  availabilityFrom,
  USERNAME_CHECK_TIMEOUT_MS,
  USERNAME_SETTLE_MS,
  usernameFieldState,
  withTimeout,
} from '@/onboarding/identity/usernameField';
import { useOnboardingAdvance } from '@/onboarding/useOnboardingAdvance';
import { useProfile } from '@/state/profile';
import { duration, easing } from '@/theme/motion';
import { color, font, radius, space, textStyle, type } from '@/theme/tokens';

/** The empty avatar circle. */
const AVATAR = 88;
/** The field's border, present in every state so turning orange never shifts the text. */
const FIELD_BORDER = 1.5;

/**
 * The tallest phones (Plus, Pro Max: 926pt and up) keep the avatar while the
 * keyboard is up. Below that, at default text size, heading + avatar + field
 * + caption is taller than the room the keyboard and the pinned Continue
 * leave — on a 667pt SE the field itself ended up under the keyboard — so the
 * avatar, the one part that carries no information, makes way.
 */
const ROOMY_HEIGHT = 900;
/** Past this text scale the avatar is left out altogether, for the same reason. */
const AVATAR_MAX_FONT_SCALE = 1.3;

/**
 * "Choose a username" (docs/ONBOARDING.md, step 10).
 *
 * The rules are the server's (src/lib/username.ts) and the availability check
 * is the real one (isUsernameAvailable), asked live once typing pauses rather
 * than after Continue: the reference shows the taken state while the person is
 * still at the keyboard, and finding out on the tap means a dead button press
 * followed by a correction. usernameField.ts decides every state; this screen
 * only draws it.
 *
 * Offline or with no backend the answer is "unknown", which lets the person
 * continue — the You tab's "choose another" card still catches a late clash,
 * exactly as before.
 */
export default function UsernameStep() {
  const advance = useOnboardingAdvance('/onboarding/username');
  const stored = useProfile((s) => s.username);
  const setUsername = useProfile((s) => s.setUsername);

  const [value, setValue] = useState(stored ?? '');
  const [settledValue, setSettledValue] = useState(value);
  const [verdicts, setVerdicts] = useState<Readonly<Record<string, Availability>>>({});

  const name = normaliseUsername(value);
  const field = usernameFieldState({
    raw: value,
    settled: settledValue === value,
    availability: verdicts[name] ?? 'unchecked',
  });

  // Callbacks below read these; render never does.
  const asked = useRef(new Set<string>());
  const alive = useRef(true);
  const latestName = useRef(name);
  useEffect(() => {
    latestName.current = name;
  }, [name]);
  // Set on every mount, not only cleared on unmount: development remounts
  // each screen once, and a flag that was only ever cleared stayed false after
  // that, dropping every verdict and leaving the spinner up for good.
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  const check = useCallback((n: string) => {
    if (asked.current.has(n)) return;
    asked.current.add(n);
    setVerdicts((v) => ({ ...v, [n]: 'checking' }));
    void withTimeout(isUsernameAvailable(n), USERNAME_CHECK_TIMEOUT_MS, null).then((free) => {
      if (!alive.current) return;
      const verdict = availabilityFrom(free);
      setVerdicts((v) => ({ ...v, [n]: verdict }));
      // "Available" changes no words on screen (the helper stays; only the
      // tick appears), so it is announced here, for the name still in the
      // field. "Taken" is a caption change, announced with the others below.
      if (verdict === 'available' && n === latestName.current) {
        AccessibilityInfo.announceForAccessibility(`${n} is available`);
      }
      // "Could not ask" is not remembered: retyping the name asks again.
      if (verdict === 'unknown') asked.current.delete(n);
    });
  }, []);

  // Typing has paused (or the field let go): a short name may now be called
  // out, and a well-formed one is asked about.
  const settle = useCallback(
    (raw: string) => {
      setSettledValue(raw);
      const n = normaliseUsername(raw);
      if (isValidUsername(n)) check(n);
    },
    [check],
  );

  useEffect(() => {
    const timer = setTimeout(() => settle(value), USERNAME_SETTLE_MS);
    return () => clearTimeout(timer);
  }, [value, settle]);

  // Straight to the keyboard on a first visit, once the push has finished:
  // focusing during the slide raised the keyboard against the moving screen.
  const navigation = useNavigation<NativeStackNavigationProp<Record<string, object | undefined>>>();
  const input = useRef<TextInput>(null);
  const empty = useRef(value.length === 0);
  useEffect(() => {
    empty.current = value.length === 0;
  }, [value]);
  useEffect(
    () =>
      navigation.addListener('transitionEnd', (e) => {
        if (!e.data.closing && empty.current) input.current?.focus();
      }),
    [navigation],
  );

  const reduced = useReducedMotion();
  const focused = useIsFocused();
  const keyboard = useKeyboardShown(focused && !reduced);
  const { height, fontScale } = useWindowDimensions();
  const showAvatar =
    fontScale <= AVATAR_MAX_FONT_SCALE && (!keyboard || (height >= ROOMY_HEIGHT && fontScale <= 1));

  // The border turns orange with the caption, as one change.
  const error = useSharedValue(field.tone === 'error' ? 1 : 0);
  useEffect(() => {
    const to = field.tone === 'error' ? 1 : 0;
    error.set(withTiming(to, { duration: duration.fast, easing: easing.standard }));
  }, [field.tone, error]);
  const border = useAnimatedStyle(() => ({
    borderColor: interpolateColor(error.value, [0, 1], [color.surface2, color.warning]),
  }));

  // The orange caption, spoken as it appears — invalid as well as taken, which
  // was the only one VoiceOver used to hear. Once per change of caption, not
  // per keystroke. iOS only: on Android the caption's live region already
  // reads it, and announcing as well said it twice.
  useEffect(() => {
    if (Platform.OS === 'ios' && field.tone === 'error') {
      AccessibilityInfo.announceForAccessibility(field.caption);
    }
  }, [field.tone, field.caption]);

  const onContinue = () => {
    if (!field.canContinue) return;
    setUsername(field.name);
    advance();
  };

  return (
    <OnboardingFrame
      route="/onboarding/username"
      centered
      title="Choose a username"
      subtitle="This is how you'll appear on the leaderboards."
      footer={
        <Button
          label="Continue"
          variant="light"
          disabled={!field.canContinue}
          onPress={onContinue}
        />
      }
    >
      {showAvatar ? (
        <View
          style={styles.avatar}
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
        >
          <PersonGlyph size={40} color={color.text3} />
        </View>
      ) : null}

      <Animated.View style={[styles.field, border]}>
        <Text variant="bodyMedium" style={styles.at}>
          @
        </Text>
        <TextInput
          ref={input}
          style={styles.input}
          value={value}
          // Shown as it will be stored. Typing "Toby" and seeing "Toby" while
          // "toby" is what gets saved would be a small lie in the one field
          // whose whole job is to show the name exactly.
          onChangeText={(t) => setValue(t.toLowerCase())}
          onBlur={() => settle(value)}
          // Return on a name not yet checked asks now, rather than doing
          // nothing until the pause timer catches up.
          onSubmitEditing={() => (field.canContinue ? onContinue() : settle(value))}
          submitBehavior="submit"
          returnKeyType="next"
          placeholder="username"
          placeholderTextColor={color.text3}
          autoCapitalize="none"
          autoCorrect={false}
          autoComplete="off"
          spellCheck={false}
          keyboardType="ascii-capable"
          maxLength={20}
          accessibilityLabel="Username"
          accessibilityHint={field.caption}
        />
        {field.checking ? (
          <ActivityIndicator size="small" color={color.text3} accessibilityLabel="Checking" />
        ) : field.tone === 'ok' ? (
          <CheckGlyph size={20} color={color.accent} />
        ) : null}
      </Animated.View>

      <Text
        variant="caption"
        accessibilityLiveRegion="polite"
        style={[styles.caption, field.tone === 'error' && styles.captionError]}
      >
        {field.caption}
      </Text>
    </OnboardingFrame>
  );
}

const styles = StyleSheet.create({
  avatar: {
    alignSelf: 'center',
    width: AVATAR,
    height: AVATAR,
    borderRadius: AVATAR / 2,
    backgroundColor: color.surface2,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: space.sm,
  },
  field: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    minHeight: 56,
    paddingHorizontal: space.lg,
    borderRadius: radius.card,
    borderWidth: FIELD_BORDER,
    backgroundColor: color.surface2,
  },
  at: { color: color.text2 },
  input: {
    flex: 1,
    color: color.text1,
    fontFamily: font.body,
    ...textStyle(type.body),
    paddingVertical: space.md,
  },
  caption: { textAlign: 'center', color: color.text2 },
  captionError: { color: color.warning },
});
