import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useDerivedValue,
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
  const position = useSharedValue(digit);

  useDerivedValue(() => {
    position.value = reduced
      ? digit
      : withTiming(digit, { duration: duration.base, easing: easing.standard });
  }, [digit, reduced]);

  const style = useAnimatedStyle(() => ({
    transform: [{ translateY: -position.value * lineHeight }],
  }));

  return (
    <View style={{ height: lineHeight, overflow: 'hidden' }}>
      <Animated.View style={style}>
        {DIGITS.map((d) => (
          <Text
            key={d}
            style={{
              fontFamily,
              fontSize: size,
              lineHeight,
              color,
              fontVariant: ['tabular-nums'],
              textAlign: 'center',
            }}
          >
            {d}
          </Text>
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
