import { useRouter } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { StyleSheet, useWindowDimensions, View } from 'react-native';
import { Button } from '@/components/Button';
import { Screen } from '@/components/Screen';
import { speedForDisplay } from '@/drive/units';
import { useReducedMotion } from '@/lib/useReducedMotion';
import { duration } from '@/theme/motion';
import { useProfile } from '@/state/profile';
import { Speedometer } from '@/components/Speedometer';
import { Numeral, Text } from '@/components/Text';
import { color, space } from '@/theme/tokens';

/**
 * Welcome hero — the live dial IS the pitch (TripRank leads with the same
 * object; ours is the real component, not an illustration). The dial sweeps
 * up to a demo speed on mount.
 */
/** Demo speed the hero dial sweeps to, m/s (≈ 87 mph / 140 km/h). */
const DEMO_MS = 38.9;

export default function Welcome() {
  const router = useRouter();
  const reduced = useReducedMotion();
  const unitPref = useProfile((s) => s.unitPref);
  const imperial = unitPref === 'imperial';
  const [demoSpeed, setDemoSpeed] = useState(0);
  // demoSpeed is SI (m/s) like every other speed in the app, so speedForDisplay
  // can convert it. It used to be 87 in *display* units, which passed through
  // the metric branch as 87 m/s and put 313 km/h on the first screen.
  const demo = speedForDisplay(demoSpeed, unitPref);

  // The dial sizes to the viewport: a fixed 280 overflowed the non-scrolling
  // hero on a 667pt device, so the bottom of the pitch went under the footer.
  const { width, height } = useWindowDimensions();
  const dial = Math.min(280, Math.round(width * 0.62), Math.round(height * 0.34));

  useEffect(() => {
    // Reduced motion gets the value immediately — the sweep IS the animation.
    if (reduced) {
      setDemoSpeed(DEMO_MS);
      return;
    }
    const t = setTimeout(() => setDemoSpeed(DEMO_MS), duration.slow);
    return () => clearTimeout(t);
  }, [reduced]);

  return (
    <Screen
      scroll={false}
      footer={<Button label="Get started" onPress={() => router.push('/onboarding/unit')} />}
    >
      <View style={styles.center}>
        <Numeral size={44} color={color.accent}>
          GAPPED
        </Numeral>
        <View style={styles.dial}>
          <Speedometer
            value={demo.value}
            maxValue={imperial ? 160 : 260}
            unit={demo.unit}
            size={dial}
            active
          />
        </View>
        <Text variant="headline" style={styles.headline}>
          The board you can believe.
        </Text>
        <Text variant="body" style={styles.sub}>
          Every run on the Verified board is checked — attested device, real sensors,
          server-recomputed. No spoofed GPS, no typed-in numbers.
        </Text>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  dial: { marginVertical: space.lg },
  headline: { alignSelf: 'stretch' },
  sub: { alignSelf: 'stretch', marginTop: space.md },
});
