/** Narrow independent expectations; a passing probe is NEVER whole-skill acceptance. */
import { registerSkillLibrary } from '../../src/engine/skills/library';
import { ExtensionRegistry } from '../../src/engine/registry';
import { TurnEngine } from '../../src/engine/TurnEngine';
import { TROOPS } from '../../src/data/troops';
import weapons from '../../src/data/weapons.json';
import type { GameEvent, SkillDamageEvent } from '../../src/engine/events';
import { damageFixture } from '../../tests/helpers/damageFixture';

function cast(kind: 'troop' | 'weapon', spellId: number, magic = 11, enemyAttack = 100) {
  const fixture = damageFixture(0, 0, Array.from({ length: 4 }, () => ({ attack: enemyAttack })));
  const entity = kind === 'troop' ? TROOPS.find(t => t.spell.id === spellId) : weapons.find(w => w.spell.id === spellId);
  if (!entity) throw new Error(`Missing ${kind} ${spellId}`);
  const { caster, state, ctx } = fixture;
  caster.magic = magic;
  caster.mana = caster.manaCost = entity.manaCost;
  caster.skillId = kind === 'troop' ? String(spellId) : `gw_${entity.referenceName}`;
  const registry = new ExtensionRegistry();
  registerSkillLibrary(registry.prototypes);
  const engine = new TurnEngine(state, ctx.rng, ctx.nextGemId, registry);
  engine.skullChance = 0;
  engine.setTargetChooser({ choose: () => 12 });
  engine.setCellChooser({ choose: () => ({ row: 3, col: 3 }) });
  const events = engine.castSkill(caster.id);
  if (!events.some(e => e.type === 'skill-cast')) throw new Error(`Probe did not cast ${spellId}`);
  return { ...fixture, entity, events };
}
const damage = (events: GameEvent[]) => events.filter((e): e is SkillDamageEvent => e.type === 'skill-damage');
export interface SkillAuditProbe {
  key: string; spellId: number; check: string; expected: unknown; actual: unknown;
  criterionMatches: boolean; wholeSkillAccepted: false; eventTypes: string[];
}
export function runSkillAuditProbes(): SkillAuditProbe[] {
  const probes: SkillAuditProbe[] = [];
  function record(c: ReturnType<typeof cast>, kind: 'troop' | 'weapon', check: string, expected: unknown, actual: unknown) {
    probes.push({ key: `${kind}:${c.entity.id}`, spellId: c.entity.spell.id, check, expected, actual,
      criterionMatches: JSON.stringify(expected) === JSON.stringify(actual), wholeSkillAccepted: false,
      eventTypes: [...new Set(c.events.map(e => e.type))] });
  }
  const musket = cast('troop', 7004);
  record(musket, 'troop', '指定第三名敌人时伤害落点', [12], damage(musket.events).map(e => e.targetId));
  for (const enemyAttack of [5, 100]) {
    const king = cast('weapon', 7192, 11, enemyAttack);
    record(king, 'weapon', `敌攻击${enemyAttack}，施法者攻击17：条件额外伤害`,
      15 + (enemyAttack > 17 ? 12 : 0), damage(king.events).reduce((n, e) => n + e.damage, 0));
  }
  const scythe = cast('weapon', 7285);
  const disease = scythe.enemies.filter(e => e.statuses.some(s => s.id === 'disease'));
  record(scythe, 'weapon', '施法后存在一名疾病敌人', 1, disease.length);
  const hammer = cast('weapon', 9204);
  record(hammer, 'weapon', '武器出战键实际施放产生溅射伤害', true, damage(hammer.events).some(e => e.range === 'splash'));
  for (const magic of [0, 11]) {
    const book = cast('weapon', 9985, magic);
    record(book, 'weapon', `无诅咒敌人、魔法${magic}：攻击削减`, magic + 1, 100 - book.enemies[2].attack);
  }
  return probes;
}
