import React from 'react';
import { StyleSheet, View } from 'react-native';
import { Text } from '@/components/Text';
import { contributionGrid, currentStreak } from '@/state/records';
import { color, space } from '@/theme/tokens';

/**
 * Contribution-grid streak calendar (spec §B4 / Phase 1 table stakes #10) —
 * 12 weeks, GitHub-style, driven entirely from real local drive days.
 *
 * `now` is required and owned by the caller. Date.now() in the render body
 * made this non-idempotent (two renders either side of midnight drew different
 * grids); freezing it at mount fixed that and broke something worse, because
 * the You tab stays mounted for days: the grid kept ending on the day it was
 * first opened, new days never lit, and a dead streak stayed alive. The
 * screen knows when "today" should move — focus, foreground, a finished
 * drive — so it holds the clock.
 */
export function StreakGrid({ driveDays, now }: { driveDays: string[]; now: number }) {
  const days = new Set(driveDays);
  const grid = contributionGrid(days, now, 84);
  const streak = currentStreak(days, now);

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
      {/*
        Streak days live only in this device's storage — nothing reads them
        back from the server — so a reinstall starts the grid empty. The
        caption used to promise otherwise.
      */}
      <Text variant="caption">Any drive counts. Streaks are kept on this device.</Text>
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
