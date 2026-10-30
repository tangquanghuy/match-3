import {describe,expect,it,vi} from 'vitest';
import {CURRENCY_GUARD_FLAG,CURRENCY_SEAL_FIELD,currencyGuardActive,currencySeal,reconcileCurrencyInPlace,sealCurrencyInPlace,sealedCurrency} from '../../src/sillytavern/currencySeal';
import {createCurrencyGuard} from '../../src/sillytavern/currencyGuard';
import type {GuardMvuData} from '../../src/sillytavern/currencyGuard';

type Stat=Record<string,unknown>;
const stat=(gold:unknown,extra:Stat={}):Stat=>({人物:{名称:'主角',背包:{通用币:gold,道具:{}}},...extra});
const sealed=(gold:number):Stat=>{const s=stat(gold);sealCurrencyInPlace(s);return s;};
const gold=(s:Stat)=>((s['人物'] as Stat)['背包'] as Stat)['通用币'];

describe('通用币 seal',()=>{
 it('seals the schema value and detects any change of value or code',()=>{
  const s=sealed(5144);expect(s[CURRENCY_SEAL_FIELD]).toEqual({值:5144,码:currencySeal(5144)});
  expect(sealedCurrency(s)).toBe(5144);
  expect(sealedCurrency({...s,[CURRENCY_SEAL_FIELD]:{值:999999,码:currencySeal(5144)}})).toBeUndefined();
  expect(currencySeal(1)).not.toBe(currencySeal(2));
 });
 it('puts a hand-edited balance back to the sealed value',()=>{
  const s=sealed(5144);((s['人物'] as Stat)['背包'] as Stat)['通用币']=9_999_999;
  expect(reconcileCurrencyInPlace(s)).toBe('restored');expect(gold(s)).toBe(5144);
  expect(reconcileCurrencyInPlace(s)).toBe('ok');
 });
 it('a removed or forged seal falls back to the latest intact seal of earlier floors',()=>{
  const deleted=stat(9_999_999);expect(reconcileCurrencyInPlace(deleted,()=>5144)).toBe('restored');expect(gold(deleted)).toBe(5144);
  const forged=stat(9_999_999,{[CURRENCY_SEAL_FIELD]:{值:9_999_999,码:'x'}});
  expect(reconcileCurrencyInPlace(forged,()=>5144)).toBe('restored');expect(sealedCurrency(forged)).toBe(5144);
 });
 it('a chat without any seal takes the current balance as its baseline',()=>{
  const s=stat(1_925_144);expect(reconcileCurrencyInPlace(s,()=>undefined)).toBe('baseline');expect(sealedCurrency(s)).toBe(1_925_144);
  expect(reconcileCurrencyInPlace(stat(10),()=>10)).toBe('sealed');
 });
 it('matches the card schema: decimals floor, a legacy 金币 field merges into 通用币',()=>{
  expect(sealedCurrency(sealed(12.9 as number))).toBe(12);
  const legacy=stat(100);((legacy['人物'] as Stat)['背包'] as Stat)['金币']=50;sealCurrencyInPlace(legacy);
  expect(sealedCurrency(legacy)).toBe(150);
 });
 it('treats the guard as running only while its heartbeat is fresh',()=>{
  expect(currencyGuardActive({})).toBe(false);
  expect(currencyGuardActive({[CURRENCY_GUARD_FLAG]:{version:'v1',at:1000}},5000)).toBe(true);
  expect(currencyGuardActive({[CURRENCY_GUARD_FLAG]:{version:'v1',at:1000}},20_000)).toBe(false);
 });
});

describe('通用币 guard',()=>{
 function floors(...stats:(Stat|undefined)[]){
  const data:GuardMvuData[]=stats.map(s=>s?{stat_data:structuredClone(s),schema:{}}:{});let busy=false;
  const write=vi.fn(async(id:number,next:GuardMvuData)=>{data[id]=structuredClone(next);});
  const guard=createCurrencyGuard({latestId:()=>data.length-1,read:id=>structuredClone(data[id]),write,busy:()=>busy});
  return {guard,write,data,setBusy:(v:boolean)=>{busy=v;}};
 }
 it('writes the latest floor back silently after a hand edit, and leaves an intact floor alone',async()=>{
  const tampered=sealed(5144);((tampered['人物'] as Stat)['背包'] as Stat)['通用币']=3_125_144;
  const f=floors(sealed(5000),tampered);
  expect(await f.guard.checkLatest()).toBe('restored');expect(gold(f.data[1]!.stat_data!)).toBe(5144);
  expect(f.data[1]!.schema).toEqual({});
  expect(await f.guard.checkLatest()).toBe('ok');expect(f.write).toHaveBeenCalledTimes(1);
 });
 it('the first seal of a chat also seals the floor before it, so a later deleted seal cannot reset the baseline',async()=>{
  const f=floors(stat(5000),undefined,stat(5320));
  expect(await f.guard.checkLatest()).toBe('baseline');
  expect(sealedCurrency(f.data[2]!.stat_data!)).toBe(5320);expect(sealedCurrency(f.data[0]!.stat_data!)).toBe(5000);
  const latest=f.data[2]!.stat_data!;delete latest[CURRENCY_SEAL_FIELD];((latest['人物'] as Stat)['背包'] as Stat)['通用币']=88_888_888;
  expect(await f.guard.checkLatest()).toBe('restored');expect(gold(f.data[2]!.stat_data!)).toBe(5000);
 });
 it('a chat sealed only on its latest floor gets the floor before it sealed once',async()=>{
  const f=floors(stat(5144),sealed(1_925_144));
  expect(await f.guard.checkLatest()).toBe('ok');expect(sealedCurrency(f.data[0]!.stat_data!)).toBe(5144);
  expect(await f.guard.checkLatest()).toBe('ok');expect(f.write).toHaveBeenCalledTimes(1);
 });
 it('restores from earlier floors when the seal was deleted, and waits while busy unless forced',async()=>{
  const f=floors(sealed(5000),undefined,stat(8_000_000));f.setBusy(true);
  expect(await f.guard.checkLatest()).toBe('skipped');expect(f.write).not.toHaveBeenCalled();
  expect(await f.guard.checkLatest(true)).toBe('restored');expect(gold(f.data[2]!.stat_data!)).toBe(5000);
 });
 it('fixes the base before AI commands apply and seals the AI result afterwards',()=>{
  const f=floors(sealed(5000));
  const base={stat_data:sealed(5000)};((base.stat_data['人物'] as Stat)['背包'] as Stat)['通用币']=900_000;
  f.guard.onUpdateStarted(base);expect(gold(base.stat_data)).toBe(5000);
  ((base.stat_data['人物'] as Stat)['背包'] as Stat)['通用币']=5320;// the AI's loot
  f.guard.onUpdateEnded(base);expect(sealedCurrency(base.stat_data)).toBe(5320);
  // Without a seal at update start the floor checks decide; nothing is changed here.
  const unsealed={stat_data:stat(7)};f.guard.onUpdateStarted(unsealed);expect(unsealed.stat_data[CURRENCY_SEAL_FIELD]).toBeUndefined();
 });
});
