#!/usr/bin/env python3
"""
Builds the static font files in assets/fonts/ from Google Fonts' variable
sources. Run it again only to change an instance (a weight, a width) or to
take a newer upstream release; the outputs are committed.

    python3 -m venv .venv-fonts && .venv-fonts/bin/pip install fonttools
    .venv-fonts/bin/python scripts/build-fonts.py --download
    .venv-fonts/bin/python scripts/build-fonts.py --src <dir with the variable TTFs>

Why static files at all
-----------------------
React Native cannot set a variable font's axes: `fontWeight` picks a face by
name, and there is no `font-stretch`. The Nightrun type (docs/DESIGN.md) needs
Archivo at width 125 (the wide display face) and Martian Mono at width 87.5,
neither of which exists as a static file upstream, so each face we use is cut
from the variable font here with fontTools' instancer.

Names
-----
iOS registers a font by its PostScript name, and expo-font loads each file
under the key app/_layout.tsx gives it, which is that same name. So every
output's PostScript name (name ID 6) equals its file name, and the family and
style names (IDs 1, 2, 4, 16, 17) are rewritten to match. A static instance
that kept the variable font's names would register as "Archivo-SemiBoldItalic"
three times over and two of the three faces would be unreachable.

Sources
-------
The variable fonts and their licences come from github.com/google/fonts at a
pinned commit, checked against the SHA-256 recorded below, so a rebuild is the
same bytes in and the same instances out. Both families are under the SIL Open
Font License 1.1; the licence texts are copied next to the fonts
(assets/fonts/OFL-Archivo.txt, assets/fonts/OFL-MartianMono.txt). The OFL
permits bundling and modifying the fonts; it asks that a modified version not
use the Reserved Font Names, and neither family declares any (see the licence
texts' first lines). Renaming is therefore free; it is done only so iOS can
tell the faces apart.

Normal-width Archivo for body copy is not built here: it ships in the
@expo-google-fonts/archivo package.
"""

from __future__ import annotations

import argparse
import hashlib
import shutil
import sys
import urllib.request
from dataclasses import dataclass
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "assets" / "fonts"
CACHE = ROOT / "build" / "fonts-src"  # /build/* is gitignored

ARCHIVO_COMMIT = "95f4904fc8bcf26d3420fe315560c96417c6dec7"
MARTIAN_COMMIT = "c8bba5c4a69195e4fabc69d75136814c65fe0cf5"
RAW = "https://raw.githubusercontent.com/google/fonts"

# file name -> (url, sha256)
SOURCES: dict[str, tuple[str, str]] = {
    "Archivo-Italic[wdth,wght].ttf": (
        f"{RAW}/{ARCHIVO_COMMIT}/ofl/archivo/Archivo-Italic%5Bwdth,wght%5D.ttf",
        "305d13b4eb80e62f7d517f78d7c045250d977552a420f2dbed906f314e761305",
    ),
    "MartianMono[wdth,wght].ttf": (
        f"{RAW}/{MARTIAN_COMMIT}/ofl/martianmono/MartianMono%5Bwdth,wght%5D.ttf",
        "c3467843ec1c2574b05fbcfd7147c7bfbcf63ddca8fc2bcb9d117f1bfb1b22e7",
    ),
    "OFL-Archivo.txt": (
        f"{RAW}/{ARCHIVO_COMMIT}/ofl/archivo/OFL.txt",
        "108b4e57c9c796d3d38d0428ca7ee39de47ad93187302718d9b2d8864b9b716b",
    ),
    "OFL-MartianMono.txt": (
        f"{RAW}/{MARTIAN_COMMIT}/ofl/martianmono/OFL.txt",
        "ddafd2c3f37ef1d83ef284ca63e159befd3820850c5e9eded14ca52eee92c256",
    ),
}

#: Martian Mono's width. 87.5 is the mockups' `font-stretch: 87.5%`
#: (upstream's "SemiCondensed"): 650 units a character against 700 at 100, so
#: a date line such as "Mon 5 Oct · 13:00 · 25 min" is 8% shorter, and it
#: still reads cleanly at 10pt.
MONO_WIDTH = 87.5


@dataclass(frozen=True)
class Instance:
    source: str
    postscript: str  # also the file name, without .ttf
    family: str  # typographic family (name ID 16)
    style: str  # typographic subfamily (name ID 17)
    wdth: float
    wght: int
    italic: bool


INSTANCES = [
    Instance("Archivo-Italic[wdth,wght].ttf", "ArchivoExpanded-BoldItalic", "Archivo Expanded", "Bold Italic", 125, 700, True),
    Instance("Archivo-Italic[wdth,wght].ttf", "ArchivoExpanded-ExtraBoldItalic", "Archivo Expanded", "ExtraBold Italic", 125, 800, True),
    Instance("Archivo-Italic[wdth,wght].ttf", "ArchivoExpanded-BlackItalic", "Archivo Expanded", "Black Italic", 125, 900, True),
    Instance("MartianMono[wdth,wght].ttf", "MartianMono-Regular", "Martian Mono", "Regular", MONO_WIDTH, 400, False),
    Instance("MartianMono[wdth,wght].ttf", "MartianMono-Medium", "Martian Mono", "Medium", MONO_WIDTH, 500, False),
    Instance("MartianMono[wdth,wght].ttf", "MartianMono-Bold", "Martian Mono", "Bold", MONO_WIDTH, 700, False),
]

# The four styles a legacy (name ID 1/2) family may hold. Anything else gets
# its weight folded into the legacy family name, as the OpenType spec asks.
RIBBI = {"Regular", "Italic", "Bold", "Bold Italic"}


def sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def download(dest: Path) -> None:
    dest.mkdir(parents=True, exist_ok=True)
    for name, (url, digest) in SOURCES.items():
        target = dest / name
        if target.exists() and sha256(target) == digest:
            continue
        print(f"fetch {url}")
        with urllib.request.urlopen(url) as r, open(target, "wb") as f:
            shutil.copyfileobj(r, f)
        if sha256(target) != digest:
            target.unlink()
            sys.exit(f"{name}: checksum mismatch. Upstream changed at a pinned commit, which should be impossible.")


def legacy_names(inst: Instance) -> tuple[str, str]:
    """Name IDs 1 and 2 under the RIBBI rule."""
    if inst.style in RIBBI:
        return inst.family, inst.style
    weight = inst.style.removesuffix(" Italic")
    return f"{inst.family} {weight}", "Italic" if inst.italic else "Regular"


def build(inst: Instance, src_dir: Path) -> Path:
    from fontTools.ttLib import TTFont
    from fontTools.ttLib.tables._n_a_m_e import table__n_a_m_e
    from fontTools.varLib import instancer

    font = TTFont(src_dir / inst.source)
    version = font["name"].getDebugName(5) or "Version 1.000"
    static = instancer.instantiateVariableFont(font, {"wdth": inst.wdth, "wght": inst.wght})
    for tag in ("DSIG", "STAT"):
        if tag in static:
            del static[tag]

    name = static["name"]
    family1, style2 = legacy_names(inst)
    full = f"{inst.family} {inst.style}"
    # Drop every Windows/Mac record for the IDs we own, then write fresh ones.
    for nid in (1, 2, 3, 4, 6, 16, 17, 21, 22, 25):
        name.removeNames(nameID=nid)
    records = {
        1: family1,
        2: style2,
        3: f"{version.removeprefix('Version ')};Gapped;{inst.postscript}",
        4: full,
        6: inst.postscript,
        16: inst.family,
        17: inst.style,
    }
    for nid, value in records.items():
        name.setName(value, nid, 3, 1, 0x409)  # Windows, Unicode BMP, en-US
    # The variable font's leftovers (axis and instance names) are now dangling.
    table__n_a_m_e.removeUnusedNames(static)

    os2 = static["OS/2"]
    os2.usWeightClass = inst.wght
    bold = inst.wght >= 700 and inst.style in RIBBI
    # fsSelection: bit 0 italic, bit 5 bold, bit 6 regular; bit 7 (use typo
    # metrics) and bit 8 (WWS) are left as upstream set them.
    sel = os2.fsSelection & ~0b1100001
    if inst.italic:
        sel |= 1 << 0
    if bold:
        sel |= 1 << 5
    if not inst.italic and not bold:
        sel |= 1 << 6
    os2.fsSelection = sel
    static["head"].macStyle = (1 if bold else 0) | (2 if inst.italic else 0)

    OUT.mkdir(parents=True, exist_ok=True)
    out = OUT / f"{inst.postscript}.ttf"
    # Keep upstream's head.modified rather than stamping the build time, so a
    # rebuild from the same sources is byte-identical.
    static.recalcTimestamp = False
    static.save(out)
    return out


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--download", action="store_true", help=f"fetch the pinned sources into {CACHE.relative_to(ROOT)}")
    parser.add_argument("--src", type=Path, help="directory holding the variable TTFs and OFL texts")
    args = parser.parse_args()

    src = args.src or CACHE
    if args.download:
        download(src)
    for name, (_, digest) in SOURCES.items():
        path = src / name
        if not path.exists():
            sys.exit(f"missing {path}. Run with --download, or pass --src.")
        if sha256(path) != digest:
            sys.exit(f"{path} is not the pinned upstream file (sha256 mismatch).")

    OUT.mkdir(parents=True, exist_ok=True)
    for licence in ("OFL-Archivo.txt", "OFL-MartianMono.txt"):
        shutil.copyfile(src / licence, OUT / licence)

    from fontTools.ttLib import TTFont

    for inst in INSTANCES:
        out = build(inst, src)
        check = TTFont(out)
        ps = check["name"].getDebugName(6)
        assert ps == out.stem, f"{out.name}: PostScript name {ps!r} does not match the file name"
        assert "fvar" not in check, f"{out.name} is still variable"
        print(f"{out.relative_to(ROOT)}  wdth={inst.wdth:g} wght={inst.wght}  PS={ps}  {out.stat().st_size // 1024} KB")


if __name__ == "__main__":
    main()
