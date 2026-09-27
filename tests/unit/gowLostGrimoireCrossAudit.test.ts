// Lost Grimoire 1043 / 7108: one native RowAndColumn operation must clear the chosen cross atomically.
// @ts-expect-error Node fixtures
import fs from 'node:fs';
import {describe,expect,it} from 'vitest';
// @ts-expect-error Native source reader
import {indexNativeSpells} from '../../scripts/lib/gow-native-source.mjs';
import {ExtensionRegistry} from '@engine/registry';
import {registerSkillLibrary} from '@engine/skills/library';
import {TurnEngine} from '@engine/TurnEngine';
import {FixedCellChooser} from '@engine/skills/cellChooser';
import {BaseColor,PlayerSide} from '@engine/types';
import {damageFixture} from '../helpers/damageFixture';
import {spellDescription} from '../../src/data/combatText';
import weapons from '../../src/data/weapons.json';
const weapon=weapons.find(w=>w.id===1043)!;
const en=JSON.parse(fs.readFileSync('artifacts/gowhead-weapons/weapons.json','utf8')).weapons.find((w:{id:number})=>w.id===1043);
const native=indexNativeSpells(JSON.parse(fs.readFileSync('data/raw/spells.gow.en.json','utf8')).spells).get(7108).raw;
const guide=fs.readFileSync('artifacts/gow-skill-audit/gold-primary-sources/official-weapon-list.html','utf8');
const registry=new ExtensionRegistry();registerSkillLibrary(registry.prototypes);
function setup(alias='gw_LostGrimoire',side=PlayerSide.Left,row=2,col=5){
  const f=damageFixture();f.caster.skillId=alias;f.caster.manaCost=f.caster.mana=10;
  f.caster.colors=[BaseColor.Purple];
  if(side===PlayerSide.Right){f.state.teams.Left.characters=f.enemies;f.state.teams.Right.characters=[f.caster];f.state.activePlayer=side;}
  const engine=new TurnEngine(f.state,f.ctx.rng,f.ctx.nextGemId,registry);
  engine.skullChance=0;engine.setCellChooser(new FixedCellChooser({row,col}));
  return {...f,cast:()=>engine.castSkill(f.caster.id)};
}
describe('Lost Grimoire 1043 / native 7108 full RowAndColumn spell review',()=>{
  it('English, one native step and historical official guide match cost, colors and cross; both aliases share one atomic primitive',()=>{
    const section=guide.slice(guide.indexOf('<h2>Lost Grimoire</h2>'),guide.indexOf('<h2>Lost Grimoire</h2>')+2300);
    expect(section).toContain('Lost Grimoire</big></b>  (Mana Cost:10');
    expect(section).toContain('Destroy a Row and Column.');
    expect(section).toContain('Purple</font>');
    expect(en.stats.spell.desc).toBe('Destroy a row and column.');
    expect(native).toMatchObject({Id:7108,Cost:10,Target:'Board',SpellSteps:[{Type:'DestroyGems',BoardTarget:'RowAndColumn',Amount:1}]});
    expect(native.SpellSteps).toHaveLength(1);
    expect(weapon.manaCost).toBe(10);expect(weapon.manaColors).toEqual(['Purple']);expect(weapon.spell.id).toBe(7108);
    const expected={segments:[{kind:'gem',params:{op:'clear',mode:'destroy',target:{kind:'chosenCross'}}}]};
    expect(registry.prototypes.get('7108')).toEqual(expected);
    expect(registry.prototypes.get('gw_LostGrimoire')).toEqual(expected);
    expect(spellDescription(7108,weapon.spell.description)).toContain('行和列');
  });
  for(const alias of ['7108','gw_LostGrimoire'])for(const side of [PlayerSide.Left,PlayerSide.Right])for(const [row,col] of [[0,0],[2,5],[7,7]] as const)
    it(`${alias}/${side} (${row},${col}): clears 15 unique original row/column cells, with one board resolution`,()=>{
      const f=setup(alias,side,row,col);
      const original=new Map<string,number>();
      for(let r=0;r<8;r++)for(let c=0;c<8;c++)if(r===row||c===col)original.set(`${r},${c}`,f.board.get({row:r,col:c})!.id);
      const ev=f.cast();const clears=ev.filter(e=>e.type==='gem-destroy');
      expect(clears).toHaveLength(1);
      if(clears[0]?.type!=='gem-destroy')throw Error('missing cross destroy event');
      expect(clears[0].cells).toHaveLength(15);
      expect(clears[0].cells.map(x=>[`${x.pos.row},${x.pos.col}`,x.gemId]).sort())
        .toEqual([...original].sort().map(([pos,id])=>[pos,id]));
      expect(ev.filter(e=>e.type==='skill-damage'||e.type==='status-apply')).toEqual([]);
      expect(f.enemies.every(e=>e.hp===1000&&e.armor===0)).toBe(true);
      expect(f.state.actionLog).toHaveLength(1);
      expect(f.state.activePlayer).toBe(side===PlayerSide.Left?PlayerSide.Right:PlayerSide.Left);
      expect(ev.some(e=>e.type==='extra-turn')).toBe(false);
    });
  for(const mode of ['low-mana','silence'] as const)it(`${mode}: no cross clear or turn spent`,()=>{
    const f=setup();if(mode==='low-mana')f.caster.mana=9;
    if(mode==='silence')f.caster.statuses=[{id:'silence',turns:3}];
    expect(f.cast()).toEqual([]);expect(f.caster.mana).toBe(mode==='low-mana'?9:10);
    expect(f.state.actionLog).toHaveLength(0);
  });
  it('Web does not affect fixed RowAndColumn geometry',()=>{
    const f=setup();f.caster.magic=100;f.caster.statuses=[{id:'web',turns:3}];
    expect(f.cast().filter(e=>e.type==='gem-destroy').flatMap(e=>e.type==='gem-destroy'?e.cells:[])).toHaveLength(15);
  });
});