/**
 * scripts/build-legal-pages.mjs: the markdown subset, the placeholders, the
 * config rules and the pages it writes.
 *
 *   node --test site/test/*.test.mjs
 *
 * Node's own runner, not Jest: Jest's roots are src/ and this is a build
 * script with no React Native in it.
 */

import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, describe, test } from 'node:test';
import {
  BuildError,
  ROOT,
  buildLegalPages,
  checkConfig,
  fillPlaceholders,
  formatDate,
  markdownToHtml,
  renderInline,
  unfilledPlaceholders,
} from '../../scripts/build-legal-pages.mjs';

const SCRIPT = join(ROOT, 'scripts', 'build-legal-pages.mjs');
const temp = mkdtempSync(join(tmpdir(), 'gapped-legal-'));
after(() => rmSync(temp, { recursive: true, force: true }));

function config(name, value) {
  const path = join(temp, `${name}.json`);
  writeFileSync(path, JSON.stringify(value));
  return path;
}

describe('renderInline', () => {
  test('escapes HTML before adding any markup', () => {
    assert.equal(renderInline('<script>alert(1)</script> & "x"'),
      '&lt;script&gt;alert(1)&lt;/script&gt; &amp; &quot;x&quot;');
  });

  test('bold, italic, code and links', () => {
    assert.equal(renderInline('**bold** and *it*'), '<strong>bold</strong> and <em>it</em>');
    assert.equal(renderInline('use `a<b>`'), 'use <code>a&lt;b&gt;</code>');
    assert.equal(
      renderInline('see [the **terms**](https://example.org/a?b=1&c=2)'),
      'see <a href="https://example.org/a?b=1&amp;c=2">the <strong>terms</strong></a>',
    );
    assert.equal(renderInline('<https://ico.org.uk>'), '<a href="https://ico.org.uk">https://ico.org.uk</a>');
  });

  test('underscores inside words are not emphasis', () => {
    assert.equal(renderInline('sample_driver_1 and {{CONTACT_EMAIL}}'), 'sample_driver_1 and {{CONTACT_EMAIL}}');
  });
});

describe('markdownToHtml', () => {
  test('headings get unique ids and the first h1 is the title', () => {
    const { html, title, ids } = markdownToHtml('# Gapped Policy\n\n## Your rights\n\n## Your rights\n');
    assert.equal(title, 'Gapped Policy');
    assert.match(html, /<h1 id="gapped-policy">Gapped Policy<\/h1>/);
    assert.match(html, /<h2 id="your-rights">/);
    assert.match(html, /<h2 id="your-rights-1">/);
    assert.deepEqual(ids, ['gapped-policy', 'your-rights']);
  });

  test('paragraphs join lines; a trailing backslash is a hard break', () => {
    const { html } = markdownToHtml('one\ntwo\n\nToby\\\nGuernsey');
    assert.match(html, /<p>one two<\/p>/);
    assert.match(html, /<p>Toby<br>\nGuernsey<\/p>/);
  });

  test('bullet, numbered and nested lists', () => {
    const { html } = markdownToHtml('- a\n- b\n  - b1\n- c\n\n3. three\n4. four');
    assert.match(html, /<ul>\n<li>a<\/li>\n<li>b<ul>\n<li>b1<\/li>\n<\/ul><\/li>\n<li>c<\/li>\n<\/ul>/);
    assert.match(html, /<ol start="3">\n<li>three<\/li>\n<li>four<\/li>\n<\/ol>/);
  });

  test('pipe tables scroll on their own and carry labels for the phone layout', () => {
    const { html } = markdownToHtml('| What | How long |\n| --- | --- |\n| Points | 90 days |\n');
    assert.match(html, /^<div class="table-wrap"><table class="stack" role="table">/);
    assert.match(html, /<th role="columnheader">What<\/th><th role="columnheader">How long<\/th>/);
    assert.match(html, /<td role="cell" data-label="What">Points<\/td><td role="cell" data-label="How long">90 days<\/td>/);
  });

  test('a header with markup or an ampersand labels its cells once-escaped', () => {
    const { html } = markdownToHtml('| **Who** & why | B |\n| --- | --- |\n| x | y |\n');
    assert.match(html, /<td role="cell" data-label="Who &amp; why">x<\/td>/);
  });

  test('blockquotes and rules', () => {
    const { html } = markdownToHtml('> quoted **text**\n\n---\n');
    assert.match(html, /<blockquote>\n<p>quoted <strong>text<\/strong><\/p>\n<\/blockquote>/);
    assert.match(html, /<hr>/);
  });
});

describe('placeholders and config', () => {
  test('fill only known keys, report the rest', () => {
    const out = fillPlaceholders('{{A}} {{B}}', { A: 'x' });
    assert.equal(out, 'x {{B}}');
    assert.deepEqual(unfilledPlaceholders(out), ['{{B}}']);
  });

  test('formatDate writes British dates and refuses impossible ones', () => {
    assert.equal(formatDate('2026-10-05'), '5 October 2026');
    assert.equal(formatDate('2026-02-30'), null);
    assert.equal(formatDate('05/10/2026'), null);
  });

  test('an empty contact address fails unless it is a draft', () => {
    const empty = { contactEmail: '', effectiveDate: '2026-10-05' };
    assert.match(checkConfig(empty)[0], /contactEmail is empty/);
    assert.match(checkConfig(empty)[0], /--draft/);
    assert.deepEqual(checkConfig(empty, { draft: true }), []);
    assert.match(checkConfig({ contactEmail: 'not an address', effectiveDate: '2026-10-05' })[0], /does not look like/);
    assert.match(checkConfig({ contactEmail: 'a@b.co', effectiveDate: 'soon' })[0], /effectiveDate/);
    assert.deepEqual(checkConfig({ contactEmail: 'a@b.co', effectiveDate: '2026-10-05' }), []);
  });

  test('the committed config is the expected shape', () => {
    const committed = JSON.parse(readFileSync(join(ROOT, 'site', 'site.config.json'), 'utf8'));
    assert.deepEqual(Object.keys(committed).sort(), ['contactEmail', 'effectiveDate']);
    assert.ok(formatDate(committed.effectiveDate));
  });
});

describe('the build', () => {
  test('without a contact address the CLI exits 1 and says how to fix it', () => {
    const out = join(temp, 'refused');
    const r = spawnSync(process.execPath, [SCRIPT, '--config', config('empty', {
      contactEmail: '',
      effectiveDate: '2026-10-05',
    }), '--out', out], { encoding: 'utf8' });
    assert.equal(r.status, 1);
    assert.match(r.stderr, /contactEmail is empty/);
    assert.match(r.stderr, /--draft/);
    assert.equal(existsSync(join(out, 'privacy', 'index.html')), false);
    assert.throws(
      () => buildLegalPages({ configPath: join(temp, 'empty.json'), outDir: out }),
      BuildError,
    );
  });

  const outDir = join(temp, 'published');
  const written = buildLegalPages({
    configPath: config('real', { contactEmail: 'help@example.org', effectiveDate: '2026-10-05' }),
    outDir,
  });
  const pages = ['index.html', 'privacy/index.html', 'terms/index.html', 'support/index.html'];
  const read = (p) => readFileSync(join(outDir, p), 'utf8');

  test('writes every page and .nojekyll', () => {
    for (const p of [...pages, '.nojekyll']) assert.ok(existsSync(join(outDir, p)), p);
    assert.equal(written.length, pages.length + 1);
  });

  test('fills the address and the date, and leaves no placeholder behind', () => {
    for (const p of pages) assert.deepEqual(unfilledPlaceholders(read(p)), [], p);
    for (const p of ['privacy/index.html', 'terms/index.html', 'support/index.html']) {
      assert.match(read(p), /<a href="mailto:help@example\.org">help@example\.org<\/a>/, p);
    }
    assert.match(read('privacy/index.html'), /Effective date:<\/strong> 5 October 2026/);
    assert.match(read('terms/index.html'), /Effective date:<\/strong> 5 October 2026/);
  });

  test('pages are self-contained: no scripts, nothing loaded from elsewhere', () => {
    for (const p of pages) {
      const html = read(p);
      assert.doesNotMatch(html, /<script/i, p);
      assert.doesNotMatch(html, /<link[^>]+rel="?stylesheet/i, p);
      assert.doesNotMatch(html, /<(img|iframe|video|audio|source)\b/i, p);
      assert.doesNotMatch(html, /@import|url\(/i, p);
      assert.match(html, /Content-Security-Policy" content="default-src 'none'/, p);
      assert.match(html, /<meta name="viewport" content="width=device-width, initial-scale=1">/, p);
      assert.match(html, /prefers-color-scheme: dark/, p);
      assert.doesNotMatch(html, /noindex/, p);
    }
  });

  test('every in-page anchor link points at an id on that page', () => {
    for (const p of pages) {
      const html = read(p);
      const ids = new Set([...html.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]));
      for (const [, anchor] of html.matchAll(/href="#([^"]+)"/g)) {
        assert.ok(ids.has(anchor), `${p} links to #${anchor}, which is not on the page`);
      }
    }
  });

  test('links between pages point at the right ids', () => {
    const privacyIds = new Set([...read('privacy/index.html').matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]));
    for (const p of pages) {
      for (const [, anchor] of read(p).matchAll(/href="(?:\.\.\/|\.\/)privacy\/#([^"]+)"/g)) {
        assert.ok(privacyIds.has(anchor), `${p} links to privacy/#${anchor}, which does not exist`);
      }
    }
  });

  test('a draft says so, hides from search engines and has no address', () => {
    const draftDir = join(temp, 'draft');
    buildLegalPages({
      configPath: config('draft', { contactEmail: '', effectiveDate: '2026-10-05' }),
      outDir: draftDir,
      draft: true,
    });
    for (const p of pages) {
      const html = readFileSync(join(draftDir, p), 'utf8');
      assert.match(html, /<meta name="robots" content="noindex, nofollow">/, p);
      assert.match(html, /Draft preview, not for publishing/, p);
      assert.doesNotMatch(html, /mailto:/, p);
    }
    assert.match(readFileSync(join(draftDir, 'privacy/index.html'), 'utf8'), /Contact address coming soon/);
    assert.match(readFileSync(join(draftDir, 'support/index.html'), 'utf8'), /Contact address coming soon/);
    assert.match(readFileSync(join(draftDir, 'privacy/index.html'), 'utf8'), /has not been set yet/);
  });

  test('a draft of a config with an address does not claim the address is missing', () => {
    const draftDir = join(temp, 'draft-with-address');
    buildLegalPages({
      configPath: config('draft-address', { contactEmail: 'help@example.org', effectiveDate: '2026-10-05' }),
      outDir: draftDir,
      draft: true,
    });
    for (const p of pages) {
      const html = readFileSync(join(draftDir, p), 'utf8');
      assert.match(html, /Draft preview, not for publishing/, p);
      assert.doesNotMatch(html, /has not been set yet/, p);
    }
  });
});
