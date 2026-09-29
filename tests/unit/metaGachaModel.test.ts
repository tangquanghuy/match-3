import { describe,it,expect } from 'vitest';
import { BUDGET_SCENARIOS,gemBudget,forecastTarget,calibratePursuit,budgetDaysForGems,kingdomCampaignCapacity } from '../../src/meta/economy/gachaModel';
import { SeededRNG } from '../../src/engine/rng';
import { newSave } from '../../src/meta/state/schema';
import { openGemChest } from '../../src/meta/systems/gacha';
import { setWishlist } from '../../src/meta/systems/wishlist';
import { TROOPS } from '../../src/data/troops';
describe('宝石经济和抽卡模型',()=>{
 it('竞技场黄金报名与非宝石奖励不计入宝石预算',()=>{
  const b=gemBudget(BUDGET_SCENARIOS.standard!);expect(b.firstWin).toBe(350);expect(b.arenaRewards).toBe(0);expect(b.arenaFees).toBe(0);expect(b.netWeekly).toBe(350);
  const x=gemBudget({...BUDGET_SCENARIOS.standard!,otherWeeklySpending:100,gachaFraction:.5});expect(x.dailyGacha).toBeCloseTo(250*.5/7);
 });
 // 宝石箱对齐官方（2026-09-29）：传说 10.7% / 史诗 2% / 神话 0.2%（占全部开箱，含 20% 材料抽）
 it('名单指定卡传说平均约105抽、史诗约643抽；不把卡池总数用在名单内',()=>{
  expect(forecastTarget({rarity:3,batchSize:1}).meanFirst).toBeCloseTo(9/(.107*.8));
  expect(forecastTarget({rarity:4,batchSize:1}).meanFirst).toBeCloseTo(9/(.02*.7));
  expect(forecastTarget({rarity:5,batchSize:1}).meanFirst).toBeCloseTo(4500);
  expect(forecastTarget({rarity:3,selectedCount:1}).naturalPerPull).toBe(forecastTarget({rarity:3,selectedCount:9}).naturalPerPull);
 });
 it('按十连付费比命中位置略高，分位数按整批付费',()=>{
  const f=forecastTarget({rarity:3});expect(f.meanFirst).toBeCloseTo(9/(.107*.8));expect(f.meanPaid).toBeGreaterThan(f.meanFirst);expect(f.p90Paid%10).toBe(0);
  const q=1-.107*.8/9;expect(q**f.p90Paid).toBeLessThanOrEqual(.1);expect(q**(f.p90Paid-10)).toBeGreaterThan(.1);
 });
 it('首次追寻截断分布正确，已有199进度只需再付单抽或一组十连',()=>{
  const f=forecastTarget({rarity:5,pursuitRemaining:200,batchSize:1});expect(f.meanFirst).toBeCloseTo((1-(1-1/4500)**200)/(1/4500));expect(f.p90Paid).toBe(200);
  expect(forecastTarget({rarity:5,pursuitRemaining:1}).meanPaid).toBe(10);expect(forecastTarget({rarity:5,pursuitRemaining:1,batchSize:1}).meanPaid).toBe(1);
 });
 it('零或负净收入不伪造可达日期；一次性库存与持续收入分开',()=>{
  const b={...BUDGET_SCENARIOS.light!,otherWeeklySpending:9999};expect(gemBudget(b).dailyGacha).toBe(0);expect(forecastTarget({rarity:3,budget:b}).budgetEquivalentDays).toBe(Infinity);
  expect(calibratePursuit(30,b)).toBeNull();expect(forecastTarget({rarity:3,budget:{...b,startingGems:1000000}}).budgetEquivalentDays).toBe(0);
 });
 it('翻倍收入不改抽数，预算天数减半；改价格或权重可以重新建模',()=>{
  const b={...BUDGET_SCENARIOS.light!,arenaRuns:0};const a=forecastTarget({rarity:3,budget:b});const c=forecastTarget({rarity:3,budget:{...b,firstWinDays:6}});expect(a.meanPaid).toBe(c.meanPaid);expect(c.budgetEquivalentDays).toBeCloseTo(a.budgetEquivalentDays/2);
  expect(forecastTarget({rarity:3,multiCost:3000}).meanGems).toBeCloseTo(a.meanGems*2);
  expect(forecastTarget({rarity:3,weights:[0,0,0,1,0,0],batchSize:1}).meanFirst).toBeCloseTo(9/.8);
 });
 it('稀有十连保底依赖状态的精确期望区别于边际概率倒数',()=>{
  const f=forecastTarget({rarity:2,selected:false,selectedCount:0,weights:[1,0,0,0,0,0]});expect(f.meanFirst).toBeCloseTo(f.pool*10);expect(f.meanPaid).toBeCloseTo(f.pool*10);
  expect(forecastTarget({rarity:3,weights:[1,0,0,0,0,0]}).meanPaid).toBe(Infinity);
 });
 it('活动里程碑、守土上限、入侵结算、寻宝终盘共享实际奖励表',()=>{
  const b=gemBudget({...BUDGET_SCENARIOS.light!,eventPoints:{invasion:2200,worldEvent:200},successfulDefenses:999,invasionDistribution:[.2,.5,.2,.1],hunt:{runs:2,meanFinalBoard:[60,0,0,0,0,2,1,1]}});
  expect(b.events).toBe(600+600+80);expect(b.invasion).toBe(0);expect(b.hunt).toBeCloseTo(2*(2*.25+.4+.5));
  expect(()=>gemBudget({...BUDGET_SCENARIOS.light!,hunt:{runs:1,meanFinalBoard:[1]}})).toThrow();
  expect(()=>gemBudget({...BUDGET_SCENARIOS.light!,invasionDistribution:[1,1,1,1]})).toThrow();
 });
 it('参数异常显式报错',()=>{
  expect(()=>gemBudget({...BUDGET_SCENARIOS.light!,arenaDistribution:[1,1,1,1]})).toThrow();expect(()=>forecastTarget({rarity:3,selectedCount:0})).toThrow();expect(()=>forecastTarget({rarity:3,pursuitRemaining:200})).toThrow();
 });
 it('独立种子模拟与真实运行逻辑的指定传说首获均值吻合',()=>{
  const t=TROOPS.find(t=>t.rarityIdx===3)!;const rng=new SeededRNG(92323);let total=0;const n=1600;
  for(let i=0;i<n;i++) {const s=newSave({now:0,currencies:{gems:10000000}});setWishlist(s,[t.id]);let pulls=0;
    for(;;){const r=openGemChest(s,rng.nextInt(0x7fffffff),10);pulls+=10;if(!r.ok)throw Error(r.message);if(r.cards.some(c=>c.troopId===t.id))break;}
    total+=pulls;
  }
  const expected=forecastTarget({rarity:3}).meanPaid;expect(Math.abs(total/n-expected)/expected).toBeLessThan(.08);
 });
});

describe('首通宝石有限预算', () => {
 const empty = { ...BUDGET_SCENARIOS.standard!, firstWinDays: 0, arenaRuns: 0 };
 it('首通收入不冒充永久周薪；本周首通量受剩余关数限制', () => {
   const b = { ...empty, kingdomProgress: { remaining: { normal: 2, hard: 1, veryHard: 1 }, weeklyClears: { normal: 7, hard: 7, veryHard: 7 } } };
   const report = gemBudget(b);
   expect(report.netWeekly).toBe(0);
   expect(report.weeklyPulls).toBe(0);
   expect(report.kingdom.firstWeekGems).toBe(700);
   expect(report.kingdom.remainingGems).toBe(700);
   expect(report.firstWeekGachaGems).toBe(700);
   expect(budgetDaysForGems(600, b)).toBeCloseTo(1);
   expect(budgetDaysForGems(700, b)).toBeCloseTo(2);
   expect(budgetDaysForGems(701, b)).toBe(Infinity);
   expect(calibratePursuit(60, b)).toBeNull();
 });
 it('多难度分别耗尽，与持续收入、库存和抽卡分配比例共同换算', () => {
   const b = { ...empty, otherWeeklyIncome: 70, startingGems: 20, gachaFraction: .5,
     kingdomProgress: { remaining: { normal: 7, hard: 2 }, weeklyClears: { normal: 7, hard: 7 } } };
   // 前两天每天新增(100+200+10)*50%=155，之后五天55，再往后5。
   expect(budgetDaysForGems(20, b)).toBe(0);
   expect(budgetDaysForGems(330, b)).toBeCloseTo(2);
   expect(budgetDaysForGems(605, b)).toBeCloseTo(7);
   expect(budgetDaysForGems(615, b)).toBeCloseTo(9);
   expect(forecastTarget({rarity:5, batchSize:1, pursuitRemaining:1, budget:b}).budgetEquivalentDays).toBeCloseTo(130/155);
   expect(budgetDaysForGems(21, { ...b, gachaFraction: 0 })).toBe(Infinity);
 });
 it('每周其它支出先抵扣首通收入，预算耗尽后不伪造长期可达日期', () => {
   const b = { ...empty, otherWeeklySpending: 140,
     kingdomProgress: { remaining: { normal: 7 }, weeklyClears: { normal: 7 } } };
   expect(gemBudget(b).firstWeekGachaGems).toBe(560);
   expect(budgetDaysForGems(560, b)).toBeCloseTo(7);
   expect(budgetDaysForGems(561, b)).toBe(Infinity);
 });
 it('剩余首通不等于库存，零推图速度不预支奖励；验证关数与难度', () => {
   const b = { ...empty, kingdomProgress: { remaining: { veryHard: 1 }, weeklyClears: {} } };
   expect(gemBudget(b).kingdom.remainingGems).toBe(300);
   expect(gemBudget(b).kingdom.reachableGems).toBe(0);
   expect(budgetDaysForGems(1, b)).toBe(Infinity);
   for (const remaining of [-1, 1.5, 100000, NaN]) {
     expect(() => gemBudget({ ...empty, kingdomProgress: { remaining: { normal: remaining }, weeklyClears: {} } })).toThrow();
   }
   expect(() => gemBudget({ ...empty, kingdomProgress: { remaining: {}, weeklyClears: { hard: -1 } } })).toThrow();
 });
 it('全地图总量来自真实王国数量、关数和奖励表', () => {
   const campaign = kingdomCampaignCapacity();
   expect(campaign.totalGems).toBe(campaign.byDifficulty[0]!.kingdoms * 2300);
   expect(campaign.equivalentPulls).toBe(campaign.totalGems / 150);
 });
});

it('weekly invasion rank income is explicitly budgeted and capped at 6000', () => {
  expect(gemBudget({...BUDGET_SCENARIOS.light!, invasionWeeklyVp:8000}).invasion).toBe(6000);
  expect(gemBudget({...BUDGET_SCENARIOS.light!, invasionWeeklyVp:999999}).invasion).toBe(6000);
  expect(gemBudget({...BUDGET_SCENARIOS.light!, invasionWeeklyVp:0}).invasion).toBe(50);
  expect(() => gemBudget({...BUDGET_SCENARIOS.light!, invasionWeeklyVp:-1})).toThrow();
});
