/**
 * The launch sting on disk matches the sound contract (docs/ONBOARDING.md,
 * "Sound", from a measurement of the reference): about 1.6 s of 44.1 kHz mono
 * 16-bit PCM, a quiet attack, its peak near 0.65 s at about -6 dBFS, and
 * silence by 1.5 s.
 *
 * The file is generated (scripts/generate-sting.py). This is what notices a
 * regenerated or hand-replaced file that no longer fits the splash: a sting
 * whose peak lands late plays over the move into the header instead of under
 * the hold.
 */

import { readFileSync } from 'fs';
import { join } from 'path';

const WAV = join(__dirname, '../../../../assets/sounds/launch-sting.wav');

type Pcm = { rate: number; channels: number; bits: number; samples: Float64Array };

/** A minimal RIFF/WAVE reader: enough for one PCM file this repo writes. */
function readWav(path: string): Pcm {
  const buf = readFileSync(path);
  expect(buf.toString('ascii', 0, 4)).toBe('RIFF');
  expect(buf.toString('ascii', 8, 12)).toBe('WAVE');
  let offset = 12;
  let fmt: { format: number; channels: number; rate: number; bits: number } | null = null;
  while (offset + 8 <= buf.length) {
    const id = buf.toString('ascii', offset, offset + 4);
    const size = buf.readUInt32LE(offset + 4);
    const body = offset + 8;
    if (id === 'fmt ') {
      fmt = {
        format: buf.readUInt16LE(body),
        channels: buf.readUInt16LE(body + 2),
        rate: buf.readUInt32LE(body + 4),
        bits: buf.readUInt16LE(body + 14),
      };
    } else if (id === 'data' && fmt) {
      expect(fmt.format).toBe(1); // integer PCM
      const n = size / 2;
      const samples = new Float64Array(n);
      for (let i = 0; i < n; i++) samples[i] = buf.readInt16LE(body + i * 2) / 32768;
      return { rate: fmt.rate, channels: fmt.channels, bits: fmt.bits, samples };
    }
    offset = body + size + (size % 2);
  }
  throw new Error('no data chunk');
}

const dbfs = (x: number) => 20 * Math.log10(Math.max(Math.abs(x), 1e-12));

describe('assets/sounds/launch-sting.wav', () => {
  const pcm = readWav(WAV);
  const seconds = (i: number) => i / pcm.rate;
  const at = (s: number) => Math.round(s * pcm.rate);
  const window = (from: number, to: number) => pcm.samples.subarray(at(from), at(to));
  const peakOf = (xs: Float64Array) => xs.reduce((m, x) => Math.max(m, Math.abs(x)), 0);

  test('44.1 kHz, mono, 16-bit, about 1.6 s', () => {
    expect(pcm.rate).toBe(44_100);
    expect(pcm.channels).toBe(1);
    expect(pcm.bits).toBe(16);
    expect(seconds(pcm.samples.length)).toBeCloseTo(1.6, 2);
  });

  test('peaks at about -6 dBFS, near 0.65 s', () => {
    let peakAt = 0;
    for (let i = 1; i < pcm.samples.length; i++) {
      if (Math.abs(pcm.samples[i]) > Math.abs(pcm.samples[peakAt])) peakAt = i;
    }
    expect(dbfs(pcm.samples[peakAt])).toBeGreaterThan(-6.5);
    expect(dbfs(pcm.samples[peakAt])).toBeLessThan(-5.5);
    expect(seconds(peakAt)).toBeGreaterThan(0.55);
    expect(seconds(peakAt)).toBeLessThan(0.75);
  });

  test('a quiet attack: the first 150 ms stay far below the peak', () => {
    expect(dbfs(peakOf(window(0, 0.15)))).toBeLessThan(-35);
  });

  test('it rises into the peak rather than starting on it', () => {
    const early = peakOf(window(0.15, 0.3));
    const late = peakOf(window(0.45, 0.6));
    expect(late).toBeGreaterThan(early * 3);
  });

  test('silent by 1.5 s, and the tail is exactly zero', () => {
    expect(peakOf(window(1.5, 1.6))).toBe(0);
    expect(dbfs(peakOf(window(1.4, 1.5)))).toBeLessThan(-40);
  });

  test('never clips', () => {
    expect(peakOf(pcm.samples)).toBeLessThan(1);
  });
});
