// Lists every user-visible Chinese string in the app and checks it against
// app/en.json, the English lookup the language toggle uses.
//
//     node scripts/check-en.mjs          # report missing / unused keys
//     node scripts/check-en.mjs --keys   # print the keys, for filling gaps
//
// Keys are the simplified source text with whitespace collapsed, which is how
// the runtime looks up a DOM text node.
import { readFileSync } from 'node:fs';

const SOURCES = ['app/page.tsx', 'app/places.ts', 'app/geo.ts'];
const read = (f) => readFileSync(new URL(`../${f}`, import.meta.url), 'utf8');
const norm = (s) => s.replace(/\s+/g, ' ').trim();
const hasHan = (s) => /[一-鿿]/.test(s);
// Code and comments the regexes below sweep up, plus the toggle's own labels,
// which stay in their native script (the button is marked data-no-convert).
const isCode = (s) => /\/\/|\/\*|\*\/|\bconst\b|=>|———/.test(s);
const SKIP = new Set(['简', '繁', '语言 / Language']);

const keys = new Set();
for (const file of SOURCES) {
  const src = read(file);
  // String literals: place data, aria-labels, ruler names.
  for (const [, , body] of src.matchAll(/(['"])((?:\\.|(?!\1)[^\\])*)\1/g)) {
    if (hasHan(body) && !isCode(body)) keys.add(norm(body));
  }
  // JSX text nodes: whatever sits between tags and expressions.
  for (const [, body] of src.matchAll(/[>}]([^<>{}]*)[<{]/g)) {
    if (hasHan(body) && !isCode(body)) keys.add(norm(body));
  }
}

if (process.argv.includes('--keys')) {
  for (const k of SKIP) keys.delete(k);
  console.log(JSON.stringify(Object.fromEntries([...keys].sort().map((k) => [k, ''])), null, 2));
  process.exit(0);
}

for (const k of SKIP) keys.delete(k);

const en = JSON.parse(read('app/en.json'));
// Runtime looks up the collapsed form, so a key that is not already collapsed
// could never be hit.
for (const [k, v] of Object.entries(en)) {
  if (norm(k) !== k) throw new Error(`key is not normalised: ${JSON.stringify(k)}`);
  if (!v.trim()) throw new Error(`empty translation for: ${k}`);
}

const missing = [...keys].filter((k) => !en[k]);
const unused = Object.keys(en).filter((k) => !keys.has(k));
for (const k of missing) console.log(`missing  ${k}`);
for (const k of unused) console.log(`unused   ${k}`);
console.log(`${keys.size} strings, ${missing.length} missing, ${unused.length} unused`);
if (missing.length) process.exit(1);
