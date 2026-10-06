"""
Prep for the estate: the "Wagon" of Comrade1280's Generic passenger car pack
(CC BY 4.0, art-source/vehicles/_downloads/generic-passenger-car-pack).

The pack's cars stand at odd angles around a turntable and every car is one
mesh whose paint, trim, badges and lights are painted into two texture
atlases (WagonBlue.png for the body, lights.jpg for the lamps). The renderer
re-materials by material name, so this script:

  1. keeps the Wagon body and its four wheels (Wheel_A*.001), nothing else;
  2. turns them square (nose to +X, centre line on y = 0, wheels on z = 0);
  3. splits the faces into role materials by sampling the source atlases at
     each face's UVs: paint / trim / chrome for the body atlas, tail light
     (the rear clusters) / head light (the front ones) for the lamp atlas,
     tyre / rim / metal for the wheels;
  4. stands up the shading normals of one flat rear panel (see below);
  5. saves art-source/vehicles/estate/model.blend.

The spec (specs/estate.json) maps these material names to bake.py's roles.

Run (from the repo root):
  scripts/render-vehicles/slot.sh ~/Applications/Blender.app/Contents/MacOS/Blender -b \
      -P scripts/render-vehicles/prep/estate.py
"""

import math
import os

import bmesh
import bpy
import mathutils
import numpy as np

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))
PACK = os.path.join(ROOT, 'art-source/vehicles/_downloads/generic-passenger-car-pack')
SRC = os.path.join(PACK, 'source/fab.fbx')
OUT = os.path.join(ROOT, 'art-source/vehicles/estate/model.blend')
BODY_TEX = os.path.join(PACK, 'textures/WagonBlue.png')
LAMP_TEX = os.path.join(PACK, 'textures/lights.jpg')
WHEEL_TEX = os.path.join(PACK, 'textures/Wheel_A_Diffuse.png')

BODY = 'Wagon Body'
WHEELS = ['Wheel_A.001', 'Wheel_A001.001', 'Wheel_A002.001', 'Wheel_A003.001']

bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.fbx(filepath=SRC, use_custom_normals=True)

# ---------------------------------------------------------------------------
# 1. Keep the wagon only.

keep = [BODY] + WHEELS
for o in list(bpy.data.objects):
    if o.name not in keep:
        bpy.data.objects.remove(o, do_unlink=True)
objs = [bpy.data.objects[n] for n in keep]
for o in objs:
    if o.data.users > 1:
        o.data = o.data.copy()

# ---------------------------------------------------------------------------
# 2. Square it up: undo the body's turn about its own origin.

body = bpy.data.objects[BODY]
pivot = body.matrix_world.translation.copy()
turn = body.matrix_world.to_euler().z
# Squared up, the wagon's nose points to -Y (its headlights and the front
# corners of its lamp atlas are there; the tail-light clusters wrap the +Y
# corners). A further quarter turn puts the nose on +X, as bake.py expects.
undo = (mathutils.Matrix.Rotation(math.radians(90), 4, 'Z') @ mathutils.Matrix.Rotation(-turn, 4, 'Z')
        @ mathutils.Matrix.Translation(-pivot))
for o in objs:
    mw = undo @ o.matrix_world
    o.data.transform(mw)
    o.matrix_world = mathutils.Matrix.Identity(4)
    o.data.update()


def load_px(path):
    img = bpy.data.images.load(path, check_existing=True)
    w, h = img.size
    px = np.empty(w * h * 4, dtype=np.float32)
    img.pixels.foreach_get(px)
    return px.reshape(h, w, 4)[..., :3], img


body_px, body_img = load_px(BODY_TEX)
lamp_px, lamp_img = load_px(LAMP_TEX)
wheel_px, wheel_img = load_px(WHEEL_TEX)


def sample(px, uv):
    h, w = px.shape[:2]
    u = uv[0] % 1.0
    v = uv[1] % 1.0
    return px[min(h - 1, int(v * h)), min(w - 1, int(u * w))]


def face_samples(face, uv_layer, px):
    """The atlas colour over a face: its UV centre and its corners pulled a
    third of the way in (so a face on an island edge does not read the
    island's border)."""
    uvs = [mathutils.Vector(l[uv_layer].uv) for l in face.loops]
    c = sum(uvs, mathutils.Vector((0, 0))) / len(uvs)
    pts = [c] + [c + (u - c) * 0.66 for u in uvs]
    return np.array([sample(px, p) for p in pts])


def body_class(cols):
    votes = {}
    for r, g, b in cols:
        mx, mn = max(r, g, b), min(r, g, b)
        sat = (mx - mn) / (mx + 1e-4)
        if mx > 0.1 and sat > 0.22 and b > r and g > r:
            k = 'paint'
        elif mx > 0.62 and sat < 0.15:
            k = 'chrome'
        else:
            k = 'trim'
        votes[k] = votes.get(k, 0) + 1
    return max(votes, key=votes.get)


def lamp_class(cols):
    r, g, b = np.median(cols, axis=0)
    mx = max(r, g, b)
    if r > 0.25 and r > 1.8 * g and r > 1.6 * b:
        return 'red'
    if r > 0.35 and g > 0.18 and b < 0.55 * g and g < 0.9 * r:
        return 'amber'
    if mx < 0.12:
        return 'black'
    return 'clear'


def wheel_class(cols, r):
    """r: the face's distance from the axle over the tyre's radius. The
    tyre is everything out from the rim flange; inside it, the atlas's bright
    steel is the rim and its shaded recesses a darker metal (they were black,
    which drew the wheel as a cog)."""
    if r >= 0.72:
        return 'tyre'
    lum = float(np.median(cols.mean(axis=1)))
    return 'rim' if lum > 0.3 else 'metal'


# ---------------------------------------------------------------------------
# 3. Role materials.

ROLE_COLOURS = {
    'paint': (0.02, 0.2, 0.1), 'trim': (0.02, 0.02, 0.02), 'chrome': (0.7, 0.7, 0.7),
    'glass': (0.01, 0.01, 0.02), 'tyre': (0.01, 0.01, 0.01), 'rim': (0.5, 0.5, 0.5),
    'tail light': (0.5, 0.0, 0.0), 'head light': (0.8, 0.8, 0.8), 'metal': (0.3, 0.3, 0.3),
}
mats = {}
for name, col in ROLE_COLOURS.items():
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    m.node_tree.nodes['Principled BSDF'].inputs['Base Color'].default_value = (*col, 1.0)
    mats[name] = m

stats = {}
lamp_faces = []
chrome_at = []
for o in objs:
    src_names = [s.material.name if s.material else '' for s in o.material_slots]
    me = o.data
    # Read the faces (and their source slots) before the slots are replaced:
    # clearing a mesh's materials resets every face to slot 0.
    bm = bmesh.new()
    bm.from_mesh(me)
    uv_layer = bm.loops.layers.uv.active
    me.materials.clear()
    for name in ROLE_COLOURS:
        me.materials.append(mats[name])
    index = {name: i for i, name in enumerate(ROLE_COLOURS)}
    co = np.array([v.co[:] for v in me.vertices])
    wc = (co.min(axis=0) + co.max(axis=0)) / 2
    tyre_r = max(np.hypot(co[:, 0] - wc[0], co[:, 2] - wc[2]).max(), 1e-6)
    for f in bm.faces:
        src = src_names[f.material_index] if f.material_index < len(src_names) else ''
        base = src.split('.')[0]
        if base == 'Body':
            role = body_class(face_samples(f, uv_layer, body_px))
        elif base == 'Optics':
            k = lamp_class(face_samples(f, uv_layer, lamp_px))
            c = f.calc_center_median()
            lamp_faces.append((k, c.copy(), f.calc_area(), f.normal.copy()))
            # The lamp atlas is mapped face by face, so the red, amber and
            # clear patches of one lamp come out as a mosaic of triangles.
            # Each cluster is one lamp: the rear corner clusters are the tail
            # lights (whole, so they glow as one unit), the front ones the
            # headlights (which do not glow).
            if k == 'black':
                role = 'trim'
            elif c.x < 0:
                role = 'tail light'
            else:
                role = 'head light'
        elif base == 'Glass':
            role = 'glass'
        elif base in ('Wheel', 'Wheek'):
            fc = f.calc_center_median()
            r = math.hypot(fc.x - wc[0], fc.z - wc[2]) / tyre_r
            role = wheel_class(face_samples(f, uv_layer, wheel_px), r)
        else:
            role = 'trim'
        if role == 'chrome':
            cc = f.calc_center_median()
            chrome_at.append((round(cc.x, 2), round(cc.y, 2), round(cc.z, 2)))
        key = (o.name[:12], base, role)
        stats[key] = stats.get(key, 0) + 1
        f.material_index = index[role]
    bm.to_mesh(me)
    bm.free()
    me.update()

for k in sorted(stats):
    print('[prep] faces', k, stats[k])
print('[prep] chrome faces at', sorted(set(chrome_at)))

lo = np.min([np.array(v.co) for o in objs for v in o.data.vertices], axis=0)
hi = np.max([np.array(v.co) for o in objs for v in o.data.vertices], axis=0)
print('[prep] bbox lo', lo.round(3), 'hi', hi.round(3))
for kind in ('red', 'clear', 'amber'):
    for end, test in (('front', lambda c: c.x > 0), ('rear', lambda c: c.x < 0)):
        cs = [c for k, c, a, n in lamp_faces if k == kind and test(c)]
        if cs:
            print('[prep] %s lamps at the %s: %d faces, mean %s' % (
                kind, end, len(cs), np.mean([np.array(c) for c in cs], axis=0).round(3)))

# ---------------------------------------------------------------------------
# 4. The flat panel under the tailgate's trim strip leans back about 20
# degrees, which makes it a mirror for the rig's camera-side card in the rear
# view: half the panel came out as a hard white block. Its shading normals are
# stood up by about 14 degrees (the geometry and silhouette are untouched),
# so the panel reflects the dark sky above the horizon and reads as paint.

me = body.data
paint_i = [i for i, m in enumerate(me.materials) if m.name == 'paint'][0]
cn = [mathutils.Vector(c.vector) for c in me.corner_normals]
stood = 0
for p in me.polygons:
    c, n = p.center, p.normal
    if p.material_index == paint_i and c.x < -2.3 and 0.62 < c.z < 0.80 and n.x < -0.5 and n.z > 0.15:
        for li in p.loop_indices:
            v = cn[li]
            cn[li] = mathutils.Vector((v.x, v.y, v.z - 0.25)).normalized()
        stood += 1
me.normals_split_custom_set([tuple(v) for v in cn])
print('[prep] tailgate panel faces stood up:', stood)

for img in (body_img, lamp_img, wheel_img):
    bpy.data.images.remove(img)
for m in list(bpy.data.materials):
    if m.users == 0:
        bpy.data.materials.remove(m)

os.makedirs(os.path.dirname(OUT), exist_ok=True)
bpy.ops.wm.save_as_mainfile(filepath=OUT)
print('[prep] saved', OUT)
