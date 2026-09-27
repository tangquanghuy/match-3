// Full source steps/branch repairs for ManaBurn and Tower boost. Shared pool rules
// (transform levels/exclusions/status recovery) remain outside this scoped suite.
// @ts-expect-error Node fixtures
import fs from 'node:fs';
import { describe, expect, it } from 'vitest';
// @ts-expect-error Native source reader
import { indexNativeSpells } from '../../scripts/lib/gow-native-source.mjs';
import { ExtensionRegistry } from '@engine/registry';
import { registerSkillLibrary } from '@engine/skills/library';
import { TurnEngine } from '@engine/TurnEngine';
import { FixedBranchChooser } from '@engine/skills/branchChooser';
import { executePrototype, type EffectSegment } from '@engine/skills/prototypes';
import { applyStatus } from '@engine/skills/effects/status';
import { dmg, skill } from '@engine/skills/builders';
import { BaseColor, PlayerSide, colorGem } from '@engine/types';
import { attachPassives } from '@engine/traits';
import { damageFixture } from '../helpers/damageFixture';
import { troopToSummonTemplate } from '../../src/data/troops';
import weapons from '../../src/data/weapons.json';
import troops from '../../src/data/troops.json';
const native = indexNativeSpells(JSON.parse(fs.readFileSync('data/raw/spells.gow.en.json', 'utf8')).spells);
const registry = new ExtensionRegistry(); registerSkillLibrary(registry.prototypes);
const ids = [7328, 7332, 7652, 8897, 9745, 7412];
const flat = (segments: EffectSegment[]): EffectSegment[] => segments.flatMap(s => s.kind === 'choose' || s.kind === 'oneOf' ? s.options.flatMap(flat) : [s]);
function fixture(id: number, side = PlayerSide.Left, branch = 1) {
  const f = damageFixture(); const w = weapons.find(w => w.spell.id === id);
  const entity = w ?? troops.find(t => t.spell.id === id)!;
  f.caster.skillId = w ? `gw_${entity.referenceName}` : String(id);
  f.caster.mana = f.caster.manaCost = entity.manaCost;
  if (side === PlayerSide.Right) {
    f.state.teams.Left.characters = f.enemies; f.state.teams.Right.characters = [f.caster]; f.state.activePlayer = side;
  }
  const engine = new TurnEngine(f.state, f.ctx.rng, f.ctx.nextGemId, registry); engine.skullChance = 0;
  engine.setTargetChooser({ choose: () => 11 }); engine.setCellChooser({ choose: () => ({ row: 2, col: 5 }) });
  engine.setBranchChooser(new FixedBranchChooser(branch)); engine.setSummonResolver(troopToSummonTemplate);
  f.ctx.resolveSummonRef = troopToSummonTemplate; f.ctx.chosenBranch = branch;
  return { ...f, engine, cast: () => engine.castSkill(f.caster.id), proto: registry.prototypes.get(f.caster.skillId)! };
}
describe('Native ManaBurn is damage, never Mana Drain', () => {
  it('official 2.0 primary source explicitly distinguishes damage and no drain', () => {
    const source = fs.readFileSync('artifacts/gow-skill-audit/gold-primary-sources/official-mana-burn-2-0.html', 'utf8');
    expect(source).toContain('Mana Burn deals damage to an enemy based on the enemy');
    expect(source).toContain('Mana Burn does not drain Mana from the enemy');
  });
  for (const id of ids) it(`${id} native Magic multiplier=1 and one registered ManaBurn damage, no synthetic mana drain`, () => {
    expect(native.get(id).raw.SpellSteps.filter((s: { Type: string }) => s.Type === 'ManaBurn')).toMatchObject([{ SpellPowerMultiplier: 1 }]);
    const segments = flat(fixture(id).proto.segments);
    expect(segments.filter(s => s.kind === 'damage' && s.manaBurn)).toHaveLength(1);
    expect(segments.filter(s => s.kind === 'reduce' && s.stat === 'mana')).toEqual([]);
  });
  for (const id of ids) for (const side of [PlayerSide.Left, PlayerSide.Right])
    for (const magic of [0, 1, 11, 20]) for (const mana of [0, 7, 16])
      it(`${id} ${side} real cast at Magic=${magic}, target Mana=${mana}`, () => {
        const f = fixture(id, side); f.caster.magic = magic;
        for (const e of f.enemies) { e.mana = mana; e.armor = 5; }
        const original = [...f.enemies];
        const targets = id === 7332 ? original : [7652, 8897].includes(id) ? original.slice(0, 2) : [original[1]];
        const ev = f.cast(); const hit = ev.filter(e => e.type === 'skill-damage');
        if (magic + mana === 0) expect(hit).toEqual([]);
        else expect(hit.map(e => [e.targetId, e.damage])).toEqual(targets.map(e => [e.id, magic + mana]));
        for (const e of original) {
          expect(e.mana).toBe(mana); const amount = targets.includes(e) ? magic + mana : 0;
          // Real casts hand over the turn; newly applied Burning can tick after damage.
          const dot = ev.filter(x => x.type === 'status-tick').filter(x => x.targetId === e.id).reduce((n,x) => n + (x.damage ?? 0),0);
          const burningTicks = ev.filter(x => x.type === 'status-tick' && x.targetId === e.id && x.statusId === 'burning').length;
          expect(e.armor).toBe(Math.max(0, 5 - amount - (3 * burningTicks - dot))); expect(e.hp).toBe(1000 - Math.max(0, amount - 5) - dot);
        }
        expect(ev.some(e => e.type === 'buff' && e.stat === 'mana' && e.amount < 0)).toBe(false);
      });
  for (const trait of ['manashield', 'impervious', 'invulnerable']) for (const cursed of [false, true])
    it(`${trait}, Curse=${cursed}: ManaBurn immunity honors status policy without spending Barrier`, () => {
      const f = damageFixture(); const target = f.enemies[1]; target.traitIds = [trait]; attachPassives(target);
      target.mana = 9; target.statuses = [{ id: 'barrier', turns: 3 }, ...(cursed ? [{ id: 'curse', turns: 3 }] : [])];
      const ev = executePrototype(skill(dmg('enemyChosen', 0, 1, { manaBurn: true })), f.ctx);
      const allowed = cursed && trait !== 'invulnerable';
      expect(ev.some(e => e.type === 'status-expire' && e.statusId === 'barrier')).toBe(allowed);
      expect(target.hp).toBe(1000); expect(target.mana).toBe(9);
    });
  it('Blessed protects even a Cursed fixture; no damage and no Barrier consumption', () => {
    const f = damageFixture(); f.enemies[1].statuses = [{ id: 'blessed', turns: 3 }, { id: 'curse', turns: 3 }, { id: 'barrier', turns: 3 }];
    expect(executePrototype(skill(dmg('enemyChosen', 0, 1, { manaBurn: true })), f.ctx)).toEqual([]);
    expect(f.enemies[1].mana).toBe(16);
  });
  it('Stun suppresses Mana Shield trait, Web zeros only caster Magic, not enemy Mana', () => {
    const f = damageFixture(); const target = f.enemies[1]; target.traitIds = ['manashield']; attachPassives(target);
    target.statuses = [{ id: 'stun', turns: 3 }]; target.mana = 9; f.caster.statuses = [{ id: 'web', turns: 3 }];
    const ev = executePrototype(skill(dmg('enemyChosen', 0, 1, { manaBurn: true })), f.ctx);
    expect(ev.filter(e => e.type === 'skill-damage').map(e => e.damage)).toEqual([9]); expect(target.mana).toBe(9);
  });
  it('ordinary ManaBurn follows armor, Faerie Fire and Reflect', () => {
    const f = damageFixture(); const target = f.enemies[1]; target.mana = 9; target.armor = 5;
    target.statuses = [{ id: 'faerie-fire', turns: 3 }, { id: 'reflect', turns: 3 }];
    const ev = executePrototype(skill(dmg('enemyChosen', 0, 1, { manaBurn: true })), f.ctx);
    expect(ev.filter(e => e.type === 'skill-damage').map(e => [e.targetId, e.damage])).toEqual([[11, 30], [0, 15]]);
    expect(target.hp).toBe(975); expect(target.armor).toBe(0); expect(target.mana).toBe(9);
  });
  for (const whole of [false, true]) it(`Submerged only skips whole-team ManaBurn=${whole}`, () => {
    const f = damageFixture(); f.enemies[1].statuses = [{ id: 'submerged', turns: 3 }];
    const ev = executePrototype(skill(dmg(whole ? 'enemyAll' : 'enemyChosen', 0, 1, { manaBurn: true })), f.ctx);
    expect(ev.some(e => e.type === 'skill-damage' && e.targetId === 11)).toBe(!whole);
    expect(f.enemies[1].mana).toBe(16);
  });
  for (const blue of [12, 13]) it(`7332 uses the documented Blue threshold ${blue} for extra turn`, () => {
    const f = fixture(7332); const colors = [BaseColor.Red, BaseColor.Yellow, BaseColor.Purple, BaseColor.Brown];
    for (let row = 0; row < 8; row++) for (let col = 0; col < 8; col++) {
      const i = row * 8 + col; f.board.set({ row, col }, { id: i + 1, type: colorGem(i < blue ? BaseColor.Blue : colors[(row + col) % 4]) });
    }
    expect(f.cast().some(e => e.type === 'extra-turn' && e.source === 'skill')).toBe(blue === 13);
  });
  it('7652 native freeze -> ManaBurn -> original second/first back -> summon order', () => {
    expect(native.get(7652).raw.SpellSteps).toMatchObject([{ Type: 'CauseFrozen' }, { Type: 'ManaBurn' }, { Type: 'TroopOrderBack', Target: 'SecondEnemy' }, { Type: 'Delay' }, { Type: 'TroopOrderBack', Target: 'FrontEnemy' }, { Type: 'SummoningNoError', Amount: 6191 }]);
    const f = fixture(7652); const original = [...f.enemies]; const ev = f.cast();
    expect(f.state.teams.Right.characters.map(e => e.id)).toEqual([12, 13, 11, 10]);
    expect(original.slice(0, 2).every(e => e.statuses.some(s => s.id === 'frozen'))).toBe(true);
    expect(ev.findIndex(e => e.type === 'status-apply')).toBeLessThan(ev.findIndex(e => e.type === 'skill-damage'));
    expect(ev.findIndex(e => e.type === 'skill-damage')).toBeLessThan(ev.findIndex(e => e.type === 'troop-reposition'));
    expect(f.state.teams.Left.characters).toHaveLength(2);
  });
  for (const dead of [0, 1]) it(`7652 killed original index ${dead}: reposition never selects an untouched enemy`, () => {
    const f = fixture(7652); f.enemies[dead].hp = 1;
    const ev = f.cast(); const untouched = [12, 13];
    expect(ev.filter(e => e.type === 'troop-reposition').some(e => untouched.includes(e.targetId))).toBe(false);
    expect(f.state.teams.Right.characters.map(e => e.id)).toEqual([12, 13, dead === 0 ? 11 : 10]);
  });
  for (const id of [8897, 9745]) it(`${id} other branch performs Gems only and no ManaBurn`, () => {
    const f = fixture(id, PlayerSide.Left, 0);
    if (id === 9745) f.board.set({ row: 0, col: 0 }, { id: 1001, type: colorGem(BaseColor.Green) });
    const ev = f.cast();
    expect(ev.filter(e => e.type === 'skill-damage')).toEqual([]);
    expect(ev.some(e => e.type === (id === 8897 ? 'gem-explode' : 'gem-transform'))).toBe(true);
  });
  it('9745 applies Curse first so ordinary ManaBurn immunity is removed, same selected enemy', () => {
    const f = fixture(9745); f.enemies[1].traitIds = ['impervious']; attachPassives(f.enemies[1]);
    const ev = f.cast(); expect(ev.filter(e => e.type === 'skill-damage').map(e => [e.targetId, e.damage])).toEqual([[11, 27]]);
    expect(ev.findIndex(e => e.type === 'status-apply' && e.statusId === 'curse')).toBeLessThan(ev.findIndex(e => e.type === 'skill-damage'));
    expect(f.enemies[1].mana).toBe(16);
  });
  for (const side of [PlayerSide.Left, PlayerSide.Right]) for (const lethal of [false, true])
    it(`7412 ${side} lethal=${lethal}: Burn survivor OR transform CASTER into Dragon`, () => {
      const f = fixture(7412, side); if (lethal) f.enemies[1].hp = 1;
      const ev = f.cast(); const transformed = ev.filter(e => e.type === 'troop-transform');
      expect(transformed).toHaveLength(lethal ? 1 : 0);
      if (lethal) { expect(transformed[0].targetId).toBe(f.caster.id); expect(f.caster.troopTypes).toContain('Dragon'); }
      else { expect(f.enemies[1].statuses.some(s => s.id === 'burning')).toBe(true); expect(f.caster.skillId).toContain('gw_'); }
      expect(f.enemies[0].hp).toBe(1000); expect(f.enemies[2].hp).toBe(1000);
    });
});
describe('Curse and Stun immunity boundaries shared by ManaBurn spells', () => {
  for (const trait of ['impervious', 'invulnerable']) for (const blessed of [false, true])
    it(trait + ' receives Curse with Blessed=' + blessed, () => {
      const f = damageFixture(); const t = f.enemies[1]; t.traitIds = [trait]; attachPassives(t);
      if (blessed) t.statuses = [{ id: 'blessed', turns: 3 }];
      const ev = applyStatus(t, { id: 'curse', turns: 3 });
      if (trait === 'invulnerable') { expect(ev).toEqual([]); expect(t.statuses.some(s => s.id === 'blessed')).toBe(blessed); }
      else { expect(t.statuses.some(s => s.id === 'blessed')).toBe(false); expect(t.statuses.some(s => s.id === 'curse')).toBe(!blessed); }
    });
  for (const stunned of [false, true]) it('Stun suppresses ordinary Fireproof, stunned=' + stunned, () => {
    const f = damageFixture(); const t = f.enemies[1]; t.traitIds = ['fireproof']; attachPassives(t);
    if (stunned) t.statuses = [{ id: 'stun', turns: 3 }];
    expect(applyStatus(t, { id: 'burning', turns: 3, magnitude: 3 }).some(e => e.type === 'status-apply')).toBe(stunned);
  });
  for (const stunned of [false, true]) it('ManaBurn uses Spell Block unless stunned=' + stunned, () => {
    const f = damageFixture(); const t = f.enemies[1]; t.traitIds = ['spellblock']; attachPassives(t); t.mana = 9;
    if (stunned) t.statuses = [{ id: 'stun', turns: 3 }];
    const ev = executePrototype(skill(dmg('enemyChosen', 0, 1, { manaBurn: true })), f.ctx);
    expect(ev.filter(e => e.type === 'skill-damage').map(e => e.damage)).toEqual([stunned ? 20 : 10]); expect(t.mana).toBe(9);
  });
});
// Odd half-Magic inputs only lock the existing project Math.round behavior;
// the stored native steps do not certify GoW's fractional rounding.
describe('Deathspire / 7800 enemy Tower (native castle) boost', () => {
  it('native source Counter counts all enemy castle types at x8 before all-enemy damage', () => {
    expect(native.get(7800).raw.SpellSteps).toMatchObject([{ Type: 'CountArmyType', Target: 'AllEnemies', Data: 'castle', Amount: 800 }, { Type: 'Damage', SpellPowerMultiplier: 0.5, Amount: 2, UseCounterForAmount: true }]);
    expect(troops.find(t => t.referenceName === 'LeonisTower')?.troopTypes).toContain('Castle');
  });
  for (const side of [PlayerSide.Left, PlayerSide.Right]) for (const towers of [0, 1, 2, 4]) for (const magic of [0, 1, 11, 20])
    it(`7800 ${side} ${towers} living Towers, Magic=${magic}`, () => {
      const f = fixture(7800, side); f.caster.magic = magic; f.caster.troopTypes = ['Castle'];
      f.enemies.forEach((e, i) => e.troopTypes = i < towers ? ['Castle'] : ['Construct']);
      const amount = Math.round(magic / 2 + 2) + 8 * towers;
      expect(f.cast().filter(e => e.type === 'skill-damage').map(e => [e.targetId, e.damage])).toEqual(f.enemies.map(e => [e.id, amount]));
    });
  it('dead Towers and a troop named The Tower (Construct) do not boost damage', () => {
    const f = fixture(7800); f.enemies[0].troopTypes = ['Castle']; f.enemies[0].hp = 0; f.enemies[0].defeated = true;
    f.enemies[1].name = 'The Tower'; f.enemies[1].troopTypes = ['Construct'];
    expect(f.cast().filter(e => e.type === 'skill-damage').map(e => e.damage)).toEqual([8, 8, 8]);
  });
});
