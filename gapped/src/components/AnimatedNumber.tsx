import React, { useEffect, useRef } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { useReducedMotion } from '@/lib/useReducedMotion';
import { duration, easing } from '@/theme/motion';
import { color as colors, font } from '@/theme/tokens';

/**
 * Rolling-odometer number (spec §A8): each digit is a vertical strip of 0–9;
 * only the columns that changed move. Never cross-fades. Non-digit characters
 * (separators, units) render statically. Reduced motion: instant swap.
 */

const DIGITS = ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9'];

/**
 * The strip carries 0–9 twice. Row i shows DIGITS[i % 10], so slot n and slot
 * n+10 are visually identical — which is what lets a 9→0 step travel *forward*
 * one place into the second run and then be silently normalised back by 10.
 */
const STRIP = [...DIGITS, ...DIGITS];

type Props = {
  value: string;
  size?: number;
  color?: string;
  weight?: 'black' | 'extrabold';
};

function DigitColumn({
  digit,
  size,
  color,
  fontFamily,
  reduced,
}: {
  digit: number;
  size: number;
  color: string;
  fontFamily: string;
  reduced: boolean;
}) {
  const lineHeight = Math.round(size * 1.1);
  const slot = useSharedValue(digit);
  /** Logical slot the strip is settled on, kept off the UI thread. */
  const settled = useRef(digit);
  const shown = useRef(digit);

  /**
   * Advance by the FORWARD modular distance, never the signed difference.
   *
   * Animating straight to the new digit meant 9→0 ran backwards through
   * 8,7,6…0 — so on every ten boundary the units column visibly
   * counter-rotated against the tens column beside it. Going forward by
   * ((digit - shown) mod 10) into the strip's second run and normalising back
   * by 10 on completion keeps every column turning the same way.
   *
   * Driven from an effect rather than useDerivedValue: writing an animation to
   * the same shared value the derivation reads registers it as its own mapper
   * input, which is a self-referential update Reanimated does not promise
   * anything about.
   */
  useEffect(() => {
    const from = shown.current;
    if (from === digit) return;
    shown.current = digit;

    if (reduced) {
      settled.current = digit;
      slot.value = digit;
      return;
    }

    const forward = ((digit - from) % 10 + 10) % 10;
    const target = settled.current + forward;
    settled.current = target >= 10 ? target - 10 : target;

    slot.value = withTiming(
      target,
      { duration: duration.base, easing: easing.standard },
      (finished) => {
        'worklet';
        // Slot n and n+10 render the same glyph, so this snap is invisible.
        if (finished && target >= 10) slot.value = target - 10;
      },
    );
  }, [digit, reduced, slot]);

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

  return (
    <View style={styles.row} accessibilityLabel={value} accessible>
      {value.split('').map((ch, i) =>
        /\d/.test(ch) ? (
          <DigitColumn
            // key by position from the RIGHT so appending a digit on the left
            // (99→100) doesn't remount and jump every existing column
            key={`d${value.length - i}`}
            digit={parseInt(ch, 10)}
            size={size}
            color={color}
            fontFamily={fontFamily}
            reduced={reduced}
          />
        ) : (
          <Text
            key={`c${i}${ch}`}
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
