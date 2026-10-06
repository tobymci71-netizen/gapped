"""
Prep for the sportbike (appsnation "Sports Bike", CC BY 4.0; a close copy of a
Ducati superbike).

The FBX (3ds Max) is one mesh per material under a 'Car Rig' empty, nose to -Y,
no rider, stand, ground or plate. This:

  - drops the one-frame 'Take 001' actions on every object (left on, they put
    the 0.001 scale back at render time and the bake renders an empty frame),
    and flattens the rig into plain world-space meshes named part_<material>;
  - deletes the 'decals' cards: the whole livery (stripes, model names, logos)
    is textured onto them from mainTex.png, which nothing else uses;
  - splits the red reflector on the number-plate hanger off 'glass_red' into
    its own material 'reflector' (mapped to trim), so only the tail light
    under the tail cowl glows.

Every other material keeps its name; the spec maps them to roles. Saves
art-source/vehicles/sportbike/model.blend.

    scripts/render-vehicles/slot.sh ~/Applications/Blender.app/Contents/MacOS/Blender -b \
        -P scripts/render-vehicles/prep/sportbike.py
"""

import os

import bpy

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))
SRC = os.path.join(ROOT, 'art-source/vehicles/_downloads/sports-bike/source/Ducati bike/Bike.FBX')
OUT = os.path.join(ROOT, 'art-source/vehicles/sportbike/model.blend')

bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.fbx(filepath=SRC, use_custom_normals=True)
scene = bpy.context.scene

# The FBX carries a one-frame 'Take 001' action on every object (the 3ds Max
# rig: parent empty, objects at 0.001 scale). bake.py bakes the transforms into
# the meshes but leaves the actions on, so at render time the action puts the
# old transforms back on top and the bike renders off camera (an empty image).
# Drop every action, then flatten the hierarchy into world-space meshes.
for o in scene.objects:
    o.animation_data_clear()
for a in list(bpy.data.actions):
    bpy.data.actions.remove(a)
bpy.context.view_layer.update()

bpy.ops.object.select_all(action='DESELECT')
for o in scene.objects:
    o.select_set(True)
bpy.context.view_layer.objects.active = next(o for o in scene.objects if o.type == 'MESH')
bpy.ops.object.parent_clear(type='CLEAR_KEEP_TRANSFORM')
for o in list(scene.objects):
    if o.type != 'MESH':
        bpy.data.objects.remove(o, do_unlink=True)
bpy.ops.object.select_all(action='SELECT')
bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)

# Name each mesh after its one material, so the bake's object filters can
# address them.
for o in scene.objects:
    mats = [s.material.name for s in o.material_slots if s.material]
    if mats:
        o.name = 'part_' + mats[0]

# The livery: 'decals' is a set of thin cards laid over the fairing, fork legs,
# tail and dash, textured from mainTex.png (stripes, model names, logos).
# Delete them outright; the fairing under them is whole.
for o in list(scene.objects):
    if any(s.material and s.material.name == 'decals' for s in o.material_slots):
        bpy.data.objects.remove(o, do_unlink=True)


def islands(mesh):
    """Loose parts of a mesh as lists of polygon indices."""
    import bmesh
    bm = bmesh.new()
    bm.from_mesh(mesh)
    bm.faces.ensure_lookup_table()
    seen, out = set(), []
    for f in bm.faces:
        if f.index in seen:
            continue
        stack, comp = [f], []
        seen.add(f.index)
        while stack:
            g = stack.pop()
            comp.append(g.index)
            for e in g.edges:
                for h in e.link_faces:
                    if h.index not in seen:
                        seen.add(h.index)
                        stack.append(h)
        out.append(comp)
    bm.free()
    return out


# 'glass_red' is two parts: the tail light (the lens under the tail cowl, the
# real light unit) and a flat red reflector on the number-plate hanger, the
# rearmost point of the bike. Only the tail light may glow, so the reflector
# gets its own material ('reflector', mapped to trim in the spec).
red = next(o for o in scene.objects if o.name == 'part_glass_red')
reflector = bpy.data.materials.new('reflector')
red.data.materials.append(reflector)
ref_idx = len(red.data.materials) - 1
parts = islands(red.data)
# Source space: the nose is -Y, so the rearmost part has the largest Y.
def part_y(comp):
    return max(red.data.polygons[i].center.y for i in comp)
parts.sort(key=part_y)
for comp in parts[1:]:
    for i in comp:
        red.data.polygons[i].material_index = ref_idx
print('[prep] glass_red parts: %d, %d face(s) to reflector' % (len(parts), sum(len(c) for c in parts[1:])))

os.makedirs(os.path.dirname(OUT), exist_ok=True)
bpy.ops.wm.save_as_mainfile(filepath=OUT, compress=True)
print('[prep] saved', OUT)
