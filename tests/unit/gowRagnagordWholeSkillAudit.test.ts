// Ragnagord 6105: source-anchored chosen-colour random explosions through TurnEngine.
// @ts-expect-error Node fixture typings are absent from the browser TypeScript build.
import fs from 'node:fs';
import {describe,expect,it,vi} from 'vitest';
import {ExtensionRegistry} from '@engine/registry';
import {registerSkillLibrary} from '@engine/skills/library';
import {TurnEngine} from '@engine/TurnEngine';
import {FixedColorChooser,prototypeNeedsColor} from '@engine/skills/colorChooser';
import {BaseColor,PlayerSide} from '@engine/types';
import {damageFixture} from '../helpers/damageFixture';
import {TROOPS} from '../../src/data/troops';
import {spellDescription} from '../../src/data/combatText';
const troop=TROOPS.find(t=>t.id===6105)!;
const english=JSON.parse(fs.readFileSync('data/raw/troops.gow.en.json','utf8')).troops.find((x:{Id:number})=>x.Id===6105);
const nativeRow=JSON.parse(fs.readFileSync('data/raw/spells.gow.en.json','utf8')).spells.find((x:{Id:number})=>x.Id===7171);
const native=JSON.parse(nativeRow.RawData??nativeRow.data);
const guide=fs.readFileSync('artifacts/gow-skill-audit/gold-primary-sources/official-brian-guide.html','utf8');
const registry=new ExtensionRegistry();registerSkillLibrary(registry.prototypes);
function setup(color:BaseColor,magic=11,side=PlayerSide.Left){
 const f=damageFixture();f.caster.skillId='7171';f.caster.manaCost=f.caster.mana=14;
 f.caster.colors=[BaseColor.Red,BaseColor.Brown];f.caster.magic=magic;
 if(side===PlayerSide.Right){f.state.teams.Left.characters=f.enemies;f.state.teams.Right.characters=[f.caster];f.state.activePlayer=side;}
 const engine=new TurnEngine(f.state,f.ctx.rng,f.ctx.nextGemId,registry);engine.skullChance=0;
 engine.setColorChooser(new FixedColorChooser(color));return {...f,cast:()=>engine.castSkill(f.caster.id)};
}
describe('Ragnagord 6105: Blitz Em complete stored-snapshot review',()=>{
 it('cross-checks current stored English/native step, final registry and historical official randomized wording',()=>{
  expect(english.SpellId).toBe(7171);expect(english.stats.spell.desc).toBe('Explode [Magic + 2] Gems of a chosen Color.');
  expect(native).toMatchObject({Id:7171,Cost:14,Target:'ManaGemsOnly',SpellSteps:[{Type:'ExplodeColor',Color1:'FromTarget',Amount:2,SpellPowerMultiplier:1,Primarypower:true}]});
  expect(native.SpellSteps).toHaveLength(1);expect(troop.spell.id).toBe(7171);
  expect(troop.manaCost).toBe(14);expect(troop.manaColors).toEqual(['Red','Brown']);
  expect(registry.prototypes.get('7171')).toEqual({segments:[{kind:'gem',params:{op:'clear',mode:'explode',target:{kind:'randomGems',count:{base:2,mult:1},include:'color',color:'CHOSEN'}}}]});
  expect(prototypeNeedsColor(registry.prototypes.get('7171')!)).toBe(true);
  expect(spellDescription(7171,troop.spell.description)).toContain('爆破');
  const section=guide.slice(guide.indexOf('<h2>Ragnagord</h2>'),guide.indexOf('<h2>Ragnagord</h2>')+5700);
  expect(section).toContain('Explode [2+Magic] random Gems of a chosen color.');expect(section).toContain('(Cost:14');
 });
 for(const side of [PlayerSide.Left,PlayerSide.Right])for(const magic of [0,1,11,20])for(const color of [BaseColor.Blue,BaseColor.Yellow])it(`${side} M=${magic} ${color}: randomly explode only chosen-color gems, capped by pool`,()=>{
  const f=setup(color,magic,side);
  const gemColors=new Map<number,BaseColor>();f.board.forEach(g=>{if(g?.type.kind==='color')gemColors.set(g.id,g.type.color);});
  const centers: {row:number;col:number}[]=[];
  f.board.forEach((g,pos)=>{if(g?.type.kind==='color'&&g.type.color===color)centers.push({...pos});});
  const n=Math.min(magic+2,centers.length);
  const events=f.cast();const cleared=events.filter(e=>e.type==='gem-explode').flatMap(e=>e.type==='gem-explode'?e.cells:[]);
  const actual=cleared.map(x=>`${x.pos.row},${x.pos.col}`).sort().join('|');
  // Independent geometry oracle: an explosion radiates one cell in each direction; enumerate
  // all distinct n-center subsets of the originally chosen colour (do not reuse engine RNG).
  let valid=false;
  function possible(start:number,picked:{row:number;col:number}[]){
    if(valid)return;
    if(picked.length===n){
      const footprint=new Set<string>();
      for(const c of picked)for(let dr=-1;dr<=1;dr++)for(let dc=-1;dc<=1;dc++){
        const row=c.row+dr,col=c.col+dc;if(row>=0&&row<8&&col>=0&&col<8)footprint.add(`${row},${col}`);
      }
      if([...footprint].sort().join('|')===actual)valid=true;
      return;
    }
    for(let i=start;i<=centers.length-(n-picked.length);i++)possible(i+1,[...picked,centers[i]]);
  }
  possible(0,[]);expect(valid).toBe(true);
  expect(new Set(cleared.map(x=>x.gemId)).size).toBe(cleared.length);
  expect(cleared.every(x=>gemColors.has(x.gemId))).toBe(true);
  expect(events.filter(e=>e.type==='gem-explode')).toHaveLength(1);  expect(events.some(e=>e.type==='gem-destroy'||e.type==='skill-damage')).toBe(false);
  expect(events.filter(e=>e.type==='skill-cast')).toHaveLength(1);
  expect(f.state.activePlayer).toBe(events.some(e=>e.type==='extra-turn')?side:(side===PlayerSide.Left?PlayerSide.Right:PlayerSide.Left));
  expect(f.state.actionLog).toHaveLength(1);
 });
 it('absent chosen color explodes nothing but spends the cast',()=>{
  const f=setup(BaseColor.Green);const events=f.cast();
  expect(events.filter(e=>e.type==='gem-explode')).toHaveLength(0);expect(f.caster.mana).toBe(0);
  expect(f.state.activePlayer).toBe(PlayerSide.Right);
 });
 it('prompts for chosen color exactly once',()=>{
  const f=damageFixture();f.caster.skillId='7171';f.caster.manaCost=f.caster.mana=14;
  const engine=new TurnEngine(f.state,f.ctx.rng,f.ctx.nextGemId,registry);engine.skullChance=0;
  const choose=vi.fn(()=>BaseColor.Blue);engine.setColorChooser({choose});
  expect(engine.castSkill(f.caster.id).some(e=>e.type==='gem-explode')).toBe(true);
  expect(choose).toHaveBeenCalledOnce();
 });
 for(const mode of ['silence','low-mana'] as const)it(`${mode}: no cast or turn expenditure`,()=>{
  const f=setup(BaseColor.Blue);if(mode==='silence')f.caster.statuses=[{id:'silence',turns:3}];else f.caster.mana=13;
  expect(f.cast()).toEqual([]);expect(f.caster.mana).toBe(mode==='silence'?14:13);
  expect(f.state.activePlayer).toBe(PlayerSide.Left);expect(f.state.actionLog).toHaveLength(0);
 });
});


