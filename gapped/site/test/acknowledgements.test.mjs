/**
 * scripts/build-acknowledgements.mjs: which packages count as production, how
 * licences are read, and the page it writes from the real lockfile.
 *
 *   node --test site/test/*.test.mjs
 */

import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, describe, test } from 'node:test';
import {
  buildAcknowledgements,
  declaredLicence,
  productionPackages,
} from '../../scripts/build-acknowledgements.mjs';
import { BuildError, ROOT } from '../../scripts/build-legal-pages.mjs';

const temp = mkdtempSync(join(tmpdir(), 'gapped-acks-'));
after(() => rmSync(temp, { recursive: true, force: true }));

describe('productionPackages', () => {
  const lock = {
    lockfileVersion: 3,
    packages: {
      '': { name: 'gapped', version: '1.0.0' },
      'node_modules/react': { version: '19.2.3', license: 'MIT' },
      'node_modules/jest': { version: '29.7.0', dev: true },
      'node_modules/@scope/pkg': { version: '1.0.0', license: 'ISC' },
      'node_modules/a/node_modules/react': { version: '19.2.3', license: 'MIT' },
      'node_modules/a/node_modules/@scope/pkg': { version: '2.0.0', license: 'ISC' },
      'node_modules/fsevents': { version: '2.3.3', optional: true },
      'node_modules/linked': { link: true, resolved: '../linked' },
    },
  };

  test('drops the project, dev-only packages and links; keeps optional ones', () => {
    const names = productionPackages(lock).map((p) => `${p.name}@${p.version}`);
    assert.deepEqual(names, ['@scope/pkg@1.0.0', '@scope/pkg@2.0.0', 'fsevents@2.3.3', 'react@19.2.3']);
  });

  test('names nested and scoped packages from their path', () => {
    const nested = productionPackages(lock).find((p) => p.version === '2.0.0');
    assert.equal(nested.name, '@scope/pkg');
    assert.equal(nested.path, 'node_modules/a/node_modules/@scope/pkg');
  });

  test('refuses a lockfile without a packages map', () => {
    assert.throws(() => productionPackages({ lockfileVersion: 1, dependencies: {} }), BuildError);
  });
});

describe('declaredLicence', () => {
  test('reads every shape npm has allowed', () => {
    assert.equal(declaredLicence({ license: 'MIT' }), 'MIT');
    assert.equal(declaredLicence({ license: { type: 'BSD-3-Clause' } }), 'BSD-3-Clause');
    assert.equal(declaredLicence({ licenses: [{ type: 'MIT' }, { type: 'Apache-2.0' }] }), 'MIT OR Apache-2.0');
    assert.equal(declaredLicence({}), null);
  });
});

describe('a node_modules that does not match the lock', () => {
  /**
   * A project root with one installed package and one that is only in the
   * lock, plus the bundled fonts' licences every real root carries
   * (assets/fonts, written by scripts/build-fonts.py).
   */
  function fakeRoot(name, absentMeta, { fontLicences = true } = {}) {
    const root = join(temp, name);
    mkdirSync(join(root, 'node_modules', 'present'), { recursive: true });
    mkdirSync(join(root, 'site'), { recursive: true });
    writeFileSync(join(root, 'site', 'style.css'), 'body { color: black; }');
    if (fontLicences) {
      mkdirSync(join(root, 'assets', 'fonts'), { recursive: true });
      writeFileSync(join(root, 'assets', 'fonts', 'OFL-Archivo.txt'), 'SIL OPEN FONT LICENSE (Archivo)');
      writeFileSync(join(root, 'assets', 'fonts', 'OFL-MartianMono.txt'), 'SIL OPEN FONT LICENSE (Martian Mono)');
    }
    writeFileSync(
      join(root, 'node_modules', 'present', 'package.json'),
      JSON.stringify({ name: 'present', version: '1.0.0', license: 'MIT' }),
    );
    writeFileSync(join(root, 'node_modules', 'present', 'LICENSE'), 'MIT licence text');
    writeFileSync(
      join(root, 'package-lock.json'),
      JSON.stringify({
        lockfileVersion: 3,
        packages: {
          '': { name: 'fake', version: '1.0.0' },
          'node_modules/present': { version: '1.0.0', license: 'MIT' },
          'node_modules/absent': { version: '2.0.0', license: 'BSD-3-Clause', ...absentMeta },
        },
      }),
    );
    return root;
  }

  test('a missing production package stops the build and is named', () => {
    const root = fakeRoot('missing-required', {});
    assert.throws(
      () => buildAcknowledgements({ root, outDir: join(root, 'out') }),
      (e) => e instanceof BuildError && /absent@2\.0\.0/.test(e.message),
    );
  });

  test('a missing optional package (another platform\'s build) is skipped and counted', () => {
    const root = fakeRoot('missing-optional', { optional: true });
    const r = buildAcknowledgements({ root, outDir: join(root, 'out') });
    assert.equal(r.packages, 1);
    assert.deepEqual(r.skipped.map((p) => p.name), ['absent']);
  });

  test('a bundled font without its licence text stops the build and is named', () => {
    const root = fakeRoot('missing-font-licence', { optional: true }, { fontLicences: false });
    assert.throws(
      () => buildAcknowledgements({ root, outDir: join(root, 'out') }),
      (e) => e instanceof BuildError && /assets\/fonts\/OFL-Archivo\.txt is missing/.test(e.message),
    );
  });
});

describe('the page, from the real lockfile', () => {
  const result = buildAcknowledgements({ outDir: temp });
  const html = readFileSync(result.outPath, 'utf8');
  const lock = JSON.parse(readFileSync(join(ROOT, 'package-lock.json'), 'utf8'));

  test('lists the app\'s own dependencies with their licence texts', () => {
    const own = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8')).dependencies;
    for (const name of Object.keys(own)) {
      const version = lock.packages[`node_modules/${name}`]?.version;
      assert.ok(version, `${name} is in package-lock.json`);
      assert.ok(html.includes(`<tr><td>${name}</td><td>${version}</td>`), `${name} ${version} is listed`);
    }
    assert.match(html, /Permission is hereby granted, free of charge/); // MIT, as shipped
    assert.match(html, /SIL OPEN FONT LICENSE/i); // the typefaces' own licence
  });

  test('leaves out dev-only packages', () => {
    const devOnly = Object.entries(lock.packages)
      .filter(([path, meta]) => path && meta.dev)
      .map(([path]) => path.slice(path.lastIndexOf('node_modules/') + 'node_modules/'.length));
    const prodNames = new Set(productionPackages(lock).map((p) => p.name));
    const strictlyDev = devOnly.filter((n) => !prodNames.has(n));
    assert.ok(strictlyDev.length > 0);
    for (const name of strictlyDev.slice(0, 50)) {
      assert.ok(!html.includes(`<tr><td>${name}</td>`), `${name} is dev-only and should not be listed`);
    }
  });

  test('every licence link lands on a text on the page', () => {
    const ids = new Set([...html.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]));
    for (const [, anchor] of html.matchAll(/href="#([^"]+)"/g)) assert.ok(ids.has(anchor), anchor);
  });

  test('is self-contained and small enough for a phone', () => {
    assert.doesNotMatch(html, /<script/i);
    assert.doesNotMatch(html, /<(img|iframe|link)\b/i);
    assert.match(html, /Content-Security-Policy" content="default-src 'none'/);
    assert.ok(Buffer.byteLength(html) < 2_000_000, `${Buffer.byteLength(html)} bytes`);
  });
});
