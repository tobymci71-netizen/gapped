/**
 * The dotted country maps on onboarding's country step, and the region line
 * in its country sheet.
 *
 * The data is src/data/countryDots.json, written by
 * scripts/generate-country-dots.mjs from Natural Earth's public-domain 1:50m
 * map units. That script owns the geometry decisions (projection, which
 * islands are dim, which are dropped, how fine the grid is) and documents the
 * encoding; this file only reads it back and lays the dots out in a box.
 *
 * Pure apart from the JSON import: no React, no Skia, so the tests can hold
 * every one of the 247 maps to the format without a renderer.
 */

import data from '@/data/countryDots.json';

/** One country's dots, as cell indices into a `cols` × `rows` grid. */
export type CountryDots = {
  cols: number;
  rows: number;
  /** The main landmass, drawn lime. Row-major: `row * cols + col`. */
  main: number[];
  /** Land kept near it — islands — drawn dim. */
  near: number[];
};

/** Where a grid lands in a box: square cells, centred, fixed dot size. */
export type DotLayout = {
  /** Distance between neighbouring dot centres, pt. */
  pitch: number;
  /** Dot radius, pt. */
  radius: number;
  /** Centre of cell (0, 0). */
  x0: number;
  y0: number;
};

/**
 * A dot's diameter as a share of the pitch. 0.72 leaves a gap a little over a
 * third of the dot, enough to read as dots rather than a halftone fill at
 * every grid density the generator produces.
 */
export const DOT_FILL = 0.72;

const MAPS: Readonly<Record<string, readonly (string | number)[]>> = data.maps;
const REGIONS: Readonly<Record<string, string>> = data.regions;

/**
 * Decodes one map's run-length string (see ENCODING in the generator):
 * '.' sea, '#' main, '+' near, each followed by its run length in base 36,
 * omitted when 1. Runs flow across rows; trailing sea is left off.
 *
 * Throws on anything malformed rather than drawing a partial map: the JSON is
 * generated and checked, so a bad string means a bad file, and the tests are
 * where that should surface.
 */
export function decodeRuns(runs: string, cols: number, rows: number): Omit<CountryDots, 'cols' | 'rows'> {
  const size = cols * rows;
  const main: number[] = [];
  const near: number[] = [];
  let at = 0;
  let consumed = 0;
  for (const match of runs.matchAll(/([.#+])([0-9a-z]*)/g)) {
    if (match.index !== consumed) throw new Error(`Bad run at ${consumed} in "${runs}"`);
    consumed += match[0].length;
    const n = match[2] ? parseInt(match[2], 36) : 1;
    if (!(n > 0) || at + n > size) throw new Error(`Runs overflow a ${cols}×${rows} grid`);
    const into = match[1] === '#' ? main : match[1] === '+' ? near : null;
    if (into) for (let i = at; i < at + n; i++) into.push(i);
    at += n;
  }
  if (consumed !== runs.length) throw new Error(`Trailing characters in "${runs}"`);
  return { main, near };
}

const decoded = new Map<string, CountryDots | null>();

/**
 * The dots for a country, or null when it has none — Gibraltar, Bouvet Island
 * and the US Outlying Islands are below the source's resolution, and the
 * screen shows those with its flag-only layout. Decoded once per code.
 */
export function countryDots(code: string | null | undefined): CountryDots | null {
  if (!code) return null;
  const hit = decoded.get(code);
  if (hit !== undefined) return hit;
  const entry = MAPS[code];
  let dots: CountryDots | null = null;
  if (entry) {
    const [cols, rows, runs] = entry;
    if (typeof cols !== 'number' || typeof rows !== 'number' || typeof runs !== 'string') {
      throw new Error(`countryDots.json: malformed entry for ${code}`);
    }
    dots = { cols, rows, ...decodeRuns(runs, cols, rows) };
  }
  decoded.set(code, dots);
  return dots;
}

/** The continent printed under a country's name in the sheet ("Europe"). */
export function countryRegion(code: string | null | undefined): string | null {
  return (code && REGIONS[code]) || null;
}

/** Every code with a map, for the tests. */
export const MAPPED_CODES: readonly string[] = Object.keys(MAPS);

/**
 * Fits a `cols` × `rows` grid into a `width` × `height` box: the largest
 * square pitch that fits both ways, centred on the spare axis.
 */
export function fitDots(cols: number, rows: number, width: number, height: number): DotLayout {
  const pitch = Math.max(0, Math.min(width / cols, height / rows));
  return {
    pitch,
    radius: (pitch * DOT_FILL) / 2,
    x0: (width - cols * pitch) / 2 + pitch / 2,
    y0: (height - rows * pitch) / 2 + pitch / 2,
  };
}

/** Centre of every cell in `cells`, in the box `layout` was fitted to. */
export function dotCentres(
  cells: readonly number[],
  cols: number,
  layout: DotLayout,
): { x: number; y: number }[] {
  return cells.map((i) => ({
    x: layout.x0 + (i % cols) * layout.pitch,
    y: layout.y0 + Math.floor(i / cols) * layout.pitch,
  }));
}

/**
 * A dotted disc, for the step's empty state before a country is chosen: the
 * same dot language as the maps, so choosing one reads as the grid resolving
 * into a country rather than a picture arriving from nowhere.
 */
export function discDots(cells: number): CountryDots {
  const r = cells / 2;
  const main: number[] = [];
  for (let row = 0; row < cells; row++) {
    for (let col = 0; col < cells; col++) {
      if ((col + 0.5 - r) ** 2 + (row + 0.5 - r) ** 2 <= r * r) main.push(row * cells + col);
    }
  }
  return { cols: cells, rows: cells, main, near: [] };
}
