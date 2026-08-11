#!/usr/bin/env python3
"""
Generates assets/icon.png — a deliberately unmistakable PLACEHOLDER app icon.

    npm run generate:icon

WHY THIS EXISTS
The repo previously shipped the stock Expo template icon (a blue "A" with
construction guides). That is worse than a blank square: it has valid
dimensions, so nothing fails, and it carries someone else's branding into
TestFlight where it reads as a broken build rather than an unfinished one.

This draws hazard stripes and the word PLACEHOLDER so that nobody — reviewer,
tester or future maintainer — can mistake it for a design decision. Replace
assets/icon.png with the real artwork and delete this script.

App Store icon rules this satisfies: exactly 1024x1024, no alpha channel, no
rounded corners (iOS applies the mask itself), no transparency, solid opaque
background.

No image libraries are installed on this machine (no PIL, no ImageMagick), so
the PNG is assembled by hand from zlib-compressed scanlines. That is also why
the type is a hand-coded 5x7 bitmap font rather than a real typeface.
"""

import struct
import zlib
from pathlib import Path

SIZE = 1024
CANVAS = (0x0A, 0x0A, 0x0A)   # color.canvas
ACCENT = (0xCC, 0xFF, 0x00)   # color.accent
WHITE = (0xFF, 0xFF, 0xFF)

# 5x7 bitmap font, only the glyphs "GAPPED" and "PLACEHOLDER" need.
GLYPHS = {
    "A": ["01110", "10001", "10001", "11111", "10001", "10001", "10001"],
    "C": ["01110", "10001", "10000", "10000", "10000", "10001", "01110"],
    "D": ["11110", "10001", "10001", "10001", "10001", "10001", "11110"],
    "E": ["11111", "10000", "10000", "11110", "10000", "10000", "11111"],
    "G": ["01110", "10001", "10000", "10111", "10001", "10001", "01111"],
    "H": ["10001", "10001", "10001", "11111", "10001", "10001", "10001"],
    "L": ["10000", "10000", "10000", "10000", "10000", "10000", "11111"],
    "O": ["01110", "10001", "10001", "10001", "10001", "10001", "01110"],
    "P": ["11110", "10001", "10001", "11110", "10000", "10000", "10000"],
    "R": ["11110", "10001", "10001", "11110", "10100", "10010", "10001"],
    " ": ["00000"] * 7,
}

# Framebuffer: row-major list of [r,g,b] bytes.
px = [[CANVAS[0], CANVAS[1], CANVAS[2]] * SIZE for _ in range(SIZE)]


def put(x: int, y: int, rgb) -> None:
    if 0 <= x < SIZE and 0 <= y < SIZE:
        px[y][x * 3 : x * 3 + 3] = list(rgb)


def rect(x0: int, y0: int, w: int, h: int, rgb) -> None:
    for y in range(y0, y0 + h):
        for x in range(x0, x0 + w):
            put(x, y, rgb)


def text(s: str, x0: int, y0: int, scale: int, rgb) -> int:
    """Draws `s` and returns the width consumed."""
    cx = x0
    for ch in s.upper():
        rows = GLYPHS.get(ch, GLYPHS[" "])
        for ry, row in enumerate(rows):
            for rx, bit in enumerate(row):
                if bit == "1":
                    rect(cx + rx * scale, y0 + ry * scale, scale, scale, rgb)
        cx += (len(rows[0]) + 1) * scale
    return cx - x0


def centred(s: str, y: int, scale: int, rgb) -> None:
    width = len(s) * 6 * scale - scale
    text(s, (SIZE - width) // 2, y, scale, rgb)


# ── hazard stripes across the top and bottom ────────────────────────────────
# Diagonal accent bars read as "work in progress" at any size, including the
# 40pt Settings icon where text is illegible.
BAND = 150
for y in list(range(0, BAND)) + list(range(SIZE - BAND, SIZE)):
    for x in range(SIZE):
        if ((x + y) // 60) % 2 == 0:
            put(x, y, ACCENT)

# ── wordmark ────────────────────────────────────────────────────────────────
centred("GAPPED", 380, 26, ACCENT)
centred("PLACEHOLDER", 560, 12, WHITE)

# ── encode ──────────────────────────────────────────────────────────────────
raw = b"".join(b"\x00" + bytes(row) for row in px)


def chunk(tag: bytes, data: bytes) -> bytes:
    body = tag + data
    return struct.pack(">I", len(data)) + body + struct.pack(">I", zlib.crc32(body))


png = (
    b"\x89PNG\r\n\x1a\n"
    # bit depth 8, colour type 2 (truecolour, NO alpha) — App Store requires it
    + chunk(b"IHDR", struct.pack(">IIBBBBB", SIZE, SIZE, 8, 2, 0, 0, 0))
    + chunk(b"IDAT", zlib.compress(raw, 9))
    + chunk(b"IEND", b"")
)

out = Path(__file__).resolve().parent.parent / "assets" / "icon.png"
out.write_bytes(png)
print(f"Wrote {out} ({SIZE}x{SIZE}, no alpha, {len(png) // 1024} KB)")
print("PLACEHOLDER — replace before any public release.")
