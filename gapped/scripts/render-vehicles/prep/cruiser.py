"""
Prep for the cruiser (lexpartizan "Moped, motorcycle.", CC BY 4.0).

The source is a bare OBJ with no .mtl: every face carries a placeholder
material ('None', 'None_NONE', 'None_RGB_1.jpg.001'), and all the colour lives
in one 4096 atlas (RGB.jpg) with a metalness map (Metal.jpg). The bake gives
each material one role, so this splits the faces into role materials by what
the atlas and the metal map paint on each loose part, plus the part's place
on the bike:

  tank, fenders, fender tail, frame, swingarm, lower triple clamp  -> 'paint'
  wheels: metal faces -> 'rim', the rest -> 'tyre'
  brake disc, rear hub and sprocket, caliper, chain, engine metal  -> 'metal'
  exhaust, forks, bars, mirrors, headlight shell, shocks, rack and
    sissy bar, fender struts, bolts, other metal faces             -> 'chrome'
  saddlebag shells                                                 -> 'paint'
  seat, pillion, backrest                                          -> 'interior'
  saddlebag straps -> 'trim', buckles -> 'chrome'
  the lamp box at the top of the rear fender: back and side faces  -> 'tail light'
                                              the rest of the box  -> 'trim'
  everything else (grips, cables, pegs, gauges, coil)              -> 'trim'

Every face ends up on a flat role shader, so nothing from the atlas survives:
the engine-cover badge, the gauge numerals, the brown leather, the red caliper
and the brass buckles all go.

It also renames the objects (the source calls the body 'Plane.001_Mesh', and
the bake drops any object named like a ground plane) and applies the OBJ
import rotation. The nose points -X as saved (the spec sets forward -x).
Saves art-source/vehicles/cruiser/model.blend.

    scripts/render-vehicles/slot.sh ~/Applications/Blender.app/Contents/MacOS/Blender -b \
        -P scripts/render-vehicles/prep/cruiser.py
"""

import os

import bmesh
import bpy
import numpy as np

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))
SRC_DIR = os.path.join(ROOT, 'art-source/vehicles/_downloads/moped-motorcycle/source/moped')
SRC = os.path.join(SRC_DIR, 'moped.obj')
OUT = os.path.join(ROOT, 'art-source/vehicles/cruiser/model.blend')

bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.wm.obj_import(filepath=SRC)
scene = bpy.context.scene

# --- maps --------------------------------------------------------------------


def load(name):
    im = bpy.data.images.load(os.path.join(SRC_DIR, name))
    w, h = im.size
    px = np.empty(w * h * 4, dtype=np.float32)
    im.pixels.foreach_get(px)
    bpy.data.images.remove(im)
    return px.reshape(h, w, 4)[..., :3], w, h


RGB, W, H = load('RGB.jpg')
MET, _, _ = load('Metal.jpg')


def sample(img, uvs):
    uvs = np.asarray(uvs)
    x = np.clip((uvs[:, 0] % 1.0) * W, 0, W - 1).astype(int)
    y = np.clip((uvs[:, 1] % 1.0) * H, 0, H - 1).astype(int)
    return img[y, x]


# --- role materials ------------------------------------------------------------
# Flat placeholders: the bake replaces each with its own shader by role (the
# spec maps every name explicitly, so 'trim' never falls to the 'rim' rule).

ROLE_COLOURS = {
    'paint': (0.02, 0.02, 0.025),
    'trim': (0.03, 0.03, 0.03),
    'chrome': (0.6, 0.6, 0.6),
    'metal': (0.2, 0.2, 0.2),
    'tyre': (0.02, 0.02, 0.02),
    'rim': (0.5, 0.5, 0.5),
    'interior': (0.03, 0.03, 0.03),
    'tail light': (0.5, 0.0, 0.0),
}
MATS = {}
for role, rgb in ROLE_COLOURS.items():
    m = bpy.data.materials.new(role)
    m.use_nodes = True
    m.node_tree.nodes['Principled BSDF'].inputs['Base Color'].default_value = (*rgb, 1.0)
    MATS[role] = m

# --- objects -------------------------------------------------------------------

RENAME = {
    'Circle': 'front_end',               # forks, bars, mirrors, headlight, fender
    'Circle.002_Circle.001': 'wheel_front',
    'Plane.001_Mesh.001_Plane.001_Mesh.003': 'wheel_rear',
    'Plane.001_Mesh.002_Plane.001_Mesh.001': 'saddlebags',
    'Plane.001_Mesh': 'body',            # tank, frame, engine, seat, fender, rack
    'Cube.001': 'tail_lamp',
}

for o in list(scene.objects):
    if o.type != 'MESH' or not len(o.data.polygons):
        bpy.data.objects.remove(o, do_unlink=True)
for o in scene.objects:
    o.name = RENAME[o.name]
    o.data.name = o.name

bpy.ops.object.select_all(action='SELECT')
bpy.context.view_layer.objects.active = scene.objects[0]
bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)


def islands(bm):
    seen, parts = set(), []
    for f in bm.faces:
        if f.index in seen:
            continue
        stack, comp = [f], []
        seen.add(f.index)
        while stack:
            g = stack.pop()
            comp.append(g)
            for e in g.edges:
                for h in e.link_faces:
                    if h.index not in seen:
                        seen.add(h.index)
                        stack.append(h)
        parts.append(comp)
    return parts


def face_stats(f, uvl):
    uvs = [l[uvl].uv[:] for l in f.loops]
    cen = np.mean(uvs, axis=0)
    uvs = uvs + [tuple(cen)]
    c = sample(RGB, uvs).mean(axis=0)
    m = float(sample(MET, uvs)[:, 0].mean())
    return c, m


def is_brown(c):
    return c[0] > c[2] + 0.04 and c[0] > c[1] + 0.02 and c.max() < 0.6 and not is_red(c)


def is_red(c):
    return c[0] > 0.3 and c[1] < 0.22 and c[2] < 0.22 and c[0] > 2 * c[1]


def lum(c):
    return float(0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2])


def within(lo, hi, box):
    """Part box (lo, hi) inside box ((x0, y0, z0), (x1, y1, z1))."""
    return all(box[0][i] - 1e-3 <= lo[i] and hi[i] <= box[1][i] + 1e-3 for i in range(3))


# Boxes in the source frame (nose -X, x 0 front .. 2.12 rear, y across, z up).
ENGINE = ((0.80, -0.30, 0.14), (1.45, 0.30, 0.66))
RACK = ((1.80, -0.15, 0.60), (2.13, 0.15, 0.96))        # sissy bar and luggage rack

counts = {}


def put(f, role):
    f.material_index = ROLE_INDEX[role]
    counts[role] = counts.get(role, 0) + 1


ROLE_INDEX = {r: i for i, r in enumerate(MATS)}

for o in list(scene.objects):
    me = o.data
    me.materials.clear()
    for m in MATS.values():
        me.materials.append(m)
    bm = bmesh.new()
    bm.from_mesh(me)
    bm.faces.ensure_lookup_table()
    uvl = bm.loops.layers.uv.active
    parts = sorted(islands(bm), key=lambda c: -sum(f.calc_area() for f in c))

    if o.name == 'tail_lamp':
        # A five-sided box open toward the bike (11 x 5 cm): the back face and
        # the two side faces are the lens (it wraps, so the side view shows a
        # sliver of light too); top and bottom are the housing.
        for f in bm.faces:
            put(f, 'tail light' if abs(f.normal.z) < 0.5 else 'trim')
        bm.to_mesh(me)
        bm.free()
        continue

    for pi, comp in enumerate(parts):
        co = np.array([v.co[:] for f in comp for v in f.verts])
        lo, hi = co.min(axis=0), co.max(axis=0)
        area = sum(f.calc_area() for f in comp)
        stats = [face_stats(f, uvl) for f in comp]
        cols = np.array([s[0] for s in stats])
        mets = np.array([s[1] for s in stats])
        mean_met = float(mets.mean())
        dark = float(np.mean([lum(c) < 0.25 for c in cols]))
        brown = float(np.mean([is_brown(c) for c in cols]))
        red = float(np.mean([is_red(c) for c in cols]))

        if o.name.startswith('wheel_'):
            if pi == 0:
                # Tyre and rim are one part: the metal map tells them apart.
                for f, (c, m) in zip(comp, stats):
                    put(f, 'rim' if m >= 0.5 else 'tyre')
            else:
                for f in comp:
                    put(f, 'metal' if area > 0.01 else 'chrome')
            continue

        if o.name == 'saddlebags':
            # Hard bag shells in the body colour; straps dark, buckles chrome.
            role = 'paint' if pi < 2 else ('chrome' if mean_met > 0.5 else 'trim')
            for f in comp:
                put(f, role)
            continue

        if red > 0.5:
            role = 'metal'                       # brake caliper
        elif brown > 0.5:
            role = 'interior'                    # seat, pillion, backrest
        elif within(lo, hi, RACK) and (mean_met > 0.5 or dark > 0.8) and area < 0.08:
            role = 'chrome'                      # sissy bar, rack, rear signals
        elif dark > 0.8 or (lum(cols.mean(axis=0)) < 0.25 and mean_met < 0.1):
            ext = hi - lo
            # Big black panels and tubes: the paint. Thin cross bars (pegs) and
            # cables stay trim.
            role = 'paint' if area >= 0.04 and ext[1] < 0.4 else 'trim'
        elif mean_met >= 0.6:
            role = 'metal' if (within(lo, hi, ENGINE) and area > 0.03) else 'chrome'
        else:
            role = None                          # mixed: face by face
        if role:
            for f in comp:
                put(f, role)
            continue
        for f, (c, m) in zip(comp, stats):
            if is_red(c):
                put(f, 'metal')
            elif is_brown(c):
                put(f, 'interior')
            elif m >= 0.5:
                put(f, 'metal' if within(lo, hi, ENGINE) else 'chrome')
            else:
                put(f, 'trim')
    bm.to_mesh(me)
    bm.free()

print('[prep] cruiser faces per role:', counts)
for o in scene.objects:
    print('[prep]   %-12s %s' % (o.name, [m.name for m in o.data.materials]))

for m in list(bpy.data.materials):
    if m.users == 0:
        bpy.data.materials.remove(m)
for im in list(bpy.data.images):
    if im.users == 0:
        bpy.data.images.remove(im)

os.makedirs(os.path.dirname(OUT), exist_ok=True)
bpy.ops.wm.save_as_mainfile(filepath=OUT, compress=True)
print('[prep] saved', OUT)
