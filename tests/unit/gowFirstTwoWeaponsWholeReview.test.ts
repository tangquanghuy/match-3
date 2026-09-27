// Full English/native/official 9.4 and real TurnEngine review of FirstTwoEnemies weapons.
// @ts-expect-error Stored Node evidence
import fs from 'node:fs';
import {describe,expect,it,vi} from 'vitest';
// @ts-expect-error Independent native source index
import {indexNativeSpells} from '../../scripts/lib/gow-native-source.mjs';
import {ExtensionRegistry} from '@engine/registry';
import {registerSkillLibrary} from '@engine/skills/library';
import {TurnEngine} from '@engine/TurnEngine';
import {PlayerSide,BaseColor} from '@engine/types';
import {attachPassives} from '@engine/traits';
import {damageFixture} from '../helpers/damageFixture';
import {spellDescription} from '../../src/data/combatText';
import weapons from '../../src/data/weapons.json';
const english=JSON.parse(fs.readFileSync('artifacts/gowhead-weapons/weapons.json','utf8')).weapons;
const native=indexNativeSpells(JSON.parse(fs.readFileSync('data/raw/spells.gow.en.json','utf8')).spells);
const official=fs.readFileSync('artifacts/gow-skill-audit/gold-primary-sources/update-9-4-patch-notes.html','utf8').replace(/<[^>]*>/g,' ').replace(/\s+/g,' ');
const statusGuide=fs.readFileSync('artifacts/gow-skill-audit/gold-primary-sources/official-status-effects.html','utf8');
const registry=new ExtensionRegistry();registerSkillLibrary(registry.prototypes);
const cases=[
 {id:1008,spellId:7074,ref:'IcyGlaive',name:'Icy Glaive',base:3,cost:8,legacyCounter:true},
 {id:1023,spellId:7089,ref:'GlaiveOfStorms',name:'Glaive of Storms',base:5,cost:9,legacyCounter:false},
] as const;
function setup(c:typeof cases[number],side:PlayerSide,alias:string){
 const f=damageFixture(9);f.caster.skillId=alias;f.caster.manaCost=f.caster.mana=c.cost;
 f.caster.colors=[BaseColor.Yellow];
 if(side===PlayerSide.Right){f.state.teams.Left.characters=f.enemies;f.state.teams.Right.characters=[f.caster];f.state.activePlayer=side;}
 const engine=new TurnEngine(f.state,f.ctx.rng,f.ctx.nextGemId,registry);engine.skullChance=0;
 const chooser=vi.fn(()=>13);engine.setTargetChooser({choose:chooser});
 const board=()=>Array.from({length:64},(_,i)=>f.board.get({row:Math.floor(i/8),col:i%8}));
 return {...f,chooser,board,cast:()=>engine.castSkill(f.caster.id)};
}
for(const c of cases)describe(`${c.name} ${c.id} / ${c.spellId} complete stored-snapshot review`,()=>{
 it('independent English/native/official patch and runtime aliases, red-gem boost removed',()=>{
  const patch=official.slice(official.indexOf(c.name),official.indexOf(c.name)+450);
  expect(patch).toContain('Spell changed to deal damage to the first 2 Enemies.');
  expect(patch).toContain('Spell no longer removes Red Gems.');
  expect(patch).toContain('Spell no longer boosts from Red Gems removed.');
  if(c.id===1023){expect(patch).toContain('Mana cost decreased from 10 to 9');expect(patch).toContain('Base damage decreased from 6 to 5');}
  expect(english.find((w:{id:number})=>w.id===c.id).stats.spell.desc).toBe(`Deal [Magic + ${c.base}] damage to the first 2 Enemies.`);
  const n=native.get(c.spellId).raw;
  expect(n).toMatchObject({Id:c.spellId,Cost:c.cost,Target:'None',SpellSteps:[{Type:'Damage',Target:'FirstTwoEnemies',Amount:c.base,SpellPowerMultiplier:1,Primarypower:true}]});
  expect(n.SpellSteps).toHaveLength(1);
  expect(!!n.SpellSteps[0].UseCounterForAmount).toBe(c.legacyCounter);
  const weapon=weapons.find(w=>w.id===c.id)!;
  expect(weapon).toMatchObject({referenceName:c.ref,manaCost:c.cost,manaColors:['Yellow'],spell:{id:c.spellId}});
  const expected={segments:[{kind:'damage',target:'enemyFirstN',n:2,scaling:{base:c.base,mult:1}}]};
  expect(registry.prototypes.get(String(c.spellId))).toEqual(expected);
  expect(registry.prototypes.get(`gw_${c.ref}`)).toEqual(expected);
  expect(spellDescription(c.spellId,weapon.spell.description)).toContain(`魔法 + ${c.base}`);
  expect(statusGuide).toContain('Submerged troops');expect(statusGuide).toContain('Reflect');
 });
 for(const alias of [String(c.spellId),`gw_${c.ref}`])for(const side of [PlayerSide.Left,PlayerSide.Right]){
  it(`${alias}/${side}: two living targets, 9 red gems do not boost or clear`,()=>{
   const f=setup(c,side,alias);f.caster.magic=11;
   const before=f.board();const ev=f.cast();
   expect(ev.filter(e=>e.type==='skill-damage').map(e=>[e.targetId,e.damage])).toEqual([[10,11+c.base],[11,11+c.base]]);
   expect(f.enemies.map(e=>e.hp)).toEqual([989-c.base,989-c.base,1000,1000]);
   expect(f.chooser).not.toHaveBeenCalled();expect(f.board()).toEqual(before);
   expect(ev.some(e=>e.type==='gem-destroy'||e.type==='gem-transform'||e.type==='extra-turn')).toBe(false);
   expect(f.caster.mana).toBe(0);expect(f.state.actionLog).toHaveLength(1);
   expect(f.state.activePlayer).toBe(side===PlayerSide.Left?PlayerSide.Right:PlayerSide.Left);
  });
  for(const scenario of ['barrier','submerged','stealthy','faerie-fire','reflect','spellarmor','spellblock','stunned-spellblock'] as const)
   it(`${alias}/${side}: first enemy ${scenario} applies one hit independently of second`,()=>{
    const f=setup(c,side,alias),target=f.enemies[0];f.caster.magic=scenario==='reflect'?10:11;
    const amount=f.caster.magic+c.base;f.caster.armor=5;
    if(scenario==='stealthy'||scenario==='spellarmor'||scenario==='spellblock'||scenario==='stunned-spellblock'){
     target.traitIds=[scenario==='stealthy'?'stealthy':scenario==='spellarmor'?'spellarmor':'spellblock'];attachPassives(target);
    }
    if(scenario==='stunned-spellblock')target.statuses=[{id:'stun',turns:3}];
    else if(!['stealthy','spellarmor','spellblock'].includes(scenario))target.statuses=[{id:scenario,turns:3}];
    const ev=f.cast();const hits=ev.filter(e=>e.type==='skill-damage');
    let adjusted=amount;
    if(scenario==='faerie-fire')adjusted=Math.round(amount*1.5);
    if(scenario==='spellarmor')adjusted=Math.round(amount*0.75);
    if(scenario==='spellblock')adjusted=Math.round(amount*0.5);
    const reflection=scenario==='reflect'?Math.max(1,Math.floor(amount/2)):0;
    expect(hits.map(e=>[e.targetId,e.damage])).toEqual([
     ...(scenario==='barrier'?[]:[[10,adjusted]]),...(reflection?[[0,reflection]]:[]),[11,amount],
    ]);
    expect(target.hp).toBe(scenario==='barrier'?1000:1000-adjusted);
    expect(f.enemies[1].hp).toBe(1000-amount);
    expect(f.enemies.slice(2).every(e=>e.hp===1000)).toBe(true);
    expect(f.caster.hp).toBe(1000-Math.max(0,reflection-5));
    if(scenario==='barrier'||scenario==='reflect')expect(target.statuses.some(s=>s.id===scenario)).toBe(false);
    expect(f.chooser).not.toHaveBeenCalled();expect(f.state.actionLog).toHaveLength(1);
   });
  for(const hiddenSlots of [[1],[0,1],[0,1,2,3]] as const)
   it(`${alias}/${side}: fixed first two positions remain fixed when slots ${hiddenSlots.join(',')} are Stealthy`,()=>{
    const f=setup(c,side,alias);
    for(const slot of hiddenSlots){f.enemies[slot].traitIds=['stealthy'];attachPassives(f.enemies[slot]);}
    const hits=f.cast().filter(e=>e.type==='skill-damage');
    expect(hits.map(e=>e.targetId)).toEqual([10,11]);
    expect(f.enemies.slice(2).map(e=>e.hp)).toEqual([1000,1000]);
   });
  it(`${alias}/${side}: front pre-defeated or killed never causes a third hit`,()=>{
   const skip=setup(c,side,alias);skip.enemies[0].defeated=true;skip.enemies[0].hp=0;
   expect(skip.cast().filter(e=>e.type==='skill-damage').map(e=>e.targetId)).toEqual([11,12]);
   expect(skip.enemies[3].hp).toBe(1000);
   const kill=setup(c,side,alias);kill.enemies[0].hp=1;
   const ev=kill.cast();expect(ev.filter(e=>e.type==='skill-damage').map(e=>e.targetId)).toEqual([10,11]);
   expect(ev.filter(e=>e.type==='defeat').map(e=>e.characterId)).toEqual([10]);expect(kill.enemies[2].hp).toBe(1000);
  });
  for(const mode of ['low-mana','silence','defeated-caster'] as const)
   it(`${alias}/${side}: ${mode} blocks casting, no turn/mana/gem spending`,()=>{
    const f=setup(c,side,alias),before=f.board();
    if(mode==='low-mana')f.caster.mana=c.cost-1;
    if(mode==='silence')f.caster.statuses=[{id:'silence',turns:3}];
    if(mode==='defeated-caster'){f.caster.defeated=true;f.caster.hp=0;}
    const mana=f.caster.mana;expect(f.cast()).toEqual([]);expect(f.caster.mana).toBe(mana);
    expect(f.board()).toEqual(before);expect(f.state.actionLog).toHaveLength(0);
   });
 }
});