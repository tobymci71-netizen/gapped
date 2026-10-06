"""
Prep the suv model: the "SUV" of Comrade1280's generic passenger car pack.

The pack ships every car as one mesh with four atlas materials (Body, Optics,
Glass, Wheel), so bake.py's name rules cannot see the parts: the body atlas
also holds the black plastic cladding, roof rails, mirrors, the cabin and
the chrome (a bar grille and a tailgate bar, the model's GM-like cues), the
optics atlas holds every lamp, and the wheel atlas holds both tyre and rim.
This script splits those faces into materials named for their roles by
sampling the pack's own metallic and glossiness maps at each face: paint,
black plastic (the chrome too, so no brand's grille or bar survives), glass,
tyre and rim. The optics become tail lights (the red segments of the two
vertical lamp units at the rear corners) and unlit lenses (everything else:
head lamps, the reverse segments, the bumper reflectors).

The side windows get their own glass ("side glass", role keep in the spec):
bake.py's glass shader exactly, with the shading normal tipped a little up.
Their glass is nearly upright, so with the stock normal the side camera saw
the rig's white card (high on the camera side) mirrored in the front door
window as a white slab; tipped up, they mirror the dark sky above it.

  Blender -b -P scripts/render-vehicles/prep/suv.py

Writes art-source/vehicles/suv/model.blend: the SUV body and its four wheels,
nose to +X, centred, wheels on z = 0, at the pack's own scale (bake.py scales
it to lengthM).
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
TEX = os.path.join(PACK, 'textures')
OUT = os.path.join(ROOT, 'art-source/vehicles/suv/model.blend')

BODY = 'SUV Body'
# The SUV's own wheels (the pack lays every car out around the origin; these
# four sit under the SUV body, the Offroad's are named Wheel_G).
WHEELS = ['Wheel_E.001', 'Wheel_E001.001', 'Wheel_E002.001', 'Wheel_E003.001']

bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.fbx(filepath=SRC, use_custom_normals=True)
scene = bpy.context.scene

body = scene.objects[BODY]
# The pack has the SUV turned about Z; its nose is local -Y (the windscreen
# and bonnet sit at -Y, the tailgate and the red lamps at +Y).
heading = body.rotation_euler.z - math.pi / 2

keep = [scene.objects[n] for n in [BODY] + WHEELS]
for o in list(scene.objects):
    if o not in keep:
        bpy.data.objects.remove(o, do_unlink=True)
bpy.ops.object.select_all(action='DESELECT')
for o in keep:
    o.select_set(True)
bpy.context.view_layer.objects.active = body
bpy.ops.object.parent_clear(type='CLEAR_KEEP_TRANSFORM')
for o in keep:
    if o.data.users > 1:
        o.data = o.data.copy()
bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)

# Nose to +X, centred, wheels on the ground.
rot = mathutils.Matrix.Rotation(-heading, 4, 'Z')
for o in keep:
    o.data.transform(rot)
co = np.concatenate([np.array([v.co[:] for v in o.data.vertices]) for o in keep])
lo, hi = co.min(axis=0), co.max(axis=0)
shift = mathutils.Matrix.Translation((-(lo[0] + hi[0]) / 2, -(lo[1] + hi[1]) / 2, -lo[2]))
for o in keep:
    o.data.transform(shift)
    o.data.update()
co = np.concatenate([np.array([v.co[:] for v in o.data.vertices]) for o in keep])
lo, hi = co.min(axis=0), co.max(axis=0)
print('[prep] suv size %.3f x %.3f x %.3f' % tuple(hi - lo))


def load(name):
    img = bpy.data.images.load(os.path.join(TEX, name), check_existing=True)
    img.colorspace_settings.name = 'Non-Color'
    w, h = img.size
    px = np.empty(w * h * 4, dtype=np.float32)
    img.pixels.foreach_get(px)
    return px.reshape(h, w, 4)[..., 0]


def sampler(img):
    h, w = img.shape

    def at(u, v):
        return float(img[int(np.clip(v % 1.0, 0, 0.9999) * h), int(np.clip(u % 1.0, 0, 0.9999) * w)])
    return at


def face_uvs(me, p):
    uv = me.uv_layers.active.data
    pts = np.array([uv[i].uv[:] for i in p.loop_indices])
    c = pts.mean(axis=0)
    # The centre and each corner pulled well in, so faces on an island's
    # edge do not read the neighbouring island.
    return [c] + [c + (q - c) * 0.6 for q in pts]


def majority(labels):
    return max(set(labels), key=labels.count)


def material(name, rgb):
    m = bpy.data.materials.get(name) or bpy.data.materials.new(name)
    m.use_nodes = True
    m.diffuse_color = (*rgb, 1.0)
    m.node_tree.nodes['Principled BSDF'].inputs['Base Color'].default_value = (*rgb, 1.0)
    return m


# Materials named for their roles: bake.py's name rules map every one of these
# except "lamp lens" (emissive_off) and "side glass" (keep), which the spec maps.
MATS = {
    'paint': material('paint', (0.5, 0.5, 0.5)),
    'trim': material('black plastic', (0.02, 0.02, 0.02)),
    'glass': material('glass', (0.0, 0.0, 0.0)),
    'side glass': material('side glass', (0.0, 0.0, 0.0)),
    'tail': material('tail light', (0.8, 0.0, 0.0)),
    'lens': material('lamp lens', (0.2, 0.2, 0.2)),
    'tyre': material('tyre', (0.01, 0.01, 0.01)),
    'rim': material('rim', (0.6, 0.6, 0.6)),
}


def lin(hexstr):
    h = hexstr.lstrip('#')
    out = []
    for i in (0, 2, 4):
        c = int(h[i:i + 2], 16) / 255.0
        out.append(c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4)
    return (*out, 1.0)


def side_glass(m, lift=0.22):
    """bake.py's glass (#070A10, roughness 0.03, full coat), its shading
    normal tipped up by `lift`, so what it mirrors from the camera side is
    the dark sky above the rig's card instead of the card itself."""
    nt = m.node_tree
    b = nt.nodes['Principled BSDF']
    b.inputs['Base Color'].default_value = lin('#070A10')
    b.inputs['Metallic'].default_value = 0.0
    b.inputs['Roughness'].default_value = 0.03
    b.inputs['Coat Weight'].default_value = 1.0
    b.inputs['Coat Roughness'].default_value = 0.03
    geo = nt.nodes.new('ShaderNodeNewGeometry')
    add = nt.nodes.new('ShaderNodeVectorMath')
    add.operation = 'ADD'
    add.inputs[1].default_value = (0.0, 0.0, lift)
    unit = nt.nodes.new('ShaderNodeVectorMath')
    unit.operation = 'NORMALIZE'
    nt.links.new(geo.outputs['Normal'], add.inputs[0])
    nt.links.new(add.outputs['Vector'], unit.inputs[0])
    nt.links.new(unit.outputs['Vector'], b.inputs['Normal'])
    nt.links.new(unit.outputs['Vector'], b.inputs['Coat Normal'])


side_glass(MATS['side glass'])


def reassign(o, classify):
    """classify(poly) -> key in MATS, or None to leave the face alone."""
    me = o.data
    keys = []
    for p in me.polygons:
        keys.append(classify(p))
    slots = {}
    for k in sorted(set(k for k in keys if k)):
        me.materials.append(MATS[k])
        slots[k] = len(me.materials) - 1
    for p, k in zip(me.polygons, keys):
        if k:
            p.material_index = slots[k]
    counts = {}
    for p, k in zip(me.polygons, keys):
        c = counts.setdefault(k, [0, 0.0])
        c[0] += 1
        c[1] += p.area
    print('[prep] %s: %s' % (o.name, ', '.join('%s=%d faces/%.3fm2' % (k, n, a) for k, (n, a) in sorted(counts.items(), key=lambda kv: str(kv[0])))))


# --- body: the SUV atlas's metallic and glossiness maps mark its regions.
met = sampler(load('SUV_Metallic.png'))
gloss = sampler(load('SUV_Glossiness.png'))


def body_region(u, v):
    m, g = met(u, v), gloss(u, v)
    if m < 0.1 and g > 0.8:
        return 'paint'
    if g > 0.95 and 0.1 < m < 0.3:
        return 'glass'      # glass painted into the atlas behind the windows
    # Black plastic (0.37 / 0.27: arches, rails, mirrors, mouldings), and
    # the chrome (1 / 1: the bar grille, the tailgate bar, lamp bezels), the
    # model's strongest brand cue, made dark trim too. The atlas corner
    # (1 / 0) holds the cabin and the underside, also trim.
    return 'trim'


body_mats = [m.name for m in body.data.materials]
red_lens = []


def lens_colour(p):
    cols = [lpx[int(np.clip(v % 1, 0, 0.9999) * lh), int(np.clip(u % 1, 0, 0.9999) * lw), :3]
            for u, v in face_uvs(body.data, p)]
    return np.mean(cols, axis=0)


def classify_body(p):
    name = body_mats[p.material_index] if p.material_index < len(body_mats) else ''
    c = p.center
    if name.startswith('Body'):
        return majority([body_region(u, v) for u, v in face_uvs(body.data, p)])
    if name.startswith('Glass'):
        # Side windows (nearly upright, facing out sideways) get side glass.
        return 'side glass' if abs(p.normal.y) > 0.6 else 'glass'
    if name.startswith('Optics'):
        # Tail lights: the red segments of the two vertical lamp units at the
        # rear corners. Their middle (reverse) segment, the red reflectors
        # low in the bumper and every front lamp are unlit lenses.
        col = lens_colour(p)
        red = col[0] > 0.12 and col[0] > 1.8 * max(col[1], col[2])
        if c.x < 0 and c.z > 0.7 and red:
            red_lens.append((c.y, c.z))
            return 'tail'
        return 'lens'
    return None


lights_img = bpy.data.images.load(os.path.join(TEX, 'lights.jpg'), check_existing=True)
lw, lh = lights_img.size
lpx = np.empty(lw * lh * 4, dtype=np.float32)
lights_img.pixels.foreach_get(lpx)
lpx = lpx.reshape(lh, lw, 4)

reassign(body, classify_body)
ys = np.array(red_lens)
print('[prep] tail light faces: %d left, %d right, z %.2f..%.2f m' % (
    (ys[:, 0] > 0).sum(), (ys[:, 0] < 0).sum(), ys[:, 1].min(), ys[:, 1].max()))

# --- wheels: metallic white is the rim (and the brake), grey is the tyre.
wmet = sampler(load('wheel_E_Metallic.png'))
for o in keep[1:]:
    names = [m.name for m in o.data.materials]

    def classify_wheel(p, o=o, names=names):
        name = names[p.material_index] if p.material_index < len(names) else ''
        if not name.startswith('Wheel'):
            return 'rim'
        r = majority(['rim' if wmet(u, v) > 0.75 else 'tyre' for u, v in face_uvs(o.data, p)])
        return r
    reassign(o, classify_wheel)

# Drop the atlas materials no face uses any more, so only role names remain.
for o in keep:
    me = o.data
    used = {p.material_index for p in me.polygons}
    bm = bmesh.new()
    bm.from_mesh(me)
    old = list(me.materials)
    order = [i for i in range(len(old)) if i in used]
    remap = {i: n for n, i in enumerate(order)}
    for f in bm.faces:
        f.material_index = remap[f.material_index]
    bm.to_mesh(me)
    bm.free()
    idx = np.empty(len(me.polygons), dtype=np.int32)
    me.polygons.foreach_get('material_index', idx)
    me.materials.clear()  # resets every face to slot 0
    for i in order:
        me.materials.append(old[i])
    me.polygons.foreach_set('material_index', idx)
    me.update()

for m in list(bpy.data.materials):
    if m.users == 0:
        bpy.data.materials.remove(m)
for img in list(bpy.data.images):
    if img.users == 0:
        bpy.data.images.remove(img)

body.name = 'SUV body'
for i, o in enumerate(keep[1:]):
    o.name = 'SUV wheel %d' % (i + 1)
os.makedirs(os.path.dirname(OUT), exist_ok=True)
bpy.ops.wm.save_as_mainfile(filepath=OUT, compress=True)
if os.path.exists(OUT + '1'):  # Blender's backup of the previous save
    os.remove(OUT + '1')
print('[prep] wrote', OUT)
