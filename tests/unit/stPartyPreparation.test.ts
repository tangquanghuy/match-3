import { describe, expect, it, vi } from 'vitest';
import * as troopModule from '../../src/data/troops';
import { abilityIdentity, adaptedPrototype, adaptedAbilityDescription, learningAbilityId, skillNameForTroop } from '../../src/sillytavern/enemyBlueprint';
import {
  prepareCurrentParty, HERO_MEMBER_REF, companionMemberRef, equipmentRef,
  partyAbilityChoices, partyBaseStats, DEFAULT_PARTY_CONVERSION,
  companionDefaultColors, companionColorCount, companionRarity, companionStarterAbility,
  missingCompanionColors, findPartyAbility,
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
      manaColors: ['Blue'], manaCost: 3, skillId: 'gw_KnightsSword', stats: { hp: 23, armor: 9, attack: 15, magic: 9 }, initialHp: 12 });
    expect(result.candidates[0]!.weapon).toMatchObject({ id: 'gw_KnightsSword', sourceId: 1000, spellId: 7066, isDefault: true });
    expect(hero).not.toHaveProperty('troopTypes'); expect(hero).not.toHaveProperty('templateId');
    expect(result.conversion.status).toBe('uncalibrated'); expect(input).toEqual(before);
    hero.stats.hp = 2; expect(prepareCurrentParty(input).party[0]!.stats.hp).toBe(23);
  });
  it('follows the level curve and lets capped attributes and AC nudge it by -5% to +10%', () => {
    const neutral = { 力量: 10, 敏捷: 10, 体质: 10, 智力: 10, 感知: 10, 魅力: 10 };
    for (const level of [1, 5, 20, 50, 95]) {
      const stats = prepareCurrentParty(host(actor({ 等级: level, 属性: neutral, AC: 10 }))).party[0]!.stats;
      expect(stats).toEqual(partyBaseStats(level));
    }
    expect(partyBaseStats(50).hp).toBeGreaterThan(partyBaseStats(20).hp);
    const max = { 力量: 30, 敏捷: 30, 体质: 30, 智力: 30, 感知: 30, 魅力: 30 };
    const capped = prepareCurrentParty(host(actor({ 属性: max, AC: 30 }))).party[0]!;
    const above = prepareCurrentParty(host(actor({ 属性: Object.fromEntries(Object.keys(max).map(key => [key, 99])), AC: 99 }))).party[0]!;
    expect(above.stats).toEqual(capped.stats);
    const base = partyBaseStats(20);
    expect(capped.stats).toEqual({ hp: Math.round(base.hp * 1.1), attack: Math.round(base.attack * 1.1), armor: Math.round(base.armor * 1.1), magic: Math.round(base.magic * 1.1) });
    const low = prepareCurrentParty(host(actor({ 属性: { 力量: 1, 敏捷: 1, 体质: 1, 智力: 1, 感知: 1, 魅力: 1 }, AC: 0 }))).party[0]!;
    expect(low.stats).toEqual({ hp: Math.round(base.hp * .95), attack: Math.round(base.attack * .95), armor: Math.round(base.armor * .95), magic: Math.round(base.magic * .95) });
    // A level 1 gap moves the numbers more than the whole attribute range at high levels.
    expect(prepareCurrentParty(host(actor({ 等级: 1, 属性: max, AC: 30 }))).party[0]!.stats.hp).toBeLessThan(low.stats.hp);
    expect(prepareCurrentParty(host(actor(), {}, 'typo')).ready).toBe(false);
  });
  it('derives fixed colors (name hash × rarity) and a starter ability without writing or asking', () => {
    const input = host(actor(), { '阿/青~': companion({ 三消: undefined }) }); const before = structuredClone(input);
    const ref = companionMemberRef('阿/青~'); expect(ref).toBe('/羁绊列表/阿~1青~0');
    const result = prepareCurrentParty(input, { memberRefs: [ref, HERO_MEMBER_REF] });
    expect(result.ready).toBe(true);
    const unit = result.party[0]!;
    expect(unit.manaColors).toEqual(companionDefaultColors('阿/青~', '普通')); expect(unit.manaColors).toHaveLength(1);
    expect(unit.skillId).toBe(companionStarterAbility('阿/青~').skillId);
    expect(result.initializationChoices.some(choice => choice.kind === 'colors' || choice.kind === 'baseAbility')).toBe(false);
    expect(prepareCurrentParty(input, { memberRefs: [ref, HERO_MEMBER_REF] }).party).toEqual(result.party);
    expect(missingCompanionColors(input)).toEqual([{ name: '阿/青~', colors: unit.manaColors }]);
    expect(input).toEqual(before);
  });
  it('uses rarity for the color count and the name hash for the combination', () => {
    expect(companionColorCount('普通')).toBe(1); expect(companionColorCount('精良')).toBe(1);
    expect(['稀有', '卓越', '传说', '史诗'].map(companionColorCount)).toEqual([2, 2, 2, 2]);
    expect(companionColorCount('神话')).toBe(3);
    expect(companionDefaultColors('甲', '神话')).toEqual(companionDefaultColors('甲', '神话'));
    expect(new Set(['甲', '乙', '丙', '丁', '戊', '己', '庚', '辛'].map(name => companionDefaultColors(name, '稀有').join())).size).toBeGreaterThan(1);
    const ally = companion({ 三消: undefined, 装备列表: { armor: weapon({ 类型: '防具', 部位: '上衣', 品质: '史诗' }) } });
    expect(companionRarity(ally, [{ ref: 'r', key: 'armor', name: 'a', type: '防具', slot: '上衣', data: { 品质: '史诗' } }])).toBe('史诗');
    expect(companionRarity({ 三消: { 稀有度: '神话' } }, [])).toBe('神话');
    const stored = host(actor(), { 甲: companion() });
    expect(missingCompanionColors(stored)).toEqual([]);
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
  it.each([['Red', 'Red'], [], ['pink'], ['Red', 'Blue', 'Green', 'Yellow'], 'Blue'].map(value => ({ value })))(
    'rejects malformed stored colors $value', ({ value }) => {
      const result = prepareCurrentParty(host(actor(), { 甲: companion({ 三消: { 颜色: value } }) }), optionsFor(['甲']));
      expect(result.ready).toBe(false); expect(result.issues.some(issue => issue.code === 'colors')).toBe(true);
    });
  it('resolves current weapon bindings by equipment pointer, never by narrative names or boxed items', () => {
    const ref = equipmentRef(HERO_MEMBER_REF, 'sword/1');
    const input = host(actor({ 装备列表: { 'sword/1': weapon(), boxed: weapon({ 装备箱: true }) } }));
    // An unbound main hand fights with the starter weapon; binding stays available.
    const unbound = prepareCurrentParty(input);
    expect(unbound.ready).toBe(true); expect(unbound.candidates[0]!.weapon).toMatchObject({ id: 'gw_KnightsSword', isDefault: true });
    expect(unbound.candidates[0]!.weapon).not.toHaveProperty('equipmentRef');
    expect(unbound.initializationChoices.some(choice => choice.kind === 'weaponBinding' && choice.path === ref)).toBe(true);
    const result = prepareCurrentParty(input, { weaponBindings: { [ref]: 'gw_KnightsSword' } });
    expect(result.ready).toBe(true); expect(result.candidates[0]!.equipment).toHaveLength(1);
    expect(result.candidates[0]!.weapon).toMatchObject({ isDefault: false, equipmentRef: ref });
    expect(prepareCurrentParty(input, { weaponBindings: { [ref]: 'invented' } }).ready).toBe(false);
    expect(prepareCurrentParty(host(actor({ 装备列表: { stored: weapon({ 装备箱: true }) } }))).party[0]!.skillId).toBe('gw_KnightsSword');
  });
  it('supports legacy wear-state, needs no computed weapon panel and reports ambiguity', () => {
    const legacy = weapon({ 穿戴状态: '已装备' }); delete legacy['装备箱'];
    const input = host(actor({ 装备列表: { legacy }, 战斗属性: {} }));
    const fallback = prepareCurrentParty(input);
    expect(fallback.ready).toBe(true); expect(fallback.candidates[0]!.equipment).toHaveLength(1);
    expect(prepareCurrentParty(host(actor({ 装备列表: { a: weapon(), b: weapon() } }))).issues.some(issue => issue.code === 'weapon-ambiguous')).toBe(true);
    expect(prepareCurrentParty(host(actor({ 装备列表: { a: weapon({ 装备箱: 'false' }) } }))).ready).toBe(false);
  });
  it('ignores AIRP weapon panels, damage reductions, equipment bonuses and AIRP max HP for stats', () => {
    const plain = prepareCurrentParty(host()).party[0]!.stats;
    const input = host(actor({ 生命值上限: 900, 当前生命值: 450, 战斗属性: { 武器面板: { 伤害骰: '10d12', 等级系数: 9, 固定伤害: 300 }, 物理减伤: 90, 魔法减伤: 90 },
      装备列表: { armor: weapon({ 类型: '防具', 部位: '上衣', 品质: '普通', 属性加成: { 力量: 100, 生命值上限: 999 }, 防御力: 500 }) } }));
    input.statData['武器面板'] = { 伤害骰: '1d6', 等级系数: 1, 固定伤害: 3 };
    const result = prepareCurrentParty(input);
    expect(result.ready).toBe(true); expect(result.party[0]!.stats).toEqual(plain);
    expect(result.party[0]!.initialHp).toBe(Math.round(plain.hp / 2));
    expect(prepareCurrentParty(host(actor(), {}, 'new')).party[0]!.stats).toEqual(plain);
  });
  it('equips a learned ability regardless of color and still resolves legacy color-bound v1 IDs', () => {
    const input = host(actor(), { 甲: companion() }); const ref = companionMemberRef('甲');
    const troop = troopModule.TROOPS.find(t => t.manaColors.every(color => !['Purple', 'Green'].includes(color)) && findPartyAbility(learningAbilityId(adaptedPrototype(t.spell.id), t.manaCost)) && !findPartyAbility(learningAbilityId(adaptedPrototype(t.spell.id), t.manaCost))!.availabilityIssues)!;
    const current = learningAbilityId(adaptedPrototype(troop.spell.id), troop.manaCost);
    const legacy = abilityIdentity(adaptedPrototype(troop.spell.id), troop.manaColors, troop.manaCost);
    for (const id of [current, legacy]) {
      const save = { id: 'save', chat: input.chat, learnedAbilityIds: [id], equippedAbilities: { [ref]: id } };
      const party = prepareCurrentParty(input, { memberRefs: [HERO_MEMBER_REF, ref], save }).party;
      expect(party[1]).toMatchObject({ skillId: `st:${troop.spell.id}`, manaColors: ['Purple', 'Green'] });
    }
    expect(findPartyAbility(legacy)!.abilityId).toBe(current);
  });
  it('maps learned IDs using save ownership and preserves companion colors', () => {
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
  it('derives bond-schema AC from highest worn armour quality and applies it as a small armour factor', () => {
    const ally = companion({ 装备列表: { armor: weapon({ 类型: '防具', 部位: '上衣', 品质: '神话' }) } }); delete ally['AC'];
    const result = prepareCurrentParty(host(actor(), { 甲: ally }), optionsFor(['甲']));
    expect(result.ready).toBe(true); expect(result.candidates[1]!.source?.ac).toBe(17);
    expect(result.party[1]!.stats.armor).toBe(Math.round(partyBaseStats(20).armor * 1.035));
  });
  it.each([NaN, Infinity, -1, '20', 1.5])('rejects malformed level %j', value => {
    expect(prepareCurrentParty(host(actor({ 等级: value }))).ready).toBe(false);
  });
  it('blocks zero/overflow/temporary health and out-of-range stats without clipping', () => {
    expect(prepareCurrentParty(host(actor({ 当前生命值: 0 }))).ready).toBe(false);
    expect(prepareCurrentParty(host(actor({ 当前生命值: 201 }))).ready).toBe(false);
    expect(prepareCurrentParty(host(actor({ 临时生命值: 3 }))).issues.some(issue => issue.code === 'temporary-hp')).toBe(true);
    // AIRP HP only gives the ratio; a living character never rounds down to zero.
    const tiny = prepareCurrentParty(host(actor({ 生命值上限: 99999 })));
    expect(tiny.ready).toBe(true); expect(tiny.party[0]!.initialHp).toBe(1);
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
      const id = learningAbilityId(adaptedPrototype(troop.spell.id), troop.manaCost);
      groups.set(id, [...(groups.get(id) ?? []), troop]);
    }
    const choices = partyAbilityChoices();
    expect(choices).toHaveLength(groups.size);
    expect(new Set(choices.map(choice => choice.abilityId)).size).toBe(choices.length);
    for (const choice of choices) {
      const source = groups.get(choice.abilityId)![0]!;
      expect(choice.sourceSpellId).toBe(source.spell.id);
      const described = adaptedAbilityDescription(source.spell.id);
      // Player-facing name: original game name, one per mechanics (abilityNames.ts).
      expect(choice.name).toBe(skillNameForTroop(source.id));
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
        abilityId: learningAbilityId(adaptedPrototype(first.spell.id), first.manaCost),
        sourceSpellId: first.spell.id,
        // Same mechanics under another original name share the first source's name.
        name: first.spell.name.trim(),
      });
    } finally {
      vi.doUnmock('../../src/data/troops'); vi.resetModules();
    }
  });
  it('keeps the compiled mechanical description when source descriptions change, and labels a nameless source by its mechanics', async () => {
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
    // 骷髅钥匙 is a paid rarity: this floor has bought it.
    input.statData['三消已购武器'] = ['gw_SkeletonKey'];
    const ref = equipmentRef(HERO_MEMBER_REF, '主手'); const before = structuredClone(input);
    const result = prepareCurrentParty(input, { weaponBindings: { [ref]: 'gw_SkeletonKey' } });
    expect(result.ready).toBe(true);
    expect(result.party[0]!.skillId).toBe('gw_SkeletonKey');
    expect(result.issues).toEqual([]);
    expect(input).toEqual(before);
  });
});
