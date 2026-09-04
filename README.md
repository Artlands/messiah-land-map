# Messiah Land Map · 弥赛亚之地

An interactive relief map of first-century Israel, built on measured elevation
data rather than decorative terrain. Rotate the land, tilt the horizon, and read
the Gospel narratives against the distances and height differences they actually
happened in.

**Live:** https://lijie.me/Messiah-Land-Map/ (also at
https://artlands.github.io/Messiah-Land-Map/)

The interface is in Simplified Chinese; this document is the technical reference.

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

## Rendering

The map is a heightfield painted to a 2D canvas; there is no WebGL and no 3D
library. `app/terrain.ts` holds the whole renderer:

- **Projection** — rotation about the vertical axis plus a tilt, orthographic.
  `makeFrame()` projects the frame corners first and scales to fit, so nothing
  clips at any rotation or tilt.
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
scripts/
  verify-map-data.mjs   self-check for the generated data
src/entry.tsx           mount point for the static build
index.html              document shell for the static build
vite.static.config.ts   static build config (GitHub Pages)
vite.config.ts          vinext + Cloudflare config (untouched)
```

`app/geo.ts` is generated and should not be hand-edited.

---

## Development

Requires Node ≥ 22.13.

```bash
npm install
npm run dev              # vinext dev server on :3000
npm run verify           # check the generated map data
npm run lint
```

Two build paths coexist:

```bash
npm run build            # vinext / Cloudflare Workers
npm run build:static     # static SPA into dist-static/ for GitHub Pages
npm run preview:static
```

The static build bundles the same client component as a plain SPA. Its base path
is `/Messiah-Land-Map/`; override it with the `PAGES_BASE` environment variable
if you fork the repository under a different name.

### Deployment

`.github/workflows/pages.yml` runs on every push to `main`: install, verify the
map data, build the static bundle, deploy to GitHub Pages. A failing data check
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

No licence has been chosen for the code yet, so default copyright applies — add
a `LICENSE` file if you want others to reuse it.

The underlying data is freely usable: Natural Earth is public domain, and SRTM
is released by NASA into the public domain. The place descriptions are original
text written for this project.
