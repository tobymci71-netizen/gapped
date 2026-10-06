"""
Prep for the scooter (Rzyas "Electric Scooter", CC BY 4.0).

The source is one mesh painted from four texture atlases ('01' to '04'), so
the bake, which gives each material one role, cannot tell the body shell from
the seat or the tail light. This splits every face into a material named for
its part, by what the atlases paint under it (base colour and emission,
sampled at a few points inside the face's UVs):

  01  emission red             -> 'tail light'   (the two rear units: the lamp in
                                                  the tail and the strip under
                                                  the seat; a face is lit when
                                                  red covers a quarter of it,
                                                  averaged with its mirror face)
      emission yellow          -> 'head light'   (front lamp and indicators, never lit)
      black                    -> 'body black'   (front apron, floor; the inner
                                                  leg shield is painted, since
                                                  its black edge came out as a
                                                  jagged 'M' from behind)
      dark grey                -> 'seat'
      mid grey, white, yellow  -> 'body paint'   (the shell; the yellow stripe,
                                                  the author's name and the star
                                                  badges are painted in the atlas
                                                  and go with it)
      pale blue                -> 'floor strip'  (the trim along the floorboard)
  02  dark                     -> 'mechanics dark'
      mid / light              -> 'mechanics'    (handlebar, rail, motor, shock)
  03  light                    -> 'brake disc'
      dark                     -> 'fork dark'
  04  dark                     -> 'tyre'
      cream                    -> 'wheel rim'

Every atlas is dropped: the new materials are flat, so no text, stripe or badge
survives. Nothing is deleted: the model has no rider, stand, plate or ground.
Saves art-source/vehicles/scooter/model.blend.

    scripts/render-vehicles/slot.sh ~/Applications/Blender.app/Contents/MacOS/Blender -b \
        -P scripts/render-vehicles/prep/scooter.py
"""

import os

import bpy
import numpy as np

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))
SRC = os.path.join(ROOT, 'art-source/vehicles/_downloads/electric-scooter/source/Sketchfab_2023_07_10_11_29_53.blend')
OUT = os.path.join(ROOT, 'art-source/vehicles/scooter/model.blend')

bpy.ops.wm.open_mainfile(filepath=SRC)
scene = bpy.context.scene
for o in list(scene.objects):
    if o.type != 'MESH':
        bpy.data.objects.remove(o, do_unlink=True)

obj = next(o for o in scene.objects if o.type == 'MESH')
obj.name = 'scooter'
me = obj.data


def atlas(mat, key):
    for n in mat.node_tree.nodes:
        if n.type == 'TEX_IMAGE' and n.image and key in n.image.name:
            im = n.image
            w, h = im.size
            a = np.empty(w * h * 4, dtype=np.float32)
            im.pixels.foreach_get(a)
            return a.reshape(h, w, 4)[..., :3]
    return None


src = {}
for i, slot in enumerate(obj.material_slots):
    m = slot.material
    src[i] = (m.name, atlas(m, 'BaseColor'), atlas(m, 'Emission'))

uv = me.uv_layers.active.data


def look(img, u):
    h, w = img.shape[:2]
    x = int((u[0] % 1.0) * (w - 1))
    y = int((u[1] % 1.0) * (h - 1))
    return img[y, x]


def samples(p):
    us = np.array([uv[li].uv[:] for li in p.loop_indices])
    c = us.mean(axis=0)
    return [c] + [c * 0.4 + u * 0.6 for u in us]


def lum(c):
    return float(0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2])


def classify(p):
    name, base, emis = src[p.material_index]
    pts = samples(p)
    cols = np.array([look(base, u) for u in pts])
    c = np.median(cols, axis=0)
    L = lum(c)
    if name == '01':
        em = np.array([look(emis, u) for u in pts]) if emis is not None else np.zeros_like(cols)
        red = np.mean((em[:, 0] > 0.4) & (em[:, 1] < 0.25))
        amber = np.mean((em[:, 0] > 0.4) & (em[:, 1] >= 0.25))
        if p.index in TAIL:
            return 'tail light'
        if red >= 0.5:
            return 'body black'  # red spill past the unit's edge, on one side only
        if amber >= 0.5:
            return 'head light'
        if c[0] - c[2] > 0.2 and c[0] > 0.4:
            return 'body paint'  # the yellow stripe, name and badges
        if c[2] - c[0] > 0.03 and L > 0.45:
            return 'floor strip'
        if L < 0.19:
            return 'body black'
        if L < 0.31:
            return 'seat'
        return 'body paint'
    if name == '02':
        return 'mechanics dark' if L < 0.3 else 'mechanics'
    if name == '03':
        return 'brake disc' if L >= 0.45 else 'fork dark'
    if name == '04':
        return 'tyre' if L < 0.45 else 'wheel rim'
    return 'mechanics dark'


PARTS = ['body paint', 'body black', 'seat', 'tail light', 'head light', 'floor strip',
         'mechanics', 'mechanics dark', 'brake disc', 'fork dark', 'tyre', 'wheel rim']
GREY = {
    'body paint': (0.6, 0.6, 0.6), 'body black': (0.01, 0.01, 0.01), 'seat': (0.02, 0.02, 0.02),
    'tail light': (0.4, 0.0, 0.0), 'head light': (0.6, 0.6, 0.6), 'floor strip': (0.3, 0.3, 0.35),
    'mechanics': (0.2, 0.2, 0.2), 'mechanics dark': (0.03, 0.03, 0.03), 'brake disc': (0.4, 0.4, 0.4),
    'fork dark': (0.03, 0.03, 0.03), 'tyre': (0.01, 0.01, 0.01), 'wheel rim': (0.4, 0.4, 0.4),
}

# The tail lights. The atlas paints them as thin red strips that cross rows
# of faces, so a face is a tail light when the red covers a quarter of it,
# measured densely and averaged with its mirror face so both sides match:
# the two rear units come out as clean, symmetric bars.


def coverage(p, img, test):
    us = [np.array(uv[li].uv[:]) for li in p.loop_indices]
    tot = hit = 0
    for k in range(1, len(us) - 1):
        a, b, c = us[0], us[k], us[k + 1]
        for i in range(6):
            for j in range(6 - i):
                w1, w2 = (i + 0.33) / 6.5, (j + 0.33) / 6.5
                tot += 1
                hit += bool(test(look(img, a * (1 - w1 - w2) + b * w1 + c * w2)))
    return hit / max(tot, 1)


from mathutils import kdtree  # noqa: E402

idx01 = next(i for i, v in src.items() if v[0] == '01')
emis01 = src[idx01][2]
red_cov = {}
for p in me.polygons:
    if p.material_index == idx01 and p.center.y > 0.6:
        red_cov[p.index] = coverage(p, emis01, lambda e: e[0] > 0.4 and e[1] < 0.25)
kd = kdtree.KDTree(len(me.polygons))
for p in me.polygons:
    kd.insert(p.center, p.index)
kd.balance()
TAIL = set()
for i, f in red_cov.items():
    c = me.polygons[i].center
    co, j, d = kd.find((-c.x, c.y, c.z))
    mirror = red_cov.get(j, 0.0) if d < 0.01 else 0.0
    if (f + mirror) / 2 >= 0.25:
        TAIL.add(i)

labels = [classify(p) for p in me.polygons]

# The inner leg shield (the face of the front body toward the seat) is black
# under a painted band in the atlas, and the boundary is an arc across a few
# big faces, so face by face it comes out as a jagged 'M' that reads like a
# letter from behind. The whole inner shield takes the paint instead; the
# floorboard below it stays black.


def in_shield(c, n):
    return n.y > 0.3 and -0.5 < c.y < -0.25 and 0.55 < c.z < 1.16 and abs(c.x) < 0.3


for i, p in enumerate(me.polygons):
    if labels[i] == 'body black' and in_shield(p.center, p.normal):
        labels[i] = 'body paint'

old = [s.material for s in obj.material_slots]
obj.data.materials.clear()
index = {}
for part in PARTS:
    m = bpy.data.materials.new(part)
    m.use_nodes = True
    m.node_tree.nodes['Principled BSDF'].inputs['Base Color'].default_value = (*GREY[part], 1.0)
    obj.data.materials.append(m)
    index[part] = len(obj.data.materials) - 1
for p, lab in zip(me.polygons, labels):
    p.material_index = index[lab]

areas = {}
for p, lab in zip(me.polygons, labels):
    areas[lab] = areas.get(lab, 0.0) + p.area
for part in PARTS:
    print('[prep] scooter %-15s area %.4f' % (part, areas.get(part, 0.0)))

# Drop the source materials and their atlases, so nothing of the old paint,
# stripe, name or badges is left in the file.
for m in old:
    if m and m.users == 0:
        bpy.data.materials.remove(m)
for m in list(bpy.data.materials):
    if m.users == 0:
        bpy.data.materials.remove(m)
for im in list(bpy.data.images):
    if im.users == 0:
        bpy.data.images.remove(im)

os.makedirs(os.path.dirname(OUT), exist_ok=True)
bpy.context.preferences.filepaths.save_version = 0  # no model.blend1 backups
bpy.ops.wm.save_as_mainfile(filepath=OUT, compress=True)
print('[prep] saved', OUT)
