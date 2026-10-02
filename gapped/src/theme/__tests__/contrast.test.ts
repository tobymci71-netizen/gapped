/**
 * The colour tokens are a spec contract, so legibility is enforced by choosing
 * which token sits on which background, not by nudging values. These are the
 * pairings the components rely on, each held to WCAG AA for normal-size text
 * (4.5:1).
 *
 * text3 is deliberately absent from the surface rows: it measures 4.30:1 on
 * surface1 and 3.98:1 on surface2, which is why muted copy on a Card or sheet
 * (Text's `legal` under OnSurface, SettingsRow values, the inactive tab tint)
 * uses text2 there. It stays legal on the canvas, and as a decorative glyph
 * colour, which only needs 3:1.
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

describe('contrast helper', () => {
  it('matches the WCAG reference points', () => {
    expect(contrast('#FFFFFF', '#000000')).toBeCloseTo(21, 5);
    expect(contrast('#777777', '#FFFFFF')).toBeCloseTo(4.48, 2);
    // The finding this suite guards: text3 on surface1.
    expect(contrast(color.text3, color.surface1)).toBeCloseTo(4.3, 2);
  });
});

describe('text tokens against the backgrounds they are used on', () => {
  const surfaces = {
    canvas: color.canvas,
    surface1: color.surface1,
    surface2: color.surface2,
    surface3: color.surface3,
  };

  it.each(Object.entries(surfaces))('text1 and text2 clear AA on %s', (_, bg) => {
    expect(contrast(color.text1, bg)).toBeGreaterThanOrEqual(AA);
    expect(contrast(color.text2, bg)).toBeGreaterThanOrEqual(AA);
  });

  it('text3 clears AA on the canvas, where muted copy keeps it', () => {
    expect(contrast(color.text3, color.canvas)).toBeGreaterThanOrEqual(AA);
  });

  it('text3 clears the 3:1 graphic minimum on surface1 and surface2, for glyphs', () => {
    expect(contrast(color.text3, color.surface1)).toBeGreaterThanOrEqual(AA_GRAPHIC);
    expect(contrast(color.text3, color.surface2)).toBeGreaterThanOrEqual(AA_GRAPHIC);
  });

  it('the label on an accent fill clears AA', () => {
    expect(contrast(color.onAccent, color.accent)).toBeGreaterThanOrEqual(AA);
  });
});
