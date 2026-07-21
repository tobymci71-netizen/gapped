import React from 'react';
import { StyleSheet } from 'react-native';
import { Card } from '@/components/Card';
import { Screen } from '@/components/Screen';
import { Text } from '@/components/Text';
import { useProfile } from '@/state/profile';
import { space } from '@/theme/tokens';

export default function GarageScreen() {
  const { vehicleKind, vehicleMake, vehicleModel } = useProfile();

  return (
    <Screen>
      <Text variant="headline">Garage</Text>
      {vehicleMake && vehicleModel ? (
        <Card style={styles.card}>
          <Text variant="cardTitle">
            {vehicleMake} {vehicleModel}
          </Text>
          <Text variant="caption">
            Primary vehicle{vehicleKind === 'motorbike' ? ' · Motorbike' : ''}
          </Text>
        </Card>
      ) : (
        <Card style={styles.card}>
          <Text variant="cardTitle">No vehicles yet</Text>
          <Text variant="body">Add your ride during onboarding, or here once editing ships.</Text>
        </Card>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  card: { marginTop: space.xl, gap: space.xs },
});
