"""
Prep for the motorbike (eriklys "Motorcycle", CC BY 4.0: a close copy of a
Honda CB650R naked bike).

The source is one mesh named 'Plane' (the bake would drop it as a ground
card) with eleven materials whose texture files are not linked by the FBX, so
no texture (and none of the Honda_CB650R__* atlases with their lettering and
badges) ever reaches the render: every material is replaced by a bake role.
There are no badge, decal, plate, stand or rider meshes. What the materials
do not say, the geometry does, so this script splits them:

  'plastico preto' (black plastic, most of the bike) ->
      'paint'      the tail cowl panels, the tank side shrouds and the front
                   fender (the atlas paints the fender red, i.e. body colour)
      'rim'        the wheel rims (the plastic parts inside each wheel)
      the rest stays 'plastico preto' (trim: frame, covers, headlight shell)
  'luzes de tras' (rear lights) ->
      'tail light' the tail lamp at the back of the tail cowl
      'indicator'  the two rear indicator lenses (never lit)

Panels are picked by UV island (the model's own panel breaks), named by their
centre and area so the choice does not hang on face order. Saves
art-source/vehicles/motorbike/model.blend.

    scripts/render-vehicles/slot.sh ~/Applications/Blender.app/Contents/MacOS/Blender -b \
        -P scripts/render-vehicles/prep/motorbike.py
"""

import os

import bmesh
import bpy
import mathutils
import numpy as np

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))
SRC = os.path.join(ROOT, 'art-source/vehicles/_downloads/motorcycle/source/Honda CB650R .fbx')
TEX = os.path.join(ROOT, 'art-source/vehicles/_downloads/motorcycle/textures/Honda_CB650R__plastico_preto_BaseColor.png')
OUT = os.path.join(ROOT, 'art-source/vehicles/motorbike/model.blend')

# Source units after import (nose toward -Y, up +Z, ground at z = -0.357).
# Painted UV islands of 'plastico preto': (|x|, y, z) centre and area.
PAINT_ISLANDS = [
    # tail cowl
    (0.003, 0.718, 0.854, 0.1118),  # top and upper flanks
    (0.000, 0.880, 0.869, 0.0235),  # tail tip above the lamp
    (0.000, 0.847, 0.801, 0.0525),  # lower edge under the tip
    (0.197, 0.639, 0.756, 0.0169),  # flank panel (each side)
    (0.216, 0.608, 0.684, 0.0119),  # lower flank panel (each side)
    (0.197, 0.531, 0.740, 0.0013),  # front edge strip (each side)
    # tank side shrouds
    (0.218, -0.380, 0.725, 0.0238),
    (0.244, -0.370, 0.718, 0.0295),
    (0.200, -0.431, 0.639, 0.0049),
]
FRONT_AXLE = (-1.118, 0.05)  # (y, z)
REAR_AXLE = (0.767, 0.05)
WHEEL_R = 0.41

bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.fbx(filepath=SRC, use_custom_normals=True)
scene = bpy.context.scene
obj = next(o for o in scene.objects if o.type == 'MESH')
obj.name = 'motorbike'
obj.data.name = 'motorbike'
bpy.ops.object.select_all(action='DESELECT')
obj.select_set(True)
bpy.context.view_layer.objects.active = obj
bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
for o in list(scene.objects):
    if o is not obj:
        bpy.data.objects.remove(o, do_unlink=True)

me = obj.data
names = [s.material.name for s in obj.material_slots]


def new_mat(name, rgb):
    m = bpy.data.materials.get(name) or bpy.data.materials.new(name)
    m.use_nodes = True
    m.node_tree.nodes['Principled BSDF'].inputs['Base Color'].default_value = (*rgb, 1.0)
    return m


def slot_of(mat):
    if mat.name not in [m.name for m in me.materials]:
        me.materials.append(mat)
    return [m.name for m in me.materials].index(mat.name)


PAINT = slot_of(new_mat('paint', (0.16, 0.07, 0.75)))
RIM = slot_of(new_mat('rim', (0.3, 0.3, 0.32)))
TAIL = slot_of(new_mat('tail light', (0.6, 0.0, 0.02)))
IND = slot_of(new_mat('indicator', (0.5, 0.25, 0.0)))

bm = bmesh.new()
bm.from_mesh(me)
bm.faces.ensure_lookup_table()
uvl = bm.loops.layers.uv.active
black = names.index('plastico preto')
lamps = names.index('luzes de tras')


def islands(faces, same_uv):
    fset, seen, out = set(faces), set(), []
    for f in faces:
        if f in seen:
            continue
        stack, comp = [f], []
        seen.add(f)
        while stack:
            g = stack.pop()
            comp.append(g)
            for e in g.edges:
                for h in e.link_faces:
                    if h in fset and h not in seen and (not same_uv or uv_joined(g, h, e)):
                        seen.add(h)
                        stack.append(h)
        out.append(comp)
    return out


def uv_joined(f, g, e):
    a = {l.vert: l[uvl].uv for l in f.loops if l.vert in e.verts}
    b = {l.vert: l[uvl].uv for l in g.loops if l.vert in e.verts}
    return all((a[v] - b[v]).length < 1e-4 for v in e.verts)


def centre_area(comp):
    a = sum(f.calc_area() for f in comp)
    c = sum((f.calc_center_median() * f.calc_area() for f in comp), mathutils.Vector()) / max(a, 1e-12)
    return c, a


counts = {'paint': 0, 'rim': 0, 'fender': 0, 'tail': 0, 'indicator': 0}

# --- rims: plastic pieces wholly inside a wheel, near the centre plane -------
black_faces = [f for f in bm.faces if f.material_index == black]
for comp in islands(black_faces, same_uv=False):
    co = np.array([v.co[:] for f in comp for v in f.verts])
    for ay, az in (FRONT_AXLE, REAR_AXLE):
        r = np.sqrt((co[:, 1] - ay) ** 2 + (co[:, 2] - az) ** 2)
        if r.max() < WHEEL_R and np.abs(co[:, 0]).max() < 0.1:
            for f in comp:
                f.material_index = RIM
            counts['rim'] += len(comp)
            break

# --- body panels by UV island ----------------------------------------------
black_faces = [f for f in bm.faces if f.material_index == black]
hits = [0] * len(PAINT_ISLANDS)
for comp in islands(black_faces, same_uv=True):
    c, a = centre_area(comp)
    for i, (px, py, pz, pa) in enumerate(PAINT_ISLANDS):
        if abs(abs(c.x) - px) < 0.008 and abs(c.y - py) < 0.008 and abs(c.z - pz) < 0.008 and abs(a - pa) < pa * 0.15 + 2e-4:
            for f in comp:
                f.material_index = PAINT
            counts['paint'] += len(comp)
            hits[i] += 1
            break
# Each panel on the centre line is one island; each flank panel is a pair.
want = [1 if p[0] < 0.01 else 2 for p in PAINT_ISLANDS]
if hits != want:
    raise SystemExit('[prep] paint islands matched %s, expected %s' % (hits, want))

# --- front fender: the faces the atlas paints red ----------------------------
img = bpy.data.images.load(TEX)
W, H = img.size
px = np.empty(W * H * 4, dtype=np.float32)
img.pixels.foreach_get(px)
px = px.reshape(H, W, 4)[..., :3]
for f in bm.faces:
    if f.material_index != black:
        continue
    uv = np.array([l[uvl].uv[:] for l in f.loops]).mean(axis=0)
    r, g, b = px[int((uv[1] % 1) * (H - 1)), int((uv[0] % 1) * (W - 1))]
    if r > 0.25 and g < 0.08 and b < 0.08:
        f.material_index = PAINT
        counts['fender'] += 1
bpy.data.images.remove(img)

# --- rear lamps: the tail lamp in the middle, indicators out on the stalks ---
for f in bm.faces:
    if f.material_index != lamps:
        continue
    if abs(f.calc_center_median().x) < 0.15:
        f.material_index = TAIL
        counts['tail'] += 1
    else:
        f.material_index = IND
        counts['indicator'] += 1

bm.to_mesh(me)
bm.free()
me.update()
print('[prep] faces re-materialled:', counts)

os.makedirs(os.path.dirname(OUT), exist_ok=True)
bpy.ops.wm.save_as_mainfile(filepath=OUT, compress=True)
print('[prep] saved', OUT)
