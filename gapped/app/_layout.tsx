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
import React, { useEffect } from 'react';
import { View } from 'react-native';
import { initObservability } from '@/lib/observability';
import { ensureSession } from '@/lib/supabase';
import { useDriveStore } from '@/drive/recorder';
import { color } from '@/theme/tokens';

export default function RootLayout() {
  const [fontsLoaded] = useFonts({
    Archivo_800ExtraBold,
    Archivo_900Black,
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
  });

  const init = useDriveStore((s) => s.init);

  useEffect(() => {
    initObservability();
    ensureSession();
    // Cold-start WAL recovery: an interrupted drive is finalised, never lost.
    init();
  }, [init]);

  if (!fontsLoaded) {
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
