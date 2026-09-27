// Peasant 6098: historical official spell wording, native BoardTarget Block3x1 and real battle selection.
// @ts-expect-error Node fixture typings are absent from the browser TypeScript build.
import fs from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import { ExtensionRegistry } from '@engine/registry';
import { registerSkillLibrary } from '@engine/skills/library';
import { TurnEngine } from '@engine/TurnEngine';
import { FixedCellChooser, prototypeNeedsCell } from '@engine/skills/cellChooser';
import { BaseColor, PlayerSide } from '@engine/types';
import { damageFixture } from '../helpers/damageFixture';
import { TROOPS } from '../../src/data/troops';
import { spellDescription } from '../../src/data/combatText';
const troop = TROOPS.find(t => t.id === 6098)!;
const en = JSON.parse(fs.readFileSync('data/raw/troops.gow.en.json','utf8')).troops.find((t: { Id: number }) => t.Id === 6098);
const nativeRow = JSON.parse(fs.readFileSync('data/raw/spells.gow.en.json','utf8')).spells.find((s: { Id: number }) => s.Id === 7000);
const raw = JSON.parse(nativeRow.RawData ?? nativeRow.data);
const guide = fs.readFileSync('artifacts/gow-skill-audit/gold-primary-sources/official-brian-guide.html','utf8');
const registry = new ExtensionRegistry(); registerSkillLibrary(registry.prototypes);
function setup(row: number, col: number, side = PlayerSide.Left) {
  const f = damageFixture(); f.caster.skillId = '7000'; f.caster.manaCost = f.caster.mana = 3;
  f.caster.colors = [BaseColor.Blue];
  if(side === PlayerSide.Right) {
    f.state.teams.Left.characters = f.enemies;
    f.state.teams.Right.characters = [f.caster]; f.state.activePlayer = side;
  }
  const engine = new TurnEngine(f.state, f.ctx.rng, f.ctx.nextGemId, registry);
  engine.skullChance = 0; engine.setCellChooser(new FixedCellChooser({row,col}));
  return {...f, cast: () => engine.castSkill(f.caster.id)};
}
describe('Peasant 6098: Pitchfork complete stored-snapshot review',()=>{
  it('cross-checks source, official historical wording, native geometry and final registered spell',()=>{
    expect(en.SpellId).toBe(7000);expect(en.stats.spell.desc).toBe('Destroy a Gem and the Gems either side of it.');
    expect(raw).toMatchObject({Id:7000, Cost:3, Target:'Board', SpellSteps:[{Type:'DestroyGems', Amount:1, BoardTarget:'Block3x1'}]});
    expect(raw.SpellSteps).toHaveLength(1);
    expect(troop.spell.id).toBe(7000);expect(troop.manaCost).toBe(3);expect(troop.manaColors).toEqual(['Blue']);
    expect(registry.prototypes.get('7000')).toEqual({segments:[{kind:'gem',params:{op:'clear',mode:'destroy',target:{kind:'area',shape:'row3',center:'CELL'}}}]});
    expect(prototypeNeedsCell(registry.prototypes.get('7000')!)).toBe(true);
    expect(spellDescription(7000,troop.spell.description)).toContain('两侧');
    const section=guide.slice(guide.indexOf('<h2>Peasant</h2>'),guide.indexOf('<h2>Peasant</h2>')+5400);
    expect(section).toContain('Destroy a Gem and the Gems either side of it.');expect(section).toContain('(Cost:3');
  });
  for(const side of [PlayerSide.Left,PlayerSide.Right]) for(const [row,col] of [[3,3],[0,0],[0,7],[7,1],[7,6]] as const) {
    it(`${side} cell ${row},${col}: only selected gem and horizontal neighbours destroyed`,()=>{
      const f=setup(row,col,side);
      const before=new Map<string,number>();f.board.forEach((gem,pos)=>{if(gem)before.set(`${pos.row},${pos.col}`,gem.id);});
      const events=f.cast();
      const hits=events.filter(e=>e.type==='gem-destroy').flatMap(e=>e.type==='gem-destroy'?e.cells:[]);
      expect(hits.map(x=>`${x.pos.row},${x.pos.col}`)).toEqual([col-1,col,col+1].filter(c=>c>=0&&c<8).map(c=>`${row},${c}`));
      expect(hits.map(x=>x.gemId)).toEqual(hits.map(x=>before.get(`${x.pos.row},${x.pos.col}`)));
      expect(events.some(e=>e.type==='gem-explode'||e.type==='skill-damage'||e.type==='extra-turn')).toBe(false);
      expect(f.enemies.map(e=>e.hp)).toEqual([1000,1000,1000,1000]);
      expect(events.filter(e=>e.type==='skill-cast')).toHaveLength(1);
      expect(f.state.activePlayer).toBe(side===PlayerSide.Left?PlayerSide.Right:PlayerSide.Left);
      expect(f.state.actionLog).toHaveLength(1);
    });
  }
  it('center with no Blue gems in the row destroys three and spends exactly 3 mana',()=>{
    const f=setup(3,3);f.cast();expect(f.caster.mana).toBe(0);
  });
  it('calls chooser once for board-target anchor',()=>{
    const f=damageFixture();f.caster.skillId='7000';f.caster.manaCost=f.caster.mana=3;
    const engine=new TurnEngine(f.state,f.ctx.rng,f.ctx.nextGemId,registry);engine.skullChance=0;
    const choose=vi.fn(()=>({row:3,col:3}));engine.setCellChooser({choose});
    const events=engine.castSkill(f.caster.id);
    expect(choose).toHaveBeenCalledOnce();expect(events.some(e=>e.type==='gem-destroy')).toBe(true);
  });
  for(const mode of ['silence','low-mana'] as const) it(`${mode}: blocks cast and turn change`,()=>{
    const f=setup(3,3);if(mode==='silence')f.caster.statuses=[{id:'silence',turns:3}];else f.caster.mana=2;
    expect(f.cast()).toEqual([]);expect(f.caster.mana).toBe(mode==='silence'?3:2);
    expect(f.state.activePlayer).toBe(PlayerSide.Left);expect(f.state.actionLog).toHaveLength(0);
  });
});
