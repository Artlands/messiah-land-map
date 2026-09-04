import table from './en.json';

const dict: Record<string, string> = table;

/**
 * English lookup, keyed by the simplified source text with whitespace
 * collapsed — the form `scripts/check-en.mjs` extracts and checks. Surrounding
 * whitespace is put back, since a JSX text node often carries the space that
 * separates it from the next element. Anything not in the table falls through
 * to Chinese rather than disappearing.
 */
export function toEnglish(input: string): string {
  const [, lead, body, trail] = /^(\s*)([\s\S]*?)(\s*)$/.exec(input)!;
  const hit = dict[body.replace(/\s+/g, ' ')];
  return hit === undefined ? input : lead + hit + trail;
}
