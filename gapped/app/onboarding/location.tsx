import { useRouter } from 'expo-router';
import React, { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Button } from '@/components/Button';
import { OnboardingStep } from '@/components/OnboardingStep';
import { Text } from '@/components/Text';
import { useDriveStore } from '@/drive/recorder';
import { color, space } from '@/theme/tokens';

/**
 * Permission priming: always explain BEFORE triggering the OS dialog
 * (spec Phase 8). Honest framing — background access is what makes
 * background recording possible; without it we track foreground-only.
 */
export default function LocationStep() {
  const router = useRouter();
  const requestPermissions = useDriveStore((s) => s.requestPermissions);
  const [denied, setDenied] = useState(false);

  const ask = async () => {
    const granted = await requestPermissions();
    if (granted) {
      router.push('/onboarding/vehicle-type');
    } else {
      setDenied(true);
    }
  };

  return (
    <OnboardingStep
      step={3}
      title="Location access"
      subtitle={
        'Gapped records your drives from GPS. "Always" access lets a drive keep recording with the screen off or the app in the background — without it we can only track while the app is open.'
      }
      footer={<Button label="Enable location" onPress={ask} />}
    >
      {/* Icon tile priming beat (the video leads the ask with a big glyph). */}
      <View style={styles.tileWrap}>
        <View style={styles.tile}>
          <Text style={styles.tileGlyph}>➤</Text>
        </View>
      </View>
      {denied ? (
        <>
          <Text variant="body">
            Location was declined. You can still continue and grant it later from Settings —
            recording won&apos;t work until you do.
          </Text>
          <Button
            label="Continue without location"
            variant="secondary"
            onPress={() => router.push('/onboarding/vehicle-type')}
          />
        </>
      ) : null}
    </OnboardingStep>
  );
}

const styles = StyleSheet.create({
  tileWrap: { alignItems: 'center', marginTop: space.xl },
  tile: {
    width: 120,
    height: 120,
    borderRadius: 30,
    backgroundColor: '#1E260A', // 10% acid over black — mirrors the tinted tile beat
    alignItems: 'center',
    justifyContent: 'center',
  },
  tileGlyph: {
    color: color.accent,
    fontSize: 52,
    transform: [{ rotate: '-45deg' }],
  },
});
