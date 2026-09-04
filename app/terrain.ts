import { BOUNDS, DEM, DEM_NX, DEM_NY, coast, lakes, rivers, regions, type RulerKey } from './geo';

const { w: W, e: E, s: S, n: N } = BOUNDS;
const MID_LAT = ((N + S) / 2) * (Math.PI / 180);

/** Width of the frame relative to its height, corrected for the meridian convergence. */
const ASPECT = ((E - W) * Math.cos(MID_LAT)) / (N - S);
/** North–south extent of the frame, in metres. */
const SPAN_M = (N - S) * 111_320;
/**
 * Vertical exaggeration. At 1x the whole relief is 0.8% of the frame and invisible;
 * printed relief atlases of this region use roughly 8–15x. Tune here, nowhere else.
 */
const EXAGGERATION = 11;

export const normLon = (lon: number) => (lon - W) / (E - W);
export const normLat = (lat: number) => (N - lat) / (N - S);
/** Metres above sea level → height in frame units. */
export const relief = (metres: number) => (metres / SPAN_M) * EXAGGERATION;

// ---------------------------------------------------------------- elevation

const STEP_X = (E - W) / (DEM_NX - 1);
const STEP_Y = (N - S) / (DEM_NY - 1);

/** Bilinear sample of the DEM, in metres. */
export function elevationAt(lon: number, lat: number) {
  const fx = Math.min(DEM_NX - 1.001, Math.max(0, (lon - W) / STEP_X));
  const fy = Math.min(DEM_NY - 1.001, Math.max(0, (N - lat) / STEP_Y));
  const x0 = Math.floor(fx);
  const y0 = Math.floor(fy);
  const tx = fx - x0;
  const ty = fy - y0;
  const i = y0 * DEM_NX + x0;
  const a = DEM[i];
  const b = DEM[i + 1];
  const c = DEM[i + DEM_NX];
  const d = DEM[i + DEM_NX + 1];
  return (a * (1 - tx) + b * tx) * (1 - ty) + (c * (1 - tx) + d * tx) * ty;
}

export const elevationRange = (() => {
  let lo = Infinity;
  let hi = -Infinity;
  for (let i = 0; i < DEM.length; i++) {
    if (DEM[i] < lo) lo = DEM[i];
    if (DEM[i] > hi) hi = DEM[i];
  }
  return { lo, hi };
})();

// ---------------------------------------------------------------- land mask

/**
 * The Mediterranean is the only sea inside the frame and its shore is monotone in
 * latitude here, so the coastline collapses to a lookup of shore longitude by latitude.
 */
const SHORE_STEP = 0.005;
const SHORE_N = Math.ceil((N - S) / SHORE_STEP) + 1;
const shore = (() => {
  const table = new Float64Array(SHORE_N).fill(W - 1);
  for (let k = 0; k < coast.length - 1; k++) {
    const [x1, y1] = coast[k];
    const [x2, y2] = coast[k + 1];
    const from = Math.min(y1, y2);
    const to = Math.max(y1, y2);
    let i = Math.max(0, Math.ceil((N - to) / SHORE_STEP));
    for (; i < SHORE_N; i++) {
      const lat = N - i * SHORE_STEP;
      if (lat < from) break;
      const t = Math.abs(y2 - y1) < 1e-9 ? 0 : (lat - y1) / (y2 - y1);
      const lon = x1 + (x2 - x1) * t;
      if (lon > table[i]) table[i] = lon;
    }
  }
  // Below the southern end of the digitised shore the coast runs west out of frame.
  for (let i = 0; i < SHORE_N; i++) if (table[i] === W - 1) table[i] = W - 1;
  return table;
})();

export function shoreLon(lat: number) {
  const f = Math.min(SHORE_N - 1, Math.max(0, (N - lat) / SHORE_STEP));
  const i = Math.floor(f);
  const j = Math.min(SHORE_N - 1, i + 1);
  return shore[i] + (shore[j] - shore[i]) * (f - i);
}

// ---------------------------------------------------------------- geometry

export type View = { rotation: number; tilt: number; zoom: number; perspective: boolean };
export type Frame = { cx: number; cy: number; scale: number; view: View };

export type Projected = { x: number; y: number; depth: number };

function rotate(u: number, v: number, view: View) {
  const px = (u - 0.5) * ASPECT;
  const pz = v - 0.5;
  const cos = Math.cos(view.rotation);
  const sin = Math.sin(view.rotation);
  return { rx: px * cos - pz * sin, rz: px * sin + pz * cos };
}

/**
 * Eye distance for the perspective projection, in frame units — the frame is
 * ASPECT × 1, and the nearest point of it reaches about 0.6 at full tilt. Lower
 * means a wider cone and a heavier foreshortening. Tune here, nowhere else.
 */
const EYE = 2.4;

/**
 * Foreshortening at a point, 1 for the axonometric view. `rz * cos(tilt) +
 * h * sin(tilt)` is how far the point stands towards the camera along its
 * viewing axis, so near ground and high summits both grow.
 */
function foreshorten(rz: number, h: number, view: View) {
  if (!view.perspective) return 1;
  return EYE / (EYE - (rz * Math.cos(view.tilt) + h * Math.sin(view.tilt)));
}

export function project(u: number, v: number, h: number, f: Frame): Projected {
  const { rx, rz } = rotate(u, v, f.view);
  const k = foreshorten(rz, h, f.view) * f.scale;
  return {
    x: f.cx + rx * k,
    y: f.cy + (rz * Math.sin(f.view.tilt) - h * Math.cos(f.view.tilt)) * k,
    // Painter's order and haze both read the unforeshortened depth, which is
    // the same ordering either way.
    depth: rz,
  };
}

export const projectGeo = (lon: number, lat: number, h: number, f: Frame) =>
  project(normLon(lon), normLat(lat), h, f);

/** Fit the rotated frame to the canvas so nothing clips at any rotation. */
export function makeFrame(view: View, width: number, height: number): Frame {
  const hi = relief(elevationRange.hi);
  const lo = relief(elevationRange.lo);
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (const u of [0, 1]) {
    for (const v of [0, 1]) {
      for (const h of [lo, hi]) {
        const { rx, rz } = rotate(u, v, view);
        const k = foreshorten(rz, h, view);
        const x = rx * k;
        const y = (rz * Math.sin(view.tilt) - h * Math.cos(view.tilt)) * k;
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }
  const scale = Math.min(width * 0.9 / (maxX - minX), height * 0.88 / (maxY - minY)) * view.zoom;
  return {
    scale,
    cx: width / 2 - ((minX + maxX) / 2) * scale,
    cy: height / 2 - ((minY + maxY) / 2) * scale,
    view,
  };
}

// ---------------------------------------------------------------- palette

/** Hypsometric tint, in the tradition of printed relief atlases. */
const RAMP: [number, number, number, number][] = [
  [-430, 46, 66, 62],
  [-250, 64, 92, 76],
  [-60, 90, 118, 84],
  [80, 126, 143, 92],
  [280, 163, 163, 100],
  [520, 189, 172, 108],
  [820, 190, 150, 96],
  [1250, 173, 122, 84],
  [1800, 166, 132, 112],
  [2400, 205, 200, 198],
  [2900, 236, 240, 244],
];

export function hypsometric(metres: number) {
  let i = 0;
  while (i < RAMP.length - 2 && metres > RAMP[i + 1][0]) i++;
  const [e0, r0, g0, b0] = RAMP[i];
  const [e1, r1, g1, b1] = RAMP[i + 1];
  const t = Math.max(0, Math.min(1, (metres - e0) / (e1 - e0)));
  return [r0 + (r1 - r0) * t, g0 + (g1 - g0) * t, b0 + (b1 - b0) * t];
}

export const RULER_TINT: Record<RulerKey, [number, number, number]> = {
  antipas: [214, 176, 96], // 希律安提帕
  philip: [140, 178, 196], // 希律腓力
  prefect: [206, 138, 106], // 罗马巡抚（犹太、撒马利亚、以土买）
  decapolis: [166, 150, 200], // 低加波利自治城邦
  nabataea: [150, 186, 150], // 拿巴天王国
  syria: [196, 168, 188], // 叙利亚行省
};

// ---------------------------------------------------------------- region index

function pointInRing(lon: number, lat: number, ring: [number, number][]) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    if (yi > lat !== yj > lat && lon < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

export function regionAt(lon: number, lat: number) {
  for (let i = 0; i < regions.length; i++) if (pointInRing(lon, lat, regions[i].ring)) return i;
  return -1;
}

/** Region index per DEM node, computed once — point-in-polygon is far too slow per frame. */
const regionGrid = (() => {
  const g = new Int8Array(DEM_NX * DEM_NY);
  for (let j = 0; j < DEM_NY; j++) {
    const lat = N - j * STEP_Y;
    for (let i = 0; i < DEM_NX; i++) g[j * DEM_NX + i] = regionAt(W + i * STEP_X, lat);
  }
  return g;
})();

// ---------------------------------------------------------------- lakes

/** Cells covered by a lake are drawn as water, not as terrain. */
function lakeMask() {
  const g = new Uint8Array(DEM_NX * DEM_NY);
  for (const lake of lakes) {
    let minLon = Infinity, maxLon = -Infinity, minLat = Infinity, maxLat = -Infinity;
    for (const [x, y] of lake.ring) {
      minLon = Math.min(minLon, x); maxLon = Math.max(maxLon, x);
      minLat = Math.min(minLat, y); maxLat = Math.max(maxLat, y);
    }
    const j0 = Math.max(0, Math.floor((N - maxLat) / STEP_Y));
    const j1 = Math.min(DEM_NY - 1, Math.ceil((N - minLat) / STEP_Y));
    const i0 = Math.max(0, Math.floor((minLon - W) / STEP_X));
    const i1 = Math.min(DEM_NX - 1, Math.ceil((maxLon - W) / STEP_X));
    for (let j = j0; j <= j1; j++) {
      for (let i = i0; i <= i1; i++) {
        if (pointInRing(W + i * STEP_X, N - j * STEP_Y, lake.ring)) g[j * DEM_NX + i] = 1;
      }
    }
  }
  return g;
}
const lakeGrid = lakeMask();

// ---------------------------------------------------------------- drawing

const SUN = { x: -0.55, y: -0.7, z: 0.45 };
const SUN_LEN = Math.hypot(SUN.x, SUN.y, SUN.z);

export type SceneOptions = {
  stride: number;
  showRegions: boolean;
  highlightRegion: number;
};

type Cell = { depth: number; pts: Projected[]; r: number; g: number; b: number };

export function drawScene(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  frame: Frame,
  opts: SceneOptions,
) {
  ctx.clearRect(0, 0, width, height);

  // --- Terrain mesh. The Mediterranean goes into the same depth-sorted list as
  //     one flat band per row: it then occludes correctly at any tilt, and its
  //     eastern edge is the real shoreline rather than a staircase of 2 km cells.
  const s = opts.stride;
  const cells: Cell[] = [];
  const hOf = (i: number, j: number) => relief(DEM[j * DEM_NX + i]);
  for (let j = 0; j + s < DEM_NY; j += s) {
    const lat0 = N - j * STEP_Y;
    const lat1 = N - (j + s) * STEP_Y;
    const shore0 = shoreLon(lat0);
    const shore1 = shoreLon(lat1);
    if (shore0 > W || shore1 > W) {
      const v0 = j / (DEM_NY - 1);
      const v1 = (j + s) / (DEM_NY - 1);
      const pts = [
        project(0, v0, 0, frame),
        project(normLon(Math.max(W, shore0)), v0, 0, frame),
        project(normLon(Math.max(W, shore1)), v1, 0, frame),
        project(0, v1, 0, frame),
      ];
      const depth = (pts[0].depth + pts[2].depth) / 2;
      const haze = Math.max(0, Math.min(0.34, (0.5 - depth) * 0.34));
      cells.push({
        depth,
        pts,
        r: 20 * (1 - haze) + 30 * haze,
        g: 62 * (1 - haze) + 52 * haze,
        b: 73 * (1 - haze) + 60 * haze,
      });
    }
    for (let i = 0; i + s < DEM_NX; i += s) {
      const u0 = i / (DEM_NX - 1);
      const u1 = (i + s) / (DEM_NX - 1);
      // Clamp the western edge to the shoreline so the coast is a clean line
      // rather than a staircase of half-submerged cells.
      const a0 = Math.max(u0, normLon(shore0));
      const a1 = Math.max(u0, normLon(shore1));
      if (a0 >= u1 && a1 >= u1) continue;
      const idx = j * DEM_NX + i;
      if (lakeGrid[idx] && lakeGrid[idx + s] && lakeGrid[idx + s * DEM_NX]) continue;

      const e00 = DEM[idx];
      const e10 = DEM[idx + s];
      const e01 = DEM[idx + s * DEM_NX];
      const e11 = DEM[idx + s * DEM_NX + s];
      const cv0 = j / (DEM_NY - 1);
      const cv1 = (j + s) / (DEM_NY - 1);
      const pts = [
        project(a0, cv0, hOf(i, j), frame),
        project(u1, cv0, hOf(i + s, j), frame),
        project(u1, cv1, hOf(i + s, j + s), frame),
        project(a1, cv1, hOf(i, j + s), frame),
      ];

      // Hillshade from the true surface gradient (metres over metres, no exaggeration).
      const dx = (e10 + e11 - e00 - e01) / 2 / (STEP_X * 111_320 * Math.cos(MID_LAT) * s);
      const dy = (e01 + e11 - e00 - e10) / 2 / (STEP_Y * 111_320 * s);
      const nl = Math.hypot(dx, dy, 1);
      const lambert = Math.max(0, (-dx * SUN.x - dy * SUN.y + SUN.z) / (nl * SUN_LEN));
      const shade = 0.42 + 0.95 * lambert;

      const mean = (e00 + e10 + e01 + e11) / 4;
      let [r, g, b] = hypsometric(mean);
      if (opts.showRegions) {
        const reg = regionGrid[idx];
        if (reg >= 0) {
          const tint = RULER_TINT[regions[reg].ruler];
          const k = opts.highlightRegion === reg ? 0.55 : 0.26;
          r += (tint[0] - r) * k;
          g += (tint[1] - g) * k;
          b += (tint[2] - b) * k;
        }
      }
      // Cool the far distance slightly so depth reads without a fog overlay.
      const depth = (pts[0].depth + pts[2].depth) / 2;
      const haze = Math.max(0, Math.min(0.34, (0.5 - depth) * 0.34));
      r = r * shade * (1 - haze) + 30 * haze;
      g = g * shade * (1 - haze) + 52 * haze;
      b = b * shade * (1 - haze) + 60 * haze;
      cells.push({ depth, pts, r, g, b });
    }
  }
  cells.sort((a, b) => a.depth - b.depth);
  for (const c of cells) {
    ctx.beginPath();
    ctx.moveTo(c.pts[0].x, c.pts[0].y);
    ctx.lineTo(c.pts[1].x, c.pts[1].y);
    ctx.lineTo(c.pts[2].x, c.pts[2].y);
    ctx.lineTo(c.pts[3].x, c.pts[3].y);
    ctx.closePath();
    ctx.fillStyle = `rgb(${c.r | 0},${c.g | 0},${c.b | 0})`;
    ctx.fill();
    // Hairline of the same colour hides the seams between quads.
    ctx.strokeStyle = ctx.fillStyle;
    ctx.lineWidth = 0.7;
    ctx.stroke();
  }

  // --- Rivers, draped on the surface.
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  for (const river of rivers) {
    ctx.beginPath();
    river.line.forEach(([lon, lat], k) => {
      const p = projectGeo(lon, lat, relief(elevationAt(lon, lat)) + 0.0015, frame);
      if (k === 0) ctx.moveTo(p.x, p.y); else ctx.lineTo(p.x, p.y);
    });
    ctx.strokeStyle = river.name.startsWith('约旦河') ? 'rgba(116, 196, 206, .95)' : 'rgba(104, 172, 186, .7)';
    ctx.lineWidth = river.name.startsWith('约旦河') ? 2 : 1.2;
    ctx.stroke();
  }

  // --- Inland waters, at their own surface level.
  for (const lake of lakes) {
    ctx.beginPath();
    lake.ring.forEach(([lon, lat], k) => {
      const p = projectGeo(lon, lat, relief(lake.surface) + 0.001, frame);
      if (k === 0) ctx.moveTo(p.x, p.y); else ctx.lineTo(p.x, p.y);
    });
    ctx.closePath();
    ctx.fillStyle = lake.id === 'huleh' ? 'rgba(46, 110, 106, .82)' : 'rgba(20, 78, 96, .96)';
    ctx.fill();
    ctx.strokeStyle = 'rgba(126, 200, 208, .5)';
    ctx.lineWidth = 1;
    ctx.stroke();
  }

  // --- Regional borders.
  if (opts.showRegions) {
    ctx.save();
    ctx.setLineDash([5, 4]);
    regions.forEach((region, index) => {
      ctx.beginPath();
      let first = true;
      for (let k = 0; k < region.ring.length; k++) {
        const [x1, y1] = region.ring[k];
        const [x2, y2] = region.ring[(k + 1) % region.ring.length];
        const steps = Math.max(1, Math.ceil(Math.hypot(x2 - x1, y2 - y1) / 0.03));
        for (let t = 0; t < steps; t++) {
          const lon = x1 + ((x2 - x1) * t) / steps;
          const lat = y1 + ((y2 - y1) * t) / steps;
          const p = projectGeo(lon, lat, relief(elevationAt(lon, lat)) + 0.004, frame);
          if (first) { ctx.moveTo(p.x, p.y); first = false; } else ctx.lineTo(p.x, p.y);
        }
      }
      ctx.closePath();
      const active = opts.highlightRegion === index;
      ctx.strokeStyle = active ? 'rgba(240, 214, 150, .95)' : 'rgba(226, 197, 123, .38)';
      ctx.lineWidth = active ? 1.8 : 1;
      ctx.stroke();
    });
    ctx.restore();
  }
}
