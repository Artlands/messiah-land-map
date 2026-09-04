// Self-check for the generated map data. `node scripts/verify-map-data.mjs`
// Fails loudly if the DEM, the bounds, or a gazetteer coordinate drifts.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const geo = readFileSync(new URL('../app/geo.ts', import.meta.url), 'utf8');
const places = readFileSync(new URL('../app/places.ts', import.meta.url), 'utf8');

const num = (re) => Number(geo.match(re)[1]);
const W = num(/BOUNDS = \{ w: ([\d.-]+)/);
const E = num(/e: ([\d.-]+), s:/);
const S = num(/s: ([\d.-]+), n:/);
const N = num(/n: ([\d.-]+) \}/);
const NX = num(/DEM_NX = (\d+)/);
const NY = num(/DEM_NY = (\d+)/);
const b64 = geo.match(/DEM_B64 = '([^']+)'/)[1];

const bytes = Buffer.from(b64, 'base64');
const dem = new Int16Array(bytes.buffer, bytes.byteOffset, bytes.byteLength >> 1);
assert.equal(dem.length, NX * NY, 'DEM length must match the declared grid');

const sx = (E - W) / (NX - 1);
const sy = (N - S) / (NY - 1);
function elevation(lon, lat) {
  const fx = Math.min(NX - 1.001, Math.max(0, (lon - W) / sx));
  const fy = Math.min(NY - 1.001, Math.max(0, (N - lat) / sy));
  const x0 = Math.floor(fx), y0 = Math.floor(fy), tx = fx - x0, ty = fy - y0;
  const i = y0 * NX + x0;
  return (dem[i] * (1 - tx) + dem[i + 1] * tx) * (1 - ty)
       + (dem[i + NX] * (1 - tx) + dem[i + NX + 1] * tx) * ty;
}

// Ground truth from published survey figures — if the grid is misaligned these blow up.
const landmarks = [
  ['Jerusalem, Temple Mount', 35.2354, 31.7780, 700, 800],
  ['Sea of Galilee surface', 35.5900, 32.8200, -230, -180],
  ['Dead Sea surface', 35.4500, 31.5000, -430, -380],
  ['Mt Hermon massif', 35.8570, 33.4160, 2300, 2820],
  ['Jericho', 35.4442, 31.8708, -320, -180],
  ['Jezreel valley floor', 35.3000, 32.5600, -30, 150],
  ['Sea offshore of Ashdod', 34.4000, 31.8000, -5, 5],
  ['Hebron ridge', 35.0950, 31.5250, 850, 1010],
];
for (const [name, lon, lat, lo, hi] of landmarks) {
  const v = elevation(lon, lat);
  assert.ok(v >= lo && v <= hi, `${name}: DEM says ${v.toFixed(0)} m, expected ${lo}..${hi}`);
}

// Every gazetteer entry must sit inside the frame, and its stated elevation must
// agree with the DEM. A wrong sign or a transposed lon/lat shows up here first.
const rows = [...places.matchAll(
  /id: '([\w-]+)',[\s\S]{0,400}?lon: ([\d.-]+), lat: ([\d.-]+), elev: ([\d.-]+)/g,
)];
assert.ok(rows.length > 40, `expected the full gazetteer, parsed ${rows.length}`);
let worst = { id: '', diff: 0 };
for (const [, id, lonS, latS, elevS] of rows) {
  const lon = +lonS, lat = +latS, elev = +elevS;
  assert.ok(lon > W && lon < E && lat > S && lat < N, `${id} falls outside the map frame`);
  // The DEM is a 2 km grid, so isolated summits and mesas (Hermon, Tabor, Masada)
  // are smoothed away. Compare against the local window, not a single sample, and
  // keep the slack wide — this check exists to catch typos and transposed
  // coordinates, not to second-guess the survey figures.
  let lo = Infinity, hi = -Infinity;
  const ci = Math.round((lon - W) / sx), cj = Math.round((N - lat) / sy);
  for (let j = Math.max(0, cj - 1); j <= Math.min(NY - 1, cj + 1); j++) {
    for (let i = Math.max(0, ci - 1); i <= Math.min(NX - 1, ci + 1); i++) {
      lo = Math.min(lo, dem[j * NX + i]);
      hi = Math.max(hi, dem[j * NX + i]);
    }
  }
  const diff = elev < lo ? lo - elev : elev > hi ? elev - hi : 0;
  if (diff > worst.diff) worst = { id, diff };
  assert.ok(diff <= 350, `${id}: stated ${elev} m, DEM window ${lo}..${hi} m`);
}

console.log(`ok — ${dem.length} DEM nodes, ${rows.length} places, worst elevation gap ${worst.diff.toFixed(0)} m (${worst.id})`);
