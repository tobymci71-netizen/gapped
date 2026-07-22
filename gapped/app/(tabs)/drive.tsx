import React, { useEffect, useRef } from 'react';
import { StyleSheet, View } from 'react-native';
import { Button } from '@/components/Button';
import { Card } from '@/components/Card';
import { Entrance } from '@/components/Entrance';
import { Screen } from '@/components/Screen';
import { Speedometer } from '@/components/Speedometer';
import { Text } from '@/components/Text';
import { AnimatedNumber } from '@/components/AnimatedNumber';
import { useDriveStore } from '@/drive/recorder';
import {
  formatDistance,
  formatDuration,
  formatSpeed,
  msToKmh,
  msToMph,
  speedForDisplay,
} from '@/drive/units';
import { haptic } from '@/lib/haptics';
import { useProfile } from '@/state/profile';
import { useRecords } from '@/state/records';
import { color, space } from '@/theme/tokens';

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
  const { pbs, recordDrive } = useRecords();

  const recording = engineState === 'recording';
  const { value: speedValue, unit: speedUnit } = speedForDisplay(speedMs, unitPref);
  const maxValue = unitPref === 'imperial' ? 160 : 260;
  const pbDisplay =
    pbs.topSpeedMs != null
      ? unitPref === 'imperial'
        ? msToMph(pbs.topSpeedMs)
        : msToKmh(pbs.topSpeedMs)
      : null;

  // Record PBs + streak day when a drive finalizes; PB haptic if beaten.
  const lastRecorded = useRef<number | null>(null);
  useEffect(() => {
    if (lastSummary && lastSummary.endedAt !== lastRecorded.current) {
      lastRecorded.current = lastSummary.endedAt;
      const imps = recordDrive(lastSummary);
      if (imps.length > 0) haptic.personalBest();
    }
  }, [lastSummary, recordDrive]);

  return (
    <Screen
      scroll={false}
      footer={
        permission !== 'granted' ? (
          <Button label="Enable location" onPress={requestPermissions} />
        ) : recording ? (
          <Button label="End drive" variant="secondary" onPress={stopDrive} />
        ) : (
          <Button
            label="Start drive"
            onPress={() => {
              haptic.driveStarted();
              startDrive();
            }}
          />
        )
      }
    >
      <View style={styles.center}>
        <Speedometer
          value={speedValue}
          maxValue={maxValue}
          unit={speedUnit}
          pb={pbDisplay}
          active
        />

        {recording && startedAt ? (
          <View style={styles.liveRow}>
            <Text variant="caption">{formatDistance(distanceM, unitPref)}</Text>
            <Text variant="caption">·</Text>
            <Text variant="caption">{formatDuration((Date.now() - startedAt) / 1000)}</Text>
          </View>
        ) : null}

        {!recording && lastSummary ? (
          <Entrance style={styles.summaryWrap}>
            <Card style={styles.summary}>
              <Text variant="cardTitle">Drive complete</Text>
              <View style={styles.statRow}>
                <View style={styles.stat}>
                  <AnimatedNumber
                    value={formatDistance(lastSummary.distanceM, unitPref).split(' ')[0]}
                    size={26}
                  />
                  <Text variant="caption">
                    {formatDistance(lastSummary.distanceM, unitPref).split(' ')[1]}
                  </Text>
                </View>
                <View style={styles.stat}>
                  <AnimatedNumber
                    value={formatSpeed(lastSummary.maxSpeedMs, unitPref).split(' ')[0]}
                    size={26}
                    color={color.accent}
                  />
                  <Text variant="caption">top {speedUnit}</Text>
                </View>
                <View style={styles.stat}>
                  <AnimatedNumber value={formatDuration(lastSummary.durationS)} size={26} />
                  <Text variant="caption">time</Text>
                </View>
              </View>
              {lastSummary.zeroTo60S != null ? (
                <Text variant="caption">0–60: {lastSummary.zeroTo60S.toFixed(2)} s</Text>
              ) : null}
            </Card>
          </Entrance>
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
  liveRow: { flexDirection: 'row', gap: space.sm, marginTop: space.lg },
  summaryWrap: { alignSelf: 'stretch' },
  summary: { marginTop: space.xl, gap: space.md },
  statRow: { flexDirection: 'row', justifyContent: 'space-between' },
  stat: { alignItems: 'flex-start', gap: 2 },
  hint: { textAlign: 'center', marginTop: space.xl, paddingHorizontal: space.xl },
});
