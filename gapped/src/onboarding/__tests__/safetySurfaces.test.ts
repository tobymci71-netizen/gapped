/**
 * The safety lines onboarding agrees to, where they are seen again after it:
 * the Drive tab beside Start drive, and every share card. The developer
 * readout kept out of release builds, and the live dial that rewards nothing.
 *
 * Read from source, as flow.test.ts reads the steps: both screens pull in
 * maps, Skia and the recorder, which jest has no native side for, and what
 * matters here is what renders under which condition, not how it looks.
 */

import fs from 'node:fs';
import path from 'node:path';

const root = path.join(__dirname, '../../..');
const read = (file: string) => fs.readFileSync(path.join(root, file), 'utf8');

describe('Drive tab', () => {
  const src = read('app/(tabs)/drive.tsx');

  test('the line beside Start drive', () => {
    expect(src).toContain(
      "const SET_OFF_LINE = 'Set up before you set off. Never handle your phone while driving.';",
    );
    // Rendered in the same branch as Start drive, after it.
    const start = src.indexOf('label="Start drive"');
    expect(start).toBeGreaterThan(-1);
    expect(src.indexOf('{SET_OFF_LINE}', start)).toBeGreaterThan(start);
  });

  test('the Always note: worded as asked, and never while a drive records', () => {
    expect(src).toContain(
      "const ALWAYS_NOTE = 'Set Location to Always so drives keep recording with the screen off.';",
    );
    // One mount, in a later branch of the `recording ?` ternary than End drive.
    const mounts = src.match(/<AlwaysNote\b/g) ?? [];
    expect(mounts).toHaveLength(1);
    expect(src.indexOf('<AlwaysNote')).toBeGreaterThan(src.indexOf('label="End drive"'));
    expect(src).toMatch(/backgroundPermission !== 'granted' \? \(\s*<AlwaysNote/);
  });

  test('the IMU debug strip renders only in development builds', () => {
    expect(src).toMatch(/\{INTERNAL_TOOLS && debugHud \? <DebugStrip/);
    // No other mount that skips the flag.
    expect(src.match(/<DebugStrip\b/g)).toHaveLength(1);
  });

  test('the live dial rewards nothing: no PB badge, no speed glow (NO_IN_DRIVE_SPEED_NUDGES)', () => {
    // The one dial on the tab is the recording HUD's.
    const mounts = src.match(/<Speedometer\b[\s\S]*?\/>/g) ?? [];
    expect(mounts).toHaveLength(1);
    expect(mounts[0]).not.toMatch(/\bpb=/);
    expect(mounts[0]).toMatch(/\bspeedGlow=\{false\}/);
  });
});

describe('share card', () => {
  const src = read('src/components/ShareCard.tsx');

  test('carries "Drive within the law"', () => {
    expect(src).toContain("export const SHARE_CARD_SAFETY_LINE = 'Drive within the law';");
  });

  test('on every card: rendered once, under no condition', () => {
    const lines = src.split('\n').filter((l) => l.includes('{SHARE_CARD_SAFETY_LINE}'));
    expect(lines).toHaveLength(1);
    // Its own element, starting the line: not the arm of a ternary or an &&.
    expect(lines[0]).toMatch(/^\s*<CardText style=\{styles\.footerNote\}>\{SHARE_CARD_SAFETY_LINE\}<\/CardText>$/);
  });
});
