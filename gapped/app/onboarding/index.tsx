import { useRouter } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Button } from '@/components/Button';
import { Screen } from '@/components/Screen';
import { speedForDisplay } from '@/drive/units';
import { useProfile } from '@/state/profile';
import { Speedometer } from '@/components/Speedometer';
import { Numeral, Text } from '@/components/Text';
import { color, space } from '@/theme/tokens';

/**
 * Welcome hero — the live dial IS the pitch (TripRank leads with the same
 * object; ours is the real component, not an illustration). The dial sweeps
 * up to a demo speed on mount.
 */
export default function Welcome() {
  const router = useRouter();
  const unitPref = useProfile((s) => s.unitPref);
  const imperial = unitPref === 'imperial';
  const [demoSpeed, setDemoSpeed] = useState(0);
  // Through units.ts: the very first dial the user sees must already obey the
  // stored preference, which defaults to metric.
  const demo = speedForDisplay(demoSpeed, unitPref);

  useEffect(() => {
    const t = setTimeout(() => setDemoSpeed(87), 600);
    return () => clearTimeout(t);
  }, []);

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
            size={280}
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
