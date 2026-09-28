import { describe, expect, it } from 'vitest';
import { newSave } from '../../src/meta/state/schema';
import { migrateSave, SaveStore } from '../../src/meta/state/save';
import { weekStartOf } from '../../src/meta/gateway/clock';
import { buildDemoSave, MockGateway, memoryStorage } from '../../src/meta/gateway';
import { EVENT_SHOP, EVENT_TYPES } from '../../src/meta/data/events';
import { eventShopPeriodOf } from '../../src/meta/systems/eventShopClock';
import { buyEventGoods, ensureEventWeek, eventShopOf } from '../../src/meta/systems/events';

const at = (day: number, hour = 0) => new Date(2026, 8, day, hour).getTime();
const NOW = at(24, 12);
const WEEK = weekStartOf(NOW);
const fresh = () => { const s = newSave({now:NOW,starterTroopIds:[6000,6097,6457]}); s.hero.level = 20; return s; };
const shopAt = (save: ReturnType<typeof fresh>, now: number, type = 'invasion' as const) => eventShopOf(save,weekStartOf(now),type,now);
const purchase = (save: ReturnType<typeof fresh>, id: string, now: number) => buyEventGoods(save,id,weekStartOf(now),'invasion',now);

describe('两天商店独立周期', () => {
  it('连续两天零点刷新，登录、月界及周一不会重开周期', () => {
    const period = eventShopPeriodOf(NOW);
    expect(period).toMatchObject({start:at(24),end:at(26)});
    expect(eventShopPeriodOf(period.end-1)).toEqual(period);
    expect(eventShopPeriodOf(period.end).start).toBe(at(26));
    expect(eventShopPeriodOf(at(20,23))).toEqual(eventShopPeriodOf(at(21,12)));
    for(const day of [1,28,30,31,60]) {
      const p = eventShopPeriodOf(at(day));
      expect(new Date(p.start).getHours()).toBe(0);
      expect(eventShopPeriodOf(p.end).index).toBe(p.index+1);
      expect(eventShopPeriodOf(p.end-1).start).toBe(p.start);
    }
  });

  it('售罄后到点补货，不动活动进度、印记余额和周产出额度', () => {
    const save=fresh();
    const week=ensureEventWeek(save,WEEK,'invasion');
    Object.assign(week,{tokens:100,tokensEarned:360,points:120,wins:8,claimed:[0],playRewards:2});
    const shop=shopAt(save,NOW);
    const goods=shop.rows.find(row=>row.goods.troopRole)!.goods;
    expect(purchase(save,goods.id,NOW)).toMatchObject({ok:true,stockLeft:0,tokensLeft:40});
    const snapshot=structuredClone(save.eventWeeks);
    expect(purchase(save,goods.id,shop.period.end-1)).toMatchObject({ok:false,code:'SOLD_OUT'});
    expect(shopAt(save,shop.period.end).rows.find(row=>row.goods.id===goods.id)?.stockLeft).toBe(1);
    expect(save.eventWeeks).toEqual(snapshot);
    expect(shopAt(save,shop.period.end).rows.find(row=>row.goods.id===goods.id)?.stockLeft).toBe(1);
    expect(purchase(save,goods.id,shop.period.end)).toMatchObject({ok:false,code:'INSUFFICIENT'});
  });

  it('周一清活动账本，但跨周同一期货品及限购记录不变', () => {
    const save=fresh(), sunday=at(20,12), monday=at(21,12);
    ensureEventWeek(save,weekStartOf(sunday),'invasion').tokens=100;
    const old=shopAt(save,sunday);
    const goods=old.rows.find(row=>row.goods.troopRole)!.goods;
    expect(purchase(save,goods.id,sunday).ok).toBe(true);
    const next=shopAt(save,monday);
    expect(next.period).toEqual(old.period);
    expect(next.rows.map(row=>row.goods)).toEqual(old.rows.map(row=>row.goods));
    expect(next.rows.find(row=>row.goods.id===goods.id)?.stockLeft).toBe(0);
    expect(next.week.tokens).toBe(0);
    expect(next.week.tokensEarned).toBe(0);
    expect(next.week.bought).toEqual({});
  });

  it('六店独立库存、跨多期离线只补当前一期，精选角色按期轮换', () => {
    const save=fresh();
    for(const {id:type} of EVENT_TYPES) {
      const week=ensureEventWeek(save,WEEK,type); week.tokens=100;
      const shop=eventShopOf(save,WEEK,type,NOW);
      const goods=shop.rows.find(row=>row.goods.stock===1&&!row.goods.classXp)!.goods;
      expect(buyEventGoods(save,goods.id,WEEK,type,NOW).ok).toBe(true);
      const same=eventShopOf(save,WEEK,type,at(25,22));
      expect(same.rows.find(row=>row.goods.id===goods.id)?.stockLeft).toBe(0);
      const future=eventShopOf(save,weekStartOf(at(30)),type,at(30));
      expect(future.rows.find(row=>row.goods.id===goods.id)?.stockLeft).toBe(goods.stock);
    }
    const a=shopAt(fresh(),NOW).rows.find(row=>row.goods.troopRole)!.goods.troopId;
    const b=shopAt(fresh(),at(26)).rows.find(row=>row.goods.troopRole)!.goods.troopId;
    expect(b).not.toBe(a);
    expect(shopAt(fresh(),at(25)).rows.find(row=>row.goods.troopRole)!.goods.troopId).toBe(a);
  });

  it('旧档当期已购保留；新账本读写后不重复补货', () => {
    const save=fresh();
    const goods=EVENT_SHOP.invasion.find(goods=>goods.stock===1)!;
    const week=ensureEventWeek(save,WEEK,'invasion'); week.bought[goods.id]=1;
    const raw=JSON.parse(JSON.stringify(save)); delete raw.eventShops;
    const legacy=migrateSave(raw);
    expect(shopAt(legacy,NOW).rows.find(row=>row.goods.id===goods.id)?.stockLeft).toBe(0);
    const loaded=migrateSave(JSON.parse(JSON.stringify(legacy)));
    expect(loaded.eventShops).toEqual(legacy.eventShops);
    expect(shopAt(loaded,at(25)).rows.find(row=>row.goods.id===goods.id)?.stockLeft).toBe(0);
    expect(shopAt(loaded,at(26)).rows.find(row=>row.goods.id===goods.id)?.stockLeft).toBe(1);
    const again=migrateSave(JSON.parse(JSON.stringify(loaded)));
    expect(shopAt(again,at(26)).rows.find(row=>row.goods.id===goods.id)?.stockLeft).toBe(1);
  });

  it('跨期旧货架购买请求不扣币、不发新角色', () => {
    const save=fresh(); ensureEventWeek(save,WEEK,'invasion').tokens=100;
    const shop=shopAt(save,NOW), goods=shop.rows.find(row=>row.goods.troopRole)!.goods;
    const before=structuredClone(save);
    expect(buyEventGoods(save,goods.id,WEEK,'invasion',shop.period.end,shop.period.start)).toMatchObject({ok:false,code:'INVALID'});
    expect(save).toEqual(before);
  });

  it('网关按服务器时钟结算，持久化两天库存而非按周一判断', async () => {
    const storage=memoryStorage();
    // 夹具直接写进存储介质（客户端副本改了不算数）
    const seeded=buildDemoSave(NOW); ensureEventWeek(seeded,WEEK,'invasion').tokens=200;
    new SaveStore(storage).persist(seeded);
    let clock=NOW;
    const gw=new MockGateway(storage,{now:()=>clock});
    await gw.load();
    const goods=EVENT_SHOP.invasion.find(goods=>goods.stock===1)!;
    const period=eventShopPeriodOf(NOW);
    expect((await gw.buyEventGoods(goods.id,'invasion',period.start)).result.ok).toBe(true);
    clock=at(25);
    expect((await gw.buyEventGoods(goods.id,'invasion',period.start)).result).toMatchObject({ok:false,code:'SOLD_OUT'});
    clock=at(26);
    expect((await gw.buyEventGoods(goods.id,'invasion',eventShopPeriodOf(at(26)).start)).result.ok).toBe(true);
    const loaded=(await new MockGateway(storage,{now:()=>clock}).load()).save;
    expect(loaded.eventShops.invasion).toMatchObject({periodStart:at(26),bought:{[goods.id]:1}});
    expect(loaded.eventWeeks.invasion?.tokens).toBe(80);
  });
});
