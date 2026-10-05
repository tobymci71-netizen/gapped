/**
 * The root layout mounting a second time (app/_layout.tsx).
 *
 * The root ErrorBoundary's Try again renders RootLayout again from scratch, and
 * the recorder outlives it: a drive keeps recording behind the fallback screen.
 * The recorder's init() opens with WAL recovery, which closes every drive still
 * marked recording, so a second init() would close the live drive under the
 * running engine. These pin that a later mount re-arms only what the layout
 * owns (gate, sync) and never init() again — and that a blocked verdict on a
 * later mount still stops a recorder an earlier mount armed.
 *
 * The tests share the layout's module state (recorderArmed) on purpose, as the
 * app does across mounts, so they run in order: the first mount of the file is
 * the process's first.
 */

import React from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { syncFinalizedDrives } from '@/lib/sync';
import { stopBackgroundUpdates } from '@/drive/backgroundTask';
// jest.mock calls below are hoisted above these imports by babel-jest.
import RootLayout from '../../../app/_layout';

const mockInit = jest.fn(async () => undefined);
const mockShutdown = jest.fn(async () => undefined);
let mockGate: { status: 'ok' } | { status: 'blocked'; message: string | null } = { status: 'ok' };

jest.mock('@expo-google-fonts/archivo/400Regular', () => ({ Archivo_400Regular: 1 }));
jest.mock('@expo-google-fonts/archivo/500Medium', () => ({ Archivo_500Medium: 2 }));
jest.mock('@expo-google-fonts/archivo/600SemiBold', () => ({ Archivo_600SemiBold: 3 }));
jest.mock('@expo-google-fonts/archivo/700Bold', () => ({ Archivo_700Bold: 4 }));
jest.mock('expo-font', () => ({ useFonts: () => [true, null] }));
jest.mock('expo-status-bar', () => ({ StatusBar: () => null }));
jest.mock('expo-router', () => {
  function Stack({ children }: { children?: unknown }) {
    return children ?? null;
  }
  function Screen() {
    return null;
  }
  function Protected({ children }: { children?: unknown }) {
    return children ?? null;
  }
  Stack.Screen = Screen;
  Stack.Protected = Protected;
  return { Stack };
});
jest.mock('@/components/ErrorFallback', () => ({ ErrorFallback: () => null }));
jest.mock('@/components/UpdateRequired', () => ({ UpdateRequired: () => null }));
jest.mock('@/lib/observability', () => ({ initObservability: jest.fn(), track: jest.fn() }));
jest.mock('@/lib/version-gate', () => ({ checkVersionGate: async () => mockGate }));
jest.mock('@/lib/sync', () => ({
  haltSync: jest.fn(),
  syncFinalizedDrives: jest.fn(async () => undefined),
  syncIdentity: jest.fn(async () => true),
}));
jest.mock('@/drive/backgroundTask', () => ({
  stopBackgroundUpdates: jest.fn(async () => false),
}));
jest.mock('@/drive/recorder', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports -- jest.mock factories cannot import
  const { create: createStore } = require('zustand');
  // Wrappers, so the factory does not read the mocks before they exist.
  return {
    useDriveStore: createStore(() => ({
      init: () => mockInit(),
      shutdown: () => mockShutdown(),
    })),
  };
});
jest.mock('@/state/profile', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports -- jest.mock factories cannot import
  const { create: createStore } = require('zustand');
  const store = createStore(() => ({ onboarded: true }));
  store.persist = { onFinishHydration: () => () => undefined, hasHydrated: () => true };
  return { useProfile: store };
});

/** Mount the layout and let the version gate and the startup race settle. */
async function mount(): Promise<ReactTestRenderer> {
  let renderer: ReactTestRenderer | undefined;
  await act(async () => {
    renderer = create(<RootLayout />);
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
  if (!renderer) throw new Error('not mounted');
  return renderer;
}

async function unmount(renderer: ReactTestRenderer): Promise<void> {
  await act(async () => renderer.unmount());
}

beforeEach(() => {
  mockGate = { status: 'ok' };
});

test("a second mount (the error boundary's Try again) does not run the recorder's init again", async () => {
  const first = await mount();
  expect(mockInit).toHaveBeenCalledTimes(1);
  expect(syncFinalizedDrives).toHaveBeenCalledTimes(1);
  await unmount(first);

  const second = await mount();
  // WAL recovery ran once, for the cold start, and not under whatever the
  // recorder is doing now.
  expect(mockInit).toHaveBeenCalledTimes(1);
  // What the layout owns is armed again: the upload pass runs on the new mount.
  expect(syncFinalizedDrives).toHaveBeenCalledTimes(2);
  await unmount(second);
});

test('a blocked verdict on a later mount shuts down the recorder an earlier mount armed', async () => {
  const armed = await mount();
  await unmount(armed);
  mockShutdown.mockClear();

  mockGate = { status: 'blocked', message: null };
  const blocked = await mount();
  expect(mockShutdown).toHaveBeenCalledTimes(1);
  expect(stopBackgroundUpdates).toHaveBeenCalled();
  expect(mockInit).toHaveBeenCalledTimes(1);
  await unmount(blocked);
});
