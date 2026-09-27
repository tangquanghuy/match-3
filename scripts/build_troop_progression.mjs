/** Preserve per-troop progression from the existing GoWHead snapshot.
 * Source/provenance and intentional deviations: docs/GOW-NUMERIC-AUDIT.md.
 * Separate output: never rewrites hand-edited combat text in troops.json.
 */
import fs from 'node:fs';
const source = JSON.parse(fs.readFileSync('data/raw/troops.gow.zh.json', 'utf8'));
const colors = ['blue', 'green', 'red', 'yellow', 'purple', 'brown'];
const arcane = colors.flatMap((a, i) => colors.slice(i).map(b => `arcane:${a}:${b}`));
const stoneKey = id => id === 39 ? 'celestial' : id >= 18 ? arcane[id - 18] : `${['minor', 'major', 'runic'][Math.floor(id / 6)]}:${colors[id % 6]}`;
const lines = source.troops.map(t => {
  const raw = t.raw_data ?? {};
  const growth = Object.fromEntries([['health', 'Health'], ['armor', 'Armor'], ['attack', 'Attack'], ['magic', 'SpellPower']].map(([key, field]) => {
    const increments = raw[`${field}Increase`];
    if (!Array.isArray(increments) || increments.length !== 20 || increments[0] !== 0 || increments.some(n => !Number.isInteger(n) || n < 0)) throw new Error(`Missing growth: ${t.id}/${field}`);
    return [key, increments];
  }));
  const traits = (raw.Traitstones ?? []).map(costs => Object.fromEntries(costs.map(c => {
    const key = stoneKey(c.Id);
    if (!key || !Number.isInteger(c.Id) || c.Id < 0 || c.Id > 39 || !Number.isInteger(c.Required) || c.Required <= 0) throw new Error(`Invalid stone cost: ${t.id}/${c.Id}/${c.Required}`);
    return [key, c.Required];
  })));
  return `  "${t.id}": ${JSON.stringify({ growth, traits })}`;
});
fs.writeFileSync('src/data/troop-progression.json', `{\n${lines.join(',\n')}\n}\n`);
console.log(`Extracted exact growth and trait costs for ${lines.length} troops (${source.exported_at}).`);
