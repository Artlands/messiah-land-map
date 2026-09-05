# Messiah Land Map · 弥赛亚之地

An interactive relief map of first-century Israel, built on measured elevation
data rather than decorative terrain. Pan the land, tilt the horizon, and read
the Gospel narratives against the distances and height differences they actually
happened in.

**Live:** https://lijie.me/messiah-land-map/ (also at
https://artlands.github.io/messiah-land-map/)

The interface reads in Simplified Chinese, Traditional Chinese or English;
this document is the technical reference.

---

## What is on the map

| Layer | Source | Notes |
| --- | --- | --- |
| Terrain | NASA SRTM, sampled on a 0.02° grid | 116 × 158 = 18,328 nodes, 34.20–36.50°E / 30.60–33.75°N |
| Coastline | Natural Earth 10m physical | Real shore, including the Carmel headland and the Bay of Haifa |
| Lakes | Natural Earth 10m physical | Sea of Galilee, Dead Sea, plus Lake Huleh reconstructed |
| Rivers | Natural Earth 10m river centrelines | Jordan (upper and lower), Yarmuk, Jabbok, Arnon, Zered, Kishon, Yarkon |
| Regions | Digitised from standard historical atlases | 10 polygons for the tetrarchy c. AD 30 |
| Places | 62 sites at surveyed coordinates | Gospel events, towns, and Decapolis cities |

Elevation in the sampled grid runs from **−415 m** (the Dead Sea surface) to
**2,561 m** (the Hermon massif). The true Hermon summit is 2,814 m — a 2 km grid
smooths isolated peaks, and the map does not pretend otherwise.

### First-century corrections

Two features are drawn as they were around AD 30, not as they are today:

- **The Dead Sea** is drawn with the Lisan strait closed. The northern and
  southern basins were one body of water until the level dropped and they
  separated in 1979.
- **Lake Huleh** (Σεμεχωνῖτις) is restored. The lake and its marshes were drained
  in the 1950s and appear on no modern dataset.

### Political layer

The land was not one jurisdiction when Jesus was teaching in it. The map tints
each region by who governed it:

| Ruler | Territory |
| --- | --- |
| Herod Antipas | Galilee, Peraea |
| Herod Philip | Gaulanitis, Trachonitis |
| Roman prefect | Judaea, Samaria, Idumaea |
| Decapolis | autonomous Hellenistic cities |
| Nabataean kingdom | south and south-east |
| Province of Syria | Phoenicia, Ituraea |

Boundaries are an educational approximation — no authoritative GIS dataset
exists for them — but the place coordinates underneath are measured.

---

## Controls

The map follows Google Earth, so the gestures transfer without being learned:

| | |
|---|---|
| Drag | pan the land |
| Shift-drag, right-drag, middle-drag, Ctrl-drag | orbit — left and right rotate, up and down tilt |
| Wheel or trackpad pinch | zoom towards the pointer |
| Double-click | zoom into that point (Shift to zoom out) |
| Two fingers | pinch to zoom, twist to rotate, drag up and down to tilt |
| Arrow keys | pan; hold Shift to orbit |
| `+` `-` `0` | zoom in, zoom out, reset the view |
| Compass | click to face north |

Zooming holds whatever sits under the pointer in place. A projected point is
`centre + pan + Q · scale`, where `Q` depends only on the rotation and tilt and
`scale` is proportional to the zoom while those hold, so `zoomAbout()` in
`app/terrain.ts` corrects the pan in closed form rather than reprojecting.
`scripts/check-view.mjs` pins that down.

## Rendering

The map is a heightfield painted to a 2D canvas; there is no WebGL and no 3D
library. `app/terrain.ts` holds the whole renderer:

- **Projection** — rotation about the vertical axis plus a tilt. Axonometric by
  default; the ⏢ button in the view tools switches to a one-point perspective,
  where each point is scaled by `EYE / (EYE - z)` and `z` is how far it stands
  towards the camera. `EYE = 2.4` frame units, which puts the near edge about
  1.4× the far edge — lower it for a wider, heavier cone.
  `makeFrame()` projects the frame corners through the same transform and scales
  to fit, so nothing clips at any rotation, tilt or projection.
- **Shading** — hypsometric tint (the palette convention of printed relief
  atlases) multiplied by hillshade computed from the true surface gradient in
  metres, with a distance haze so depth reads without a fog overlay.
- **Depth ordering** — terrain cells and the Mediterranean go into one
  painter's-algorithm list, so the sea occludes correctly even at a low horizon.
  Land cells are clamped to the shoreline, which keeps the coast a clean line
  instead of a staircase of half-submerged cells.
- **Vertical exaggeration** — `EXAGGERATION = 11` in `app/terrain.ts`. At 1× the
  entire relief is 0.8% of the frame and invisible; printed relief atlases of
  this region use roughly 8–15×.
- **Responsiveness** — a coarse mesh draws immediately on interaction, the full
  2 km mesh once the view settles.

Labels declutter greedily: dots always draw, names drop out when they would
collide with one already placed. Gospel sites outrank towns, the selected site
outranks everything, and a hidden label reappears on hover.

### Language toggle

The header carries a 简 / 繁 / EN toggle; the choice persists in `localStorage`.

Every visible string is authored in Simplified Chinese, and the canvas draws no
text, so the switch runs over DOM text nodes after each render instead of
threading a translation call through every component. Traditional is a script
conversion of that source, English a lookup in `app/en.json`; both start from
the Simplified text, so going 繁 → EN is not a double translation. Elements
marked `data-no-convert` are skipped — the toggle itself has to keep showing 简
and 繁 in their own scripts. `aria-label` attributes and `<html lang>` follow
the visible language.

#### Traditional

Shipping OpenCC to the browser would add roughly 6 MB of dictionaries for a
script toggle, so `scripts/build-zh-hant.mjs` runs OpenCC at build time and
emits `app/zh-hant.ts` — a table covering this site's vocabulary and nothing
else. It currently holds 233 characters and 10 phrases, and costs about 2.5 kB
gzipped.

The generator is careful about two things. Ambiguous characters (里 → 里 or 裡,
干 → 干 or 幹) take whichever reading this site's own text uses most, so the
phrase table only carries the minority cases. And phrase values always come from
converting the *whole* run, never a fragment — OpenCC reads `沿海干` out of
context as 沿海乾 and would otherwise poison the table. The script then asserts
that the emitted table reproduces OpenCC exactly across all 471 runs of Chinese
in the source, so a bad entry fails the build rather than the page.

Regenerate after changing any Chinese text:

```bash
npm run build:zh
```

#### English

`app/en.json` maps each Simplified string to its English form — 299 entries
covering the gazetteer, the region and water labels, the interface chrome and
every `aria-label`. Keys are the source text with whitespace collapsed, which is
how a DOM text node is looked up at runtime; surrounding whitespace is put back,
since a JSX text node often carries the space separating it from the next
element. A string with no entry falls through to Chinese rather than vanishing.

`scripts/check-en.mjs` extracts every user-visible Chinese string from
`page.tsx`, `places.ts` and `geo.ts` and reports what the table is missing or no
longer needs. Add English whenever you add Chinese:

```bash
npm run check:en                    # report gaps
node scripts/check-en.mjs --keys    # print the keys, ready to fill in
```

Because English words are wider than the Chinese they replace, the map's label
declutter measures the English name when English is active — otherwise most
labels would collide and drop out.

---

## Project layout

```
app/
  geo.ts        generated — DEM (Int16 + base64), coast, lakes, rivers, regions
  places.ts     the gazetteer: 62 sites with coordinates, elevations, references
  terrain.ts    projection, sampling, palette, canvas renderer
  page.tsx      the interface
  globals.css   styles
  layout.tsx    metadata for the vinext build
  zh-hant.ts    generated — Simplified→Traditional table for this vocabulary
  en.ts         English lookup over app/en.json
  en.json       Simplified→English table for every visible string
scripts/
  verify-map-data.mjs   self-check for the generated map data
  build-zh-hant.mjs     regenerates app/zh-hant.ts via OpenCC
  check-en.mjs          checks app/en.json covers every visible Chinese string
  check-view.mjs        self-check for the map view maths the controls rely on
src/entry.tsx           mount point for the static build
index.html              document shell for the static build
vite.static.config.ts   static build config (GitHub Pages)
vite.config.ts          vinext + Cloudflare config (untouched)
```

`app/geo.ts` and `app/zh-hant.ts` are generated and should not be hand-edited.

---

## Development

Requires Node ≥ 22.15 (`scripts/check-view.mjs` imports the TypeScript sources
directly, via type stripping and `module.registerHooks`).

```bash
npm install
npm run dev              # vinext dev server on :3000
npm run verify           # check the generated map data
npm run build:zh         # regenerate the Traditional Chinese table
npm run check:en         # check the English table is complete
npm run check:view       # check the pan/zoom maths
npm run lint
```

Two build paths coexist:

```bash
npm run build            # vinext / Cloudflare Workers
npm run build:static     # static SPA into dist-static/ for GitHub Pages
npm run preview:static
```

The static build bundles the same client component as a plain SPA. Its base path
must match the path GitHub Pages serves it from: the workflow passes the
repository name as `PAGES_BASE`, and the config falls back to
`/messiah-land-map/` for a local build. Set `PAGES_BASE` yourself if you serve
it from anywhere else — a mismatch 404s the bundle and renders a blank page.

### Deployment

`.github/workflows/pages.yml` runs on every push to `main`: install, verify the
map data, confirm the Traditional Chinese table is current and the English table
complete, check the view maths, build the static bundle, deploy to GitHub Pages. A failing check
blocks the deploy.

---

## Verifying the data

```bash
npm run verify
```

`scripts/verify-map-data.mjs` decodes the DEM out of `app/geo.ts` and asserts:

1. the grid length matches the declared dimensions;
2. eight landmarks fall inside published survey ranges — Jerusalem, the Sea of
   Galilee and Dead Sea surfaces, Hermon, Jericho, the Hebron ridge, the Jezreel
   valley floor, and open sea off Ashdod (which catches a transposed axis);
3. every gazetteer entry sits inside the frame, and its stated elevation agrees
   with the surrounding DEM window.

Tolerances are wide on purpose. The check exists to catch typos, sign errors and
transposed coordinates, not to second-guess survey figures — and it has earned
its keep: it caught Masada and Hippos carrying *height above the shore* as their
elevation (434 m and 350 m, against true elevations of 59 m and 144 m).

---

## Regenerating `app/geo.ts`

The generator is not checked in; the data is static and was produced once. For
the record, the pipeline was:

1. Sample elevation on a 0.02° grid over the frame via the
   [OpenTopoData](https://www.opentopodata.org/datasets/srtm/) public API
   (`srtm30m`, 100 locations per request, 1 request/second), then pack the
   values as little-endian `Int16` and base64.
2. Clip the Natural Earth 10m `land`, `lakes` and `rivers_lake_centerlines`
   layers to the frame, simplify with Douglas–Peucker, and take the coastline as
   the contiguous run of the land ring inside the frame.
3. Emit the whole thing as a TypeScript module alongside the hand-digitised
   region polygons.

One trap worth recording: Douglas–Peucker degenerates on a *closed* ring, where
the first and last points coincide and the perpendicular-distance term collapses
to zero — it silently reduced the Sea of Galilee and the Dead Sea to two points
each. Fall back to radial distance when the segment has no length.

---

## Sources

- [NASA SRTM](https://www.earthdata.nasa.gov/data/instruments/srtm) — elevation
- [OpenTopoData](https://www.opentopodata.org/datasets/srtm/) — sampling API
- [Natural Earth](https://www.naturalearthdata.com/downloads/10m-physical-vectors/)
  — coastline, lakes, river centrelines

Ancient place names and regional boundaries follow standard historical atlases of
Roman Palestine. Where a site has competing identifications — Cana, Emmaus,
Bethsaida, the country of the Gerasenes — the panel says so rather than picking
silently.

---

## Licence

Two licences, because this repository holds two kinds of work.

- **Code** — MIT. See [`LICENSE`](LICENSE).
- **Map content** — CC BY 4.0. See [`LICENSE-CONTENT`](LICENSE-CONTENT). This
  covers the place descriptions in `app/places.ts` and their English translations
  in `app/en.json`, the regional boundary polygons, and the written sections of
  this README.

[OpenCC](https://github.com/BYVoid/OpenCC), used at build time only, is Apache 2.0.

The underlying geodata carries no conditions: Natural Earth is public domain and
SRTM is released by NASA into the public domain. Attribution to both is
customary, and this project gives it here and in the interface.
