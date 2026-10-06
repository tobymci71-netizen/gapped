# Vehicle art

Every body type (`src/vehicles/bodyType.ts`) has a real 3D model behind it. The
models are rendered offline in Blender, re-painted and lit in the Nightrun look,
and the app ships the renders as images. No 3D file and no 3D runtime ships in
the app.

The person's pick reaches the art like this: make and model, then `cleanName`,
then `inferBodyType`, then the body type's renders. Their own photo, when they
add one, still wins over the render.

## Look

- **One rig for all of them.** A street light overhead, white rim lights behind
  the vehicle as the camera sees it (they trace its outline), a dim blue night
  fill and a soft card from the camera side. The background is transparent: the
  app draws the night.
- **Every body type has its own livery, in the app's colours.** The paints
  are the theme's own: the night's blacks and blues, the rank metals (silver,
  champagne, bronze), white, and the primary button's deep red (`accentFill`,
  #D02226), which the liveries call Racing red. Each body type has a
  different pattern over its paint — stripes, slashes at the logo's 14°
  slant, coachlines, a two-tone roof or lower body, a chequer band — and every
  pattern shows side on, where most screens see it. Racing red is paint (the
  roadster, the sports bike's lower fairing, and stripes, slashes and lines),
  never the light red (`accent`) and never a glow: the tail lights are the
  only red that glows.
- **Logos and liveries from the source go.** Every model is re-materialled
  (paint, glass, tyres, rims, trim, chrome), so badges, decals and brand text
  painted into the source textures are gone.
- **Tail lights** are rendered twice: as a dark red lens in the beauty pass,
  and alone, emissive red with their bloom, in the lights pass. The app lays
  the lights over the body to turn them on, ignite them and breathe them, so
  "off" (a placeholder, the drive avatar) really is off.
- **The ground is a wet night road** that only its shadow shows: lower panels
  reflect the dark road, not a lit floor, and the contact shadow fades out
  before the image's edges, so it never ends on a hard line in the app.

<!-- liveries:start -->
| Body type | Livery | Paint |
|---|---|---|
| hatchback | Horizon blue, twin pearl stripes and a side stripe | Horizon `#3D5598`, metallic |
| saloon | Midnight blue, silver and red coachlines | Midnight `#1A2752`, metallic |
| estate | Silver, obsidian roof | Silver `#C8CDD4`, metallic |
| coupe | Obsidian, three red slashes | Obsidian `#0B0C10`, solid |
| roadster | Racing red, pearl Le Mans stripe and roundel | Racing red `#D02226`, solid |
| supercar | Champagne, obsidian tail split on the slant | Champagne `#E8C468`, metallic |
| suv | Gunmetal, obsidian lower with a red pinline | Gunmetal `#3A4156`, satin |
| pickup | Bronze, obsidian rally band | Bronze `#C98A55`, metallic |
| van | Pearl, obsidian chequer band | Pearl `#F2F3F5`, pearl |
| motorbike | Night steel, red tank stripes | Night steel `#8A90A2`, metallic |
| sportbike | Pearl, red lower fairing, obsidian slashes | Pearl `#F2F3F5`, pearl |
| cruiser | Obsidian, champagne coachlines | Obsidian `#0B0C10`, solid |
| scooter | Oxblood, pearl lower | Oxblood `#4A1019`, metallic |

The palette, each colour a theme token (src/theme/tokens.ts) or lifted from one where the token itself would not read as paint:

| Colour | Hex | Finish | From the theme |
|---|---|---|---|
| Obsidian | `#0B0C10` | solid | after `color.canvas`: a step up so a body still reads on it |
| Midnight | `#1A2752` | metallic | after `color.surface2`: lifted to read as paint |
| Horizon | `#3D5598` | metallic | `color.horizon` |
| Gunmetal | `#3A4156` | satin | `color.outline` |
| Night steel | `#8A90A2` | metallic | `color.text3` |
| Silver | `#C8CDD4` | metallic | `color.rank2` |
| Pearl | `#F2F3F5` | pearl | after `color.text1`: a touch off white |
| Champagne | `#E8C468` | metallic | `color.rank1` |
| Bronze | `#C98A55` | metallic | `color.rank3` |
| Racing red | `#D02226` | solid | `color.accentFill` |
| Oxblood | `#4A1019` | metallic | after `color.accentTile`: deepened from 12% red to a paint |
<!-- liveries:end -->

## Liveries

`scripts/render-vehicles/liveries.json` holds the palette and each body
type's livery (every body type needs one: it is where the paint comes from);
`livery.py` builds them as shader nodes, so a pattern follows the bodywork in
every view. A livery has a `name`, its base `paint` (a palette colour), an
optional `rim` (wheel colour) and `belt` (the belt line as a fraction of the
height, where ray-casting cannot find it: an open car, side windows painted
into a texture), and `layers` painted over the paint in order. Each layer
paints a palette colour wherever all of its bands hold, in the vehicle's own
space:

| Field | Meaning |
|---|---|
| `x` | `[a, b]` along the length: 0 the tail, 1 the nose |
| `y` | `[a, b]` across: -1 to 1, 0 the centre line, -1 the flank the side and rear34 cameras see. `absY` mirrors it, for stripes either side of the centre |
| `z` | `[a, b]` up: 0 the road, 1 the roof; with `zRef: "belt"`, 1 is the belt line, found by ray-casting the flank for where the side glass starts (or the livery's `belt`, a fraction of the height, for an open car or a bike) |
| `zM` | `[a, b]` up, in metres, to line up with a chequer |
| `slant` | the `x` band leans toward the nose at the logo's 14° |
| `repeat` | `[n, step]`: n copies of the `x` band |
| `faces` | `side` (the flanks only) or `top` (upward faces only) |
| `checker` | only every other square of a chequer this many metres on a side |
| `disc` | `[x, z, r]`: a roundel on the flank, centred at `x` and `z` (as above, `zRef` too), `r` metres in radius |
| `finish` | the layer's own finish (default: its colour's) |

## Rendering

Blender 5.2 (free, blender.org) is installed at `~/Applications/Blender.app`.
The source models live in `art-source/vehicles/`, which is gitignored: they are
large, and some were downloaded by hand from Sketchfab (an account is needed).

```sh
# One body type, quick previews composited on the app's night canvas:
~/Applications/Blender.app/Contents/MacOS/Blender -b -P scripts/render-vehicles/bake.py -- \
  --out build/vehicle-previews --only coupe --width 900 --samples 48 --preview

# What a model is made of (objects, triangles, materials and their colours):
~/Applications/Blender.app/Contents/MacOS/Blender -b -P scripts/render-vehicles/bake.py -- \
  --out /tmp/x --only coupe --inspect
```

`scripts/render-vehicles/preview.sh <bodyType>` wraps the preview run and lets
only a few Blender processes run at once.

### Rebuilding the shipped renders

1. Download each model in its original format from the page in *Sources and
   licences* (a free Sketchfab account), and unzip it into
   `art-source/vehicles/_downloads/<slug>/`, the slug being the page's
   (`generic-passenger-car-pack`, `generic-civil-service-vehicles-pack`,
   `generic-sedan-car`, `generic-sport-coupe-car`,
   `fictional-supercar-v12-goblin`, `motorcycle`, `sports-bike`,
   `moped-motorcycle`, `electric-scooter`).
2. Run each body type's prep, which writes the `model.blend` its spec reads
   (every body type but the saloon has one):
   `~/Applications/Blender.app/Contents/MacOS/Blender -b -P scripts/render-vehicles/prep/<bodyType>.py`
3. Bake all of them at full size into `build/vehicle-renders/` (about 7
   minutes a body type on an M-series Mac; two or three bakes can run side by
   side):
   `~/Applications/Blender.app/Contents/MacOS/Blender -b -P scripts/render-vehicles/bake.py -- --out build/vehicle-renders --width 1200 --samples 112`
4. `node scripts/render-vehicles/export.mjs` (needs `cwebp`: `brew install
   webp`) writes `assets/vehicles/` and the generated
   `src/vehicles/art/manifest.ts`. `src/vehicles/art/__tests__/manifest.test.ts`
   checks every body type has every view and the set stays under its size.

### Views

| View | Camera | Used for |
|---|---|---|
| `side` | square on, nose to the right | onboarding steps, thumbnails, the drive avatar |
| `rear` | from behind, a little above | the Drive, Garage and Ranks heroes, the welcome hero, the cornering gauge |
| `rear34` | behind and to one side | the setup hero |

### Spec fields

`scripts/render-vehicles/specs/<bodyType>.json`:

| Field | Meaning |
|---|---|
| `bodyType` | the body type it renders |
| `source` | the model, relative to the repo root (`.fbx`, `.glb`, `.gltf`, `.obj`, `.blend`) |
| `lengthM` | real length in metres; the model is scaled to it |
| `paint` | optional `{ rim?, second? }`: `rim`, the wheel colour; `second`, the darker tone for two-tone trim panels. The colour itself comes from the livery (`liveries.json`), whose `rim` wins |
| `forward` | where the nose points as imported: `+x` (default), `-x`, `+y`, `-y` |
| `up` | `z` (default), `y` or `-y` for models stood on Y |
| `rotateZ` | extra degrees about the vertical, after `forward` |
| `flipY` | mirror left to right |
| `include` / `exclude` | object-name substrings: which objects of a pack to keep or drop |
| `keepNearby` | with `include`: also keep any mesh whose centre is inside the included objects' box, grown by 8% (a pack's wheels, named apart from their car) |
| `hideObjects` | object-name substrings to delete (riders, stands, display bases) |
| `dropShadowCards` | default true: drop objects named shadow, ground, floor or plane |
| `materials` | `{ "<source material name>": "<role>" }`, overriding the name rules |
| `materialRules` | `[["<role>", ["substring", ...]], ...]`, tried before the built-in rules |
| `paintMaterial` | the source material that is the body paint |
| `recolour` | `[{ material, from, tolerance?, restScale? }]`: repaint a texture atlas, turning pixels near `from` into the paint and darkening the rest |
| `tailLights` | `[{ y, z, w, h, mirror? }]` in metres (nose +X, centre line y = 0, ground z = 0): emissive panels laid on the rear surface, for models whose lights are only painted in a texture |
| `tailGlow` | a glow for the tail lights in the beauty pass (default 0: the lens is dark there, and the lights pass carries the light) |
| `exposure` | scales every light (default 1) |
| `cardScale` | scales the camera-side card that shows the paint colour (default 1) |
| `prep` | optional script in `scripts/render-vehicles/prep/` that edits the source and saves the file `source` points to |

Roles: `paint`, `paint2`, `trim`, `glass`, `tyre`, `rim`, `chrome`, `metal`,
`interior`, `head`, `tail`, `emissive_off`, `keep` (leave the source material
alone), `recolour` (see `recolour`), `hide` (delete those faces: decals, labels).

## Sources and licences

Credited on the in-app Acknowledgements page. CC BY 4.0 requires the credit and
a note that the work was changed. All were changed the same way: textures
removed (or, for the hatchback, its body atlas repainted), materials replaced,
painted in a livery, re-lit.

| Body type | Model | Author | Licence | Page |
|---|---|---|---|---|
| hatchback, estate, suv, pickup | Generic passenger car pack | Comrade1280 | CC BY 4.0 | https://sketchfab.com/3d-models/generic-passenger-car-pack-20f9af9b8a404d5cb022ac6fe87f21f5 |
| van | Generic civil service vehicles pack | Comrade1280 | CC BY 4.0 | https://sketchfab.com/3d-models/generic-civil-service-vehicles-pack-8ff2a13f30914932a70c7950cfa58465 |
| saloon | Generic Sedan Car | MMC Works | CC BY 4.0 | https://sketchfab.com/3d-models/generic-sedan-car-58c33766470d46e7b2aed542650494e5 |
| coupe, roadster | Generic Sport Coupé Car (the roadster with its roof cut away, `prep/roadster.py`) | MMC Works | CC BY 4.0 | https://sketchfab.com/3d-models/generic-sport-coupe-car-820a13c4831c41959ce75e6c2014e882 |
| supercar | Fictional supercar - V12 Goblin | ollitei | CC BY 4.0 | https://sketchfab.com/3d-models/fictional-supercar-v12-goblin-0a20e49ad5774d778567cb5c3f345786 |
| motorbike | Motorcycle | eriklys | CC BY 4.0 | https://sketchfab.com/3d-models/motorcycle-135b505f55bb4da0b82b8987a34443b2 |
| sportbike | Sports Bike | appsnation | CC BY 4.0 | https://sketchfab.com/3d-models/sports-bike-a80259b859c842d5824c25c61e0fc421 |
| cruiser | Moped, motorcycle. | lexpartizan | CC BY 4.0 | https://sketchfab.com/3d-models/moped-motorcycle-3dfd252d4f4e4275a5544cdeb07226dc |
| scooter | Electric Scooter | Rzyas | CC BY 4.0 | https://sketchfab.com/3d-models/electric-scooter-97ce811fbdd144c6a4f3b7912f4b1bc2 |

Downloaded 5–6 October 2026. Two models are close copies of real bikes (the
motorbike of a Honda CB650R, the sportbike of a Ducati); their badges and
liveries are removed, and only the shapes remain.
