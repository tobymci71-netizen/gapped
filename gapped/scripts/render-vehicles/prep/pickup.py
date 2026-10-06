"""
Prep for the pickup: the "Pickup" of Comrade1280's Generic passenger car pack
(CC BY 4.0, art-source/vehicles/_downloads/generic-passenger-car-pack).

Every car in the pack is one mesh whose paint, trim and lamps are painted
into texture atlases (PickupGreen.png for the body, lights.jpg for the lamps,
wheel_E_Diffuse.png for the wheels), and the FBX points at texture paths that
do not exist. The renderer re-materials by material name, so this script:

  1. keeps the Pickup body and its four wheels (Wheel_E, Wheel_E001,
     Wheel_E002, Wheel_E003; the Wheel_E*.001 set belongs to the SUV);
  2. splits the faces into role materials by sampling the source atlases at
     each face's UVs: paint / trim / grille / grey for the body atlas, tail
     light / head light / lamp off for the lamp atlas, tyre / rim for the
     wheels, glass / side glass for the windows (the spec maps every name to
     a role; "side glass" is kept as built here, see below);
  3. saves art-source/vehicles/pickup/model.blend.

The pickup stands square with its nose to -Y (headlights at y = 4.4, the red
tail-light clusters wrap the rear corners at y = 10.1), so the spec says
"forward": "-y". The whole rear cluster (red, amber and reversing sections)
becomes tail light: it is one vertical unit per corner and reads as one red
light, as on most pickups. The spec maps "head light" to chrome (a dark
reflector that mirrors the night) rather than head: the pale head shader read
as a lit lamp at the nose of the side view. The tailgate's inset panel, dark
grey in the atlas, takes the paint (see tailgate_inset).

Run (from the repo root):
  scripts/render-vehicles/slot.sh ~/Applications/Blender.app/Contents/MacOS/Blender -b \
      -P scripts/render-vehicles/prep/pickup.py
"""

import os

import bmesh
import bpy
import mathutils
import numpy as np

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))
PACK = os.path.join(ROOT, 'art-source/vehicles/_downloads/generic-passenger-car-pack')
SRC = os.path.join(PACK, 'source/fab.fbx')
OUT = os.path.join(ROOT, 'art-source/vehicles/pickup/model.blend')
BODY_TEX = os.path.join(PACK, 'textures/PickupGreen.png')
LAMP_TEX = os.path.join(PACK, 'textures/lights.jpg')
WHEEL_TEX = os.path.join(PACK, 'textures/wheel_E_Diffuse.png')

BODY = 'Pickup Body'
WHEELS = ['Wheel_E', 'Wheel_E001', 'Wheel_E002', 'Wheel_E003']

bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.fbx(filepath=SRC, use_custom_normals=True)

# ---------------------------------------------------------------------------
# 1. Keep the pickup only.

keep = [BODY] + WHEELS
for o in list(bpy.data.objects):
    if o.name not in keep:
        bpy.data.objects.remove(o, do_unlink=True)
objs = [bpy.data.objects[n] for n in keep]
for o in objs:
    if o.data.users > 1:
        o.data = o.data.copy()
# Bake the transforms in (the pack is in millimetres with a 0.001 scale).
for o in objs:
    o.data.transform(o.matrix_world)
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


def dense_samples(face, uv_layer, px):
    """The atlas over the whole face: a barycentric grid on each fan
    triangle of its UV polygon."""
    uvs = [mathutils.Vector(l[uv_layer].uv) for l in face.loops]
    out = []
    for i in range(1, len(uvs) - 1):
        a, b, c = uvs[0], uvs[i], uvs[i + 1]
        for s in np.linspace(0.04, 0.96, 9):
            for t in np.linspace(0.04, 0.96, 9):
                if s + t < 0.98:
                    out.append(sample(px, a + (b - a) * s + (c - a) * t))
    return np.array(out) if out else face_samples(face, uv_layer, px)


def body_class(cols):
    """The body atlas is green paint (lit and shaded down to near black),
    black trim, grey (mirror caps, handles, bed-rail caps, interior) and the
    white grille bars. The black side moulding is painted into the atlas
    over the panel faces as well as modelled; a face that is a fifth green
    or more is panel, so the painted strip does not cut black teeth into the
    doors."""
    votes = {'paint': 0, 'grille': 0, 'grey': 0, 'trim': 0}
    for r, g, b in cols:
        mx, mn = max(r, g, b), min(r, g, b)
        if g > 0.03 and g > 1.6 * r and g > 1.35 * b:
            k = 'paint'
        elif mx > 0.6 and (mx - mn) < 0.12:
            k = 'grille'
        elif mx > 0.16 and (mx - mn) < 0.12:
            k = 'grey'
        else:
            k = 'trim'
        votes[k] += 1
    n = float(len(cols))
    if votes['paint'] / n >= 0.2:
        return 'paint'
    return max(votes, key=votes.get)


def tailgate_inset(c, n):
    """The tailgate's inset panel (between the tail lights, z 0.87-1.24) is
    painted dark grey in the atlas; on a real pickup it is body colour, and
    the rear is the hero view, so it takes the paint."""
    return c.y > 10.04 and n.y > 0.6 and abs(c.x) < 0.765 and 0.84 < c.z < 1.27


def lamp_class(cols):
    r, g, b = np.median(cols, axis=0)
    mx = max(r, g, b)
    if r > 0.12 and g < 0.14 * r and b < 0.3 * r:
        return 'red'
    if r > 0.12 and g < 0.7 * r and b < 0.5 * r:
        return 'amber'
    if mx < 0.1:
        return 'black'
    return 'clear'


# ---------------------------------------------------------------------------
# 2. Role materials.

ROLE_COLOURS = {
    'paint': (0.45, 0.33, 0.15), 'trim': (0.02, 0.02, 0.02), 'grille': (0.05, 0.05, 0.05),
    'grey': (0.06, 0.06, 0.06), 'glass': (0.01, 0.01, 0.02), 'tyre': (0.01, 0.01, 0.01),
    'rim': (0.5, 0.5, 0.5), 'tail light': (0.5, 0.0, 0.0), 'head light': (0.8, 0.8, 0.8),
    'lamp off': (0.1, 0.1, 0.1),
}
ROLE_COLOURS['side glass'] = (0.0021, 0.003, 0.005)
mats = {}
for name, col in ROLE_COLOURS.items():
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    m.node_tree.nodes['Principled BSDF'].inputs['Base Color'].default_value = (*col, 1.0)
    mats[name] = m
# The door windows stand almost upright, tipped up 10-17 degrees, so in the
# side view the rig's mirror-like glass (bake.py: roughness 0.03, full coat)
# reflects the white camera-side card as a hard white band across the lower
# window, which reads as something white inside the cab. The spec keeps this
# material as it is: the same dark glass, rougher and with a sixth of the
# specular, so the card shows only as a faint dark sheen.
b = mats['side glass'].node_tree.nodes['Principled BSDF']
b.inputs['Roughness'].default_value = 0.3
b.inputs['Specular IOR Level'].default_value = 0.08
b.inputs['Coat Weight'].default_value = 0.0

# Wheel axles (x is the axle direction): the wheel's own bbox centre.
axles = {}
for n in WHEELS:
    co = np.array([v.co for v in bpy.data.objects[n].data.vertices])
    axles[n] = ((co.min(0) + co.max(0)) / 2, (co.max(0)[2] - co.min(0)[2]) / 2)

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
        c = f.calc_center_median()
        if o.name in WHEELS:
            # Tyre and rim by radius from the axle, the rim read from the
            # atlas: the bright face of the wheel inside the sidewall.
            centre, radius = axles[o.name]
            r = ((c.y - centre[1]) ** 2 + (c.z - centre[2]) ** 2) ** 0.5
            lum = float(np.median(face_samples(f, uv_layer, wheel_px).mean(axis=1)))
            role = 'rim' if (r < radius * 0.62 and lum > 0.3) else 'tyre'
        elif base == 'Body':
            role = body_class(dense_samples(f, uv_layer, body_px))
            if tailgate_inset(c, f.normal):
                role = 'paint'
        elif base == 'Optics':
            k = lamp_class(face_samples(f, uv_layer, lamp_px))
            lamp_faces.append((k, c.copy(), f.calc_area(), f.normal.copy()))
            rear = c.y > 7.3
            if rear:
                role = 'tail light'
            elif k == 'clear':
                role = 'head light'
            else:
                role = 'lamp off'
        elif base == 'Glass':
            role = 'side glass' if abs(f.normal.x) > 0.7 else 'glass'
        else:
            role = 'trim'
        key = (o.name[:12], base, role)
        stats[key] = stats.get(key, 0) + 1
        f.material_index = index[role]
    bm.to_mesh(me)
    bm.free()
    me.update()

for k in sorted(stats):
    print('[prep] faces', k, stats[k])

lo = np.min([np.array(v.co) for o in objs for v in o.data.vertices], axis=0)
hi = np.max([np.array(v.co) for o in objs for v in o.data.vertices], axis=0)
print('[prep] bbox lo', lo.round(3), 'hi', hi.round(3))
for kind in ('red', 'clear', 'amber', 'black'):
    for end, test in (('front', lambda c: c.y < 7.3), ('rear', lambda c: c.y > 7.3)):
        cs = [c for k, c, a, n in lamp_faces if k == kind and test(c)]
        if cs:
            print('[prep] %s lamps at the %s: %d faces, mean %s' % (
                kind, end, len(cs), np.mean([np.array(c) for c in cs], axis=0).round(3)))

for img in (body_img, lamp_img, wheel_img):
    bpy.data.images.remove(img)
for m in list(bpy.data.materials):
    if m.users == 0:
        bpy.data.materials.remove(m)

os.makedirs(os.path.dirname(OUT), exist_ok=True)
bpy.ops.wm.save_as_mainfile(filepath=OUT)
print('[prep] saved', OUT)
