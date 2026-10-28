import { describe, expect, it, vi } from 'vitest';
import * as troopModule from '../../src/data/troops';
import { abilityIdentity, adaptedPrototype, adaptedAbilityDescription } from '../../src/sillytavern/enemyBlueprint';
import {
  prepareCurrentParty, HERO_MEMBER_REF, companionMemberRef, equipmentRef,
  partyAbilityChoices, damageDiceExpectation, DEFAULT_PARTY_CONVERSION,
} from '../../src/sillytavern/partyPreparation';
import type { PartyPreparationOptions } from '../../src/sillytavern/partyPreparation';
import type { HostSnapshot } from '../../src/sillytavern/hostAdapter';
import { prepareStBattle } from '../../src/sillytavern/battleRuntime';
import { BATTLE_SCHEMA_VERSION, RULESET_VERSION } from '../../src/session/contract';
import { mapRequestToTeams } from '../../src/session/combatantMapping';
import type { BattleRequest } from '../../src/session/contract';
import { BaseColor, PlayerSide } from '../../src/engine/types';
import { BoardGenerator } from '../../src/engine/boardGen';
import { SeededRNG } from '../../src/engine/rng';
import { createGameState } from '../../src/engine/GameState';
import { TurnEngine } from '../../src/engine/TurnEngine';
import { BattleSession } from '../../src/session/BattleSession';

function actor(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return { 名称: '林', 等级: 20, 生命值上限: 200, 当前生命值: 100, 临时生命值: 0, AC: 14,
    属性: { 力量: 16, 敏捷: 12, 体质: 14, 智力: 18, 感知: 12, 魅力: 10 },
    战斗属性: { 武器面板: { 伤害骰: '2d6', 等级系数: 3, 固定伤害: 10 },
      物理减伤: 20, 魔法减伤: 0, 每回合动作资源: { 攻击次数: 2 } }, 装备列表: {}, ...overrides };
}
function host(hero = actor(), bonds: Record<string, unknown> = {}, mode: unknown = 'classic'): HostSnapshot {
  return { chat: { hostId: 'test-host', characterId: 'avatar:test', chatId: 'chat' }, messageId: 1,
    swipeId: 0, fingerprint: 'fixture', statData: { 人物: hero, 羁绊列表: bonds, 系统配置: { 战斗数值模式: mode } } };
}
function companion(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  const result = actor({ 同行誓约: true, 三消: { 颜色: ['Purple', 'Green'] }, ...overrides });
  delete result['名称']; return result;
}
function weapon(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return { 名称: '叙事长剑', 类型: '武器', 部位: '主手', 装备箱: false, 品质: '普通', 等级: 1, ...overrides };
}
function optionsFor(names: string[]): PartyPreparationOptions {
  const ability = partyAbilityChoices()[0]!;
  return { memberRefs: [HERO_MEMBER_REF, ...names.map(companionMemberRef)],
    baseAbilities: Object.fromEntries(names.map(name => [companionMemberRef(name), ability.abilityId])) };
}
function battle(party: BattleRequest['playerTeam']): BattleRequest {
  return { schemaVersion: BATTLE_SCHEMA_VERSION, rulesetVersion: RULESET_VERSION,
    battleId: 'party-test', requestId: 'party-test-request', seed: 20261021, playerTeam: party,
    enemyTeam: [{ externalId: 'E1', name: 'E1', stats: { hp: 999, attack: 1, armor: 0, magic: 1 },
      manaColors: [BaseColor.Blue], manaCost: 3, skillId: 'gw_KnightsSword' }] };
}
describe('current ST party preparation', () => {
  it('uses the exact default catalogue weapon while preserving host identity and health ratio', () => {
    const input = host(); const before = structuredClone(input);
    const result = prepareCurrentParty(input);
    expect(result.ready).toBe(true); expect(result.issues).toEqual([]);
    const hero = result.party[0]!;
    expect(hero).toMatchObject({ externalId: HERO_MEMBER_REF, name: '林', levelLabel: '20',
      manaColors: ['Blue'], manaCost: 3, skillId: 'gw_KnightsSword', stats: { hp: 218, armor: 4, attack: 62, magic: 4 }, initialHp: 109 });
    expect(result.candidates[0]!.weapon).toMatchObject({ id: 'gw_KnightsSword', sourceId: 1000, spellId: 7066, isDefault: true });
    expect(hero).not.toHaveProperty('troopTypes'); expect(hero).not.toHaveProperty('templateId');
    expect(result.conversion.status).toBe('uncalibrated'); expect(input).toEqual(before);
    hero.stats.hp = 2; expect(prepareCurrentParty(input).party[0]!.stats.hp).toBe(218);
  });
  it('distinguishes the new panel/multiplier/zero-reduction rules', () => {
    const input = host(actor({ 战斗属性: { 武器面板: { 伤害骰: '2d6', 等级系数: 1, 固定伤害: 10 }, 物理减伤: 40, 魔法减伤: 20 } }), {}, '新版');
    const result = prepareCurrentParty(input);
    expect(result.ready).toBe(true); expect(result.party[0]!.stats).toEqual({ hp: 196, armor: 4, attack: 48, magic: 4 });
    expect(result.candidates[0]!.source).toMatchObject({ attackCount: 2, normalAttackMultiplier: 1.4, effectiveReduction: 0 });
    expect(result.candidates[0]!.source!.attackBaseline).toBeCloseTo(47.6);
    expect(prepareCurrentParty(host(actor(), {}, 'new')).issues.some(issue => issue.code === 'stale-panel')).toBe(true);
    expect(prepareCurrentParty(host(actor(), {}, 'typo')).ready).toBe(false);
  });
  it('offers deterministic missing color/base-ability initialization without writing or silently selecting', () => {
    const input = host(actor(), { '阿/青~': companion({ 三消: undefined }) }); const before = structuredClone(input);
    const ref = companionMemberRef('阿/青~'); expect(ref).toBe('/羁绊列表/阿~1青~0');
    const result = prepareCurrentParty(input, { memberRefs: [ref, HERO_MEMBER_REF] });
    expect(result.ready).toBe(false); expect(result.party).toEqual([]);
    expect(result.initializationChoices.find(choice => choice.kind === 'colors')).toMatchObject({ memberRef: ref, path: `${ref}/三消/颜色` });
    const combinations = result.initializationChoices.find(choice => choice.kind === 'colors')!.colorChoices!;
    expect(combinations).toHaveLength(21); expect(new Set(combinations.map(String)).size).toBe(21);
    const abilities = result.initializationChoices.find(choice => choice.kind === 'baseAbility')!.abilityChoices!;
    expect(abilities.length).toBeGreaterThan(1000); expect(abilities[0]!.skillId).toMatch(/^st:\d+$/);
    expect(prepareCurrentParty(input, { memberRefs: [ref, HERO_MEMBER_REF] }).initializationChoices).toEqual(result.initializationChoices);
    expect(input).toEqual(before); expect(prepareCurrentParty(input).ready).toBe(true);
  });
  it('reads stable host colors and converts the selected 1–4 people in UI order', () => {
    const input = host(actor(), { 甲: companion(), 乙: companion(), 丙: companion() });
    const opts = optionsFor(['甲', '乙', '丙']); opts.memberRefs = [companionMemberRef('乙'), HERO_MEMBER_REF, companionMemberRef('甲'), companionMemberRef('丙')];
    const result = prepareCurrentParty(input, opts);
    expect(result.ready).toBe(true); expect(result.party.map(unit => unit.externalId)).toEqual(opts.memberRefs);
    expect(result.party[0]).toMatchObject({ name: '乙', manaColors: ['Purple', 'Green'] });
    expect(() => prepareStBattle(battle(result.party))).not.toThrow();
    expect(prepareCurrentParty(input, { ...opts, memberRefs: [] }).ready).toBe(false);
    expect(prepareCurrentParty(input, { ...opts, memberRefs: [...opts.memberRefs, 'extra'] }).ready).toBe(false);
    expect(prepareCurrentParty(input, { ...opts, memberRefs: [HERO_MEMBER_REF, HERO_MEMBER_REF] }).ready).toBe(false);
    expect(prepareCurrentParty(input, { ...opts, memberRefs: [companionMemberRef('甲')] }).ready).toBe(false);
    expect(prepareCurrentParty(input, { memberRefs: [HERO_MEMBER_REF, 'missing'] }).ready).toBe(false);
  });
  it('keeps unselected/absent companions distinct and requires real travelling state', () => {
    const input = host(actor(), { 甲: companion({ 同行誓约: false }), 乙: companion({ 同行誓约: 'true' }) });
    expect(prepareCurrentParty(input).ready).toBe(true);
    expect(prepareCurrentParty(input, optionsFor(['甲'])).issues.some(issue => issue.code === 'not-travelling')).toBe(true);
    expect(prepareCurrentParty(input, optionsFor(['乙'])).issues.some(issue => issue.code === 'companion-state')).toBe(true);
  });
  it.each([['Red', 'Red'], [], ['pink'], ['Red', 'Blue', 'Green'], 'Blue'].map(value => ({ value })))(
    'rejects malformed stored colors $value', ({ value }) => {
      const result = prepareCurrentParty(host(actor(), { 甲: companion({ 三消: { 颜色: value } }) }), optionsFor(['甲']));
      expect(result.ready).toBe(false); expect(result.issues.some(issue => issue.code === 'colors')).toBe(true);
    });
  it('resolves current weapon bindings by equipment pointer, never by narrative names or boxed items', () => {
    const ref = equipmentRef(HERO_MEMBER_REF, 'sword/1');
    const input = host(actor({ 装备列表: { 'sword/1': weapon(), boxed: weapon({ 装备箱: true }) } }));
    expect(prepareCurrentParty(input).issues.some(issue => issue.code === 'weapon-binding')).toBe(true);
    const result = prepareCurrentParty(input, { weaponBindings: { [ref]: 'gw_KnightsSword' } });
    expect(result.ready).toBe(true); expect(result.candidates[0]!.equipment).toHaveLength(1);
    expect(result.candidates[0]!.weapon).toMatchObject({ isDefault: false, equipmentRef: ref });
    expect(prepareCurrentParty(input, { weaponBindings: { [ref]: 'invented' } }).ready).toBe(false);
    expect(prepareCurrentParty(host(actor({ 装备列表: { stored: weapon({ 装备箱: true }) } }))).party[0]!.skillId).toBe('gw_KnightsSword');
  });
  it('supports legacy wear-state and reports ambiguous or missing computed weapon panels', () => {
    const legacy = weapon({ 穿戴状态: '已装备' }); delete legacy['装备箱'];
    const input = host(actor({ 装备列表: { legacy }, 战斗属性: {} }));
    expect(prepareCurrentParty(input).issues.some(issue => issue.code === 'weapon-panel')).toBe(true);
    expect(prepareCurrentParty(host(actor({ 装备列表: { a: weapon(), b: weapon() } }))).issues.some(issue => issue.code === 'weapon-ambiguous')).toBe(true);
    expect(prepareCurrentParty(host(actor({ 装备列表: { a: weapon({ 装备箱: 'false' }) } }))).ready).toBe(false);
  });
  it('uses aggregate merged weapon dice without re-adding equipment bonuses', () => {
    const input = host(actor({ 战斗属性: { 武器面板: { 伤害骰: '1d6+1d4', 等级系数: 1, 固定伤害: 3 } },
      装备列表: { armor: weapon({ 类型: '防具', 部位: '上衣', 属性加成: { 力量: 100, 生命值上限: 999 }, 防御力: 500 }) } }));
    const result = prepareCurrentParty(input);
    expect(result.ready).toBe(true); expect(result.party[0]!.stats.attack).toBe(18);
    expect(result.candidates[0]!.source).toMatchObject({ maxHp: 200, diceExpectation: 6 });
    expect(damageDiceExpectation('2d6 + 1d4')).toBe(9.5);
  });
  it('uses explicit root readonly panels and exact helper unarmed fallback for each mode', () => {
    const input = host(actor({ 战斗属性: {} }));
    input.statData['武器面板'] = { 伤害骰: '1d6', 等级系数: 1, 固定伤害: 3 };
    expect(prepareCurrentParty(input).candidates[0]!.source?.panelSource).toBe('/武器面板');
    delete input.statData['武器面板'];
    expect(prepareCurrentParty(input).candidates[0]!.source).toMatchObject({ panelSource: 'helper:unarmed', levelCoefficient: 3, fixedDamage: 32 });
    input.statData['系统配置'] = { 战斗数值模式: 'new' };
    expect(prepareCurrentParty(input).candidates[0]!.source).toMatchObject({ levelCoefficient: 1, fixedDamage: 4 });
  });
  it('maps learned active:v1 IDs using save ownership and preserves companion colors', () => {
    const input = host(actor(), { 甲: companion() }); const ref = companionMemberRef('甲');
    const [base, learned] = partyAbilityChoices();
    const save = { id: 'save', chat: input.chat, learnedAbilityIds: [learned!.abilityId], equippedAbilities: { [ref]: learned!.abilityId } };
    const opts = { ...optionsFor(['甲']), baseAbilities: { [ref]: base!.abilityId }, save };
    const result = prepareCurrentParty(input, opts);
    expect(result.ready).toBe(true); expect(result.party[1]).toMatchObject({ skillId: learned!.skillId, manaCost: learned!.manaCost, manaColors: ['Purple', 'Green'] });
    expect(() => prepareStBattle(battle(result.party))).not.toThrow();
    expect(prepareCurrentParty(input, { ...opts, equippedAbilities: { [ref]: null } }).party[1]!.skillId).toBe(base!.skillId);
    expect(prepareCurrentParty(input, { ...opts, save: { ...save, learnedAbilityIds: [] } }).issues.some(issue => issue.code === 'ability-not-learned')).toBe(true);
    expect(prepareCurrentParty(input, { ...opts, save: { ...save, chat: { ...input.chat, chatId: 'other' } } }).ready).toBe(false);
    expect(prepareCurrentParty(input, { ...opts, save: { ...save, learnedAbilityIds: ['active:v1:missing'], equippedAbilities: { [ref]: 'active:v1:missing' } } }).issues.some(issue => issue.code === 'ability-mapping')).toBe(true);
    expect(prepareCurrentParty(input, { ...opts, baseAbilities: { renamed: base!.abilityId } }).ready).toBe(false);
  });
  it('derives bond-schema AC from highest worn armour quality and preserves one durability budget', () => {
    const ally = companion({ 装备列表: { armor: weapon({ 类型: '防具', 部位: '上衣', 品质: '神话' }) } }); delete ally['AC'];
    const result = prepareCurrentParty(host(actor(), { 甲: ally }), optionsFor(['甲']));
    expect(result.ready).toBe(true); expect(result.candidates[1]!.source?.ac).toBe(17);
    expect(result.party[1]!.stats.hp + result.party[1]!.stats.armor).toBe(222);
  });
  it.each([NaN, Infinity, -1, '20', 1.5])('rejects malformed level %j', value => {
    expect(prepareCurrentParty(host(actor({ 等级: value }))).ready).toBe(false);
  });
  it.each(['2d6+3', '1d0', '0d6', 'Infinityd6', '2d6junk'])('rejects malformed dice %s', dice => {
    expect(() => damageDiceExpectation(dice)).toThrow();
  });
  it('blocks zero/overflow/temporary health and out-of-range stats without clipping', () => {
    expect(prepareCurrentParty(host(actor({ 当前生命值: 0 }))).ready).toBe(false);
    expect(prepareCurrentParty(host(actor({ 当前生命值: 201 }))).ready).toBe(false);
    expect(prepareCurrentParty(host(actor({ 临时生命值: 3 }))).issues.some(issue => issue.code === 'temporary-hp')).toBe(true);
    expect(prepareCurrentParty(host(actor({ 生命值上限: 99999 }))).ready).toBe(false);
    expect(prepareCurrentParty(host(), { conversion: { ...DEFAULT_PARTY_CONVERSION, attackScale: 100 } }).ready).toBe(false);
    expect(prepareCurrentParty(host(), { conversion: { ...DEFAULT_PARTY_CONVERSION, hpScale: NaN } }).ready).toBe(false);
    const replay = prepareCurrentParty(host(actor({ 当前生命值: 0, 临时生命值: 3 })), { mode: 'replay' });
    expect(replay.ready).toBe(true); expect(replay.party[0]!.initialHp).toBe(replay.party[0]!.stats.hp);
  });
  it('executes the default weapon with the real runtime registry instead of merely accepting its ID', () => {
    const request = battle(prepareCurrentParty(host()).party); const setup = prepareStBattle(request);
    const rng = new SeededRNG(request.seed); let next = 10000; const id = () => next++;
    const { playerTeam, enemyTeam, idMap } = mapRequestToTeams(request);
    const state = createGameState(new BoardGenerator(rng, id).generate(), playerTeam, enemyTeam);
    const engine = new TurnEngine(state, rng, id, setup.registry, setup.configureEngine);
    const session = new BattleSession({ request, engine, idMap });
    state.teams[PlayerSide.Left].characters[0]!.mana = 3;
    const events = session.resolve({ type: 'cast', characterId: 0 });
    expect(events.some(event => event.type === 'skill-damage')).toBe(true);
    expect(state.teams[PlayerSide.Right].characters[0]!.hp).toBeLessThan(999);
  });
});


describe('party ability catalogue display', () => {
  it('describes actual compiled mechanics and keeps one choice per mechanical identity', () => {
    const groups = new Map<string, typeof troopModule.TROOPS>();
    for (const troop of troopModule.TROOPS) {
      const id = abilityIdentity(adaptedPrototype(troop.spell.id), troop.manaColors, troop.manaCost);
      groups.set(id, [...(groups.get(id) ?? []), troop]);
    }
    const choices = partyAbilityChoices();
    expect(choices).toHaveLength(groups.size);
    expect(new Set(choices.map(choice => choice.abilityId)).size).toBe(choices.length);
    for (const choice of choices) {
      const source = groups.get(choice.abilityId)![0]!;
      expect(choice.sourceSpellId).toBe(source.spell.id);
      const described = adaptedAbilityDescription(source.spell.id);
      expect(choice.name).toBe(described.name);
      expect(choice.description).toBe(described.description);
    }
  });
  it('collapses the same mechanical ability from multiple troop sources', async () => {
    const first = troopModule.TROOPS[0]!;
    const duplicate = { ...first, id: first.id + 100000, spell: { ...first.spell, name: 'Duplicate display name' } };
    vi.resetModules();
    vi.doMock('../../src/data/troops', () => ({ ...troopModule, TROOPS: [...troopModule.TROOPS, duplicate] }));
    try {
      const { partyAbilityChoices: isolatedChoices } = await import('../../src/sillytavern/partyPreparation');
      const choices = isolatedChoices();
      expect(choices).toHaveLength(partyAbilityChoices().length);
      expect(choices.filter(choice => choice.sourceSpellId === first.spell.id)).toHaveLength(1);
      expect(choices[0]).toMatchObject({
        abilityId: abilityIdentity(adaptedPrototype(first.spell.id), first.manaColors, first.manaCost),
        sourceSpellId: first.spell.id,
        name: adaptedAbilityDescription(first.spell.id).name,
      });
    } finally {
      vi.doUnmock('../../src/data/troops'); vi.resetModules();
    }
  });
  it('keeps the compiled mechanical description when source narrative names and descriptions change', async () => {
    const first = troopModule.TROOPS[0]!;
    vi.resetModules();
    vi.doMock('../../src/data/troops', () => ({ ...troopModule, TROOPS: troopModule.TROOPS.map(t => t.id === first.id ? { ...first, spell: { ...first.spell, name: '   ', description: '这个原始故事文本不应进入玩家技能说明' } } : t) }));
    try {
      const { partyAbilityChoices: isolatedChoices } = await import('../../src/sillytavern/partyPreparation');
      expect(isolatedChoices()).toHaveLength(partyAbilityChoices().length);
      const described = adaptedAbilityDescription(first.spell.id);
      expect(isolatedChoices()[0]!.name).toBe(described.name);
      expect(isolatedChoices()[0]!.description).toBe(described.description);
      expect(isolatedChoices()[0]!.description).not.toContain('原始故事文本');
    } finally {
      vi.doUnmock('../../src/data/troops'); vi.resetModules();
    }
  });
});


describe('party economy availability before battle launch', () => {
  it('allows a real economic ability and preserves learned progress and equipment', () => {
    const choice = partyAbilityChoices().find(row => row.skillId === 'st:7037')!;
    expect(choice).toBeDefined(); expect(choice.availabilityIssues ?? []).toEqual([]);
    const input = host(actor(), { 甲: companion() }); const ref = companionMemberRef('甲');
    const save = { id: 'save', chat: input.chat, learnedAbilityIds: [choice.abilityId], equippedAbilities: { [ref]: choice.abilityId } };
    const before = JSON.stringify({ input, save });
    const result = prepareCurrentParty(input, { ...optionsFor(['甲']), save });
    expect(result.ready).toBe(true); expect(result.party.some(member=>member.skillId===choice.skillId)).toBe(true);
    expect(result.issues).toEqual([]);
    expect(JSON.stringify({ input, save })).toBe(before);
    expect(partyAbilityChoices().find(row => row.abilityId === choice.abilityId)).toBeDefined();
  });
  it('allows registering a native economic weapon and leaves narrative equipment intact', () => {
    const input = host(actor({ 装备列表: { 主手: weapon() } }));
    const ref = equipmentRef(HERO_MEMBER_REF, '主手'); const before = structuredClone(input);
    const result = prepareCurrentParty(input, { weaponBindings: { [ref]: 'gw_SkeletonKey' } });
    expect(result.ready).toBe(true);
    expect(result.party[0]!.skillId).toBe('gw_SkeletonKey');
    expect(result.issues).toEqual([]);
    expect(input).toEqual(before);
  });
});
