import {describe,expect,it} from 'vitest';
import weapons from '../../src/data/weapons.json';
import {applyWeaponPurchase,formatCurrency,OWNED_WEAPONS_FIELD,ownedWeapons,universalCurrency,weaponOwned,weaponPrice} from '../../src/sillytavern/weaponShop';
import {partyWeaponChoices,prepareCurrentParty,STARTER_WEAPON} from '../../src/sillytavern/partyPreparation';
import type {HostSnapshot} from '../../src/sillytavern/hostAdapter';
import {stableJson} from '../../src/sillytavern/json';

const idOf=(rarity:string)=>`gw_${weapons.find(w=>w.rarity===rarity&&partyWeaponChoices().includes(`gw_${w.referenceName}`))!.referenceName}`;
const stat=(gold:unknown,owned?:string[])=>({人物:{背包:{通用币:gold,道具:{}}},...(owned?{[OWNED_WEAPONS_FIELD]:owned}:{})});

describe('weapon shop prices',()=>{
 it('opens 普通/精良/稀有 and prices 传说/史诗/神话/末日 as decided',()=>{
  expect(['Common','Uncommon','Rare'].map(r=>weaponPrice(idOf(r)))).toEqual([0,0,0]);
  expect(['UltraRare','Epic','Mythic','Doomed'].map(r=>weaponPrice(idOf(r)))).toEqual([600_000,1_200_000,2_000_000,3_000_000]);
  expect(weaponPrice(STARTER_WEAPON)).toBe(0);
  const free=partyWeaponChoices().filter(id=>weaponPrice(id)===0);
  expect(free).toHaveLength(51);
 });
 it('formats whole ten-thousands as 万',()=>{
  expect(formatCurrency(1_200_000)).toBe('120万');expect(formatCurrency(12_345)).toBe('12,345');
 });
});

describe('weapon purchase',()=>{
 const epic=idOf('Epic');
 it('deducts the price and records ownership in one new object',()=>{
  const before=stat(1_500_000);const next=applyWeaponPurchase(before,epic);
  expect(universalCurrency(next)).toBe(300_000);expect([...ownedWeapons(next)]).toEqual([epic]);
  expect(before.人物.背包.通用币).toBe(1_500_000);expect(OWNED_WEAPONS_FIELD in before).toBe(false);
  expect(weaponOwned(next,epic)).toBe(true);expect(weaponOwned(before,epic)).toBe(false);
 });
 it('rejects insufficient money, repeats, free weapons and unreadable balances',()=>{
  expect(()=>applyWeaponPurchase(stat(1_199_999),epic)).toThrow('通用币不足');
  expect(()=>applyWeaponPurchase(stat(5_000_000,[epic]),epic)).toThrow('已经购买');
  expect(()=>applyWeaponPurchase(stat(5_000_000),STARTER_WEAPON)).toThrow('无需购买');
  expect(()=>applyWeaponPurchase(stat('很多'),epic)).toThrow('读取不到');
  expect(()=>ownedWeapons({[OWNED_WEAPONS_FIELD]:'x'})).toThrow('格式有误');
 });
});

describe('party preparation honours ownership',()=>{
 const epic=idOf('Epic');
 const snapshot=(owned?:string[]):HostSnapshot=>{
  const statData={...stat(0,owned),人物:{名称:'主角',等级:20,生命值上限:200,当前生命值:200,临时生命值:0,AC:14,
   属性:{力量:16,敏捷:12,体质:14,智力:18,感知:12,魅力:10},背包:{通用币:0,道具:{}},
   战斗属性:{武器面板:{伤害骰:'2d6',等级系数:3,固定伤害:10},物理减伤:20,魔法减伤:0,每回合动作资源:{攻击次数:2}},
   装备列表:{长剑:{名称:'长剑',类型:'武器',部位:'主手',穿戴状态:'已装备'}}}};
  return {chat:{characterId:'c',chatId:'x'},messageId:0,swipeId:0,mvuScope:'message',fingerprint:stableJson(statData),statData} as unknown as HostSnapshot;
 };
 const heroWeapon=(owned?:string[])=>{
  const prep=prepareCurrentParty(snapshot(owned),{mode:'replay',weaponBindings:{'/人物/装备列表/长剑':epic}});
  return prep.candidates.find(c=>c.kind==='hero')!.weapon;
 };
 it('a registered but unbought weapon fights as the starter; buying it restores the binding',()=>{
  expect(heroWeapon()?.id).toBe(STARTER_WEAPON);
  expect(heroWeapon([epic])?.id).toBe(epic);
 });
});
