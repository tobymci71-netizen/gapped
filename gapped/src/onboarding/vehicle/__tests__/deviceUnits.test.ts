/**
 * The locale default is offered once per launch, only before onboarding is
 * finished, and a missing native source costs the default, never a crash.
 */

/**
 * iOS's region setting, as React Native's Settings module would report it.
 * The jest environment has no SettingsManager native module (requiring the
 * real one throws, which is itself worth knowing: deviceLocaleTags must
 * survive exactly that). Delegating through a `mock` variable keeps one
 * controllable function across the isolated module registries below.
 */
const mockAppleLocale = jest.fn<unknown, []>();
jest.mock('react-native/Libraries/Settings/Settings', () => ({
  __esModule: true,
  default: { get: (key: string) => (key === 'AppleLocale' ? mockAppleLocale() : undefined) },
}));

type Modules = {
  units: typeof import('../deviceUnits');
  profile: typeof import('@/state/profile');
};

/** A fresh copy of both modules, so the once-per-launch flag starts unset. */
function load(): Modules {
  let loaded: Modules | undefined;
  jest.isolateModules(() => {
    loaded = {
      units: jest.requireActual<Modules['units']>('../deviceUnits'),
      profile: jest.requireActual<Modules['profile']>('@/state/profile'),
    };
  });
  return loaded as Modules;
}

afterEach(() => mockAppleLocale.mockReset());

describe('deviceLocaleTags', () => {
  it('puts the iOS region setting first', () => {
    mockAppleLocale.mockReturnValue('en_GB');
    expect(load().units.deviceLocaleTags()[0]).toBe('en_GB');
  });

  it('survives a source that throws or answers nonsense', () => {
    mockAppleLocale.mockImplementation(() => {
      throw new Error('no native module');
    });
    const { units } = load();
    expect(() => units.deviceLocaleTags()).not.toThrow();
    mockAppleLocale.mockReturnValue(42);
    for (const tag of units.deviceLocaleTags()) expect(typeof tag).toBe('string');
  });
});

describe('offerLocaleUnitDefault', () => {
  it('starts a British phone on mph', () => {
    mockAppleLocale.mockReturnValue('en_GB');
    const { units, profile } = load();
    expect(profile.useProfile.getState().unitPref).toBe('metric');
    units.offerLocaleUnitDefault();
    expect(profile.useProfile.getState().unitPref).toBe('imperial');
  });

  it('leaves a German phone on km/h', () => {
    mockAppleLocale.mockReturnValue('de_DE');
    const { units, profile } = load();
    units.offerLocaleUnitDefault();
    expect(profile.useProfile.getState().unitPref).toBe('metric');
  });

  it('offers once, so the person’s own pick survives coming back', () => {
    mockAppleLocale.mockReturnValue('en_GB');
    const { units, profile } = load();
    units.offerLocaleUnitDefault();
    profile.useProfile.getState().setUnitPref('metric');
    units.offerLocaleUnitDefault();
    expect(profile.useProfile.getState().unitPref).toBe('metric');
  });

  it('keeps the unit of someone already past the unit step, across a relaunch', () => {
    // Killed at a later step with km/h chosen; country is only set after
    // the unit step, so its presence is what says the unit was their pick.
    mockAppleLocale.mockReturnValue('en_GB');
    const { units, profile } = load();
    profile.useProfile.getState().setCountry('GB');
    units.offerLocaleUnitDefault();
    expect(profile.useProfile.getState().unitPref).toBe('metric');
  });

  it('never touches a finished profile', () => {
    mockAppleLocale.mockReturnValue('en_GB');
    const { units, profile } = load();
    profile.useProfile.getState().completeOnboarding();
    units.offerLocaleUnitDefault();
    expect(profile.useProfile.getState().unitPref).toBe('metric');
  });

  it('is offered again after account deletion, in the same launch', () => {
    // Settings > Delete account: reset() puts the unit back to km/h and the
    // person goes straight back through onboarding without a relaunch.
    mockAppleLocale.mockReturnValue('en_GB');
    const { units, profile } = load();
    units.offerLocaleUnitDefault();
    profile.useProfile.getState().completeOnboarding();
    profile.useProfile.getState().reset();
    units.offerLocaleUnitDefault();
    expect(profile.useProfile.getState().unitPref).toBe('metric');
    units.rearmLocaleUnitDefault();
    units.offerLocaleUnitDefault();
    expect(profile.useProfile.getState().unitPref).toBe('imperial');
  });
});
