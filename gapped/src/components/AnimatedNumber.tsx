import React, { useEffect, useRef } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, {
  SharedValue,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { scheduleOnUI } from 'react-native-worklets';
import { useReducedMotion } from '@/lib/useReducedMotion';
import { duration, easing } from '@/theme/motion';
import { color as colors, font } from '@/theme/tokens';

/**
 * Rolling-odometer number (spec §A8): each digit is a vertical strip of 0–9;
 * only the columns that changed move. Never cross-fades. Non-digit characters
 * (separators, units) render statically. Reduced motion: instant swap.
 *
 * Glyphs do not follow Dynamic Type. Each column is a window exactly
 * `size * 1.1` tall that clips a strip stepped by the same amount, so a glyph
 * iOS scaled past `size` (×1.8 at AX1, ×3.6 at AX5) was cut top and bottom
 * with its neighbours in the strip bleeding into the window. These are display
 * numerals sized by their container — the dial, a stat tile — not reading text.
 */

const DIGITS = ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9'];

/**
 * The strip carries 0–9 three times. Row i shows DIGITS[i % 10], so slots n,
 * n+10 and n+20 are visually identical. A settled column rests in the middle
 * run, which leaves a whole run of room to roll either way — up past 9 into
 * the third run, down past 0 into the first — before being silently
 * normalised back by 10.
 */
const STRIP = [...DIGITS, ...DIGITS, ...DIGITS];
/** First slot of the middle run, where a settled column rests. */
const REST = 10;

/**
 * Plan one column's roll. A worklet, so it runs on the UI thread against the
 * strip's live position; pure, so it is unit-tested.
 *
 *  - `live`: where the strip is now — possibly mid-roll from the last change.
 *  - `from`: the digit that last roll was heading to; `to`: the new digit.
 *  - `dir`: which way the whole NUMBER moved, +1 up or -1 down.
 *
 * Rolls by the modular distance IN THAT DIRECTION, so every column turns the
 * way the number did: 59→60 rolls the units 9→0 forward one place (not back
 * through 8,7,6…), and 60→59 rolls it 0→9 back one place (it used to spin
 * forward through all nine — every time the car slowed down).
 *
 * `start` is the live position moved onto the middle run by whole runs
 * (invisible: the glyphs repeat), measured from the slot the last roll was
 * heading for. That is what keeps an interrupted roll continuous: a new value
 * arriving mid-roll carries on from where the strip visibly is. `rest` is the
 * new digit back in the middle run, for when the roll settles.
 */
export function planRoll(
  live: number,
  from: number,
  to: number,
  dir: 1 | -1,
): { start: number; target: number; rest: number } {
  'worklet';
  const steps = dir > 0 ? (((to - from) % 10) + 10) % 10 : -((((from - to) % 10) + 10) % 10);
  // The slot showing `from` nearest the live position: where the last roll was going.
  const anchor = from + 10 * Math.round((live - from) / 10);
  return { start: REST + from + (live - anchor), target: REST + from + steps, rest: REST + to };
}

/** One roll, run on the UI thread so the live read and the writes are one step. */
function roll(slot: SharedValue<number>, from: number, to: number, dir: 1 | -1) {
  'worklet';
  const { start, target, rest } = planRoll(slot.value, from, to, dir);
  // Assigning a plain value cancels any roll in flight; its callback then
  // reports unfinished, so only this roll normalises the strip.
  slot.value = start;
  slot.value = withTiming(
    target,
    { duration: duration.base, easing: easing.standard },
    (finished) => {
      'worklet';
      // Same glyph one run over, so this snap is invisible.
      if (finished) slot.value = rest;
    },
  );
}

type Props = {
  value: string;
  size?: number;
  color?: string;
  weight?: 'black' | 'extrabold';
};

function DigitColumn({
  digit,
  whole,
  size,
  color,
  fontFamily,
  reduced,
}: {
  digit: number;
  /** The whole number this column belongs to; its movement sets the direction. */
  whole: number;
  size: number;
  color: string;
  fontFamily: string;
  reduced: boolean;
}) {
  const lineHeight = Math.round(size * 1.1);
  const slot = useSharedValue(REST + digit);
  const shown = useRef(digit);
  const shownWhole = useRef(whole);

  /**
   * Roll in the direction the whole number moved — see planRoll.
   *
   * Driven from an effect rather than useDerivedValue: writing an animation to
   * the same shared value the derivation reads registers it as its own mapper
   * input, which is a self-referential update Reanimated does not promise
   * anything about.
   */
  useEffect(() => {
    const from = shown.current;
    const prevWhole = shownWhole.current;
    shownWhole.current = whole;
    if (from === digit) return;
    shown.current = digit;

    if (reduced) {
      slot.value = REST + digit;
      return;
    }

    // Not a plain number (a grouped "1,234"): keep the old forward rule.
    const dir = Number.isFinite(whole) && Number.isFinite(prevWhole) && whole < prevWhole ? -1 : 1;
    scheduleOnUI(roll, slot, from, digit, dir);
  }, [digit, whole, reduced, slot]);

  const style = useAnimatedStyle(() => ({
    transform: [{ translateY: -slot.value * lineHeight }],
  }));

  return (
    <View style={{ height: lineHeight, overflow: 'hidden' }}>
      <Animated.View style={style}>
        {/*
          Each row is a fixed-height box that centres its glyph, rather than a
          Text relying on lineHeight to position itself. lineHeight places the
          baseline, so glyphs whose vertical metrics differ in the display face
          sat at slightly different heights — visible as one digit riding above
          its neighbours in a settled number.
        */}
        {STRIP.map((d, i) => (
          <View key={i} style={{ height: lineHeight, justifyContent: 'center' }}>
            <Text
              allowFontScaling={false}
              style={{
                fontFamily,
                fontSize: size,
                color,
                fontVariant: ['tabular-nums'],
                textAlign: 'center',
              }}
            >
              {d}
            </Text>
          </View>
        ))}
      </Animated.View>
    </View>
  );
}

export function AnimatedNumber({
  value,
  size = 28,
  color = colors.text1,
  weight = 'black',
}: Props) {
  const reduced = useReducedMotion();
  const fontFamily = weight === 'black' ? font.displayBlack : font.display;
  const lineHeight = Math.round(size * 1.1);
  const whole = Number(value);

  return (
    <View style={styles.row} accessibilityLabel={value} accessible>
      {value.split('').map((ch, i) =>
        /\d/.test(ch) ? (
          <DigitColumn
            // key by position from the RIGHT so appending a digit on the left
            // (99→100) doesn't remount and jump every existing column
            key={`d${value.length - i}`}
            digit={parseInt(ch, 10)}
            whole={whole}
            size={size}
            color={color}
            fontFamily={fontFamily}
            reduced={reduced}
          />
        ) : (
          <Text
            key={`c${i}${ch}`}
            allowFontScaling={false}
            style={{
              fontFamily,
              fontSize: size,
              lineHeight,
              color,
              fontVariant: ['tabular-nums'],
            }}
          >
            {ch}
          </Text>
        ),
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'flex-end' },
});
