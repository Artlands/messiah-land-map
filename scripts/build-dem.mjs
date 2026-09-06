// Refetches the elevation grid inside app/geo.ts.
//
//     node scripts/build-dem.mjs
//
// Only the three DEM constants are rewritten — BOUNDS, DEM_NX, DEM_NY and the
// base64 payload. The coastline, lakes, river centrelines, tetrarchy rings and
// labels further down that file are Natural Earth vectors and hand work, and
// are left exactly as they are.
//
// Source: GMRT, the Global Multi-Resolution Topography synthesis, which serves a
// whole bounding box as one ESRI ASCII grid rather than metering by the
// hundred-coordinate call the way the point-query elevation APIs do. Over a box
// this small its tiers run very fine — `med` is about 0.0022°, some 245 m — so
// the grid step here is a choice about payload and draw cost, not about quota.
//
// GMRT carries bathymetry, so the Mediterranean arrives as real depth. Nothing
// in this map wants that: the sea is drawn as flat bands clipped to the Natural
// Earth coastline, and a negative seafloor would drag `elevationRange` down and
// take the hypsometric ramp with it. So everything below zero outside the Jordan
// rift is written as exactly 0, and inside the rift the real depth is kept —
// which is what kepes the Dead Sea at -430 and the Sea of Galilee at -210.
import { readFileSync, writeFileSync } from 'node:fs';

const BOUNDS = { w: 34.2, e: 36.5, s: 30.6, n: 33.75 };
const STEP = 0.005;
const TIER = 'med';
const NX = Math.round((BOUNDS.e - BOUNDS.w) / STEP) + 1;
const NY = Math.round((BOUNDS.n - BOUNDS.s) / STEP) + 1;

/**
 * Where a negative elevation is real inland water rather than seafloor: the
 * Dead Sea, the Jordan valley, the Sea of Galilee and the Beit She'an basin.
 * Keep the western edge inland of the coast — at 33°N the shore is already out
 * near 35.1°E, and a box that reaches past it preserves open Mediterranean as
 * though it were the rift.
 */
const RIFT = { w: 35.2, e: 35.9, s: 30.6, n: 33.0 };

const url = 'https://www.gmrt.org/services/GridServer'
  + `?minlongitude=${BOUNDS.w}&maxlongitude=${BOUNDS.e}`
  + `&minlatitude=${BOUNDS.s}&maxlatitude=${BOUNDS.n}`
  + `&format=esriascii&resolution=${TIER}&layer=topo`;

process.stdout.write(`fetching the ${TIER} tier… `);
const res = await fetch(url);
if (!res.ok) throw new Error(`GMRT returned HTTP ${res.status}`);
const text = await res.text();
console.log(`${(text.length / 1e6).toFixed(1)} MB`);

// --- Parse the ESRI ASCII header, then the values. Rows run north to south.
const head = {};
let cursor = 0;
for (let i = 0; i < 6; i++) {
  const end = text.indexOf('\n', cursor);
  const [key, value] = text.slice(cursor, end).trim().split(/\s+/);
  head[key.toLowerCase()] = Number(value);
  cursor = end + 1;
}
const { ncols, nrows, xllcorner, yllcorner, cellsize, nodata_value: nodata } = head;
const src = new Float32Array(ncols * nrows);
{
  let k = 0;
  for (const token of text.slice(cursor).split(/\s+/)) {
    if (token) src[k++] = Number(token);
  }
  if (k !== src.length) throw new Error(`expected ${src.length} values, parsed ${k}`);
}
console.log(`grid ${ncols}×${nrows} at ${cellsize.toFixed(5)}° (~${(cellsize * 111e3).toFixed(0)} m)`);
if (cellsize > STEP) throw new Error(`the ${TIER} tier is coarser than STEP ${STEP}° — ask for a finer tier`);

/** Bilinear sample of the source grid, in metres. */
const sampleAt = (lon, lat) => {
  const fx = Math.min(ncols - 1.001, Math.max(0, (lon - xllcorner) / cellsize));
  // yllcorner is the southern edge, but row 0 of the data is the northern one.
  const fy = Math.min(nrows - 1.001, Math.max(0, (yllcorner + (nrows - 1) * cellsize - lat) / cellsize));
  const x0 = Math.floor(fx);
  const y0 = Math.floor(fy);
  const tx = fx - x0;
  const ty = fy - y0;
  const i = y0 * ncols + x0;
  const q = [src[i], src[i + 1], src[i + ncols], src[i + ncols + 1]];
  // A nodata cell would poison the whole neighbourhood, so fall back to the
  // nearest real value rather than averaging the sentinel in.
  if (q.some((v) => v === nodata)) return q.find((v) => v !== nodata) ?? 0;
  return (q[0] * (1 - tx) + q[1] * tx) * (1 - ty) + (q[2] * (1 - tx) + q[3] * tx) * ty;
};

const dem = new Int16Array(NX * NY);
for (let j = 0; j < NY; j++) {
  const lat = BOUNDS.n - j * STEP;
  for (let i = 0; i < NX; i++) {
    const lon = BOUNDS.w + i * STEP;
    const v = sampleAt(lon, lat);
    const inRift = lon >= RIFT.w && lon <= RIFT.e && lat >= RIFT.s && lat <= RIFT.n;
    dem[j * NX + i] = inRift ? Math.round(v) : Math.max(0, Math.round(v));
  }
}

const b64 = Buffer.from(dem.buffer, dem.byteOffset, dem.byteLength).toString('base64');
const path = new URL('../app/geo.ts', import.meta.url);
let geo = readFileSync(path, 'utf8');
const swap = (re, replacement) => {
  if (!re.test(geo)) throw new Error(`app/geo.ts no longer matches ${re}`);
  geo = geo.replace(re, replacement);
};
swap(/^\/\/ Terrain: .*$/m, `// Terrain: GMRT resampled onto a ${STEP}° grid; water written as 0.`);
swap(/export const DEM_NX = \d+;/, `export const DEM_NX = ${NX};`);
swap(/export const DEM_NY = \d+;/, `export const DEM_NY = ${NY};`);
swap(/const DEM_B64 = '[^']*';/, `const DEM_B64 = '${b64}';`);
writeFileSync(path, geo);

let lo = Infinity;
let hi = -Infinity;
for (const v of dem) {
  if (v < lo) lo = v;
  if (v > hi) hi = v;
}
console.log(`app/geo.ts — ${NX}×${NY} = ${dem.length} nodes, ${lo}..${hi} m`);
