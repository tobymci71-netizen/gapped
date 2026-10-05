import React, { useId, useMemo } from 'react';
import { StyleSheet, View } from 'react-native';
import Svg, {
  Circle,
  Defs,
  Path,
  Pattern,
  RadialGradient,
  Rect,
  Stop,
} from 'react-native-svg';
import { GappedMark } from '@/components/brand/GappedMark';
import { Icon } from '@/components/icons';
import { Text } from '@/components/Text';
import { durationFigure } from '@/drive/summary/format';
import { projectRoute, routeFixes } from '@/drive/summary/geometry';
import { DriveSummary, Fix } from '@/drive/types';
import { distanceForDisplay, formatSpeed, UnitPref } from '@/drive/units';
import {
  alpha,
  color,
  font,
  glow,
  italicOverhang,
  radius,
  slant,
  space,
  textStyle,
  type,
} from '@/theme/tokens';

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
   * Draw the Gapped mark (the G and its red streaks), which the plans call
   * the Gapped badge. On by default, so every caller that does not ask (the
   * onboarding paywall's sample) renders exactly as before. Off is Pro's
   * clean share card, and the caller decides it (shareCardBranded,
   * src/drive/driveAccess.ts). The verification chip is not the brand and
   * stays either way.
   */
  branded?: boolean;
};

/**
 * The card's standing line. A share card is the one artefact that travels
 * without the app around it, so the reminder travels with it: on every card,
 * branded or clean, verified or not.
 */
export const SHARE_CARD_SAFETY_LINE = 'Drive within the law';

/** The card's inner width: the square less its padding. */
const INNER = SHARE_CARD_RENDER - space.xl * 2;
/** The route's band across the card. */
const ROUTE_H = 92;
/** The mark's width when branded (GappedMark keeps its aspect). */
const MARK_W = 58;

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

/** One of the three figures along the bottom, with the slanted rule before all but the first. */
function Figure({ label, value, unit, divider }: {
  label: string;
  value: string;
  unit?: string;
  divider?: boolean;
}) {
  return (
    <View style={[styles.figure, divider ? styles.figureRuled : null]}>
      {divider ? <View style={styles.rule} /> : null}
      <CardText style={styles.figureLabel}>{label}</CardText>
      <View style={styles.figureValueRow}>
        <CardText style={styles.figureValue} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.6}>
          {value}
        </CardText>
        {unit ? <CardText style={styles.figureUnit}>{unit}</CardText> : null}
      </View>
    </View>
  );
}

/**
 * The route as a red light trail across the card: a soft halo, the red line,
 * its white-hot core, and a lamp where it ends. Plain SVG strokes rather than
 * a blur filter or Skia, because the card is captured by view-shot and SVG
 * paths are what it reliably sees. North up, true to scale (projectRoute),
 * from the same accuracy-gated fixes as the summary's map (routeFixes) — a
 * subset of the trimmed route it is given, so gating never shows more of it.
 */
function CardRoute({ fixes }: { fixes: Fix[] }) {
  const route = useMemo(() => {
    const p = projectRoute(routeFixes(fixes), {
      x: 10,
      y: 10,
      width: INNER - 20,
      height: ROUTE_H - 20,
    });
    if (!p) return null;
    const d = `M${p.points.map((pt) => `${pt.x.toFixed(1)} ${pt.y.toFixed(1)}`).join(' L')}`;
    return { d, end: p.points[p.points.length - 1] };
  }, [fixes]);
  if (!route) return null;
  const stroke = { fill: 'none', strokeLinecap: 'round', strokeLinejoin: 'round' } as const;
  return (
    <Svg width={INNER} height={ROUTE_H}>
      <Path d={route.d} {...stroke} stroke={color.accent} strokeOpacity={0.1} strokeWidth={12} />
      <Path d={route.d} {...stroke} stroke={color.accent} strokeOpacity={0.22} strokeWidth={6.5} />
      <Path d={route.d} {...stroke} stroke={color.accent} strokeWidth={2.6} />
      <Path d={route.d} {...stroke} stroke={color.accentCore} strokeWidth={1.1} />
      <Circle cx={route.end.x} cy={route.end.y} r={7} fill={color.accentHot} fillOpacity={0.25} />
      <Circle cx={route.end.x} cy={route.end.y} r={2.8} fill={color.accentCore} />
    </Svg>
  );
}

/** The night behind the card: the sky's glow at the top, a fine dot texture, and the trail's red spill. */
function CardNight() {
  const id = useId().replace(/[^a-zA-Z0-9_-]/g, '');
  const s = SHARE_CARD_RENDER;
  return (
    <Svg width={s} height={s} style={StyleSheet.absoluteFill}>
      <Defs>
        <RadialGradient id={`sky${id}`} cx="0.5" cy="0" fx="0.5" fy="0" rx="1.3" ry="0.55">
          <Stop offset="0" stopColor={color.sky} stopOpacity={1} />
          <Stop offset="0.7" stopColor={color.canvas} stopOpacity={0} />
        </RadialGradient>
        <RadialGradient id={`spill${id}`} cx="0.5" cy="0.36" rx="0.55" ry="0.3">
          <Stop offset="0" stopColor={color.accent} stopOpacity={0.11} />
          <Stop offset="1" stopColor={color.accent} stopOpacity={0} />
        </RadialGradient>
        <Pattern id={`dots${id}`} width={12} height={12} patternUnits="userSpaceOnUse">
          <Circle cx={1} cy={1} r={0.7} fill={color.text1} fillOpacity={0.05} />
        </Pattern>
      </Defs>
      <Rect x={0} y={0} width={s} height={s} fill={color.canvas} />
      <Rect x={0} y={0} width={s} height={s} fill={`url(#sky${id})`} />
      <Rect x={0} y={0} width={s} height={s} fill={`url(#dots${id})`} />
      <Rect x={0} y={0} width={s} height={s} fill={`url(#spill${id})`} />
    </Svg>
  );
}

/**
 * The shareable drive card.
 *
 * Rendered off-screen and captured by view-shot — see app/drive/[id].tsx. It
 * deliberately shows the trimmed route only: the same privacy trimming that
 * applies to a ranked drive applies to a picture of one, because a screenshot
 * of your street is exactly as identifying as the coordinates behind it.
 *
 * Nightrun: the card is a still from the same night as the app — the route a
 * red light trail, the figures in the wide italic, the Gapped mark in place
 * of a wordmark when branded.
 *
 * The hero is the distance, as on the summary's number plate: the card is the
 * one picture of a drive that travels without the app, and leading it with a
 * speed would sell speed (App Store 1.4.5). Top speed is still on it, in the
 * ruled row with the others.
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
  const duration = durationFigure(summary.durationS);
  const verified = verification === 'verified';

  return (
    <View style={styles.card}>
      <CardNight />
      {/* Without the mark the chip keeps its corner rather than sliding left. */}
      <View style={branded ? styles.header : [styles.header, styles.headerClean]}>
        {branded ? <GappedMark size={MARK_W} /> : null}
        <View style={styles.chip}>
          <View style={[styles.chipPlate, verified ? styles.chipVerified : styles.chipMuted]} />
          {verified ? <Icon name="check" size={11} color={color.text1} strokeWidth={2.4} /> : null}
          <CardText style={[styles.chipText, verified ? null : styles.chipTextMuted]}>
            {verified ? 'Verified' : 'Unverified'}
          </CardText>
        </View>
      </View>

      <View style={styles.route}>
        {fixes.length > 1 ? <CardRoute fixes={fixes} /> : null}
      </View>

      <View>
        <View style={styles.heroLabelRow}>
          <View style={styles.led} />
          <CardText style={styles.heroLabel}>Distance</CardText>
        </View>
        <View style={styles.hero}>
          <CardText
            style={styles.heroValue}
            numberOfLines={1}
            adjustsFontSizeToFit
            minimumFontScale={0.6}
          >
            {dist.value.toFixed(1)}
          </CardText>
          <CardText style={styles.heroUnit}>{dist.unit}</CardText>
        </View>
      </View>

      <View style={styles.figures}>
        <Figure label="Duration" value={duration.value} unit={duration.unit} />
        <Figure label="Top speed" value={topValue} unit={topUnit} divider />
        <Figure
          label="0–60 mph"
          value={summary.zeroTo60S != null ? summary.zeroTo60S.toFixed(2) : '—'}
          unit={summary.zeroTo60S != null ? 's' : undefined}
          divider
        />
      </View>

      <View style={styles.footer}>
        <CardText style={styles.footerText} numberOfLines={1}>
          {username ? `@${username}` : 'Anonymous driver'}
          {vehicle ? ` · ${vehicle}` : ''}
        </CardText>
        <View style={styles.footerNotes}>
          <CardText style={[styles.footerNote, styles.footerNoteGrow]} numberOfLines={1}>
            {verified
              ? 'Re-derived from raw GPS on our servers'
              : 'Not server-verified'}
          </CardText>
          <CardText style={styles.footerNote}>{SHARE_CARD_SAFETY_LINE}</CardText>
        </View>
      </View>
    </View>
  );
}

const HERO = type.heroNumeral;

const styles = StyleSheet.create({
  card: {
    width: SHARE_CARD_RENDER,
    height: SHARE_CARD_RENDER,
    backgroundColor: color.canvas,
    padding: space.xl,
    justifyContent: 'space-between',
    overflow: 'hidden',
  },
  header: {
    minHeight: 32,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  headerClean: { justifyContent: 'flex-end' },
  // The verification chip: a slanted plate, the text on it upright.
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    height: 22,
    paddingHorizontal: 10,
  },
  chipPlate: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    borderRadius: radius.xs,
    borderWidth: 1,
    transform: slant.transform,
  },
  chipVerified: { backgroundColor: alpha(color.text1, 0.07), borderColor: alpha(color.text1, 0.22) },
  chipMuted: { backgroundColor: alpha(color.canvas, 0.9), borderColor: color.hairline },
  chipText: { fontFamily: font.bodySemibold, ...textStyle(type.small), color: color.text1 },
  chipTextMuted: { color: color.text2 },
  route: { height: ROUTE_H, justifyContent: 'center' },
  heroLabelRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  // A light: the one red mark beside a figure.
  led: {
    width: 16,
    height: 3,
    borderRadius: 1,
    backgroundColor: color.accent,
    transform: slant.transform,
    boxShadow: `0 0 ${glow.tight}px 1px ${alpha(color.accent, 0.8)}`,
  },
  heroLabel: { fontFamily: font.mono, ...textStyle(type.mono), color: color.text3 },
  hero: { flexDirection: 'row', alignItems: 'baseline', gap: 6, marginTop: 2 },
  heroValue: {
    fontFamily: font.displayBlack,
    ...textStyle(HERO),
    paddingRight: italicOverhang(HERO.size),
    color: color.text1,
    fontVariant: ['tabular-nums'],
    // A long drive's "1234.5" shrinks to fit rather than pushing out its unit.
    flexShrink: 1,
  },
  heroUnit: {
    fontFamily: font.display,
    ...textStyle(type.title),
    paddingRight: italicOverhang(type.title.size),
    color: color.text2,
  },
  figures: { flexDirection: 'row' },
  figure: { flex: 1, gap: 2 },
  figureRuled: { paddingLeft: 14 },
  rule: {
    position: 'absolute',
    left: 0,
    top: 2,
    bottom: 2,
    width: 1,
    backgroundColor: color.hairline,
    transform: slant.transform,
  },
  figureLabel: { fontFamily: font.mono, ...textStyle(type.monoSmall), color: color.text3 },
  figureValueRow: { flexDirection: 'row', alignItems: 'baseline', gap: 4 },
  figureValue: {
    fontFamily: font.display,
    ...textStyle(type.numeral),
    paddingRight: italicOverhang(type.numeral.size),
    color: color.text1,
    fontVariant: ['tabular-nums'],
    flexShrink: 1,
  },
  figureUnit: { fontFamily: font.body, ...textStyle(type.label), color: color.text2 },
  footer: { gap: 2 },
  footerText: { fontFamily: font.bodyMedium, ...textStyle(type.label), color: color.text2 },
  footerNotes: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  footerNoteGrow: { flex: 1 },
  footerNote: { fontFamily: font.body, ...textStyle(type.tiny), color: color.text3 },
});
