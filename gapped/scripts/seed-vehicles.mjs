#!/usr/bin/env node
/**
 * Vehicle dataset seed (spec §B1). Pulls makes + models from NHTSA vPIC once
 * and commits the normalised result as a static asset — the client never
 * queries vPIC at runtime for the picker.
 *
 *   node scripts/seed-vehicles.mjs
 *
 * Strategy: the full make list (cars + motorcycles) ships completely, so any
 * make is selectable. Model lists are fetched for the makes users actually
 * pick (popular + enthusiast marques); the long tail falls back to the
 * manual model entry the UI always offers.
 */

import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const BASE = 'https://vpic.nhtsa.dot.gov/api/vehicles';
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const outFile = join(root, 'src', 'vehicles', 'data', 'vehicles.json');

const POPULAR_CARS = [
  'BMW', 'Audi', 'Mercedes-Benz', 'Volkswagen', 'Toyota', 'Honda', 'Nissan', 'Ford',
  'Porsche', 'Subaru', 'Mazda',
];

// Model lists fetched for these (popular + enthusiast marques).
const CAR_MAKES_WITH_MODELS = [
  ...POPULAR_CARS,
  'Chevrolet', 'Dodge', 'Hyundai', 'Kia', 'Lexus', 'Tesla', 'Volvo', 'Mini',
  'Fiat', 'Seat', 'Skoda', 'Renault', 'Peugeot', 'Alfa Romeo', 'Jaguar',
  'Land Rover', 'Mitsubishi', 'Suzuki', 'Ferrari', 'Lamborghini', 'McLaren',
  'Aston Martin', 'Lotus', 'Maserati', 'Bentley', 'Rolls-Royce', 'Acura',
  'Infiniti', 'Cadillac', 'Jeep', 'Abarth', 'Cupra', 'Genesis', 'Polestar',
  'Vauxhall', 'Opel', 'Citroen', 'Caterham', 'Morgan', 'TVR',
];

const BIKE_MAKES_WITH_MODELS = [
  'Honda', 'Yamaha', 'Kawasaki', 'Suzuki', 'Ducati', 'BMW', 'KTM', 'Triumph',
  'Harley-Davidson', 'Aprilia', 'MV Agusta', 'Indian', 'Royal Enfield',
  'Husqvarna', 'Moto Guzzi', 'Zero',
];

function titleCase(s) {
  const keepUpper = new Set(['BMW', 'KTM', 'TVR', 'MV', 'MG', 'GMC', 'RAM', 'SRT', 'AM']);
  return s
    .trim()
    .split(/\s+/)
    .map((w) =>
      keepUpper.has(w.toUpperCase())
        ? w.toUpperCase()
        : w.length <= 3 && w === w.toUpperCase() && !/[a-z]/.test(w)
          ? w // short all-caps tokens (GT, RS) stay
          : w
              .split('-')
              .map((p) => (p ? p[0].toUpperCase() + p.slice(1).toLowerCase() : p))
              .join('-'),
    )
    .join(' ');
}

async function getJson(url, tries = 3) {
  for (let i = 0; i < tries; i++) {
    try {
      const res = await fetch(url);
      if (res.ok) return await res.json();
    } catch {
      /* retry */
    }
    await new Promise((r) => setTimeout(r, 800 * (i + 1)));
  }
  throw new Error(`Failed after ${tries} tries: ${url}`);
}

async function makesForType(type) {
  const json = await getJson(`${BASE}/GetMakesForVehicleType/${type}?format=json`);
  const names = json.Results.map((r) => titleCase(r.MakeName));
  return [...new Set(names)].sort((a, b) => a.localeCompare(b));
}

/**
 * Type-filtered models. GetModelsForMake alone returns every model for the
 * make regardless of type (Honda → Civic on a motorcycle list), so we use
 * the vehicletype-filtered endpoint.
 */
async function modelsForMake(make, vehicleType) {
  const json = await getJson(
    `${BASE}/GetModelsForMakeYear/make/${encodeURIComponent(make)}/vehicletype/${vehicleType}?format=json`,
  );
  const names = json.Results.map((r) => String(r.Model_Name).trim()).filter(Boolean);
  return [...new Set(names)].sort((a, b) => a.localeCompare(b));
}

async function mapLimit(items, limit, fn) {
  const out = [];
  let i = 0;
  await Promise.all(
    Array.from({ length: limit }, async () => {
      while (i < items.length) {
        const idx = i++;
        out[idx] = await fn(items[idx]);
      }
    }),
  );
  return out;
}

const carMakes = await makesForType('car');
const mpvMakes = await makesForType('mpv'); // SUVs live here in vPIC
const bikeMakes = await makesForType('moto');

const allCarMakes = [...new Set([...carMakes, ...mpvMakes])].sort((a, b) =>
  a.localeCompare(b),
);

console.log(`car makes: ${allCarMakes.length}, bike makes: ${bikeMakes.length}`);

const carModelMakes = CAR_MAKES_WITH_MODELS.filter((m) =>
  allCarMakes.some((x) => x.toLowerCase() === m.toLowerCase()),
);
const bikeModelMakes = BIKE_MAKES_WITH_MODELS.filter((m) =>
  bikeMakes.some((x) => x.toLowerCase() === m.toLowerCase()),
);

const carModels = {};
await mapLimit(carModelMakes, 4, async (make) => {
  const car = await modelsForMake(make, 'car');
  const mpv = await modelsForMake(make, 'mpv');
  carModels[make] = [...new Set([...car, ...mpv])].sort((a, b) => a.localeCompare(b));
  console.log(`  ${make}: ${carModels[make].length} models`);
});

const bikeModels = {};
await mapLimit(bikeModelMakes, 4, async (make) => {
  bikeModels[make] = await modelsForMake(make, 'motorcycle');
  console.log(`  [moto] ${make}: ${bikeModels[make].length} models`);
});

const dataset = {
  generatedAt: new Date().toISOString(),
  source: 'NHTSA vPIC',
  popularCarMakes: POPULAR_CARS,
  popularBikeMakes: BIKE_MAKES_WITH_MODELS.slice(0, 8),
  carMakes: allCarMakes,
  bikeMakes,
  carModels,
  bikeModels,
};

mkdirSync(dirname(outFile), { recursive: true });
writeFileSync(outFile, JSON.stringify(dataset));
const kb = Math.round(Buffer.byteLength(JSON.stringify(dataset)) / 1024);
console.log(`Wrote ${outFile} (${kb} KB)`);
