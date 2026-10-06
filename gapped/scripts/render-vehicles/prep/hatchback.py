"""
Prep for the hatchback: the "Hatchback" of Comrade1280's Generic passenger car
pack (CC BY 4.0, art-source/vehicles/_downloads/generic-passenger-car-pack).

The pack's cars stand at odd angles around a turntable (the hatchback at about
125 degrees, nose toward the centre) and every car is one mesh whose paint,
trim and lamps are painted into texture atlases (HatchbackYellow.png for the
body, the shared lights.jpg for the lamps, wheel_B_Diffuse.png for the
wheels). The FBX points at textures on the author's D: drive, so nothing
loads as is. This script:

  1. keeps the Hatchback body and its four wheels (Wheel_B, Wheel_B001..003),
     nothing else;
  2. turns them square from the wheel centres (nose to +X, centre line on
     y = 0, wheels on z = 0);
  3. splits the faces into role materials by sampling the source atlases at
     each face's UVs:
       body atlas  -> "body paint" (keeps the atlas, packed, so bake.py's
                      recolour can repaint it and keep its drawn panel seams),
                      "trim", "chrome";
       lamp atlas  -> "tail light" (the red sections of the rear clusters),
                      "head light" (front clear lenses), "lamp off" (amber
                      indicators, reversing lenses, front side markers);
       wheel atlas -> "tyre", "rim";
  4. saves art-source/vehicles/hatchback/model.blend with its images packed.

Run (from the repo root):
  scripts/render-vehicles/slot.sh ~/Applications/Blender.app/Contents/MacOS/Blender -b \
      -P scripts/render-vehicles/prep/hatchback.py
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
OUT = os.path.join(ROOT, 'art-source/vehicles/hatchback/model.blend')
BODY_TEX = os.path.join(PACK, 'textures/HatchbackYellow.png')
LAMP_TEX = os.path.join(PACK, 'textures/lights.jpg')
WHEEL_TEX = os.path.join(PACK, 'textures/wheel_B_Diffuse.png')

BODY = 'Hatchback Body'
WHEELS = ['Wheel_B', 'Wheel_B001', 'Wheel_B002', 'Wheel_B003']

bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.fbx(filepath=SRC, use_custom_normals=True)

# ---------------------------------------------------------------------------
# 1. Keep the hatchback only.

keep = [BODY] + WHEELS
for o in list(bpy.data.objects):
    if o.name not in keep:
        bpy.data.objects.remove(o, do_unlink=True)
objs = [bpy.data.objects[n] for n in keep]
for o in objs:
    o.parent = None
    if o.data.users > 1:
        o.data = o.data.copy()


def world_verts(o):
    n = len(o.data.vertices)
    co = np.empty(n * 3)
    o.data.vertices.foreach_get('co', co)
    co = co.reshape(-1, 3)
    mw = np.array(o.matrix_world)
    return co @ mw[:3, :3].T + mw[:3, 3]


# ---------------------------------------------------------------------------
# 2. Square it up from the wheels. The front axle is the pair nearer the
# turntable centre: the low bonnet is on that side and the tall hatch on the
# other (checked on the body's height profile).

wc = {n: world_verts(bpy.data.objects[n]).mean(axis=0) for n in WHEELS}
front = (wc['Wheel_B'] + wc['Wheel_B002']) / 2
rear = (wc['Wheel_B001'] + wc['Wheel_B003']) / 2
nose = front - rear
heading = math.atan2(nose[1], nose[0])
mid = (front + rear) / 2
print('[prep] heading %.2f deg, wheelbase %.3f' % (math.degrees(heading), np.linalg.norm(nose[:2])))
square = (mathutils.Matrix.Rotation(-heading, 4, 'Z')
          @ mathutils.Matrix.Translation((-mid[0], -mid[1], 0.0)))
for o in objs:
    mw = square @ o.matrix_world
    o.data.transform(mw)
    o.matrix_world = mathutils.Matrix.Identity(4)
    o.data.update()

# Height profile: the bonnet must be at +X (low), the hatch at -X (tall).
co = world_verts(bpy.data.objects[BODY])
xs = co[:, 0]
span = xs.max() - xs.min()
front_top = co[xs > xs.max() - span * 0.15, 2].max()
rear_top = co[xs < xs.min() + span * 0.15, 2].max()
print('[prep] top near the nose %.2f, near the tail %.2f' % (front_top, rear_top))
assert front_top < rear_top, 'nose/tail the wrong way round'

# Wheels on z = 0.
zmin = min(world_verts(o)[:, 2].min() for o in objs)
for o in objs:
    o.data.transform(mathutils.Matrix.Translation((0, 0, -zmin)))
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


def face_uvs(face, uv_layer):
    uvs = [mathutils.Vector(l[uv_layer].uv) for l in face.loops]
    c = sum(uvs, mathutils.Vector((0, 0))) / len(uvs)
    return c, uvs


def face_samples(face, uv_layer, px):
    """The atlas colour over a face: its UV centre and its corners pulled a
    third of the way in (so a face on an island edge does not read the
    island's border)."""
    c, uvs = face_uvs(face, uv_layer)
    pts = [c] + [c + (u - c) * 0.66 for u in uvs]
    return np.array([sample(px, p) for p in pts])


def body_class(cols):
    votes = {}
    for r, g, b in cols:
        mx, mn = max(r, g, b), min(r, g, b)
        sat = (mx - mn) / (mx + 1e-4)
        if mx > 0.12 and sat > 0.4 and r > b and g > b:
            k = 'body paint'
        elif mx > 0.45 and sat < 0.2:
            k = 'chrome'
        else:
            k = 'trim'
        votes[k] = votes.get(k, 0) + 1
    return max(votes, key=votes.get)


# lights.jpg (1024 x 1024) laid out as UV boxes, v up: the lamp a face shows
# is the box its UV centre falls in. Every box but the red ones is "off".
LAMP_BOXES = [
    ('red', 0.630, 0.995, 0.655, 0.850),    # red ribbed bar (rear clusters)
    ('amber', 0.630, 0.995, 0.450, 0.652),  # amber ribbed bar
    ('clear', 0.630, 0.995, 0.245, 0.448),  # clear ribbed bar (reversing)
    ('red', 0.793, 0.995, 0.855, 0.995),    # small red block
    ('amber', 0.597, 0.792, 0.855, 0.995),  # small amber block
    ('clear', 0.399, 0.596, 0.855, 0.995),  # small clear block
    ('red', 0.345, 0.555, 0.000, 0.230),    # round red
    ('amber', 0.560, 0.775, 0.000, 0.230),  # round amber
    ('clear', 0.775, 0.995, 0.000, 0.230),  # round clear
    ('clear', 0.000, 0.399, 0.180, 1.000),  # headlamp lenses
    ('clear', 0.399, 0.625, 0.620, 0.855),  # round headlamp
    ('black', 0.399, 0.625, 0.400, 0.620),  # dark reflector bowl
]


def lamp_class(face, uv_layer):
    c, _ = face_uvs(face, uv_layer)
    u, v = c.x % 1.0, c.y % 1.0
    for kind, u0, u1, v0, v1 in LAMP_BOXES:
        if u0 <= u <= u1 and v0 <= v <= v1:
            return kind
    return 'black'


def wheel_class(cols):
    lum = float(np.median(cols.mean(axis=1)))
    return 'rim' if lum > 0.35 else 'tyre'


# ---------------------------------------------------------------------------
# 3. Role materials.

ROLE_COLOURS = {
    'body paint': (0.8, 0.7, 0.0), 'trim': (0.02, 0.02, 0.02), 'chrome': (0.7, 0.7, 0.7),
    'glass': (0.01, 0.01, 0.02), 'tyre': (0.01, 0.01, 0.01), 'rim': (0.5, 0.5, 0.5),
    'tail light': (0.5, 0.0, 0.0), 'head light': (0.8, 0.8, 0.8), 'lamp off': (0.1, 0.1, 0.1),
}
mats = {}
for name, col in ROLE_COLOURS.items():
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    m.node_tree.nodes['Principled BSDF'].inputs['Base Color'].default_value = (*col, 1.0)
    mats[name] = m

# The body paint keeps the atlas (packed into the .blend): bake.py's recolour
# turns its yellow into the spec's paint and keeps the drawn seams, handles
# and soft shading.
paint_img = bpy.data.images.load(BODY_TEX, check_existing=False)
paint_img.name = 'hatchback body atlas'
paint_img.pack()
pm = mats['body paint']
nt = pm.node_tree
tex = nt.nodes.new('ShaderNodeTexImage')
tex.image = paint_img
bsdf = nt.nodes['Principled BSDF']
nt.links.new(tex.outputs['Color'], bsdf.inputs['Base Color'])
bsdf.inputs['Roughness'].default_value = 0.32

stats = {}
lamp_faces = []
for o in objs:
    src_names = [s.material.name if s.material else '' for s in o.material_slots]
    me = o.data
    bm = bmesh.new()
    bm.from_mesh(me)
    uv_layer = bm.loops.layers.uv.active
    me.materials.clear()
    for name in ROLE_COLOURS:
        me.materials.append(mats[name])
    index = {name: i for i, name in enumerate(ROLE_COLOURS)}
    for f in bm.faces:
        src = src_names[f.material_index] if f.material_index < len(src_names) else ''
        base = src.split('.')[0]
        if base == 'Body':
            role = body_class(face_samples(f, uv_layer, body_px))
        elif base == 'Optics':
            k = lamp_class(f, uv_layer)
            c = f.calc_center_median()
            lamp_faces.append((k, c.copy(), f.calc_area()))
            at_rear = c.x < 0
            # Only the red of the rear clusters glows. Amber indicators, the
            # clear reversing lenses and any front red marker are lamps that
            # are off; the clear front lenses are headlights (unlit).
            if k == 'red':
                role = 'tail light' if at_rear else 'lamp off'
            elif k == 'clear':
                role = 'lamp off' if at_rear else 'head light'
            elif k == 'amber':
                role = 'lamp off'
            else:
                role = 'trim'
        elif base == 'Glass':
            role = 'glass'
        elif base in ('Wheel', 'Wheek'):
            role = wheel_class(face_samples(f, uv_layer, wheel_px))
        else:
            role = 'trim'
        key = (o.name[:14], base, role)
        stats[key] = stats.get(key, 0) + 1
        f.material_index = index[role]
    bm.to_mesh(me)
    bm.free()
    me.update()

for k in sorted(stats):
    print('[prep] faces', k, stats[k])

lo = np.min([world_verts(o).min(axis=0) for o in objs], axis=0)
hi = np.max([world_verts(o).max(axis=0) for o in objs], axis=0)
print('[prep] bbox lo', lo.round(3), 'hi', hi.round(3))
for kind in ('red', 'clear', 'amber', 'black'):
    for end, test in (('front', lambda c: c.x > 0), ('rear', lambda c: c.x < 0)):
        cs = [c for k, c, a in lamp_faces if k == kind and test(c)]
        if cs:
            arr = np.array([np.array(c) for c in cs])
            print('[prep] %s lamps at the %s: %d faces, x %.2f..%.2f |y| %.2f..%.2f z %.2f..%.2f' % (
                kind, end, len(cs), arr[:, 0].min(), arr[:, 0].max(), np.abs(arr[:, 1]).min(),
                np.abs(arr[:, 1]).max(), arr[:, 2].min(), arr[:, 2].max()))

for i, o in enumerate(objs):
    o.name = 'Hatchback Body' if i == 0 else 'Hatchback Wheel %d' % i

for img in (body_img, lamp_img, wheel_img):
    bpy.data.images.remove(img)
for m in list(bpy.data.materials):
    if m.users == 0:
        bpy.data.materials.remove(m)
for img in list(bpy.data.images):
    if img.users == 0:
        bpy.data.images.remove(img)

os.makedirs(os.path.dirname(OUT), exist_ok=True)
bpy.ops.wm.save_as_mainfile(filepath=OUT)
print('[prep] saved', OUT)
