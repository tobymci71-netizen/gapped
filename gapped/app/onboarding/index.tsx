import { useRouter } from 'expo-router';
import React from 'react';
import { StyleSheet, View } from 'react-native';
import { Button } from '@/components/Button';
import { Screen } from '@/components/Screen';
import { Numeral, Text } from '@/components/Text';
import { color, space } from '@/theme/tokens';

export default function Welcome() {
  const router = useRouter();
  return (
    <Screen
      scroll={false}
      footer={<Button label="Get started" onPress={() => router.push('/onboarding/unit')} />}
    >
      <View style={styles.center}>
        <Numeral size={64} color={color.accent}>
          GAPPED
        </Numeral>
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
  center: { flex: 1, justifyContent: 'center', gap: space.lg },
  headline: { marginTop: space.xl },
  sub: {},
});
