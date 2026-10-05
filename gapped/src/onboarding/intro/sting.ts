/**
 * The launch sting: the one sound in Gapped (docs/ONBOARDING.md, "Sound").
 *
 * Played once, when the splash G mark lands, and never again in the life of
 * the process. A second mount of the splash (a remount, a reset back into
 * onboarding) stays silent, because "once" is a promise about what the person
 * hears, not about how many times a component rendered.
 *
 * The asset is generated, not sourced: scripts/generate-sting.py writes
 * assets/sounds/launch-sting.wav.
 */

import { requireOptionalNativeModule } from 'expo';
import type { AudioPlayer, AudioStatus } from 'expo-audio';
import { STING_GRACE_MS } from './introTimeline';

type ExpoAudio = typeof import('expo-audio');

const STING_ASSET = require('../../../assets/sounds/launch-sting.wav');

/**
 * Longest the player is kept once the sting is asked for: the 1.6 s sting,
 * the STING_GRACE_MS it may start late by, and slack.
 */
const RELEASE_AFTER_MS = 4000;

/**
 * expo-audio, or null when this binary does not contain it.
 *
 * expo-audio looks its native module up as it is evaluated, and throws if the
 * binary was built without it (a dev client older than the dependency). So it
 * is neither imported statically, which would throw while the first screen of
 * the app loads, nor required inside a try/catch: a require made at run time
 * sits outside Metro's module guard, which reports a module that throws as a
 * FATAL error rather than handing the exception to the caller. Seen on a
 * stale dev client: the catch never ran and the splash went under a red
 * error screen. Asking for the native module first, which returns null
 * rather than throwing, is the only check that comes before the throw. A
 * missing sound is the right failure for a missing sound module.
 */
let audio: ExpoAudio | null | undefined;
function loadAudio(): ExpoAudio | null {
  if (audio !== undefined) return audio;
  audio = null;
  if (requireOptionalNativeModule('ExpoAudio') == null) return audio;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports -- optional native module, see above
    audio = require('expo-audio') as ExpoAudio;
  } catch {
    audio = null;
  }
  return audio;
}

let preparing: Promise<AudioPlayer | null> | null = null;
let played = false;

/**
 * Sets the audio session up and loads the sting, so it can start the moment
 * the mark lands. Safe to call more than once.
 *
 * The session is AMBIENT (`playsInSilentMode: false`, `mixWithOthers`):
 *  - the ring/silent switch silences it, as the reference does. expo-audio's
 *    own default is to play through silent mode, so this has to be said.
 *  - it mixes with whatever is already playing. Opening an app must never
 *    pause someone's music for a one-second flourish.
 * Nothing else in the app plays audio, so this is the app's audio mode.
 */
export function prepareSting(): Promise<AudioPlayer | null> {
  preparing ??= (async () => {
    const mod = loadAudio();
    if (!mod) return null;
    try {
      await mod.setAudioModeAsync({
        playsInSilentMode: false,
        interruptionMode: 'mixWithOthers',
        shouldPlayInBackground: false,
        allowsRecording: false,
      });
      return mod.createAudioPlayer(STING_ASSET);
    } catch {
      return null;
    }
  })();
  return preparing;
}

/**
 * Plays the sting if it has not played yet in this process.
 *
 * It starts only if it can start within STING_GRACE_MS of being asked. The
 * player is created on mount, a good second before the landing, so it is
 * normally loaded and starts at once. A slow first load (a dev build pulling
 * the asset from Metro) misses its moment and stays silent rather than playing
 * over the move into the header.
 *
 * Every way this can end (finished, too late, never loaded, failed to start)
 * goes through one `finish`, which runs once: it clears the ceiling timer,
 * drops the status listener and releases the player. It used to be two
 * listeners and two timers that each released on their own, and the timers
 * outlived the player.
 *
 * Nothing here may throw. A late load starts playback from inside a native
 * status event, where an exception is not this promise's to catch: it would
 * reach the global handler as an uncaught error. `play()` can throw (iOS
 * refuses to activate the session during a phone call, for one), so it is
 * guarded like the rest; a sting that cannot play is simply not heard.
 */
export function playStingOnce(): void {
  if (played) return;
  played = true;
  const askedAt = Date.now();
  const inTime = () => Date.now() - askedAt <= STING_GRACE_MS;

  prepareSting()
    .then((player) => {
      if (!player) return;
      let subscription: { remove(): void } | null = null;
      let ceiling: ReturnType<typeof setTimeout> | undefined;

      const finish = once(() => {
        clearTimeout(ceiling);
        quietly(() => subscription?.remove());
        quietly(() => player.remove());
      });
      /** One status listener at a time: loading, then playing. */
      const listen = (onStatus: (s: AudioStatus) => void) => {
        quietly(() => subscription?.remove());
        subscription = player.addListener('playbackStatusUpdate', onStatus);
      };
      const start = once(() => {
        if (!inTime()) {
          finish();
          return;
        }
        try {
          player.play();
        } catch {
          finish();
          return;
        }
        listen((s) => {
          if (s.didJustFinish) finish();
        });
      });

      // A ceiling on the whole beat, for a load or a finish event that never
      // arrives (an interruption, a route change): the sting and then some.
      ceiling = setTimeout(finish, RELEASE_AFTER_MS);
      if (player.isLoaded) {
        start();
        return;
      }
      listen((s) => {
        if (s.isLoaded) start();
      });
    })
    .catch(() => undefined);
}

/** Runs a clean-up step whose failure changes nothing for the person. */
function quietly(fn: () => void): void {
  try {
    fn();
  } catch {
    // The player is already gone; there is nothing left to undo.
  }
}

function once(fn: () => void): () => void {
  let done = false;
  return () => {
    if (done) return;
    done = true;
    fn();
  };
}
