#!/usr/bin/env node
/**
 * Generates src/data/countryDots.json — the dotted country maps on onboarding's
 * country step ("You're in good company"), and the region line under each name
 * in that step's country sheet.
 *
 *   node scripts/generate-country-dots.mjs
 *   node scripts/generate-country-dots.mjs --input ne_50m_admin_0_map_units.geojson
 *   node scripts/generate-country-dots.mjs --explain NO    # why each polygon was kept
 *
 * The first form downloads the pinned Natural Earth release below and checks
 * its SHA-256; the second reads a copy already on disk (same check). The output
 * is deterministic: the same input always writes the same bytes, so a rerun
 * that changes the file is a real change worth reading in the diff.
 *
 * ─── SOURCE ──────────────────────────────────────────────────────────────────
 * Natural Earth 1:50m cultural vectors, admin-0 MAP UNITS, release v5.1.2.
 * Public domain (https://www.naturalearthdata.com/about/terms-of-use/), so the
 * derived dots need no attribution — the source line in the output is there
 * for provenance, not licensing.
 *
 * Map units rather than the plain admin-0 countries file, because of how
 * countries.json counts. In the countries file, France's feature carries French
 * Guiana, Guadeloupe, Martinique, Réunion and Mayotte; Norway's carries
 * Svalbard; the Netherlands' carries Bonaire, Sint Eustatius and Saba. All
 * eight have their own ISO code and their own row in our picker, and from the
 * countries file thirteen of our codes would have had no map at all. Map units
 * split them out under their own ISO_A2_EH. The price is that map units also
 * split a few countries into parts (England, Scotland, Wales and Northern
 * Ireland; Flanders, Wallonia and Brussels; …), which are simply merged back
 * by code below — and whose shared borders are how they are recognised as one
 * landmass (see MAIN).
 *
 * Coverage: 247 of the 250 codes. Gibraltar, Bouvet Island and the US Outlying
 * Islands are below 1:50m's resolution; the screen gives them its flag-only
 * layout, and they still get a region from REGION_FALLBACK.
 *
 * ─── FROM FEATURES TO CODES ──────────────────────────────────────────────────
 * Each feature's ISO_A2_EH goes through the same alias map the app uses
 * (src/data/countries.aliases.json), and must then be one of the 250 codes in
 * countries.json — XK for Kosovo included, which Natural Earth also uses.
 * Anything that fails both that and the two short tables below stops the run:
 * a feature that quietly fell through would be somebody's country with no map.
 *
 * ─── GEOMETRY ────────────────────────────────────────────────────────────────
 * 1. Projection. Every country is drawn in a Lambert azimuthal equal-area
 *    projection centred on its own main landmass. That is the cos-latitude
 *    correction done properly: a plain lon × cos(lat₀) grid is only right at
 *    lat₀, and stretches Canada, Russia or Norway toward their poleward
 *    edges, while an equal-area projection keeps every dot standing for the
 *    same amount of ground. Centring it on the country keeps the shape the one
 *    people recognise, and handles the antimeridian (Russia, Fiji, the
 *    Aleutians) without special cases.
 * 2. Main landmass (drawn bright). The largest polygon, then, grown until
 *    nothing changes: any polygon sharing a border with the set — which is
 *    how map units' England, Scotland and Wales become Great Britain again —
 *    and, within NEAR_GAP of the set, any polygon at least MAIN_SHARE of the
 *    largest one's area (New Zealand's two islands, Indonesia's big five) or
 *    with a land border to another country (Alaska, Northern Ireland,
 *    Kaliningrad, Gaza: land, not offshore islands, so drawn as the country
 *    they are). Natural Earth cuts polygons at ±180°, so -180 and 180 count
 *    as one meridian when borders are compared, and Chukotka stays Russia.
 * 3. Near (drawn dim) or far (dropped). A sizeable polygon — BIG_SHARE of
 *    the largest or more — is near when its gap to the main landmass's
 *    bounding box is at most NEAR_GAP of that box's longer side. A smaller
 *    one has to hug land already kept, within HUG_GAP. Sicily, Sardinia,
 *    Corsica and Tasmania are drawn dim and Kodiak stays beside Alaska, while
 *    Hawaii, Jan Mayen, the Canaries, the Azores and the Galápagos are
 *    dropped, so the mainland fills the frame instead of a corner of it.
 * 4. Grid. The kept polygons' bounding box is fitted into a GRID_COLS ×
 *    GRID_ROWS box — the shape of the space the screen gives the map — with
 *    square cells, so dots come out the same size on nearly every country
 *    (5 has the exceptions). A cell is a dot when its centre is on land: bright
 *    if that land is main, dim otherwise.
 *    Every kept polygon too small to cover a cell centre still gets one dot,
 *    so no island that was kept on purpose can vanish.
 * 5. Readable minimum. A country whose main landmass comes out under
 *    MIN_MAIN_DOTS (a thin one, or one kept wide by its islands) is redrawn on
 *    a finer grid, up to MAX_REFINE times the base resolution, rather than
 *    being shown as a handful of blobs.
 *
 * ─── ENCODING ────────────────────────────────────────────────────────────────
 * maps[code] = [cols, rows, runs]. The grid is read row by row from the top
 * left; `runs` is a run-length string over it in which each run is one kind
 * character followed by its length in base 36, the length omitted when it is 1:
 *
 *   '.'  sea         '#'  main landmass (bright)       '+'  near land (dim)
 *
 *   ".k#3+.b"  →  20 sea, 3 main, 1 near, 11 sea
 *
 * The kind characters are not base-36 digits, so the string splits without
 * separators. Runs flow across row ends, and trailing sea is left off. The
 * decoder and its tests are src/onboarding/place/countryDots.ts.
 *
 * regions[code] is the continent shown under the name in the country sheet.
 */

import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

const RELEASE = 'v5.1.2';
const SOURCE_URL = `https://raw.githubusercontent.com/nvkelso/natural-earth-vector/${RELEASE}/geojson/ne_50m_admin_0_map_units.geojson`;
/** The file this output was generated from. A different file is a different map. */
const SOURCE_SHA256 = 'b8d421aca6e9e08e8cdf09cc26af111cc3e0deba4fe915611d58ade71e8a4db0';

/** The dot box, in cells. Roughly the map area's shape on a 375pt-wide phone. */
const GRID_COLS = 52;
const GRID_ROWS = 36;
/** A polygon this share of the largest one's area counts as main landmass too. */
const MAIN_SHARE = 0.2;
/** Below this share of the largest polygon, an island only shows if it hugs the coast. */
const BIG_SHARE = 0.01;
/** Gap allowed between a sizeable polygon and the main landmass (× its box's longer side). */
const NEAR_GAP = 0.3;
/** Gap allowed between a small island and the land already kept (× the same side). */
const HUG_GAP = 0.1;
/** Fewer main dots than this, and the grid is refined. */
const MIN_MAIN_DOTS = 150;
/** The finest a refined grid may get, as a multiple of the base resolution. */
const MAX_REFINE = 2;
/** The output budget. Bundled into the app, so it has to stay small. */
const MAX_BYTES = 400 * 1024;

/**
 * Natural Earth's de facto states, which carry no ISO code. Our list is ISO's,
 * and ISO's Somalia and Cyprus are the whole island and the whole Horn coast,
 * so each is folded into the country it lies inside. Merged, they share a
 * border with it and are drawn as one landmass, not singled out in dim dots.
 */
const DE_FACTO = {
  SOL: 'SO', // Somaliland
  CYN: 'CY', // Northern Cyprus
};

/** Features that belong to no code at all, with the reason. */
const SKIP = {
  KAS: 'Siachen Glacier: indeterminate between India and Pakistan, so on neither map.',
};

/** Regions for the codes Natural Earth has no feature for. */
const REGION_FALLBACK = {
  BV: 'Antarctica', // Bouvet Island, sub-Antarctic South Atlantic
  GI: 'Europe',
  UM: 'Oceania',
};

// ─── input ───────────────────────────────────────────────────────────────────

async function loadSource() {
  const at = process.argv.indexOf('--input');
  let bytes;
  if (at > 0 && process.argv[at + 1]) {
    bytes = readFileSync(process.argv[at + 1]);
  } else {
    process.stdout.write(`Downloading ${SOURCE_URL}\n`);
    const res = await fetch(SOURCE_URL);
    if (!res.ok) throw new Error(`Download failed: HTTP ${res.status}`);
    bytes = Buffer.from(await res.arrayBuffer());
  }
  const sha = createHash('sha256').update(bytes).digest('hex');
  if (sha !== SOURCE_SHA256) {
    throw new Error(
      `Source SHA-256 is ${sha}, expected ${SOURCE_SHA256}. If Natural Earth was ` +
        'deliberately upgraded, update RELEASE and SOURCE_SHA256 and review the diff.',
    );
  }
  return JSON.parse(bytes.toString('utf8'));
}

const countries = JSON.parse(readFileSync(join(root, 'src/data/countries.json'), 'utf8'));
const aliases = JSON.parse(readFileSync(join(root, 'src/data/countries.aliases.json'), 'utf8'));
const CANONICAL = new Set(countries.map((c) => c.code));

/** The app's canonicaliseCountry, restated: aliases, then membership. */
function canonical(code) {
  if (!code || code === '-99') return null;
  const upper = code.trim().toUpperCase();
  const resolved = aliases[upper] ?? upper;
  return CANONICAL.has(resolved) ? resolved : null;
}

function codeOf(p) {
  if (SKIP[p.ADM0_A3]) return null;
  const code = canonical(p.ISO_A2_EH) ?? canonical(p.ISO_A2) ?? DE_FACTO[p.ADM0_A3] ?? null;
  if (!code) {
    throw new Error(`No code for Natural Earth feature ${p.NAME} (${p.ADM0_A3}). Map it or skip it.`);
  }
  return code;
}

/**
 * The continent to print under a country's name. Natural Earth files the
 * small ocean states (the Maldives, Mauritius, Saint Helena…) under "Seven
 * seas (open ocean)", which nobody would recognise as where they live; those
 * take the UN region instead, with the Americas split the way CONTINENT does.
 */
function regionOf(p) {
  if (p.CONTINENT !== 'Seven seas (open ocean)') return p.CONTINENT;
  if (p.REGION_UN === 'Americas') {
    return p.SUBREGION === 'South America' ? 'South America' : 'North America';
  }
  return p.REGION_UN;
}

// ─── geometry ────────────────────────────────────────────────────────────────

/** `--explain XX` prints how one country's polygons were classified. */
const EXPLAIN = process.argv.includes('--explain')
  ? process.argv[process.argv.indexOf('--explain') + 1]?.toUpperCase()
  : null;

const R = 6371; // km. Only ratios matter; km keeps the numbers readable when debugging.
const rad = (d) => (d * Math.PI) / 180;

/** Spherical ring area (Chamberlain & Duquette), km². GeoJSON rings are closed. */
function ringArea(ring) {
  let sum = 0;
  for (let i = 0; i < ring.length - 1; i++) {
    const [l1, p1] = ring[i];
    const [l2, p2] = ring[i + 1];
    sum += rad(l2 - l1) * (2 + Math.sin(rad(p1)) + Math.sin(rad(p2)));
  }
  return Math.abs((sum * R * R) / 2);
}

function polygonArea(rings) {
  return rings.reduce((a, ring, i) => a + (i === 0 ? 1 : -1) * ringArea(ring), 0);
}

function lonLatBox(rings) {
  const box = { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity };
  for (const [x, y] of rings[0]) {
    box.minX = Math.min(box.minX, x);
    box.maxX = Math.max(box.maxX, x);
    box.minY = Math.min(box.minY, y);
    box.maxY = Math.max(box.maxY, y);
  }
  return box;
}

/**
 * Lambert azimuthal equal-area, centred on (lon0, lat0), in km. Returns null
 * for a point more than 90° away: nothing that far is "near" anything, and the
 * projection's scale runs away toward the antipode.
 */
function laea(lon0, lat0) {
  const l0 = rad(lon0);
  const sp0 = Math.sin(rad(lat0));
  const cp0 = Math.cos(rad(lat0));
  return (lon, lat) => {
    const l = rad(lon) - l0;
    const sp = Math.sin(rad(lat));
    const cp = Math.cos(rad(lat));
    const cl = Math.cos(l);
    const cosc = sp0 * sp + cp0 * cp * cl;
    if (cosc < 0) return null;
    const k = Math.sqrt(2 / (1 + cosc)) * R;
    return [k * cp * Math.sin(l), k * (cp0 * sp - sp0 * cp * cl)];
  };
}

/** Vertex identity for shared-border detection; ±180 is one meridian. */
const vertexKey = ([lon, lat]) => `${lon === -180 ? 180 : lon},${lat}`;

function sharesBorder(a, b) {
  let shared = 0;
  for (const ring of b.rings) {
    for (const v of ring) {
      if (a.keys.has(vertexKey(v)) && ++shared >= 2) return true;
    }
  }
  return false;
}

/**
 * Which codes use each vertex, across the whole file. Natural Earth is
 * topologically clean, so two countries that share a border share its
 * vertices exactly; an island shares none.
 */
const vertexCodes = new Map();

function bordersAnother(code, keys) {
  let shared = 0;
  for (const k of keys) {
    const codes = vertexCodes.get(k);
    if (codes && (codes.size > 1 || !codes.has(code)) && ++shared >= 2) return true;
  }
  return false;
}

function boxGap(a, b) {
  const dx = Math.max(0, a.minX - b.maxX, b.minX - a.maxX);
  const dy = Math.max(0, a.minY - b.maxY, b.minY - a.maxY);
  return Math.hypot(dx, dy);
}

function unionBox(boxes) {
  return boxes.reduce(
    (u, b) => ({
      minX: Math.min(u.minX, b.minX),
      minY: Math.min(u.minY, b.minY),
      maxX: Math.max(u.maxX, b.maxX),
      maxY: Math.max(u.maxY, b.maxY),
    }),
    { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity },
  );
}

/** Even-odd ray cast over every ring, so holes (lakes, enclaves) stay sea. */
function inside(poly, x, y) {
  if (x < poly.box.minX || x > poly.box.maxX || y < poly.box.minY || y > poly.box.maxY) {
    return false;
  }
  let odd = false;
  for (const ring of poly.xy) {
    for (let i = 0, j = ring.length - 2; i < ring.length; j = i, i += 2) {
      const yi = ring[i + 1];
      const yj = ring[j + 1];
      if (yi > y !== yj > y) {
        const xi = ring[i];
        const xj = ring[j];
        if (x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) odd = !odd;
      }
    }
  }
  return odd;
}

const SEA = 0;
const MAIN = 1;
const NEAR = 2;

/**
 * One country's polygons → its dot grid: { cols, rows, cells, mains }, with
 * `cells` a Uint8Array of SEA/MAIN/NEAR, row-major from the top left.
 */
function rasterise(code, polygons) {
  const measured = polygons
    .map((rings) => ({ rings, area: polygonArea(rings), lonLat: lonLatBox(rings) }))
    .filter((p) => p.area > 0)
    .sort((a, b) => b.area - a.area);
  const largest = measured[0];

  // Centre on the main landmass. A polygon that wraps the whole globe in
  // longitude (Antarctica) is centred on its pole instead of its box.
  const { lonLat } = largest;
  const wraps = lonLat.maxX - lonLat.minX >= 359;
  const project = wraps
    ? laea(0, lonLat.minY < 0 ? -90 : 90)
    : laea((lonLat.minX + lonLat.maxX) / 2, (lonLat.minY + lonLat.maxY) / 2);

  const projected = [];
  for (const p of measured) {
    const xy = [];
    let far = false;
    for (const ring of p.rings) {
      const flat = new Float64Array(ring.length * 2);
      ring.forEach(([lon, lat], i) => {
        const pt = project(lon, lat);
        if (!pt) {
          far = true;
          return;
        }
        // y grows southward from here on, matching the grid's rows.
        flat[i * 2] = pt[0];
        flat[i * 2 + 1] = -pt[1];
      });
      xy.push(flat);
    }
    if (far) continue;
    const outer = xy[0];
    const box = { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity };
    for (let i = 0; i < outer.length; i += 2) {
      box.minX = Math.min(box.minX, outer[i]);
      box.maxX = Math.max(box.maxX, outer[i]);
      box.minY = Math.min(box.minY, outer[i + 1]);
      box.maxY = Math.max(box.maxY, outer[i + 1]);
    }
    const keys = new Set(p.rings.flatMap((ring) => ring.map(vertexKey)));
    projected.push({ ...p, xy, box, keys, landBorder: bordersAnother(code, keys), kind: SEA });
  }

  // Main landmass: the largest polygon, then — until nothing changes —
  // whatever borders the set, and, within reach of it, anything comparable in
  // size or any land that has a border with another country. Within reach,
  // because comparable alone is not enough: Saint Helena, Ascension and
  // Tristan da Cunha are much the same size and 1,300 km apart, and calling
  // all three main would frame an ocean with three dots in it. Grown one step
  // at a time, so Indonesia still reaches New Guinea by way of Java and
  // Sulawesi. The land-border rule is why dim always means an island: Alaska,
  // Kaliningrad, Cabinda and Gaza are land, not offshore islands, and are
  // drawn as the country they are.
  const boxOf = (kind) => unionBox(projected.filter((p) => p.kind === kind).map((p) => p.box));
  const sideOf = (b) => Math.max(b.maxX - b.minX, b.maxY - b.minY);
  // projected[0] is `largest`: sorted by area, and the projection is centred on it.
  projected[0].kind = MAIN;
  for (let grew = true; grew; ) {
    grew = false;
    const box = boxOf(MAIN);
    for (const p of projected) {
      if (p.kind === MAIN) continue;
      const joins = projected.some((m) => m.kind === MAIN && sharesBorder(m, p));
      const qualifies = p.area >= largest.area * MAIN_SHARE || p.landBorder;
      if (joins || (qualifies && boxGap(p.box, box) <= NEAR_GAP * sideOf(box))) {
        p.kind = MAIN;
        grew = true;
      }
    }
  }

  const mainBox = boxOf(MAIN);
  const side = sideOf(mainBox);
  const big = (p) => p.area >= largest.area * BIG_SHARE;
  for (const p of projected) {
    if (p.kind !== MAIN && big(p) && boxGap(p.box, mainBox) <= NEAR_GAP * side) p.kind = NEAR;
  }
  // Small islands are measured against the land already kept rather than the
  // main box, so Kodiak stays beside Alaska — and only within a short hop,
  // so Jan Mayen does not drag Norway's frame 600 km out to sea. Not chained
  // from one small island to the next, or the Aleutians would walk the US
  // frame all the way to Attu.
  const land = projected.filter((p) => p.kind !== SEA).map((p) => p.box);
  for (const p of projected) {
    if (p.kind === SEA && !big(p) && Math.min(...land.map((b) => boxGap(p.box, b))) <= HUG_GAP * side) {
      p.kind = NEAR;
    }
  }
  const kept = projected.filter((p) => p.kind !== SEA);
  if (EXPLAIN === code) {
    for (const p of projected.slice(0, 40)) {
      const gap = p.kind === MAIN ? 0 : boxGap(p.box, mainBox) / side;
      process.stdout.write(
        `${['dropped', 'main   ', 'near   '][p.kind]}  ${Math.round(p.area).toString().padStart(9)} km²` +
          `  gap ${gap.toFixed(2)}  ${p.lonLat.minX.toFixed(1)}…${p.lonLat.maxX.toFixed(1)}E` +
          ` ${p.lonLat.minY.toFixed(1)}…${p.lonLat.maxY.toFixed(1)}N\n`,
      );
    }
  }
  const frame = unionBox(kept.map((p) => p.box));
  const fw = Math.max(frame.maxX - frame.minX, 1e-6);
  const fh = Math.max(frame.maxY - frame.minY, 1e-6);

  let best = null;
  for (let refine = 1; refine <= MAX_REFINE + 1e-9; refine *= 1.25) {
    const pitch = Math.max(fw / (GRID_COLS * refine), fh / (GRID_ROWS * refine));
    const cols = Math.max(1, Math.ceil(fw / pitch - 1e-9));
    const rows = Math.max(1, Math.ceil(fh / pitch - 1e-9));
    const x0 = frame.minX - (cols * pitch - fw) / 2;
    const y0 = frame.minY - (rows * pitch - fh) / 2;
    const cells = new Uint8Array(cols * rows);
    const covered = new Set();

    for (let r = 0; r < rows; r++) {
      const y = y0 + (r + 0.5) * pitch;
      for (let c = 0; c < cols; c++) {
        const x = x0 + (c + 0.5) * pitch;
        let kind = SEA;
        for (const p of kept) {
          if (inside(p, x, y)) {
            covered.add(p);
            if (p.kind === MAIN) {
              kind = MAIN;
              break;
            }
            kind = NEAR;
          }
        }
        cells[r * cols + c] = kind;
      }
    }

    // Kept on purpose, so it gets at least the dot its first vertex falls in.
    for (const p of kept) {
      if (covered.has(p)) continue;
      const c = Math.min(cols - 1, Math.max(0, Math.floor((p.xy[0][0] - x0) / pitch)));
      const r = Math.min(rows - 1, Math.max(0, Math.floor((p.xy[0][1] - y0) / pitch)));
      if (cells[r * cols + c] !== MAIN) cells[r * cols + c] = p.kind;
    }

    const mains = cells.reduce((n, k) => n + (k === MAIN ? 1 : 0), 0);
    best = { cols, rows, cells, mains };
    if (mains >= MIN_MAIN_DOTS) break;
  }
  if (best.mains === 0) throw new Error(`${code}: rasterised to no main dots`);
  return best;
}

const KIND_CHAR = ['.', '#', '+'];

/** See ENCODING in the header. */
function encodeRuns(cells) {
  let end = cells.length;
  while (end > 0 && cells[end - 1] === SEA) end--;
  let out = '';
  for (let i = 0; i < end; ) {
    let j = i;
    while (j < end && cells[j] === cells[i]) j++;
    const n = j - i;
    out += KIND_CHAR[cells[i]] + (n > 1 ? n.toString(36) : '');
    i = j;
  }
  return out;
}

/** The decoder, restated, so every map is checked against what the app will read. */
function decodeRuns(runs, size) {
  const cells = new Uint8Array(size);
  let at = 0;
  for (const [, kind, len] of runs.matchAll(/([.#+])([0-9a-z]*)/g)) {
    const n = len ? parseInt(len, 36) : 1;
    cells.fill(KIND_CHAR.indexOf(kind), at, at + n);
    at += n;
  }
  if (at > size) throw new Error('runs overflow the grid');
  return cells;
}

// ─── run ─────────────────────────────────────────────────────────────────────

const source = await loadSource();

const byCode = new Map();
const regionArea = new Map();
for (const f of source.features) {
  const p = f.properties;
  const code = codeOf(p);
  if (!code) continue;
  const g = f.geometry;
  const polys = g.type === 'Polygon' ? [g.coordinates] : g.coordinates;
  byCode.set(code, [...(byCode.get(code) ?? []), ...polys]);
  for (const rings of polys) {
    for (const ring of rings) {
      for (const v of ring) {
        const k = vertexKey(v);
        vertexCodes.set(k, (vertexCodes.get(k) ?? new Set()).add(code));
      }
    }
  }
  // A country's region is the region of its largest part: Portugal is in
  // Europe, whatever the Azores are filed under.
  const area = polys.reduce((a, rings) => a + polygonArea(rings), 0);
  const prev = regionArea.get(code);
  if (!prev || area > prev.area) regionArea.set(code, { area, region: regionOf(p) });
}

const regions = {};
const maps = {};
for (const code of [...CANONICAL].sort()) {
  const region = regionArea.get(code)?.region ?? REGION_FALLBACK[code];
  if (!region) throw new Error(`${code}: no region`);
  regions[code] = region;

  const polygons = byCode.get(code);
  if (!polygons) continue;
  const { cols, rows, cells } = rasterise(code, polygons);
  if (cols > 255 || rows > 255) throw new Error(`${code}: grid ${cols}×${rows} too large`);
  const runs = encodeRuns(cells);
  const back = decodeRuns(runs, cols * rows);
  if (!back.every((k, i) => k === cells[i])) throw new Error(`${code}: runs do not round-trip`);
  maps[code] = [cols, rows, runs];
}

const missing = [...CANONICAL].filter((c) => !maps[c]).sort();
const expectedMissing = Object.keys(REGION_FALLBACK).sort();
if (missing.join() !== expectedMissing.join()) {
  throw new Error(`Codes without a map changed: ${missing.join(', ')} (expected ${expectedMissing.join(', ')})`);
}

// One entry per line, so a regeneration diffs country by country.
const body = [
  '{',
  `"source": ${JSON.stringify(`Natural Earth ${RELEASE} ne_50m_admin_0_map_units (public domain), sha256 ${SOURCE_SHA256}`)},`,
  `"generator": "scripts/generate-country-dots.mjs",`,
  `"regions": {`,
  Object.entries(regions)
    .map(([c, r]) => `${JSON.stringify(c)}: ${JSON.stringify(r)}`)
    .join(',\n'),
  '},',
  `"maps": {`,
  Object.entries(maps)
    .map(([c, m]) => `${JSON.stringify(c)}: ${JSON.stringify(m)}`)
    .join(',\n'),
  '}',
  '}',
  '',
].join('\n');

if (Buffer.byteLength(body) > MAX_BYTES) {
  throw new Error(`countryDots.json is ${Buffer.byteLength(body)} bytes, over the ${MAX_BYTES} budget`);
}
writeFileSync(join(root, 'src/data/countryDots.json'), body);

const dots = Object.values(maps).map(([c, r, runs]) => {
  const cells = decodeRuns(runs, c * r);
  return cells.reduce((n, k) => n + (k === SEA ? 0 : 1), 0);
});
process.stdout.write(
  `Wrote src/data/countryDots.json: ${Object.keys(maps).length} maps, ` +
    `${Object.keys(regions).length} regions, ${(Buffer.byteLength(body) / 1024).toFixed(1)} KB, ` +
    `${Math.min(...dots)}–${Math.max(...dots)} dots per map. No map: ${missing.join(', ')}.\n`,
);
