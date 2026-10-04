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
  /**
   * Draw the GAPPED wordmark, which the plans call the Gapped badge. On by
   * default, so every caller that does not ask (the onboarding paywall's
   * sample) renders exactly as before. Off is Pro's clean share card, and
   * the caller decides it (shareCardBranded, src/drive/driveAccess.ts). The
   * verification chip is not the brand and stays either way.
   */
  branded?: boolean;
};

/**
 * Every Text on the card. The card is a fixed 360pt square captured as an
 * image, so its type must not follow the SHARER's Dynamic Type setting: at
 * accessibility sizes the stack outgrew the square and the export lost its
 * footer (@user, the verification note) and half its figures, unseen, since
 * the card renders off-screen. Set after the spread so nothing can turn
 * scaling back on.
 */
function CardText(props: React.ComponentProps<typeof Text>) {
  return <Text {...props} allowFontScaling={false} />;
}

function Figure({ label, value, unit, accent }: {
  label: string;
  value: string;
  unit?: string;
  accent?: boolean;
}) {
  return (
    <View style={styles.figure}>
      <CardText style={styles.figureLabel}>{label.toUpperCase()}</CardText>
      <View style={styles.figureValueRow}>
        <CardText style={[styles.figureValue, accent ? { color: color.accent } : null]}>
          {value}
        </CardText>
        {unit ? <CardText style={styles.figureUnit}>{unit}</CardText> : null}
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
  branded = true,
}: ShareCardProps) {
  const dist = distanceForDisplay(summary.distanceM, unitPref);
  const [topValue, topUnit] = formatSpeed(summary.maxSpeedMs, unitPref).split(' ');
  const verified = verification === 'verified';

  return (
    <View style={styles.card}>
      {/* Without the wordmark the chip keeps its corner rather than sliding left. */}
      <View style={branded ? styles.header : [styles.header, styles.headerClean]}>
        {branded ? <CardText style={styles.brand}>GAPPED</CardText> : null}
        {verified ? (
          <View style={styles.badge}>
            <CardText style={styles.badgeText}>✓ VERIFIED</CardText>
          </View>
        ) : (
          <View style={[styles.badge, styles.badgeMuted]}>
            <CardText style={[styles.badgeText, styles.badgeTextMuted]}>UNVERIFIED</CardText>
          </View>
        )}
      </View>

      <View style={styles.hero}>
        <CardText style={styles.heroValue}>{topValue}</CardText>
        <CardText style={styles.heroUnit}>{topUnit}</CardText>
      </View>
      <CardText style={styles.heroLabel}>TOP SPEED</CardText>

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
        <CardText style={styles.footerText} numberOfLines={1}>
          {username ? `@${username}` : 'Anonymous driver'}
          {vehicle ? ` · ${vehicle}` : ''}
        </CardText>
        <CardText style={styles.footerNote}>
          {verified
            ? 'Re-derived from raw GPS on our servers'
            : 'Not server-verified'}
        </CardText>
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
  headerClean: { justifyContent: 'flex-end' },
  brand: {
    fontFamily: font.display,
    fontSize: 18, lineHeight: 22,
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
    fontSize: 9, lineHeight: 11,
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
    fontSize: 18, lineHeight: 22,
    color: color.text2,
    paddingBottom: 12,
  },
  heroLabel: {
    fontFamily: font.bodySemibold,
    fontSize: 10, lineHeight: 12,
    letterSpacing: 1.2,
    color: color.text3,
    marginTop: -8,
  },
  route: { height: 96, justifyContent: 'center' },
  figures: { flexDirection: 'row', justifyContent: 'space-between' },
  figure: { gap: 2 },
  figureLabel: {
    fontFamily: font.bodySemibold,
    fontSize: 9, lineHeight: 11,
    letterSpacing: 0.8,
    color: color.text3,
  },
  figureValueRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 3 },
  figureValue: {
    fontFamily: font.display,
    fontSize: 24, lineHeight: 30,
    color: color.text1,
    fontVariant: ['tabular-nums'],
  },
  figureUnit: { fontFamily: font.body, fontSize: 11, lineHeight: 14, color: color.text2, paddingBottom: 3 },
  footer: { gap: 2 },
  footerText: { fontFamily: font.bodyMedium, fontSize: 12, lineHeight: 15, color: color.text2 },
  footerNote: { fontFamily: font.body, fontSize: 9, lineHeight: 11, color: color.text3 },
});
