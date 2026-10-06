"""
Prep for the coupe (MMC Works "Generic Sport Coupe Car", CC BY 4.0).

The source paints one atlas ('car-body') over the whole shell: red where the
body is painted, dark grey where it is black aero (front bumper frame, hood
vents, side skirts, diffuser), mid grey for the front lip and mirror feet,
light blue-grey inside the headlights. The bake gives each material one role,
so this splits 'car-body' by what the atlas paints on each part:

  red              -> 'car-body'        (paint)
  dark grey        -> 'black-plastic'   (trim)
  mid / light grey -> 'black-plastic'   (trim: lip, mirror feet)
  headlight parts  -> 'headlight-inner' (head, never lit)

It also flattens the hierarchy (rig, empties) into plain world-space meshes.
Nothing is deleted: the model has no emblems, plates, ground or shadow cards as
geometry. Saves art-source/vehicles/coupe/model.blend.

    scripts/render-vehicles/slot.sh ~/Applications/Blender.app/Contents/MacOS/Blender -b \
        -P scripts/render-vehicles/prep/coupe.py
"""

import os

import bpy
import numpy as np

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))
SRC = os.path.join(ROOT, 'art-source/vehicles/_downloads/generic-sport-coupe-car/source/coupe-sport-generic-mmc.fbx')
OUT = os.path.join(ROOT, 'art-source/vehicles/coupe/model.blend')

bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.fbx(filepath=SRC, use_custom_normals=True)
scene = bpy.context.scene

# --- the atlas -------------------------------------------------------------
body_mat = bpy.data.materials['car-body']
tex = next(n for n in body_mat.node_tree.nodes if n.type == 'TEX_IMAGE' and 'Base' in n.image.name)
img = tex.image
W, H = img.size
px = np.empty(W * H * 4, dtype=np.float32)
img.pixels.foreach_get(px)
px = px.reshape(H, W, 4)[..., :3]


def sample(o, p, uv):
    us = np.array([uv.data[li].uv[:] for li in p.loop_indices]).mean(axis=0)
    x = int((us[0] % 1.0) * (W - 1))
    y = int((us[1] % 1.0) * (H - 1))
    return px[y, x]


def is_red(c):
    return c[0] > 0.3 and c[1] < 0.15 and c[2] < 0.15


def new_mat(name, rgb):
    m = bpy.data.materials.get(name) or bpy.data.materials.new(name)
    m.use_nodes = True
    m.node_tree.nodes['Principled BSDF'].inputs['Base Color'].default_value = (*rgb, 1.0)
    return m


black = new_mat('black-plastic', (0.02, 0.02, 0.02))
head_inner = new_mat('headlight-inner', (0.6, 0.62, 0.65))

# Parts of the headlight units: never paint, never trim-black on the lens side.
HEAD_PARTS = ('headlights.', 'headlight-drl.')

for o in list(scene.objects):
    if o.type != 'MESH':
        continue
    names = [s.material.name if s.material else None for s in o.material_slots]
    if 'car-body' not in names:
        continue
    idx = names.index('car-body')
    uv = o.data.uv_layers.active
    faces = [p for p in o.data.polygons if p.material_index == idx]
    red = sum(p.area for p in faces if is_red(sample(o, p, uv)))
    total = sum(p.area for p in faces) or 1.0
    share = red / total
    if o.name.startswith(HEAD_PARTS):
        target = head_inner
    elif share > 0.5:
        target = None  # stays body paint (a few stray dark faces stay paint too)
    else:
        target = black
    print('[prep] %-28s red=%.0f%% -> %s' % (o.name, share * 100, target.name if target else 'car-body'))
    if target is None:
        continue
    o.data.materials.append(target)
    new_idx = len(o.material_slots) - 1
    for p in faces:
        p.material_index = new_idx

# --- flatten: world-space meshes, no rig, no empties -------------------------
bpy.ops.object.select_all(action='DESELECT')
for o in scene.objects:
    o.hide_set(False)
    o.select_set(True)
meshes = [o for o in scene.objects if o.type == 'MESH']
bpy.context.view_layer.objects.active = meshes[0]
bpy.ops.object.convert(target='MESH')  # applies armature/other modifiers
bpy.ops.object.parent_clear(type='CLEAR_KEEP_TRANSFORM')
for o in list(scene.objects):
    if o.type != 'MESH':
        bpy.data.objects.remove(o, do_unlink=True)

os.makedirs(os.path.dirname(OUT), exist_ok=True)
bpy.ops.wm.save_as_mainfile(filepath=OUT, compress=True)
print('[prep] saved', OUT)
