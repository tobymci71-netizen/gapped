#!/usr/bin/env node
/**
 * Builds site/dist/acknowledgements/index.html, the page the app's
 * Acknowledgements row opens (ACKNOWLEDGEMENTS_URL in src/config/links.ts):
 * every open-source package in the app's production dependency tree, with
 * the licence it declares and the licence text it ships.
 *
 *   node scripts/build-acknowledgements.mjs            (after npm install)
 *   node scripts/build-acknowledgements.mjs --out <dir>
 *
 * ── Where the list comes from ────────────────────────────────────────────────
 * package-lock.json, not a walk of node_modules: the lock says which packages
 * the production tree contains (every entry not marked "dev"), and
 * node_modules/<pkg> supplies each one's package.json and its LICENSE,
 * LICENCE, COPYING or NOTICE files, read exactly as the package ships them.
 * No network: a licence text typed or fetched from elsewhere would be a text
 * nobody checked against the package.
 *
 * The production tree includes some tools that only build the app (Metro,
 * Babel and the like) and never reach the phone. They are listed anyway:
 * telling them apart reliably would need the bundler's own module graph, and
 * an acknowledgement nobody needed costs nothing, where a missing one is a
 * licence breach.
 *
 * Optional packages for other platforms (a Linux build of a native tool, say)
 * are in the lock but not installed here. They are skipped and counted. A
 * missing package that is NOT optional stops the build: it means node_modules
 * does not match the lock, and the page would silently leave a licence out.
 *
 * Identical licence texts are printed once, with every package that uses
 * them, which keeps the page to a size a phone can open.
 *
 * Shares its page chrome with scripts/build-legal-pages.mjs, so every public
 * page looks and behaves the same: no scripts, nothing loaded from elsewhere.
 */

import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';
import {
  BuildError,
  ROOT,
  escapeHtml,
  pageShell,
  readJson,
} from './build-legal-pages.mjs';

/** Files a package uses to carry its licence or notices. */
const LICENCE_FILE = /^(licen[cs]e|copying|notice)([._-].*)?$/i;
/** …but not code that merely has the word in its name. */
const NOT_A_TEXT = /\.(c?js|mjs|ts|tsx|json|map|flow)$/i;

/**
 * The production packages a lockfile (v2 or v3) records, one per
 * name@version, sorted by name.
 */
export function productionPackages(lock) {
  if (!lock || typeof lock !== 'object' || !lock.packages) {
    throw new BuildError(
      'package-lock.json has no "packages" map. Regenerate it with npm 7 or later (lockfileVersion 2+).',
    );
  }
  const byKey = new Map();
  for (const [path, meta] of Object.entries(lock.packages)) {
    if (!path || !meta) continue; // "" is the project itself
    if (meta.dev || meta.link) continue;
    const name = meta.name ?? path.slice(path.lastIndexOf('node_modules/') + 'node_modules/'.length);
    const key = `${name}@${meta.version}`;
    if (!byKey.has(key)) {
      byKey.set(key, {
        name,
        version: meta.version ?? '',
        path,
        declared: meta.license ?? null,
        optional: Boolean(meta.optional || meta.devOptional),
      });
    }
  }
  return [...byKey.values()].sort(
    (a, b) => a.name.localeCompare(b.name, 'en') || a.version.localeCompare(b.version, 'en'),
  );
}

/** The licence a package.json declares, in any of the shapes npm has allowed. */
export function declaredLicence(pkgJson) {
  const l = pkgJson?.license ?? pkgJson?.licenses;
  if (typeof l === 'string') return l;
  if (Array.isArray(l)) {
    const names = l.map((x) => (typeof x === 'string' ? x : x?.type)).filter(Boolean);
    return names.length > 0 ? names.join(' OR ') : null;
  }
  if (l && typeof l === 'object' && typeof l.type === 'string') return l.type;
  return null;
}

/** Normalised text, so the same licence shipped twice is printed once. */
function normalise(text) {
  return text.replace(/\r\n?/g, '\n').replace(/[ \t]+$/gm, '').trim();
}

/**
 * Reads one installed package: its declared licence and its licence files.
 * Null when it is not installed (an optional package for another platform).
 */
export function readPackage(root, pkg) {
  const dir = join(root, pkg.path);
  const manifest = join(dir, 'package.json');
  if (!existsSync(manifest)) return null;
  const pkgJson = readJson(manifest);
  const files = readdirSync(dir)
    .filter((f) => LICENCE_FILE.test(f) && !NOT_A_TEXT.test(f))
    .filter((f) => statSync(join(dir, f)).isFile())
    .sort();
  return {
    ...pkg,
    licence: declaredLicence(pkgJson) ?? pkg.declared ?? 'Not declared',
    homepage: typeof pkgJson.homepage === 'string' ? pkgJson.homepage : null,
    texts: files
      .map((file) => ({ file, text: normalise(readFileSync(join(dir, file), 'utf8')) }))
      .filter((t) => t.text.length > 0),
  };
}

/**
 * Data and artwork the app ships that did not come from npm, from the
 * provenance recorded where each is generated or used.
 */
const OTHER_SOURCES = [
  'Country outlines on the onboarding map: <strong>Natural Earth</strong>, public domain (src/data/countryDots.json).',
  'Country names: <strong>Unicode CLDR</strong>, as bundled with Node.js ICU. Copyright &copy; Unicode, Inc. Used under the Unicode License v3 (unicode.org/license.txt).',
  'Vehicle makes and models, and VIN lookups: the US Department of Transportation&#39;s <strong>NHTSA vPIC</strong> database, a US Government work.',
  'Brand marks on the &ldquo;How did you hear about us?&rdquo; step: <strong>Simple Icons</strong>, CC0 1.0. The marks themselves are trademarks of their owners and are used only to name their services.',
  'Typefaces: <strong>Inter</strong> and <strong>Archivo</strong>, under the SIL Open Font License 1.1. Their full licence texts are below, with the @expo-google-fonts packages that carry them.',
  'Maps: <strong>Apple Maps</strong>. Map data &copy; Apple and its data providers, credited on the map itself.',
];

/**
 * The footer's copyright year: the effective date's, as on the pages
 * build-legal-pages.mjs writes, so the five pages never disagree.
 */
function configYear(root) {
  const path = join(root, 'site', 'site.config.json');
  const date = existsSync(path) ? readJson(path).effectiveDate : null;
  return /^\d{4}-/.test(String(date ?? '')) ? String(date).slice(0, 4) : String(new Date().getUTCFullYear());
}

export function buildAcknowledgements({
  root = ROOT,
  outDir = join(root, 'site', 'dist'),
  year = configYear(root),
} = {}) {
  const lockPath = join(root, 'package-lock.json');
  const lock = readJson(lockPath);
  if (!existsSync(join(root, 'node_modules'))) {
    throw new BuildError(
      'build-acknowledgements: node_modules is missing. Run `npm install --legacy-peer-deps` first: ' +
        'the licence texts are read from the installed packages.',
    );
  }
  const cssPath = join(root, 'site', 'style.css');
  if (!existsSync(cssPath)) throw new BuildError(`Cannot find ${cssPath}.`);
  const css = readFileSync(cssPath, 'utf8');

  const listed = productionPackages(lock);
  const installed = [];
  const skipped = [];
  for (const pkg of listed) {
    const read = readPackage(root, pkg);
    if (read) installed.push(read);
    else skipped.push(pkg);
  }
  if (installed.length === 0) {
    throw new BuildError('build-acknowledgements: no production package is installed. Run npm install first.');
  }
  const missing = skipped.filter((p) => !p.optional);
  if (missing.length > 0) {
    throw new BuildError(
      'build-acknowledgements: these production packages are in package-lock.json but not in ' +
        `node_modules, so their licences cannot be read: ${missing.map((p) => `${p.name}@${p.version}`).join(', ')}. ` +
        'Run `npm install --legacy-peer-deps` and build again.',
    );
  }

  // One entry per distinct text, in the order its first user appears.
  const texts = new Map();
  for (const pkg of installed) {
    pkg.textIds = [];
    for (const t of pkg.texts) {
      const id = `t-${createHash('sha256').update(t.text).digest('hex').slice(0, 12)}`;
      if (!texts.has(id)) texts.set(id, { id, text: t.text, users: [] });
      texts.get(id).users.push(`${pkg.name} ${pkg.version} (${t.file})`);
      pkg.textIds.push(id);
    }
  }

  const rows = installed
    .map((p) => {
      const licence = escapeHtml(p.licence);
      const cell =
        p.textIds.length > 0
          ? p.textIds
              .map((id, k) => `<a href="#${id}">${k === 0 ? licence : `${escapeHtml(p.texts[k].file)}`}</a>`)
              .join(', ')
          : `${licence} <span class="muted">(no licence file shipped)</span>`;
      return `<tr><td>${escapeHtml(p.name)}</td><td>${escapeHtml(p.version)}</td><td>${cell}</td></tr>`;
    })
    .join('\n');

  const textBlocks = [...texts.values()]
    .map(
      (t) =>
        `<h3 id="${t.id}">${escapeHtml(t.users[0])}${t.users.length > 1 ? ` and ${t.users.length - 1} more` : ''}</h3>\n` +
        (t.users.length > 1 ? `<p class="muted">Used by: ${t.users.map(escapeHtml).join(', ')}</p>\n` : '') +
        `<pre>${escapeHtml(t.text)}</pre>`,
    )
    .join('\n');

  const withoutFile = installed.filter((p) => p.textIds.length === 0).length;

  const body = `<h1 id="acknowledgements">Acknowledgements</h1>
<p class="lede">Gapped is built with open-source software and open data. Thank you to everyone who made them.</p>
<p>This page lists every package in the app&#39;s production dependency tree (${installed.length} packages), some of which are tools used only to build the app, with the licence each declares and the licence text it ships. Identical texts are printed once.${
    withoutFile > 0
      ? ` ${withoutFile} packages declare a licence but ship no licence file; the standard text of the licence each declares applies to them.`
      : ''
  }</p>
<h2 id="data-and-artwork">Data and artwork</h2>
<ul>
${OTHER_SOURCES.map((s) => `<li>${s}</li>`).join('\n')}
</ul>
<h2 id="packages">Packages</h2>
<div class="table-wrap"><table>
<thead><tr><th>Package</th><th>Version</th><th>Licence</th></tr></thead>
<tbody>
${rows}
</tbody>
</table></div>
<h2 id="licence-texts">Licence texts</h2>
${textBlocks}`;

  const html = pageShell({
    title: 'Acknowledgements',
    description: 'The open-source software and open data Gapped is built with, and their licences.',
    body,
    css,
    depth: 1,
    draft: false,
    year,
  });

  const outPath = join(outDir, 'acknowledgements', 'index.html');
  mkdirSync(dirname(outPath), { recursive: true });
  writeFileSync(outPath, html);
  return { outPath, packages: installed.length, texts: texts.size, skipped };
}

function main() {
  const { values: args } = parseArgs({ options: { out: { type: 'string' } } });
  const result = buildAcknowledgements(args.out ? { outDir: resolve(args.out) } : {});
  console.log(`wrote ${relative(process.cwd(), result.outPath)}`);
  console.log(
    `  ${result.packages} packages, ${result.texts} distinct licence texts` +
      (result.skipped.length > 0
        ? `; ${result.skipped.length} optional packages for other platforms are not installed here and were skipped`
        : ''),
  );
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    main();
  } catch (e) {
    if (e instanceof BuildError) {
      console.error(e.message);
      process.exit(1);
    }
    throw e;
  }
}
