// Checks the map view maths the pointer controls rely on.
//
//     node scripts/check-view.mjs
//
// The one claim worth pinning down is that zooming about a cursor leaves
// whatever sits under it in place — the correction skips reprojection, so a
// wrong sign or a missing term would only show as the map sliding out from
// under the pointer.
import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';

// The app imports without file extensions, which Node's ESM resolver will not
// do on its own. Type stripping handles the rest.
registerHooks({
  resolve: (spec, ctx, next) => next(spec.startsWith('.') && !spec.includes('.ts') ? `${spec}.ts` : spec, ctx),
});
const { clampPan, elevationAt, makeFrame, projectGeo, relief, zoomAbout } =
  await import('../app/terrain.ts');

const W = 1200;
const H = 820;
const at = (view, lon, lat) =>
  projectGeo(lon, lat, relief(elevationAt(lon, lat)), makeFrame(view, W, H));

const base = { rotation: -0.4, tilt: 0.62, zoom: 1, perspective: false, panX: 40, panY: -25 };

// A point under the cursor stays under it, zooming either way, in both projections.
for (const perspective of [false, true]) {
  for (const factor of [1.25, 1 / 1.25, 2.4, 0.5]) {
    const view = { ...base, perspective };
    const p = at(view, 35.23, 31.78); // Jerusalem
    const after = at(zoomAbout(view, factor, p.x, p.y, W, H), 35.23, 31.78);
    assert.ok(
      Math.hypot(after.x - p.x, after.y - p.y) < 0.5,
      `anchor drifted ${Math.hypot(after.x - p.x, after.y - p.y).toFixed(2)} px ` +
        `at ×${factor}${perspective ? ' (perspective)' : ''}`,
    );
  }
}

// Zoom stays inside its limits, and a clamped zoom leaves the pan alone.
const wayOut = zoomAbout({ ...base, zoom: 6 }, 4, 300, 300, W, H);
assert.equal(wayOut.zoom, 6);
assert.deepEqual([wayOut.panX, wayOut.panY], [base.panX, base.panY]);
assert.equal(zoomAbout({ ...base, zoom: 0.8 }, 0.1, 300, 300, W, H).zoom, 0.7);

// Pan is bounded either side of centre.
assert.equal(clampPan(9999, W), W * 0.6);
assert.equal(clampPan(-9999, H), -H * 0.6);

console.log('ok — anchored zoom holds within 0.5 px, limits and pan clamp hold');
