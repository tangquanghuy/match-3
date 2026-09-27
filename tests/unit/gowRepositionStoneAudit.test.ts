// Scoped native-step review and real turn handoff. Does not certify all shared immunity rules.
// @ts-expect-error Node source fixtures
import fs from 'node:fs';
import { describe, it, expect, vi } from 'vitest';
// @ts-expect-error Node native snapshot reader
import { indexNativeSpells } from '../../scripts/lib/gow-native-source.mjs';
import { ExtensionRegistry } from '@engine/registry';
import { registerSkillLibrary } from '@engine/skills/library';
import { TurnEngine } from '@engine/TurnEngine';
import { attachPassives } from '@engine/traits';
import { FixedColorChooser } from '@engine/skills/colorChooser';
import { executePrototype } from '@engine/skills/prototypes';
import { BaseColor, PlayerSide, colorGem, specialGem } from '@engine/types';
import { spellDescription } from '../../src/data/combatText';
import { damageFixture } from '../helpers/damageFixture';
import weapons from '../../src/data/weapons.json';
import metadata from '../../src/data/weapon-skill-meta.json';
const native = indexNativeSpells(JSON.parse(fs.readFileSync('data/raw/spells.gow.en.json','utf8')).spells);
const source = JSON.parse(fs.readFileSync('artifacts/gowhead-weapons/weapons.json','utf8')).weapons;
const registry = new ExtensionRegistry(); registerSkillLibrary(registry.prototypes);
function fixture(id: 8074 | 8400, side = PlayerSide.Left) {
  const f = damageFixture(); const w = weapons.find(w=>w.spell.id===id)!;
  f.caster.skillId = `gw_${w.referenceName}`; f.caster.mana = f.caster.manaCost = w.manaCost;
  // A legal swap, no starting match; prevents deadlock reshuffling in pure damage cases.
  for (const [row,col,color] of [[0,0,BaseColor.Red],[0,1,BaseColor.Blue],[0,2,BaseColor.Red],[1,1,BaseColor.Red]] as const)
    f.board.set({row,col},{id:900+row*8+col,type:colorGem(color)});
  if(side===PlayerSide.Right){f.state.teams.Left.characters=f.enemies;f.state.teams.Right.characters=[f.caster];f.state.activePlayer=side;}
  f.ctx.chosenColor=BaseColor.Red;
  const engine=new TurnEngine(f.state,f.ctx.rng,f.ctx.nextGemId,registry);engine.skullChance=0;
  engine.setColorChooser(new FixedColorChooser(BaseColor.Red));
  return {...f, engine, proto:registry.prototypes.get(f.caster.skillId)!, cast:()=>engine.castSkill(f.caster.id)};
}
function setBoard(f: ReturnType<typeof fixture>, stones: number, red: number) {
  for(let i=0;i<64;i++) f.board.set({row:Math.floor(i/8),col:i%8},{id:i+1,
    type:i<stones?specialGem('stoneBlock'):colorGem(i<stones+red?BaseColor.Red:BaseColor.Blue)});
}
describe('Dancing Daggers native sequential current-front knockbacks',()=>{
  it('English count range is mandatory one move then independent 50%, not uniform target count or simultaneous selection',()=>{
    expect(source.find((w:{SpellId:number})=>w.SpellId===8074).stats.spell.desc).toContain('Knock 1-2 Enemies from first to last position.');
    expect(native.get(8074).raw.SpellSteps).toMatchObject([
      {Type:'Damage',Target:'AllEnemies',Amount:5,SpellPowerMultiplier:1},
      {Type:'DelayUntilEffectsComplete'}, {Type:'TroopOrderBack',Target:'FrontEnemy'},
      {Type:'DelayUntilEffectsComplete'}, {Type:'ResetTargets'},
      {Type:'TroopOrderBack',Target:'FrontEnemy',PercentageChance:50},
    ]);
    expect(fixture(8074).proto.segments).toMatchObject([
      {kind:'damage',target:'enemyAll',scaling:{base:5,mult:1},range:'all'},
      {kind:'reposition',target:'enemyFront',to:'back'},
      {kind:'reposition',target:'enemyFront',to:'back',chance:0.5},
    ]);
  });
  for(const side of [PlayerSide.Left,PlayerSide.Right]) for(const roll of [0,0.499999,0.5,0.999999])
    for(const magic of [0,1,11,20]) it(`${side} M=${magic}, second roll=${roll}`,()=>{
      const f=fixture(8074,side);f.caster.magic=magic;
      const targets=[...f.enemies];const spy=vi.spyOn(f.ctx.rng,'next').mockReturnValueOnce(roll);
      const ev=f.cast();spy.mockRestore();
      expect(ev.filter(e=>e.type==='skill-damage').map(e=>[e.targetId,e.damage])).toEqual(targets.map(t=>[t.id,magic+5]));
      expect(targets.every(t=>t.hp===1000-magic-5)).toBe(true);
      expect(ev.filter(e=>e.type==='troop-reposition').map(e=>e.targetId)).toEqual(roll<0.5?[10,11]:[10]);
      expect(f.enemies.map(t=>t.id)).toEqual(roll<0.5?[12,13,10,11]:[11,12,13,10]);
      const firstMove=ev.findIndex(e=>e.type==='troop-reposition');
      expect(ev.slice(firstMove).some(e=>e.type==='skill-damage')).toBe(false);
      expect(f.caster.mana).toBe(0);
      expect(f.state.activePlayer).toBe(side===PlayerSide.Left?PlayerSide.Right:PlayerSide.Left);
      expect(f.state.actionLog.at(-1)?.outcome).toBe('switched');
    });
  for(const side of [PlayerSide.Left,PlayerSide.Right]) for(const dead of [1,2,3,4])
    it(`${side} ${dead} front enemies die before knockbacks; choose survivors, never damage replacements`,()=>{
      const f=fixture(8074,side);const snapshot=[...f.enemies];snapshot.slice(0,dead).forEach(t=>{t.hp=1;});
      const spy=vi.spyOn(f.ctx.rng,'next').mockReturnValueOnce(0);const ev=f.cast();spy.mockRestore();
      expect(ev.filter(e=>e.type==='defeat').map(e=>e.characterId)).toEqual(snapshot.slice(0,dead).map(t=>t.id));
      const living=snapshot.slice(dead).map(t=>t.id);
      expect(ev.filter(e=>e.type==='troop-reposition').map(e=>e.targetId)).toEqual(!living.length?[]:living.length===1?[living[0],living[0]]:living.slice(0,2));
      expect(ev.filter(e=>e.type==='skill-damage')).toHaveLength(4);
      expect(ev.filter(e=>e.type==='troop-reposition').every(e=>e.type!=='troop-reposition'||!snapshot.find(t=>t.id===e.targetId)!.defeated)).toBe(true);
    });
  it('no original-front revival/retarget assumption: already defeated first troop is skipped from both damage and movement',()=>{
    const f=fixture(8074);f.enemies[0].defeated=true;
    const spy=vi.spyOn(f.ctx.rng,'next').mockReturnValueOnce(0.8);const ev=f.cast();spy.mockRestore();
    expect(ev.filter(e=>e.type==='skill-damage').map(e=>e.targetId)).toEqual([11,12,13]);
    expect(ev.filter(e=>e.type==='troop-reposition').map(e=>e.targetId)).toEqual([11]);
  });
});
describe('Memories of Stone: snapshot Block count on drain, capped chosen-color destroy',()=>{
  it('native counter boosts Mana Drain, not destruction; English explicitly limits destruction',()=>{
    expect(source.find((w:{SpellId:number})=>w.SpellId===8400).stats.spell.desc).toBe('Drain 2 Mana from all Enemies, boosted by Stone Blocks. Destroy [Magic + 1] Gems of a chosen Color. [1:1]');
    expect(native.get(8400).raw.SpellSteps).toMatchObject([
      {Type:'CountGems',Color1:'Block',Amount:100},
      {Type:'DecreaseMana',Target:'AllEnemies',Amount:2,UseCounterForAmount:true},
      {Type:'DestroyColor',Color1:'FromTarget',Amount:1,SpellPowerMultiplier:1},
    ]);
  });
  for(const side of [PlayerSide.Left,PlayerSide.Right]) for(const stones of [0,1,6,20])
    for(const magic of [0,1,11,20]) for(const red of [0,2,30])
      it(`${side} Blocks=${stones} M=${magic} chosen red=${red}`,()=>{
        const f=fixture(8400,side);f.caster.magic=magic;setBoard(f,stones,red);
        const beforeMana=[0,1,7,30];f.enemies.forEach((t,i)=>{t.mana=beforeMana[i];});
        const ev=executePrototype(f.proto,f.ctx);
        expect(f.enemies.map(t=>t.mana)).toEqual(beforeMana.map(m=>Math.max(0,m-2-stones)));
        expect(ev.filter(e=>e.type==='buff').map(e=>[e.targetId,e.amount])).toEqual(beforeMana.flatMap((m,i)=>m>0?[[10+i,-Math.min(m,2+stones)]]:[]));
        const clear=ev.find(e=>e.type==='gem-destroy');expect(clear?.type==='gem-destroy'?clear.cells.length:0).toBe(Math.min(red,magic+1));
        if(clear?.type==='gem-destroy')expect(clear.cells.every(c=>c.gemType.kind==='color'&&c.gemType.color===BaseColor.Red)).toBe(true);
        let remainingBlocks=0;f.board.forEach(g=>{if(g?.type.kind==='special'&&g.type.spec.kind==='stoneBlock')remainingBlocks++;});
        expect(remainingBlocks).toBe(stones);
        const clearIndex=ev.findIndex(e=>e.type==='gem-destroy');if(clearIndex>=0)expect(ev.slice(clearIndex).some(e=>e.type==='buff')).toBe(false);
      });
  for(const side of [PlayerSide.Left,PlayerSide.Right]) for(const stones of [0,4])
    for(const magic of [0,11]) it(`${side} real equipped weapon cast Blocks=${stones} M=${magic}`,()=>{
      const f=fixture(8400,side);f.caster.magic=magic;setBoard(f,stones,24);f.enemies.forEach(t=>{t.mana=20;});
      const ev=f.cast();const clear=ev.find(e=>e.type==='gem-destroy');
      expect(clear?.type==='gem-destroy'?clear.cells.length:0).toBe(magic+1);
      expect(ev.filter(e=>e.type==='buff').filter(e=>e.stat==='mana'&&e.amount<0).map(e=>[e.targetId,e.amount])).toEqual([10,11,12,13].map(id=>[id,-2-stones]));
      expect(f.enemies.every(t=>t.mana===18-stones)).toBe(true);
      expect(ev[0]).toMatchObject({type:'skill-cast',characterId:0,skillId:f.caster.skillId});
      expect(f.board.isFull()).toBe(true);
    });
  it('defeated enemies excluded from drain; low Mana clips at zero; allies untouched',()=>{
    const f=fixture(8400);setBoard(f,3,0);f.enemies[0].defeated=true;f.enemies[1].mana=1;
    const ev=executePrototype(f.proto,f.ctx);expect(f.enemies[0].mana).toBe(16);expect(f.enemies[1].mana).toBe(0);
    expect(f.caster.mana).toBe(15);expect(ev.some(e=>e.type==='buff'&&[0,10].includes(e.targetId))).toBe(false);
  });
  for(const side of [PlayerSide.Left,PlayerSide.Right]) for(const trait of ['', 'manashield', 'impervious', 'invulnerable'])
    for(const status of ['', 'blessed', 'curse', 'stun']) it(side+' Mana Drain immunity '+trait+'/'+status,()=>{
      const f=fixture(8400,side);setBoard(f,3,0);const target=f.enemies[1];target.mana=20;
      if(trait){target.traitIds=[trait];attachPassives(target);} if(status)target.statuses=[{id:status,turns:3}];
      const immune=status==='blessed'||trait==='invulnerable'||(trait==='manashield'&&status!=='curse'&&status!=='stun');
      const ev=executePrototype(f.proto,f.ctx);
      expect(target.mana).toBe(immune?20:15);
      expect(ev.some(e=>e.type==='buff'&&e.targetId===target.id)).toBe(!immune);
    });
  for(const id of [8074,8400] as const) it(`${id} numeric/equipped prototypes and description metadata agree; insufficient Mana casts nothing`,()=>{
    const f=fixture(id);const w=weapons.find(w=>w.spell.id===id)!;
    expect(registry.prototypes.get(String(id))).toEqual(f.proto);expect((metadata as Record<string,unknown>)[id]).toEqual({fidelity:'full',missingFeatures:[],skippedClauses:[]});
    const text=spellDescription(id,w.spell.description);expect(text).toContain(id===8074?'50%':'魔法 + 1');
    f.caster.mana--;const mana=f.caster.mana;expect(f.cast()).toEqual([]);expect(f.caster.mana).toBe(mana);
  });
});
