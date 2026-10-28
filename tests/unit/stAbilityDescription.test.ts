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
      '爆破随机基色宝石', '爆破随机红色宝石', '摧毁随机行',
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
    expect(a.name).toContain('指定的一名敌人伤害');
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
    expect(filters.description).toContain('族群#');
    expect(filters.description).toContain('区域#3');
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
    for (const phrase of ['1.5×魔力+3', '前2～4名', '族群#8', '区域#9', '34/100', 'max(0,10)', '2×(自身攻击)', '数值先加5', '再×3', '最后×2', '25%', '主目标由存活变为阵亡', '不满足']) expect(result.description).toContain(phrase);
  });

  it('matches engine ratio rounding, separate sources, pooled sources and source group precedence', () => {
    const sources: ModifierSource[] = [{kind: 'selfStat', stat: 'armor'}, {kind: 'selfStat', stat: 'hp'}];
    const make = (modifier: ModifierSpec) => render(damage({modifier})).description;
    const mod = {kind: 'ratio', a: 3, b: 1} as const;
    expect(make({mod, sources})).toContain('floor((自身护甲)×34/100)+floor((自身生命)×34/100)');
    expect(make({mod, sources, pooled: true})).toContain('floor((自身护甲+自身生命)×34/100)');
    expect(make({mod, sources, sourceGroups: [sources, [{kind: 'selfStat', stat: 'magic'}]]})).toContain('floor((自身护甲+自身生命)×34/100)+floor((自身魔力)×34/100)');
    expect(make({mod: {kind: 'ratio', a: 3, b: 2}, sources})).toContain('2×floor((自身护甲)/3)');
  });

  it('has a description for every declared target mode, including exact adjacency and cached targets', () => {
    for (const mode of declaredUnion('src/engine/skills/targeting.ts', 'TargetMode')) {
      const result = render(damage({target: mode as TargetMode, n: 3}));
      expect(result.support, mode).toBe('full');
      expect(result.description, mode).not.toContain(mode);
    }
    expect(render(damage({target: 'enemyChosenAndAdjacent'})).description).toContain('不含选定者');
    expect(render(damage({target: 'enemyChosenAndBelow'})).description).toContain('下方全部');
    expect(render(damage({target: 'allyRandomPrefNotPrevN', n: 3})).description).toContain('可重复');
    expect(render(damage({target: 'lastDamaged'})).description).toContain('最近伤害段');
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
    expect(result.description).toContain('由施放者选择');
    expect(result.description).toContain('等概率随机');
    expect(result.description).toContain('每场战斗仅可施放一次');
    expect(result.description).toContain('单位#22');
    expect(JSON.stringify(result)).not.toMatch(/SOURCE_|OFFICIAL_|NARRATIVE_/);
    const again = render(damage({targetRace: 'SOURCE_RACE'}));
    const identity = result.description.match(/族群#\d+/)![0];
    expect(again.description).toContain(identity);
  });

  it('preserves random gem counts, geometry, special tiers, colours and count formulas', () => {
    const result = render(
      {kind: 'gem', params: {op: 'create', gem: {kind: 'mixSpecial', minimumEach: 2, specs: [{kind: 'wildcard', tier: 3}, {kind: 'dragonGem', color: BaseColor.Purple}]}, count: fixed(8), countRange: {min: 5, max: 9}}},
      {kind: 'gem', params: {op: 'transform', fromSpecial: 'stoneBlock', to: BaseColor.Red, toSpecial: {kind: 'gargoyleGem', tier: 2}, tiers: [1, 2], count: magic, countModifier: {mod: {kind: 'multiplier', a: 1}, source: {kind: 'boardSkulls'}}, diagonal: 'right', diagonalAnchor: 'chosenCell'}},
      {kind: 'gem', params: {op: 'clear', mode: 'explode', target: {kind: 'area', shape: 'square3', center: {row: 2, col: 4}}, countAdjacentSpecial: 'wildcard'}},
    );
    expect(result.support).toBe('full');
    for (const p of ['5～9', '每类至少2颗', '等级3', '紫色', '穿过选定格', '1～2', '3×3', '第3行第5列', '清除前记录相邻']) expect(result.description).toContain(p);
  });

  it('separates segment gating, boosted chance without a base chance, and per-target devour', () => {
    const boost: ModifierSpec = {mod: {kind: 'multiplier', a: 5}, source: {kind: 'boardSkulls'}};
    const result = render(damage({chanceBoost: boost}), {kind: 'devour', target: 'enemyAll', chance: 0.2, chanceBoost: boost, chanceMult: {cond: {kind: 'targetRace', race: 'affinity:3'}, times: 2}});
    expect(result.support).toBe('full');
    expect(result.segments[0].text).toContain('整段以clamp(0%');
    expect(result.segments[1].text).toContain('分别判定吞噬');
    expect(result.segments[1].text).toContain('20%×');
    expect(result.segments[1].text).not.toContain('整段以');
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
    for (const p of ['生命与生命上限同时增加', '恢复生命，不超过上限', '目标当前缺失生命', '法力上限×0.25', '全部数值', '重复2次', '实际削减量×0.5', '每点独立随机分配', '全部点数加给该项', '目标实际损失的生命']) expect(result.description).toContain(p);
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



