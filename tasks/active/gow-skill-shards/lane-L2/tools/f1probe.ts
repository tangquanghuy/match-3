/**
 * sa-F1 probe: cast one entity with custom options and print the compact summary line.
 *   npx vite-node tasks/active/gow-skill-shards/lane-L2/tools/f1probe.ts troop:6871 '{"magic":0}'
 * Options are CastOpts JSON (allies/enemies/caster partials; colors as strings, e.g. "Purple").
 */
import { castSpell, summaryLine } from '../../../../../tests/helpers/gowCast';

const [key, json] = process.argv.slice(2);
const o = json ? JSON.parse(json) : {};
const r = castSpell({ key, ...o });
console.log(summaryLine(r.summary));
if (process.env.F1_UNITS) for (const u of r.f.units) console.log(u.id, u.name, 'hp', u.hp, 'arm', u.armor, 'atk', u.attack, 'mag', u.magic, 'mana', u.mana, u.statuses.map(s => s.id).join(','));
