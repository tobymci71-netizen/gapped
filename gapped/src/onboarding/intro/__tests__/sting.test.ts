/**
 * The launch sting's playback (../sting): one sting per process, in the
 * ambient session the silent switch controls, and released exactly once
 * whichever way the beat ends: finished, never finished, loaded too late, or
 * refused to start. Nothing may throw out of it, least of all from inside a
 * native status event.
 *
 * expo-audio is replaced by a fake player. What is under test is the
 * bookkeeping around it, which is where the leaks and the throws were.
 */

type Status = { isLoaded?: boolean; didJustFinish?: boolean };
type Listener = (s: Status) => void;

class FakePlayer {
  plays = 0;
  removed = 0;
  playing = false;
  throwOnPlay = false;
  readonly listeners = new Set<Listener>();
  isLoaded: boolean;

  constructor(isLoaded: boolean) {
    this.isLoaded = isLoaded;
  }

  play(): void {
    if (this.throwOnPlay) throw new Error('Cannot activate the audio session');
    this.plays += 1;
    this.playing = true;
  }

  remove(): void {
    this.removed += 1;
  }

  addListener(_event: 'playbackStatusUpdate', fn: Listener): { remove(): void } {
    this.listeners.add(fn);
    return { remove: () => this.listeners.delete(fn) };
  }

  /** What the native side does: call every listener, outside any promise. */
  emit(s: Status): void {
    for (const fn of [...this.listeners]) fn(s);
  }
}

type Sting = typeof import('../sting');

/**
 * A fresh copy of the module (its once-per-process flags included) over a
 * fresh fake. Not jest.isolateModules: the module requires expo-audio lazily,
 * after such a sandbox has closed, so every test would get the first test's
 * fake. The registry is reset before each test instead (beforeEach).
 */
function load(
  player: FakePlayer,
  { native = true, modeFails = false }: { native?: boolean; modeFails?: boolean } = {},
) {
  const setAudioModeAsync = jest.fn(() =>
    modeFails ? Promise.reject(new Error('session')) : Promise.resolve(),
  );
  const createAudioPlayer = jest.fn(() => player);
  jest.doMock('expo', () => ({ requireOptionalNativeModule: () => (native ? {} : null) }));
  jest.doMock('expo-audio', () => ({ setAudioModeAsync, createAudioPlayer }));
  const sting = jest.requireActual<Sting>('../sting');
  return { sting, setAudioModeAsync, createAudioPlayer };
}

/** Lets the prepare promise and the play callback queued behind it run. */
async function settle(sting: Sting): Promise<void> {
  await sting.prepareSting();
  await Promise.resolve();
}

beforeEach(() => {
  jest.resetModules();
  jest.useFakeTimers();
});

afterEach(() => {
  jest.useRealTimers();
});

describe('playStingOnce', () => {
  test('ambient session: the silent switch mutes it, and it mixes with music', async () => {
    const { sting, setAudioModeAsync } = load(new FakePlayer(true));
    await settle(sting);
    expect(setAudioModeAsync).toHaveBeenCalledWith(
      expect.objectContaining({
        playsInSilentMode: false,
        interruptionMode: 'mixWithOthers',
        shouldPlayInBackground: false,
        allowsRecording: false,
      }),
    );
  });

  test('plays once per process, however often it is asked', async () => {
    const player = new FakePlayer(true);
    const { sting } = load(player);
    sting.playStingOnce();
    sting.playStingOnce();
    await settle(sting);
    sting.playStingOnce();
    expect(player.plays).toBe(1);
  });

  test('released once when it finishes, with no listener or timer left behind', async () => {
    const player = new FakePlayer(true);
    const { sting } = load(player);
    sting.playStingOnce();
    await settle(sting);
    expect(player.listeners.size).toBe(1);

    player.emit({ isLoaded: true, didJustFinish: true });
    expect(player.removed).toBe(1);
    expect(player.listeners.size).toBe(0);
    expect(jest.getTimerCount()).toBe(0);

    // A stray second finish changes nothing.
    player.emit({ didJustFinish: true });
    jest.runAllTimers();
    expect(player.removed).toBe(1);
  });

  test('a finish event that never comes: released at the ceiling, once', async () => {
    const player = new FakePlayer(true);
    const { sting } = load(player);
    sting.playStingOnce();
    await settle(sting);
    jest.runAllTimers();
    expect(player.plays).toBe(1);
    expect(player.removed).toBe(1);
    expect(player.listeners.size).toBe(0);
  });

  test('a load that lands within the grace period still plays', async () => {
    const player = new FakePlayer(false);
    const { sting } = load(player);
    sting.playStingOnce();
    await settle(sting);
    expect(player.plays).toBe(0);

    jest.advanceTimersByTime(100);
    player.isLoaded = true;
    player.emit({ isLoaded: true });
    expect(player.plays).toBe(1);
    // A second "loaded" status does not start it twice.
    player.emit({ isLoaded: true });
    expect(player.plays).toBe(1);
  });

  test('a load that lands after the moment stays silent and is released', async () => {
    const player = new FakePlayer(false);
    const { sting } = load(player);
    sting.playStingOnce();
    await settle(sting);

    jest.advanceTimersByTime(400);
    player.isLoaded = true;
    player.emit({ isLoaded: true });
    expect(player.plays).toBe(0);
    expect(player.removed).toBe(1);
    expect(jest.getTimerCount()).toBe(0);
  });

  test('never loads: released at the ceiling', async () => {
    const player = new FakePlayer(false);
    const { sting } = load(player);
    sting.playStingOnce();
    await settle(sting);
    jest.runAllTimers();
    expect(player.plays).toBe(0);
    expect(player.removed).toBe(1);
    expect(player.listeners.size).toBe(0);
  });

  test('play() throwing inside a native status event does not escape', async () => {
    const player = new FakePlayer(false);
    player.throwOnPlay = true;
    const { sting } = load(player);
    sting.playStingOnce();
    await settle(sting);

    player.isLoaded = true;
    expect(() => player.emit({ isLoaded: true })).not.toThrow();
    expect(player.removed).toBe(1);
    expect(jest.getTimerCount()).toBe(0);
  });

  test('play() throwing on an already-loaded player does not escape either', async () => {
    const player = new FakePlayer(true);
    player.throwOnPlay = true;
    const { sting } = load(player);
    expect(() => sting.playStingOnce()).not.toThrow();
    await settle(sting);
    expect(player.removed).toBe(1);
  });

  test('a binary without expo-audio is a silent splash, not an error', async () => {
    const player = new FakePlayer(true);
    const { sting, createAudioPlayer } = load(player, { native: false });
    expect(() => sting.playStingOnce()).not.toThrow();
    await expect(sting.prepareSting()).resolves.toBeNull();
    expect(createAudioPlayer).not.toHaveBeenCalled();
  });

  test('a session that cannot be set up is silence, never a rejection', async () => {
    const player = new FakePlayer(true);
    const { sting, createAudioPlayer } = load(player, { modeFails: true });
    sting.playStingOnce();
    await expect(sting.prepareSting()).resolves.toBeNull();
    expect(createAudioPlayer).not.toHaveBeenCalled();
    expect(player.plays).toBe(0);
  });
});
