import { useRouter } from 'expo-router';
import React, { useCallback, useEffect, useState } from 'react';
import { AccessibilityInfo, ActivityIndicator, StyleSheet, View } from 'react-native';
import { Button } from '@/components/Button';
import { Icon } from '@/components/icons';
import { PressableScale } from '@/components/PressableScale';
import { Screen } from '@/components/Screen';
import { Skeleton } from '@/components/Skeleton';
import { Text } from '@/components/Text';
import { haptic } from '@/lib/haptics';
import {
  type HiddenDriver,
  type HiddenResult,
  listHidden,
  unhideDriver,
} from '@/social/moderation';
import { color, font, maxFontScale, radius, slant, space, textStyle, type } from '@/theme/tokens';

/**
 * Hidden drivers: everyone you hid from a board or from Friends, each with a
 * way back.
 *
 * Hiding is the block App Review asks for (guideline 1.2), and a block with
 * no undo is a trap — one wrong tap on a friend's row and they were gone for
 * good. The list comes from the server (list_blocked), which is also what
 * applies the hide, so what this screen shows is exactly what the boards
 * leave out. Unhiding needs no confirmation: hiding again is one tap away.
 */
export default function HiddenDriversScreen() {
  const router = useRouter();
  // Reached from Settings; a cold-start deep link has nothing beneath it.
  const goBack = () => (router.canGoBack() ? router.back() : router.replace('/settings'));
  const [drivers, setDrivers] = useState<HiddenDriver[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  // The driver whose Unhide is in flight; one at a time.
  const [pending, setPending] = useState<string | null>(null);
  const [rowError, setRowError] = useState<{ profileId: string; message: string } | null>(null);

  const show = useCallback((result: HiddenResult) => {
    if (result.ok) {
      setDrivers(result.drivers);
      setLoadError(null);
    } else {
      // Distinct from the empty state: "we could not ask" is not "nobody".
      setDrivers([]);
      setLoadError(result.message);
    }
  }, []);
  const refresh = useCallback(() => listHidden().then(show), [show]);

  useEffect(() => {
    let live = true;
    void listHidden().then((result) => {
      if (live) show(result);
    });
    return () => {
      live = false;
    };
  }, [show]);

  const onUnhide = async (driver: HiddenDriver) => {
    if (pending) return;
    setPending(driver.profileId);
    setRowError(null);
    const result = await unhideDriver(driver.profileId);
    setPending(null);
    if (!result.ok) {
      haptic.error();
      setRowError({ profileId: driver.profileId, message: result.message });
      AccessibilityInfo.announceForAccessibility(result.message);
      return;
    }
    haptic.selection();
    setDrivers((list) => (list ? list.filter((d) => d.profileId !== driver.profileId) : list));
    AccessibilityInfo.announceForAccessibility(
      `@${driver.username} unhidden. They're back on your boards.`,
    );
  };

  return (
    <Screen footer={<Button label="Back" variant="secondary" onPress={goBack} />}>
      <Text variant="headline" accessibilityRole="header">
        Hidden drivers
      </Text>
      <Text variant="callout" style={styles.sub}>
        Drivers you hide are left off every board you see. They are not told. Unhide someone to
        see their runs again.
      </Text>

      {drivers === null ? (
        <View style={styles.loading}>
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} style={styles.loadingRow} />
          ))}
        </View>
      ) : loadError ? (
        <View style={styles.state}>
          <Icon name="hidden" size={28} color={color.text3} />
          <Text variant="cardTitle" accessibilityRole="header">
            Could not load hidden drivers
          </Text>
          <Text variant="callout">{loadError}</Text>
          <Button label="Try again" variant="secondary" onPress={refresh} style={styles.retry} />
        </View>
      ) : drivers.length === 0 ? (
        <View style={styles.state}>
          <Icon name="hidden" size={28} color={color.text3} />
          <Text variant="cardTitle" accessibilityRole="header">
            Nobody hidden
          </Text>
          <Text variant="callout">
            To hide a driver, tap ⋯ beside their name on a board or in Friends.
          </Text>
        </View>
      ) : (
        <View style={styles.list}>
          {drivers.map((d) => {
            const busy = pending === d.profileId;
            return (
              <View key={d.profileId} style={styles.driver}>
                <View style={styles.driverRow}>
                  <Text variant="bodySemibold" numberOfLines={1} style={styles.name}>
                    @{d.username}
                  </Text>
                  <PressableScale
                    onPress={() => onUnhide(d)}
                    disabled={pending != null}
                    accessibilityRole="button"
                    accessibilityLabel={`Unhide @${d.username}`}
                    accessibilityState={{ disabled: pending != null, busy }}
                    style={[styles.unhide, pending != null && !busy && styles.dimmed]}
                  >
                    {/* A slanted outline plate, as every Nightrun button is. */}
                    <View pointerEvents="none" style={styles.unhidePlate} />
                    {busy ? (
                      <ActivityIndicator size="small" color={color.text2} />
                    ) : (
                      <Text style={styles.unhideLabel} maxFontSizeMultiplier={maxFontScale.button}>
                        Unhide
                      </Text>
                    )}
                  </PressableScale>
                </View>
                {rowError?.profileId === d.profileId ? (
                  <Text variant="caption" style={styles.error} accessibilityLiveRegion="polite">
                    {rowError.message}
                  </Text>
                ) : null}
              </View>
            );
          })}
        </View>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  sub: { marginTop: space.sm },
  loading: { marginTop: space.xl, gap: space.md },
  loadingRow: { height: 56, borderRadius: radius.sm },
  // Empty and failed states: open on the night, not boxed.
  state: { marginTop: space.xl, gap: space.sm },
  retry: { marginTop: space.md, alignSelf: 'flex-start' },
  list: {
    marginTop: space.xl,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: color.divider,
  },
  driver: {
    gap: space.xs,
    paddingVertical: space.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: color.divider,
  },
  driverRow: { minHeight: 48, flexDirection: 'row', alignItems: 'center', gap: space.md },
  name: { flex: 1, minWidth: 0 },
  // A compact slanted plate that still meets the 44pt minimum, and keeps its
  // width when the label swaps for the spinner.
  unhide: {
    minHeight: 44,
    minWidth: 96,
    paddingHorizontal: space.lg,
    // Clears the plate's 6pt inset, so a label grown by Dynamic Type stays on it.
    paddingVertical: space.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  unhidePlate: {
    position: 'absolute',
    top: 6,
    bottom: 6,
    left: 0,
    right: 0,
    borderRadius: radius.xs,
    borderWidth: 1,
    borderColor: color.outline,
    transform: slant.transform,
  },
  unhideLabel: { fontFamily: font.bodySemibold, ...textStyle(type.legal), color: color.text1 },
  dimmed: { opacity: 0.45 },
  error: { color: color.danger },
});
