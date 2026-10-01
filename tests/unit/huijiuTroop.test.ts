import type { GameEvent } from '@engine/events';
import { describe, expect, it, vi } from 'vitest';
import { BaseColor, PlayerSide, colorGem, skullGem, type GemType } from '@engine/types';
import { SeededRNG } from '@engine/rng';
import { CombatResolver } from '@engine/CombatResolver';
import { TurnEngine } from '@engine/TurnEngine';
import { ExtensionRegistry } from '@engine/registry';
import { applyBigMatchTriggers, applySelfDeathManaGift, getTrait, resolvePassives } from '@engine/traits';
import { executePrototype } from '@engine/skills/prototypes';
import { SKILL_LIBRARY, registerSkillLibrary } from '@engine/skills/library';
import { createSpecialGems2, dmg, sacrifice, skill } from '@engine/skills/builders';
import { applyStatus } from '@engine/skills/effects/status';
import { damageFixture, damageCharacter } from '../helpers/damageFixture';
import { HUIJIU_ID, HUIJIU_SPELL_ID, COMMUNITY_KINGDOM, COMMUNITY_RACE } from '../../src/data/communityTroops';
import { TROOPS, getTroopById, getTroopByRef, troopToSummonTemplate } from '../../src/data/troops';
import { HUIJIU_SPELL_NAME, isCoupletSpell, spellTitleText } from '../../src/data/spellPresentation';
import { kingdomTroopPool } from '../../src/meta/data/kingdoms';
import { troopArt } from '../../src/meta/screens/teamScreen';
import { newSave } from '../../src/meta/state/schema';
import { grantTroop, getRecord } from '../../src/meta/systems/troopProgress';
import { metaKnownTraitIds, troopToSnapshot } from '../../src/meta/systems/battleBridge';

const ids = ['huijiu_listen_rain', 'huijiu_refill_cup', 'huijiu_farewell'];
function fixture(unlocked = true, seed = 42) {
  const f = damageFixture();
  Object.assign(f.caster, { name: '灰鸠', troopTypes: [COMMUNITY_RACE], colors: [BaseColor.Blue, BaseColor.Purple],
    manaCost: 16, mana: 16, skillId: String(HUIJIU_SPELL_ID), traitIds: unlocked ? ids : [], passive: resolvePassives(unlocked ? ids : []) });
  f.ctx.rng = new SeededRNG(seed);
  return f;
}
function stableBoard(f: ReturnType<typeof fixture>) {
  const colors = [BaseColor.Red, BaseColor.Green, BaseColor.Purple, BaseColor.Brown, BaseColor.Yellow];
  for (let row = 0; row < 8; row++) for (let col = 0; col < 8; col++) {
    f.board.set({ row, col }, { id: row * 8 + col + 1, type: colorGem(colors[(row * 2 + col) % colors.length]) });
  }
}
function engineFor(f: ReturnType<typeof fixture>, registry = new ExtensionRegistry()) {
  registerSkillLibrary(registry.prototypes);
  const engine = new TurnEngine(f.state, f.ctx.rng, f.ctx.nextGemId, registry);
  engine.skullChance = 0;
  return engine;
}
function placements(events: GameEvent[]) {
  return events.flatMap(e => e.type === 'gem-transform' ? e.changes.map(c => ({ pos: c.pos, type: c.to }))
    : e.type === 'gem-create' ? e.spawns.map(s => ({ pos: s.pos, type: s.gemType })) : []);
}
function gemKind(type: GemType): string { return type.kind === 'special' ? type.spec.kind : type.kind; }
function gifts(events: GameEvent[]) {
  return events.filter(e => e.type === 'buff' && e.stat === 'mana' && e.source === 'trait');
}

describe('灰鸠 integration', () => {
  it('registers UltraRare, blue/purple 16 mana, portrait, kingdom, collection and three traits', () => {
    const t = getTroopById(HUIJIU_ID)!;
    expect(getTroopByRef('Huijiu')).toBe(t);
    expect(TROOPS.filter(t => t.id === HUIJIU_ID)).toHaveLength(1);
    expect(TROOPS.filter(t => t.spell.id === HUIJIU_SPELL_ID)).toHaveLength(1);
    expect(t).toMatchObject({ name: '灰鸠', rarity: 'UltraRare', rarityIdx: 3, kingdom: COMMUNITY_KINGDOM,
      troopTypes: [COMMUNITY_RACE], manaColors: [BaseColor.Blue, BaseColor.Purple], manaCost: 16,
      spell: { id: HUIJIU_SPELL_ID, name: HUIJIU_SPELL_NAME } });
    expect(t.spell.description).toContain('[1:1]');
    expect(t.traits.map(t => t.code)).toEqual(ids);
    expect(t.artUrl).toContain('huijiu.webp'); expect(troopArt(t)).toBe(t.artUrl);
    expect(kingdomTroopPool(COMMUNITY_KINGDOM)).toContain(t);
    expect(troopToSummonTemplate('Huijiu')).toMatchObject({ name: '灰鸠', skillId: String(HUIJIU_SPELL_ID) });
    ids.forEach(id => { expect(getTrait(id)).toBeDefined(); expect(metaKnownTraitIds()).toContain(id); });
    const save = newSave({ now: 0, starterTroopIds: [] }); grantTroop(save, HUIJIU_ID);
    const record = getRecord(save, HUIJIU_ID)!;
    expect(troopToSnapshot(t, record, '灰鸠').traitIds).toEqual([]);
    record.traits = [true, true, true];
    expect(troopToSnapshot(t, record, '灰鸠')).toMatchObject({ traitIds: ids, portraitUrl: t.artUrl });
  });
  it('keeps the canonical name intact and splits only this spell after its comma', () => {
    expect(spellTitleText(HUIJIU_SPELL_NAME)).toBe('一霎惊澜雨逢客，\n半生冷月剑辞乡');
    expect(isCoupletSpell(HUIJIU_SPELL_NAME)).toBe(true);
    expect(spellTitleText('秋庭扫叶')).toBe('秋庭扫叶'); expect(isCoupletSpell('秋庭扫叶')).toBe(false);
    expect(spellTitleText(HUIJIU_SPELL_NAME).replace('\n', '')).toBe(getTroopById(HUIJIU_ID)!.spell.name);
  });
});

describe('灰鸠 guaranteed mixed stars', () => {
  it('snapshots base 2 + living otherworld allies (including self) + blue gems at 1:1', () => {
    const f = fixture(); stableBoard(f);
    for (let col = 0; col < 5; col++) f.board.set({ row: 0, col }, { id: col + 1, type: colorGem(BaseColor.Blue) });
    f.state.teams[PlayerSide.Left].characters.push(damageCharacter(1, { troopTypes: [COMMUNITY_RACE] }),
      damageCharacter(2, { troopTypes: ['Human'] }), damageCharacter(3, { troopTypes: [COMMUNITY_RACE], defeated: true, hp: 0 }));
    const resolve = vi.fn(); f.ctx.resolveBoardChange = resolve;
    const events = executePrototype(SKILL_LIBRARY[HUIJIU_SPELL_ID], f.ctx);
    const made = placements(events);
    expect(made).toHaveLength(9); expect(new Set(made.map(p => `${p.pos.row},${p.pos.col}`)).size).toBe(9);
    expect(made.some(p => gemKind(p.type) === 'elementalStar')).toBe(true);
    expect(made.some(p => gemKind(p.type) === 'umbralStar')).toBe(true);
    expect(resolve).toHaveBeenCalledTimes(1);
    expect(events.some(e => e.type === 'extra-turn')).toBe(false);
  });
  it.each(Array.from({ length: 20 }, (_, i) => i + 1))('guarantees one of each at base 2, independent of magic, seed %i', seed => {
    const f = fixture(false, seed); stableBoard(f); f.caster.troopTypes = []; f.caster.magic = seed * 100;
    const made = placements(executePrototype(SKILL_LIBRARY[HUIJIU_SPELL_ID], f.ctx));
    expect(made.map(p => gemKind(p.type)).sort()).toEqual(['elementalStar', 'umbralStar']);
  });
  it.each([0, 1, 2, 64])('places into %i empty cells without overwriting its own placements', empty => {
    const f = fixture(); stableBoard(f);
    for (let i = 0; i < empty; i++) f.board.set({ row: Math.floor(i / 8), col: i % 8 }, null);
    const events = executePrototype(SKILL_LIBRARY[HUIJIU_SPELL_ID], f.ctx);
    const made = placements(events); expect(made).toHaveLength(3);
    expect(new Set(made.map(p => `${p.pos.row},${p.pos.col}`)).size).toBe(3);
    expect(made.some(p => gemKind(p.type) === 'elementalStar')).toBe(true);
    expect(made.some(p => gemKind(p.type) === 'umbralStar')).toBe(true);
    expect(events.filter(e => e.type === 'gem-create').flatMap(e => e.spawns)).toHaveLength(Math.min(empty, 3));
  });
  it('caps at board capacity even on a fully blue board; both stars remain represented', () => {
    const f = fixture(); f.board.forEach((g, p) => { if (g) f.board.set(p, { id: g.id, type: colorGem(BaseColor.Blue) }); });
    const made = placements(executePrototype(SKILL_LIBRARY[HUIJIU_SPELL_ID], f.ctx));
    expect(made).toHaveLength(64); expect(new Set(made.map(p => `${p.pos.row},${p.pos.col}`)).size).toBe(64);
    expect(made.some(p => gemKind(p.type) === 'elementalStar')).toBe(true);
    expect(made.some(p => gemKind(p.type) === 'umbralStar')).toBe(true);
  });
  it('keeps guaranteed creation opt-in for existing mix-special skills', () => {
    const legacy = createSpecialGems2([{ kind: 'elementalStar' }, { kind: 'umbralStar' }], 2, 0);
    expect(JSON.stringify(legacy)).not.toContain('minimumEach');
  });
  it('casts through TurnEngine and spends mana before resolving stars', () => {
    const f = fixture(false); stableBoard(f); const engine = engineFor(f);
    const events = engine.castSkill(0);
    expect(events.filter(e => e.type === 'skill-cast')).toHaveLength(1);
    expect(placements(events).filter(p => ['elementalStar', 'umbralStar'].includes(gemKind(p.type)))).toHaveLength(3);
    expect(f.state.actionLog).toHaveLength(1);
  });
  it('15 mana does not cast', () => {
    const f = fixture(); stableBoard(f); const engine = engineFor(f); f.caster.mana = 15;
    expect(engine.castSkill(0).some(e => e.type === 'skill-cast')).toBe(false); expect(f.caster.mana).toBe(15);
  });
});

describe('听雨 / 续盏', () => {
  it.each([3, 4])('real %i-match only invokes 续盏 for four or more', size => {
    const f = fixture(); stableBoard(f); const engine = engineFor(f);
    // Set up a vertical swap yielding exactly size reds in the bottom row.
    for (let col = 0; col < size; col++) f.board.set({ row: 7, col }, { id: 200 + col, type: colorGem(col === 1 ? BaseColor.Green : BaseColor.Red) });
    f.board.set({ row: 7, col: size }, { id: 210, type: colorGem(BaseColor.Purple) });
    f.board.set({ row: 6, col: 1 }, { id: 211, type: colorGem(BaseColor.Red) });
    const events = engine.resolveSwap({ row: 7, col: 1 }, { row: 6, col: 1 });
    const count = events.filter(e => e.type === 'elimination' && e.cells.length >= 4).length;
    expect(count).toBe(size === 4 ? 1 : 0);
    expect(f.caster.hp).toBe(1000 + count);
  });

  it.each(['normal', 'locked', 'stunned', 'barrier', 'immune'] as const)('skull retaliation: %s', mode => {
    const f = fixture(mode !== 'locked');
    if (mode === 'stunned') applyStatus(f.caster, { id: 'stun', turns: 3 });
    if (mode === 'barrier') applyStatus(f.caster, { id: 'barrier', turns: 3 });
    if (mode === 'immune') { f.enemies[0].traitIds = ['alert']; f.enemies[0].passive = resolvePassives(['alert']); }
    new CombatResolver().resolveSkullDamage(f.state.teams[PlayerSide.Right], f.state.teams[PlayerSide.Left], 3, f.ctx.rng);
    expect(f.enemies[0].statuses.some(s => s.id === 'silence')).toBe(mode === 'normal');
    expect(f.enemies.slice(1).every(c => c.statuses.length === 0)).toBe(true);
  });
  it.each([4, 5, 6, 8])('a %i-match grants living allies one current AND maximum hp', size => {
    const f = fixture(); const ally = damageCharacter(1, { hp: 100, maxHp: 200 });
    const dead = damageCharacter(2, { hp: 0, defeated: true });
    f.state.teams[PlayerSide.Left].characters.push(ally, dead);
    const events = applyBigMatchTriggers(f.state.teams[PlayerSide.Left].characters, { size });
    expect(f.caster).toMatchObject({ hp: 1001, maxHp: 1001 }); expect(ally).toMatchObject({ hp: 101, maxHp: 201 });
    expect(dead.hp).toBe(0); expect(f.enemies.every(c => c.hp === 1000)).toBe(true); expect(events).toHaveLength(2);
  });
  it.each(['locked', 'stunned'] as const)('does not grant life while %s', mode => {
    const f = fixture(mode !== 'locked'); if (mode === 'stunned') applyStatus(f.caster, { id: 'stun', turns: 3 });
    expect(applyBigMatchTriggers([f.caster], { size: 4 })).toEqual([]);
  });
});

describe('辞旧 death mana gift', () => {
  it('turn-start burning death through passTurn invokes the same death pipeline', () => {
    const f = fixture(); stableBoard(f); const ally = damageCharacter(1, { mana: 0 });
    f.state.teams[PlayerSide.Left].characters.push(ally); f.state.activePlayer = PlayerSide.Right;
    const engine = engineFor(f); f.caster.hp = 1;
    applyStatus(f.caster, { id: 'burning', turns: 3 });
    const events = engine.passTurn();
    expect(f.caster.defeated).toBe(true); expect(ally.mana).toBe(16); expect(gifts(events)).toHaveLength(1);
    expect(gifts(engine.passTurn())).toHaveLength(0);
  });
  it('successful self-revival cancels the defeat and its mana gift', () => {
    const f = fixture(); stableBoard(f); f.caster.hp = 1;
    const ally = damageCharacter(1, { mana: 0 }); f.state.teams[PlayerSide.Left].characters.push(ally);
    f.state.activePlayer = PlayerSide.Right; f.enemies[0].skillId = 'test-kill';
    const registry = new ExtensionRegistry(); registry.prototypes.set('test-kill', skill(dmg('enemyFront', 10, 0)));
    const engine = engineFor(f, registry);
    f.caster.passive = { ...resolvePassives(ids), selfRevive: { healPct: 0.5 } };
    const events = engine.castSkill(10);
    expect(f.caster.defeated).toBe(false); expect(f.caster.hp).toBe(500); expect(ally.mana).toBe(0);
    expect(gifts(events)).toHaveLength(0); expect(events.some(e => e.type === 'defeat')).toBe(false);
  });
  it('another ally dying does not activate a living 灰鸠 farewell', () => {
    const f = fixture(); stableBoard(f); f.caster.mana = 0;
    const ally = damageCharacter(1, { hp: 1 }); f.state.teams[PlayerSide.Left].characters.unshift(ally);
    f.state.activePlayer = PlayerSide.Right; f.enemies[0].skillId = 'test-kill';
    const registry = new ExtensionRegistry(); registry.prototypes.set('test-kill', skill(dmg('enemyFront', 10, 0)));
    const engine = engineFor(f, registry); const events = engine.castSkill(10);
    expect(ally.defeated).toBe(true); expect(f.caster.mana).toBe(0); expect(gifts(events)).toHaveLength(0);
  });

  it('fills exactly one seeded random surviving ally; ignores self and corpses', () => {
    const f = fixture(); f.caster.hp = 0; f.caster.defeated = true;
    const a = damageCharacter(1, { mana: 2 }); const b = damageCharacter(2, { mana: 4 });
    const dead = damageCharacter(3, { hp: 0, defeated: true, mana: 0 });
    const rng = { nextInt: vi.fn(() => 1) };
    const events = applySelfDeathManaGift(f.caster, [f.caster, a, dead, b], rng);
    expect(a.mana).toBe(2); expect(b.mana).toBe(16); expect(dead.mana).toBe(0);
    expect(rng.nextInt).toHaveBeenCalledWith(2); expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ type: 'buff', source: 'trait', targetId: 2, stat: 'mana', amount: 12 });
  });
  it('full-mana allies remain eligible without rerolling', () => {
    const f = fixture(); f.caster.defeated = true; f.caster.hp = 0;
    const full = damageCharacter(1); const empty = damageCharacter(2, { mana: 0 });
    const rng = { nextInt: vi.fn(() => 0) };
    expect(applySelfDeathManaGift(f.caster, [full, empty], rng)).toEqual([]);
    expect(rng.nextInt).toHaveBeenCalledTimes(1); expect(empty.mana).toBe(0);
  });
  it.each(['alive', 'locked', 'stunned', 'no-survivor'] as const)('no gift or RNG consumption when %s', mode => {
    const f = fixture(mode !== 'locked');
    if (mode === 'stunned') applyStatus(f.caster, { id: 'stun', turns: 3 });
    f.caster.defeated = mode !== 'alive'; f.caster.hp = mode === 'alive' ? 100 : 0;
    const rng = { nextInt: vi.fn(() => 0) };
    expect(applySelfDeathManaGift(f.caster, mode === 'no-survivor' ? [] : [damageCharacter(1, { mana: 0 })], rng)).toEqual([]);
    expect(rng.nextInt).not.toHaveBeenCalled();
  });
  it.each([PlayerSide.Left, PlayerSide.Right])('real spell death fills ally once on side %s', side => {
    const f = fixture(); stableBoard(f);
    const dying = f.caster; dying.hp = 1; dying.mana = 0;
    const survivor = damageCharacter(1, { mana: 2 });
    f.state.teams[side].characters = [dying, survivor];
    const attackerSide = side === PlayerSide.Left ? PlayerSide.Right : PlayerSide.Left;
    const attacker = damageCharacter(10, { skillId: 'test-kill' });
    f.state.teams[attackerSide].characters = [attacker]; f.state.activePlayer = attackerSide;
    const registry = new ExtensionRegistry(); registry.prototypes.set('test-kill', skill(dmg('enemyFront', 10, 0)));
    const engine = engineFor(f, registry); const events = engine.castSkill(10);
    expect(dying.defeated).toBe(true); expect(survivor.mana).toBe(16);
    expect(events.filter(e => e.type === 'defeat' && e.characterId === dying.id)).toHaveLength(1);
    expect(gifts(events)).toHaveLength(1); expect(gifts(engine.passTurn())).toHaveLength(0);
    expect(attacker.statuses.some(s => s.id === 'silence')).toBe(false);
  });
  it('real sacrifice of 灰鸠 fills the surviving caster', () => {
    const f = fixture(); stableBoard(f); f.caster.mana = 0;
    const caster = damageCharacter(1, { skillId: 'test-sacrifice' });
    f.state.teams[PlayerSide.Left].characters.push(caster);
    const registry = new ExtensionRegistry(); registry.prototypes.set('test-sacrifice', skill(sacrifice('allyFront')));
    const engine = engineFor(f, registry); const events = engine.castSkill(1);
    expect(f.caster.defeated).toBe(true); expect(caster.mana).toBe(16); expect(gifts(events)).toHaveLength(1);
  });
  it('real skull death silences attacker and fills a surviving ally once', () => {
    const f = fixture(); stableBoard(f); f.caster.hp = 1; f.caster.mana = 0;
    const ally = damageCharacter(1, { mana: 0 }); f.state.teams[PlayerSide.Left].characters.push(ally);
    f.state.activePlayer = PlayerSide.Right;
    for (const pos of [{ row: 7, col: 0 }, { row: 7, col: 2 }, { row: 6, col: 1 }]) {
      f.board.set(pos, { id: 100 + pos.row * 8 + pos.col, type: skullGem() });
    }
    const engine = engineFor(f); const events = engine.resolveSwap({ row: 7, col: 1 }, { row: 6, col: 1 });
    expect(f.caster.defeated).toBe(true); expect(ally.mana).toBe(16); expect(gifts(events)).toHaveLength(1);
    expect(events.some(e => e.type === 'status-apply' && e.targetId === 10 && e.statusId === 'silence')).toBe(true);
  });
});
