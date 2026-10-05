/**
 * The words that leave this repository: the published policy, terms and web
 * pages, and the App Store listing and review notes pasted into App Store
 * Connect. Checks the rules the launch decisions set, so a later edit cannot
 * quietly break one:
 *
 *   - no email address anywhere; the address comes only from
 *     site/site.config.json at build time
 *   - gapped.app is not used (it is a locked WordPress)
 *   - every link to the public pages is one src/config/links.ts exports
 *   - nothing mentions Pro, and nothing left over from drafting
 *   - every App Store field fits Apple's limit
 *
 *   node --test site/test/*.test.mjs
 */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, test } from 'node:test';
import { ROOT } from '../../scripts/build-legal-pages.mjs';

const read = (p) => readFileSync(join(ROOT, p), 'utf8');

/** The URLs src/config/links.ts exports, read from the file itself. */
function publicUrls() {
  const src = read('src/config/links.ts');
  const site = /const SITE = '([^']+)'/.exec(src)?.[1];
  assert.ok(site, 'links.ts defines SITE');
  const urls = {};
  for (const [, name, path] of src.matchAll(/export const (\w+_URL) = `\$\{SITE\}([^`]*)`/g)) {
    urls[name] = `${site}${path}`;
  }
  return { site, urls };
}

const PUBLISHED = ['docs/PRIVACY.md', 'docs/TERMS.md', 'site/index.html', 'site/support/index.html'];
const PASTED = ['docs/APP_STORE_LISTING.md', 'docs/APP_REVIEW_NOTES.md'];
const OWNED_DOCS = [
  ...PUBLISHED,
  ...PASTED,
  'docs/APP_PRIVACY_LABELS.md',
  'docs/MODERATION.md',
  'docs/DPIA.md',
  'docs/LAUNCH.md',
  'docs/ONBOARDING.md',
  'docs/STAGING.md',
  'docs/DELETING_TEST_DRIVES.md',
  'README.md',
  'ROADMAP.md',
  'LICENSE',
];

const EMAIL = /[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}/;

describe('published and pasted text', () => {
  test('contains no email address and never names gapped.app', () => {
    for (const p of OWNED_DOCS) {
      const text = read(p);
      assert.doesNotMatch(text, EMAIL, `${p} contains an email address`);
      assert.doesNotMatch(text, /gapped\.app/i, `${p} mentions gapped.app`);
    }
  });

  test('the policy, terms and support page get the address from the build', () => {
    for (const p of ['docs/PRIVACY.md', 'docs/TERMS.md', 'site/support/index.html']) {
      assert.match(read(p), /\{\{CONTACT_EMAIL\}\}/, p);
    }
    for (const p of ['docs/PRIVACY.md', 'docs/TERMS.md']) {
      assert.match(read(p), /\*\*Effective date:\*\* \{\{EFFECTIVE_DATE\}\}/, p);
    }
  });

  test('says nothing about Pro and nothing left over from drafting', () => {
    for (const p of [...PUBLISHED, ...PASTED]) {
      const text = read(p);
      const body = p.endsWith('.md') && PASTED.includes(p) ? fields(text).map((f) => f.value).join('\n') : text;
      assert.doesNotMatch(body, /\bPro\b|\bPRO\b|Gapped Pro|paywall/, `${p} mentions Pro`);
    }
    for (const p of PUBLISHED) {
      assert.doesNotMatch(read(p), /\bTODO\b|\bTBD\b|\bFIXME\b|\bDRAFT\b|not legal advice/i, p);
    }
  });

  test('every link to the public pages is one links.ts exports', () => {
    const { site, urls } = publicUrls();
    const allowed = new Set([`${site}/`, ...Object.values(urls)]);
    const pattern = new RegExp(`${site.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}[^\\s)"'\`<>{]*`, 'g');
    for (const p of OWNED_DOCS) {
      for (const [match] of read(p).matchAll(pattern)) {
        const url = match.replace(/[.,;:]+$/, '');
        assert.ok(allowed.has(url), `${p} links to ${url}, which links.ts does not export`);
      }
    }
  });
});

/** Every `<!-- field:name max:N -->` and the ```text block under it. */
function fields(markdown) {
  return [...markdown.matchAll(/<!-- field:(\S+) max:(\d+) -->\s*```text\n([\s\S]*?)\n```/g)].map(
    (m) => ({ name: m[1], max: Number(m[2]), value: m[3] }),
  );
}

describe('App Store Connect fields', () => {
  const listing = fields(read('docs/APP_STORE_LISTING.md'));
  const notes = fields(read('docs/APP_REVIEW_NOTES.md'));
  const field = (name) => listing.find((f) => f.name === name)?.value;

  test('every field is present and within Apple\'s limit', () => {
    const names = listing.map((f) => f.name);
    for (const required of ['name', 'subtitle', 'promotional-text', 'description', 'keywords', 'whats-new', 'copyright']) {
      assert.ok(names.includes(required), `listing has ${required}`);
    }
    assert.deepEqual(notes.map((f) => f.name), ['review-notes']);
    for (const f of [...listing, ...notes]) {
      assert.ok(f.value.trim().length > 0, `${f.name} is empty`);
      assert.ok([...f.value].length <= f.max, `${f.name} is ${[...f.value].length} characters, limit ${f.max}`);
    }
  });

  test('the limits are Apple\'s', () => {
    const max = Object.fromEntries([...listing, ...notes].map((f) => [f.name, f.max]));
    assert.equal(max.name, 30);
    assert.equal(max.subtitle, 30);
    assert.equal(max['promotional-text'], 170);
    assert.equal(max.description, 4000);
    assert.equal(max.keywords, 100);
    assert.equal(max['review-notes'], 4000);
  });

  test('the description sells nothing that is not in this build and no road racing', () => {
    const d = field('description');
    assert.doesNotMatch(d, /\b(pro|premium|subscription|subscribe|price|pricing|purchase|trial|coming soon|soon)\b/i);
    assert.doesNotMatch(d, /\b(race|races|racing|street|beat your mates|fastest driver)\b/i);
    assert.match(d, /18 and over/);
    assert.match(d, /never a public road/);
  });

  test('the short fields say nothing about price', () => {
    for (const name of ['name', 'subtitle', 'promotional-text', 'keywords', 'whats-new']) {
      assert.doesNotMatch(field(name), /\b(free|price|pricing|pro|premium|subscription)\b/i, name);
    }
  });

  test('keywords: no spaces after commas, no competitors, no repeat of the name', () => {
    const k = field('keywords');
    assert.doesNotMatch(k, /, /);
    assert.doesNotMatch(k, /triprank|open ?road|waze|strava|google|apple/i);
    assert.doesNotMatch(k, /gapped/i);
    assert.equal(new Set(k.split(',')).size, k.split(',').length, 'no keyword repeated');
  });

  test('the copyright line is the owner\'s', () => {
    assert.equal(field('copyright'), '2026 Toby Mcintosh');
  });

  test('the review notes give the live privacy, terms and support links', () => {
    const { urls } = publicUrls();
    const text = notes[0].value;
    for (const key of ['PRIVACY_URL', 'TERMS_URL', 'SUPPORT_URL']) {
      assert.ok(text.includes(urls[key]), `review notes include ${key}`);
    }
  });
});
