/**
 * Body-type inference — maps a (kind, make, model) triple onto the silhouette we draw.
 * Layered most-specific-first: make+model override -> model override -> make naming
 * scheme -> single-shape make default -> keyword heuristics -> fallback.
 * Pure and deterministic: every table is a module constant, nothing is read at call time.
 */

import type { VehicleKindKey } from './catalog';

export type BodyType =
  | 'hatchback'
  | 'saloon'
  | 'estate'
  | 'coupe'
  | 'roadster'
  | 'supercar'
  | 'suv'
  | 'pickup'
  | 'van'
  | 'motorbike'
  | 'cruiser'
  | 'scooter';

const LABELS: Record<BodyType, string> = {
  hatchback: 'Hatchback',
  saloon: 'Saloon',
  estate: 'Estate',
  coupe: 'Coupe',
  roadster: 'Roadster',
  supercar: 'Supercar',
  suv: 'SUV',
  pickup: 'Pickup',
  van: 'Van',
  motorbike: 'Motorbike',
  cruiser: 'Cruiser',
  scooter: 'Scooter',
};

export function bodyTypeLabel(b: BodyType): string {
  return LABELS[b] ?? 'Saloon';
}

/** Whitespace-collapsed lower case — the form keyword rules match against. */
function norm(value: string): string {
  return (typeof value === 'string' ? value : '').toLowerCase().trim().replace(/\s+/g, ' ');
}

/** Alphanumerics only — the form lookup tables are keyed by. 'MX-5' and ' mx 5 ' both -> 'mx5'. */
function compact(value: string): string {
  return (typeof value === 'string' ? value : '').toLowerCase().replace(/[^a-z0-9]/g, '');
}

/** Own-property lookup: a model literally called 'constructor' must not hit Object.prototype. */
function lookup<T>(table: Record<string, T>, key: string): T | undefined {
  return Object.prototype.hasOwnProperty.call(table, key) ? table[key] : undefined;
}

/* ---------------------------------------------------------------- cars */

/** Only for names that mean different shapes at different marques. */
const CAR_MAKE_MODEL: Record<string, BodyType> = {
  'lamborghini|roadster': 'supercar',
  'lamborghini|urus': 'suv',
  'ferrari|purosangue': 'suv',
  'ferrari|california': 'roadster',
  'ferrari|californiat': 'roadster',
  'ferrari|portofino': 'roadster',
  'ferrari|portofinom': 'roadster',
  'ferrari|roma': 'coupe',
  'jeep|comanche': 'pickup',
  'jeep|gladiator': 'pickup',
  'jeep|j10': 'pickup',
  'jeep|j20': 'pickup',
  'subaru|rx': 'saloon',
  'subaru|xt': 'coupe',
  'subaru|xt6': 'coupe',
  'nissan|nx': 'coupe',
  'dodge|ramwagon': 'van',
  'dodge|ramvan': 'van',
  'dodge|miniram': 'van',
  'mercedesbenz|rclass': 'van',
};

const CAR_MODELS: Record<string, BodyType> = {
  // Volkswagen
  golf: 'hatchback',
  golfgti: 'hatchback',
  golfr: 'hatchback',
  golfiii: 'hatchback',
  egolf: 'hatchback',
  gti: 'hatchback',
  gli: 'saloon',
  r32: 'hatchback',
  rabbit: 'hatchback',
  beetle: 'hatchback',
  polo: 'hatchback',
  jetta: 'saloon',
  jettagli: 'saloon',
  passat: 'saloon',
  arteon: 'saloon',
  cc: 'saloon',
  phaeton: 'saloon',
  corrado: 'coupe',
  scirocco: 'coupe',
  eos: 'roadster',
  cabrio: 'roadster',
  cabriolet: 'roadster',
  golfalltrack: 'estate',
  golfsportwagen: 'estate',
  jettasportwagen: 'estate',
  jettawagon: 'estate',
  atlas: 'suv',
  atlascrosssport: 'suv',
  tiguan: 'suv',
  tiguanlimited: 'suv',
  touareg: 'suv',
  taos: 'suv',
  id4: 'suv',
  idbuzz: 'van',
  routan: 'van',
  eurovan: 'van',
  vanagon: 'van',
  // Toyota
  rav4: 'suv',
  highlander: 'suv',
  grandhighlander: 'suv',
  '4runner': 'suv',
  landcruiser: 'suv',
  fjcruiser: 'suv',
  sequoia: 'suv',
  venza: 'suv',
  chr: 'suv',
  corollacross: 'suv',
  crownsignia: 'suv',
  bz: 'suv',
  bz4x: 'suv',
  bzwoodland: 'suv',
  sienna: 'van',
  previa: 'van',
  camry: 'saloon',
  camrysolara: 'coupe',
  avalon: 'saloon',
  crown: 'saloon',
  cressida: 'saloon',
  mirai: 'saloon',
  prius: 'hatchback',
  priusc: 'hatchback',
  priusv: 'estate',
  corolla: 'hatchback',
  grcorolla: 'hatchback',
  corollamatrix: 'estate',
  yaris: 'hatchback',
  echo: 'hatchback',
  starlet: 'hatchback',
  tercel: 'hatchback',
  paseo: 'coupe',
  celica: 'coupe',
  supra: 'coupe',
  mr2: 'coupe',
  '86': 'coupe',
  gr86: 'coupe',
  hilux: 'pickup',
  tacoma: 'pickup',
  tundra: 'pickup',
  // Honda / Acura
  civic: 'hatchback',
  civicsi: 'hatchback',
  civictyper: 'hatchback',
  fit: 'hatchback',
  jazz: 'hatchback',
  insight: 'saloon',
  crz: 'coupe',
  delsol: 'roadster',
  s2000: 'roadster',
  prelude: 'coupe',
  accord: 'saloon',
  accordcrosstour: 'hatchback',
  crosstour: 'hatchback',
  clarity: 'saloon',
  crv: 'suv',
  hrv: 'suv',
  pilot: 'suv',
  passport: 'suv',
  element: 'suv',
  prologue: 'suv',
  odyssey: 'van',
  ridgeline: 'pickup',
  nsx: 'supercar',
  mdx: 'suv',
  rdx: 'suv',
  zdx: 'suv',
  adx: 'suv',
  slx: 'suv',
  integra: 'hatchback',
  rsx: 'coupe',
  cl: 'coupe',
  tl: 'saloon',
  tlx: 'saloon',
  tsx: 'saloon',
  ilx: 'saloon',
  rl: 'saloon',
  rlx: 'saloon',
  legend: 'saloon',
  vigor: 'saloon',
  // Nissan
  gtr: 'coupe',
  '350z': 'coupe',
  '370z': 'coupe',
  '300zx': 'coupe',
  '200sx': 'coupe',
  '240sx': 'coupe',
  nissanz: 'coupe',
  altima: 'saloon',
  maxima: 'saloon',
  sentra: 'saloon',
  versa: 'saloon',
  versanote: 'hatchback',
  micra: 'hatchback',
  cube: 'hatchback',
  leaf: 'hatchback',
  juke: 'suv',
  kicks: 'suv',
  rogue: 'suv',
  roguesport: 'suv',
  murano: 'suv',
  pathfinder: 'suv',
  armada: 'suv',
  xterra: 'suv',
  xtrail: 'suv',
  ariyahatchback: 'suv',
  quest: 'van',
  nv200: 'van',
  frontier: 'pickup',
  titan: 'pickup',
  // Ford
  f100: 'pickup',
  f150: 'pickup',
  f250: 'pickup',
  f350: 'pickup',
  f450: 'pickup',
  f550: 'pickup',
  ranger: 'pickup',
  explorersporttrac: 'pickup',
  mustang: 'coupe',
  mustanggtd: 'supercar',
  mustangmache: 'suv',
  thunderbird: 'coupe',
  probe: 'coupe',
  gt: 'supercar',
  escort: 'hatchback',
  fiesta: 'hatchback',
  focus: 'hatchback',
  festiva: 'hatchback',
  aspire: 'hatchback',
  cmax: 'hatchback',
  fusion: 'saloon',
  taurus: 'saloon',
  taurusx: 'estate',
  contour: 'saloon',
  crownvictoria: 'saloon',
  fivehundred: 'saloon',
  escape: 'suv',
  edge: 'suv',
  expedition: 'suv',
  expeditionmax: 'suv',
  explorer: 'suv',
  explorersport: 'suv',
  expeditionel: 'suv',
  excursion: 'suv',
  bronco: 'suv',
  broncoii: 'suv',
  broncosport: 'suv',
  ecosport: 'suv',
  flex: 'estate',
  freestyle: 'estate',
  freestar: 'van',
  windstar: 'van',
  aerostar: 'van',
  transit: 'van',
  e150: 'van',
  e250: 'van',
  e350: 'van',
  // Subaru
  impreza: 'hatchback',
  wrx: 'saloon',
  legacy: 'saloon',
  outback: 'estate',
  forester: 'suv',
  crosstrek: 'suv',
  xvcrosstrek: 'suv',
  ascent: 'suv',
  solterra: 'suv',
  b9tribeca: 'suv',
  trailseeker: 'suv',
  brz: 'coupe',
  svx: 'coupe',
  baja: 'pickup',
  brat: 'pickup',
  justy: 'hatchback',
  loyale: 'estate',
  gl: 'estate',
  gl10: 'estate',
  glf: 'estate',
  // Mini
  cooper: 'hatchback',
  hardtop: 'hatchback',
  clubman: 'estate',
  countryman: 'suv',
  paceman: 'coupe',
  cooperconvertible: 'roadster',
  coopercoupe: 'coupe',
  cooperroadster: 'roadster',
  // Hyundai / Kia / Genesis
  tucson: 'suv',
  santafe: 'suv',
  santafesport: 'suv',
  santafexl: 'suv',
  kona: 'suv',
  konan: 'suv',
  palisade: 'suv',
  venue: 'suv',
  veracruz: 'suv',
  nexo: 'suv',
  ioniq: 'hatchback',
  ioniq5: 'suv',
  ioniq5n: 'suv',
  ioniq9: 'suv',
  ioniq6: 'saloon',
  accent: 'hatchback',
  elantra: 'saloon',
  elantragt: 'hatchback',
  elantratouring: 'estate',
  sonata: 'saloon',
  azera: 'saloon',
  equus: 'saloon',
  genesiscoupe: 'coupe',
  veloster: 'hatchback',
  tiburon: 'coupe',
  scoupe: 'coupe',
  excel: 'hatchback',
  pony: 'hatchback',
  entourage: 'van',
  sportage: 'suv',
  sorento: 'suv',
  telluride: 'suv',
  seltos: 'suv',
  borrego: 'suv',
  niro: 'suv',
  ev3: 'suv',
  ev6: 'suv',
  ev9: 'suv',
  soul: 'hatchback',
  rio: 'hatchback',
  carnival: 'van',
  sedona: 'van',
  rondo: 'van',
  forte: 'saloon',
  fortekoup: 'coupe',
  k4: 'saloon',
  k5: 'saloon',
  k900: 'saloon',
  optima: 'saloon',
  cadenza: 'saloon',
  amanti: 'saloon',
  stinger: 'hatchback',
  // Chevrolet / Dodge
  silverado: 'pickup',
  s10pickup: 'pickup',
  avalanche: 'pickup',
  dakota: 'pickup',
  ram: 'pickup',
  ramchassiscab: 'pickup',
  tahoe: 'suv',
  suburban: 'suv',
  blazer: 'suv',
  trailblazer: 'suv',
  traverse: 'suv',
  equinox: 'suv',
  captivasport: 'suv',
  trax: 'suv',
  tracker: 'suv',
  ramcharger: 'suv',
  durango: 'suv',
  journey: 'suv',
  nitro: 'suv',
  hornet: 'suv',
  uplander: 'van',
  venture: 'van',
  express: 'van',
  luminaapv: 'van',
  corvette: 'coupe',
  camaro: 'coupe',
  montecarlo: 'coupe',
  beretta: 'coupe',
  challenger: 'coupe',
  stealth: 'coupe',
  viper: 'supercar',
  charger: 'saloon',
  malibu: 'saloon',
  impala: 'saloon',
  caprice: 'saloon',
  cruze: 'saloon',
  cavalier: 'saloon',
  cobalt: 'saloon',
  intrepid: 'saloon',
  neon: 'saloon',
  dart: 'saloon',
  stratus: 'saloon',
  magnum: 'estate',
  hhr: 'estate',
  sonic: 'hatchback',
  spark: 'hatchback',
  aveo: 'hatchback',
  bolt: 'hatchback',
  boltev: 'hatchback',
  bolteuv: 'suv',
  volt: 'hatchback',
  chevette: 'hatchback',
  metro: 'hatchback',
  onix: 'hatchback',
  caliber: 'hatchback',
  // Fiat / Alfa Romeo / Lotus
  '500': 'hatchback',
  '500e': 'hatchback',
  '500l': 'hatchback',
  '500x': 'suv',
  '124spider': 'roadster',
  spider2000: 'roadster',
  ducato: 'van',
  freemont: 'suv',
  strada: 'pickup',
  spider: 'roadster',
  '4c': 'roadster',
  stelvio: 'suv',
  tonale: 'suv',
  giulia952: 'saloon',
  gtv6: 'coupe',
  elise: 'roadster',
  exige: 'coupe',
  evora: 'coupe',
  emira: 'coupe',
  esprit: 'coupe',
  turboesprit: 'coupe',
  elan: 'roadster',
  europa: 'coupe',
  elite: 'coupe',
  eclat: 'coupe',
  eleven: 'roadster',
  '2eleven': 'roadster',
  '340r': 'roadster',
  eletre: 'suv',
  // Aston Martin / Bentley / Rolls-Royce / Maserati
  dbx: 'suv',
  vantage: 'coupe',
  v8vantage: 'coupe',
  v12vantage: 'coupe',
  db7: 'coupe',
  db9: 'coupe',
  db11: 'coupe',
  db12: 'coupe',
  dbs: 'coupe',
  vanquish: 'coupe',
  rapide: 'saloon',
  lagonda: 'saloon',
  valhalla: 'supercar',
  valkyrie: 'supercar',
  virage: 'coupe',
  bentayga: 'suv',
  continental: 'coupe',
  flyingspur: 'saloon',
  arnage: 'saloon',
  mulsanne: 'saloon',
  azure: 'roadster',
  brooklands: 'coupe',
  cullinan: 'suv',
  ghost: 'saloon',
  phantom: 'saloon',
  wraith: 'coupe',
  dawn: 'roadster',
  spectre: 'coupe',
  silverspirit: 'saloon',
  silverspur: 'saloon',
  silverseraph: 'saloon',
  corniche: 'roadster',
  camargue: 'coupe',
  touringlimousine: 'saloon',
  levante: 'suv',
  grecale: 'suv',
  ghibli: 'saloon',
  quattroporte: 'saloon',
  granturismo: 'coupe',
  grancabrio: 'roadster',
  mc20: 'supercar',
  mcpura: 'supercar',
  spyder: 'roadster',
  biturbo: 'coupe',
  merak: 'coupe',
  coupe: 'coupe',
  roadster: 'roadster',
  // Mitsubishi / Suzuki
  outlander: 'suv',
  outlandersport: 'suv',
  eclipsecross: 'suv',
  montero: 'suv',
  monterosport: 'suv',
  endeavor: 'suv',
  rvr: 'suv',
  raider: 'pickup',
  mightymax: 'pickup',
  eclipse: 'coupe',
  '3000gt': 'coupe',
  starion: 'coupe',
  lancer: 'saloon',
  lancerevolution: 'saloon',
  lancersportback: 'hatchback',
  mirage: 'hatchback',
  mirageg4: 'saloon',
  galant: 'saloon',
  diamante: 'saloon',
  imiev: 'hatchback',
  vitara: 'suv',
  grandvitara: 'suv',
  grandvitaraxl7: 'suv',
  xl7: 'suv',
  sidekick: 'suv',
  samurai: 'suv',
  x90: 'suv',
  swift: 'hatchback',
  sx4: 'hatchback',
  aerio: 'saloon',
  esteem: 'saloon',
  forenza: 'saloon',
  kizashi: 'saloon',
  glc: 'hatchback',
  // Common names the vPIC lists spell differently but users type anyway.
  miata: 'roadster',
  mx5: 'roadster',
  rangerover: 'suv',
  defender: 'suv',
  wrangler: 'suv',
  gwagen: 'suv',
  huracan: 'supercar',
  aventador: 'supercar',
  cybertruck: 'pickup',
  sprinter: 'van',
  caddy: 'van',
  vito: 'van',
  berlingo: 'van',
  golfplus: 'van',
  up: 'hatchback',
  corsa: 'hatchback',
  astra: 'hatchback',
  clio: 'hatchback',
  megane: 'hatchback',
  qashqai: 'suv',
  duster: 'suv',
};

/** Marques that only ever make one silhouette. */
const CAR_MAKE_DEFAULTS: Record<string, BodyType> = {
  ferrari: 'supercar',
  lamborghini: 'supercar',
  mclaren: 'supercar',
  pagani: 'supercar',
  bugatti: 'supercar',
  koenigsegg: 'supercar',
  czinger: 'supercar',
  rimac: 'supercar',
  spyker: 'supercar',
  mosler: 'supercar',
  glickenhaus: 'supercar',
  landrover: 'suv',
  landroversantana: 'suv',
  jeep: 'suv',
  hummer: 'suv',
  humvee: 'suv',
  ineos: 'suv',
  scout: 'suv',
  morgan: 'roadster',
  ram: 'pickup',
};

/**
 * Marques whose range is an alphanumeric scheme rather than names. `c` is the
 * compacted model. Returning undefined falls through to the keyword layer.
 */
type MakeRule = (c: string) => BodyType | undefined;

const BMW_SERIES: Record<string, BodyType> = {
  '1': 'hatchback',
  '2': 'coupe',
  '3': 'saloon',
  '4': 'coupe',
  '5': 'saloon',
  '6': 'coupe',
  '7': 'saloon',
  '8': 'coupe',
};

const CAR_MAKE_RULES: Record<string, MakeRule> = {
  bmw: (c) => {
    if (/^x[1-7]/.test(c) || c === 'xm' || /^ix/.test(c)) return 'suv';
    if (/^z[3-8]/.test(c)) return 'roadster';
    if (c === 'i3') return 'hatchback';
    if (c === 'i8') return 'supercar';
    if (/^i[4-7]$/.test(c)) return 'saloon';
    const m = c.match(/^(?:m|activehybrid)?(\d)/);
    return m ? lookup(BMW_SERIES, m[1]) : undefined;
  },
  audi: (c) => {
    if (/(avant|allroad)/.test(c)) return 'estate';
    if (/^(?:rs|s)?q\d/.test(c)) return 'suv';
    if (/etrongt/.test(c)) return 'saloon';
    if (/^etron/.test(c)) return 'suv';
    if (/^tt/.test(c)) return 'coupe';
    if (c === 'r8') return 'supercar';
    const m = c.match(/^(rs|s|a)(\d)/);
    if (!m) return undefined;
    if (m[2] === '1' || m[2] === '3') return 'hatchback';
    if (m[2] === '5' || m[2] === '7') return 'coupe';
    if (m[2] === '6' && m[1] === 'rs') return 'estate';
    return 'saloon';
  },
  mercedesbenz: (c) => {
    if (c.includes('suv')) return 'suv';
    if (/^gl/.test(c) || /^gclass/.test(c) || /^(?:ml|m)class/.test(c) || /^eqb/.test(c)) {
      return 'suv';
    }
    if (/^(?:sprinter|esprinter|metris)/.test(c)) return 'van';
    if (/^(?:sls|slr|amggt)/.test(c)) return 'supercar';
    if (/^(?:slk|slc|sl)class/.test(c)) return 'roadster';
    if (/^(?:cla|cls)class/.test(c)) return 'saloon';
    if (/^(?:clk|cle|cl)/.test(c)) return 'coupe';
    if (/^(?:a|b)class/.test(c)) return 'hatchback';
    if (/^(?:c|e|s)class/.test(c) || /^eq/.test(c)) return 'saloon';
    return undefined;
  },
  volvo: (c) => {
    if (/^(?:xc|ex|ec)/.test(c)) return 'suv';
    if (c.includes('crosscountry')) return 'estate';
    if (c === 'c30') return 'hatchback';
    if (c === 'c40') return 'suv';
    if (c === 'c70' || /^c70/.test(c)) return 'roadster';
    if (/^v\d/.test(c)) return 'estate';
    if (/^s\d/.test(c)) return 'saloon';
    return undefined;
  },
  lexus: (c) => {
    if (/^(?:rx|nx|gx|lx|ux|tx|rz|lm)/.test(c)) return 'suv';
    if (/^(?:lc|rc|sc)/.test(c)) return 'coupe';
    if (/^ct/.test(c)) return 'hatchback';
    if (c === 'lfa') return 'supercar';
    if (/^(?:is|es|gs|ls|hs)/.test(c)) return 'saloon';
    return undefined;
  },
  infiniti: (c) => {
    if (/^(?:qx|fx|ex|jx)/.test(c)) return 'suv';
    if (/^q60/.test(c)) return 'coupe';
    return undefined;
  },
  cadillac: (c) => {
    if (/^(?:escalade|srx|xt[4-6]|lyriq|vistiq|optiq)/.test(c)) return 'suv';
    if (/^xlr/.test(c)) return 'roadster';
    if (/^eldorado/.test(c)) return 'coupe';
    return undefined;
  },
  genesis: (c) => (/^gv/.test(c) ? 'suv' : undefined),
  jaguar: (c) => {
    if (/pace$/.test(c)) return 'suv';
    if (/^(?:ftype|xk|xjs)/.test(c)) return 'coupe';
    return undefined;
  },
  mazda: (c) => {
    if (/^cx/.test(c) || c === 'mx30' || c === 'tribute' || c === 'navajo') return 'suv';
    if (c === 'mx5') return 'roadster';
    if (/^(?:mx3|mx6|rx7|rx8)/.test(c)) return 'coupe';
    if (/^(?:mazda2|mazda3|323|glc)/.test(c)) return 'hatchback';
    if (/^(?:mazda5|mpv)/.test(c)) return 'van';
    if (/^bseries/.test(c)) return 'pickup';
    return undefined;
  },
  porsche: (c) => {
    if (/^(?:cayenne|macan)/.test(c)) return 'suv';
    if (/^(?:panamera|taycan)/.test(c)) return 'saloon';
    if (/(?:boxster|spyder)/.test(c)) return 'roadster';
    if (/^(?:911|918|924|928|944|968)/.test(c) || /cayman/.test(c)) return 'coupe';
    return undefined;
  },
  tesla: (c) => {
    if (c === 'modelx' || c === 'modely') return 'suv';
    if (c === 'cybertruck') return 'pickup';
    if (c === 'cybercab') return 'coupe';
    if (c === 'roadster') return 'roadster';
    if (/^model/.test(c)) return 'saloon';
    return undefined;
  },
  polestar: (c) => {
    if (c === 'polestar1') return 'coupe';
    if (c === 'polestar3' || c === 'polestar4') return 'suv';
    if (/^polestar/.test(c)) return 'saloon';
    return undefined;
  },
};

/** Ordered: the first pattern that matches wins, so van beats estate beats coupe. */
const CAR_KEYWORDS: Array<[RegExp, BodyType]> = [
  [/\b(pick ?up|truck|hilux|tacoma|tundra|silverado|sierra|el camino|ranchero)\b/, 'pickup'],
  [
    /\b(van|minivan|mpv|transit|sprinter|caddy|transporter|caravan|vito|viano|berlingo|partner|doblo|ducato|boxer|traffic|trafic|vivaro|kombi|eurovan|vanagon|multivan|people carrier)\b/,
    'van',
  ],
  [
    /\b(estate|wagon|touring|avant|variant|sportwagen|sportbrake|allroad|alltrack|shooting brake|cross country)\b/,
    'estate',
  ],
  [/\b(suv|crossover|4x4|off ?road|cross sport)\b/, 'suv'],
  [/\b(roadster|cabrio|cabriolet|convertible|spyder|spider|barchetta|targa)\b/, 'roadster'],
  [/\b(coupe|coup|fastback|berlinetta|gt)\b/, 'coupe'],
  [/\b(hatch|hatchback|sportback|liftback)\b/, 'hatchback'],
  [/\b(saloon|sedan|berlina|limousine)\b/, 'saloon'],
];

/** Whole-model shorthand that only ever names a crossover. */
const SUV_CODE = /^(?:x[1-7]|q[2-8]|gl[abcesk]|xc[469]0|qx\d\d|xt[4-6]|gv\d\d)$/;

function inferCar(cMake: string, nModel: string, cModel: string): BodyType {
  const scoped = lookup(CAR_MAKE_MODEL, `${cMake}|${cModel}`);
  if (scoped) return scoped;

  const exact = lookup(CAR_MODELS, cModel);
  if (exact) return exact;

  const rule = lookup(CAR_MAKE_RULES, cMake);
  const byRule = rule ? rule(cModel) : undefined;
  if (byRule) return byRule;

  const byMake = lookup(CAR_MAKE_DEFAULTS, cMake);
  if (byMake) return byMake;

  for (const [pattern, body] of CAR_KEYWORDS) {
    if (pattern.test(nModel)) return body;
  }
  if (SUV_CODE.test(cModel)) return 'suv';

  return 'saloon';
}

/* -------------------------------------------------------------- bikes */

const BIKE_MAKE_MODEL: Record<string, BodyType> = {
  // The only Harley that is not a cruiser silhouette.
  'harleydavidson|panamerica': 'motorbike',
  'harleydavidson|panamericaspecial': 'motorbike',
  'harleydavidson|cvopanamerica': 'motorbike',
  'royalenfield|bullet': 'cruiser',
  'royalenfield|classic': 'cruiser',
  'royalenfield|meteor': 'cruiser',
  'royalenfield|supermeteor650': 'cruiser',
  'royalenfield|shotgun650': 'cruiser',
};

const BIKE_MAKE_DEFAULTS: Record<string, BodyType> = {
  harleydavidson: 'cruiser',
  harley: 'cruiser',
  indianmotorcycle: 'cruiser',
  indian: 'cruiser',
  bigdog: 'cruiser',
  bosshoss: 'cruiser',
  ural: 'cruiser',
  vespa: 'scooter',
  piaggio: 'scooter',
  piaggioandvespa: 'scooter',
  lambretta: 'scooter',
  kymco: 'scooter',
  sym: 'scooter',
  niu: 'scooter',
  segway: 'scooter',
  genuinescooter: 'scooter',
  tvs: 'scooter',
};

const BIKE_MAKE_RULES: Record<string, MakeRule> = {
  bmw: (c) => {
    // The C-range and CE-range are maxi-scooters; the R 18 family are cruisers.
    if (/^c\d{3}/.test(c) || /^ce0\d/.test(c) || c === 'cevolution') return 'scooter';
    if (/^r18/.test(c) || /^r1200cl?$/.test(c)) return 'cruiser';
    return undefined;
  },
};

const SCOOTER_KEYWORDS =
  /\b(scooter|moped|vespa|burgman|pcx\d*|adv1\d0|forza|nss\d*|sh\d+i?|ruckus|metropolitan|giorno|navi|elite|zuma|vino|riva|morphous|xmax|tmax|smax|majesty|address|silver ?wing|helix|reflex|scarabeo|sportcity|mojito|atlantic|spree|gyro|jog|razz|super cub|c3|bws)\b/;

const CRUISER_KEYWORDS =
  /\b(cruiser|bobber|chopper|softail|sportster|dyna|fat ?boy|fat ?bob|road king|street glide|road glide|electra glide|super glide|wide glide|low rider|breakout|nightster|night rod|night train|v-?rod|iron 8|forty-eight|seventy-two|shadow|rebel|fury|stateline|sabre|magna|valkyrie|vtx|vt\d{3,4}|boulevard|intruder|marauder|savage|volusia|vulcan|eliminator|v star|vstar|virago|road star|roadstar|royal star|stratoliner|roadliner|stryker|raider|bolt|v-?max|x?diavel|meteor|shotgun|thunderbird|speedmaster|rocket 3|rocket iii|america|chief|springfield|roadmaster|california|eldorado|audace|nevada|v7|v9)\b/;

function inferBike(cMake: string, nModel: string, cModel: string): BodyType {
  const scoped = lookup(BIKE_MAKE_MODEL, `${cMake}|${cModel}`);
  if (scoped) return scoped;

  const rule = lookup(BIKE_MAKE_RULES, cMake);
  const byRule = rule ? rule(cModel) : undefined;
  if (byRule) return byRule;

  const byMake = lookup(BIKE_MAKE_DEFAULTS, cMake);
  if (byMake) return byMake;

  if (SCOOTER_KEYWORDS.test(nModel)) return 'scooter';
  if (CRUISER_KEYWORDS.test(nModel)) return 'cruiser';

  return 'motorbike';
}

/**
 * Never throws and never returns undefined: unknown input falls back to
 * 'saloon' for cars and 'motorbike' for bikes.
 */
export function inferBodyType(kind: VehicleKindKey, make: string, model: string): BodyType {
  const cMake = compact(make);
  const nModel = norm(model);
  const cModel = compact(model);
  return kind === 'motorbike'
    ? inferBike(cMake, nModel, cModel)
    : inferCar(cMake, nModel, cModel);
}
