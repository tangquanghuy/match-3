import { describe, expect, it } from 'vitest';
import { CombatResolver } from '@engine/CombatResolver';
import { ManaDistributor } from '@engine/ManaDistributor';
import { attachPassives, applyTurnStartPassives, applyCastTriggers, registerDynamicTraits, applyColorMatchTriggers } from '@engine/traits';
import { damageOne } from '@engine/skills/effects/damage';
import { applyStatus } from '@engine/skills/effects/status';
import { BaseColor, PlayerSide, type Character, type Team } from '@engine/types';

function character(id: number, traitIds: string[] = [], extra: Partial<Character> = {}): Character {
  const char: Character = { id, name: `C${id}`, hp: 50, maxHp: 50, armor: 10, attack: 20, magic: 5,
    mana: 0, manaCost: 10, colors: [BaseColor.Blue], skillId: 'none', statuses: [], defeated: false, traitIds, ...extra };
  attachPassives(char);
  return char;
}
function duel(target: Character, attacker = character(0), roll = 1) {
  const team = (player: PlayerSide, ch: Character): Team => ({ player, characters: [ch] });
  return new CombatResolver().resolveSkullDamage(team(PlayerSide.Left, attacker), team(PlayerSide.Right, target), 3, { next: () => roll }).events;
}
const cue = (characterId: number, traitId: string, name: string) => ({ characterId, traitId, name });

describe('trait activation provenance', () => {
  it('armored is attached to the actual reduced hit on the holder', () => {
    const target = character(4, ['armored']);
    expect(duel(target)[0]).toMatchObject({ type: 'skull-damage', damage: 15,
      traitActivations: [cue(4, 'armored', '全副武装')] });
    expect(target.hp).toBe(45);
  });
  it('only credits the strongest max-stacking defense', () => {
    expect(duel(character(4, ['armored', 'stoneskin']))[0].traitActivations)
      .toEqual([cue(4, 'stoneskin', '铁壁铜墙')]);
  });
  it.each(['stun', 'barrier'])('%s does not falsely show armored', status => {
    const events = duel(character(4, ['armored'], { statuses: [{ id: status, turns: 2 }] }));
    expect(events.flatMap(event => event.traitActivations ?? [])).toEqual([]);
  });
  it('enrage bypasses armor and does not announce the bypassed trait', () => {
    const events = duel(character(4, ['armored']), character(0, [], { statuses: [{ id: 'enraged', turns: 2 }] }));
    expect(events[0].traitActivations ?? []).toEqual([]);
  });
  it('rounding with no actual damage saved produces no cue', () => {
    expect(duel(character(4, ['armored']), character(0, [], { attack: 1 }))[0].traitActivations ?? []).toEqual([]);
  });
  it('dodge only announces on a successful roll, never also armored', () => {
    const events = duel(character(4, ['agile', 'armored']), character(0), 0);
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ type: 'attack-struggle', reason: 'dodge', traitActivations: [cue(4, 'agile', '敏捷')] });
    expect(duel(character(4, ['agile']))[0].traitActivations ?? []).toEqual([]);
  });
  it('spell defense is captured on hit but not when barrier absorbs the spell', () => {
    expect(damageOne(character(4, ['spellarmor']), 0, 20, false, 'single')[0]).toMatchObject({
      type: 'skill-damage', damage: 15, traitActivations: [cue(4, 'spellarmor', '法术铠甲')] });
    expect(damageOne(character(4, ['spellarmor'], { statuses: [{ id: 'barrier', turns: 1 }] }), 0, 20, false, 'single')
      .flatMap(event => event.traitActivations ?? [])).toEqual([]);
  });
  it('reflection announces on the reflecting holder rather than the victim', () => {
    registerDynamicTraits([{ code: 'cue-reflect', name: '反击护甲', description: '', reflectSkullRatio: .5 }]);
    const reflected = duel(character(4, ['cue-reflect'])).find(event => event.type === 'skull-damage' && event.reflected);
    expect(reflected).toMatchObject({ targetId: 0, traitActivations: [cue(4, 'cue-reflect', '反击护甲')] });
  });
  it('immunity announces the responsible trait, not ordinary status blocking', () => {
    expect(applyStatus(character(4, ['fireproof']), { id: 'burning', turns: 2 })[0]).toMatchObject({
      type: 'status-blocked', traitActivations: [cue(4, 'fireproof', '防火')] });
  });
  it('regeneration only announces actual healing', () => {
    expect(applyTurnStartPassives([character(0, ['regeneration'])])).toEqual([]);
    expect(applyTurnStartPassives([character(0, ['regeneration'], { hp: 45 })])[0].traitActivations)
      .toEqual([cue(0, 'regeneration', '再生')]);
  });
  it('cast and color gains include their source rather than all equipped traits', () => {
    registerDynamicTraits([{ code: 'cue-blue', name: '蓝色力量', description: '', onColorMatchGain: { color: 'Blue', stat: 'attack', amount: 2 } }]);
    const ch = character(0, ['arcane', 'armored', 'cue-blue']);
    expect(applyCastTriggers([ch], [])[0].traitActivations?.map(c => c.traitId)).toEqual(['arcane']);
    expect(applyColorMatchTriggers([ch], BaseColor.Blue)[0].traitActivations?.map(c => c.traitId)).toEqual(['cue-blue']);
    expect(applyColorMatchTriggers([ch], BaseColor.Red)).toEqual([]);
  });
  it('mana links announce only when bonus mana actually fits', () => {
    const distribute = (ch: Character) => new ManaDistributor().distribute(
      { player: PlayerSide.Left, characters: [ch] }, PlayerSide.Left, BaseColor.Blue, 3);
    expect(distribute(character(0, ['waterlink']))[0].traitActivations?.map(c => c.traitId)).toEqual(['waterlink']);
    expect(distribute(character(0, ['waterlink'], { mana: 9 }))[0].traitActivations).toBeUndefined();
  });
  it('names are captured from character overrides, even for later transformations', () => {
    const ch = character(4, ['armored'], { traitNames: { armored: '定制护甲' } });
    const event = duel(ch)[0];
    ch.traitNames!.armored = '另一个名字';
    expect(event.traitActivations?.[0].name).toBe('定制护甲');
  });
});
