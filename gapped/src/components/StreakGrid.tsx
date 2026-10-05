import React from 'react';
import { StyleSheet, View } from 'react-native';
import { Text } from '@/components/Text';
import { contributionGrid, currentStreak } from '@/state/records';
import { alpha, color, radius, space } from '@/theme/tokens';

const WEEKS = 12;
const DAYS = WEEKS * 7;

/**
 * Contribution-grid streak calendar (spec §B4 / Phase 1 table stakes #10) —
 * 12 weeks, GitHub-style, driven entirely from real local drive days.
 *
 * Nightrun: the night is a field of dark cells and a day you drove is a lit
 * tail-light lens in it — a deep-red lens, a hot filament, a small halo, the
 * car's own lamps in miniature. The lights glow because they are lights;
 * nothing else here does. Today's cell carries a white edge so the grid reads
 * from a fixed point. Open on the night, not boxed in a card.
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
  const grid = contributionGrid(days, now, DAYS);
  const streak = currentStreak(days, now);
  const driven = grid.filter((d) => d.drove).length;
  const todayKey = grid[grid.length - 1]?.key;

  // 12 columns of 7 (weeks), oldest first.
  const weeks: (typeof grid)[] = [];
  for (let w = 0; w < WEEKS; w++) weeks.push(grid.slice(w * 7, w * 7 + 7));

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text variant="title" accessibilityRole="header">
          Streak
        </Text>
        {/* White, not red: the lit cells are the lights; a count is not. */}
        <Text
          variant="mono"
          style={{ color: streak > 0 ? color.text1 : color.text3 }}
          // "2 days" alone, after the heading, does not say what it counts.
          accessibilityLabel={`Current streak, ${streak} day${streak === 1 ? '' : 's'}`}
        >
          {streak} day{streak === 1 ? '' : 's'}
        </Text>
      </View>
      {/* One element to VoiceOver: 84 unlabelled squares say nothing. */}
      <View
        style={styles.grid}
        accessible
        accessibilityRole="image"
        accessibilityLabel={`Drove on ${driven} of the last ${DAYS} days`}
      >
        {weeks.map((week, wi) => (
          <View key={wi} style={styles.week}>
            {week.map((d) => (
              <View
                key={d.key}
                style={[
                  styles.cell,
                  d.drove ? styles.lit : styles.off,
                  d.key === todayKey ? styles.today : null,
                ]}
              >
                {d.drove ? <View style={styles.filament} /> : null}
              </View>
            ))}
          </View>
        ))}
      </View>
      <View
        style={styles.axis}
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
      >
        <Text variant="monoSmall">{WEEKS} weeks ago</Text>
        <Text variant="monoSmall">Today</Text>
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
  header: {
    minHeight: 44,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  grid: { flexDirection: 'row', gap: 4 },
  week: { flex: 1, gap: 4 },
  // A little wider than tall, like a lamp segment; it also keeps 12 weeks of
  // grid to a sensible height on a phone.
  cell: { aspectRatio: 1.3, borderRadius: radius.xs, borderWidth: StyleSheet.hairlineWidth * 2 },
  off: { backgroundColor: color.surface1, borderColor: color.divider },
  // A lens: deep red, its bright rim, and the halo a lit lamp throws.
  lit: {
    backgroundColor: color.accentFill,
    borderColor: color.accent,
    boxShadow: `0 0 6px 0 ${alpha(color.accent, 0.55)}`,
  },
  // The filament: the white-hot core across the lens.
  filament: {
    position: 'absolute',
    left: '22%',
    right: '22%',
    top: '35%',
    height: 2,
    borderRadius: 1,
    backgroundColor: alpha(color.accentCore, 0.8),
  },
  today: { borderWidth: 1, borderColor: color.text1 },
  axis: { flexDirection: 'row', justifyContent: 'space-between', marginTop: -space.xs },
});
