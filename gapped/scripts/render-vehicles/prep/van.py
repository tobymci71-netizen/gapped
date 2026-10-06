"""
Prep for the van (Comrade1280 "Generic civil service vehicles pack", CC BY 4.0):
the pack's postal van, a full-size panel van, re-materialled so no postal
livery survives.

The pack is one FBX of ten vehicles. The postal van ('postvan') is one mesh
with four materials:

  postvan         one atlas (postvan_albedo.png) painted over the whole van:
                  blue body, a yellow livery stripe, white bumpers / grille
                  surround / steel wheels / mirror glass, black trim, tyres,
                  and the cab interior
  optics_tex.007  the pack's shared lamp atlas (CSPOptics.jpg): every lamp
                  lens picks a patch of it (red, amber or clear)
  postvan_glass   windscreen and cab windows
  postvan_decal   floating quads carrying the "POSTAL SERVICE" lettering

The FBX points at texture paths that do not exist, so the atlases are read
from the pack's textures/ folder here and every face is given a material by
what its atlas paints there (the bake gives each material one role):

  body atlas, blue or yellow   -> 'paint'        (the stripe becomes paint: the
                                                   livery is gone)
  body atlas, black/grey/white -> 'black trim'   (bumpers, grille, sills, arches,
                                                   rub strips, the cab interior)
  wheel loose parts, dark      -> 'tyre'
  wheel loose parts, light     -> 'rim'          (the white steel wheels)
  white on the mirror heads    -> 'mirror glass' (chrome)
  lamp atlas, red, at the rear -> 'tail light'   (the red section of the rear
                                                   lamp units: the only glow)
  lamp atlas, clear, in front  -> 'headlight'    (unlit)
  lamp atlas, amber, reversing
  and red side markers         -> 'indicator'    (unlit, dark)
  lamp atlas, black bezel      -> 'black trim'
  glass                        -> 'glass'

The lettering quads ('postvan_decal') are deleted here rather than by the
spec's 'hide' role, which in bake.py swaps their material for glass before it
looks for them, so they would render as black glass panels.

The cab's side windows lean in about 15 degrees and, square on, mirror the
rig's camera-side card as a white sheet; their shading normals are stood up
to 4 degrees so they mirror the dark night like the rest of the glass.

The other nine vehicles are deleted, the van is put at the origin with its
own axes (nose toward -Y, millimetres scaled to metres), and the result is
saved to art-source/vehicles/van/model.blend.

    scripts/render-vehicles/slot.sh ~/Applications/Blender.app/Contents/MacOS/Blender -b \
        -P scripts/render-vehicles/prep/van.py
"""

import colorsys
import os

import bmesh
import bpy
import mathutils
import numpy as np

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))
PACK = os.path.join(ROOT, 'art-source/vehicles/_downloads/generic-civil-service-vehicles-pack')
SRC = os.path.join(PACK, 'source/scene.fbx')
TEX = os.path.join(PACK, 'textures')
OUT = os.path.join(ROOT, 'art-source/vehicles/van/model.blend')

bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.fbx(filepath=SRC, use_custom_normals=True)

# --- only the van, at the origin, on its own axes ---------------------------
van = bpy.data.objects['postvan']
for o in list(bpy.data.objects):
    if o is not van:
        bpy.data.objects.remove(o, do_unlink=True)
van.parent = None
van.matrix_world = mathutils.Matrix.Diagonal((0.001, 0.001, 0.001, 1.0))  # mm -> m
me = van.data
uv = me.uv_layers[0].data


def load(name):
    im = bpy.data.images.load(os.path.join(TEX, name))
    w, h = im.size
    px = np.empty(w * h * 4, np.float32)
    im.pixels.foreach_get(px)
    return px.reshape(h, w, 4)[..., :3]


ALBEDO = load('postvan_albedo.png')
OPTICS = load('CSPOptics.jpg')


def sample(img, u, v):
    h, w = img.shape[:2]
    return img[int(np.clip(v % 1.0 * h, 0, h - 1)), int(np.clip(u % 1.0 * w, 0, w - 1))]


def face_colours(img, p):
    """The atlas under a face: its UV centre and points 70% of the way out
    to each corner (one sample can land on a seam)."""
    uvs = np.array([uv[li].uv[:] for li in p.loop_indices])
    c = uvs.mean(axis=0)
    return [sample(img, *q) for q in [c] + [c + (u - c) * 0.7 for u in uvs]]


def colour_class(rgb):
    h, s, v = colorsys.rgb_to_hsv(*rgb)
    if s > 0.4 and v > 0.2:
        if 0.5 < h < 0.75:
            return 'blue'
        if 0.11 < h < 0.2:
            return 'yellow'
        if 0.03 < h <= 0.11:
            return 'amber'
        if h <= 0.03 or h > 0.9:
            return 'red'
        return 'other'
    if v < 0.18:
        return 'black'
    if v < 0.5:
        return 'grey'
    return 'white'


def majority(cols):
    cl = [colour_class(c) for c in cols]
    return max(set(cl), key=cl.count)


# --- loose parts: the wheels -------------------------------------------------
# A wheel is a loose part low down, outboard, about as tall as it is long.
bm = bmesh.new()
bm.from_mesh(me)
bm.faces.ensure_lookup_table()
seen = set()
part_of = {}
parts = []
for f in bm.faces:
    if f.index in seen:
        continue
    stack, group = [f], []
    seen.add(f.index)
    while stack:
        g = stack.pop()
        group.append(g.index)
        for e in g.edges:
            for h in e.link_faces:
                if h.index not in seen:
                    seen.add(h.index)
                    stack.append(h)
    for i in group:
        part_of[i] = len(parts)
    parts.append(group)
bm.free()

co = np.array([v.co[:] for v in me.vertices]) / 1000.0
wheel_parts = set()
for pi, group in enumerate(parts):
    vs = np.unique(np.concatenate([np.array(me.polygons[i].vertices[:]) for i in group]))
    lo, hi = co[vs].min(axis=0), co[vs].max(axis=0)
    size = hi - lo
    mid = (lo + hi) / 2
    if hi[2] < 0.85 and abs(mid[0]) > 0.55 and size[1] > 0.25 and abs(size[1] - size[2]) < 0.12 * max(size[1], size[2]):
        wheel_parts.add(pi)
print('[prep van] %d loose parts, %d wheel parts' % (len(parts), len(wheel_parts)))
for pi in sorted(wheel_parts):
    vs = np.unique(np.concatenate([np.array(me.polygons[i].vertices[:]) for i in parts[pi]]))
    print('[prep van]   wheel part %d: %d faces, centre %s' % (pi, len(parts[pi]), np.round((co[vs].min(0) + co[vs].max(0)) / 2, 2)))

# --- materials ----------------------------------------------------------------


def new_mat(name, rgb):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    m.node_tree.nodes['Principled BSDF'].inputs['Base Color'].default_value = (*rgb, 1.0)
    return m


MATS = {
    'paint': new_mat('paint', (0.02, 0.2, 0.22)),
    'trim': new_mat('black trim', (0.02, 0.02, 0.02)),
    'tyre': new_mat('tyre', (0.01, 0.01, 0.01)),
    'rim': new_mat('rim', (0.5, 0.5, 0.5)),
    'mirror': new_mat('mirror glass', (0.7, 0.7, 0.7)),
    'glass': new_mat('glass', (0.0, 0.0, 0.0)),
    'tail': new_mat('tail light', (0.6, 0.0, 0.0)),
    'indicator': new_mat('indicator', (0.6, 0.3, 0.0)),
    'head': new_mat('headlight', (0.8, 0.8, 0.8)),
    'decal': new_mat('decal', (1.0, 1.0, 1.0)),
}
order = list(MATS)
src_names = [s.material.name for s in van.material_slots]
src_index = [p.material_index for p in me.polygons]  # clear() resets them
me.materials.clear()
for k in order:
    me.materials.append(MATS[k])

def lens_class(rgb):
    """What a lamp face shows of the lamp atlas. Lenses are often a deep,
    dark red, so red goes by hue, not brightness."""
    h, s, v = colorsys.rgb_to_hsv(*rgb)
    if v < 0.06:
        return 'black'  # the bezel between lenses
    if s > 0.5 and (h < 0.03 or h > 0.9):
        return 'red'
    if s > 0.5 and h < 0.2:
        return 'amber'
    return 'clear'


counts = {}
for p in me.polygons:
    src = src_names[src_index[p.index]]
    c = np.array(p.center[:]) / 1000.0
    rear = c[1] > 2.0
    if src == 'postvan_glass':
        role = 'glass'
    elif src == 'postvan_decal':
        role = 'decal'
    elif src.startswith('optics'):
        cl = [lens_class(x) for x in face_colours(OPTICS, p)]
        cl = max(set(cl), key=cl.count)
        if cl == 'black':
            role = 'trim'
        elif cl == 'red' and rear:
            role = 'tail'  # the red section of the rear lamp units
        elif cl == 'clear' and not rear:
            role = 'head'
        else:
            role = 'indicator'  # amber, reversing and side-marker lenses: unlit
    else:
        cols = face_colours(ALBEDO, p)
        cl = majority(cols)
        if part_of[p.index] in wheel_parts:
            role = 'rim' if cl in ('white', 'grey') else 'tyre'
        elif cl in ('blue', 'yellow', 'amber', 'other'):
            role = 'paint'
        elif cl == 'white' and abs(c[0]) > 1.0:
            role = 'mirror'
        else:
            role = 'trim'
    p.material_index = order.index(role)
    counts[role] = counts.get(role, 0) + 1
print('[prep van] faces per role:', counts)

# Where the lamps are, to check the tail lights sit on the rear lamp units.
for role in ('tail', 'indicator', 'head'):
    cs = np.array([np.array(p.center[:]) / 1000.0 for p in me.polygons if p.material_index == order.index(role)])
    if len(cs):
        print('[prep van] %-9s x[%.2f, %.2f] y[%.2f, %.2f] z[%.2f, %.2f]' % (
            role, cs[:, 0].min(), cs[:, 0].max(), cs[:, 1].min(), cs[:, 1].max(), cs[:, 2].min(), cs[:, 2].max()))

# The lettering quads go here: the bake's 'hide' role does not delete them
# (it swaps their material for glass before it looks for them), and a black
# glass panel where the lettering was is still a decal.
bm = bmesh.new()
bm.from_mesh(me)
decal = order.index('decal')
bmesh.ops.delete(bm, geom=[f for f in bm.faces if f.material_index == decal], context='FACES')
bm.to_mesh(me)
bm.free()
me.update()
print('[prep van] decal faces left:', sum(1 for p in me.polygons if p.material_index == decal))

# The cab's side windows lean in about 15 degrees, so square on they mirror
# the rig's camera-side card as a big white sheet (it reads as a white
# interior). Their shading normals are stood up to 4 degrees: they then
# mirror the dark night just above the horizon, like the rest of the glass.
glass = order.index('glass')
corner = [cn.vector.copy() for cn in me.corner_normals]
tilt = np.radians(4.0)
side = 0
for p in me.polygons:
    if p.material_index == glass and abs(p.normal.x) > 0.8:
        side += 1
        n = mathutils.Vector((np.sign(p.normal.x) * np.cos(tilt), 0.0, np.sin(tilt)))
        for li in p.loop_indices:
            corner[li] = n
me.normals_split_custom_set([tuple(v) for v in corner])
me.update()
print('[prep van] side-window faces re-normalled:', side)

# Drop the source materials and images so the .blend carries no livery.
for m in list(bpy.data.materials):
    if m.users == 0:
        bpy.data.materials.remove(m)
for im in list(bpy.data.images):
    bpy.data.images.remove(im)

os.makedirs(os.path.dirname(OUT), exist_ok=True)
bpy.ops.wm.save_as_mainfile(filepath=OUT)
print('[prep van] saved', OUT)
