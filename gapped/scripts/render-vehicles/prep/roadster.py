"""
Prep for the roadster: an open-top conversion of the MMC Works "Generic Sport
Coupe Car" (CC BY 4.0), the coupe's own source.

What it does to the coupe:

  - splits the 'car-body' atlas like the coupe prep: objects the atlas paints
    dark (bumper frame, lip, vents, skirts, diffuser) become 'black-plastic'
    (trim), the headlight internals 'headlight-inner' (head, never lit);
  - flattens the rig and empties into plain world-space meshes (nose -Y, up Z,
    as imported);
  - takes the roof off: cuts the shell on a vertical plane 10 cm behind the
    top edge of the windscreen, so the windscreen keeps its pillars and a
    header with a square back face, and deletes the roof, the C-pillar struts,
    the quarter-window tab and sill and the door-shut fin above the belt; the
    rear window, the side glass and their rubber, the fastback lid and the
    headliner go too;
  - gives the header a dark seal along the cut so it reads as a solid frame;
  - lays a new rear deck (body paint) between the rear haunches, from behind
    the seats to the tail lip. Along the haunches and under the tail lip it
    tucks a few millimetres under the existing skin, so there is no gap; its
    middle rises a couple of degrees toward the tail and rolls down to the
    lip (a deck that falls toward the tail mirrors the rig's top rim light
    into the rear camera and reads white, not copper); at the front it rolls
    over into a dark bulkhead behind the seats;
  - renames the cabin floor and console so the bake's shadow-card rule
    (names with floor / plane) does not drop them now that the cabin shows.

Custom split normals are kept through the cuts (stashed per corner, restored
after editing). Saves art-source/vehicles/roadster/model.blend (or
$ROADSTER_OUT).

    scripts/render-vehicles/slot.sh ~/Applications/Blender.app/Contents/MacOS/Blender -b \
        -P scripts/render-vehicles/prep/roadster.py
"""

import math
import os

import bmesh
import bpy
import numpy as np
from mathutils import Vector
from mathutils.bvhtree import BVHTree

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))
SRC = os.path.join(ROOT, 'art-source/vehicles/_downloads/generic-sport-coupe-car/source/coupe-sport-generic-mmc.fbx')
OUT = os.environ.get('ROADSTER_OUT') or os.path.join(ROOT, 'art-source/vehicles/roadster/model.blend')

bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.fbx(filepath=SRC, use_custom_normals=True)
scene = bpy.context.scene

# --- the atlas (as the coupe prep) ------------------------------------------
body_mat = bpy.data.materials['car-body']
tex = next(n for n in body_mat.node_tree.nodes if n.type == 'TEX_IMAGE' and 'Base' in n.image.name)
img = tex.image
W, H = img.size
px = np.empty(W * H * 4, dtype=np.float32)
img.pixels.foreach_get(px)
px = px.reshape(H, W, 4)[..., :3]


def sample(p, uv):
    us = np.array([uv.data[li].uv[:] for li in p.loop_indices]).mean(axis=0)
    return px[int((us[1] % 1.0) * (H - 1)), int((us[0] % 1.0) * (W - 1))]


def is_red(c):
    return c[0] > 0.3 and c[1] < 0.15 and c[2] < 0.15


def new_mat(name, rgb):
    m = bpy.data.materials.get(name) or bpy.data.materials.new(name)
    m.use_nodes = True
    m.node_tree.nodes['Principled BSDF'].inputs['Base Color'].default_value = (*rgb, 1.0)
    return m


black = new_mat('black-plastic', (0.02, 0.02, 0.02))
head_inner = new_mat('headlight-inner', (0.6, 0.62, 0.65))
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
    red = sum(p.area for p in faces if is_red(sample(p, uv)))
    share = red / (sum(p.area for p in faces) or 1.0)
    target = head_inner if o.name.startswith(HEAD_PARTS) else (None if share > 0.5 else black)
    if target is None:
        continue
    o.data.materials.append(target)
    for p in faces:
        p.material_index = len(o.material_slots) - 1

# --- flatten: world-space meshes, no rig, no empties --------------------------
bpy.ops.object.select_all(action='DESELECT')
for o in scene.objects:
    o.hide_set(False)
    o.select_set(True)
meshes = [o for o in scene.objects if o.type == 'MESH']
bpy.context.view_layer.objects.active = meshes[0]
bpy.ops.object.convert(target='MESH')
bpy.ops.object.parent_clear(type='CLEAR_KEEP_TRANSFORM')
for o in list(scene.objects):
    if o.type != 'MESH':
        bpy.data.objects.remove(o, do_unlink=True)
for o in scene.objects:
    if o.data.users > 1:
        o.data = o.data.copy()
bpy.ops.object.select_all(action='SELECT')
bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)

# --- what goes ----------------------------------------------------------------
for n in ('glass-rear', 'window-front.l', 'window-front.r', 'window-rear.l', 'window-rear.r',
          'windows-trim.l', 'windows-trim.r', 'trunk'):
    bpy.data.objects.remove(scene.objects[n], do_unlink=True)
# The cabin shows now: keep its floor and console out of the bake's
# shadow-card rule.
scene.objects['interior-floor'].name = 'cabin-carpet'
scene.objects['Plane'].name = 'console'


# --- normals kept through the edits -----------------------------------------
def stash(me):
    n = np.empty(len(me.loops) * 3, dtype=np.float32)
    me.corner_normals.foreach_get('vector', n)
    a = me.attributes.new('stash_n', 'FLOAT_VECTOR', 'CORNER')
    a.data.foreach_set('vector', n)


def restore(me):
    a = me.attributes['stash_n']
    n = np.empty(len(me.loops) * 3, dtype=np.float32)
    a.data.foreach_get('vector', n)
    me.attributes.remove(me.attributes['stash_n'])
    n = n.reshape(-1, 3)
    n /= np.maximum(np.linalg.norm(n, axis=1, keepdims=True), 1e-6)
    me.normals_split_custom_set(n.tolist())


# The header: the shell is cut on a vertical plane HEADER metres behind the
# top edge of the windscreen glass (y = 0.43 at z = 1.28), so the windscreen
# keeps its pillars and a header with a square back face.
HEADER = 0.10
P_N = Vector((0.0, 1.0, 0.0))                          # points back
P_CO = Vector((0.0, 0.43 + HEADER, 1.28))


def behind(co):
    return (co - P_CO).dot(P_N) > 0


def edit(o, fn):
    me = o.data
    stash(me)
    bm = bmesh.new()
    bm.from_mesh(me)
    fn(bm, o)
    bm.to_mesh(me)
    bm.free()
    restore(me)
    me.update()


def body_fn(bm, o):
    # Cut along the header plane where the roof is.
    geom = [f for f in bm.faces if f.calc_center_median().z > 1.0]
    geom = list(set(geom) | {e for f in geom for e in f.edges} | {v for f in geom for v in f.verts})
    bmesh.ops.bisect_plane(bm, geom=geom, dist=1e-5, plane_co=P_CO, plane_no=P_N)
    black_metal = o.data.materials.find('black-metal')
    dead = []
    for f in bm.faces:
        c = f.calc_center_median()
        if behind(c) and c.z > 1.12:                      # roof and C-pillar struts
            dead.append(f)
        elif 1.08 < c.y < 1.34 and abs(c.x) > 0.5 and c.z > 1.075:   # quarter-window tab
            dead.append(f)
        elif f.material_index == black_metal and c.y > 1.0 and c.z > 1.0:   # quarter-window sill
            dead.append(f)
        elif 1.1 < c.y < 1.14 and 0.6 < abs(c.x) < 0.72 and c.z > 1.01 and abs(f.normal.y) > 0.9:
            dead.append(f)                                # door-shut fin above the belt
    bmesh.ops.delete(bm, geom=dead, context='FACES')
    # Anything left floating above the belt behind the header.
    bm.verts.ensure_lookup_table()
    seen = set()
    for f in list(bm.faces):
        if f in seen:
            continue
        island, stack = [], [f]
        seen.add(f)
        while stack:
            g = stack.pop()
            island.append(g)
            for e in g.edges:
                for h in e.link_faces:
                    if h not in seen:
                        seen.add(h)
                        stack.append(h)
        if len(island) < 200:
            cs = [g.calc_center_median() for g in island]
            if all(behind(c) and c.z > 1.0 for c in cs):
                bmesh.ops.delete(bm, geom=island, context='FACES')
    bmesh.ops.delete(bm, geom=[v for v in bm.verts if not v.link_faces], context='VERTS')
    # A dark seal under the header along the cut.
    cut = [e for e in bm.edges if e.is_boundary and e.verts[0].co.z > 1.15 and e.verts[1].co.z > 1.15
           and all(abs((v.co - P_CO).dot(P_N)) < 2e-4 for v in e.verts)]
    print('[prep] header cut edges:', len(cut))
    if cut:
        slot = o.data.materials.find('Rubber - Black')
        if slot < 0:
            o.data.materials.append(bpy.data.materials['Rubber - Black'])
            slot = len(o.data.materials) - 1
        res = bmesh.ops.extrude_edge_only(bm, edges=cut)
        new_v = [g for g in res['geom'] if isinstance(g, bmesh.types.BMVert)]
        new_f = [g for g in res['geom'] if isinstance(g, bmesh.types.BMFace)]
        for v in new_v:
            v.co.z -= 0.04
        for f in new_f:
            f.material_index = slot
            f.smooth = True


edit(scene.objects['body'], body_fn)


def headliner_fn(bm, o):
    dead = [f for f in bm.faces if (lambda c: behind(c) and c.z > 0.98)(f.calc_center_median())]
    bmesh.ops.delete(bm, geom=dead, context='FACES')
    bmesh.ops.delete(bm, geom=[v for v in bm.verts if not v.link_faces], context='VERTS')


edit(scene.objects['interior-roof-rear-trim'], headliner_fn)

# --- the rear deck -------------------------------------------------------------
body = scene.objects['body']
bumper = scene.objects['rear-bumper']


def bvh_of(objs):
    bm = bmesh.new()
    for o in objs:
        tmp = bmesh.new()
        tmp.from_mesh(o.data)
        tmp.transform(o.matrix_world)
        me = bpy.data.meshes.new('tmp')
        tmp.to_mesh(me)
        tmp.free()
        bm.from_mesh(me)
        bpy.data.meshes.remove(me)
    t = BVHTree.FromBMesh(bm)
    bm.free()
    return t


skin = bvh_of([body, bumper])

DECK_Y0 = 1.25                                        # just behind the door and the seats
DECK_Y1 = 2.55
TUCK = 0.006
STEP = 0.02
XS = np.round(np.arange(-0.78, 0.78 + 1e-6, STEP), 4)
YS = np.arange(DECK_Y0, DECK_Y1 + 1e-6, STEP)


def skin_z(x, y):
    hit, *_ = skin.ray_cast(Vector((x, y, 2.5)), Vector((0, 0, -1)))
    return hit.z if hit is not None else None


# The opening between the haunches, row by row: scanning out from the centre
# line, the first point where the shell is at belt height. Smoothed along the
# car so the deck has no ripples where the haunch edge has steps.
x_open, z_open = [], []
for y in YS:
    found = None
    for x in np.arange(0.0, 0.80, 0.004):
        z = skin_z(float(x), float(y))
        if z is not None and z > 0.95:
            found = (float(x), z)
            break
    # Rows where the tail lip already covers the middle keep the last opening.
    if found is None or found[0] < 0.3:
        found = (x_open[-1], z_open[-1]) if x_open else (0.70, 1.0)
    x_open.append(found[0])
    z_open.append(found[1])


def smooth(a, r=4):
    a = np.array(a, dtype=float)
    pad = np.pad(a, r, mode='edge')
    k = np.hanning(2 * r + 3)[1:-1]
    return np.convolve(pad, k / k.sum(), mode='valid')


x_open, z_open = smooth(x_open, 6), smooth(z_open, 6)
# The middle of the deck: it rises gently all the way from behind the seats
# and then rolls down to the tail lip. A panel that falls toward the tail
# mirrors the rig's top rim light straight into the rear camera and blows the
# whole deck out to white; one that rises a couple of degrees mirrors the dark
# road instead, so the copper reads.
CY = [DECK_Y0, 1.45, 1.65, 2.05, 2.25, 2.38, 2.47, 2.56]
CZ = [z_open[0] + 0.02, 1.085, 1.103, 1.112, 1.112, 1.10, 1.07, 1.03]
z_mid = smooth(np.interp(YS, CY, CZ), 6)
print('[prep] deck: ' + ' '.join('y%.2f:x%.3f,edge%.3f,mid%.3f' % (y, x, z, m) for y, x, z, m in
                                  list(zip(YS, x_open, z_open, z_mid))[::6]))


def deck_z(x, j):
    y = YS[j]
    z = skin_z(x, y)
    if z is not None and z > z_open[j] - 0.06:
        return z - TUCK
    # Across the car: the middle line's height, blending into the haunch
    # edge's height only near the edge, so the deck's own lines stay smooth.
    u = min(abs(x) / x_open[j], 1.0)
    return z_mid[j] - TUCK + (z_open[j] - z_mid[j]) * u ** 3


verts, faces, mat = [], [], []
grid = np.zeros((len(YS), len(XS)), dtype=int)
for j, y in enumerate(YS):
    for i, x in enumerate(XS):
        grid[j, i] = len(verts)
        verts.append((float(x), float(y), deck_z(float(x), j)))
for j in range(len(YS) - 1):
    for i in range(len(XS) - 1):
        faces.append((grid[j, i], grid[j, i + 1], grid[j + 1, i + 1], grid[j + 1, i]))
        mat.append(0)
# The front roll and the bulkhead behind the seats, on the deck's own columns.
XB = x_open[0] + 0.03
cols = [i for i, x in enumerate(XS) if abs(x) <= XB + 1e-6]
R = 0.03
prev = [grid[0, i] for i in cols]
rows = [(math.sin(t) * R, (1 - math.cos(t)) * R, 0) for t in np.radians([20, 40, 60, 75, 90])]
rows += [(R, d, 1) for d in (R + 0.06, 0.25, 0.45, 0.62)]
for dy, dz, m in rows:
    cur = []
    for i in cols:
        x0, _, z0 = verts[grid[0, i]]
        cur.append(len(verts))
        verts.append((x0, DECK_Y0 - dy, z0 - dz))
    for k in range(len(cols) - 1):
        faces.append((prev[k + 1], prev[k], cur[k], cur[k + 1]))
        mat.append(m)
    prev = cur

me = bpy.data.meshes.new('rear-deck')
me.from_pydata(verts, [], faces)
me.materials.append(bpy.data.materials['car-body'])
me.materials.append(bpy.data.materials['interior'])
me.polygons.foreach_set('material_index', mat)
me.polygons.foreach_set('use_smooth', [True] * len(faces))
me.validate()
me.update()
deck = bpy.data.objects.new('rear-deck', me)
scene.collection.objects.link(deck)
# Faces wound so the deck faces up.
bm = bmesh.new()
bm.from_mesh(me)
bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
up = sum(f.normal.z * f.calc_area() for f in bm.faces if f.material_index == 0)
if up < 0:
    bmesh.ops.reverse_faces(bm, faces=bm.faces)
bm.to_mesh(me)
bm.free()
print('[prep] deck: %d verts' % len(verts))

os.makedirs(os.path.dirname(OUT), exist_ok=True)
bpy.ops.wm.save_as_mainfile(filepath=OUT, compress=True)
print('[prep] saved', OUT)
