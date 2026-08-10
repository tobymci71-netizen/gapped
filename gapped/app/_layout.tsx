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
import React, { useEffect, useState } from 'react';
import { View } from 'react-native';
import { initObservability, track } from '@/lib/observability';
import { ensureSession } from '@/lib/supabase';
import { syncFinalizedDrives } from '@/lib/sync';
import { useDriveStore } from '@/drive/recorder';
import { color } from '@/theme/tokens';

/**
 * How long to wait for fonts before giving up and rendering in the system face.
 *
 * Not a motion value, so deliberately not from theme/motion.ts. Fonts are
 * bundled locally rather than fetched, so this should never fire — it exists
 * because the alternative when it does is a permanently blank canvas the user
 * cannot escape, report, or distinguish from a crash.
 */
const FONT_TIMEOUT_MS = 5000;

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts({
    Archivo_800ExtraBold,
    Archivo_900Black,
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
  });
  const [fontsTimedOut, setFontsTimedOut] = useState(false);

  const init = useDriveStore((s) => s.init);

  useEffect(() => {
    initObservability();
    // Cold-start WAL recovery: an interrupted drive is finalised, never lost.
    init();
    // Anonymous-first session, then push any drives recorded offline.
    ensureSession().then(() => syncFinalizedDrives().catch(() => undefined));
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
  if (!fontsLoaded && !fontError && !fontsTimedOut) {
    return <View style={{ flex: 1, backgroundColor: color.canvas }} />;
  }

  return (
    <>
      <StatusBar style="light" />
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: color.canvas },
        }}
      />
    </>
  );
}
