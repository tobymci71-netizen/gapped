import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import React, { useCallback, useMemo, useRef, useState } from 'react';
import { StyleSheet, useWindowDimensions, View } from 'react-native';
import { captureRef } from 'react-native-view-shot';
import { Button } from '@/components/Button';
import { Card } from '@/components/Card';
import { RoutePath } from '@/components/RoutePath';
import { Screen } from '@/components/Screen';
import { Stat } from '@/components/Stat';
import { ShareCard, SHARE_CARD_SIZE } from '@/components/ShareCard';
import { Text } from '@/components/Text';
import { exportStamp, toCsv, toGpx } from '@/drive/export';
import { trimRouteForSharing } from '@/drive/privacy';
import { haptic } from '@/lib/haptics';
import { supabase } from '@/lib/supabase';
import { checkPlausibility } from '@/drive/plausibility';
import { distanceForDisplay, formatDuration, formatSpeed } from '@/drive/units';
import { listDrives, readFixes } from '@/drive/wal';
import { useProfile } from '@/state/profile';
import { color, gutter, space } from '@/theme/tokens';

type Verification = 'verified' | 'unverified' | 'pending' | null;

/** How often, and for how long, to re-ask while the server's verdict is out. */
const VERIFY_POLL_MS = 4000;
const VERIFY_POLL_TRIES = 15;

/**
 * The server's verdict on a drive: null when it has no row (not uploaded yet,
 * or offline-only), undefined when the question could not be asked — in which
 * case the caller keeps what it had.
 */
async function fetchVerification(id: string): Promise<Verification | undefined> {
  if (!supabase) return undefined;
  try {
    const { data, error } = await supabase
      .from('drives')
      .select('verification')
      .eq('id', id)
      .maybeSingle();
    if (error) return undefined;
    return (data?.verification as Verification | undefined) ?? null;
  } catch {
    // A thrown fetch (no network at all) is the same "could not ask".
    return undefined;
  }
}

/** Resolves after the next two frames: one to commit a state change, one to draw it. */
const nextPaint = () =>
  new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));

export default function DriveDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  // A cold-start deep link (gapped://friends, gapped://drive/<id>) opens this
  // screen with nothing beneath it, so Back must have somewhere to go.
  const goBack = () => (router.canGoBack() ? router.back() : router.replace('/(tabs)/drive'));
  const { unitPref, username, vehicleMake, vehicleModel } = useProfile();
  const { width } = useWindowDimensions();
  const cardRef = useRef<View>(null);
  const [sharing, setSharing] = useState(false);
  // The WAL does not store the server's verdict, and the card must never claim
  // a badge it cannot back up — so it stays unverified until the server says
  // otherwise, rather than assuming the happy case.
  const [verification, setVerification] = useState<Verification>(null);

  /*
   * Fetched on focus and re-asked while there is no verdict yet. A drive that
   * has just ended is uploaded and verified seconds later (sync → verify-drive),
   * so a single fetch on mount found no row or 'pending' and was never repeated:
   * a run the server had since verified was shared as UNVERIFIED until the
   * screen was left and reopened. The polling is capped, because "no row" is
   * also the permanent answer for a drive that never uploads.
   */
  useFocusEffect(
    useCallback(() => {
      // No backend configured: there is no verdict to wait for.
      if (!id || !supabase) return;
      let live = true;
      let tries = 0;
      let timer: ReturnType<typeof setTimeout> | null = null;
      const ask = async () => {
        const v = await fetchVerification(id);
        if (!live) return;
        if (v !== undefined) setVerification(v);
        if ((v == null || v === 'pending') && ++tries < VERIFY_POLL_TRIES) {
          timer = setTimeout(ask, VERIFY_POLL_MS);
        }
      };
      ask();
      return () => {
        live = false;
        if (timer) clearTimeout(timer);
      };
    }, [id]),
  );

  const drive = useMemo(() => listDrives().find((d) => d.id === id), [id]);
  const fixes = useMemo(() => (id ? readFixes(id) : []), [id]);
  const plausibility = useMemo(
    () => (fixes.length > 1 ? checkPlausibility(fixes) : null),
    [fixes],
  );

  // The card shows the trimmed route only. The salt here is client-side and
  // only affects this picture; the server re-trims independently with its own
  // secret salt for anything it ranks or stores.
  const shareFixes = useMemo(
    () => (id && fixes.length > 1 ? trimRouteForSharing(fixes, 'gapped-share-card', id) : []),
    [fixes, id],
  );
  const vehicleLabel =
    vehicleMake && vehicleModel ? `${vehicleMake} ${vehicleModel}` : null;

  if (!drive || !drive.summary) {
    return (
      <Screen footer={<Button label="Back" variant="secondary" onPress={goBack} />}>
        <Text variant="headline">Drive not found</Text>
      </Screen>
    );
  }

  const s = drive.summary;
  const dist = distanceForDisplay(s.distanceM, unitPref);
  const stamp = exportStamp(drive.startedAt);

  /**
   * Capture the off-screen card and hand it to the share sheet.
   *
   * The card renders the privacy-trimmed route, not the raw one: a picture of
   * a route is exactly as identifying as the coordinates behind it, so the
   * same trimming that applies to a ranked drive applies here.
   */
  const shareCard = async () => {
    if (!cardRef.current || !id) return;
    setSharing(true);
    try {
      // The badge is the claim the picture makes, so ask for the verdict as of
      // now rather than trusting whatever this screen last heard — and let the
      // card redraw with it before view-shot reads its pixels.
      const fresh = await fetchVerification(id);
      if (fresh !== undefined && fresh !== verification) {
        setVerification(fresh);
        await nextPaint();
      }
      const uri = await captureRef(cardRef, {
        format: 'png',
        quality: 1,
        width: SHARE_CARD_SIZE,
        height: SHARE_CARD_SIZE,
      });
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(uri, {
          mimeType: 'image/png',
          dialogTitle: 'Share drive',
        });
      }
    } catch {
      haptic.error();
    } finally {
      setSharing(false);
    }
  };

  const shareFile = async (kind: 'gpx' | 'csv') => {
    // Was unguarded: a filesystem failure made the button appear to do nothing.
    // Its sibling shareCard has always caught and reported.
    try {
      const content =
        kind === 'gpx' ? toGpx(fixes, `Gapped drive ${stamp}`) : toCsv(fixes);
      const file = new File(Paths.cache, `gapped-${stamp}.${kind}`);
      if (file.exists) file.delete();
      file.create();
      file.write(content);
      if (!(await Sharing.isAvailableAsync())) {
        haptic.error();
        return;
      }
      await Sharing.shareAsync(file.uri, {
        mimeType: kind === 'gpx' ? 'application/gpx+xml' : 'text/csv',
      });
    } catch {
      haptic.error();
    }
  };

  return (
    <Screen footer={<Button label="Back" variant="secondary" onPress={goBack} />}>
      <Text variant="headline">{new Date(drive.startedAt).toLocaleString()}</Text>

      {fixes.length > 1 ? (
        <Card style={styles.routeCard}>
          {/* viewport − both screen gutters − both Card paddings */}
          <RoutePath fixes={fixes} width={width - gutter * 2 - space.lg * 2} height={200} />
        </Card>
      ) : null}

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
          label="0–60 mph"
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

      <Button
        label={sharing ? 'Preparing…' : 'Share card'}
        style={styles.shareBtn}
        disabled={sharing}
        onPress={shareCard}
      />

      <View style={styles.exportRow}>
        <Button label="Export GPX" variant="secondary" style={styles.exportBtn} onPress={() => shareFile('gpx')} />
        <Button label="Export CSV" variant="secondary" style={styles.exportBtn} onPress={() => shareFile('csv')} />
      </View>
      <Text variant="legal" style={styles.note}>
        Your data is yours — full-resolution export, free, always.
      </Text>

      {/*
        Off-screen at natural size so view-shot captures it crisply — collapsed
        to zero height and pushed out of the layout rather than scaled down,
        which would blur the capture.
      */}
      <View style={styles.offscreen} pointerEvents="none" collapsable={false}>
        <View ref={cardRef} collapsable={false}>
          <ShareCard
            summary={s}
            fixes={shareFixes}
            unitPref={unitPref}
            username={username}
            vehicle={vehicleLabel}
            verification={verification}
          />
        </View>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  routeCard: { marginTop: space.lg, alignItems: 'center' },
  grid: { flexDirection: 'row', gap: space.md, marginTop: space.md },
  note: { marginTop: space.sm },
  plausibility: { marginTop: space.xl, gap: space.sm },
  checkRow: { flexDirection: 'row', gap: space.sm, alignItems: 'flex-start' },
  checkDetail: { flex: 1 },
  shareBtn: { marginTop: space.xl },
  exportRow: { flexDirection: 'row', gap: space.md, marginTop: space.md },
  offscreen: { position: 'absolute', left: -10000, top: 0, opacity: 0 },
  exportBtn: { flex: 1, alignSelf: 'auto' },
});
