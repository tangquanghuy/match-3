import { describe, expect, it } from 'vitest';
import { BoardGenerator } from '@engine/boardGen';
import { createGameState } from '@engine/GameState';
import { TurnEngine } from '@engine/TurnEngine';
import { SeededRNG } from '@engine/rng';
import { ExtensionRegistry } from '@engine/registry';
import { PlayerSide, snapshotCharacterForm, type Character } from '@engine/types';
import { registerAdaptedCatalog, resolveAdaptedSummon } from '../../src/sillytavern/enemyBlueprint';

describe('ST04 seed49 independent acceptance', () => {
  it('replays the actual Possessed King recipe with sequential form snapshots', () => {
    const registry = new ExtensionRegistry(); registerAdaptedCatalog(registry);
    const rng = new SeededRNG(49); let gid = 1;
    const board = new BoardGenerator(rng, () => gid++).generate();
    const caster: Character = { ...resolveAdaptedSummon('unit:6594')!, id: 4, defeated: false, statuses: [] };
    const target: Character = { ...resolveAdaptedSummon('unit:6000')!, id: 0, defeated: false, statuses: [], hp: 99999, maxHp: 99999, armor: 99999 };
    const state = createGameState(board, { player: PlayerSide.Left, characters: [target] }, { player: PlayerSide.Right, characters: [caster] });
    state.activePlayer = PlayerSide.Right; caster.mana = caster.manaCost;
    const engine = new TurnEngine(state, rng, () => gid++, registry); engine.skullChance = 0; engine.setSummonResolver(resolveAdaptedSummon);
    const events = engine.castSkill(caster.id);
    const forms = events.filter(e => e.type === 'troop-transform');
    expect(forms.map(e => ({ targetId: e.targetId, name: e.name, hp: e.form?.hp, maxHp: e.form?.maxHp }))).toEqual([
      { targetId: 0, name: '召唤体6600', hp: 18, maxHp: 18 },
      { targetId: 0, name: '召唤体6472', hp: 32, maxHp: 32 },
    ]);
    expect(forms.every(e => e.form && e.form.id === target.id && e.form.portraitUrl)).toBe(true);
    expect(target.name).toBe('召唤体6472');
    expect(forms[1].form).toEqual(snapshotCharacterForm(target));
    expect(forms[0].form?.skillId).not.toBe(forms[1].form?.skillId);
    expect(forms[0].form?.colors).not.toBe(forms[1].form?.colors);
  });
});
