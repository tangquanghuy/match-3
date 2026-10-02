import { describe, expect, it } from 'vitest';
import { TurnEngine } from '@engine/TurnEngine';
import { CombatResolver } from '@engine/CombatResolver';
import { ExtensionRegistry } from '@engine/registry';
import { SKILL_LIBRARY } from '@engine/skills/library';
import { executePrototype } from '@engine/skills/prototypes';
import { FixedTargetChooser } from '@engine/skills/targetChooser';
import { applyStatus } from '@engine/skills/effects/status';
import { getTrait, attachPassives, applyBigMatchTriggers, applyColorMatchTriggers } from '@engine/traits';
import { BaseColor, PlayerSide, specialGem, colorGem } from '@engine/types';
import { YELUO_ID, YELUO_SPELL_ID, COMMUNITY_KINGDOM, COMMUNITY_RACE } from '../../src/data/communityTroops';
import { getTroopById, getTroopByRef, TROOPS } from '../../src/data/troops';
import { kingdomTroopPool } from '../../src/meta/data/kingdoms';
import { troopArt } from '../../src/meta/screens/teamScreen';
import { newSave } from '../../src/meta/state/schema';
import { metaKnownTraitIds, troopToSnapshot } from '../../src/meta/systems/battleBridge';
import { grantTroop, getRecord } from '../../src/meta/systems/troopProgress';
import { damageFixture } from '../helpers/damageFixture';
const codes = ['yeluo_blood_vitality', 'yeluo_night_armor', 'yeluo_crimson_moon'];
const proto = SKILL_LIBRARY[YELUO_SPELL_ID];

describe('YeLuo / 猩红谢幕 / 赤月留痕 integration', () => {
  it('registers a unique Epic red-green visitor through catalog, kingdom, collection and battle snapshot', () => {
    const troop = getTroopById(YELUO_ID)!;
    expect(getTroopByRef('YeLuo')).toBe(troop);
    expect(TROOPS.filter(t=>t.id===YELUO_ID)).toHaveLength(1);
    expect(TROOPS.filter(t=>t.spell.id===YELUO_SPELL_ID)).toHaveLength(1);
    expect(troop).toMatchObject({ name:'叶落', rarity:'Epic', rarityIdx:4, manaCost:12,
      kingdom:COMMUNITY_KINGDOM, troopTypes:[COMMUNITY_RACE], manaColors:[BaseColor.Red,BaseColor.Green], spell:{name:'猩红谢幕'} });
    expect(kingdomTroopPool(COMMUNITY_KINGDOM)).toContain(troop);
    expect(troopArt(troop)).toBe(troop.artUrl);
    expect(troop.artUrl).toContain('yeluo.webp');
    expect(troop.traits.map(t=>t.code)).toEqual(codes);
    codes.forEach(code=>{ expect(getTrait(code)).toBeDefined(); expect(metaKnownTraitIds()).toContain(code); });
    const save = newSave({now:0,starterTroopIds:[]});
    grantTroop(save,YELUO_ID);
    const record=getRecord(save,YELUO_ID)!;
    expect(troopToSnapshot(troop,record,'yeluo').traitIds).toEqual([]);
    record.traits=[true,true,true];
    expect(troopToSnapshot(troop,record,'yeluo')).toMatchObject({traitIds:codes,skillId:String(YELUO_SPELL_ID),portraitUrl:troop.artUrl,manaCost:12});
  });
  it.each([[0,0,15],[1,0,15],[1,1,16],[3,2,17],[16,16,31],[32,32,47]])(
    'combines %i red and %i green before flooring, primary damage %i', (red,green,amount)=>{
      const {ctx,enemies}=damageFixture(red,green);
      const events=executePrototype(proto,ctx);
      expect(enemies.map(e=>1000-e.hp)).toEqual([Math.floor(amount/2),amount,Math.floor(amount/2),0]);
      expect(events.some(e=>e.type==='gem-transform'||e.type==='gem-create')).toBe(false);
      expect(proto.segments.map(s=>s.kind)).toEqual(['damage','gem']);
    });
  it('excludes colored special gems from the boost',()=>{
    const {ctx,board,enemies}=damageFixture(1,0);
    board.set({row:0,col:1},{id:2,type:specialGem('dragonGem',undefined,BaseColor.Green)});
    executePrototype(proto,ctx);
    expect(enemies[1].hp).toBe(985);
  });
  it.each(['primary','collateral','multiple'] as const)('a %s kill creates one batch of 10 mixed gems',kind=>{
    const {ctx,enemies}=damageFixture();
    if(kind!=='collateral') enemies[1].hp=1;
    if(kind!=='primary') enemies[0].hp=1;
    if(kind==='multiple') enemies[2].hp=1;
    const events=executePrototype(proto,ctx);
    const batches=events.filter(e=>e.type==='gem-transform');
    expect(batches).toHaveLength(1);
    expect(batches[0].changes).toHaveLength(10);
    expect(events.filter(e=>e.type==='defeat')).toHaveLength(kind==='multiple'?3:1);
    expect(events.some(e=>e.type==='extra-turn')).toBe(false);
  });
  it('does not award a kill bonus for a blocked primary with surviving neighbours',()=>{
    const {ctx,enemies}=damageFixture(); enemies[1].statuses=[{id:'barrier',turns:3}];
    const events=executePrototype(proto,ctx);
    expect(enemies[1].hp).toBe(1000);
    expect(events.some(e=>e.type==='gem-transform')).toBe(false);
  });
  it('casts through TurnEngine with chosen target and spends 16 mana',()=>{
    const {ctx,state,caster,enemies}=damageFixture();
    const registry=new ExtensionRegistry(); registry.prototypes.set(String(YELUO_SPELL_ID),proto);
    const engine=new TurnEngine(state,ctx.rng,ctx.nextGemId,registry);
    engine.setTargetChooser(new FixedTargetChooser(11));
    const events=engine.castSkill(caster.id);
    expect(events[0].type).toBe('skill-cast');
    expect(caster.mana).toBe(0);
    expect(enemies.map(e=>e.hp)).toEqual([993,985,993,1000]);
  });
  it.each([4,5])('%i-match grants exactly 2 life and max life',size=>{
    const {caster,ctx,enemies}=damageFixture(); caster.traitIds=codes; attachPassives(caster);
    applyBigMatchTriggers([caster],{size,enemyTeam:enemies,rng:ctx.rng,applyStatus});
    expect([caster.hp,caster.maxHp]).toEqual([1002,1002]);
  });
  it('reduces actual incoming skull damage by 25%',()=>{
    const {caster,enemies,state,ctx}=damageFixture();
    caster.traitIds=codes; attachPassives(caster); enemies[0].attack=20;
    new CombatResolver().resolveSkullDamage(state.teams[PlayerSide.Right],state.teams[PlayerSide.Left],3,ctx.rng);
    expect(caster.hp).toBe(985);
  });
  it('red match bleeds exactly one living enemy through the shared status pipeline',()=>{
    const {caster,enemies,ctx}=damageFixture(); caster.traitIds=codes; attachPassives(caster);
    enemies[0].defeated=true;
    applyColorMatchTriggers([caster],BaseColor.Red,{enemyTeam:enemies,rng:ctx.rng,applyStatus});
    expect(enemies.flatMap(e=>e.statuses)).toEqual([{id:'bleed',turns:3,magnitude:1}]);
    expect(enemies[0].statuses).toEqual([]);
  });
  it.each(['other-color','locked','defeated','immune'])('%s does not apply bleeding',mode=>{
    const {caster,enemies,ctx}=damageFixture(0,0,[{}]);
    caster.traitIds=mode==='locked'?[]:codes;
    if(mode==='defeated') caster.defeated=true;
    if(mode==='immune') enemies[0].traitIds=['impervious'];
    attachPassives(caster); attachPassives(enemies[0]);
    applyColorMatchTriggers([caster],mode==='other-color'?BaseColor.Green:BaseColor.Red,{enemyTeam:enemies,rng:ctx.rng,applyStatus});
    expect(enemies[0].statuses).toEqual([]);
  });
  it('a real red four-match triggers both life gain and bleeding',()=>{
    const {board,caster,ctx,state}=damageFixture(); caster.traitIds=codes;
    for(let col=0;col<4;col++) board.set({row:7,col},{id:57+col,type:colorGem(col===2?BaseColor.Green:BaseColor.Red)});
    board.set({row:6,col:2},{id:51,type:colorGem(BaseColor.Red)});
    board.set({row:5,col:2},{id:43,type:colorGem(BaseColor.Blue)});
    const engine=new TurnEngine(state,ctx.rng,ctx.nextGemId,new ExtensionRegistry());
    const events=engine.resolveSwap({row:7,col:2},{row:6,col:2});
    expect(events.some(e=>e.type==='status-apply'&&e.statusId==='bleed')).toBe(true);
    expect(events.some(e=>e.type==='buff'&&e.targetId===caster.id&&e.stat==='hp'&&e.amount===2)).toBe(true);
  });
});
