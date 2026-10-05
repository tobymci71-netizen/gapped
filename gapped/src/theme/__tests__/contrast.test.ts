/**
 * The colour tokens are a spec contract, so legibility is enforced by choosing
 * which token sits on which background, not by nudging values. These are the
 * pairings the components rely on, each held to WCAG AA for normal-size text
 * (4.5:1), or to the 3:1 non-text minimum where the token only ever draws a
 * mark.
 *
 * Nightrun's one trap is the brand red. Racing red (`accent`) is a light, and
 * it is too dark to be ink: 4.57:1 on the canvas, under 4.5 on every raised
 * surface, and white text on it measures 4.11:1. So red text uses accentHot,
 * and white labels sit on the deeper accentFill. The cases below pin all
 * three facts, so the shortcut ("just use accent") fails a test rather than a
 * reader.
 */

import { color } from '@/theme/tokens';

/** WCAG 2.x relative luminance of a #RRGGBB colour. */
function luminance(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

const AA = 4.5;
const AA_GRAPHIC = 3;

const surfaces = {
  canvas: color.canvas,
  surface1: color.surface1,
  surface2: color.surface2,
  surface3: color.surface3,
};

describe('contrast helper', () => {
  it('matches the WCAG reference points', () => {
    expect(contrast('#FFFFFF', '#000000')).toBeCloseTo(21, 5);
    expect(contrast('#777777', '#FFFFFF')).toBeCloseTo(4.48, 2);
  });
});

describe('the palette is Nightrun, and the acid lime is gone', () => {
  it('has no #CCFF00 anywhere', () => {
    expect(Object.values(color).map((c) => c.toUpperCase())).not.toContain('#CCFF00');
  });

  it('every token is an opaque #RRGGBB, so this suite can measure it', () => {
    for (const value of Object.values(color)) expect(value).toMatch(/^#[0-9A-F]{6}$/i);
  });
});

describe('text tokens against the backgrounds they are used on', () => {
  it.each(Object.entries(surfaces))('text1, text2 and text3 clear AA on %s', (_, bg) => {
    expect(contrast(color.text1, bg)).toBeGreaterThanOrEqual(AA);
    expect(contrast(color.text2, bg)).toBeGreaterThanOrEqual(AA);
    expect(contrast(color.text3, bg)).toBeGreaterThanOrEqual(AA);
  });

  it.each(Object.entries(surfaces))('red text (accentHot) clears AA on %s', (_, bg) => {
    expect(contrast(color.accentHot, bg)).toBeGreaterThanOrEqual(AA);
  });

  it.each(Object.entries(surfaces))(
    'danger, warning, success and the rank colours clear AA on %s',
    (_, bg) => {
      for (const c of [color.danger, color.warning, color.success, color.rank1, color.rank2, color.rank3]) {
        expect(contrast(c, bg)).toBeGreaterThanOrEqual(AA);
      }
    },
  );

  it('verified and unverified copy clear AA on every surface', () => {
    for (const bg of Object.values(surfaces)) {
      expect(contrast(color.verified, bg)).toBeGreaterThanOrEqual(AA);
      expect(contrast(color.unverified, bg)).toBeGreaterThanOrEqual(AA);
    }
  });

  it('accentDim is legible as text on the canvas, surface1 and surface2', () => {
    for (const bg of [color.canvas, color.surface1, color.surface2]) {
      expect(contrast(color.accentDim, bg)).toBeGreaterThanOrEqual(AA);
    }
  });

  it('muted copy stays legible on a disabled fill', () => {
    expect(contrast(color.text3, color.disabled)).toBeGreaterThanOrEqual(AA);
  });
});

describe('labels on fills', () => {
  it('the white label on the primary button fill clears AA, pressed or not', () => {
    expect(contrast(color.onAccent, color.accentFill)).toBeGreaterThanOrEqual(AA);
    expect(contrast(color.onAccent, color.accentFillPress)).toBeGreaterThanOrEqual(AA);
  });

  it('the label on a light (white) button clears AA', () => {
    expect(contrast(color.onLight, color.text1)).toBeGreaterThanOrEqual(AA);
  });

  it('white text on the racing-red light itself does NOT — which is why accentFill exists', () => {
    expect(contrast(color.onAccent, color.accent)).toBeLessThan(AA);
  });

  it('racing red is too dark to be ink on a raised surface — which is why accentHot exists', () => {
    expect(contrast(color.accent, color.surface1)).toBeLessThan(AA);
  });
});

describe('lights and marks (non-text, 3:1)', () => {
  it.each(Object.entries(surfaces))('the racing-red light reads as a mark on %s', (_, bg) => {
    expect(contrast(color.accent, bg)).toBeGreaterThanOrEqual(AA_GRAPHIC);
  });

  it('a red glyph on the onboarding tile still reads', () => {
    expect(contrast(color.accent, color.accentTile)).toBeGreaterThanOrEqual(AA_GRAPHIC);
  });

  it('danger stays a distinct colour from the brand red', () => {
    // Not a WCAG rule: destructive must not read as the primary action. Hue
    // alone is a weak cue, so danger is also clearly lighter than racing red
    // (1.6:1 between them) — and Button draws it as an outline, never a fill.
    expect(contrast(color.danger, color.accent)).toBeGreaterThan(1.5);
  });
});
