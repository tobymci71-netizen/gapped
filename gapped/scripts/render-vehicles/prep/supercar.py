"""
Prep for the supercar (ollitei "Fictional supercar - V12 Goblin", CC BY 4.0).

The source is a black car whose whole body shell (paint, carbon trim, light
units, number plate, badges) shares one texture atlas ('car_body'). The bake
gives each material one role, so this splits it by what each face really is:

  paint        the body panels: exactly the faces the model's own 'clearcoat'
               shell (a copy of the painted panels, 1 mm proud) lies on
  tail light   the red strip and the amber segment inside the two rear light
               units (atlas light panel, rear corners, above the vents)
  headlight    the LED rows and projectors inside the two front light units
  reverse      the two pale reverse-light pods either side of the plate (never lit)
  plate        the number plate and its frame (text gone: it becomes trim)
  metal        the light-grey bits (bezels, filler cap, hood latches)
  trim         everything else: carbon, grilles, vents, diffuser, underside
  (deleted)    the brand logo front and rear and the 'V12' badges on the flanks,
               which are raised geometry floating on the paint

The light covers live in 'car_glass', and the glass role is opaque (the model
has no interior), so they would hide the lamps: the two rear lamp lenses (the
slanted lamps above the rear vents, wrapping onto the flanks) become 'tail
light', so the whole lamp glows as it does at night; the headlamp covers are
deleted, which shows the (never lit) headlamp parts under them.

It also removes the clearcoat shell (once used) and the shadow card, and turns
the car upright: the FBX root is rolled 180 degrees, so the car arrives upside
down under its ground card.

Wheels: the atlas faces of the wheels become 'rim', the red brake calipers
'brake caliper' (metal). The nose points -Y.

Saves art-source/vehicles/supercar/model.blend.

    scripts/render-vehicles/slot.sh ~/Applications/Blender.app/Contents/MacOS/Blender -b \
        -P scripts/render-vehicles/prep/supercar.py
"""

import os

import bmesh
import bpy
import numpy as np
from mathutils.kdtree import KDTree

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))
DL = os.path.join(ROOT, 'art-source/vehicles/_downloads/fictional-supercar-v12-goblin')
SRC = os.path.join(DL, 'source/f50d71ecc6fa49d28d9b1fd980c106b6.fbx.fbx')
ALBEDO = os.path.join(DL, 'textures/Goblin2017_albedo.png')
OUT = os.path.join(ROOT, 'art-source/vehicles/supercar/model.blend')

bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.fbx(filepath=SRC, use_custom_normals=True)
scene = bpy.context.scene

# --- upright -----------------------------------------------------------------
# The root empty is rolled 180 degrees about Y: undo it (a rotation, not a
# mirror), so the wheels sit on z=0 and the roof is up.
root = bpy.data.objects['bone_car']
root.rotation_euler = (0.0, 0.0, 0.0)
bpy.context.view_layer.update()

for name in ('car_shadow',):
    o = bpy.data.objects.get(name)
    if o:
        bpy.data.objects.remove(o, do_unlink=True)

# --- the atlas ---------------------------------------------------------------
img = bpy.data.images.load(ALBEDO, check_existing=False)
W, H = img.size
px = np.empty(W * H * 4, dtype=np.float32)
img.pixels.foreach_get(px)
px = px.reshape(H, W, 4)[..., :3]


def uv_centre(o, p):
    uv = o.data.uv_layers[0].data
    return np.array([uv[li].uv[:] for li in p.loop_indices]).mean(axis=0)


def sample(u):
    return px[int((u[1] % 1.0) * (H - 1)), int((u[0] % 1.0) * (W - 1))]


def in_rect(u, rect):
    return rect[0] <= u[0] <= rect[1] and rect[2] <= u[1] <= rect[3]


# Atlas regions (u0, u1, v0, v1), v up as Blender stores it.
LIGHT_PANEL = (0.598, 0.833, 0.597, 0.736)  # both light units' textures
LOGO = (0.185, 0.201, 0.499, 0.521)         # the red square every badge samples
PLATE = (0.150, 0.228, 0.145, 0.240)        # number plate and frame


def new_mat(name, rgb):
    m = bpy.data.materials.get(name) or bpy.data.materials.new(name)
    m.use_nodes = True
    m.node_tree.nodes['Principled BSDF'].inputs['Base Color'].default_value = (*rgb, 1.0)
    return m


MATS = {k: new_mat(k, c) for k, c in (
    ('paint', (0.05, 0.05, 0.05)),
    ('trim', (0.01, 0.01, 0.01)),
    ('tail light', (0.6, 0.02, 0.02)),
    ('headlight', (0.6, 0.6, 0.6)),
    ('reverse light', (0.5, 0.5, 0.5)),
    ('plate', (0.02, 0.02, 0.02)),
    ('metal', (0.3, 0.3, 0.3)),
    ('glass', (0.02, 0.02, 0.03)),
    ('tire', (0.02, 0.02, 0.02)),
    ('rim', (0.4, 0.4, 0.4)),
    ('brake caliper', (0.3, 0.3, 0.3)),
    ('logo', (0.5, 0.0, 0.0)),
)}


def reassign(o, pick):
    """Replace an object's materials with role materials, face by face.
    pick(o, polygon, old_material_name) -> role material key."""
    old = [s.material.name if s.material else None for s in o.material_slots]
    keys = [pick(o, p, old[p.material_index] if p.material_index < len(old) else None) for p in o.data.polygons]
    order = sorted(set(keys))
    o.data.materials.clear()
    for k in order:
        o.data.materials.append(MATS[k])
    idx = {k: i for i, k in enumerate(order)}
    for p, k in zip(o.data.polygons, keys):
        p.material_index = idx[k]
    counts = {k: keys.count(k) for k in order}
    print('[prep] %-16s %s' % (o.name, counts))


# --- body: paint is what the clearcoat shell covers ------------------------
body = bpy.data.objects['car_body']
coat = bpy.data.objects['clearcoat']
bmw = body.matrix_world
kd = KDTree(len(body.data.polygons))
for p in body.data.polygons:
    kd.insert(bmw @ p.center, p.index)
kd.balance()
painted = set()
for p in coat.data.polygons:
    _, i, d = kd.find(coat.matrix_world @ p.center)
    if d < 0.002:
        painted.add(i)
print('[prep] clearcoat covers %d of %d body faces' % (len(painted), len(body.data.polygons)))


def body_role(o, p, old):
    if p.index in painted:
        return 'paint'
    u = uv_centre(o, p)
    c = bmw @ p.center
    if in_rect(u, LOGO):
        return 'logo'
    if in_rect(u, PLATE):
        return 'plate'
    if in_rect(u, LIGHT_PANEL):
        if c.y > 1.9 and c.z > 0.6 and abs(c.x) > 0.3:
            return 'tail light'
        if c.y < -1.9:
            return 'headlight'
        return 'trim'
    s = sample(u)
    if s.max() > 0.35 and s.max() - s.min() < 0.15:
        # The pale pods either side of the plate are the reverse lights.
        if c.y > 1.8 and abs(c.x) < 0.5 and c.z < 0.9:
            return 'reverse light'
        return 'metal'
    return 'trim'


reassign(body, body_role)
bpy.data.objects.remove(coat, do_unlink=True)

# --- wheels and brakes ------------------------------------------------------
for o in list(scene.objects):
    if o.type != 'MESH':
        continue
    if o.name.startswith('car_wheel'):
        reassign(o, lambda o, p, old: 'tire' if old == 'car_tire' else 'rim')
    elif o.name.startswith('car_brake'):
        reassign(o, lambda o, p, old: 'brake caliper')

# --- glass: windows stay, rear lamp lenses light, headlamp covers go ---------
glass = bpy.data.objects['car_glass']
gmw = glass.matrix_world


def glass_role(o, p, old):
    c = gmw @ p.center
    if c.y > 1.9:
        return 'tail light'  # the rear lamp lenses: the whole lamp glows
    if c.y < -1.9:
        return 'logo'  # headlamp covers: deleted below with the badges
    return 'glass'


reassign(glass, glass_role)

# --- delete badges and light covers ----------------------------------------
for o in (body, glass):
    names = [s.material.name if s.material else None for s in o.material_slots]
    if 'logo' not in names:
        continue
    li = names.index('logo')
    bm = bmesh.new()
    bm.from_mesh(o.data)
    gone = [f for f in bm.faces if f.material_index == li]
    bmesh.ops.delete(bm, geom=gone, context='FACES')
    bm.to_mesh(o.data)
    bm.free()
    print('[prep] %s: deleted %d badge / cover faces' % (o.name, len(gone)))

# --- flatten: world-space meshes, no rig, no empties -------------------------
bpy.ops.object.select_all(action='DESELECT')
for o in scene.objects:
    o.hide_set(False)
    o.select_set(True)
meshes = [o for o in scene.objects if o.type == 'MESH']
bpy.context.view_layer.objects.active = meshes[0]
bpy.ops.object.parent_clear(type='CLEAR_KEEP_TRANSFORM')
for o in list(scene.objects):
    if o.type != 'MESH':
        bpy.data.objects.remove(o, do_unlink=True)
for m in list(bpy.data.materials):
    if m.users == 0:
        bpy.data.materials.remove(m)
for im in list(bpy.data.images):
    if im.users == 0:
        bpy.data.images.remove(im)

os.makedirs(os.path.dirname(OUT), exist_ok=True)
bpy.ops.wm.save_as_mainfile(filepath=OUT, compress=True)
print('[prep] saved', OUT)
