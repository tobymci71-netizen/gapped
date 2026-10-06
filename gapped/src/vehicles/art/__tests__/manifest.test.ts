import fs from 'node:fs';
import path from 'node:path';
import type { BodyType } from '../../bodyType';
import { VEHICLE_RENDERS } from '../manifest';
import type { RenderView } from '../types';

const BODY_TYPES: BodyType[] = [
  'hatchback',
  'saloon',
  'estate',
  'coupe',
  'roadster',
  'supercar',
  'suv',
  'pickup',
  'van',
  'motorbike',
  'sportbike',
  'cruiser',
  'scooter',
];
const VIEWS: RenderView[] = ['side', 'rear', 'rear34'];

/** What the renders may add to the app (docs/VEHICLE_ART.md). */
const MAX_ASSET_MB = 8;

test('every body type has a render from every side', () => {
  expect(Object.keys(VEHICLE_RENDERS).sort()).toEqual([...BODY_TYPES].sort());
  for (const bt of BODY_TYPES) {
    for (const view of VIEWS) {
      expect(VEHICLE_RENDERS[bt].views[view]).toBeDefined();
    }
  }
});

test.each(BODY_TYPES)('%s: boxes, ground and lights sit inside each image', (bt) => {
  const r = VEHICLE_RENDERS[bt];
  expect(r.sizeM.every((m) => m > 0)).toBe(true);
  for (const view of VIEWS) {
    const v = r.views[view];
    const [x, y, w, h] = v.box;
    expect(w).toBeGreaterThan(v.w * 0.3);
    expect(h).toBeGreaterThan(0);
    expect(x).toBeGreaterThanOrEqual(0);
    expect(y).toBeGreaterThanOrEqual(0);
    expect(x + w).toBeLessThanOrEqual(v.w);
    expect(y + h).toBeLessThanOrEqual(v.h);
    expect(v.groundY).toBeGreaterThan(y);
    expect(v.groundY).toBeLessThanOrEqual(v.h);
    expect(v.tailLights.length).toBeGreaterThan(0);
    for (const [lx, ly] of v.tailLights) {
      expect(lx).toBeGreaterThanOrEqual(0);
      expect(lx).toBeLessThanOrEqual(v.w);
      expect(ly).toBeGreaterThanOrEqual(0);
      expect(ly).toBeLessThanOrEqual(v.h);
    }
  }
});

test(`the renders weigh under ${MAX_ASSET_MB} MB`, () => {
  const dir = path.join(__dirname, '../../../../assets/vehicles');
  let bytes = 0;
  for (const bt of fs.readdirSync(dir)) {
    for (const f of fs.readdirSync(path.join(dir, bt))) bytes += fs.statSync(path.join(dir, bt, f)).size;
  }
  expect(bytes / 1024 / 1024).toBeLessThan(MAX_ASSET_MB);
});
