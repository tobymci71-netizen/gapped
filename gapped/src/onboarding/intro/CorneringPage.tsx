import React, { useCallback, useEffect, useRef, useState } from 'react';
import { type LayoutChangeEvent, StyleSheet, View } from 'react-native';
import {
  cancelAnimation,
  Easing,
  type SharedValue,
  useAnimatedReaction,
  useDerivedValue,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import Svg, { Path } from 'react-native-svg';
import { scheduleOnRN } from 'react-native-worklets';
import { Numeral, Text } from '@/components/Text';
import { useReducedMotion } from '@/lib/useReducedMotion';
import { color, font, gutter, space, type } from '@/theme/tokens';
import { CorneringGauge } from './CorneringGauge';
import { IntroPage } from './IntroPage';
import {
  CORNERING_DEMO_LABEL,
  CORNERING_DEMO_MS,
  CORNERING_LEFT_PEAK_G,
  CORNERING_START_G,
  corneringG,
  formatG,
  gHundredths,
  type IntroPageCopy,
  rightPeakG,
} from './introTimeline';

/**
 * The demo's one curve. Ease-in-out, as the reference: the load builds into
 * the corner and settles at its peak. The motion tokens are all ease-out
 * (things arriving); this is a measurement rising and levelling, so it gets
 * its own curve, named here once.
 */
const DEMO_EASING = Easing.inOut(Easing.cubic);

/**
 * Dynamic Type cap for the readouts. They are an instrument's figures, sized
 * to the gauge; uncapped, "0.94" at the largest text size is wider than the
 * screen. Their units cap with them so the pair keeps its proportion. The
 * words around them (the label, Left, Right) scale freely.
 */
const FIGURE_MAX_SCALE = 1.5;

type Props = {
  copy: IntroPageCopy;
  width: number;
  hidden: boolean;
  /** Passed to IntroPage: a vertical drag began here. */
  onVerticalDrag?: () => void;
  /** The page most in view: the demo plays. */
  active: boolean;
  /** Any of the page on screen. Fully off it, the demo rewinds unseen. */
  onScreen: boolean;
};

/**
 * Page 3, "See more in every drive.": the cornering G demo.
 *
 * One ~2 s ease-in-out timeline drives everything that moves: the hero number
 * counts 0.12 g → 0.94 g, the marker swings right over the green-to-red arc,
 * the car rolls a few degrees, and the right-hand peak climbs with it. It
 * plays when the page comes into view and holds its end pose. Leave the page
 * entirely and it rewinds out of sight, so it plays again on the way back.
 *
 * The numbers are a demo and VoiceOver says so: the block is one image whose
 * label starts "Gapped Pro demo". Reduced motion: the end pose, no count.
 *
 * Cornering G is Pro (PLAN_MATRIX 'advancedTelemetry'), so this page's copy
 * carries `proFeature` and IntroPage puts the PRO chip over the title. The
 * demo is unchanged: it shows what Pro measures, and says whose it is.
 */
export function CorneringPage({
  copy,
  width,
  hidden,
  active,
  onScreen,
  onVerticalDrag,
}: Props) {
  const reduced = useReducedMotion();
  const progress = useSharedValue(0);
  const gaugeView = useGaugeInView();

  // Plays once the page is the one in view AND the gauge is on screen. At
  // ordinary text sizes the second is true the moment the page lays out; at
  // the largest the copy pushes the gauge below the fold, and the demo waits
  // for the person to scroll to it rather than finishing out of sight.
  //
  // Reduced motion is the end pose, always: not rewound off screen and not
  // waiting to be active, or the page would slide in at 0.12 g and then jump.
  useEffect(() => {
    if (reduced) {
      cancelAnimation(progress);
      progress.value = 1;
      return;
    }
    if (!onScreen) {
      cancelAnimation(progress);
      progress.value = 0;
      return;
    }
    if (!active || !gaugeView.inView) return;
    progress.value = withTiming(1, { duration: CORNERING_DEMO_MS, easing: DEMO_EASING });
  }, [active, onScreen, gaugeView.inView, reduced, progress]);

  const g = useDerivedValue(() => corneringG(progress.value));
  const rightPeak = useDerivedValue(() => rightPeakG(progress.value));

  const contentWidth = width - gutter * 2;

  return (
    <IntroPage
      copy={copy}
      width={width}
      hidden={hidden}
      onVerticalDrag={onVerticalDrag}
      onViewport={gaugeView.onViewport}
      headingFirst
    >
      <View
        accessible
        accessibilityRole="image"
        accessibilityLabel={CORNERING_DEMO_LABEL}
        onLayout={gaugeView.onBlockLayout}
      >
        <View style={styles.metricRow}>
          <CorneringGlyph />
          <Text variant="caption" style={styles.metricLabel}>
            Cornering G
          </Text>
        </View>

        <View style={styles.hero}>
          <LiveG value={g} size={type.heroNumeral.size} />
          <Text
            variant="cardTitle"
            style={styles.heroUnit}
            maxFontSizeMultiplier={FIGURE_MAX_SCALE}
          >
            g
          </Text>
        </View>

        <View onLayout={gaugeView.onGaugeLayout}>
          {/* Keyed on each arrival in view: see useGaugeInView. */}
          <CorneringGauge key={gaugeView.paintKey} width={contentWidth} g={g} />
        </View>

        <View style={styles.peaks}>
          <Text variant="caption">Peak cornering G</Text>
          <View style={styles.peakRow}>
            <View style={styles.peak}>
              <View style={styles.peakValue}>
                <Numeral size={type.headline.size} maxFontSizeMultiplier={FIGURE_MAX_SCALE}>
                  {formatG(gHundredths(CORNERING_LEFT_PEAK_G))}
                </Numeral>
                <PeakUnit />
              </View>
              <Text variant="legal">Left</Text>
            </View>
            <View style={styles.peakRule} />
            <View style={[styles.peak, styles.peakRight]}>
              <View style={styles.peakValue}>
                <LiveG value={rightPeak} size={type.headline.size} />
                <PeakUnit />
              </View>
              <Text variant="legal">Right</Text>
            </View>
          </View>
        </View>
      </View>
    </IntroPage>
  );
}

/**
 * Whether the gauge's centre is inside the page's visible window, from the
 * page's scroll position and the gauge's layout. The block is a direct child
 * of the page's scroll content and the gauge a child of the block, so their
 * two layout offsets add up to the gauge's place in the content.
 *
 * `paintKey` changes each time the gauge comes back into view, remounting its
 * canvas. A Skia canvas that animates while scrolled out of sight was seen
 * (on a simulator, at the largest text size) to keep showing an early frame
 * once scrolled back, with the readouts beside it at the final value; nothing
 * redrew it, because nothing was changing any more. A fresh canvas draws the
 * pose as it is now. At ordinary text sizes the gauge is in view from the
 * first layout and is mounted once.
 */
function useGaugeInView() {
  const box = useRef({ blockY: 0, gaugeY: 0, gaugeH: 0, measured: false });
  const viewport = useRef({ top: 0, height: 0 });
  const wasInView = useRef(false);
  const [inView, setInView] = useState(false);
  const [paintKey, setPaintKey] = useState(0);

  const check = useCallback(() => {
    const b = box.current;
    const v = viewport.current;
    if (!b.measured || v.height <= 0) return;
    const mid = b.blockY + b.gaugeY + b.gaugeH / 2;
    const now = mid >= v.top && mid <= v.top + v.height;
    if (now && !wasInView.current) setPaintKey((k) => k + 1);
    wasInView.current = now;
    setInView(now);
  }, []);

  return {
    inView,
    paintKey,
    onViewport: useCallback(
      (top: number, height: number) => {
        viewport.current = { top, height };
        check();
      },
      [check],
    ),
    onBlockLayout: useCallback(
      (e: LayoutChangeEvent) => {
        box.current.blockY = e.nativeEvent.layout.y;
        check();
      },
      [check],
    ),
    onGaugeLayout: useCallback(
      (e: LayoutChangeEvent) => {
        box.current.gaugeY = e.nativeEvent.layout.y;
        box.current.gaugeH = e.nativeEvent.layout.height;
        box.current.measured = true;
        check();
      },
      [check],
    ),
  };
}

/**
 * A g readout that follows a UI-thread value. The UI thread hands over a new
 * number only when the hundredths change, so the count is exact and the JS
 * thread renders ~80 times across the demo rather than every frame.
 */
function LiveG({ value, size }: { value: SharedValue<number>; size: number }) {
  const [hundredths, setHundredths] = useState(() => gHundredths(CORNERING_START_G));
  useAnimatedReaction(
    () => gHundredths(value.value),
    (now, before) => {
      if (now !== before) scheduleOnRN(setHundredths, now);
    },
  );
  return (
    <Numeral size={size} maxFontSizeMultiplier={FIGURE_MAX_SCALE}>
      {formatG(hundredths)}
    </Numeral>
  );
}

/** The "g" after a peak figure, capped with it. */
function PeakUnit() {
  return (
    <Text variant="body" style={styles.peakUnit} maxFontSizeMultiplier={FIGURE_MAX_SCALE}>
      g
    </Text>
  );
}

/** A small lime curve with an arrowhead: a corner, taken to the right. */
function CorneringGlyph() {
  return (
    <Svg width={16} height={16} viewBox="0 0 16 16">
      <Path
        d="M3 14.5V9.5a6 6 0 0 1 6-6h4.5M10.5 0.75 13.5 3.5l-3 2.75"
        stroke={color.accent}
        strokeWidth={1.75}
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
    </Svg>
  );
}

const styles = StyleSheet.create({
  metricRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  metricLabel: { fontFamily: font.bodyMedium, color: color.text1 },
  hero: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'center',
    gap: space.xs,
    marginTop: space.xs,
  },
  heroUnit: { color: color.text2 },
  peaks: {
    marginTop: space.lg,
    paddingTop: space.md,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: color.hairline,
    gap: space.xs,
  },
  peakRow: { flexDirection: 'row', alignItems: 'stretch' },
  peak: { flex: 1 },
  peakRight: { alignItems: 'flex-end' },
  peakValue: { flexDirection: 'row', alignItems: 'baseline', gap: space.xs },
  peakUnit: { color: color.text2 },
  peakRule: { width: StyleSheet.hairlineWidth, backgroundColor: color.hairline },
});
