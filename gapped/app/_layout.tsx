import {
  Archivo_800ExtraBold,
  Archivo_900Black,
} from '@expo-google-fonts/archivo';
import {
  Inter_400Regular,
  Inter_500Medium,
  Inter_600SemiBold,
} from '@expo-google-fonts/inter';
import { useFonts } from 'expo-font';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import React, { useEffect, useState, useSyncExternalStore } from 'react';
import { AppState, Platform, View } from 'react-native';
import { UpdateRequired } from '@/components/UpdateRequired';
import { initObservability, track } from '@/lib/observability';
import { checkVersionGate, type VersionGate } from '@/lib/version-gate';
import { haltSync, syncFinalizedDrives, syncIdentity } from '@/lib/sync';
import { stopBackgroundUpdates } from '@/drive/backgroundTask';
import { useDriveStore } from '@/drive/recorder';
import { useProfile } from '@/state/profile';
import { color } from '@/theme/tokens';

/**
 * How long to wait for fonts before giving up and rendering in the system face.
 *
 * Not a motion value, so deliberately not from theme/motion.ts. Fonts are
 * bundled locally rather than fetched, so this should never fire — it exists
 * because the alternative when it does is a permanently blank canvas the user
 * cannot escape, report, or distinguish from a crash.
 *
 * The same deadline bounds the wait for the persisted profile (below), for the
 * same reason: zustand never reports a failed read as finished.
 */
const FONT_TIMEOUT_MS = 5000;

/**
 * How long startup waits for the version gate before arming the recorder
 * anyway.
 *
 * The recorder and the upload start only once the gate has answered: a blocked
 * build must not record or upload behind the Update Required screen, and that
 * screen used to go up while sensors, auto-detection and sync ran underneath
 * it. The wait is bounded because the gate fails open (version-gate.ts) — with
 * no signal the app must still record. Arming a few seconds late costs nothing
 * a drive needs: auto-start holds 30 s of speed before it begins.
 *
 * The screens wait for the same answer, behind the same blank canvas as the
 * fonts. init() opens with WAL recovery, which closes every drive still marked
 * recording — so a drive started from the UI before it ran (Enable location,
 * then Start, on a slow network) would be closed under the live engine as
 * "recovered". Holding the UI also means a block that answers inside the wait
 * never shows the app at all. Normally the wait is one round trip, overlapped
 * with the font load; three seconds only when the network hangs.
 */
const GATE_TIMEOUT_MS = 3000;

const GATE_OK: VersionGate = { status: 'ok' };

type Profile = ReturnType<typeof useProfile.getState>;

/**
 * Fields the server keeps a copy of (sync.ts pushIdentity). The garage's extra
 * vehicles are among them: without that, a car added after onboarding waited
 * for the next drive upload or foreground to reach the server. The onboarding
 * answers need no entry — flipping `onboarded` already pushes them, and every
 * later pass retries them until they land (sync.ts pushAnswers).
 */
function identityChanged(next: Profile, prev: Profile): boolean {
  return (
    next.onboarded !== prev.onboarded ||
    next.username !== prev.username ||
    next.country !== prev.country ||
    next.unitPref !== prev.unitPref ||
    next.vehicleId !== prev.vehicleId ||
    next.extraVehicles !== prev.extraVehicles
  );
}

const subscribeProfileHydration = (onChange: () => void) =>
  useProfile.persist.onFinishHydration(onChange);
const profileHydrated = () => useProfile.persist.hasHydrated();

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts({
    Archivo_800ExtraBold,
    Archivo_900Black,
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
  });
  const [fontsTimedOut, setFontsTimedOut] = useState(false);
  const [gate, setGate] = useState<VersionGate>(GATE_OK);
  // True once startup has either armed the recorder or decided not to. See
  // GATE_TIMEOUT_MS for why no screen renders before it.
  const [gateSettled, setGateSettled] = useState(false);
  // The onboarding guard below reads `onboarded`, which is the first-run
  // default until AsyncStorage has been read back. Rendering the stack before
  // then would route a returning driver into onboarding.
  const hydrated = useSyncExternalStore(subscribeProfileHydration, profileHydrated);
  const onboarded = useProfile((s) => s.onboarded);

  const init = useDriveStore((s) => s.init);

  useEffect(() => {
    initObservability();
    let live = true;
    let started = false;
    let blocked = false;
    let waitTimer: ReturnType<typeof setTimeout> | undefined;

    // Fails open by design — see version-gate.ts. A verdict that arrives after
    // the wait below still takes effect: blocked is blocked, however late.
    const verdict = checkVersionGate(Platform.OS === 'android' ? 'android' : 'ios').catch(
      () => GATE_OK,
    );
    verdict.then((g) => {
      if (g.status === 'blocked') {
        blocked = true;
        // Also stops the upload the recorder starts itself at a drive's end,
        // which this effect cannot reach once it has armed the recorder.
        haltSync();
        // A verdict that lands after the wait finds the recorder already armed:
        // a live drive, the watchers and possibly background GPS, all running
        // behind Update Required. Turn every one of them off.
        if (started) useDriveStore.getState().shutdown().catch(() => undefined);
      }
      if (live) setGate(g);
    });

    // Anonymous-first session, then the profile and any drives recorded
    // offline. Re-run on every return to the foreground: that is what recovers
    // an offline first launch, and what uploads a drive that ended while the
    // network was down, without waiting for a cold start.
    const syncNow = () => {
      if (started && !blocked) syncFinalizedDrives().catch(() => undefined);
    };

    const waited = new Promise<VersionGate>((resolve) => {
      waitTimer = setTimeout(() => resolve(GATE_OK), GATE_TIMEOUT_MS);
    });
    Promise.race([verdict, waited]).then((g) => {
      clearTimeout(waitTimer);
      if (!live) return;
      if (g.status !== 'blocked') {
        started = true;
        // Cold-start WAL recovery: an interrupted drive is finalised, never
        // lost. Its first step is synchronous, so it has run before the screens
        // that can start a drive are let in below.
        init();
        syncNow();
      } else {
        // init() is also what stops a background location session left running
        // by a drive the last process never got to end, which expo-task-manager
        // restores natively at launch (see recorder.ts init). A blocked build
        // skips init(), so without this the location indicator stayed on
        // behind Update Required, indefinitely, feeding fixes to nothing.
        stopBackgroundUpdates().catch(() => undefined);
      }
      setGateSettled(true);
    });

    const appState = AppState.addEventListener('change', (s) => {
      if (s === 'active') syncNow();
    });

    // Push the profile as soon as onboarding completes, and whenever it changes
    // after that — not only alongside a drive upload. Until the server has the
    // vehicle row and the username, Decode VIN fails and friends cannot find
    // this driver.
    const unsubscribeProfile = useProfile.subscribe((next, prev) => {
      if (started && !blocked && next.onboarded && identityChanged(next, prev)) {
        syncIdentity().catch(() => undefined);
      }
    });

    return () => {
      live = false;
      clearTimeout(waitTimer);
      appState.remove();
      unsubscribeProfile();
    };
  }, [init]);

  useEffect(() => {
    const t = setTimeout(() => setFontsTimedOut(true), FONT_TIMEOUT_MS);
    return () => clearTimeout(t);
  }, []);

  // A font failure must never be silent: it is invisible in the UI (the app
  // simply renders in the system face) but it is the difference between the
  // house typography and something else entirely, so it has to reach telemetry.
  useEffect(() => {
    if (fontError) {
      console.warn('[gapped] font load failed, falling back to system fonts', fontError);
      track('font_load_failed', { reason: String(fontError?.message ?? fontError) });
    } else if (fontsTimedOut && !fontsLoaded) {
      console.warn(`[gapped] fonts still loading after ${FONT_TIMEOUT_MS}ms, falling back`);
      track('font_load_timeout', { timeout_ms: FONT_TIMEOUT_MS });
    }
  }, [fontError, fontsTimedOut, fontsLoaded]);

  // Render once fonts are ready OR once we have decided to stop waiting. The
  // app in the wrong typeface is recoverable; a blank screen forever is not.
  // The profile read is local and normally lands long before the fonts; past
  // the deadline the guard runs on first-run defaults rather than never. The
  // gate needs no deadline here: it settles within GATE_TIMEOUT_MS by itself.
  if (
    (!fontsLoaded && !fontError && !fontsTimedOut) ||
    (!hydrated && !fontsTimedOut) ||
    !gateSettled
  ) {
    return <View style={{ flex: 1, backgroundColor: color.canvas }} />;
  }

  // Replaces the whole app rather than covering it. A blocked build must not
  // be able to record a drive behind a modal — which is also why the startup
  // effect never arms the recorder or uploads once the verdict is blocked.
  if (gate.status === 'blocked') {
    return (
      <>
        <StatusBar style="light" />
        <UpdateRequired message={gate.message} />
      </>
    );
  }

  return (
    <>
      <StatusBar style="light" />
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: color.canvas },
        }}
      >
        {/*
          Onboarding is a one-way door, and the guard is what makes it one.
          Without it, deleting the account replaced only the Settings screen,
          leaving the old tabs mounted underneath onboarding: Back or an edge
          swipe walked a wiped, never-onboarded profile into the app past the
          safety acknowledgement, and finishing onboarding again stacked a
          second tab navigator on the first. A deep link into the tabs skipped
          onboarding the same way.

          Flipping `onboarded` now swaps the whole stack: reset() lands on
          onboarding with nothing behind it, completeOnboarding() lands on the
          tabs with nothing behind them. (tabs) comes first because the stack
          falls back to the first allowed screen when its routes are all
          removed. index stays outside both groups — it is the cold-start
          redirect. Any new root screen that assumes a finished profile goes in
          the first group.

          plans is in neither: it is the published matrix and assumes nothing
          about the profile, and it is where every Pro lock leads (useGoPro),
          onboarding's garage step included. Behind the onboarded guard, that
          lock had nowhere to land. It is declared after both groups so it is
          never the screen the stack falls back to.
        */}
        <Stack.Protected guard={onboarded}>
          <Stack.Screen name="(tabs)" />
          <Stack.Screen name="settings" />
          <Stack.Screen name="friends" />
          <Stack.Screen name="drive/[id]" />
        </Stack.Protected>
        <Stack.Protected guard={!onboarded}>
          <Stack.Screen name="onboarding" />
        </Stack.Protected>
        <Stack.Screen name="plans" />
      </Stack>
    </>
  );
}
