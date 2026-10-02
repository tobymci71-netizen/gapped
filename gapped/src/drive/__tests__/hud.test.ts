import { HUD_MIN_SIZE, HUD_SIZE, hudDialSize, hudRowHeight } from '../hud';

/**
 * Real portrait iPhones: window height, top inset, and the tab scene (window
 * minus the 49pt tab bar and the bottom inset). The panel and HUD top follow
 * app/(tabs)/drive.tsx: panel = max(300, round(0.46 × window)), HUD top =
 * inset + 12 + 44 + 12.
 */
function device(window: number, insetTop: number, insetBottom: number, fontScale = 1) {
  const sceneHeight = window - 49 - insetBottom;
  const panelHeight = Math.max(300, Math.round(window * 0.46));
  const hudTop = insetTop + 12 + 44 + 12;
  const size = hudDialSize({ sceneHeight, panelHeight, hudTop, fontScale });
  return {
    size,
    /** Bottom of the distance · elapsed line. */
    rowBottom: hudTop + size + hudRowHeight(fontScale),
    panelTop: sceneHeight - panelHeight,
  };
}

describe('hudDialSize', () => {
  test('iPhone SE: the live line clears the panel (it was cut in half at 200pt)', () => {
    const se = device(667, 20, 0);
    expect(se.size).toBeLessThan(HUD_SIZE);
    expect(se.size).toBeGreaterThanOrEqual(HUD_MIN_SIZE);
    expect(se.rowBottom).toBeLessThanOrEqual(se.panelTop);
  });

  test('13 mini at large text: the dial gives up the room the line needs', () => {
    const mini = device(812, 50, 34, 1.3);
    expect(mini.rowBottom).toBeLessThanOrEqual(mini.panelTop);
  });

  test('text beyond the cap is not budgeted for: the line is capped at the same size', () => {
    expect(hudRowHeight(3.5)).toBe(hudRowHeight(1.3));
    expect(device(812, 50, 34, 3.5).size).toBe(device(812, 50, 34, 1.3).size);
  });

  test('a phone with room keeps the full-size dial', () => {
    expect(device(852, 59, 34).size).toBe(HUD_SIZE); // iPhone 15
    expect(device(956, 62, 34).size).toBe(HUD_SIZE); // 16 Pro Max
  });

  test('before the scene is measured it renders at full size', () => {
    expect(hudDialSize({ sceneHeight: 0, panelHeight: 307, hudTop: 88, fontScale: 1 })).toBe(
      HUD_SIZE,
    );
  });

  test('never shrinks below the minimum, however short the scene', () => {
    expect(hudDialSize({ sceneHeight: 500, panelHeight: 300, hudTop: 88, fontScale: 1 })).toBe(
      HUD_MIN_SIZE,
    );
  });
});
