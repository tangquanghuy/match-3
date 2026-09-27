// Scoped 9.4 Dust Tome repair: independent English/native wording and actual weapon casts.
// This does not constitute acceptance of every shared gem/mana/turn rule.
// @ts-expect-error Node fixture access
import fs from 'node:fs';
import { describe, it, expect, vi } from 'vitest';
// @ts-expect-error independent native snapshot index
import { indexNativeSpells } from '../../scripts/lib/gow-native-source.mjs';
// @ts-expect-error build-time correction helper
import { correctedWeaponDescription } from '../../scripts/lib/gow-weapon-desc-corrections.mjs';
import { ExtensionRegistry } from '@engine/registry';
import { registerSkillLibrary } from '@engine/skills/library';
import { TurnEngine } from '@engine/TurnEngine';
import { PlayerSide } from '@engine/types';
import weapons from '../../src/data/weapons.json';
import { spellDescription } from '../../src/data/combatText';
import { damageCharacter, damageFixture } from '../helpers/damageFixture';
const source = JSON.parse(fs.readFileSync('artifacts/gowhead-weapons/weapons.json','utf8')).weapons.find((w:{Id:number})=>w.Id===1013);
const raw = indexNativeSpells(JSON.parse(fs.readFileSync('data/raw/spells.gow.en.json','utf8')).spells).get(7079).raw;
const registry=new ExtensionRegistry(); registerSkillLibrary(registry.prototypes);
const weapon=weapons.find(w=>w.id===1013)!;
const expected={segments:[
 {kind:'gem',params:{op:'clear',mode:'destroy',target:{kind:'cell',cell:'CELL'}}},
 {kind:'buff',target:'allyAll',stat:'magic',scaling:{base:1,mult:0}},
]};
function fixture(side:PlayerSide,cell:{row:number,col:number},web=false){
 const f=damageFixture();
 const friends=[f.caster,damageCharacter(1,{magic:5}),damageCharacter(2,{magic:0,defeated:true,hp:0})];
 if(web)friends[1].statuses.push({id:'web',turns:3});
 if(side===PlayerSide.Left)f.state.teams.Left.characters=friends;
 else {f.state.teams.Left.characters=f.enemies;f.state.teams.Right.characters=friends;f.state.activePlayer=side;}
 Object.assign(f.caster,{skillId:'gw_DustyTome',manaCost:6,mana:6,colors:[...weapon.manaColors],magic:11});
 const engine=new TurnEngine(f.state,f.ctx.rng,f.ctx.nextGemId,registry); engine.skullChance=0;
 const choose=vi.fn(()=>cell);engine.setCellChooser({choose});
 return {...f,engine,choose,friends};
}
describe('Dusty Tome 7079 (official 9.4 Magic clause + independent later native snapshot)',()=>{
 it('source clauses, selected cell, both aliases, cost/color and regenerated display agree',()=>{
  expect(source.stats.spell.desc).toBe('Destroy a Gem and give 1 Magic to all Allies.');
  expect(raw).toMatchObject({Cost:6,Target:'Board',SpellSteps:[
   {Type:'DestroyGems',BoardTarget:'SingleGem',Amount:1},
   {Type:'IncreaseSpellPower',Target:'AllAllies',Amount:1},
  ]});
  expect(raw.SpellSteps).toHaveLength(2);
  expect(weapon.manaCost).toBe(6);expect(weapon.manaColors).toEqual(['Purple']);
  expect(registry.prototypes.get('gw_DustyTome')).toEqual(expected);
  expect(registry.prototypes.get('7079')).toEqual(expected);
  expect(weapon.spell.description).toBe('\u6467\u6bc1 1 \u9897\u5b9d\u77f3\u3002\u7ed9\u4e88\u6240\u6709\u76df\u53cb 1 \u70b9\u9b54\u529b\u503c\u3002');
  expect(spellDescription(7079,weapon.spell.description)).toBe(weapon.spell.description);
  expect(()=>correctedWeaponDescription(7079,'original changed',source.stats.spell.desc)).toThrow();
 });
 for(const side of [PlayerSide.Left,PlayerSide.Right])for(const cell of [{row:0,col:0},{row:7,col:7}])for(const web of [false,true])
 it(`actual equipment cast ${side} cell ${cell.row},${cell.col} webbed ally=${web}`,()=>{
  const f=fixture(side,cell,web);const picked=f.board.get(cell)!.id;
  const ev=f.engine.castSkill(0);
  expect(f.choose).toHaveBeenCalledTimes(1);expect(f.caster.mana).toBeGreaterThanOrEqual(0);expect(f.caster.mana).toBeLessThanOrEqual(6);
  const clear=ev.filter(e=>e.type==='gem-destroy');
  expect(clear).toHaveLength(1);
  expect(clear[0]).toMatchObject({cells:[{pos:cell,gemId:picked}]});
  expect(ev.findIndex(e=>e.type==='gem-destroy')).toBeLessThan(ev.findIndex(e=>e.type==='buff'&&e.stat==='magic'));
  expect(f.friends.map(c=>c.magic)).toEqual([12, web?5:6,0]);
  expect(ev.filter((e): e is Extract<typeof e,{type:'buff'}>=>e.type==='buff'&&e.stat==='magic').map(e=>e.targetId)).toEqual(web?[0]:[0,1]);
 });
 it('insufficient mana does not select a cell or grant Magic',()=>{
  const f=fixture(PlayerSide.Left,{row:0,col:0});f.caster.mana=5;
  expect(f.engine.castSkill(0)).toEqual([]);expect(f.choose).not.toHaveBeenCalled();
  expect(f.friends.map(c=>c.magic)).toEqual([11,5,0]);
 });
});
