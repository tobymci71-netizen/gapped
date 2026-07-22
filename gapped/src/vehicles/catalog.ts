/**
 * Vehicle catalogue — reads the committed vPIC dataset (scripts/seed-vehicles.mjs).
 * Every make is selectable; model lists exist for popular + enthusiast marques
 * and the UI always offers manual entry for the rest. Motorcycles are a
 * first-class dataset, not a car list with bikes bolted on.
 */

import dataset from './data/vehicles.json';

export type VehicleKindKey = 'car' | 'motorbike';

type Dataset = {
  popularCarMakes: string[];
  popularBikeMakes: string[];
  carMakes: string[];
  bikeMakes: string[];
  carModels: Record<string, string[]>;
  bikeModels: Record<string, string[]>;
};

const data = dataset as unknown as Dataset;

export function allMakes(kind: VehicleKindKey): string[] {
  return kind === 'car' ? data.carMakes : data.bikeMakes;
}

export function popularMakes(kind: VehicleKindKey): string[] {
  return kind === 'car' ? data.popularCarMakes : data.popularBikeMakes;
}

export function modelsForMake(kind: VehicleKindKey, make: string): string[] {
  const table = kind === 'car' ? data.carModels : data.bikeModels;
  const key = Object.keys(table).find((k) => k.toLowerCase() === make.toLowerCase());
  return key ? table[key] : [];
}

/**
 * Fuzzy match score: 0 = no match. Higher is better. Prefix beats word-prefix
 * beats substring beats subsequence — so "merc" puts Mercedes-Benz first.
 */
export function fuzzyScore(query: string, candidate: string): number {
  const q = query.trim().toLowerCase();
  const c = candidate.toLowerCase();
  if (q.length === 0) return 0;
  if (c === q) return 100;
  if (c.startsWith(q)) return 90 - Math.min(20, c.length - q.length);
  const words = c.split(/[\s-]+/);
  if (words.some((w) => w.startsWith(q))) return 70;
  if (c.includes(q)) return 50;
  // subsequence
  let i = 0;
  for (const ch of c) {
    if (ch === q[i]) i++;
    if (i === q.length) return 25;
  }
  return 0;
}

export function searchMakes(kind: VehicleKindKey, query: string, limit = 30): string[] {
  const makes = allMakes(kind);
  if (!query.trim()) return makes.slice(0, limit);
  // Popularity-weighted: "merc" should put Mercedes-Benz above Mercury.
  const popular = new Set(popularMakes(kind).map((m) => m.toLowerCase()));
  return makes
    .map((m) => ({
      m,
      s: fuzzyScore(query, m) + (popular.has(m.toLowerCase()) ? 15 : 0),
    }))
    .filter((x) => x.s > 15 || (x.s > 0 && !popular.has(x.m.toLowerCase())))
    .sort((a, b) => b.s - a.s || a.m.localeCompare(b.m))
    .slice(0, limit)
    .map((x) => x.m);
}

export function searchModels(
  kind: VehicleKindKey,
  make: string,
  query: string,
  limit = 50,
): string[] {
  const models = modelsForMake(kind, make);
  if (!query.trim()) return models.slice(0, limit);
  return models
    .map((m) => ({ m, s: fuzzyScore(query, m) }))
    .filter((x) => x.s > 0)
    .sort((a, b) => b.s - a.s || a.m.localeCompare(b.m))
    .slice(0, limit)
    .map((x) => x.m);
}
