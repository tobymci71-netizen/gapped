import React from 'react';
import { StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg';
import { FilmGrain } from '@/components/brand/FilmGrain';
import { GappedMark } from '@/components/brand/GappedMark';
import { NightBackdrop } from '@/components/brand/NightBackdrop';
import { Icon } from '@/components/icons';
import { PressableScale } from '@/components/PressableScale';
import { Text } from '@/components/Text';
import { countryByCode } from '@/data/countries';
import { alpha, color, glyph, gutter, slant, space, textStyle } from '@/theme/tokens';

/** Where the horizon sits in the header, as a share of its height. */
const HORIZON = 0.8;
const HORIZON_TOP = '80%';

/** Screen's own top padding over the safe area (components/Screen.tsx). */
const SCREEN_TOP = 12;

type Props = {
  username: string | null;
  country: string | null;
  vehicleMake: string | null;
  vehicleModel: string | null;
  onSettings: () => void;
  /** Room left at the foot for whatever overlaps the horizon (the distance plate). */
  footRoom?: number;
};

/**
 * The top of the You tab: the driver, set like a title card. The night sky
 * runs up under the status bar and down to a faint lit horizon, the
 * @username is in the wide italic as large as it fits, and the country and
 * car sit under it in mono. Film grain over the lot, still under Reduce
 * Motion and off-focus (FilmGrain).
 *
 * Bleeds to the screen's edges and top: render it first inside a Screen.
 */
export function DriverHeader({
  username,
  country,
  vehicleMake,
  vehicleModel,
  onSettings,
  footRoom = 0,
}: Props): React.JSX.Element {
  const insets = useSafeAreaInsets();
  const top = insets.top + SCREEN_TOP;
  const place = countryByCode(country);
  const vehicle = vehicleMake ? `${vehicleMake} ${vehicleModel ?? ''}`.trim() : null;
  const name = username ? `@${username}` : 'Driver';

  return (
    <View
      style={[
        styles.hero,
        { marginTop: -top, paddingTop: top, paddingBottom: footRoom + space.xl },
      ]}
    >
      <View style={StyleSheet.absoluteFill} pointerEvents="none">
        <NightBackdrop variant="horizon" horizonY={HORIZON} />
        <HorizonLine />
        <FilmGrain opacity={0.06} />
      </View>

      <View style={styles.topRow}>
        <GappedMark size="sm" />
        <PressableScale
          onPress={onSettings}
          accessibilityRole="button"
          accessibilityLabel="Settings"
          style={styles.settings}
        >
          <Icon name="settings" size={22} color={color.text2} />
        </PressableScale>
      </View>

      <Text
        variant="display"
        style={styles.name}
        numberOfLines={1}
        adjustsFontSizeToFit
        minimumFontScale={0.5}
        accessibilityRole="header"
      >
        {name}
      </Text>

      {place || country || vehicle ? (
        <View style={styles.meta}>
          {place || country ? (
            <View
              style={styles.metaPart}
              accessible
              accessibilityLabel={place ? place.name : (country ?? undefined)}
            >
              {place ? <Text style={styles.flag}>{place.flag}</Text> : null}
              <Text variant="mono" style={styles.metaText}>
                {place ? place.code : country}
              </Text>
            </View>
          ) : null}
          {(place || country) && vehicle ? <View style={styles.slash} /> : null}
          {vehicle ? (
            <Text variant="mono" style={[styles.metaText, styles.vehicle]} numberOfLines={1}>
              {vehicle}
            </Text>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

/** A hairline of city light along the horizon, brightest in the middle. */
function HorizonLine() {
  return (
    <Svg
      style={styles.horizonLine}
      width="100%"
      height={2}
      pointerEvents="none"
    >
      <Defs>
        <LinearGradient id="youHorizon" x1="0" y1="0" x2="1" y2="0">
          <Stop offset="0" stopColor={color.horizon} stopOpacity={0} />
          <Stop offset="0.5" stopColor={color.horizon} stopOpacity={0.9} />
          <Stop offset="1" stopColor={color.horizon} stopOpacity={0} />
        </LinearGradient>
      </Defs>
      <Rect x="0" y="0" width="100%" height={1} fill="url(#youHorizon)" />
    </Svg>
  );
}

const styles = StyleSheet.create({
  hero: { marginHorizontal: -gutter, paddingHorizontal: gutter },
  horizonLine: { position: 'absolute', left: 0, right: 0, top: HORIZON_TOP, height: 2 },
  topRow: {
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  settings: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: -space.md,
  },
  name: { marginTop: space.xl },
  meta: { flexDirection: 'row', alignItems: 'center', gap: space.md, marginTop: space.sm },
  metaPart: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  flag: { ...textStyle(glyph.md) },
  metaText: { color: color.text2 },
  vehicle: { flexShrink: 1 },
  slash: {
    width: StyleSheet.hairlineWidth * 2,
    height: 12,
    backgroundColor: alpha(color.text2, 0.4),
    transform: slant.transform,
  },
});
