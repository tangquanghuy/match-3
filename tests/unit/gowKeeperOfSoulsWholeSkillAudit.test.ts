// Keeper of Souls 6074 / native 7144: complete stored-snapshot color-to-skull spell.
// @ts-expect-error Node fixture typings are absent from the browser TypeScript build.
import fs from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import { ExtensionRegistry } from '@engine/registry';
import { registerSkillLibrary } from '@engine/skills/library';
import { TurnEngine } from '@engine/TurnEngine';
import { FixedColorChooser, prototypeNeedsColor } from '@engine/skills/colorChooser';
import { BaseColor, PlayerSide } from '@engine/types';
import { TROOPS } from '../../src/data/troops';
import { spellDescription } from '../../src/data/combatText';
import { damageFixture } from '../helpers/damageFixture';

const troop = TROOPS.find(t => t.id === 6074)!;
const en = JSON.parse(fs.readFileSync('data/raw/troops.gow.en.json', 'utf8')).troops.find((t: { Id: number }) => t.Id === 6074);
const nativeRow = JSON.parse(fs.readFileSync('data/raw/spells.gow.en.json', 'utf8')).spells.find((s: { Id: number }) => s.Id === 7144);
const raw = JSON.parse(nativeRow.RawData ?? nativeRow.data);
const guide = fs.readFileSync('artifacts/gow-skill-audit/gold-primary-sources/official-brian-guide.html', 'utf8');
const registry = new ExtensionRegistry(); registerSkillLibrary(registry.prototypes);
function setup(color: BaseColor, side = PlayerSide.Left) {
  const f = damageFixture();
  f.caster.skillId = '7144'; f.caster.manaCost = f.caster.mana = 15;
  f.caster.colors = [BaseColor.Purple, BaseColor.Brown];
  if (side === PlayerSide.Right) {
    f.state.teams.Left.characters = f.enemies;
    f.state.teams.Right.characters = [f.caster];
    f.state.activePlayer = side;
  }
  const engine = new TurnEngine(f.state, f.ctx.rng, f.ctx.nextGemId, registry);
  engine.skullChance = 0; engine.setColorChooser(new FixedColorChooser(color));
  return {...f, cast: () => engine.castSkill(f.caster.id)};
}
describe('Keeper of Souls 6074: complete selected-colour Skull transform (stored snapshot)', () => {
  it('corroborates full English/native clause and notes historical official cost change', () => {
    expect(en.SpellId).toBe(7144);
    expect(en.stats.spell.desc).toBe('Transform all Gems of a chosen color to Skulls.');
    expect(raw).toMatchObject({ Id:7144, Cost:15, Target:'ManaGemsOnly', SpellSteps:[
      {Type:'ConvertGems',Color1:'FromTarget',Color2:'Skull',Amount:100},
    ] });
    expect(raw.SpellSteps).toHaveLength(1);
    expect(troop.spell.id).toBe(7144); expect(troop.manaCost).toBe(15);
    expect(troop.manaColors).toEqual(['Purple','Brown']);
    expect(registry.prototypes.get('7144')).toEqual({segments:[
      {kind:'gem',params:{op:'transform',from:'CHOSEN',to:'SKULL'}},
    ]});
    expect(prototypeNeedsColor(registry.prototypes.get('7144')!)).toBe(true);
    expect(spellDescription(7144,troop.spell.description)).toContain('骷髅头');
    const section=guide.slice(guide.indexOf('<h2>Keeper of Souls</h2>'),guide.indexOf('<h2>Keeper of Souls</h2>')+4400);
    expect(section).toContain('Transform all Gems of a chosen color to Skulls.');
    expect(section).toContain('(Cost:16'); // Historical cost, not the stored later native Cost:15.
  });
  for (const color of [BaseColor.Blue, BaseColor.Yellow, BaseColor.Purple, BaseColor.Brown])
    for (const side of [PlayerSide.Left, PlayerSide.Right]) it(`${color}/${side}: transforms exactly the chosen color across the whole board`,()=>{
      const f=setup(color,side);
      const original: string[]=[];
      f.board.forEach((gem,pos)=>{if(gem?.type.kind==='color'&&gem.type.color===color)original.push(`${pos.row},${pos.col}`);});
      const events=f.cast();
      const changes=events.filter(e=>e.type==='gem-transform').flatMap(e=>e.type==='gem-transform'?e.changes:[]);
      expect(changes.map(x=>`${x.pos.row},${x.pos.col}`).sort()).toEqual(original.sort());
      expect(changes.every(x=>x.to.kind==='skull')).toBe(true);
      expect(events.filter(e=>e.type==='skill-cast')).toHaveLength(1);
      expect(f.caster.mana).toBe(0);
      expect(f.state.actionLog).toHaveLength(1);
      expect(f.state.activePlayer).toBe(side===PlayerSide.Left?PlayerSide.Right:PlayerSide.Left);
    });
  it('an absent color changes zero gems but still spends the cast, without a fabricated extra turn',()=>{
    const f=setup(BaseColor.Green);const events=f.cast();
    expect(events.filter(e=>e.type==='gem-transform')).toHaveLength(0);
    expect(events.some(e=>e.type==='extra-turn')).toBe(false);
    expect(f.caster.mana).toBe(0);
    expect(f.state.activePlayer).toBe(PlayerSide.Right);
  });
  for(const mode of ['silence','low-mana'] as const)it(`${mode}: prevents cast and keeps mana and active side`,()=>{
    const f=setup(BaseColor.Purple);
    if(mode==='silence')f.caster.statuses=[{id:'silence',turns:3}];else f.caster.mana=14;
    expect(f.cast()).toEqual([]);expect(f.caster.mana).toBe(mode==='silence'?15:14);
    expect(f.state.activePlayer).toBe(PlayerSide.Left);
    expect(f.state.actionLog).toHaveLength(0);
  });
  it('chooses the color once from the battle entry',()=>{
    const f=damageFixture();f.caster.skillId='7144';f.caster.manaCost=f.caster.mana=15;
    const engine=new TurnEngine(f.state,f.ctx.rng,f.ctx.nextGemId,registry);engine.skullChance=0;
    const choose=vi.fn(()=>BaseColor.Purple);engine.setColorChooser({choose});
    const events=engine.castSkill(f.caster.id);
    expect(choose).toHaveBeenCalledOnce();
    expect(events.some(e=>e.type==='gem-transform')).toBe(true);
  });
});

