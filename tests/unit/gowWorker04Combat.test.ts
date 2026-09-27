// Worker-04 two source-complete combat entries with kill reward and whole-team theft.
// @ts-expect-error Node snapshot fixture
import fs from 'node:fs';
import {describe,it,expect} from 'vitest';
// @ts-expect-error Stored native spell index
import {indexNativeSpells} from '../../scripts/lib/gow-native-source.mjs';
import {ExtensionRegistry} from '@engine/registry';
import {registerSkillLibrary} from '@engine/skills/library';
import {TurnEngine} from '@engine/TurnEngine';
import {FixedTargetChooser} from '@engine/skills/targetChooser';
import {BaseColor,PlayerSide} from '@engine/types';
import {damageFixture} from '../helpers/damageFixture';
import {TROOPS} from '../../src/data/troops';
const english=JSON.parse(fs.readFileSync('data/raw/troops.gow.en.json','utf8')).troops;
const native=indexNativeSpells(JSON.parse(fs.readFileSync('data/raw/spells.gow.en.json','utf8')).spells);
const registry=new ExtensionRegistry();registerSkillLibrary(registry.prototypes);
const specs=[
 {id:6011,spell:7011,cost:10,colors:[BaseColor.Purple,BaseColor.Brown],desc:'Deal [Magic + 3] damage to an Enemy. If the Enemy dies, gain 6 points to a random Skill.',steps:[{Type:'Damage',Target:'FromTarget',Amount:3,SpellPowerMultiplier:1,Primarypower:true},{Type:'Delay'},{Type:'IncreaseRandom',Target:'Self',StatusAmount:6,StatusModifier:'AddForKill'}],segments:[{kind:'damage',target:'enemyChosen',scaling:{base:3,mult:1}},{kind:'randomStat',target:'allySelf',scaling:{base:6,mult:0},ifTargetDied:true,oneSkill:true}]},
 {id:6071,spell:7141,cost:14,colors:[BaseColor.Green,BaseColor.Red],desc:'Steal [Magic] Armor and 5 Attack from all Enemies.',steps:[{Type:'StealArmor',Target:'AllEnemies',SpellPowerMultiplier:1,Primarypower:true},{Type:'StealAttack',Target:'AllEnemies',Amount:5}],segments:[{kind:'reduce',target:'enemyAll',stat:'armor',scaling:{base:0,mult:1},gainStat:'armor'},{kind:'reduce',target:'enemyAll',stat:'attack',scaling:{base:5,mult:0},gainStat:'attack'}]},
] as const;
const opposite=(side:PlayerSide)=>side===PlayerSide.Left?PlayerSide.Right:PlayerSide.Left;
function fixture(c:typeof specs[number],side:PlayerSide,magic:number){
 const f=damageFixture();Object.assign(f.caster,{skillId:String(c.spell),mana:c.cost,manaCost:c.cost,colors:[...c.colors],magic,attack:17});
 if(side===PlayerSide.Right){f.state.teams.Left.characters=f.enemies;f.state.teams.Right.characters=[f.caster];f.state.activePlayer=side;}
 const engine=new TurnEngine(f.state,f.ctx.rng,f.ctx.nextGemId,registry);engine.skullChance=0;engine.setTargetChooser(new FixedTargetChooser(12));
 return {...f,cast:()=>engine.castSkill(f.caster.id)};
}
for(const c of specs)describe(`troop:${c.id} ${c.spell} whole source/real combat`,()=>{
 it('independent full English, exact ordered native SpellSteps, entity binding and runtime',()=>{
  const en=english.find((x:{id:number})=>x.id===c.id),n=native.get(c.spell).raw,t=TROOPS.find(t=>t.id===c.id)!;
  expect(en.stats.spell.id).toBe(c.spell);expect(en.stats.spell.desc).toBe(c.desc);
  expect(en.ManaCost).toBe(c.cost);expect(Object.keys(en._ManaColors_parsed).sort()).toEqual(c.colors.map(v=>`Color${v}`).sort());
  expect(n.Cost).toBe(c.cost);expect(n.SpellSteps).toHaveLength(c.steps.length);
  c.steps.forEach((step,i)=>expect(n.SpellSteps[i]).toMatchObject(step));
  expect(t).toMatchObject({id:c.id,manaCost:c.cost,manaColors:[...c.colors],spell:{id:c.spell}});
  expect(t.spell.description.trim().length).toBeGreaterThan(8);
  expect(registry.prototypes.get(String(c.spell))).toEqual({segments:c.segments});
 });
 for(const side of [PlayerSide.Left,PlayerSide.Right])for(const magic of [0,1,10]){
  if(c.id===6011)for(const armor of [0,10])for(const kill of [false,true])it(`${side} Magic${magic} armor${armor} kill=${kill}: exact target/reward order`,()=>{
   const f=fixture(c,side,magic),target=f.enemies[2];target.armor=armor;
   const amount=magic+3;target.hp=target.maxHp=kill?Math.max(amount-armor,1):1000;
   // A killing blow with Armor10 and Magic0/1 requires a 1-HP enemy: armor must first absorb the hit.
   const actuallyDies=kill&&armor<amount;const own={attack:f.caster.attack,armor:f.caster.armor,magic:f.caster.magic,hp:f.caster.hp,maxHp:f.caster.maxHp};
   const ev=f.cast(),absorbed=Math.min(armor,amount),lifeLoss=amount-absorbed;
   expect(target.armor).toBe(armor-absorbed);expect(target.hp).toBe(Math.max(0,(kill?Math.max(amount-armor,1):1000)-lifeLoss));
   expect(target.defeated).toBe(actuallyDies);expect(f.enemies.filter(x=>x.id!==12).every(x=>x.hp===1000)).toBe(true);
   const buffs=ev.filter(e=>e.type==='buff'&&e.targetId===f.caster.id);
   expect(buffs).toHaveLength(actuallyDies?1:0);
   if(actuallyDies){
    expect(buffs[0]).toMatchObject({amount:6});
    const changed=(['attack','armor','magic','hp'] as const).filter(k=>f.caster[k]!==own[k]);
    expect(changed).toHaveLength(1);expect(f.caster[changed[0]]).toBe(own[changed[0]]+6);
    expect(f.caster.maxHp).toBe(own.maxHp+(changed[0]==='hp'?6:0));
    expect(ev.findIndex(e=>e.type==='skill-damage')).toBeLessThan(ev.findIndex(e=>e.type==='buff'));
   }else expect(f.caster).toMatchObject(own);
   expect(f.caster.mana).toBe(0);expect(f.state.activePlayer).toBe(opposite(side));
  });
  if(c.id===6071)it(`${side} Magic${magic}: capped four-enemy Armor/Attack transfer`,()=>{
   const f=fixture(c,side,magic),armor=[0,2,20,50],attack=[0,2,20,50];
   f.enemies.forEach((x,i)=>{x.armor=armor[i];x.attack=attack[i];});
   const ev=f.cast();const armorLoss=armor.map(n=>Math.min(n,magic)),attackLoss=attack.map(n=>Math.min(n,5));
   expect(f.enemies.map(x=>x.armor)).toEqual(armor.map((n,i)=>n-armorLoss[i]));
   expect(f.enemies.map(x=>x.attack)).toEqual(attack.map((n,i)=>n-attackLoss[i]));
   expect(f.caster.armor).toBe(armorLoss.reduce((a,b)=>a+b,0));
   expect(f.caster.attack).toBe(17+attackLoss.reduce((a,b)=>a+b,0));
   expect(f.enemies.every(x=>x.hp===1000)).toBe(true);expect(ev.filter(e=>e.type==='skill-cast')).toHaveLength(1);
   expect(f.caster.mana).toBe(0);expect(f.state.activePlayer).toBe(opposite(side));
  });
 }
 for(const mode of ['low-mana','silence'] as const)it(`${mode} blocks exact entity without spending turn`,()=>{
  const f=fixture(c,PlayerSide.Left,10);
  if(mode==='low-mana')f.caster.mana=c.cost-1;else f.caster.statuses=[{id:'silence',turns:3}];
  expect(f.cast()).toEqual([]);expect(f.caster.mana).toBe(mode==='low-mana'?c.cost-1:c.cost);
  expect(f.enemies.every(x=>x.hp===1000)).toBe(true);
  expect(f.state.actionLog).toHaveLength(0);expect(f.state.activePlayer).toBe(PlayerSide.Left);
 });
});
