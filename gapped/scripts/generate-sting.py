#!/usr/bin/env python3
"""
Generates assets/sounds/launch-sting.wav, the one sound in Gapped.

    python3 scripts/generate-sting.py

WHAT IT IS
The onboarding splash plays a single soft launch sting as the GAPPED wordmark
lands (docs/ONBOARDING.md, "Sound"). Nothing else in the app makes a sound.
The shape is copied from a measurement of the reference recording, not from
taste: about 1.6 s long, a quiet attack that rises for about half a second, a
peak near 0.65 s and silence by about 1.5 s. Its character is a whoosh into a
soft impact. It is not a chime, a voice or a loop.

HOW IT IS MADE
  1. Whoosh: white noise through a resonant band-pass whose centre sweeps up
     from 260 Hz to 2.3 kHz while the level rises, then sinks back as it
     decays. The rising pitch of the noise is what reads as motion.
  2. Impact at 0.65 s: a sine "thump" that drops from 150 Hz to 62 Hz, with
     a little soft saturation. A phone speaker cannot reproduce the
     fundamental of a real kick, so the thump is pitched where an iPhone
     speaker still has output and the saturation adds harmonics above it.
     Under the thump sits a short band-passed knock that gives the hit an
     edge, plus a quiet burst of air.
  3. A small Schroeder reverb, so the tail decays rather than stopping dead.
  4. A raised-cosine fade from 1.32 s, digital silence from 1.5 s, then the
     whole thing normalised to a -6 dBFS peak and dithered (TPDF) to 16-bit.

44.1 kHz, mono, 16-bit PCM. Only the standard library is used (wave, math,
random), because no audio libraries are installed on this machine. The noise
generator is seeded, so running the script again writes the same bytes
(checked with `shasum`); a change to the file in review is a change to the
sound.
"""

# Lets the `list[float]` hints below parse on Python 3.7 and 3.8 too, so the
# script runs on whatever python3 a machine happens to have.
from __future__ import annotations

import math
import random
import wave
from pathlib import Path

RATE = 44_100
DURATION_S = 1.6
PEAK_DBFS = -6.0
SEED = 0x6A99ED  # any fixed value; fixed is what keeps the output reproducible

# Timeline, in seconds from the start of the file.
WHOOSH_PEAK_S = 0.62   # the whoosh crests just before the hit
IMPACT_S = 0.65        # loudest point of the file
FADE_FROM_S = 1.32     # final fade starts
SILENT_BY_S = 1.5      # digital silence from here to the end

OUT = Path(__file__).resolve().parent.parent / "assets" / "sounds" / "launch-sting.wav"

N = int(RATE * DURATION_S)
rng = random.Random(SEED)


def smoothstep(x: float) -> float:
    x = min(1.0, max(0.0, x))
    return x * x * (3 - 2 * x)


class BandPass:
    """Chamberlin state-variable filter. The cutoff can move every sample."""

    def __init__(self, q: float):
        self.damp = 1.0 / q
        self.low = 0.0
        self.band = 0.0

    def __call__(self, x: float, fc: float) -> float:
        # Clamped well under the filter's stability limit (fc < RATE / 6).
        f = 2.0 * math.sin(math.pi * min(fc, RATE / 7) / RATE)
        self.low += f * self.band
        high = x - self.low - self.damp * self.band
        self.band += f * high
        return self.band


def whoosh_cutoff(t: float) -> float:
    """Centre frequency of the whoosh: an exponential rise, then a slow fall."""
    if t <= WHOOSH_PEAK_S:
        return 260.0 * (2300.0 / 260.0) ** smoothstep(t / WHOOSH_PEAK_S)
    return 2300.0 * (700.0 / 2300.0) ** smoothstep((t - WHOOSH_PEAK_S) / (SILENT_BY_S - WHOOSH_PEAK_S))


def whoosh_level(t: float) -> float:
    """Quiet attack: a steep power curve keeps the first 150 ms nearly silent."""
    if t <= WHOOSH_PEAK_S:
        return (t / WHOOSH_PEAK_S) ** 2.6
    return math.exp(-(t - WHOOSH_PEAK_S) / 0.17)


def synth_dry() -> list[float]:
    out = [0.0] * N
    bp_a = BandPass(q=2.2)
    bp_b = BandPass(q=2.2)  # two in series: a rounder, less hissy band
    knock = BandPass(q=3.0)
    air = BandPass(q=1.4)
    thump_phase = 0.0

    for i in range(N):
        t = i / RATE

        # 1. Whoosh.
        noise = rng.uniform(-1.0, 1.0)
        fc = whoosh_cutoff(t)
        w = bp_b(bp_a(noise, fc), fc * 1.08) * whoosh_level(t) * 0.55

        # 2. Impact.
        dt = t - IMPACT_S
        hit = 0.0
        if dt >= 0:
            attack = smoothstep(dt / 0.006)  # 6 ms: soft, never a click
            freq = 62.0 + (150.0 - 62.0) * math.exp(-dt / 0.05)
            thump_phase += 2 * math.pi * freq / RATE
            body = math.sin(thump_phase) + 0.3 * math.sin(2 * thump_phase)
            thump = math.tanh(1.6 * body) / math.tanh(1.6) * math.exp(-dt / 0.2)
            k = knock(rng.uniform(-1.0, 1.0), 190.0) * math.exp(-dt / 0.07) * 0.9
            a = air(rng.uniform(-1.0, 1.0), 4200.0) * math.exp(-dt / 0.11) * 0.12
            hit = attack * (0.85 * thump + k + a)

        out[i] = w + hit
    return out


def reverb(dry: list[float], wet: float = 0.18) -> list[float]:
    """Schroeder: four parallel combs into two series allpasses."""
    combs = [(int(RATE * ms / 1000), 0.74) for ms in (29.7, 37.1, 41.1, 43.7)]
    comb_bufs = [[0.0] * d for d, _ in combs]
    comb_idx = [0] * len(combs)
    allpasses = [(int(RATE * ms / 1000), 0.7) for ms in (5.0, 1.7)]
    ap_bufs = [[0.0] * d for d, _ in allpasses]
    ap_idx = [0] * len(allpasses)

    out = [0.0] * len(dry)
    for i, x in enumerate(dry):
        s = 0.0
        for c, (d, g) in enumerate(combs):
            buf = comb_bufs[c]
            y = buf[comb_idx[c]]
            buf[comb_idx[c]] = x + y * g
            comb_idx[c] = (comb_idx[c] + 1) % d
            s += y
        s *= 0.25
        for a, (d, g) in enumerate(allpasses):
            buf = ap_bufs[a]
            delayed = buf[ap_idx[a]]
            v = s + g * delayed
            buf[ap_idx[a]] = v
            s = delayed - g * v
            ap_idx[a] = (ap_idx[a] + 1) % d
        out[i] = x + wet * s
    return out


def finish(x: list[float]) -> list[float]:
    fade_len = SILENT_BY_S - FADE_FROM_S
    for i in range(len(x)):
        t = i / RATE
        if t >= SILENT_BY_S:
            x[i] = 0.0
        elif t > FADE_FROM_S:
            x[i] *= 0.5 * (1 + math.cos(math.pi * (t - FADE_FROM_S) / fade_len))
    # A 2 ms ramp at the very top, so the file can never start on a click.
    for i in range(int(RATE * 0.002)):
        x[i] *= i / (RATE * 0.002)
    peak = max(abs(v) for v in x)
    gain = 10 ** (PEAK_DBFS / 20) / peak
    return [v * gain for v in x]


def to_pcm16(x: list[float]) -> bytes:
    frames = bytearray()
    lsb = 1.0 / 32768
    for i, v in enumerate(x):
        # TPDF dither, except in the silent tail, which stays exactly zero.
        if i / RATE < SILENT_BY_S:
            v += (rng.random() - rng.random()) * lsb
        s = max(-32768, min(32767, int(round(v * 32767))))
        frames += s.to_bytes(2, "little", signed=True)
    return bytes(frames)


def describe(x: list[float]) -> None:
    peak_i = max(range(len(x)), key=lambda i: abs(x[i]))
    peak_db = 20 * math.log10(abs(x[peak_i]))
    print(f"wrote {OUT.relative_to(OUT.parent.parent.parent)}")
    print(f"  {len(x) / RATE:.2f} s, {RATE} Hz, mono, 16-bit")
    print(f"  peak {peak_db:.1f} dBFS at {peak_i / RATE:.3f} s")
    win = int(RATE * 0.1)
    for start in range(0, len(x), win):
        chunk = x[start : start + win]
        rms = math.sqrt(sum(v * v for v in chunk) / len(chunk))
        db = 20 * math.log10(rms) if rms > 0 else float("-inf")
        bar = "#" * max(0, int((db + 60) / 2)) if db > -60 else ""
        print(f"  {start / RATE:4.1f}s {db:6.1f} dB {bar}")


def main() -> None:
    samples = finish(reverb(synth_dry()))
    OUT.parent.mkdir(parents=True, exist_ok=True)
    with wave.open(str(OUT), "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(RATE)
        w.writeframes(to_pcm16(samples))
    describe(samples)


if __name__ == "__main__":
    main()
