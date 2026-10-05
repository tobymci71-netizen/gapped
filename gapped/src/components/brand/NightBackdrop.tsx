import React, { useId } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import Svg, { Defs, LinearGradient, RadialGradient, Rect, Stop } from 'react-native-svg';
import { color } from '@/theme/tokens';

export type NightBackdropVariant = 'top' | 'horizon' | 'plain';

type Props = {
  /**
   * top: the canvas with a faint sky glow at the top edge — every ordinary
   *   screen (the Summary and Ranks mockups' background).
   * horizon: sky darkening down to a lit horizon band, then the ground fading
   *   back to night — behind a hero scene that draws its own road and car.
   * plain: the canvas alone.
   */
  variant?: NightBackdropVariant;
  /** horizon only: where the horizon sits, as a fraction of the height. */
  horizonY?: number;
  style?: StyleProp<ViewStyle>;
};

/**
 * The night every screen sits on. Static gradients only, so plain SVG rather
 * than a Skia canvas per screen; it fills its parent, takes no touches and is
 * invisible to VoiceOver. Put it first among a screen's children.
 */
export function NightBackdrop({ variant = 'top', horizonY = 0.33, style }: Props) {
  const id = useId().replace(/[^a-zA-Z0-9_-]/g, '');
  const h = Math.max(0.05, Math.min(0.95, horizonY));
  return (
    <View
      pointerEvents="none"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={[StyleSheet.absoluteFill, { backgroundColor: color.canvas }, style]}
    >
      {variant === 'plain' ? null : (
        <Svg width="100%" height="100%">
          <Defs>
            {variant === 'top' ? (
              // CSS: radial-gradient(130% 40% at 50% 0%, sky 0%, canvas 70%)
              <RadialGradient id={`top${id}`} cx="0.5" cy="0" fx="0.5" fy="0" rx="1.3" ry="0.4">
                <Stop offset="0" stopColor={color.sky} stopOpacity={1} />
                <Stop offset="0.7" stopColor={color.canvas} stopOpacity={0} />
              </RadialGradient>
            ) : (
              [
                <LinearGradient key="sky" id={`sky${id}`} x1="0" y1="0" x2="0" y2="1">
                  <Stop offset="0" stopColor={color.canvas} stopOpacity={0} />
                  <Stop offset={h * 0.55} stopColor={color.sky} stopOpacity={0.6} />
                  <Stop offset={h} stopColor={color.surface2} stopOpacity={1} />
                  <Stop offset={Math.min(1, h + 0.12)} stopColor={color.surface1} stopOpacity={0.9} />
                  <Stop offset={Math.min(1, h + 0.45)} stopColor={color.canvas} stopOpacity={0} />
                </LinearGradient>,
                <RadialGradient
                  key="glow"
                  id={`glow${id}`}
                  cx="0.5"
                  cy={h}
                  fx="0.5"
                  fy={h}
                  rx="0.78"
                  ry="0.09"
                >
                  <Stop offset="0" stopColor={color.horizon} stopOpacity={0.45} />
                  <Stop offset="1" stopColor={color.horizon} stopOpacity={0} />
                </RadialGradient>,
              ]
            )}
          </Defs>
          {variant === 'top' ? (
            <Rect x="0" y="0" width="100%" height="100%" fill={`url(#top${id})`} />
          ) : (
            <>
              <Rect x="0" y="0" width="100%" height="100%" fill={`url(#sky${id})`} />
              <Rect x="0" y="0" width="100%" height="100%" fill={`url(#glow${id})`} />
            </>
          )}
        </Svg>
      )}
    </View>
  );
}
