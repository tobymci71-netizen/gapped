"""
Liveries (docs/VEHICLE_ART.md): the pattern painted over a body type's paint,
built as shader nodes so it follows the bodywork in every view. bake.py reads
liveries.json and calls into here; nothing here imports bake.py.

A livery is layers of bands in the vehicle's own space after bake.py has
normalised it (nose to +X, wheels on z=0, centred):

  x   0 at the tail, 1 at the nose
  y   -1 to 1 across; 0 is the centre line, -1 the flank the side and rear34
      cameras see
  z   0 at the road. 1 is the roof, or with "zRef": "belt" the belt line
      (where the side windows start), so a coachline sits on the shoulder of
      any body

Each layer paints its colour wherever every band it names holds:

  {"colour": "Pearl",
   "x": [a, b], "y": [a, b], "z": [a, b],
   "absY": true,        mirror y, for stripes either side of the centre line
   "slant": true,       x bands lean toward the nose at the logo's 14 degrees
   "repeat": [n, step], n copies of the x band, step apart
   "faces": "side",     only flanks ("side"), or only upward faces ("top")
   "zM": [a, b],        a z band in metres off the road, for a pattern that
                        has to line up with "checker"
   "checker": 0.12,     only every other square of a chequer this many metres
                        on a side, along the flank
   "disc": [x, z, r],   a roundel on the flank: centred at x and z (as above),
                        r metres across the radius
   "finish": "satin"}   a finish of its own (default: the colour's)

Later layers paint over earlier ones.
"""

import math

SLANT = math.tan(math.radians(14))


class Graph:
    """A few shader-node helpers over one material's node tree."""

    def __init__(self, nt):
        self.nt = nt
        geo = nt.nodes.new('ShaderNodeNewGeometry')
        pos = nt.nodes.new('ShaderNodeSeparateXYZ')
        nrm = nt.nodes.new('ShaderNodeSeparateXYZ')
        nt.links.new(geo.outputs['Position'], pos.inputs[0])
        nt.links.new(geo.outputs['Normal'], nrm.inputs[0])
        self.x, self.y, self.z = pos.outputs[0], pos.outputs[1], pos.outputs[2]
        self.ny, self.nz = nrm.outputs[1], nrm.outputs[2]

    def put(self, sock, v):
        if isinstance(v, (int, float, tuple, list)):
            sock.default_value = v
        else:
            self.nt.links.new(v, sock)

    def math(self, op, a, b=0.0):
        m = self.nt.nodes.new('ShaderNodeMath')
        m.operation = op
        self.put(m.inputs[0], a)
        self.put(m.inputs[1], b)
        return m.outputs[0]

    def band(self, v, a, b):
        return self.math('MULTIPLY', self.math('GREATER_THAN', v, a), self.math('LESS_THAN', v, b))

    def mix(self, kind, fac, a, b):
        """kind 'RGBA' or 'FLOAT': a where fac is 0, b where it is 1."""
        m = self.nt.nodes.new('ShaderNodeMix')
        m.data_type = kind
        ins = {s.identifier: s for s in m.inputs}
        suffix = 'Color' if kind == 'RGBA' else 'Float'
        self.put(ins['Factor_Float'], fac)
        self.put(ins['A_' + suffix], a)
        self.put(ins['B_' + suffix], b)
        return next(o for o in m.outputs if o.identifier == 'Result_' + suffix)


def layer_mask(g, layer, box):
    """1 where the layer paints, 0 elsewhere."""
    lo, hi, belt = box
    length = hi.x - lo.x
    half = (hi.y - lo.y) / 2
    zscale = belt if layer.get('zRef') == 'belt' else hi.z - lo.z
    terms = []
    if 'x' in layer:
        x = g.math('DIVIDE', g.math('SUBTRACT', g.x, lo.x), length)
        if layer.get('slant'):
            x = g.math('SUBTRACT', x, g.math('MULTIPLY', g.z, SLANT / length))
        a, b = layer['x']
        n, step = layer.get('repeat', [1, 0.0])
        m = None
        for i in range(n):
            one = g.band(x, a + i * step, b + i * step)
            m = one if m is None else g.math('MAXIMUM', m, one)
        terms.append(m)
    if 'y' in layer:
        y = g.math('DIVIDE', g.y, half)
        if layer.get('absY'):
            y = g.math('ABSOLUTE', y)
        terms.append(g.band(y, *layer['y']))
    if 'z' in layer:
        terms.append(g.band(g.math('DIVIDE', g.z, zscale), *layer['z']))
    if 'zM' in layer:
        terms.append(g.band(g.z, *layer['zM']))
    if 'disc' in layer:
        cx, cz, r = layer['disc']
        dx = g.math('SUBTRACT', g.x, lo.x + cx * length)
        dz = g.math('SUBTRACT', g.z, cz * zscale)
        d2 = g.math('ADD', g.math('MULTIPLY', dx, dx), g.math('MULTIPLY', dz, dz))
        terms.append(g.math('LESS_THAN', d2, r * r))
    if 'checker' in layer:
        size = layer['checker']
        cells = g.math('ADD', g.math('FLOOR', g.math('DIVIDE', g.x, size)), g.math('FLOOR', g.math('DIVIDE', g.z, size)))
        # Offset so the cell count is positive before the modulo (x runs negative).
        terms.append(g.math('MODULO', g.math('ADD', cells, 1000.0), 2.0))
    faces = layer.get('faces')
    if faces == 'side':
        terms.append(g.math('GREATER_THAN', g.math('ABSOLUTE', g.ny), 0.35))
    elif faces == 'top':
        terms.append(g.math('GREATER_THAN', g.nz, 0.35))
    if not terms:
        return 1.0
    m = terms[0]
    for t in terms[1:]:
        m = g.math('MULTIPLY', m, t)
    return m


def finish_key(layer):
    return (layer['colour'], layer.get('finish'))


def pattern_principled(mat, layers, box, finishes):
    """Lay the layers over a plain paint material. finishes: finish_key(layer)
    -> (linear rgba, metallic, roughness, coat)."""
    nt = mat.node_tree
    bsdf = nt.nodes['Principled BSDF']
    g = Graph(nt)
    col = tuple(bsdf.inputs['Base Color'].default_value)
    met = bsdf.inputs['Metallic'].default_value
    rough = bsdf.inputs['Roughness'].default_value
    coat = bsdf.inputs['Coat Weight'].default_value
    for layer in layers:
        rgba, m, r, c = finishes[finish_key(layer)]
        mask = layer_mask(g, layer, box)
        col = g.mix('RGBA', mask, col, rgba)
        met = g.mix('FLOAT', mask, met, m)
        rough = g.mix('FLOAT', mask, rough, r)
        coat = g.mix('FLOAT', mask, coat, c)
    g.put(bsdf.inputs['Base Color'], col)
    g.put(bsdf.inputs['Metallic'], met)
    g.put(bsdf.inputs['Roughness'], rough)
    g.put(bsdf.inputs['Coat Weight'], coat)


def pattern_texture(mat, tex, layers, box, images, finishes):
    """Lay the layers over a repainted texture atlas: a copy of the atlas per
    colour (images: colour name -> image, repainted the same way), switched
    by the masks. Pixels that are not paint are the same in every copy. Each
    layer's finish goes on the atlas's own shader too, wherever a map does
    not already drive that input (metallic as the recolour sets it: 0.6 of
    the finish's)."""
    nt = mat.node_tree
    g = Graph(nt)
    bsdf = next((n for n in nt.nodes if n.type == 'BSDF_PRINCIPLED'), None)
    uv = tex.inputs['Vector'].links[0].from_socket if tex.inputs['Vector'].links else None
    targets = [l.to_socket for l in tex.outputs['Color'].links]
    col = tex.outputs['Color']
    free = {}
    if bsdf is not None:
        for name in ('Metallic', 'Roughness', 'Coat Weight'):
            if not bsdf.inputs[name].links:
                free[name] = bsdf.inputs[name].default_value
    for layer in layers:
        t = nt.nodes.new('ShaderNodeTexImage')
        t.image = images[layer['colour']]
        t.interpolation = tex.interpolation
        t.extension = tex.extension
        if uv is not None:
            nt.links.new(uv, t.inputs['Vector'])
        mask = layer_mask(g, layer, box)
        col = g.mix('RGBA', mask, col, t.outputs['Color'])
        _, m, r, c = finishes[finish_key(layer)]
        for name, value in (('Metallic', m * 0.6), ('Roughness', r), ('Coat Weight', c)):
            if name in free:
                free[name] = g.mix('FLOAT', mask, free[name], value)
    for sock in targets:
        nt.links.new(col, sock)
    for name, value in free.items():
        g.put(bsdf.inputs[name], value)
