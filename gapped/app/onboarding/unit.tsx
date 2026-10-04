import React, { useLayoutEffect } from 'react';
import { StyleSheet, useWindowDimensions, View } from 'react-native';
import { Button } from '@/components/Button';
import { OnboardingFrame } from '@/components/OnboardingFrame';
import { Speedometer } from '@/components/Speedometer';
import { speedForDisplay } from '@/drive/units';
import { useOnboardingAdvance } from '@/onboarding/useOnboardingAdvance';
import { offerLocaleUnitDefault } from '@/onboarding/vehicle/deviceUnits';
import { UNIT_OPTIONS, UnitCard } from '@/onboarding/vehicle/UnitCard';
import { useRamp } from '@/onboarding/vehicle/useRamp';
import { useProfile } from '@/state/profile';
import { duration } from '@/theme/motion';
import { space } from '@/theme/tokens';
import { mps } from '@/types/units';

/** Demo speed shown on the preview dial, in m/s (≈ 68 mph / 109 km/h). */
const PREVIEW_MS = mps(30.4);

/** Dial ceilings per unit, matching the live drive HUD. */
const DIAL_MAX_MPH = 160;
const DIAL_MAX_KMH = 260;

/** How far through the sweep the readout starts its roll (see below). */
const READOUT_FROM = 0.85;

/**
 * Past this text scale the two cards stack: side by side, "Imperial" no longer
 * fits half the width at the larger accessibility sizes.
 */
const STACK_AT_FONT_SCALE = 1.35;

/**
 * Step 5, "Choose your speed unit" (docs/ONBOARDING.md). The app's own dial,
 * sweeping up to a demo speed as the step appears, over two cards. The
 * selected unit starts as the device's road-speed unit (./deviceUnits — mph
 * for a British phone, though CLDR calls Britain metric) and the person
 * overrides it with one tap; the dial answers at once.
 */
export default function UnitStep() {
  const advance = useOnboardingAdvance('/onboarding/unit');
  const unitPref = useProfile((s) => s.unitPref);
  const setUnitPref = useProfile((s) => s.setUnitPref);

  // Before the first paint, so the cards never show km/h for a frame and
  // then jump to mph. Once per launch: coming back to this step keeps the
  // person's own pick.
  useLayoutEffect(() => {
    offerLocaleUnitDefault();
  }, []);

  const imperial = unitPref === 'imperial';
  // Through units.ts, never inline: one conversion layer, at render.
  const preview = speedForDisplay(PREVIEW_MS, unitPref);
  // The sweep: 0 up to the demo speed on the entering curve, starting once
  // the push has mostly landed. The dial's own needle follows it, so a
  // gentle approach means the needle settles rather than overshoots. After
  // it, a unit switch moves the readout through the dial's own roll.
  const sweep = useRamp(preview.value, { durationMs: duration.slow, delayMs: duration.base });
  // The readout holds at 0 while the needle travels, then the dial is handed
  // the final value once, 85% of the way (about halfway through the
  // ease-out). Fed every frame of the sweep, the odometer restarted a roll
  // per frame in every column and showed slivers of the neighbouring digits;
  // handed one value, it rolls once and lands with the needle. The needle's
  // own spring covers only that last 15%, so its overshoot is a hair's width
  // rather than the swing a single 0-to-68 jump gives it.
  const readoutLive = sweep >= preview.value * READOUT_FROM;
  const dialValue = readoutLive ? preview.value : sweep;

  const { width, height, fontScale } = useWindowDimensions();
  const dial = Math.round(Math.min(220, width * 0.58, height * 0.28));
  const stacked = fontScale > STACK_AT_FONT_SCALE;

  return (
    <OnboardingFrame
      route="/onboarding/unit"
      title="Choose your speed unit"
      subtitle="Your speed. Your units."
      footer={<Button label="Continue" variant="light" onPress={advance} />}
    >
      <View
        style={styles.dial}
        accessible
        accessibilityRole="image"
        accessibilityLabel={`Speedometer preview, ${Math.round(preview.value)} ${preview.unit}`}
      >
        <Speedometer
          value={dialValue}
          maxValue={imperial ? DIAL_MAX_MPH : DIAL_MAX_KMH}
          unit={preview.unit}
          size={dial}
          active={readoutLive}
        />
      </View>
      <View accessibilityRole="radiogroup" style={[styles.cards, stacked && styles.cardsStacked]}>
        {UNIT_OPTIONS.map((o) => (
          <UnitCard
            key={o.key}
            option={o}
            selected={unitPref === o.key}
            onSelect={() => setUnitPref(o.key)}
            shared={!stacked}
          />
        ))}
      </View>
    </OnboardingFrame>
  );
}

const styles = StyleSheet.create({
  dial: { alignItems: 'center', marginBottom: space.sm },
  cards: { flexDirection: 'row', gap: space.md },
  cardsStacked: { flexDirection: 'column' },
});
