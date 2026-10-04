import { GEM_CHEST_WEIGHTS, GEM_CHEST_BASE } from '../../src/meta/data/economy';
import { describe,it,expect,vi,afterEach } from 'vitest';
import { TROOPS } from '../../src/data/troops';
import { SeededRNG } from '../../src/engine/rng';
import { newSave } from '../../src/meta/state/schema';
import { hydrateSave } from '../../src/meta/state/save';
import { openGemChest,openGoldChest,openGloryChest } from '../../src/meta/systems/gacha';
import { grantTroop } from '../../src/meta/systems/troopProgress';
import { validateWishlist,setWishlist,setPursuitTarget,recommendWishlist,hydrateWishlist,wishlistHitRate,purgeBlockedWishlist,WISHLIST_TROOPS } from '../../src/meta/systems/wishlist';
import { matchesTroopCatalog } from '../../src/meta/data/troopCatalog';
import { MockGateway,memoryStorage } from '../../src/meta/gateway';
const mythicRoll = (GEM_CHEST_WEIGHTS.slice(0, 5).reduce((a, b) => a + b, 0) + GEM_CHEST_WEIGHTS[5]! / 2) / GEM_CHEST_BASE;
const fresh=()=>newSave({now:0,currencies:{gems:100000,goldKeys:10,glory:10000}});
const mythics=TROOPS.filter(t=>t.rarityIdx===5);
const target=mythics[0]!,other=mythics[1]!;
const setup=()=>{const s=fresh();expect(setWishlist(s,[target.id,other.id]).ok).toBe(true);expect(setPursuitTarget(s,target.id).ok).toBe(true);return s;};
afterEach(()=>vi.restoreAllMocks());
describe('愿望单配额和持久化',()=>{
 it('旧档默认空名单，损坏名单去重并丢弃无效项',()=>{
  const s=fresh();const raw=JSON.parse(JSON.stringify(s));delete raw.gachaWishlist;
  expect(hydrateSave(raw).gachaWishlist.troopIds).toEqual([]);
  expect(hydrateWishlist({troopIds:[target.id,target.id,-1,TROOPS.find(t=>t.rarityIdx===0)!.id],pursuit:{targetId:-1,progress:-1}}).troopIds).toEqual([target.id]);
 });
 it('仅限制每档九人及总数，同王国同档可多选，失败原子化',()=>{
  const s=fresh();const ids=recommendWishlist(s);expect(ids).toHaveLength(27);expect(validateWishlist(ids)).toBeNull();
  for (const rarity of [3,4,5]) expect(ids.filter(id=>TROOPS.find(t=>t.id===id)?.rarityIdx===rarity)).toHaveLength(9);
  expect(setWishlist(s,ids).ok).toBe(true);const before=JSON.stringify(s);
  expect(setWishlist(s,[...ids,target.id]).ok).toBe(false);expect(JSON.stringify(s)).toBe(before);
  expect(validateWishlist([target.id,target.id])).not.toBeNull();
  const group=TROOPS.filter(t=>t.rarityIdx===3).reduce((map,t)=>{
    const key=t.kingdom??'无王国';map.set(key,[...(map.get(key)??[]),t.id]);return map;
  },new Map<string,number[]>());
  const same=[...group.values()].find(ids=>ids.length>=2)!;
  expect(same).toBeDefined();expect(validateWishlist(same.slice(0,2))).toBeNull();
  const other=TROOPS.filter(t=>t.rarityIdx===3&&!same.includes(t.id)).map(t=>t.id);
  const nine=[...same.slice(0,2),...other.slice(0,7)];
  expect(validateWishlist(nine)).toBeNull();expect(validateWishlist([...nine,other[7]!])).not.toBeNull();
  const distinct=[...new Map(mythics.map(t=>[t.kingdom,t])).values()];
  expect(distinct.length).toBeGreaterThan(9);
  expect(validateWishlist(distinct.slice(0,9).map(t=>t.id))).toBeNull();
 });
 it('旧档载入同一王国的多名角色，不丢失追寻进度',()=>{
  const group=[...new Map(mythics.map(t=>[t.kingdom,mythics.filter(x=>x.kingdom===t.kingdom)])).values()].find(ts=>ts.length>=2)!;
  expect(group).toBeDefined();
  const s=fresh();s.gachaWishlist.troopIds=group.slice(0,2).map(t=>t.id);
  s.gachaWishlist.pursuit.targetId=group[0]!.id;s.gachaWishlist.pursuit.progress=37;
  expect(hydrateSave(JSON.parse(JSON.stringify(s))).gachaWishlist).toEqual(s.gachaWishlist);
 });
 it.each([{completed:1,limit:250},{completed:2,limit:300},{completed:7,limit:300}])('旧400抽档升级第$completed次完成后的上限，保留目标与低进度',({completed,limit})=>{
  const s=setup();s.gachaWishlist.pursuit={targetId:target.id,progress:73,completed,limit:400};
  const restored=hydrateSave(JSON.parse(JSON.stringify(s)));
  expect(restored.gachaWishlist.pursuit).toEqual({targetId:target.id,progress:73,completed,limit});
  expect(hydrateSave(JSON.parse(JSON.stringify(restored))).gachaWishlist).toEqual(restored.gachaWishlist);
 });
 it.each([{completed:0,limit:400},{completed:1,limit:275},{completed:2,limit:250}])('保留非旧版后续400抽的合法快照 $completed/$limit',({completed,limit})=>{
  const s=setup();s.gachaWishlist.pursuit={targetId:target.id,progress:73,completed,limit};
  expect(hydrateSave(JSON.parse(JSON.stringify(s))).gachaWishlist).toEqual(s.gachaWishlist);
 });
 it('推荐补齐保留已选，重复执行稳定且通过所有配额',()=>{
  const s=fresh();const group=TROOPS.filter(t=>t.rarityIdx===3&&t.kingdom===target.kingdom).slice(0,2);
  setWishlist(s,[target.id,...group.map(t=>t.id)]);const ids=recommendWishlist(s);expect(ids).toEqual(expect.arrayContaining([target.id,...group.map(t=>t.id)]));expect(ids).toHaveLength(27);
  setWishlist(s,ids);expect(recommendWishlist(s)).toEqual(ids);expect(validateWishlist(ids)).toBeNull();
 });
 it('每一档只有1人时也仅占固定九分之一，空位不集中过去',()=>{
  const t=TROOPS.find(t=>t.rarityIdx===3)!;
  expect(wishlistHitRate([t.id],3)).toBeCloseTo(.8/9);
  expect(wishlistHitRate([target.id],5)).toBeCloseTo(1/9);
 });
 it('网关保存名单、追寻目标，重新加载不丢失',async()=>{
  const storage=memoryStorage();const g=new MockGateway(storage);await g.load();
  await g.setWishlist([target.id]);const r=await g.setPursuitTarget(target.id);expect(r.result.ok).toBe(true);
  const again=new MockGateway(storage);await again.load();expect(again.current().gachaWishlist).toEqual(g.current().gachaWishlist);
 });
});
describe('真实抽卡和神话首张追寻',()=>{
 it.each([{completed:1,progress:300,limit:250},{completed:2,progress:350,limit:300}])('旧400抽档超过新$limit抽阈值，重载后下一抽触发保底',({completed,progress,limit})=>{
  const old=setup();old.gachaWishlist.pursuit={targetId:target.id,progress,completed,limit:400};
  const s=hydrateSave(JSON.parse(JSON.stringify(old)));
  expect(s.gachaWishlist.pursuit).toEqual({targetId:target.id,progress:limit-1,completed,limit});
  vi.spyOn(SeededRNG.prototype,'next').mockReturnValue(0);
  const r=openGemChest(s,1);if(!r.ok)throw Error(r.message);
  expect(r.cards).toHaveLength(1);expect(r.cards[0]).toMatchObject({troopId:target.id,pursuitGuaranteed:true});
  expect(s.gachaWishlist.pursuit).toEqual({targetId:null,progress:0,completed:completed+1,limit:300});
  expect(s.gachaLog[0]!.audit!.reasons).toEqual(['pursuit']);
 });
 it('第二轮250抽完成后，第三轮按300抽保底',()=>{
  const s=setup();s.gachaWishlist.pursuit={targetId:target.id,progress:249,completed:1,limit:250};
  vi.spyOn(SeededRNG.prototype,'next').mockReturnValue(0);
  const second=openGemChest(s,1);if(!second.ok)throw Error(second.message);
  expect(second.cards[0]).toMatchObject({troopId:target.id,pursuitGuaranteed:true});
  expect(s.gachaWishlist.pursuit).toEqual({targetId:null,progress:0,completed:2,limit:300});
  expect(setPursuitTarget(s,other.id).ok).toBe(true);
  s.gachaWishlist.pursuit.progress=298;
  const before=openGemChest(s,2);if(!before.ok)throw Error(before.message);
  expect(before.cards[0]!.pursuitGuaranteed).toBe(false);expect(s.gachaWishlist.pursuit.progress).toBe(299);
  const third=openGemChest(s,3);if(!third.ok)throw Error(third.message);
  expect(third.cards[0]).toMatchObject({troopId:other.id,pursuitGuaranteed:true});
  expect(s.gachaWishlist.pursuit).toEqual({targetId:null,progress:0,completed:3,limit:300});
 });
 it('阈值替换本抽，仅发一张且完成后使用后续上限，审计经重载保留',()=>{
  const s=setup();s.gachaWishlist.pursuit.progress=199;vi.spyOn(SeededRNG.prototype,'next').mockReturnValue(0);
  const r=openGemChest(s,1);expect(r.ok).toBe(true);if(!r.ok)return;
  expect(r.cards).toHaveLength(1);expect(r.cards[0]).toMatchObject({troopId:target.id,pursuitGuaranteed:true,wishlistHit:true});
  expect(s.gachaWishlist.pursuit).toEqual({targetId:null,progress:0,completed:1,limit:250});
  expect(s.gachaLog[0]!.audit!.reasons).toEqual(['pursuit']);
  expect(hydrateSave(JSON.parse(JSON.stringify(s))).gachaLog[0]!.audit).toEqual(s.gachaLog[0]!.audit);
 });
 it('十连追寻优先于稀有保底，完成后的余下抽数暂停追寻',()=>{
  const s=setup();s.gachaWishlist.pursuit.progress=190;vi.spyOn(SeededRNG.prototype,'next').mockReturnValue(0);
  const r=openGemChest(s,1,10);if(!r.ok)throw Error(r.message);
  expect(r.cards).toHaveLength(10);expect(r.pityUsed).toBe(false);expect(r.cards[9]!.troopId).toBe(target.id);expect(s.gachaWishlist.pursuit.progress).toBe(0);
  const s2=setup();s2.gachaWishlist.pursuit.progress=199;const r2=openGemChest(s2,1,10);if(!r2.ok)throw Error(r2.message);
  expect(r2.cards[0]!.troopId).toBe(target.id);expect(r2.pityUsed).toBe(false);expect(s2.gachaWishlist.pursuit.progress).toBe(0);
 });
 it('自然命中完成，其他神话不清零',()=>{
  const s=setup();s.gachaWishlist.pursuit.progress=50;
  // 从当前概率表计算神话档中点，避开材料区间。
  const spy=vi.spyOn(SeededRNG.prototype,'next').mockReturnValueOnce(mythicRoll).mockReturnValueOnce(0).mockReturnValueOnce(.75);
  const r=openGemChest(s,1);if(!r.ok)throw Error(r.message);expect(r.cards[0]!.troopId).toBe(other.id);expect(s.gachaWishlist.pursuit.progress).toBe(51);
  spy.mockReset().mockReturnValueOnce(mythicRoll).mockReturnValueOnce(0).mockReturnValueOnce(0);
  const r2=openGemChest(s,2);if(!r2.ok)throw Error(r2.message);expect(r2.cards[0]!.troopId).toBe(target.id);expect(r2.cards[0]!.pursuitGuaranteed).toBe(false);expect(s.gachaWishlist.pursuit.completed).toBe(1);
 });
 it('未命中名单分支排除已选，不把空位概率偷偷分回已选',()=>{
  const s=fresh();setWishlist(s,[target.id]);vi.spyOn(SeededRNG.prototype,'next').mockReturnValueOnce(mythicRoll).mockReturnValueOnce(.9).mockReturnValueOnce(0);
  const r=openGemChest(s,1);if(!r.ok)throw Error(r.message);expect(r.cards[0]!.rarityIdx).toBe(5);expect(r.cards[0]!.troopId).not.toBe(target.id);
 });
 it('切换、移除、暂停保留进度和当轮快照；暂停抽卡不累计',()=>{
  const s=setup();s.gachaWishlist.pursuit.progress=88;s.gachaWishlist.pursuit.limit=250;
  setPursuitTarget(s,other.id);expect(s.gachaWishlist.pursuit).toMatchObject({targetId:other.id,progress:88,limit:250});
  setWishlist(s,[target.id]);expect(s.gachaWishlist.pursuit.targetId).toBeNull();openGemChest(s,8);expect(s.gachaWishlist.pursuit.progress).toBe(88);
  setPursuitTarget(s,target.id);expect(s.gachaWishlist.pursuit.limit).toBe(250);
 });
 it('真实已拥有目标不可追寻，外部获得后暂停并保留进度',()=>{
  const s=setup();s.gachaWishlist.pursuit.progress=30;grantTroop(s,target.id,1);expect(setPursuitTarget(s,target.id).ok).toBe(false);
  openGemChest(s,9);expect(s.gachaWishlist.pursuit).toMatchObject({targetId:null,progress:30});
  const s2=fresh();grantTroop(s2,target.id,1);s2.collectionTruth={};setWishlist(s2,[target.id]);expect(setPursuitTarget(s2,target.id).ok).toBe(true);
 });
 it('宝石不足或非法抽数无任何副作用；金币/荣耀不推进追寻',()=>{
  const s=setup();s.currencies.gems=0;const before=JSON.stringify(s);expect(openGemChest(s,1).ok).toBe(false);expect(openGemChest(s,1,7).ok).toBe(false);expect(JSON.stringify(s)).toBe(before);
  openGoldChest(s,1,10);openGloryChest(s,1,10);expect(s.gachaWishlist.pursuit.progress).toBe(0);expect(s.gachaLog.every(l=>!l.audit)).toBe(true);
 });
 it('相同初始存档与种子得到同样结果和审计',()=>{
  const a=setup(),b=setup();expect(openGemChest(a,452,10)).toEqual(openGemChest(b,452,10));expect(a.gachaLog[0]!.audit).toEqual(b.gachaLog[0]!.audit);
 });
});
it('图鉴共用编号、多词交集、王国、品质、颜色与种族过滤',()=>{
 expect(matchesTroopCatalog(target,{query:`${target.id} ${target.name}`,rarity:5,kingdom:target.kingdom,color:target.manaColors[0],type:target.troopTypes[0]})).toBe(true);
 expect(matchesTroopCatalog(target,{query:`${target.id} 不存在的词`})).toBe(false);
 expect(matchesTroopCatalog(target,{rarity:3})).toBe(false);
});

describe('blocked mythics wishlist migration', () => {
  const retired = [7736, 6529, 7393];
  it.each(retired)('removes %i from selection and retargets to the first unowned listed mythic', id => {
    const s = fresh();
    const candidates = mythics.filter(t => !retired.includes(t.id)).slice(0, 2);
    s.gachaWishlist.troopIds = [id, ...candidates.map(t => t.id)];
    s.gachaWishlist.pursuit = { targetId: id, progress: 73, completed: 1, limit: 250 };
    grantTroop(s, candidates[0]!.id, 1);
    const expected = candidates[1]!.id;
    expect(WISHLIST_TROOPS.some(t => t.id === id)).toBe(false);
    expect(validateWishlist([id])).not.toBeNull();
    expect(setWishlist(fresh(), [id]).ok).toBe(false);
    expect(purgeBlockedWishlist(s)).toBe(true);
    expect(purgeBlockedWishlist(s)).toBe(false);
    expect(s.gachaWishlist.troopIds).toEqual(candidates.map(t => t.id));
    expect(s.gachaWishlist.pursuit).toEqual({ targetId: expected, progress: 73, completed: 1, limit: 250 });
    const raw = JSON.parse(JSON.stringify(s));
    raw.gachaWishlist.troopIds.unshift(id);
    raw.gachaWishlist.pursuit.targetId = id;
    expect(hydrateSave(raw).gachaWishlist).toEqual(s.gachaWishlist);
  });
  it('keeps Ctharrasque available as a troop, but never in wishlist or pursuit', () => {
    const troop = TROOPS.find(t => t.id === 7393)!;
    expect(troop.name).toBe('\u514b\u5854\u62c9\u65af\u514b');
    expect(WISHLIST_TROOPS.some(t => t.id === troop.id)).toBe(false);
    const s = fresh();
    expect(setWishlist(s, [troop.id]).ok).toBe(false);
    s.gachaWishlist.troopIds = [troop.id]; // stale in-memory selection
    expect(setPursuitTarget(s, troop.id).ok).toBe(false);
    expect(recommendWishlist(fresh())).not.toContain(troop.id);
  });
  it('keeps progress but clears pursuit if no eligible mythic remains', () => {
    const s = fresh();
    s.gachaWishlist = { troopIds: [7736, 6529], pursuit: { targetId: 6529, progress: 32, completed: 0, limit: 200 } };
    expect(purgeBlockedWishlist(s)).toBe(true);
    expect(s.gachaWishlist).toEqual({ troopIds: [], pursuit: { targetId: null, progress: 32, completed: 0, limit: 200 } });
  });
});
