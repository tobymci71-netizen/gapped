import React from 'react';
import { StyleSheet, View } from 'react-native';
import { Card } from '@/components/Card';
import { Screen } from '@/components/Screen';
import { Text } from '@/components/Text';
import { color, space } from '@/theme/tokens';

export default function BoardScreen() {
  return (
    <Screen>
      <Text variant="headline">Board</Text>
      <Card style={styles.empty}>
        <View style={styles.badge}>
          <Text variant="caption" style={styles.badgeText}>
            VERIFIED
          </Text>
        </View>
        <Text variant="cardTitle">No runs yet</Text>
        <Text variant="body">
          Leaderboards arrive in Phase 4 — verified and unverified tiers, bracketed by vehicle
          class. Record a drive first; your runs will be here.
        </Text>
      </Card>
    </Screen>
  );
}

const styles = StyleSheet.create({
  empty: { marginTop: space.xl, gap: space.sm },
  badge: {
    alignSelf: 'flex-start',
    borderWidth: 1,
    borderColor: color.verified,
    borderRadius: 6,
    paddingHorizontal: space.sm,
    paddingVertical: 2,
  },
  badgeText: { color: color.verified, fontSize: 11, letterSpacing: 1 },
});
