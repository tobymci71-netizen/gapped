"""
Bake the vehicle renders: one 3D model per body type, re-painted and lit in
the Nightrun look, rendered to transparent stills the app ships as images.

Run headless (Blender 5.2):

    ~/Applications/Blender.app/Contents/MacOS/Blender -b -P scripts/render-vehicles/bake.py -- \
        --out build/vehicle-renders [--only coupe,suv] [--views side,rear,rear34] \
        [--width 1200] [--samples 256] [--passes beauty,lights] [--preview]

Each body type is described by scripts/render-vehicles/specs/<bodyType>.json
(see docs/VEHICLE_ART.md for every field). Source models live in
art-source/vehicles/ (gitignored). The app never sees a 3D file: only the
images this script writes.

Output per body type and view, in <out>/<bodyType>/:
  <view>-beauty.png   the vehicle, lit, its tail-light lenses dark (the lights
                      pass carries their glow), with its contact shadow faded
                      out before the edges, on transparent
  <view>-lights.png   the tail lights alone with their bloom, straight alpha,
                      for the app to breathe and ignite on their own layer
  <view>-preview.png  (--preview) both composited on the app's night canvas
  meta.json           image sizes, ground line, tail-light points per view
"""

import argparse
import glob
import json
import math
import os
import sys

import bpy
import mathutils
import numpy as np
from bpy_extras.object_utils import world_to_camera_view

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import livery  # noqa: E402

# ---------------------------------------------------------------------------
# Args

argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
ap = argparse.ArgumentParser()
ap.add_argument('--specs', default=None, help='folder of <bodyType>.json specs')
ap.add_argument('--liveries', default=None, help='the palette and liveries (default liveries.json beside this script)')
ap.add_argument('--out', required=True)
ap.add_argument('--only', default='')
ap.add_argument('--views', default='side,rear,rear34')
ap.add_argument('--width', type=int, default=1200)
ap.add_argument('--samples', type=int, default=256)
ap.add_argument('--passes', default='beauty,lights')
ap.add_argument('--preview', action='store_true')
ap.add_argument('--inspect', action='store_true', help='print objects and materials, render nothing')
args = ap.parse_args(argv)

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
SPECS = args.specs or os.path.join(os.path.dirname(os.path.abspath(__file__)), 'specs')
LIVERIES_PATH = args.liveries or os.path.join(os.path.dirname(os.path.abspath(__file__)), 'liveries.json')
ONLY = [s for s in args.only.split(',') if s]
VIEWS = [s for s in args.views.split(',') if s]
PASSES = [s for s in args.passes.split(',') if s]

# ---------------------------------------------------------------------------
# Palette (docs/DESIGN.md). The paints and liveries are in liveries.json.


def lin(hexstr):
    """'#RRGGBB' -> linear RGBA, for Blender colour sockets."""
    h = hexstr.lstrip('#')
    out = []
    for i in (0, 2, 4):
        c = int(h[i:i + 2], 16) / 255.0
        out.append(c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4)
    return (*out, 1.0)


def srgb01(hexstr):
    h = hexstr.lstrip('#')
    return np.array([int(h[i:i + 2], 16) / 255.0 for i in (0, 2, 4)], dtype=np.float32)


TAIL = '#E8282C'
CANVAS = '#07070A'
RIM = '#DCE4FF'
NIGHT_FILL = '#3D5598'

# ---------------------------------------------------------------------------
# Scene


def reset():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    scene = bpy.context.scene
    scene.render.engine = 'CYCLES'
    try:
        prefs = bpy.context.preferences.addons['cycles'].preferences
        prefs.compute_device_type = 'METAL'
        prefs.get_devices()
        for d in prefs.devices:
            d.use = True
        # No background kernel specialisation: several bakes at once each
        # wrote the finished kernels to the shared Metal shader cache at the
        # same moment and crashed together. The images are the same either way.
        if hasattr(prefs, 'kernel_optimization_level'):
            prefs.kernel_optimization_level = 'OFF'
        scene.cycles.device = 'GPU'
    except Exception as e:  # CPU still renders, just slower
        print('[bake] GPU unavailable, using CPU:', e)
    scene.cycles.samples = args.samples
    scene.cycles.use_denoising = True
    scene.cycles.max_bounces = 8
    scene.render.film_transparent = True
    scene.render.image_settings.file_format = 'PNG'
    scene.render.image_settings.color_mode = 'RGBA'
    scene.render.image_settings.color_depth = '8'
    scene.view_settings.view_transform = 'AgX'
    for look in ('AgX - Medium High Contrast', 'AgX - Punchy', 'None'):
        try:
            scene.view_settings.look = look
            break
        except TypeError:
            continue
    # The night the paint reflects (the background itself is transparent):
    # dark road below, a cool glow along the horizon, dark sky above. The
    # horizon band lays the long highlight down a car's flank.
    world = bpy.data.worlds.new('night')
    scene.world = world
    world.use_nodes = True
    nt = world.node_tree
    bg = nt.nodes['Background']
    coord = nt.nodes.new('ShaderNodeTexCoord')
    sep = nt.nodes.new('ShaderNodeSeparateXYZ')
    ramp = nt.nodes.new('ShaderNodeValToRGB')
    nt.links.new(coord.outputs['Generated'], sep.inputs[0])
    nt.links.new(sep.outputs['Z'], ramp.inputs['Fac'])
    els = ramp.color_ramp.elements
    els[0].position = 0.40
    els[0].color = lin('#030407')
    els[1].position = 0.62
    els[1].color = lin('#05070E')
    for pos, col in ((0.495, '#121A30'), (0.515, '#6F84B8'), (0.535, '#1C2848')):
        e = els.new(pos)
        e.color = lin(col)
    nt.links.new(ramp.outputs['Color'], bg.inputs['Color'])
    bg.inputs['Strength'].default_value = 0.8
    return scene


def import_model(path):
    before = set(bpy.data.objects)
    low = path.lower()
    if low.endswith('.fbx'):
        bpy.ops.import_scene.fbx(filepath=path, use_custom_normals=True)
    elif low.endswith('.glb') or low.endswith('.gltf'):
        bpy.ops.import_scene.gltf(filepath=path)
    elif low.endswith('.obj'):
        bpy.ops.wm.obj_import(filepath=path)
    elif low.endswith('.blend'):
        with bpy.data.libraries.load(path) as (src, dst):
            dst.objects = src.objects
        for o in dst.objects:
            if o is not None and o.type not in ('LIGHT', 'CAMERA', 'LIGHT_PROBE', 'SPEAKER'):
                bpy.context.scene.collection.objects.link(o)
    else:
        raise SystemExit('unsupported model format: ' + path)
    return [o for o in bpy.data.objects if o not in before]


def name_hit(name, subs):
    n = name.lower()
    return any(s.lower() in n for s in subs)


def prepare_objects(spec):
    """Keep the vehicle's meshes only, in one space, with modifiers applied."""
    scene = bpy.context.scene
    for o in list(scene.objects):
        if o.type in ('LIGHT', 'CAMERA', 'LIGHT_PROBE', 'SPEAKER'):
            bpy.data.objects.remove(o, do_unlink=True)
    include, exclude = spec.get('include', []), spec.get('exclude', [])
    hide = spec.get('hideObjects', [])
    # Curves, text and surfaces that make up a model become meshes too.
    bpy.ops.object.select_all(action='DESELECT')
    convertible = [o for o in scene.objects if o.type in ('MESH', 'CURVE', 'SURFACE', 'FONT', 'META')]
    for o in convertible:
        o.hide_set(False)
        o.hide_viewport = False
        o.select_set(True)
    if convertible:
        bpy.context.view_layer.objects.active = convertible[0]
        bpy.ops.object.convert(target='MESH')
    # Packs keep wheels as separate objects named apart from their car:
    # keepNearby keeps any mesh whose centre sits inside the included body's
    # box (grown by 8%).
    near = None
    if include and spec.get('keepNearby'):
        named = [o for o in scene.objects if o.type == 'MESH' and name_hit(o.name, include)]
        if named:
            lo, hi = world_bbox(named)
            pad = (hi - lo) * 0.08
            near = (lo - pad, hi + pad)
    for o in list(scene.objects):
        if o.type != 'MESH':
            continue
        outside = include and not name_hit(o.name, include)
        if outside and near is not None and len(o.data.vertices):
            c = object_centre(o)
            if all(near[0][i] <= c[i] <= near[1][i] for i in range(3)):
                outside = False
        drop = outside or name_hit(o.name, exclude) or name_hit(o.name, hide)
        # Ground planes and baked shadow cards ship with many Sketchfab models.
        if not drop and spec.get('dropShadowCards', True) and name_hit(o.name, ['shadow', 'ground', 'floor', 'plane']):
            drop = True
        if drop:
            bpy.data.objects.remove(o, do_unlink=True)
    objs = [o for o in scene.objects if o.type == 'MESH' and len(o.data.polygons)]
    # Bake parents and transforms into the meshes.
    bpy.ops.object.select_all(action='DESELECT')
    for o in scene.objects:
        o.select_set(True)
    bpy.context.view_layer.objects.active = objs[0]
    bpy.ops.object.parent_clear(type='CLEAR_KEEP_TRANSFORM')
    for o in list(scene.objects):
        if o.type != 'MESH' or not len(o.data.polygons):
            bpy.data.objects.remove(o, do_unlink=True)
    objs = [o for o in scene.objects if o.type == 'MESH']
    for o in objs:
        if o.data.users > 1:
            o.data = o.data.copy()
    bpy.ops.object.select_all(action='DESELECT')
    for o in objs:
        o.select_set(True)
    bpy.context.view_layer.objects.active = objs[0]
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    return objs


def object_centre(o):
    lo, hi = world_bbox([o])
    return (lo + hi) / 2


def meshes():
    return [o for o in bpy.context.scene.objects if o.type == 'MESH' and o.name != 'ground']


def world_bbox(objs):
    """From the vertices: Object.bound_box is cached and goes stale after
    mesh.transform(), which framed the camera on the pre-scale box."""
    lo = np.array([1e9, 1e9, 1e9])
    hi = np.array([-1e9, -1e9, -1e9])
    for o in objs:
        n = len(o.data.vertices)
        if not n:
            continue
        co = np.empty(n * 3, dtype=np.float64)
        o.data.vertices.foreach_get('co', co)
        co = co.reshape(-1, 3)
        mw = np.array(o.matrix_world)
        co = co @ mw[:3, :3].T + mw[:3, 3]
        lo = np.minimum(lo, co.min(axis=0))
        hi = np.maximum(hi, co.max(axis=0))
    return mathutils.Vector(lo), mathutils.Vector(hi)


def transform_all(objs, m):
    for o in objs:
        o.data.transform(m)
        o.data.update()


def normalise(spec, objs):
    """Nose to +X, wheels on z=0, centred, scaled to the real length."""
    up = spec.get('up', 'z')
    if up == 'y':
        transform_all(objs, mathutils.Matrix.Rotation(math.radians(90), 4, 'X'))
    elif up == '-y':
        transform_all(objs, mathutils.Matrix.Rotation(math.radians(-90), 4, 'X'))
    fwd = spec.get('forward', '+x')
    angle = {'+x': 0, '+y': 90, '-x': 180, '-y': -90}[fwd]
    transform_all(objs, mathutils.Matrix.Rotation(math.radians(-angle + spec.get('rotateZ', 0)), 4, 'Z'))
    lo, hi = world_bbox(objs)
    s = spec['lengthM'] / (hi.x - lo.x)
    centre = (lo + hi) / 2
    transform_all(objs, mathutils.Matrix.Scale(s, 4) @ mathutils.Matrix.Translation((-centre.x, -centre.y, -lo.z)))
    if spec.get('flipY'):
        transform_all(objs, mathutils.Matrix.Scale(-1, 4, (0, 1, 0)))
    return world_bbox(objs)


# ---------------------------------------------------------------------------
# Materials: one shader set, a paint per body type.


def principled(name, base, metallic=0.0, rough=0.5, coat=0.0, coat_rough=0.03, emission=None, strength=0.0):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    b = m.node_tree.nodes['Principled BSDF']
    b.inputs['Base Color'].default_value = lin(base)
    b.inputs['Metallic'].default_value = metallic
    b.inputs['Roughness'].default_value = rough
    b.inputs['Coat Weight'].default_value = coat
    b.inputs['Coat Roughness'].default_value = coat_rough
    if emission:
        b.inputs['Emission Color'].default_value = lin(emission)
        b.inputs['Emission Strength'].default_value = strength
    return m


FINISHES = {
    # metallic, roughness, coat
    'metallic': (0.75, 0.32, 1.0),
    'pearl': (0.25, 0.28, 1.0),
    'solid': (0.0, 0.30, 1.0),
    'satin': (0.35, 0.55, 0.3),
    'matte': (0.1, 0.7, 0.0),
}


def build_shaders(spec):
    paint = spec['paint']
    met, rough, coat = FINISHES[paint.get('finish', 'metallic')]
    return {
        'paint': principled('paint', paint['hex'], met, rough, coat),
        # A darker tone of the paint for two-tone panels (roofs, stripes,
        # fairing lowers), so the vehicle still reads as one colour.
        'paint2': principled('paint2', paint.get('second', '#1B1D22'), 0.6, 0.35, 1.0),
        'trim': principled('trim', '#141519', rough=0.55),
        'glass': principled('glass', '#070A10', rough=0.03, coat=1.0),
        'tyre': principled('tyre', '#0E0E10', rough=0.85),
        'rim': principled('rim', paint.get('rim', '#8E949E'), metallic=1.0, rough=0.28),
        'chrome': principled('chrome', '#C9CED6', metallic=1.0, rough=0.12),
        'metal': principled('metal', '#5A5F68', metallic=1.0, rough=0.4),
        'interior': principled('interior', '#151519', rough=0.75),
        'head': principled('head', '#C9D0DC', rough=0.06, coat=1.0),
        # Dark in the body image: the lights layer carries all the glow, so
        # the app can turn the lights off, ignite them and breathe them.
        'tail': principled('tail', '#5A0608', rough=0.15, coat=1.0, emission=TAIL, strength=spec.get('tailGlow', 0.0)),
        'emissive_off': principled('emissive_off', '#202228', rough=0.3),
    }


ROLE_RULES = [
    ('tail', ['rear light', 'rearlight', 'rear_light', 'taillight', 'tail_light', 'tail light', 'tail-light', 'brake light',
              'brakelight', 'stoplight', 'stop light', 'rear lamp', 'backlight', 'back light', 'glass - red', 'red glass',
              'glass_red', 'glassred', 'red_glass', 'lanterna']),
    ('rim', ['brake', 'caliper', 'disc', 'disk']),
    ('head', ['headlight', 'head light', 'head_light', 'headlamp', 'front light', 'frontlight', 'farol']),
    ('glass', ['window', 'glass', 'windshield', 'windscreen', 'vidro']),
    ('tyre', ['tire', 'tyre', 'rubber', 'pneu']),
    ('rim', ['rim', 'wheel', 'roda', 'spoke']),
    ('chrome', ['chrome', 'mirror', 'exhaust', 'cromado']),
    ('interior', ['interior', 'seat', 'leather', 'dash', 'banco']),
    ('metal', ['mechanic', 'engine', 'motor', 'frame', 'chassis', 'suspension', 'fork', 'chain', 'metal', 'steel', 'alumin']),
    ('trim', ['trim', 'plastic', 'grille', 'grill', 'black', 'rubber_trim', 'wiper', 'media']),
    ('paint', ['paint', 'body', 'carpaint', 'car_paint']),
]


def texture_node(mat):
    """The image texture feeding a material's base colour, if any."""
    if not mat or not mat.node_tree:
        return None
    for node in mat.node_tree.nodes:
        if node.type == 'BSDF_PRINCIPLED':
            link = node.inputs['Base Color'].links
            if link and link[0].from_node.type == 'TEX_IMAGE':
                return link[0].from_node
    for node in mat.node_tree.nodes:
        if node.type == 'TEX_IMAGE':
            return node
    return None


def mean_colour(mat):
    """The material's colour: its base colour, or its texture's mean."""
    tex = texture_node(mat)
    if tex and tex.image and tex.image.size[0]:
        px = np.empty(tex.image.size[0] * tex.image.size[1] * 4, dtype=np.float32)
        tex.image.pixels.foreach_get(px)
        return px.reshape(-1, 4)[::97, :3].mean(axis=0)
    if mat and mat.node_tree:
        for node in mat.node_tree.nodes:
            if node.type == 'BSDF_PRINCIPLED':
                return np.array(node.inputs['Base Color'].default_value[:3])
    return np.array([0.5, 0.5, 0.5])


def recolour(mat, spec, rule):
    """Repaint a texture atlas in place: pixels near the source paint colour
    take the new paint (keeping the texture's own shading); everything else
    in the atlas (lights, grilles, badges painted in) is kept or darkened."""
    tex = texture_node(mat)
    if not tex or not tex.image:
        return False
    # The source atlas, for the livery's other colours (apply_livery).
    mat['_atlas'] = tex.image.name
    mat['_rule'] = json.dumps(rule)
    tex.image = repaint(tex.image, rule, spec['paint']['hex'])
    # Keep the atlas's normal and roughness maps; give the body a clear coat.
    for node in mat.node_tree.nodes:
        if node.type == 'BSDF_PRINCIPLED':
            met, rough, coat = FINISHES[spec['paint'].get('finish', 'metallic')]
            node.inputs['Coat Weight'].default_value = coat
            if not node.inputs['Metallic'].links:
                node.inputs['Metallic'].default_value = met * 0.6
    return True


def repaint(img, rule, hexstr):
    """A copy of the atlas with its paint pixels in this colour."""
    w, h = img.size
    px = np.empty(w * h * 4, dtype=np.float32)
    img.pixels.foreach_get(px)
    px = px.reshape(h, w, 4)
    rgb = px[..., :3]
    src = srgb01(rule['from'])
    dst = srgb01(hexstr)
    tol = rule.get('tolerance', 0.18)
    dist = np.sqrt(((rgb / (rgb.max(axis=2, keepdims=True) + 1e-4) - src / (src.max() + 1e-4)) ** 2).sum(axis=2))
    mask = np.clip(1.0 - (dist - tol) / tol, 0.0, 1.0)[..., None]
    shade = rgb.max(axis=2, keepdims=True) / (src.max() + 1e-4)
    painted = np.clip(dst * shade, 0, 1)
    rest = rgb * rule.get('restScale', 0.55)
    px[..., :3] = painted * mask + rest * (1 - mask)
    out = bpy.data.images.new('%s_%s' % (img.name, hexstr.lstrip('#')), w, h, alpha=True)
    out.pixels.foreach_set(px.ravel())
    out.pack()
    return out


def material_areas(objs):
    areas = {}
    for o in objs:
        slots = o.material_slots
        for p in o.data.polygons:
            if p.material_index < len(slots) and slots[p.material_index].material:
                n = slots[p.material_index].material.name
                areas[n] = areas.get(n, 0.0) + p.area
    return areas


def assign_roles(spec, objs):
    shaders = build_shaders(spec)
    overrides = {k.lower(): v for k, v in spec.get('materials', {}).items()}
    rules = [(r, k) for r, k in spec.get('materialRules', [])] + ROLE_RULES
    recolours = {r['material'].lower(): r for r in spec.get('recolour', [])}
    areas = material_areas(objs)
    roles = {}
    for name in areas:
        low = name.lower()
        role = overrides.get(low)
        if role is None:
            role = next((r for r, keys in rules if name_hit(low, keys)), None)
        if role is None:
            if low in recolours:
                role = 'recolour'
            else:
                c = mean_colour(bpy.data.materials[name])
                lum = float(0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2])
                role = 'trim' if lum < 0.04 else 'paint2'
        roles[name] = role
    if spec.get('paintMaterial'):
        roles[spec['paintMaterial']] = 'paint'
    for name, r in recolours.items():
        actual = next((n for n in roles if n.lower() == name), None)
        if actual:
            roles[actual] = 'recolour'
    print('[bake] %s roles: %s' % (spec['bodyType'], json.dumps(roles, sort_keys=True)))
    # Faces with the 'hide' role are removed outright (decals, labels), found
    # by their source material before any slot is reassigned.
    hide_names = {n for n, r in roles.items() if r == 'hide'}
    if hide_names:
        import bmesh
        for o in objs:
            idx = [i for i, s in enumerate(o.material_slots) if s.material and s.material.name in hide_names]
            if not idx:
                continue
            bm = bmesh.new()
            bm.from_mesh(o.data)
            bmesh.ops.delete(bm, geom=[f for f in bm.faces if f.material_index in idx], context='FACES')
            bm.to_mesh(o.data)
            bm.free()
    done = {}
    for o in objs:
        for slot in o.material_slots:
            m = slot.material
            if not m or m.name not in roles:
                continue
            role = roles[m.name]
            if role == 'keep':
                continue
            if role == 'recolour':
                if m.name not in done:
                    done[m.name] = recolour(m, spec, recolours[m.name.lower()])
                continue
            if role == 'hide':
                # Its faces are gone (above); the empty slot needs a material.
                slot.material = shaders['glass']
                continue
            slot.material = shaders[role]
    return shaders, roles


def add_tail_lights(spec, shaders, lo, hi):
    """Lights for models whose tail lights are only painted in a texture: a
    thin emissive panel laid on the rear surface where a ray from behind hits
    it. Each entry: y (metres off the centre line, mirrored unless mirror is
    false), z (height), w (width), h (height)."""
    lights = spec.get('tailLights')
    if not lights:
        return []
    scene = bpy.context.scene
    dg = bpy.context.evaluated_depsgraph_get()
    made = []
    for i, L in enumerate(lights):
        ys = [L['y'], -L['y']] if L.get('mirror', True) and L['y'] != 0 else [L['y']]
        for y in ys:
            origin = mathutils.Vector((lo.x - 1.0, y, L['z']))
            hit, loc, normal, _, _, _ = scene.ray_cast(dg, origin, mathutils.Vector((1, 0, 0)))
            if not hit:
                print('[bake] tail light %d at y=%.2f z=%.2f missed the body' % (i, y, L['z']))
                continue
            normal = normal if normal.x < 0 else -normal
            mesh = bpy.data.meshes.new('tail_%d' % i)
            w, h = L['w'] / 2, L['h'] / 2
            # A quad facing back along the surface normal.
            t = normal.cross(mathutils.Vector((0, 0, 1)))
            if t.length < 1e-3:
                t = mathutils.Vector((0, 1, 0))
            t.normalize()
            u = t.cross(normal).normalized()
            c = loc + normal * 0.006
            verts = [c - t * w - u * h, c + t * w - u * h, c + t * w + u * h, c - t * w + u * h]
            mesh.from_pydata([tuple(v) for v in verts], [], [(0, 1, 2, 3)])
            ob = bpy.data.objects.new('tail_%d' % i, mesh)
            scene.collection.objects.link(ob)
            ob.data.materials.append(shaders['tail'])
            made.append(ob)
    return made


# ---------------------------------------------------------------------------
# Liveries (liveries.json, livery.py): the paint is a palette colour, and a
# pattern of stripes, slashes or panels in the palette is laid over it.


def load_liveries():
    if not os.path.exists(LIVERIES_PATH):
        return None
    with open(LIVERIES_PATH) as f:
        return json.load(f)


LIVERIES = load_liveries()


def with_livery(spec):
    """The spec with its livery's paint in place of its own."""
    lv = (LIVERIES or {}).get('liveries', {}).get(spec['bodyType'])
    if not lv:
        return spec
    base = LIVERIES['palette'][lv['paint']]
    paint = {k: v for k, v in spec.get('paint', {}).items() if k in ('rim', 'second')}
    paint.update({'name': lv['name'], 'colour': lv['paint'], 'hex': base['hex'], 'finish': base.get('finish', 'metallic')})
    for k in ('rim', 'second'):
        if k in lv:
            paint[k] = lv[k]
    return {**spec, 'paint': paint, 'livery': lv}


def belt_line(shaders, lo, hi, lv):
    """Where the side windows start, as the side camera sees it: rays across
    the flank, rising until the first thing they hit is glass (glass modelled
    on down inside the door is hidden by it, so this is the visible line).
    The median of a few along the doors. Bikes have no side glass: 60% of
    the height, or the livery's "belt"."""
    height = hi.z - lo.z
    if 'belt' in lv:
        return lv['belt'] * height
    scene = bpy.context.scene
    dg = bpy.context.evaluated_depsgraph_get()
    found = []
    for fx in (0.35, 0.45, 0.55, 0.65):
        x = lo.x + fx * (hi.x - lo.x)
        z = 0.3 * height
        while z < 0.98 * height:
            hit, _, _, idx, ob, _ = scene.ray_cast(dg, mathutils.Vector((x, lo.y - 1.0, z)), mathutils.Vector((0, 1, 0)))
            if hit and ob.type == 'MESH':
                slot = ob.data.polygons[idx].material_index
                if slot < len(ob.material_slots) and ob.material_slots[slot].material == shaders['glass']:
                    found.append(z)
                    break
            z += 0.01
    if not found:
        return 0.6 * height
    return float(np.median(found))


def apply_livery(spec, shaders, objs, lo, hi):
    lv = spec.get('livery')
    if not lv or not lv.get('layers'):
        return
    belt = belt_line(shaders, lo, hi, lv)
    print('[bake] %s livery "%s", belt line %.2f m' % (spec['bodyType'], lv['name'], belt))
    box = (lo, hi, belt)
    used = {layer['colour'] for layer in lv['layers']}
    finishes = {}
    for layer in lv['layers']:
        c = LIVERIES['palette'][layer['colour']]
        finish = layer.get('finish') or c.get('finish', 'metallic')
        finishes[livery.finish_key(layer)] = (lin(c['hex']), *FINISHES[finish])
    livery.pattern_principled(shaders['paint'], lv['layers'], box, finishes)
    for mat in list(bpy.data.materials):
        if '_atlas' not in mat:
            continue
        tex = texture_node(mat)
        src = bpy.data.images[mat['_atlas']]
        rule = json.loads(mat['_rule'])
        images = {name: repaint(src, rule, LIVERIES['palette'][name]['hex']) for name in used}
        livery.pattern_texture(mat, tex, lv['layers'], box, images, finishes)


# ---------------------------------------------------------------------------
# Light rig: a street light above, white rims behind, a faint blue night fill.


def area_light(name, loc, target, size, energy, colour, size_y=None):
    data = bpy.data.lights.new(name, 'AREA')
    data.shape = 'RECTANGLE'
    data.size = size
    data.size_y = size_y if size_y is not None else size
    data.energy = energy
    data.color = lin(colour)[:3]
    o = bpy.data.objects.new(name, data)
    bpy.context.scene.collection.objects.link(o)
    o.location = loc
    o.rotation_euler = (mathutils.Vector(target) - mathutils.Vector(loc)).to_track_quat('-Z', 'Y').to_euler()
    return o


def rig(spec, lo, hi, view):
    """Lit for the camera: a street light overhead, white rims behind the car
    as the camera sees it (so they trace its outline), a dim blue fill from
    the camera's side so the face toward us is night, not black."""
    for o in list(bpy.context.scene.objects):
        if o.type == 'LIGHT':
            bpy.data.objects.remove(o, do_unlink=True)
    L = hi.x - lo.x
    W = hi.y - lo.y
    H = hi.z - lo.z
    R = max(L, W) * 0.5
    k = max(L / 4.5, 0.45) ** 2 * spec.get('exposure', 1.0)
    az = math.radians(VIEW_DEFS[view]['az'])
    d = mathutils.Vector((math.cos(az), math.sin(az), 0))  # toward the camera
    p = mathutils.Vector((-d.y, d.x, 0))  # across, camera's left to right
    c = mathutils.Vector((0, 0, H * 0.5))
    # Street light: a long soft box overhead, a little beyond the car.
    area_light('key', tuple(-d * R * 0.35 + mathutils.Vector((0, 0, H + 3.2))), (0, 0, 0), L * 0.9, 230 * k, '#F4F1EA', size_y=1.6)
    # Rims: behind the car from the camera, one each side, high.
    for side, name in ((1, 'rimL'), (-1, 'rimR')):
        loc = -d * (R + 2.2) + p * side * (W * 0.5 + 2.4) + mathutils.Vector((0, 0, H * 1.1))
        area_light(name, tuple(loc), tuple(c), 0.6, 520 * k, RIM, size_y=2.8)
    area_light('rimTop', tuple(-d * (R + 3.0) + mathutils.Vector((0, 0, H + 2.4))), tuple(c), 2.2, 220 * k, RIM, size_y=0.5)
    # Night fill from the camera's side, big and dim and blue.
    area_light('fill', tuple(d * (R + 5.0) + mathutils.Vector((0, 0, 1.2))), tuple(c), 6.0, 75 * k, NIGHT_FILL, size_y=3.0)
    # A soft white card high on the camera side: it lays the colour on the
    # flank the camera sees, so every paint reads as its own colour.
    area_light('card', tuple(d * (R + 3.5) + p * (R * 0.6) + mathutils.Vector((0, 0, H + 1.6))), tuple(c), 2.5, 120 * k * spec.get('cardScale', 1.0), '#E9EDF5', size_y=1.0)
    if not bpy.context.scene.objects.get('ground'):
        bpy.ops.mesh.primitive_plane_add(size=80, location=(0, 0, 0))
        ground = bpy.context.active_object
        ground.name = 'ground'
        ground.is_shadow_catcher = True
        # It still shows in reflections and bounces light: a wet night road,
        # so lower panels keep their paint instead of a lit grey floor's.
        ground.data.materials.append(principled('road', '#0B0C0F', rough=0.9))


# ---------------------------------------------------------------------------
# Cameras. side: nose to the right (+X), camera on the -Y flank. rear: square
# on from behind, a little above, as the Drive and Garage heroes frame it.
# rear34: behind and to the left, the hero angle.

VIEW_DEFS = {
    'side': {'az': -90, 'el': 3, 'lens': 90, 'aspect': 2.0},
    'rear': {'az': 180, 'el': 7, 'lens': 90, 'aspect': 1.25},
    'rear34': {'az': 212, 'el': 10, 'lens': 75, 'aspect': 1.5},
}


def frame_camera(view, lo, hi, width):
    v = VIEW_DEFS[view]
    scene = bpy.context.scene
    cam_data = bpy.data.cameras.new('cam')
    cam_data.lens = v['lens']
    cam = bpy.data.objects.new('cam', cam_data)
    scene.collection.objects.link(cam)
    scene.camera = cam
    scene.render.resolution_x = width
    scene.render.resolution_y = int(round(width / v['aspect']))
    scene.render.resolution_percentage = 100
    centre = mathutils.Vector(((lo.x + hi.x) / 2, (lo.y + hi.y) / 2, (hi.z - lo.z) * 0.45))
    az, el = math.radians(v['az']), math.radians(v['el'])
    direction = mathutils.Vector((math.cos(az) * math.cos(el), math.sin(az) * math.cos(el), math.sin(el)))
    corners = [mathutils.Vector((x, y, z)) for x in (lo.x, hi.x) for y in (lo.y, hi.y) for z in (lo.z, hi.z)]
    # Start outside the bounding sphere and back off until every corner is in
    # frame with a margin, so every body type fills its image the same way.
    dist = (hi - lo).length * 0.75
    for _ in range(400):
        cam.location = centre + direction * dist
        cam.rotation_euler = (centre - cam.location).to_track_quat('-Z', 'Y').to_euler()
        bpy.context.view_layer.update()
        if all(
            (p.z > 0 and 0.03 < p.x < 0.97 and 0.07 < p.y < 0.95)
            for p in (world_to_camera_view(scene, cam, c) for c in corners)
        ):
            break
        dist *= 1.015
    return cam


def projected_box(scene, cam, objs):
    """The vehicle's extent in the image, from every vertex projected through
    the camera: [x, y, w, h] in pixels from the top left. The shadow and the
    lights' bloom are outside it."""
    W, H = scene.render.resolution_x, scene.render.resolution_y
    dg = bpy.context.evaluated_depsgraph_get()
    P = np.array(cam.calc_matrix_camera(dg, x=W, y=H, scale_x=scene.render.pixel_aspect_x, scale_y=scene.render.pixel_aspect_y))
    M = P @ np.array(cam.matrix_world.inverted())
    lo = np.array([1e9, 1e9])
    hi = np.array([-1e9, -1e9])
    for o in objs:
        n = len(o.data.vertices)
        if not n:
            continue
        co = np.empty(n * 3, dtype=np.float64)
        o.data.vertices.foreach_get('co', co)
        co = co.reshape(-1, 3)
        mw = np.array(o.matrix_world)
        co = co @ mw[:3, :3].T + mw[:3, 3]
        clip = np.c_[co, np.ones(len(co))] @ M.T
        ndc = clip[:, :2] / clip[:, 3:4]
        px = np.c_[(ndc[:, 0] + 1) / 2 * W, (1 - ndc[:, 1]) / 2 * H]
        lo = np.minimum(lo, px.min(axis=0))
        hi = np.maximum(hi, px.max(axis=0))
    return [round(float(lo[0]), 1), round(float(lo[1]), 1), round(float(hi[0] - lo[0]), 1), round(float(hi[1] - lo[1]), 1)]


def to_px(scene, cam, co):
    p = world_to_camera_view(scene, cam, mathutils.Vector(co))
    return [round(p.x * scene.render.resolution_x, 1), round((1 - p.y) * scene.render.resolution_y, 1)]


def tail_points(objs, shaders):
    """Centres of the tail-light faces, one per side (and a centre strip)."""
    groups = {}
    for o in objs:
        slots = o.material_slots
        mw = o.matrix_world
        for p in o.data.polygons:
            if p.material_index < len(slots) and slots[p.material_index].material == shaders['tail']:
                c = mw @ p.center
                key = 'L' if c.y > 0.15 else 'R' if c.y < -0.15 else 'C'
                g = groups.setdefault(key, [mathutils.Vector((0, 0, 0)), 0.0])
                g[0] += c * p.area
                g[1] += p.area
    return {k: tuple(v[0] / v[1]) for k, v in groups.items() if v[1] > 0}


# ---------------------------------------------------------------------------
# Passes


def set_pass(shaders, glow, which):
    """beauty: everything. lights: only the tail lights, at full burn."""
    own = set(shaders.values())
    for name, mat in shaders.items():
        nt = mat.node_tree
        out = nt.nodes['Material Output']
        bsdf = nt.nodes['Principled BSDF']
        if name == 'tail':
            lights = which == 'lights'
            bsdf.inputs['Emission Strength'].default_value = 3.0 if lights else glow
            # Alone, the lens is only its light: no lit body colour and no
            # glints of the rig, which would bake white streaks into the layer.
            bsdf.inputs['Base Color'].default_value = lin('#000000') if lights else lin('#5A0608')
            bsdf.inputs['Coat Weight'].default_value = 0.0 if lights else 1.0
            bsdf.inputs['Specular IOR Level'].default_value = 0.0 if lights else 0.5
            continue
        if which == 'lights':
            hold = nt.nodes.get('holdout') or nt.nodes.new('ShaderNodeHoldout')
            hold.name = 'holdout'
            nt.links.new(hold.outputs[0], out.inputs['Surface'])
        else:
            nt.links.new(bsdf.outputs[0], out.inputs['Surface'])
    # Materials kept or recoloured from the model are held out too.
    for mat in bpy.data.materials:
        if mat in own or not mat.node_tree:
            continue
        nt = mat.node_tree
        out = next((n for n in nt.nodes if n.type == 'OUTPUT_MATERIAL' and n.is_active_output), None) or next(
            (n for n in nt.nodes if n.type == 'OUTPUT_MATERIAL'), None)
        if not out:
            continue
        if which == 'lights':
            links = out.inputs['Surface'].links
            if links and links[0].from_node.type != 'HOLDOUT':
                mat['_surface_from'] = links[0].from_node.name
                mat['_surface_socket'] = links[0].from_socket.identifier
            hold = nt.nodes.get('holdout') or nt.nodes.new('ShaderNodeHoldout')
            hold.name = 'holdout'
            nt.links.new(hold.outputs[0], out.inputs['Surface'])
        elif '_surface_from' in mat:
            src = nt.nodes.get(mat['_surface_from'])
            if src:
                sock = next((o for o in src.outputs if o.identifier == mat.get('_surface_socket')), src.outputs[0])
                nt.links.new(sock, out.inputs['Surface'])
    ground = bpy.context.scene.objects.get('ground')
    if ground:
        ground.hide_render = which == 'lights'


def read_png(path):
    img = bpy.data.images.load(path, check_existing=False)
    w, h = img.size
    px = np.empty(w * h * 4, dtype=np.float32)
    img.pixels.foreach_get(px)
    bpy.data.images.remove(img)
    return px.reshape(h, w, 4)


def write_png(path, px):
    h, w = px.shape[:2]
    img = bpy.data.images.new('out', w, h, alpha=True)
    img.pixels.foreach_set(np.clip(px, 0, 1).astype(np.float32).ravel())
    img.filepath_raw = path
    img.file_format = 'PNG'
    img.save()
    bpy.data.images.remove(img)


def box_blur(a, r, axis):
    if r < 1:
        return a
    pad = [(0, 0)] * a.ndim
    pad[axis] = (r + 1, r)
    c = np.cumsum(np.pad(a, pad, mode='edge'), axis=axis)
    hi = np.take(c, range(2 * r + 1, c.shape[axis]), axis=axis)
    lo = np.take(c, range(0, c.shape[axis] - 2 * r - 1), axis=axis)
    return (hi - lo) / (2 * r + 1)


def blur(a, r):
    for _ in range(3):
        a = box_blur(box_blur(a, r, 0), r, 1)
    return a


def bloom(path, width):
    """The lights pass as the app layers it: core plus a tight and a wide
    halo, as straight-alpha colour (alpha = brightness), so it looks right
    composited normally over the body and over the night."""
    px = read_png(path)
    rgb = px[..., :3] * px[..., 3:4]  # premultiplied light
    s = width / 1200.0
    glow = rgb + blur(rgb, max(1, int(5 * s))) * 1.2 + blur(rgb, max(1, int(20 * s))) * 0.9
    # The colour is the glow over its own peak, not the clipped peak: past 1,
    # clipping red while green and blue kept growing turned cores pink-white.
    peak = glow.max(axis=2, keepdims=True)
    a = np.clip(peak, 0, 1)
    col = np.clip(np.where(peak > 1e-4, glow / np.maximum(peak, 1e-4), 0), 0, 1)
    write_png(path, np.concatenate([col, a], axis=2))


def fade_edges(path):
    """The contact shadow fades out before the image's edges, so it never ends
    on a hard line wherever the app lays the image. frame_camera keeps the
    vehicle inside these margins (3% each side, 5% above, 7% below), so only
    the shadow is touched."""
    px = read_png(path)
    h, w = px.shape[:2]

    def ramp(n, margin):
        t = np.clip(np.arange(n) / max(margin, 1.0), 0, 1)
        return t * t * (3 - 2 * t)

    across = np.minimum(ramp(w, 0.03 * w), ramp(w, 0.03 * w)[::-1])
    # Blender's rows run bottom up.
    up = np.minimum(ramp(h, 0.07 * h), ramp(h, 0.05 * h)[::-1])
    px[..., 3] *= up[:, None] * across[None, :]
    write_png(path, px)


def preview(out_dir, view):
    beauty = os.path.join(out_dir, '%s-beauty.png' % view)
    lights = os.path.join(out_dir, '%s-lights.png' % view)
    if not os.path.exists(beauty):
        return
    b = read_png(beauty)
    bg = np.ones_like(b[..., :3]) * srgb01(CANVAS)
    comp = b[..., :3] * b[..., 3:4] + bg * (1 - b[..., 3:4])
    if os.path.exists(lights):
        l = read_png(lights)
        comp = l[..., :3] * l[..., 3:4] + comp * (1 - l[..., 3:4])
    out = np.concatenate([comp, np.ones_like(comp[..., :1])], axis=2)
    write_png(os.path.join(out_dir, '%s-preview.png' % view), out)


# ---------------------------------------------------------------------------


def load_specs():
    specs = []
    for path in sorted(glob.glob(os.path.join(SPECS, '*.json'))):
        with open(path) as f:
            specs.append(with_livery(json.load(f)))
    return specs


def inspect(spec):
    reset()
    objs = import_model(os.path.join(ROOT, spec['source']))
    print('===== %s  (%s)' % (spec['bodyType'], spec['source']))
    total = 0
    for o in sorted([o for o in bpy.context.scene.objects], key=lambda o: o.name):
        if o.type == 'MESH':
            tris = sum(len(p.vertices) - 2 for p in o.data.polygons)
            total += tris
            mats = [s.material.name if s.material else None for s in o.material_slots]
            c = object_centre(o) if len(o.data.vertices) else (0, 0, 0)
            print('  mesh   %-40s tris=%-7d centre=(%.2f, %.2f, %.2f) mats=%s' % (o.name[:40], tris, c[0], c[1], c[2], mats))
        else:
            print('  %-6s %s' % (o.type.lower(), o.name))
    print('  total tris', total)
    for m in sorted(bpy.data.materials, key=lambda m: m.name):
        tex = texture_node(m)
        c = mean_colour(m)
        print('  material %-36s colour=#%02x%02x%02x tex=%s' % (
            m.name[:36], *(int(max(0, min(1, x)) ** (1 / 2.2) * 255) for x in c),
            tex.image.name if tex and tex.image else None))


def bake(spec):
    reset()
    import_model(os.path.join(ROOT, spec['source']))
    objs = prepare_objects(spec)
    lo, hi = normalise(spec, objs)
    shaders, roles = assign_roles(spec, objs)
    glow = spec.get('tailGlow', 0.0)
    add_tail_lights(spec, shaders, lo, hi)
    objs = meshes()
    apply_livery(spec, shaders, objs, lo, hi)
    out_dir = os.path.join(args.out, spec['bodyType'])
    os.makedirs(out_dir, exist_ok=True)
    tails = tail_points(objs, shaders)
    meta = {
        'bodyType': spec['bodyType'],
        'lengthM': spec['lengthM'],
        'paint': spec['paint'],
        'sizeM': [round(hi.x - lo.x, 3), round(hi.y - lo.y, 3), round(hi.z - lo.z, 3)],
        'views': {},
    }
    scene = bpy.context.scene
    for view in VIEWS:
        rig(spec, lo, hi, view)
        cam = frame_camera(view, lo, hi, args.width)
        for p in PASSES:
            set_pass(shaders, glow, p)
            # The lights pass is tone-mapped flat: AgX rolls a bright red off
            # to pink-white, and a tail light must stay red.
            scene.view_settings.view_transform = 'Standard' if p == 'lights' else 'AgX'
            # The lights pass is emission over holdouts: it settles in a few samples.
            scene.cycles.samples = min(args.samples, 32) if p == 'lights' else args.samples
            path = os.path.join(out_dir, '%s-%s.png' % (view, p))
            scene.render.filepath = path
            bpy.ops.render.render(write_still=True)
            if p == 'lights':
                bloom(path, args.width)
            else:
                fade_edges(path)
            print('[bake] wrote', path)
        set_pass(shaders, glow, 'beauty')
        # The vehicle's box; its foot is where the nearest tyre meets the road.
        box = projected_box(scene, cam, [o for o in meshes() if o.name != 'ground'])
        meta['views'][view] = {
            'width': scene.render.resolution_x,
            'height': scene.render.resolution_y,
            'box': box,
            'groundY': round(box[1] + box[3], 1),
            'tailLights': {k: to_px(scene, cam, v) for k, v in tails.items()},
        }
        if args.preview:
            preview(out_dir, view)
        bpy.data.objects.remove(cam, do_unlink=True)
    with open(os.path.join(out_dir, 'meta.json'), 'w') as f:
        json.dump(meta, f, indent=2)


for spec in load_specs():
    if ONLY and spec['bodyType'] not in ONLY:
        continue
    if not os.path.exists(os.path.join(ROOT, spec['source'])):
        print('[bake] SKIP %s: source missing (%s)' % (spec['bodyType'], spec['source']))
        continue
    if args.inspect:
        inspect(spec)
    else:
        bake(spec)
