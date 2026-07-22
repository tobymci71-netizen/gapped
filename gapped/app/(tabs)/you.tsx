import { useRouter } from 'expo-router';
import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Card } from '@/components/Card';
import { Screen } from '@/components/Screen';
import { Stat } from '@/components/Stat';
import { Text } from '@/components/Text';
import { StreakGrid } from '@/components/StreakGrid';
import { listDrives } from '@/drive/wal';
import { distanceForDisplay, formatDuration, formatSpeed } from '@/drive/units';
import { useProfile } from '@/state/profile';
import { useRecords } from '@/state/records';
import { space } from '@/theme/tokens';

export default function YouScreen() {
  const router = useRouter();
  const { username, country, vehicleMake, vehicleModel, unitPref } = useProfile();
  const { pbs, driveDays } = useRecords();
  const drives = listDrives().filter((d) => d.status === 'finalized' && d.summary);

  const totalDistanceM = drives.reduce((s, d) => s + (d.summary?.distanceM ?? 0), 0);
  const totalDurationS = drives.reduce((s, d) => s + (d.summary?.durationS ?? 0), 0);
  const topSpeedMs = drives.reduce((s, d) => Math.max(s, d.summary?.maxSpeedMs ?? 0), 0);
  const dist = distanceForDisplay(totalDistanceM, unitPref);

  return (
    <Screen>
      <Text variant="headline">{username ? `@${username}` : 'You'}</Text>
      {country || vehicleMake ? (
        <Text variant="caption" style={styles.meta}>
          {[country, vehicleMake && `${vehicleMake} ${vehicleModel ?? ''}`.trim()]
            .filter(Boolean)
            .join(' · ')}
        </Text>
      ) : null}

      <View style={styles.grid}>
        <Stat label="Total distance" value={dist.value.toFixed(1)} unit={dist.unit} />
        <Stat label="Total time" value={formatDuration(totalDurationS)} />
      </View>
      <View style={styles.grid}>
        <Stat
          label="Top speed"
          value={formatSpeed(topSpeedMs, unitPref).split(' ')[0]}
          unit={formatSpeed(topSpeedMs, unitPref).split(' ')[1]}
          accent={topSpeedMs > 0}
        />
        <Stat label="Drives" value={String(drives.length)} />
      </View>

      <Card style={styles.streakCard}>
        <StreakGrid driveDays={driveDays} />
      </Card>

      {pbs.zeroTo60S != null ? (
        <Card style={styles.pbCard}>
          <Text variant="caption">PERSONAL BEST · 0–60</Text>
          <Text variant="cardTitle">{pbs.zeroTo60S.toFixed(2)} s</Text>
        </Card>
      ) : null}

      <Pressable onPress={() => router.push('/plans')}>
        <Card style={styles.plansLink}>
          <Text variant="bodyMedium">Free vs Pro — the whole matrix, published</Text>
          <Text variant="caption">Recording and viewing your drives is free forever.</Text>
        </Card>
      </Pressable>

      <Text variant="cardTitle" style={styles.historyTitle}>
        History
      </Text>
      {drives.length === 0 ? (
        <Card style={styles.historyCard}>
          <Text variant="body">
            No drives yet. Your full history lives here — free, always. Viewing your own
            recorded drives is never paywalled.
          </Text>
        </Card>
      ) : (
        drives.map((d) => (
          <Pressable key={d.id} onPress={() => router.push(`/drive/${d.id}`)}>
            <Card style={styles.historyCard}>
              <Text variant="bodyMedium">{new Date(d.startedAt).toLocaleString()}</Text>
              <Text variant="caption">
                {distanceForDisplay(d.summary!.distanceM, unitPref).value.toFixed(1)}{' '}
                {distanceForDisplay(d.summary!.distanceM, unitPref).unit} ·{' '}
                {formatDuration(d.summary!.durationS)} · top{' '}
                {formatSpeed(d.summary!.maxSpeedMs, unitPref)}
              </Text>
            </Card>
          </Pressable>
        ))
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  meta: { marginTop: space.xs },
  grid: { flexDirection: 'row', gap: space.md, marginTop: space.md },
  streakCard: { marginTop: space.xl },
  pbCard: { marginTop: space.md, gap: space.xs },
  plansLink: { marginTop: space.xl, gap: space.xs },
  historyTitle: { marginTop: space.xl },
  historyCard: { marginTop: space.md, gap: space.xs },
});
