import React from 'react';
import { StyleSheet, View } from 'react-native';
import { SlantTag } from '@/components/brand/SlantTag';
import { Card } from '@/components/Card';
import { Icon } from '@/components/icons';
import { PressableScale } from '@/components/PressableScale';
import { Text } from '@/components/Text';
import type { PlausibilityReport } from '@/drive/types';
import { color, space } from '@/theme/tokens';

export type ChipState = 'verified' | 'unverified' | 'pending';

/**
 * The server's verdict as a slanted chip beside the drive's date.
 *
 * Verified wears the white outline and a tick. Unverified and Pending are
 * quiet night chips, never red: unverified is not an accusation, and pending
 * only means the server has not finished (or not yet been asked).
 */
export function VerificationChip({ state }: { state: ChipState }) {
  switch (state) {
    case 'verified':
      return (
        <SlantTag
          label="Verified"
          variant="white-outline"
          icon="check"
          accessibilityLabel="Verified by Gapped's servers"
        />
      );
    case 'unverified':
      return <SlantTag label="Unverified" variant="dark" accessibilityLabel="Not verified" />;
    case 'pending':
      return <SlantTag label="Pending" variant="dark" accessibilityLabel="Verification pending" />;
  }
}

/**
 * "‹ Drives": the screen's way back, top left, as the mock draws it. A 44pt
 * target; the chevron hangs into the gutter so the word lines up with the
 * title under it. VoiceOver hears "Back to drives": the visible word stays in
 * the name, so Voice Control's "Tap Drives" finds it.
 */
export function BackLink({ label = 'Drives', onPress }: { label?: string; onPress: () => void }) {
  return (
    <PressableScale
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`Back to ${label.toLowerCase()}`}
      hitSlop={{ top: 4, bottom: 4, right: 8 }}
      style={styles.back}
    >
      <Icon name="chevronLeft" size={22} color={color.text1} strokeWidth={2} />
      <Text variant="bodySemibold">{label}</Text>
    </PressableScale>
  );
}

/**
 * What this phone checked before the server does: each check's result with
 * its detail, and the standing note that the server has the final word.
 * Pass and fail are drawn as stroke ticks and crosses in their own colours —
 * marks, not lights, so neither glows.
 */
export function LocalChecks({ report }: { report: PlausibilityReport }) {
  return (
    <Card style={styles.checks}>
      <Text variant="title">
        {report.verdict === 'plausible' ? 'Passes local checks' : 'Failed local checks'}
      </Text>
      {report.checks.map((c) => (
        <View
          key={c.check}
          style={styles.checkRow}
          accessible
          accessibilityRole="text"
          accessibilityLabel={`${c.pass ? 'Passed' : 'Failed'}: ${c.detail}`}
        >
          <View style={styles.checkIcon}>
            <Icon
              name={c.pass ? 'check' : 'close'}
              size={16}
              color={c.pass ? color.success : color.danger}
              strokeWidth={2.2}
            />
          </View>
          <Text variant="caption" style={styles.checkDetail}>
            {c.detail}
          </Text>
        </View>
      ))}
      <Text variant="legal">
        Final verification is server-side, recomputed from the raw trace. Unverified is not an
        accusation — it means a check could not pass yet.
      </Text>
    </Card>
  );
}

const styles = StyleSheet.create({
  back: {
    alignSelf: 'flex-start',
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    marginLeft: -7,
    paddingRight: space.md,
  },
  checks: { gap: space.sm },
  checkRow: { flexDirection: 'row', gap: space.sm, alignItems: 'flex-start' },
  // Centres the 16pt mark on the caption's first 20pt line.
  checkIcon: { paddingTop: 2 },
  checkDetail: { flex: 1 },
});
