import { describe, expect, it } from 'vitest';
import ts from 'typescript';
import { BaseColor } from '../../src/engine/types';
import { describeAdaptedAbility } from '../../src/sillytavern/abilityDescription';
import type { AdaptedAbilityDescription, DescribedAbilitySegment } from '../../src/sillytavern/abilityDescription';
import { adaptedPrototype } from '../../src/sillytavern/enemyBlueprint';
import { registerSkillLibrary, SKILL_LIBRARY } from '../../src/engine/skills/library';
import type { EffectSegment, SkillPrototype } from '../../src/engine/skills/prototypes';
import type { Condition, ModifierSource, ModifierSpec } from '../../src/engine/skills/effects/secondary';
import type { TargetMode } from '../../src/engine/skills/targeting';

const fixed = (base: number) => ({base, mult: 0});
const magic = {base: 3, mult: 1.5};
const skill = (...segments: EffectSegment[]): SkillPrototype => ({segments});
const damage = (extra: Partial<Extract<EffectSegment, {kind: 'damage'}>> = {}): EffectSegment => ({kind: 'damage', target: 'enemyChosen', scaling: magic, ...extra});
const render = (...segments: EffectSegment[]) => describeAdaptedAbility(skill(...segments));
function flat(nodes: DescribedAbilitySegment[]): DescribedAbilitySegment[] {
  return nodes.flatMap(n => [n, ...(n.branches?.flatMap(flat) ?? [])]);
}
function assertAudit(result: AdaptedAbilityDescription): void {
  const nodes = flat(result.segments), c = result.coverage;
  expect(c.totalSegments).toBe(nodes.length);
  expect(c.fullSegments + c.partialSegments + c.unsupportedSegments).toBe(c.totalSegments);
  expect(c.ratio).toBe(c.totalSegments ? c.fullSegments / c.totalSegments : 0);
  expect(c.unresolvedPaths).toEqual([...new Set(result.diagnostics.map(d => d.path))]);
  if (result.support === 'full') {
    expect(result.diagnostics).toEqual([]);
    expect(c.fullSegments).toBe(c.totalSegments);
    expect(result.description).not.toContain('未解析');
  } else if (result.support !== 'empty') expect(result.diagnostics.length).toBeGreaterThan(0);
  expect(result.description).not.toContain('造成效果');
  expect(result.name).toMatch(/[\u4e00-\u9fff]/);
}

// Read the actual declarations so additions to TargetMode/Condition/ModifierSource/EffectSegment
// force a test update. These are engine data contracts, not a duplicate hand-maintained denominator.
function declaredUnion(file: string, name: string): string[] {
  const source = ts.createSourceFile(file, ts.sys.readFile(`${ts.sys.getCurrentDirectory()}/${file}`)!, ts.ScriptTarget.Latest, true);
  const node = source.statements.find((s): s is ts.TypeAliasDeclaration => ts.isTypeAliasDeclaration(s) && s.name.text === name)!;
  if (name === 'EffectSegment') return (node.type as ts.UnionTypeNode).types.map(t => {
    const declaration = source.statements.find((s): s is ts.InterfaceDeclaration => ts.isInterfaceDeclaration(s) && s.name.text === t.getText(source))!;
    const kind = declaration.members.find(m => m.name?.getText(source) === 'kind') as ts.PropertySignature;
    return ((kind.type as ts.LiteralTypeNode).literal as ts.StringLiteral).text;
  });
  return (node.type as ts.UnionTypeNode).types.map(t => {
    if (ts.isLiteralTypeNode(t)) return (t.literal as ts.StringLiteral).text;
    const kind = (t as ts.TypeLiteralNode).members.find(m => m.name?.getText(source) === 'kind') as ts.PropertySignature;
    return ((kind.type as ts.LiteralTypeNode).literal as ts.StringLiteral).text;
  });
}

// Scan every compiled troop skill and every registered numeric weapon skill. gw_* keys are aliases.
const allRegistered = new Map<string, SkillPrototype>();
registerSkillLibrary(allRegistered);
const adaptedEntries = Object.keys(SKILL_LIBRARY).map(id => [id, adaptedPrototype(Number(id))] as const);
const weaponEntries = [...allRegistered].filter(([id]) => /^\d+$/.test(id) && !Object.hasOwn(SKILL_LIBRARY, id));
const catalogue = [...adaptedEntries.map(([id, p]) => ({scope: 'adaptedTroop', id, p})), ...weaponEntries.map(([id, p]) => ({scope: 'weapon', id, p}))];
const scanned = catalogue.map(row => ({...row, result: describeAdaptedAbility(row.p)}));

describe('ST-04 actual compiled ability catalogue', () => {
  it('audits the complete compiled catalogue, preserves every nested segment and reports exact unresolved paths', () => {
    expect(adaptedEntries.length).toBe(Object.keys(SKILL_LIBRARY).length);
    expect(adaptedEntries.length).toBeGreaterThan(1700);
    expect(weaponEntries.length).toBeGreaterThan(400);
    const kindCounts: Record<string, number> = {}, diagnosticCounts: Record<string, number> = {};
    for (const row of scanned) {
      assertAudit(row.result);
      const count = (s: EffectSegment): number => 1 + ('options' in s ? s.options.flat().reduce((n, child) => n + count(child), 0) : 0);
      expect(row.result.coverage.totalSegments, `${row.scope}:${row.id}`).toBe(row.p.segments.reduce((n, s) => n + count(s), 0));
      for (const n of flat(row.result.segments)) kindCounts[n.kind] = (kindCounts[n.kind] ?? 0) + 1;
      for (const d of row.result.diagnostics) diagnosticCounts[d.code + ':' + d.path.replace(/\[\d+\]/g, '[]')] = (diagnosticCounts[d.code + ':' + d.path.replace(/\[\d+\]/g, '[]')] ?? 0) + 1;
    }
    console.info('ST04_DESCRIPTION_AUDIT', JSON.stringify({
      scopes: ['adaptedTroop', 'weapon'].map(scope => {
        const rows = scanned.filter(r => r.scope === scope);
        return {scope, abilities: rows.length, full: rows.filter(r => r.result.support === 'full').length,
          partial: rows.filter(r => r.result.support === 'partial').length, unsupported: rows.filter(r => r.result.support === 'unsupported').length,
          segments: rows.reduce((n, r) => n + r.result.coverage.totalSegments, 0),
          fullSegments: rows.reduce((n, r) => n + r.result.coverage.fullSegments, 0)};
      }), kindCounts, diagnosticCounts,
      unresolvedAbilities: scanned.filter(r => r.result.diagnostics.length).map(r => ({scope: r.scope, id: r.id, paths: r.result.coverage.unresolvedPaths})),
    }));
  }, 30000);

  it('never mutates a prototype and is deterministic for every entry', () => {
    for (const {p, result} of scanned) {
      const before = JSON.stringify(p);
      expect(describeAdaptedAbility(p)).toEqual(result);
      expect(JSON.stringify(p)).toBe(before);
    }
  }, 30000);

  it('covers each declared effect kind through the catalogue or explicit contract fixtures', () => {
    const extras: EffectSegment[] = [
      {kind: 'summon', params: {source: {ref: 'unit:1'}, countRange: {min: 1, max: 2}}},
      {kind: 'swapPositions', a: 'allyFront', b: 'allyLast'},
      {kind: 'selfRevive', full: true, fullMana: true},
    ];
    const seen = new Set([...scanned.flatMap(r => flat(r.result.segments).map(s => s.kind)), ...flat(render(...extras).segments).map(s => s.kind)]);
    expect([...seen].sort()).toEqual(declaredUnion('src/engine/skills/prototypes.ts', 'EffectSegment').sort());
  });
});

describe('ST-04 mechanics and completeness contracts', () => {
  it('keeps gem ability titles semantic while retaining exact quantities in their descriptions', () => {
    const gems: EffectSegment[] = [
      {kind: 'gem', params: {op: 'clear', mode: 'explode', target: {kind: 'randomGems', count: fixed(1)}}},
      {kind: 'gem', params: {op: 'clear', mode: 'explode', target: {kind: 'randomGems', count: magic, color: BaseColor.Red}}},
      {kind: 'gem', params: {op: 'clear', mode: 'destroy', target: {kind: 'randomLines', orientation: 'row', count: magic}}},
    ];
    expect(gems.map(s => render(s).name.replace(/〔.*$/, ''))).toEqual([
      '爆破宝石', '爆破红色宝石', '摧毁随机行',
    ]);
    expect(render(gems[0]).description).toContain('max(0,round(1))');
    expect(render(gems[1]).description).toContain('max(0,round(1.5×魔力+3))');
    expect(render(gems[2]).description).toContain('max(0,round(1.5×魔力+3))');
    const variant = structuredClone(gems[0]) as Extract<EffectSegment, {kind: 'gem'}>;
    if (variant.params.op === 'clear' && variant.params.target.kind === 'randomGems') variant.params.target.count = fixed(2);
    expect(render(variant).name).not.toBe(render(gems[0]).name); // The mechanical suffix still distinguishes recipes.
  });

  it('keeps formulas out of titles for every compiled native recipe', () => {
    for (const {scope, id, result} of scanned) {
      expect(result.name, `${scope}:${id}`).not.toMatch(/\b(?:max|min|round|floor)\s*\(/);
    }
  });

  it('names actual targets and effects, with stable fingerprints for tactical differences', () => {
    const a = render(damage());
    const reordered = render({scaling: {...magic}, target: 'enemyChosen', kind: 'damage'});
    expect(a.name).toBe(reordered.name);
    expect(a.name).toContain('一名敌人伤害');
    expect(a.name).toMatch(/〔[0-9a-z]{7}〕$/);
    const variants = [damage({target: 'enemyAll'}), damage({trueDamage: true}), damage({scaling: fixed(7)}), damage({chance: 0.5}), damage({ifCond: {kind: 'selfHpDamaged'}})];
    const names = variants.map(s => render(s).name);
    expect(new Set([a.name, ...names]).size).toBe(variants.length + 1);
    expect(names[0]).toContain('所有敌人伤害');
    expect(names[1]).toContain('穿甲伤害');
    expect(render({kind: 'status', target: 'enemyAll', statusId: 'frozen', turns: 3}).name).toContain('所有敌人冻结');
    expect(render({kind: 'buff', target: 'allySelf', stat: 'hp', lifeMode: 'gain', scaling: fixed(4)}).name).toContain('自身生命成长');
    expect(render({kind: 'gem', params: {op: 'create', gem: {kind: 'color', color: BaseColor.Red}, count: fixed(3)}}).name).toContain('生成红色宝石');
    const namesToMechanics = new Map<string, string>();
    for (const {result} of scanned) {
      const previous = namesToMechanics.get(result.name);
      if (previous !== undefined) expect(result.description).toBe(previous);
      namesToMechanics.set(result.name, result.description);
    }
  });

  it('handles duplicated gem metadata and runtime random-status filters while retaining conflicting metadata diagnostics', () => {
    const modifier: ModifierSpec = {mod: {kind: 'multiplier', a: 4}, source: {kind: 'boardSkulls'}};
    const gem: EffectSegment = {kind: 'gem', params: {op: 'create', gem: {kind: 'skull'}, count: fixed(0), modifier}};
    const plain = render(gem);
    const duplicate = render({...gem, modifier: {source: modifier.source, mod: modifier.mod}} as EffectSegment);
    expect(duplicate.support).toBe('full');
    expect(duplicate.name).toBe(plain.name);
    expect(duplicate.description).toBe(plain.description);
    const conflicting = render({...gem, modifier: {...modifier, max: 2}} as EffectSegment);
    expect(conflicting.support).toBe('partial');
    expect(conflicting.coverage.unresolvedPaths).toContain('segments[0].modifier');
    const filters = render({kind: 'randomStatus', target: 'allyAll', pool: 'positive', targetRace: 'NARRATIVE_GROUP', targetKingdom: 'region:3'} as EffectSegment);
    expect(filters.support).toBe('full');
    // Hidden identities read as "特定族群/特定区域" inside the target noun.
    expect(filters.description).toContain('所有来自特定区域的特定族群盟友');
    expect(filters.description).not.toMatch(/region:|affinity:/);
    expect(JSON.stringify(filters)).not.toContain('NARRATIVE_GROUP');
  });

  it('preserves numeric formula, target count, filters, modifiers and condition ordering', () => {
    const result = render(damage({target: 'enemyFirstN', nRange: {min: 2, max: 4}, targetRace: 'affinity:8', targetKingdom: 'region:9',
      modifier: {mod: {kind: 'ratio', a: 3, b: 1}, source: {kind: 'boardGems', color: BaseColor.Red}, max: 10},
      modifiers: [{mod: {kind: 'multiplier', a: 2}, source: {kind: 'selfStat', stat: 'attack'}}],
      condBonus: {n: 5, cond: {kind: 'targetStatus', statusId: 'frozen'}}, raceDouble: 'affinity:4', raceTimes: 3,
      condMult: {times: 2, cond: {kind: 'selfHpDamaged'}}, chance: 0.25, ifTargetDied: true,
      ifCond: {kind: 'allOf', of: [{kind: 'enemyRacePresent', race: 'affinity:8'}, {kind: 'not', cond: {kind: 'manaFull', of: 'caster'}}]},
    }));
    expect(result.support).toBe('full');
    // Game-style wording; the bonus cap is intentionally not shown (user decision 2026-10-29).
    for (const phrase of ['1.5×魔力+3', '前2～4位', '来自特定区域的特定族群敌人', '红色宝石数（每3颗+1）', '自身攻击（2倍）', '若目标陷入冻结则伤害+5', '三倍伤害', '若自身已受伤则造成双倍伤害', '有25%几率', '若目标身亡且', '自身法力未满']) expect(result.description).toContain(phrase);
    // Conditions keep their order: death check, then the battlefield condition, then the chance.
    expect(result.description.indexOf('若目标身亡')).toBeLessThan(result.description.indexOf('有25%几率'));
  });

  it('matches engine ratio rounding, separate sources, pooled sources and source group precedence', () => {
    const sources: ModifierSource[] = [{kind: 'selfStat', stat: 'armor'}, {kind: 'selfStat', stat: 'hp'}];
    const make = (modifier: ModifierSpec) => render(damage({modifier})).description;
    const mod = {kind: 'ratio', a: 3, b: 1} as const;
    // Separately rounded sources keep their own rate; pooled sources share one.
    expect(make({mod, sources})).toContain('自身护甲（33%）和自身生命（33%）');
    expect(make({mod, sources, pooled: true})).toContain('自身护甲和生命而增强（33%）');
    expect(make({mod, sources, sourceGroups: [sources, [{kind: 'selfStat', stat: 'magic'}]]})).toContain('自身护甲和生命（33%）和自身魔力（33%）');
    expect(make({mod: {kind: 'ratio', a: 3, b: 2}, sources})).toContain('自身护甲（67%）');
  });

  it('has a description for every declared target mode, including exact adjacency and cached targets', () => {
    for (const mode of declaredUnion('src/engine/skills/targeting.ts', 'TargetMode')) {
      const result = render(damage({target: mode as TargetMode, n: 3}));
      expect(result.support, mode).toBe('full');
      expect(result.description, mode).not.toContain(mode);
    }
    expect(render(damage({target: 'enemyChosenAndAdjacent'})).description).toContain('目标两侧的敌人');
    expect(render(damage({target: 'enemyChosenAndBelow'})).description).toContain('一名敌人及其后方所有敌人');
    expect(render(damage({target: 'allyRandomPrefNotPrevN', n: 3})).description).toContain('3名随机盟友');
    expect(render(damage({target: 'lastDamaged'})).description).toContain('受到伤害的目标');
  });

  it('describes all declared conditions and sources, as observed across the full catalogue plus rare contracts', () => {
    const conditions = new Map<string, Condition>(), sources = new Map<string, ModifierSource>();
    const conditionKinds = declaredUnion('src/engine/skills/effects/secondary.ts', 'Condition');
    const sourceKinds = declaredUnion('src/engine/skills/effects/secondary.ts', 'ModifierSource');
    const walk = (v: unknown, key = ''): void => {
      if (!v || typeof v !== 'object') return;
      if (Array.isArray(v)) { v.forEach(x => walk(x, key)); return; }
      const o = v as Record<string, unknown>;
      if (typeof o.kind === 'string' && conditionKinds.includes(o.kind) && ['ifCond', 'cond', 'of'].includes(key)) conditions.set(o.kind, v as Condition);
      if (typeof o.kind === 'string' && sourceKinds.includes(o.kind) && ['source', 'sources', 'sourceGroups'].includes(key)) sources.set(o.kind, v as ModifierSource);
      Object.entries(o).forEach(([k, value]) => walk(value, k));
    };
    catalogue.forEach(r => walk(r.p));
    // Fixtures are required only for union members absent from the actual catalogue.
    const c: Condition[] = [{kind: 'anyEnemyColor', color: BaseColor.Red}, {kind: 'kingdomOf', side: 'enemy', kingdom: 'region:2'}, {kind: 'regionPresent', region: 'region:1'}, {kind: 'ascended', min: 2}, {kind: 'lastTargetSurvived'}, {kind: 'targetHasAnyStatus'}, {kind: 'castStartBoardAtLeast', color: BaseColor.Blue, n: 4}];
    c.forEach(v => conditions.set(v.kind, v));
    const s: ModifierSource[] = [{kind: 'enemyGold'}, {kind: 'enemiesOfKingdom', kingdom: 'region:2'}, {kind: 'randomAllyStat', stat: 'attack'}, {kind: 'surroundingGems', color: BaseColor.Green, anchor: 'lastCreated'}, {kind: 'countedAdjacentSpecial'}, {kind: 'battleGems'}, {kind: 'battleMaps'}, {kind: 'tempering'}, {kind: 'castStartBoardSkulls'}];
    s.forEach(v => sources.set(v.kind, v));
    expect([...conditions.keys()].sort()).toEqual(conditionKinds.sort());
    expect([...sources.keys()].sort()).toEqual(sourceKinds.sort());
    for (const [kind, cond] of conditions) expect(render(damage({ifCond: cond})).support, `condition:${kind}`).toBe('full');
    for (const [kind, source] of sources) expect(render(damage({modifier: {mod: {kind: 'multiplier', a: 2}, source}})).support, `source:${kind}`).toBe('full');
  });

  it('distinguishes player choice from randomness and strips branch labels and all reference identities', () => {
    const result = describeAdaptedAbility({oncePerBattle: true, inputTarget: 'enemyChosen', segments: [
      {kind: 'choose', labels: ['OFFICIAL_SPELL_SECRET', 'NARRATIVE_IDENTITY'], options: [
        [{kind: 'oneOf', options: [[damage()], [{kind: 'extraTurn'}]]}],
        [{kind: 'summon', params: {source: {randomOf: ['SOURCE_UNIT_ALPHA', 'unit:22']}, position: 'front'}}],
      ]},
      damage({targetRace: 'SOURCE_RACE', targetKingdom: 'SOURCE_KINGDOM', ifCond: {kind: 'troopPresent', name: 'SOURCE_UNIT_BETA'}}),
    ]});
    expect(result.support).toBe('full');
    expect(result.coverage.totalSegments).toBe(6);
    expect(result.description).toContain('施放时选择：①');
    // A random pick nested in a choice reads inline so ①② stay unambiguous.
    expect(result.description).toContain('①随机触发其一：');
    expect(result.description).toContain('，或获得一个额外回合；②');
    expect(result.description).toContain('每场战斗限一次');
    expect(result.description).toContain('召唤1名随机随从到首位');
    expect(result.description).toContain('若场上有特定单位');
    expect(JSON.stringify(result)).not.toMatch(/SOURCE_|OFFICIAL_|NARRATIVE_/);
    const again = render(damage({targetRace: 'SOURCE_RACE'}));
    expect(again.description).toContain('特定族群敌人');
  });

  it('preserves random gem counts, geometry, special tiers, colours and count formulas', () => {
    const result = render(
      {kind: 'gem', params: {op: 'create', gem: {kind: 'mixSpecial', minimumEach: 2, specs: [{kind: 'wildcard', tier: 3}, {kind: 'dragonGem', color: BaseColor.Purple}]}, count: fixed(8), countRange: {min: 5, max: 9}}},
      {kind: 'gem', params: {op: 'transform', fromSpecial: 'stoneBlock', to: BaseColor.Red, toSpecial: {kind: 'gargoyleGem', tier: 2}, tiers: [1, 2], count: magic, countModifier: {mod: {kind: 'multiplier', a: 1}, source: {kind: 'boardSkulls'}}, diagonal: 'right', diagonalAnchor: 'chosenCell'}},
      {kind: 'gem', params: {op: 'clear', mode: 'explode', target: {kind: 'area', shape: 'square3', center: {row: 2, col: 4}}, countAdjacentSpecial: 'wildcard'}},
    );
    expect(result.support).toBe('full');
    // Per-kind minimums, random tiers and the adjacency record are engine detail and not shown.
    for (const p of ['创造5～9颗3级通配宝石和紫色特殊宝石', '选定格右斜对角线上的', '颗石块转化为2级红色特殊宝石', '数量因骷髅头数而增强（每颗+1）', '爆破第3行第5列的3×3范围']) expect(result.description).toContain(p);
  });

  it('separates segment gating, boosted chance without a base chance, and per-target devour', () => {
    const boost: ModifierSpec = {mod: {kind: 'multiplier', a: 5}, source: {kind: 'boardSkulls'}};
    const result = render(damage({chanceBoost: boost}), {kind: 'devour', target: 'enemyAll', chance: 0.2, chanceBoost: boost, chanceMult: {cond: {kind: 'targetRace', race: 'affinity:3'}, times: 2}});
    expect(result.support).toBe('full');
    expect(result.segments[0].text).toContain('有N%（N等于骷髅头数×5）几率对一名敌人造成');
    expect(result.segments[1].text).toContain('有N%（N等于20+骷髅头数×5）几率吞噬所有敌人');
    expect(result.segments[1].text).toContain('若目标为特定族群则几率翻倍');
  });

  it('distinguishes growth, restoration, proportional mana, drain, full reduction and random stat allocation', () => {
    const result = render(
      {kind: 'buff', target: 'allySelf', stat: 'hp', lifeMode: 'gain', scaling: magic},
      {kind: 'buff', target: 'allyAll', stat: 'hp', lifeMode: 'heal', full: true, scaling: magic},
      {kind: 'buff', target: 'allyChosen', stat: 'mana', fraction: 0.25, scaling: magic},
      {kind: 'reduce', target: 'enemyAll', stat: 'mana', scaling: magic, drainAll: true, gainStat: 'mana', gainRatio: 0.5},
      {kind: 'reduce', target: 'enemyAll', stat: 'random', scaling: magic, times: 2},
      {kind: 'randomStat', target: 'allyAll', scaling: magic},
      {kind: 'randomStat', target: 'allyAll', scaling: magic, oneSkill: true},
      damage({drain: true}),
    );
    expect(result.support).toBe('full');
    for (const p of ['使自身生命增加', '完全治疗所有盟友', '为一名盟友补充25%法力', '清空所有敌人的法力，自身获得其中50%的法力', '随机属性减少max(0,round(1.5×魔力+3))，共2次', '为所有盟友随机分配', '使所有盟友的随机属性增加', '真实伤害，并恢复等量生命']) expect(result.description).toContain(p);
    expect(result.description).not.toContain('随机增加或削减');
  });

  it('reports unknown structures deeply, never copies unknown values, and propagates partial branches', () => {
    const future = {kind: 'choose', labels: ['secret'], options: [[{kind: 'futureMechanic', PAYLOAD: 'NARRATIVE_SECRET'}], [{...damage(), scaling: {...magic, hidden: 'NARRATIVE_SECRET'}, ifCond: {kind: 'futureCondition'}}]]};
    const result = render(future as unknown as EffectSegment);
    expect(result.support).toBe('partial');
    expect(result.segments[0].support).toBe('partial');
    expect(result.coverage.ratio).toBe(0);
    expect(result.coverage.unresolvedPaths).toEqual(expect.arrayContaining(['segments[0].options[0][0].kind', 'segments[0].options[1][0].scaling.hidden', 'segments[0].options[1][0].ifCond.kind']));
    expect(JSON.stringify(result)).not.toContain('NARRATIVE_SECRET');
    assertAudit(result);
  });

  it('flags unknown targets, status IDs, gem enum values, modifiers and added fields rather than guessing', () => {
    const broken: unknown[] = [
      {...damage(), target: 'newTarget'},
      {kind: 'status', target: 'enemyAll', statusId: 'SOURCE_NARRATIVE_STATUS', turns: 3},
      {kind: 'gem', params: {op: 'create', gem: {kind: 'special', spec: {kind: 'futureGem'}}, count: fixed(3)}},
      {...damage(), modifier: {mod: {kind: 'futureModifier', a: 2}, source: {kind: 'futureSource'}}},
      {...damage(), undisplayedMechanic: {value: 8}},
    ];
    for (const s of broken) {
      const result = render(s as EffectSegment);
      expect(result.support).toBe('partial');
      expect(result.diagnostics.length).toBeGreaterThan(0);
      assertAudit(result);
    }
  });

  it('reports templates, empty prototypes, future root fields, empty branches and depth limits honestly', () => {
    expect(describeAdaptedAbility({segments: []}).support).toBe('empty');
    const root = describeAdaptedAbility({...skill(damage()), futureRule: true} as SkillPrototype);
    expect(root.support).toBe('partial');
    expect(root.coverage.unresolvedPaths).toContain('prototype.futureRule');
    expect(render({kind: 'oneOf', options: []}).support).toBe('partial');
    const recursive = {kind: 'oneOf', options: []} as Extract<EffectSegment, {kind: 'oneOf'}>;
    recursive.options.push([recursive]);
    const result = describeAdaptedAbility(skill(recursive), {maxDepth: 3});
    expect(result.coverage.totalSegments).toBe(4);
    expect(result.diagnostics[0].code).toBe('depth-limit');
    const badNumber = render(damage({scaling: {base: NaN, mult: 1}}));
    expect(badNumber.support).toBe('partial');
    expect(badNumber.description).not.toContain('NaN');
    const template = render({kind: 'summon', params: {source: {template: {name: 'SECRET'} as never}}});
    expect(template.support).toBe('partial');
    expect(template.diagnostics[0].code).toBe('unresolved-template');
    expect(JSON.stringify(template)).not.toContain('SECRET');
  });
});



