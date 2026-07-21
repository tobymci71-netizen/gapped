import React from 'react';
import { StyleSheet, View } from 'react-native';
import { Button } from '@/components/Button';
import { Card } from '@/components/Card';
import { Screen } from '@/components/Screen';
import { Numeral, Text } from '@/components/Text';
import { useDriveStore } from '@/drive/recorder';
import {
  formatDistance,
  formatDuration,
  formatSpeed,
  speedForDisplay,
} from '@/drive/units';
import { useProfile } from '@/state/profile';
import { color, space, type } from '@/theme/tokens';

export default function DriveScreen() {
  const unitPref = useProfile((s) => s.unitPref);
  const {
    engineState,
    speedMs,
    distanceM,
    startedAt,
    lastSummary,
    permission,
    requestPermissions,
    startDrive,
    stopDrive,
  } = useDriveStore();

  const recording = engineState === 'recording';
  const { value: speedValue, unit: speedUnit } = speedForDisplay(speedMs, unitPref);

  return (
    <Screen
      scroll={false}
      footer={
        permission !== 'granted' ? (
          <Button label="Enable location" onPress={requestPermissions} />
        ) : recording ? (
          <Button label="End drive" variant="secondary" onPress={stopDrive} />
        ) : (
          <Button label="Start drive" onPress={startDrive} />
        )
      }
    >
      <View style={styles.center}>
        {/* Live speed HUD: large tabular numeral so the readout never jitters. */}
        <Numeral size={type.heroNumeral * 2} color={recording ? color.accent : color.text1}>
          {Math.round(speedValue)}
        </Numeral>
        <Text variant="bodyMedium" style={styles.unit}>
          {speedUnit}
        </Text>

        {recording && startedAt ? (
          <View style={styles.liveRow}>
            <Text variant="caption">{formatDistance(distanceM, unitPref)}</Text>
            <Text variant="caption">·</Text>
            <Text variant="caption">{formatDuration((Date.now() - startedAt) / 1000)}</Text>
          </View>
        ) : null}

        {!recording && lastSummary ? (
          <Card style={styles.summary}>
            <Text variant="cardTitle">Last drive</Text>
            <View style={styles.summaryRow}>
              <Text variant="caption">
                {formatDistance(lastSummary.distanceM, unitPref)} ·{' '}
                {formatDuration(lastSummary.durationS)} · top{' '}
                {formatSpeed(lastSummary.maxSpeedMs, unitPref)}
              </Text>
            </View>
            {lastSummary.zeroTo60S != null ? (
              <Text variant="caption">0–60: {lastSummary.zeroTo60S.toFixed(2)} s</Text>
            ) : null}
          </Card>
        ) : null}

        {!recording && !lastSummary ? (
          <Text variant="body" style={styles.hint}>
            Drive detection is automatic — sustained motion starts a recording. Or start one
            manually while safely parked.
          </Text>
        ) : null}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  unit: { color: color.text2, marginTop: -space.sm },
  liveRow: { flexDirection: 'row', gap: space.sm, marginTop: space.lg },
  summary: { marginTop: space.xxl, alignSelf: 'stretch', gap: space.sm },
  summaryRow: { flexDirection: 'row' },
  hint: { textAlign: 'center', marginTop: space.xxl },
});
