#!/usr/bin/env node
/**
 * Builds the public web pages that src/config/links.ts points at, for GitHub
 * Pages:
 *
 *   docs/PRIVACY.md          → site/dist/privacy/index.html
 *   docs/TERMS.md            → site/dist/terms/index.html
 *   site/support/index.html  → site/dist/support/index.html
 *   site/index.html          → site/dist/index.html
 *   site/.nojekyll           → site/dist/.nojekyll
 *
 * scripts/build-acknowledgements.mjs adds site/dist/acknowledgements/. Each
 * script writes only its own files, so they can run in either order.
 *
 *   node scripts/build-legal-pages.mjs            publishable build
 *   node scripts/build-legal-pages.mjs --draft    preview before the contact
 *                                                 address is decided
 *
 * Options for tests and one-off builds: --config <file> (default
 * site/site.config.json) and --out <dir> (default site/dist).
 *
 * ── Placeholders ─────────────────────────────────────────────────────────────
 * The documents never contain the contact address or the effective date. They
 * say {{CONTACT_EMAIL}} and {{EFFECTIVE_DATE}}, and this fills them from
 * site/site.config.json, so the address lives in exactly one place and can
 * change without touching a policy or shipping an app build (the app links to
 * the support page, never to an address).
 *
 * A build with no contactEmail FAILS. A privacy policy with no working contact
 * is not publishable, and an empty string would otherwise render as a
 * sentence with a hole in it. --draft builds anyway, says "Contact address
 * coming soon" where the address goes, marks every page as a draft and asks
 * search engines not to index it, so the owner can read the pages first.
 *
 * Any {{PLACEHOLDER}} left after filling is also a failure: a typo in a
 * document must not reach the published page as literal braces.
 *
 * ── No network, no dependencies ──────────────────────────────────────────────
 * Nothing markdown-shaped is installed, and the two documents use a small,
 * known subset of it, so the converter below handles exactly that subset:
 * headings, paragraphs, hard line breaks, bullet and numbered lists (nested
 * by indentation), pipe tables, blockquotes, rules, bold, italic, inline code
 * and links. Every piece of text is HTML-escaped before markup is added.
 *
 * The pages it writes load nothing: the stylesheet (site/style.css) is
 * inlined, there are no scripts, fonts or images, and each page carries a
 * Content-Security-Policy that would block them if one were ever added.
 */

import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';

export const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

/** A failure the person running the build can act on; printed without a stack. */
export class BuildError extends Error {
  constructor(message) {
    super(message);
    this.name = 'BuildError';
  }
}

// ── HTML helpers ─────────────────────────────────────────────────────────────

export function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** Lower-case, hyphenated anchor id, as GitHub makes them for headings. */
export function slugify(text) {
  return String(text)
    .replace(/<[^>]*>/g, '')
    .replace(/&[a-z#0-9]+;/gi, '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s-]/gu, '')
    .trim()
    .replace(/\s+/g, '-');
}

// ── Markdown, the subset the documents use ───────────────────────────────────

const HARD_BREAK = '\u0001';

/**
 * One line (or a joined paragraph) of inline markdown to HTML.
 *
 * Code spans and links are lifted out first and replaced by numbered tokens,
 * so their contents are not read as emphasis and their URLs are escaped once,
 * as attributes. Then the remaining text is escaped and emphasis applied.
 */
export function renderInline(src) {
  const tokens = [];
  const stash = (html) => `\u0000${tokens.push(html) - 1}\u0000`;
  let s = String(src);

  s = s.replace(/`([^`]+)`/g, (_, code) => stash(`<code>${escapeHtml(code)}</code>`));
  s = s.replace(/<(https?:\/\/[^\s>]+)>/g, (_, url) =>
    stash(`<a href="${escapeHtml(url)}">${escapeHtml(url)}</a>`),
  );
  s = s.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (_, text, url) =>
    stash(`<a href="${escapeHtml(url)}">${renderInline(text)}</a>`),
  );

  s = escapeHtml(s);
  s = s.replace(/\*\*(?=\S)(.+?)(?<=\S)\*\*/g, '<strong>$1</strong>');
  s = s.replace(/(^|[^\w*])\*(?=[^\s*])(.+?)(?<=[^\s*])\*(?![\w*])/g, '$1<em>$2</em>');
  s = s.replace(/(^|[^\w])_(?=\S)(.+?)(?<=\S)_(?!\w)/g, '$1<em>$2</em>');

  s = s.replace(/\u0000(\d+)\u0000/g, (_, i) => tokens[Number(i)]);
  return s.replaceAll(HARD_BREAK, '<br>\n');
}

/**
 * The lines of one paragraph or list item, joined. A line ending in a
 * backslash or two spaces is a hard break (CommonMark), which the documents
 * use for the contact block.
 */
function renderLines(lines) {
  const joined = lines
    .map((line, i) => {
      const last = i === lines.length - 1;
      if (!last && /\\$/.test(line)) return line.replace(/\\$/, '') + HARD_BREAK;
      if (!last && / {2,}$/.test(line)) return line.trimEnd() + HARD_BREAK;
      return line.trim();
    })
    .join(' ')
    .replace(new RegExp(`${HARD_BREAK} `, 'g'), HARD_BREAK);
  return renderInline(joined.trim());
}

const RE = {
  blank: /^\s*$/,
  heading: /^(#{1,6})\s+(.*?)\s*#*\s*$/,
  rule: /^ {0,3}([-*_])(\s*\1){2,}\s*$/,
  quote: /^\s*>/,
  item: /^(\s*)([-*+]|\d+[.)])\s+(.*)$/,
  tableSep: /^\s*\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)*\|?\s*$/,
};

const isTableStart = (lines, i) =>
  lines[i].includes('|') && i + 1 < lines.length && RE.tableSep.test(lines[i + 1]);

/** Whether `line` starts a block other than a paragraph. */
function startsBlock(lines, i) {
  const line = lines[i];
  return (
    RE.heading.test(line) ||
    RE.rule.test(line) ||
    RE.quote.test(line) ||
    RE.item.test(line) ||
    isTableStart(lines, i)
  );
}

function tableCells(row) {
  return row
    .trim()
    .replace(/^\|/, '')
    .replace(/\|$/, '')
    .split('|')
    .map((c) => c.trim());
}

function parseTable(lines, start) {
  const head = tableCells(lines[start]);
  let i = start + 2;
  const rows = [];
  while (i < lines.length && !RE.blank.test(lines[i]) && lines[i].includes('|')) {
    rows.push(tableCells(lines[i]));
    i++;
  }
  // On a phone the table stacks into one card per row (site/style.css), and
  // each cell shows its column name from data-label. The roles keep it a table
  // for VoiceOver, which drops table semantics once the display changes.
  // renderInline's output is already escaped; only its tags are dropped.
  const labels = head.map((c) => renderInline(c).replace(/<[^>]*>/g, ''));
  const th = head.map((c) => `<th role="columnheader">${renderInline(c)}</th>`).join('');
  const body = rows
    .map(
      (r) =>
        `<tr role="row">${head
          .map((_, k) => `<td role="cell" data-label="${labels[k]}">${renderInline(r[k] ?? '')}</td>`)
          .join('')}</tr>`,
    )
    .join('\n');
  return {
    html: `<div class="table-wrap"><table class="stack" role="table">\n<thead><tr role="row">${th}</tr></thead>\n<tbody>\n${body}\n</tbody>\n</table></div>`,
    next: i,
  };
}

const isOrdered = (marker) => /\d/.test(marker);

function parseList(lines, start) {
  const first = RE.item.exec(lines[start]);
  const indent = first[1].length;
  const ordered = isOrdered(first[2]);
  const startAt = ordered ? parseInt(first[2], 10) : 1;
  const items = [];
  let i = start;

  while (i < lines.length) {
    const line = lines[i];
    if (RE.blank.test(line)) {
      // A blank line between items keeps the list going; anything else ends it.
      let j = i + 1;
      while (j < lines.length && RE.blank.test(lines[j])) j++;
      const m = j < lines.length ? RE.item.exec(lines[j]) : null;
      if (m && m[1].length >= indent && (m[1].length > indent || isOrdered(m[2]) === ordered)) {
        i = j;
        continue;
      }
      break;
    }
    const m = RE.item.exec(line);
    if (m && m[1].length === indent) {
      if (isOrdered(m[2]) !== ordered) break;
      items.push({ lines: [m[3]], children: [] });
      i++;
    } else if (m && m[1].length > indent && items.length > 0) {
      const nested = parseList(lines, i);
      items[items.length - 1].children.push(nested.html);
      i = nested.next;
    } else if (!m && items.length > 0 && !startsBlock(lines, i)) {
      items[items.length - 1].lines.push(line);
      i++;
    } else {
      break;
    }
  }

  const tag = ordered ? 'ol' : 'ul';
  const open = ordered && startAt !== 1 ? `<ol start="${startAt}">` : `<${tag}>`;
  const body = items
    .map((it) => `<li>${renderLines(it.lines)}${it.children.join('')}</li>`)
    .join('\n');
  return { html: `${open}\n${body}\n</${tag}>`, next: i };
}

/**
 * Markdown to an HTML fragment. Returns the fragment, the text of the first
 * level-one heading (the page title) and every heading id, so a caller can
 * check its anchors.
 */
export function markdownToHtml(markdown) {
  const lines = String(markdown).replace(/\r\n?/g, '\n').split('\n');
  const out = [];
  const ids = new Map();
  let title = null;
  let i = 0;

  const uniqueId = (text) => {
    const base = slugify(text) || 'section';
    const n = ids.get(base) ?? 0;
    ids.set(base, n + 1);
    return n === 0 ? base : `${base}-${n}`;
  };

  while (i < lines.length) {
    const line = lines[i];
    if (RE.blank.test(line)) {
      i++;
      continue;
    }

    const h = RE.heading.exec(line);
    if (h) {
      const level = h[1].length;
      const inner = renderInline(h[2]);
      if (level === 1 && title === null) title = inner.replace(/<[^>]*>/g, '');
      out.push(`<h${level} id="${uniqueId(inner)}">${inner}</h${level}>`);
      i++;
      continue;
    }

    if (RE.rule.test(line)) {
      out.push('<hr>');
      i++;
      continue;
    }

    if (RE.quote.test(line)) {
      const inner = [];
      while (i < lines.length && RE.quote.test(lines[i])) {
        inner.push(lines[i].replace(/^\s*> ?/, ''));
        i++;
      }
      out.push(`<blockquote>\n${markdownToHtml(inner.join('\n')).html}\n</blockquote>`);
      continue;
    }

    if (isTableStart(lines, i)) {
      const t = parseTable(lines, i);
      out.push(t.html);
      i = t.next;
      continue;
    }

    if (RE.item.test(line)) {
      const l = parseList(lines, i);
      out.push(l.html);
      i = l.next;
      continue;
    }

    const para = [];
    while (i < lines.length && !RE.blank.test(lines[i]) && (para.length === 0 || !startsBlock(lines, i))) {
      para.push(lines[i]);
      i++;
    }
    out.push(`<p>${renderLines(para)}</p>`);
  }

  return { html: out.join('\n'), title, ids: [...ids.keys()] };
}

// ── Configuration and placeholders ───────────────────────────────────────────

const EMAIL = /^[^\s@<>"'(),;:]+@[^\s@<>"'(),;:]+\.[^\s@<>"'(),;:]+$/;
const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

/** "2026-10-05" → "5 October 2026". Null for anything that is not a real date. */
export function formatDate(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso ?? ''));
  if (!m) return null;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const date = new Date(Date.UTC(y, mo - 1, d));
  if (date.getUTCFullYear() !== y || date.getUTCMonth() !== mo - 1 || date.getUTCDate() !== d) {
    return null;
  }
  return `${d} ${MONTHS[mo - 1]} ${y}`;
}

export function readJson(path) {
  if (!existsSync(path)) throw new BuildError(`Cannot find ${path}.`);
  try {
    return JSON.parse(readFileSync(path, 'utf8'));
  } catch (e) {
    throw new BuildError(`${path} is not valid JSON: ${e.message}`);
  }
}

/** Everything wrong with the config, as sentences. Empty when it can build. */
export function checkConfig(config, { draft = false } = {}) {
  if (!config || typeof config !== 'object' || Array.isArray(config)) {
    return ['The config must be a JSON object like {"contactEmail": "", "effectiveDate": "2026-10-05"}.'];
  }
  const errors = [];
  const email = typeof config.contactEmail === 'string' ? config.contactEmail.trim() : '';
  if (!email && !draft) {
    errors.push(
      'contactEmail is empty. The privacy policy and terms must give a working contact address ' +
        'before they are published. Set "contactEmail" in the config, or run with --draft to ' +
        'preview the pages with "Contact address coming soon" in its place.',
    );
  } else if (email && !EMAIL.test(email)) {
    errors.push(`contactEmail "${email}" does not look like an email address.`);
  }
  if (!formatDate(config.effectiveDate)) {
    errors.push('effectiveDate must be a real date written YYYY-MM-DD, for example "2026-10-05".');
  }
  return errors;
}

/** Values for the documents' own placeholders. */
export function placeholderValues(config) {
  const email = typeof config.contactEmail === 'string' ? config.contactEmail.trim() : '';
  return {
    CONTACT_EMAIL: email
      ? `<a href="mailto:${escapeHtml(email)}">${escapeHtml(email)}</a>`
      : '<strong>Contact address coming soon</strong>',
    EFFECTIVE_DATE: escapeHtml(formatDate(config.effectiveDate) ?? ''),
  };
}

const PLACEHOLDER = /\{\{([A-Z][A-Z0-9_]*)\}\}/g;

export function fillPlaceholders(text, values) {
  return String(text).replace(PLACEHOLDER, (whole, key) =>
    Object.prototype.hasOwnProperty.call(values, key) ? values[key] : whole,
  );
}

export function unfilledPlaceholders(text) {
  return [...String(text).matchAll(PLACEHOLDER)].map((m) => m[0]);
}

// ── Page chrome ──────────────────────────────────────────────────────────────

/** Relative prefix from a page `depth` folders below the site root back to it. */
export function upPath(depth) {
  return depth === 0 ? './' : '../'.repeat(depth);
}

/**
 * What every page's <head> shares: no scripts, no external anything, and a
 * policy that enforces it. Drafts are kept out of search results.
 */
export function headHtml({ css, draft }) {
  return [
    '<meta charset="utf-8">',
    '<meta name="viewport" content="width=device-width, initial-scale=1">',
    `<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; img-src data:; base-uri 'none'; form-action 'none'">`,
    '<meta name="referrer" content="no-referrer">',
    '<meta name="color-scheme" content="light dark">',
    ...(draft ? ['<meta name="robots" content="noindex, nofollow">'] : []),
    // The stylesheet's comments are for whoever edits it, not for every visitor.
    `<style>\n${css.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\n{3,}/g, '\n\n').trim()}\n</style>`,
  ].join('\n');
}

export function headerHtml(depth) {
  return `<header class="site"><div class="wrap"><a class="wordmark" href="${upPath(depth)}" aria-label="Gapped home">GAPPED</a></div></header>`;
}

/**
 * The banner every draft page carries. It names the missing address only when
 * the address is missing: --draft also previews a config that has one.
 */
export function draftBannerHtml(draft, { contactSet = false } = {}) {
  if (!draft) return '';
  const why = contactSet ? '' : ' The contact address has not been set yet.';
  return `<div class="draft" role="note">Draft preview, not for publishing.${why}</div>`;
}

export function footerHtml(depth, year) {
  const up = upPath(depth);
  return `<footer class="site"><div class="wrap">
<nav aria-label="Gapped pages">
<a href="${up}privacy/">Privacy Policy</a>
<a href="${up}terms/">Terms of Use</a>
<a href="${up}support/">Support</a>
<a href="${up}acknowledgements/">Acknowledgements</a>
</nav>
<p>Obey traffic laws and speed limits, and never touch your phone while driving.</p>
<p>&copy; ${escapeHtml(year)} Toby Mcintosh. All rights reserved.</p>
</div></footer>`;
}

/** A whole page around an already-rendered body. */
export function pageShell({ title, description, body, css, depth, draft, year, contactSet = false }) {
  return `<!doctype html>
<html lang="en-GB">
<head>
${headHtml({ css, draft })}
<title>${escapeHtml(title)} · Gapped</title>
<meta name="description" content="${escapeHtml(description)}">
</head>
<body>
${headerHtml(depth)}
${draftBannerHtml(draft, { contactSet })}
<main class="wrap">
${body}
</main>
${footerHtml(depth, year)}
</body>
</html>
`;
}

// ── The build ────────────────────────────────────────────────────────────────

const MARKDOWN_PAGES = [
  {
    src: 'docs/PRIVACY.md',
    out: 'privacy/index.html',
    description: 'What Gapped collects, why, who can see it, how long it is kept and your rights.',
  },
  {
    src: 'docs/TERMS.md',
    out: 'terms/index.html',
    description: 'The rules for using Gapped, including safety and conduct.',
  },
];

const HTML_PAGES = [
  { src: 'site/support/index.html', out: 'support/index.html' },
  { src: 'site/index.html', out: 'index.html' },
];

const depthOf = (out) => out.split('/').length - 1;

/**
 * Builds every page into `outDir` and returns the paths written. Throws
 * BuildError for anything the person running it has to fix.
 */
export function buildLegalPages({
  root = ROOT,
  configPath = join(root, 'site', 'site.config.json'),
  outDir = join(root, 'site', 'dist'),
  draft = false,
} = {}) {
  const config = readJson(configPath);
  const problems = checkConfig(config, { draft });
  if (problems.length > 0) {
    throw new BuildError(
      `build-legal-pages: ${relative(root, configPath) || configPath} cannot be used:\n` +
        problems.map((p) => `  - ${p}`).join('\n'),
    );
  }

  const cssPath = join(root, 'site', 'style.css');
  if (!existsSync(cssPath)) throw new BuildError(`Cannot find ${cssPath}.`);
  const css = readFileSync(cssPath, 'utf8');
  const year = String(config.effectiveDate).slice(0, 4);
  const values = placeholderValues(config);
  const contactSet = typeof config.contactEmail === 'string' && config.contactEmail.trim() !== '';
  const written = [];

  const write = (out, html, src) => {
    const left = unfilledPlaceholders(html);
    if (left.length > 0) {
      throw new BuildError(
        `build-legal-pages: ${src} has placeholders nothing fills: ${[...new Set(left)].join(', ')}`,
      );
    }
    const path = join(outDir, out);
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, html);
    written.push(path);
  };

  for (const page of MARKDOWN_PAGES) {
    const srcPath = join(root, page.src);
    if (!existsSync(srcPath)) throw new BuildError(`Cannot find ${srcPath}.`);
    const { html, title } = markdownToHtml(readFileSync(srcPath, 'utf8'));
    if (!title) throw new BuildError(`${page.src} needs a level-one heading for its title.`);
    const depth = depthOf(page.out);
    const doc = pageShell({
      title,
      description: page.description,
      body: html,
      css,
      depth,
      draft,
      year,
      contactSet,
    });
    write(page.out, fillPlaceholders(doc, values), page.src);
  }

  for (const page of HTML_PAGES) {
    const srcPath = join(root, page.src);
    if (!existsSync(srcPath)) throw new BuildError(`Cannot find ${srcPath}.`);
    const depth = depthOf(page.out);
    const chrome = {
      HEAD: headHtml({ css, draft }),
      HEADER: headerHtml(depth),
      DRAFT_BANNER: draftBannerHtml(draft, { contactSet }),
      FOOTER: footerHtml(depth, year),
    };
    // Chrome first: the footer itself carries no placeholders, the page does.
    const html = fillPlaceholders(fillPlaceholders(readFileSync(srcPath, 'utf8'), chrome), values);
    write(page.out, html, page.src);
  }

  // GitHub Pages runs Jekyll unless told not to; plain files need no processing.
  const nojekyll = join(root, 'site', '.nojekyll');
  mkdirSync(outDir, { recursive: true });
  if (existsSync(nojekyll)) copyFileSync(nojekyll, join(outDir, '.nojekyll'));
  else writeFileSync(join(outDir, '.nojekyll'), '');
  written.push(join(outDir, '.nojekyll'));

  return written;
}

// ── CLI ──────────────────────────────────────────────────────────────────────

function main() {
  const { values: args } = parseArgs({
    options: {
      draft: { type: 'boolean', default: false },
      config: { type: 'string' },
      out: { type: 'string' },
    },
  });
  const written = buildLegalPages({
    draft: args.draft,
    ...(args.config ? { configPath: resolve(args.config) } : {}),
    ...(args.out ? { outDir: resolve(args.out) } : {}),
  });
  for (const path of written) console.log(`wrote ${relative(process.cwd(), path)}`);
  if (args.draft) {
    console.log('\nDRAFT build: every page carries a draft banner and is marked noindex; with no');
    console.log('contactEmail they say "Contact address coming soon". Do not publish it. Set');
    console.log('contactEmail in site/site.config.json and build without --draft.');
  }
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
