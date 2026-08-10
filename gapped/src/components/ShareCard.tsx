import React from 'react';
import { StyleSheet, View } from 'react-native';
import { RoutePath } from '@/components/RoutePath';
import { Text } from '@/components/Text';
import { DriveSummary, Fix } from '@/drive/types';
import { distanceForDisplay, formatDuration, formatSpeed, UnitPref } from '@/drive/units';
import { color, font, radius, space } from '@/theme/tokens';

/** Square, so it lands unpadded on both a feed post and a story. */
export const SHARE_CARD_SIZE = 1080;
/** Rendered at a legible on-screen size, captured at 3× for a 1080px export. */
export const SHARE_CARD_RENDER = 360;
export const SHARE_CARD_SCALE = SHARE_CARD_SIZE / SHARE_CARD_RENDER;

export type ShareCardProps = {
  summary: DriveSummary;
  fixes: Fix[];
  unitPref: UnitPref;
  username: string | null;
  vehicle: string | null;
  /**
   * Server verification state. 'verified' earns the badge; nothing else does.
   * A share card is the one artefact that leaves the app and gets believed on
   * sight, so an unverified run must never wear a mark that implies otherwise.
   */
  verification: 'verified' | 'unverified' | 'pending' | null;
};

function Figure({ label, value, unit, accent }: {
  label: string;
  value: string;
  unit?: string;
  accent?: boolean;
}) {
  return (
    <View style={styles.figure}>
      <Text style={styles.figureLabel}>{label.toUpperCase()}</Text>
      <View style={styles.figureValueRow}>
        <Text style={[styles.figureValue, accent ? { color: color.accent } : null]}>{value}</Text>
        {unit ? <Text style={styles.figureUnit}>{unit}</Text> : null}
      </View>
    </View>
  );
}

/**
 * The shareable drive card.
 *
 * Rendered off-screen and captured by view-shot — see app/drive/[id].tsx. It
 * deliberately shows the trimmed route only: the same privacy trimming that
 * applies to a ranked drive applies to a picture of one, because a screenshot
 * of your street is exactly as identifying as the coordinates behind it.
 */
export function ShareCard({
  summary,
  fixes,
  unitPref,
  username,
  vehicle,
  verification,
}: ShareCardProps) {
  const dist = distanceForDisplay(summary.distanceM, unitPref);
  const [topValue, topUnit] = formatSpeed(summary.maxSpeedMs, unitPref).split(' ');
  const verified = verification === 'verified';

  return (
    <View style={styles.card}>
      <View style={styles.header}>
        <Text style={styles.brand}>GAPPED</Text>
        {verified ? (
          <View style={styles.badge}>
            <Text style={styles.badgeText}>✓ VERIFIED</Text>
          </View>
        ) : (
          <View style={[styles.badge, styles.badgeMuted]}>
            <Text style={[styles.badgeText, styles.badgeTextMuted]}>UNVERIFIED</Text>
          </View>
        )}
      </View>

      <View style={styles.hero}>
        <Text style={styles.heroValue}>{topValue}</Text>
        <Text style={styles.heroUnit}>{topUnit}</Text>
      </View>
      <Text style={styles.heroLabel}>TOP SPEED</Text>

      <View style={styles.route}>
        {fixes.length > 1 ? (
          <RoutePath
            fixes={fixes}
            width={SHARE_CARD_RENDER - space.xl * 2}
            height={96}
            animate={false}
          />
        ) : null}
      </View>

      <View style={styles.figures}>
        <Figure label="Distance" value={dist.value.toFixed(1)} unit={dist.unit} />
        <Figure label="Duration" value={formatDuration(summary.durationS)} />
        <Figure
          label="0–60 mph"
          value={summary.zeroTo60S != null ? summary.zeroTo60S.toFixed(2) : '—'}
          unit={summary.zeroTo60S != null ? 's' : undefined}
          accent={summary.zeroTo60S != null}
        />
      </View>

      <View style={styles.footer}>
        <Text style={styles.footerText} numberOfLines={1}>
          {username ? `@${username}` : 'Anonymous driver'}
          {vehicle ? ` · ${vehicle}` : ''}
        </Text>
        <Text style={styles.footerNote}>
          {verified
            ? 'Re-derived from raw GPS on our servers'
            : 'Not server-verified'}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    width: SHARE_CARD_RENDER,
    height: SHARE_CARD_RENDER,
    backgroundColor: color.canvas,
    padding: space.xl,
    justifyContent: 'space-between',
  },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  brand: {
    fontFamily: font.display,
    fontSize: 18,
    letterSpacing: 1.5,
    color: color.accent,
  },
  badge: {
    backgroundColor: color.accent,
    borderRadius: radius.pill,
    paddingHorizontal: space.md,
    paddingVertical: 3,
  },
  badgeMuted: { backgroundColor: 'transparent', borderWidth: 1, borderColor: color.text3 },
  badgeText: {
    fontFamily: font.bodySemibold,
    fontSize: 9,
    letterSpacing: 0.8,
    color: color.onAccent,
  },
  badgeTextMuted: { color: color.text3 },
  hero: { flexDirection: 'row', alignItems: 'flex-end', gap: 6 },
  heroValue: {
    fontFamily: font.display,
    fontSize: 76,
    lineHeight: 80,
    color: color.text1,
    fontVariant: ['tabular-nums'],
  },
  heroUnit: {
    fontFamily: font.bodyMedium,
    fontSize: 18,
    color: color.text2,
    paddingBottom: 12,
  },
  heroLabel: {
    fontFamily: font.bodySemibold,
    fontSize: 10,
    letterSpacing: 1.2,
    color: color.text3,
    marginTop: -8,
  },
  route: { height: 96, justifyContent: 'center' },
  figures: { flexDirection: 'row', justifyContent: 'space-between' },
  figure: { gap: 2 },
  figureLabel: {
    fontFamily: font.bodySemibold,
    fontSize: 9,
    letterSpacing: 0.8,
    color: color.text3,
  },
  figureValueRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 3 },
  figureValue: {
    fontFamily: font.display,
    fontSize: 24,
    color: color.text1,
    fontVariant: ['tabular-nums'],
  },
  figureUnit: { fontFamily: font.body, fontSize: 11, color: color.text2, paddingBottom: 3 },
  footer: { gap: 2 },
  footerText: { fontFamily: font.bodyMedium, fontSize: 12, color: color.text2 },
  footerNote: { fontFamily: font.body, fontSize: 9, color: color.text3 },
});
