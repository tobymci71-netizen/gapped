import { alpha, color } from '@/theme/tokens';

/**
 * The welcome scene's pigments, from the approved mock (Nightrun-Welcome).
 *
 * These are paint for one illustration, not UI colours: the night's blues as
 * they deepen toward the horizon, a car body's lacquer, the cool white of a
 * sodium-free motorway lamp. Where the mock's value is a design token it is
 * the token; the rest are named for what they paint, here and nowhere else,
 * so no screen picks one up as a colour of its own.
 */
export const pigment = {
  // The sky, top to horizon, and the ground from the horizon down.
  night: color.canvas,
  skyMid: '#090C16',
  skyLow: '#0F1730',
  skyHorizon: '#182446',
  horizon: color.horizon,
  horizonMid: '#22305C',
  horizonEdge: '#101830',
  cloud: '#2B3A6C',
  groundHorizon: '#141C34',
  groundNear: '#0D1222',
  groundFar: '#090B13',
  treeline: '#06070B',
  mast: '#0C1020',
  roadEdge: '#C9D2EA',
  roadEdgeDim: '#3A4562',

  // Light: the motorway's lamps and the oncoming headlights, cool white.
  lampCone: '#C8D6FF',
  lampHalo: '#DCE5FF',
  lampPole: '#1D2436',
  dash: '#E4E9F5',
  headlight: '#EEF2FF',
  headlightFar: '#C8D3F5',
  reflectCool: '#E6ECFF',
  anamorphicBlue: '#8EA6FF',
  anamorphicEdge: '#5F7BD6',
  white: '#FFFFFF',

  // Light: tail lights, red. The brand's red is the light itself.
  red: color.accent,
  redBright: color.accentPress,
  redHot: color.accentHot,
  redCore: color.accentCore,
  trailCore: '#FFE0E0',
  hazeCore: '#FFE1E1',
  stud: '#FF6A6E',
  glintRed: '#FFD3D4',
  glintRedHalo: '#FF6064',

  // The car: lacquer catching the sky, glass, rubber, trim.
  bodyTop: '#151A28',
  bodyMid: '#0A0C13',
  bodyLow: '#050508',
  glassTop: '#121A30',
  glassLow: '#07090F',
  glassGlare: '#9FB0E0',
  rimLight: '#8C9DCC',
  shoulderLight: '#7F90C0',
  shutline: '#252C3E',
  plate: '#0A0D14',
  plateEdge: color.hairline,
  diffuser: '#040406',
  fins: '#161A25',
  exhaust: '#010102',
  exhaustRim: '#4A5266',
  tyre: '#030305',
  mirror: '#0B0E15',
  shadow: '#000000',
} as const;

/** A pigment at an opacity (the mock's fill-opacity / stop-opacity). */
export const tint = alpha;
