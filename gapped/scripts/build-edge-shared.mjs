#!/usr/bin/env node
/**
 * Copies the pure drive-maths modules into supabase/functions/_shared/ with
 * Deno-compatible imports (.ts extensions). src/ stays the single source of
 * truth; run this after editing any of the shared modules:
 *
 *   npm run build:edge
 */

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const outDir = join(root, 'supabase', 'functions', '_shared');
mkdirSync(outDir, { recursive: true });

const files = [
  ['src/drive/types.ts', 'types.ts'],
  ['src/drive/units.ts', 'units.ts'],
  ['src/drive/stats.ts', 'stats.ts'],
  ['src/drive/plausibility.ts', 'plausibility.ts'],
  ['src/drive/privacy.ts', 'privacy.ts'],
  ['src/drive/polyline.ts', 'polyline.ts'],
  ['src/lib/sha256.ts', 'sha256.ts'],
  // Bracket derivation decides which board a run competes on. verify-drive had
  // its own inline copy of the tier boundaries — two implementations of the
  // same rule, which is exactly the drift this script exists to prevent.
  ['src/vehicles/brackets.ts', 'brackets.ts'],
  // VIN parsing is shared so the app and decode-vin agree on what a VIN is.
  ['src/vehicles/vin.ts', 'vin.ts'],
];

const header = `// AUTO-GENERATED from src/ by scripts/build-edge-shared.mjs — do not edit here.\n`;

for (const [src, out] of files) {
  let code = readFileSync(join(root, src), 'utf8');
  // extensionless relative imports → .ts (Deno requires extensions)
  code = code.replace(/from '(\.\.?\/[^']+)'/g, (m, p) =>
    p.endsWith('.ts') ? m : `from '${p}.ts'`,
  );
  // path-alias imports used by src modules → local siblings
  code = code.replace(/from '@\/lib\/sha256'/g, `from './sha256.ts'`);
  code = code.replace(/from '@\/drive\/([^']+)'/g, `from './$1.ts'`);
  writeFileSync(join(outDir, out), header + code);
}

console.log(`Wrote ${files.length} shared modules to supabase/functions/_shared/`);
