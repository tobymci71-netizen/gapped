import { useLocalSearchParams, useRouter } from 'expo-router';
import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import React, { useMemo } from 'react';
import { StyleSheet, View } from 'react-native';
import { Button } from '@/components/Button';
import { Card } from '@/components/Card';
import { Screen } from '@/components/Screen';
import { Stat } from '@/components/Stat';
import { Text } from '@/components/Text';
import { toCsv, toGpx } from '@/drive/export';
import { checkPlausibility } from '@/drive/plausibility';
import { distanceForDisplay, formatDuration, formatSpeed } from '@/drive/units';
import { listDrives, readFixes } from '@/drive/wal';
import { useProfile } from '@/state/profile';
import { color, space } from '@/theme/tokens';

export default function DriveDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const unitPref = useProfile((s) => s.unitPref);

  const drive = useMemo(() => listDrives().find((d) => d.id === id), [id]);
  const fixes = useMemo(() => (id ? readFixes(id) : []), [id]);
  const plausibility = useMemo(
    () => (fixes.length > 1 ? checkPlausibility(fixes) : null),
    [fixes],
  );

  if (!drive || !drive.summary) {
    return (
      <Screen footer={<Button label="Back" variant="secondary" onPress={() => router.back()} />}>
        <Text variant="headline">Drive not found</Text>
      </Screen>
    );
  }

  const s = drive.summary;
  const dist = distanceForDisplay(s.distanceM, unitPref);
  const stamp = new Date(drive.startedAt).toISOString().slice(0, 16).replace(':', '');

  const shareFile = async (kind: 'gpx' | 'csv') => {
    const content =
      kind === 'gpx' ? toGpx(fixes, `Gapped drive ${stamp}`) : toCsv(fixes);
    const file = new File(Paths.cache, `gapped-${stamp}.${kind}`);
    if (file.exists) file.delete();
    file.create();
    file.write(content);
    if (await Sharing.isAvailableAsync()) {
      await Sharing.shareAsync(file.uri, {
        mimeType: kind === 'gpx' ? 'application/gpx+xml' : 'text/csv',
      });
    }
  };

  return (
    <Screen footer={<Button label="Back" variant="secondary" onPress={() => router.back()} />}>
      <Text variant="headline">{new Date(drive.startedAt).toLocaleString()}</Text>

      <View style={styles.grid}>
        <Stat label="Distance" value={dist.value.toFixed(1)} unit={dist.unit} />
        <Stat label="Duration" value={formatDuration(s.durationS)} />
      </View>
      <View style={styles.grid}>
        <Stat
          label="Top speed"
          value={formatSpeed(s.maxSpeedMs, unitPref).split(' ')[0]}
          unit={formatSpeed(s.maxSpeedMs, unitPref).split(' ')[1]}
          accent
        />
        <Stat
          label="Avg speed"
          value={formatSpeed(s.avgSpeedMs, unitPref).split(' ')[0]}
          unit={formatSpeed(s.avgSpeedMs, unitPref).split(' ')[1]}
        />
      </View>
      <View style={styles.grid}>
        <Stat label="Peak G" value={s.maxG != null ? s.maxG.toFixed(2) : '—'} unit={s.maxG != null ? 'g' : undefined} />
        <Stat
          label="0–60"
          value={s.zeroTo60S != null ? s.zeroTo60S.toFixed(2) : '—'}
          unit={s.zeroTo60S != null ? 's' : undefined}
        />
      </View>
      {s.zeroTo60S == null ? (
        <Text variant="caption" style={styles.note}>
          0–60 shows only when a clean standstill launch was detected — we never estimate.
        </Text>
      ) : (
        <Text variant="caption" style={styles.note}>
          1-foot rollout, interpolated crossing. Methodology is published — check us.
        </Text>
      )}

      {plausibility ? (
        <Card style={styles.plausibility}>
          <Text variant="cardTitle">
            {plausibility.verdict === 'plausible' ? 'Passes local checks' : 'Failed local checks'}
          </Text>
          {plausibility.checks.map((c) => (
            <View key={c.check} style={styles.checkRow}>
              <Text style={{ color: c.pass ? color.success : color.danger }}>
                {c.pass ? '✓' : '✕'}
              </Text>
              <Text variant="caption" style={styles.checkDetail}>
                {c.detail}
              </Text>
            </View>
          ))}
          <Text variant="legal">
            Final verification is server-side, recomputed from the raw trace. Unverified is not
            an accusation — it means a check could not pass yet.
          </Text>
        </Card>
      ) : null}

      <View style={styles.exportRow}>
        <Button label="Export GPX" variant="secondary" style={styles.exportBtn} onPress={() => shareFile('gpx')} />
        <Button label="Export CSV" variant="secondary" style={styles.exportBtn} onPress={() => shareFile('csv')} />
      </View>
      <Text variant="legal" style={styles.note}>
        Your data is yours — full-resolution export, free, always.
      </Text>
    </Screen>
  );
}

const styles = StyleSheet.create({
  grid: { flexDirection: 'row', gap: space.md, marginTop: space.md },
  note: { marginTop: space.sm },
  plausibility: { marginTop: space.xl, gap: space.sm },
  checkRow: { flexDirection: 'row', gap: space.sm, alignItems: 'flex-start' },
  checkDetail: { flex: 1 },
  exportRow: { flexDirection: 'row', gap: space.md, marginTop: space.xl },
  exportBtn: { flex: 1, alignSelf: 'auto' },
});
