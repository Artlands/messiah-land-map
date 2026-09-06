// Checks every embedded video against YouTube. `node scripts/check-videos.mjs`
//
// Three things can rot here and none of them show up in a type check: an id can
// be mistyped, a video can be pulled or made private, and a channel can rename
// or reupload. YouTube's oEmbed endpoint answers all three without an API key —
// it 404s on anything that is not publicly playable, and it reports the channel.
//
// It also holds the mapping honest: every place named must exist in the
// gazetteer, and every video referenced must exist in the catalogue.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (f) => readFileSync(new URL(`../${f}`, import.meta.url), 'utf8');
const videosTs = read('app/videos.ts');
const placesTs = read('app/places.ts');

const catalogue = [...videosTs.matchAll(
  /^ {2}(\w+): \{ id: '([\w-]{11})', title: '([^']*)', source: (?:'([^']*)'|"([^"]*)") \},$/gm,
)].map(([, key, id, title, s1, s2]) => ({ key, id, title, source: s1 ?? s2 }));
// A floor of one, not of ten: the point is to catch the regex drifting off the
// file's shape, and how many videos there are is an editorial decision that has
// already moved once.
assert.ok(catalogue.length > 0, 'parsed no videos — has app/videos.ts changed shape?');

// Each mapping line carries a trailing comment naming the passage that earns it.
const mapping = [...videosTs.matchAll(/^ {2}'?([\w-]+)'?: '(\w+)',(?:\s*\/\/.*)?$/gm)]
  .map(([, place, key]) => ({ place, key }));
assert.ok(mapping.length > 0, 'parsed no place mappings — has app/videos.ts changed shape?');

// Ids must be unique: two places may share a video, but a video listed twice
// under different keys means the catalogue has drifted.
const byId = new Map();
for (const v of catalogue) {
  assert.ok(!byId.has(v.id), `${v.id} appears twice: ${byId.get(v.id)} and ${v.key}`);
  byId.set(v.id, v.key);
}

const keys = new Set(catalogue.map((v) => v.key));
const places = new Set([...placesTs.matchAll(/id: '([\w-]+)'/g)].map(([, id]) => id));
for (const { place, key } of mapping) {
  assert.ok(places.has(place), `videos.ts maps '${place}', which is not a place in the gazetteer`);
  assert.ok(keys.has(key), `'${place}' points at '${key}', which is not in the catalogue`);
}
const used = new Set(mapping.map((m) => m.key));
for (const v of catalogue) {
  assert.ok(used.has(v.key), `'${v.key}' is in the catalogue but no place uses it`);
}

// Now the network half: every video must still be public and still BibleProject.
const CHANNEL = 'BibleProject';
const problems = [];
for (const v of catalogue) {
  const url = `https://www.youtube.com/oembed?url=${
    encodeURIComponent(`https://www.youtube.com/watch?v=${v.id}`)}&format=json`;
  try {
    const res = await fetch(url);
    if (!res.ok) { problems.push(`${v.key} (${v.id}): HTTP ${res.status} — pulled or made private?`); continue; }
    const data = await res.json();
    if (data.author_name !== CHANNEL) {
      problems.push(`${v.key} (${v.id}): now belongs to ${data.author_name}, not ${CHANNEL}`);
    }
  } catch (err) {
    problems.push(`${v.key} (${v.id}): ${err.message}`);
  }
  // The endpoint is unauthenticated and free; do not hammer it.
  await new Promise((r) => setTimeout(r, 200));
}
for (const p of problems) console.error(`  ${p}`);
assert.equal(problems.length, 0, `${problems.length} video(s) no longer check out`);

console.log(
  `ok — ${catalogue.length} videos, all public on the ${CHANNEL} channel, ` +
  `${mapping.length} places carry one`,
);
