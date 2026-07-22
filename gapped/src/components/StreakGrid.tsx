import React from 'react';
import { StyleSheet, View } from 'react-native';
import { Text } from '@/components/Text';
import { contributionGrid, currentStreak } from '@/state/records';
import { color, space } from '@/theme/tokens';

/**
 * Contribution-grid streak calendar (spec §B4 / Phase 1 table stakes #10) —
 * 12 weeks, GitHub-style, driven entirely from real local drive days.
 */
export function StreakGrid({ driveDays, now }: { driveDays: string[]; now?: number }) {
  const t = now ?? Date.now();
  const days = new Set(driveDays);
  const grid = contributionGrid(days, t, 84);
  const streak = currentStreak(days, t);

  // 12 columns of 7 (weeks), oldest first.
  const weeks: (typeof grid)[] = [];
  for (let w = 0; w < 12; w++) weeks.push(grid.slice(w * 7, w * 7 + 7));

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text variant="cardTitle">Streak</Text>
        <Text variant="bodyMedium" style={{ color: streak > 0 ? color.accent : color.text3 }}>
          {streak} day{streak === 1 ? '' : 's'}
        </Text>
      </View>
      <View style={styles.grid}>
        {weeks.map((week, wi) => (
          <View key={wi} style={styles.week}>
            {week.map((d) => (
              <View
                key={d.key}
                style={[
                  styles.cell,
                  { backgroundColor: d.drove ? color.accent : color.surface2 },
                ]}
              />
            ))}
          </View>
        ))}
      </View>
      <Text variant="caption">Any drive counts. Streaks survive reinstalls once synced.</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: space.md },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' },
  grid: { flexDirection: 'row', gap: 4 },
  week: { gap: 4 },
  cell: { width: 16, height: 16, borderRadius: 4 },
});
