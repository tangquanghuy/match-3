// @ts-expect-error Node audit subprocess
import {execFileSync} from 'node:child_process';
import {describe,it,expect} from 'vitest';
import {spellDescription} from '../../src/data/combatText';
const result=JSON.parse(execFileSync('node',['scripts/check-gow-regeneration.mjs'],{encoding:'utf8',maxBuffer:8*1024*1024}));
describe('snapshot repairs survive regeneration without touching generated files',()=>{
 it('covers all 65 mixed-gem repairs plus 49 source-backed exception weapons',()=>expect(result.weapons).toHaveLength(114));
 for(const c of result.weapons)it(`weapon spell ${c.spellId} generator equals final registered prototype`,()=>expect(c.generated).toEqual(c.registered));
 for(const [id,cost] of [[7334,8],[7335,6],[7725,9]])it(`troop ${id}: rebuilding preserves source-backed cost ${cost}`,()=>expect(result.troops.find((t:{id:number})=>t.id===id)?.manaCost).toBe(cost));
 it('Hero’s Sword display actually says random enemy, not question marks',()=>expect(spellDescription(7585,'')).toBe('对一名随机敌人造成 [魔法 + 5] 点伤害。'));
 it('source rebuild retains all 1800 installed troops including two Chinese-snapshot gaps',()=>{expect(result.catalogueCount).toBe(1800);expect(result.supplementIds).toEqual([7932,7933]);});
 it('Eleanor rebuild preserves the first-Ally barrier clause',()=>expect(result.troops.find((t:{id:number;description:string})=>t.id===7334)?.description).toContain('\u5c4f\u969c'));
 it('Break Free displays its restored damage clause',()=>expect(spellDescription(9725,'')).toContain('对第一名敌人造成 [(魔法 / 2) + 4] 点伤害'));
 for(const [id,base] of [[1008,3],[1023,5]])it(`weapon ${id} rebuilt display preserves official first-two/no-red changes`,()=>{
  const w=result.rebuiltWeapons.find((w:{id:number})=>w.id===id);expect(w.spell.description).toBe(`对前两名敌人造成 [魔法 + ${base}] 点伤害。`);
 });

});
