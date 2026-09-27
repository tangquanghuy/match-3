// Replays every approved skill behaviour (tasks/active/gow-skill-shards/lane-*/golden.json) through a real cast in
// the four standard scenarios. A failure means the skill's behaviour changed after it was signed off: re-review it
// (npx vite-node scripts/gow-golden.ts diff), then approve again or drop + log an issue.
// @ts-expect-error Node-only
import fs from 'node:fs';
import { describe, it, expect } from 'vitest';
import { scenarioLines } from '../helpers/gowCast';

const base = 'tasks/active/gow-skill-shards';
const entries: [string, string, Record<string, string>][] = [];
for (const d of fs.readdirSync(base).filter((d: string) => d.startsWith('lane-'))) {
  const p = `${base}/${d}/golden.json`;
  if (fs.existsSync(p)) for (const [k, e] of Object.entries(JSON.parse(fs.readFileSync(p, 'utf8')) as Record<string, { lines: Record<string, string> }>)) entries.push([d.slice(5), k, e.lines]);
}
describe('approved GoW skill behaviour (golden)', () => {
  it('golden files load', () => { expect(Array.isArray(entries)).toBe(true); });
  for (const [lane, key, lines] of entries) it(`${lane} ${key}`, () => { expect(scenarioLines(key)).toEqual(lines); });
});
