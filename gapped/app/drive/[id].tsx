import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import React, { useCallback, useMemo, useRef, useState } from 'react';
import { Alert, StyleSheet, useWindowDimensions, View } from 'react-native';
import { captureRef, releaseCapture } from 'react-native-view-shot';
import { FilmGrain } from '@/components/brand/FilmGrain';
import { NumberPlate } from '@/components/brand/NumberPlate';
import { SectionHeader } from '@/components/brand/SectionHeader';
import { Button } from '@/components/Button';
import { HideBadgeRow } from '@/components/HideBadgeRow';
import { Icon } from '@/components/icons';
import { ProBadge, useGoPro } from '@/components/ProBadge';
import { Screen } from '@/components/Screen';
import { SettingsRow, SettingsSection } from '@/components/SettingsRow';
import { ShareCard, SHARE_CARD_SIZE } from '@/components/ShareCard';
import { Text } from '@/components/Text';
import {
  cleanShareLocked,
  driveLocked,
  exportView,
  lockedDriveCopy,
  peakGView,
  proLabel,
  shareCardBranded,
} from '@/drive/driveAccess';
import { deleteDrive, discardExportFile, type DeleteDriveResult } from '@/drive/deleteDrive';
import { exportStamp, toCsv, toGpx } from '@/drive/export';
import { trimRouteForSharing } from '@/drive/privacy';
import { Figure } from '@/drive/summary/Figure';
import { ForcesRow } from '@/drive/summary/ForcesRow';
import {
  driveVehicleLabel,
  durationFigure,
  spokenDistanceUnit,
  spokenSpeedUnit,
} from '@/drive/summary/format';
import { routeFixes, speedTrace } from '@/drive/summary/geometry';
import { BackLink, LocalChecks, VerificationChip, type ChipState } from '@/drive/summary/parts';
import { RouteMap } from '@/drive/summary/RouteMap';
import { SpeedTrace } from '@/drive/summary/SpeedTrace';
import { driveTitle } from '@/lib/driveTitle';
import { useAccess } from '@/lib/entitlements';
import { haptic } from '@/lib/haptics';
import { supabase } from '@/lib/supabase';
import { checkPlausibility } from '@/drive/plausibility';
import { distanceForDisplay, speedForDisplay } from '@/drive/units';
import { useDriveStore } from '@/drive/recorder';
import { listDrives, readFixes } from '@/drive/wal';
import { notRankedLine, type RankingCeiling } from '@/drive/notRanked';
import { useProfile } from '@/state/profile';
import { gutter, space } from '@/theme/tokens';

type Verification = 'verified' | 'unverified' | 'pending' | null;

/**
 * What the server decided about a drive. `topSpeedRanked` is verify-drive's
 * verification_meta.top_speed_ranked: false when the drive's top speed was
 * above its country's national limit, so it was kept off the public top-speed
 * boards (it stays in the driver's own history). Null when the server has not
 * said — no row yet, not verified yet, or verified before the flag existed.
 */
type ServerVerdict = {
  verification: Verification;
  topSpeedRanked: boolean | null;
  /** What the ranking was held to, when the server recorded it (notRankedLine). */
  ceiling: RankingCeiling;
};

const NO_CEILING: RankingCeiling = { ceilingMs: null, country: null };
const NO_VERDICT: ServerVerdict = { verification: null, topSpeedRanked: null, ceiling: NO_CEILING };

/** How often, and for how long, to re-ask while the server's verdict is out. */
const VERIFY_POLL_MS = 4000;
const VERIFY_POLL_TRIES = 15;

/** The Alert for each way a deletion can stop short. Nothing was deleted in any of them but the last. */
const DELETE_FAILURE: Record<Exclude<DeleteDriveResult, 'deleted'>, [string, string]> = {
  recording: ['Finish this drive first', 'A drive is still recording. Stop it, then delete this one.'],
  unreachable: [
    'Connection needed',
    'Deleting a drive also removes it from our servers, so it needs a connection. Nothing was deleted. Try again when you are online.',
  ],
  signedOut: [
    'Drive not deleted',
    'This drive was uploaded from an account this phone is no longer signed in to, so it cannot be removed from our servers here. Nothing was deleted. Contact us from Settings with your username and we will remove it.',
  ],
  localFailed: [
    'Removed from our servers',
    'The drive is gone from our servers and the leaderboards, but this phone could not remove its copy. Try deleting it again.',
  ],
};

/**
 * The server's verdict on a drive: NO_VERDICT when it has no row (not
 * uploaded yet, or offline-only), undefined when the question could not be
 * asked — in which case the caller keeps what it had.
 */
async function fetchVerification(id: string): Promise<ServerVerdict | undefined> {
  if (!supabase) return undefined;
  try {
    // The flag is read out of the JSON rather than selecting the whole of
    // verification_meta, which is the server's working notes on the drive.
    const { data, error } = await supabase
      .from('drives')
      .select(
        'verification, top_speed_ranked:verification_meta->top_speed_ranked, top_speed_ceiling_ms:verification_meta->top_speed_ceiling_ms, ranking_country:verification_meta->>ranking_country',
      )
      .eq('id', id)
      .maybeSingle();
    if (error) return undefined;
    if (!data) return NO_VERDICT;
    const row = data as {
      verification?: unknown;
      top_speed_ranked?: unknown;
      top_speed_ceiling_ms?: unknown;
      ranking_country?: unknown;
    };
    return {
      verification: (row.verification as Verification | undefined) ?? null,
      topSpeedRanked: typeof row.top_speed_ranked === 'boolean' ? row.top_speed_ranked : null,
      ceiling: {
        ceilingMs: typeof row.top_speed_ceiling_ms === 'number' ? row.top_speed_ceiling_ms : null,
        country: typeof row.ranking_country === 'string' ? row.ranking_country : null,
      },
    };
  } catch {
    // A thrown fetch (no network at all) is the same "could not ask".
    return undefined;
  }
}

/**
 * Where the distance plate sits on the map: its top edge this far above the
 * map's foot, so the plate rests on the route's ground as in the mock.
 */
const PLATE_OVERLAP = 58;

/** Resolves after the next two frames: one to commit a state change, one to draw it. */
const nextPaint = () =>
  new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));

export default function DriveDetail() {
  // `from`: the list that opened this drive. The Driving tab's Recent drives
  // by default; the You tab's history passes 'you', so the back link names
  // where it goes.
  const { id, from } = useLocalSearchParams<{ id: string; from?: string }>();
  const fromYou = from === 'you';
  const router = useRouter();
  // A cold-start deep link (gapped://friends, gapped://drive/<id>) opens this
  // screen with nothing beneath it, so Back must have somewhere to go.
  const goBack = () =>
    router.canGoBack() ? router.back() : router.replace(fromYou ? '/(tabs)/you' : '/(tabs)/drive');
  const goPro = useGoPro();
  // Unrestricted while PRO_LIMITS_ENFORCED is off: every lock below is then
  // open, and the screen is what it was plus a working "Hide Gapped badge".
  const access = useAccess();
  const { unitPref, username, vehicleId, vehicleMake, vehicleModel, extraVehicles } = useProfile();
  const { width } = useWindowDimensions();
  const cardRef = useRef<View>(null);
  const [sharing, setSharing] = useState(false);
  // "Hide Gapped badge". Branded is the default for everyone, every time the
  // screen opens.
  const [hideBadge, setHideBadge] = useState(false);
  // The WAL does not store the server's verdict, and the card must never claim
  // a badge it cannot back up — so it stays unverified until the server says
  // otherwise, rather than assuming the happy case.
  const [verification, setVerification] = useState<Verification>(null);
  const [topSpeedRanked, setTopSpeedRanked] = useState<boolean | null>(null);
  const [ceiling, setCeiling] = useState<RankingCeiling>(NO_CEILING);
  const [deleting, setDeleting] = useState(false);

  // Free's history window is measured from when the screen opened, so a drive
  // cannot lock under someone part-way through reading it.
  const [openedAt] = useState(Date.now);
  const drive = useMemo(() => listDrives().find((d) => d.id === id), [id]);
  // A deep link can land on a drive the list would not open.
  const locked = drive != null && driveLocked(drive.startedAt, openedAt, access);

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
      // No backend configured: there is no verdict to wait for. A locked drive
      // shows no card, so it has no badge to wait for either.
      if (!id || !supabase || locked) return;
      let live = true;
      let tries = 0;
      let timer: ReturnType<typeof setTimeout> | null = null;
      const ask = async () => {
        const v = await fetchVerification(id);
        if (!live) return;
        if (v !== undefined) {
          setVerification(v.verification);
          setTopSpeedRanked(v.topSpeedRanked);
          setCeiling(v.ceiling);
        }
        const settled = v?.verification === 'verified' || v?.verification === 'unverified';
        if (!settled && ++tries < VERIFY_POLL_TRIES) {
          timer = setTimeout(ask, VERIFY_POLL_MS);
        }
      };
      ask();
      return () => {
        live = false;
        if (timer) clearTimeout(timer);
      };
    }, [id, locked]),
  );

  const fixes = useMemo(() => (id && !locked ? readFixes(id) : []), [id, locked]);
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
  // The car this drive was recorded in, not whichever is in the garage today.
  const vehicleLabel = driveVehicleLabel(drive?.vehicleId ?? null, {
    vehicleId,
    vehicleMake,
    vehicleModel,
    extraVehicles,
  });
  // The map and the speed trace are drawn from the same gated stream the
  // summary's figures come from (geometry.ts).
  const mapFixes = useMemo(() => routeFixes(fixes), [fixes]);
  const trace = useMemo(() => speedTrace(fixes, unitPref), [fixes, unitPref]);

  if (!drive || !drive.summary) {
    return (
      <Screen footer={<Button label="Back" variant="secondary" onPress={goBack} />}>
        <Text variant="headline">Drive not found</Text>
      </Screen>
    );
  }

  // "Monday afternoon" and "Mon 5 Oct · 13:00–13:25", from when the drive
  // really happened, in this phone's zone (driveTitle). Never a raw timestamp.
  // Ends at the summary's last fix, as the Drive tab's row does and as the
  // speed trace's axis does, so the three never disagree about the end time.
  const when = driveTitle({
    startedAt: drive.startedAt,
    durationS: drive.summary.durationS,
    endedAt: drive.summary.endedAt,
  });

  if (locked) {
    const copy = lockedDriveCopy();
    return (
      <Screen
        footer={
          <View style={styles.lockedFooter}>
            <Button label="See Gapped Pro" onPress={goPro} />
            <Button label="Back" variant="secondary" onPress={goBack} />
          </View>
        }
      >
        <ProBadge />
        <Text variant="headline" style={styles.lockedTitle}>
          {copy.title}
        </Text>
        <View style={styles.lockedWhen} accessible accessibilityLabel={`Drive: ${when.spoken}`}>
          <Text variant="callout">{when.title}</Text>
          <Text variant="mono">{when.meta}</Text>
        </View>
        <Text variant="body" style={styles.lockedBody}>
          {copy.body}
        </Text>
      </Screen>
    );
  }

  const s = drive.summary;
  const dist = distanceForDisplay(s.distanceM, unitPref);
  const distValue = dist.value.toFixed(1);
  const spokenDistance = `${distValue} ${spokenDistanceUnit(dist.unit)}`;
  const duration = durationFigure(s.durationS);
  const avg = speedForDisplay(s.avgSpeedMs, unitPref);
  const top = speedForDisplay(s.maxSpeedMs, unitPref);
  const avgValue = String(Math.round(avg.value));
  const topValue = String(Math.round(top.value));
  const speedUnitSpoken = spokenSpeedUnit(avg.unit);
  const stamp = exportStamp(drive.startedAt);
  const peakG = peakGView(s.maxG, access);
  const exporting = exportView(access);
  const hasRoute = mapFixes.length > 1;
  const contentWidth = width - gutter * 2;
  // The chip says what the server has said. Before it has (no row yet, or
  // still checking) the verdict is pending — unless there is no server to
  // ask, when it is plainly unverified, as the share card says.
  const chip: ChipState = verification ?? (supabase ? 'pending' : 'unverified');
  const metaLine = vehicleLabel ? `${when.range} · ${vehicleLabel}` : when.range;
  // Drawn after a locked export label. Wrapped because the chip pins itself
  // to the top of a row, and this one should sit centred on the label.
  const proChip = () => (
    <View>
      <ProBadge />
    </View>
  );

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
      if (fresh !== undefined && fresh.verification !== verification) {
        setVerification(fresh.verification);
        await nextPaint();
      }
      const uri = await captureRef(cardRef, {
        format: 'png',
        quality: 1,
        width: SHARE_CARD_SIZE,
        height: SHARE_CARD_SIZE,
      });
      try {
        if (await Sharing.isAvailableAsync()) {
          await Sharing.shareAsync(uri, {
            mimeType: 'image/png',
            dialogTitle: 'Share drive',
          });
        }
      } finally {
        // The picture is a temporary file; the share sheet has what it needs
        // once it closes.
        releaseCapture(uri);
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
    //
    // The file is the full, untrimmed route, so it lives only as long as the
    // share sheet needs it. Left in the cache, every export stayed on the
    // phone after the drive — or the account — was deleted.
    const file = new File(Paths.cache, `gapped-${stamp}.${kind}`);
    try {
      const content =
        kind === 'gpx' ? toGpx(fixes, `Gapped drive ${stamp}`) : toCsv(fixes);
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
    } finally {
      discardExportFile(file);
    }
  };

  const confirmDelete = () => {
    if (deleting || !id) return;
    // Checked before asking, so nobody confirms a deletion that is then
    // refused. deleteDrive checks again.
    if (useDriveStore.getState().driveId != null) {
      haptic.error();
      Alert.alert(...DELETE_FAILURE.recording);
      return;
    }
    haptic.press();
    Alert.alert(
      'Delete this drive?',
      'This removes the drive from this phone and from our servers, including its leaderboard entries, and your records are recalculated without it. It cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => {
            setDeleting(true);
            deleteDrive(id)
              .then((result) => {
                if (result === 'deleted') {
                  // Nothing left to show. The tabs underneath re-read the
                  // drives as they regain focus.
                  goBack();
                  return;
                }
                setDeleting(false);
                haptic.error();
                Alert.alert(...DELETE_FAILURE[result]);
              })
              .catch(() => {
                setDeleting(false);
                haptic.error();
                Alert.alert(...DELETE_FAILURE.unreachable);
              });
          },
        },
      ],
    );
  };

  return (
    <View style={styles.root}>
      <Screen
        footer={
          <Button
            label={sharing ? 'Preparing…' : 'Share drive'}
            accessibilityLabel={sharing ? 'Preparing the share card' : 'Share drive'}
            disabled={sharing}
            onPress={shareCard}
            trailing={(ink) => <Icon name="share" size={22} color={ink} strokeWidth={1.9} />}
          />
        }
      >
        <BackLink label={fromYou ? 'You' : 'Drives'} onPress={goBack} />

        <Text
          variant="headline"
          accessibilityRole="header"
          accessibilityLabel={vehicleLabel ? `${when.spoken}, ${vehicleLabel}` : when.spoken}
          style={styles.title}
        >
          {when.title}
        </Text>
        <View style={styles.metaRow}>
          <VerificationChip state={chip} />
          {/* Said with the title, in words, so VoiceOver skips the mono line. */}
          <Text
            variant="mono"
            style={styles.meta}
            accessibilityElementsHidden
            importantForAccessibility="no-hide-descendants"
          >
            {metaLine}
          </Text>
        </View>

        {hasRoute ? (
          <View style={styles.map}>
            <RouteMap
              fixes={mapFixes}
              width={width}
              unitPref={unitPref}
              spokenDistance={spokenDistance}
            />
          </View>
        ) : null}

        {/* The one hero figure: the distance, on its plate, resting on the map. */}
        <NumberPlate
          label="Distance"
          value={distValue}
          unit={dist.unit}
          accessibilityLabel={`Distance, ${spokenDistance}`}
          style={hasRoute ? styles.plateOnMap : styles.plate}
        />

        <View style={styles.stats}>
          <Figure
            label="Duration"
            value={duration.value}
            unit={duration.unit}
            spoken={duration.spoken}
          />
          <Figure
            label="Average"
            value={avgValue}
            unit={avg.unit}
            spoken={`${avgValue} ${speedUnitSpoken}`}
            divider
          />
          <Figure
            label="Top speed"
            value={topValue}
            unit={top.unit}
            spoken={`${topValue} ${speedUnitSpoken}`}
            divider
          />
        </View>
        {/*
          Only on the server's word. A top speed above the country's national
          limit is kept off the public boards (verify-drive), and the figure
          above is still this driver's own — so the line says where it does not
          count, not that it was wrong.
        */}
        {topSpeedRanked === false ? (
          <Text variant="legal" style={styles.note}>
            {notRankedLine(ceiling, unitPref)}
          </Text>
        ) : null}

        {trace ? (
          <View style={styles.trace}>
            <SpeedTrace trace={trace} average={avg.value} unit={avg.unit} width={contentWidth} />
          </View>
        ) : null}

        {/* "Cornering G & full telemetry" is Pro; the figures around it are not. */}
        <View style={styles.forces}>
          <ForcesRow peakG={peakG} maxG={s.maxG} zeroTo60S={s.zeroTo60S} onGoPro={goPro} />
        </View>
        {s.zeroTo60S == null ? (
          <Text variant="legal" style={styles.note}>
            0–60 shows only when a drive pulls away from a standstill and reaches 60 mph without
            slowing on the way — we never estimate it.
          </Text>
        ) : (
          <Text variant="legal" style={styles.note}>
            Timed from a 1-foot rollout, with the 60 mph crossing interpolated between GPS fixes.
          </Text>
        )}

        {plausibility ? (
          <>
            <SectionHeader title="Verification" style={styles.sectionHead} />
            <LocalChecks report={plausibility} />
          </>
        ) : null}

        <SectionHeader title="Share card" style={styles.sectionHead} />
        <HideBadgeRow
          hidden={hideBadge}
          onChange={setHideBadge}
          locked={cleanShareLocked(access)}
          onGoPro={goPro}
        />

        <SectionHeader title="Export" style={styles.sectionHead} />
        {/*
          Locked, each button carries the chip and leads to Pro instead of
          exporting. Stacked then, because a label and a chip in half a row
          overflow the plate on a small phone or at a large text size.
        */}
        <View style={exporting.locked ? styles.exportColumn : styles.exportRow}>
          {(['gpx', 'csv'] as const).map((kind) => {
            const label = `Export ${kind.toUpperCase()}`;
            return (
              <Button
                key={kind}
                label={label}
                variant="secondary"
                style={exporting.locked ? undefined : styles.exportBtn}
                accessibilityLabel={exporting.locked ? proLabel(label) : undefined}
                trailing={exporting.locked ? proChip : undefined}
                onPress={exporting.locked ? goPro : () => shareFile(kind)}
              />
            );
          })}
        </View>
        <Text variant="legal" style={styles.note}>
          {exporting.note}
        </Text>

        <SettingsSection title="Drive">
          <SettingsRow
            icon="trash"
            label="Delete drive"
            value={deleting ? 'Deleting…' : undefined}
            destructive
            onPress={confirmDelete}
          />
        </SettingsSection>

        {/*
          Off-screen at natural size so view-shot captures it crisply — collapsed
          to zero height and pushed out of the layout rather than scaled down,
          which would blur the capture. Hidden from VoiceOver: it is a picture
          for the share sheet, and the screen above already says all of it.
        */}
        <View
          style={styles.offscreen}
          pointerEvents="none"
          collapsable={false}
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
        >
          <View ref={cardRef} collapsable={false}>
            <ShareCard
              summary={s}
              fixes={shareFixes}
              unitPref={unitPref}
              username={username}
              vehicle={vehicleLabel}
              verification={verification}
              branded={shareCardBranded(hideBadge, access)}
            />
          </View>
        </View>
      </Screen>
      {/* The night's film grain over the whole scene; still under Reduce Motion. */}
      <FilmGrain />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  title: { marginTop: space.xs },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    columnGap: space.md,
    rowGap: space.xs,
    marginTop: space.sm,
  },
  meta: { flexShrink: 1 },
  // The map runs edge to edge, out through the screen's gutters.
  map: { marginHorizontal: -gutter, marginTop: space.sm },
  plateOnMap: { marginTop: -PLATE_OVERLAP, marginLeft: 2 },
  plate: { marginTop: space.xl, marginLeft: 2 },
  stats: { flexDirection: 'row', gap: space.md, marginTop: space.lg },
  note: { marginTop: space.sm },
  trace: { marginTop: space.xl },
  forces: { marginTop: space.lg },
  sectionHead: { marginTop: space.xl, marginBottom: space.xs },
  exportRow: { flexDirection: 'row', gap: space.md },
  exportColumn: { gap: space.md },
  offscreen: { position: 'absolute', left: -10000, top: 0, opacity: 0 },
  exportBtn: { flex: 1, alignSelf: 'auto' },
  lockedTitle: { marginTop: space.md },
  lockedWhen: { marginTop: space.sm, gap: 2 },
  lockedBody: { marginTop: space.lg },
  lockedFooter: { gap: space.md },
});
