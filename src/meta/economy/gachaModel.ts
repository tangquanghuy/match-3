import { INVASION_RANKS } from '../data/invasionRanks';
import { EVENT_MILESTONES, EVENT_DEFENSE_REWARD, EVENT_WEEKLY_PLAY_REWARD_CAP, EVENT_SHARED_GOALS, type EventTypeId } from '../data/events';
import { HUNT_EXPECTED_GEMS, HUNT_CELLS } from '../systems/treasureHunt';
/** 经济预算与抽卡共用运行参数。输出为情景估计，不按玩家收入修改概率。 */
import { DAILY_FIRST_WIN_GEMS, KINGDOM_FIRST_CLEAR_GEMS, GEM_CHEST, GEM_CHEST_WEIGHTS, GACHA_PITY_MIN_IDX } from '../data/economy';
import { GACHA_RULES } from '../data/gachaRules';
import { TROOPS } from '../../data/troops';
import { KINGDOM_ORDER, KINGDOM_STAGE_COUNTS, type KingdomStageMode } from '../data/kingdoms';

export interface KingdomProgressBudget {
  /** 尚未领取首通奖励的关数，不是总胜场；按难度分别填写。 */
  remaining: Partial<Record<KingdomStageMode, number>>;
  /** 每周预计新增首通关数，只持续到对应难度剩余关卡耗尽。 */
  weeklyClears: Partial<Record<KingdomStageMode, number>>;
}
const STAGE_MODES = ['normal', 'hard', 'veryHard'] as const;
export function kingdomCampaignCapacity() {
  const byDifficulty = STAGE_MODES.map(mode => ({ mode,
    kingdoms: KINGDOM_ORDER.length, stagesPerKingdom: KINGDOM_STAGE_COUNTS[mode],
    stages: KINGDOM_ORDER.length * KINGDOM_STAGE_COUNTS[mode], gemsPerClear: KINGDOM_FIRST_CLEAR_GEMS[mode],
    totalGems: KINGDOM_ORDER.length * KINGDOM_STAGE_COUNTS[mode] * KINGDOM_FIRST_CLEAR_GEMS[mode],
  }));
  const totalGems = byDifficulty.reduce((sum, row) => sum + row.totalGems, 0);
  return { byDifficulty, totalGems, equivalentPulls: totalGems / GEM_CHEST.singleCost };
}
function kingdomProgressBudget(progress?: KingdomProgressBudget) {
  for (const input of [progress?.remaining, progress?.weeklyClears]) {
    if (input && Object.keys(input).some(key => !STAGE_MODES.includes(key as KingdomStageMode))) throw new Error('王国首通难度无效');
  }
  const byDifficulty = STAGE_MODES.map(mode => {
    const remaining = progress?.remaining[mode] ?? 0;
    const weeklyClears = progress?.weeklyClears[mode] ?? 0;
    const capacity = KINGDOM_ORDER.length * KINGDOM_STAGE_COUNTS[mode];
    if (!Number.isSafeInteger(remaining) || remaining < 0 || remaining > capacity
      || !Number.isFinite(weeklyClears) || weeklyClears < 0 || weeklyClears > capacity) throw new Error('王国首通预算参数无效');
    return { mode, remaining, weeklyClears, gemsPerClear: KINGDOM_FIRST_CLEAR_GEMS[mode] };
  });
  return { byDifficulty,
    firstWeekGems: byDifficulty.reduce((sum, r) => sum + Math.min(r.remaining, r.weeklyClears) * r.gemsPerClear, 0),
    remainingGems: byDifficulty.reduce((sum, r) => sum + r.remaining * r.gemsPerClear, 0),
    reachableGems: byDifficulty.reduce((sum, r) => sum + (r.weeklyClears > 0 ? r.remaining * r.gemsPerClear : 0), 0),
  };
}
/** 计划胜场模型：显式给胜场、失败场次、单场时长；不把估计当作玩家实测。 */
export interface EventParticipation {
  wins: number; losses?: number; minutesPerBattle?: number;
  matchingTroops?: number; route?: 'standard' | 'risk';
  /** 试炼估计的连胜长度，默认1（不假定完美连胜）。 */
  streakLength?: number;
}
export function projectEventParticipation(type: EventTypeId, p: EventParticipation) {
  const losses = p.losses ?? 0, minutes = p.minutesPerBattle ?? 3, matches = p.matchingTroops ?? 0;
  const streakLength = p.streakLength ?? 1;
  if (![p.wins, losses, matches, streakLength].every(Number.isSafeInteger) || p.wins < 0 || losses < 0
    || (p.route !== undefined && p.route !== 'standard' && p.route !== 'risk')
    || !Object.hasOwn(EVENT_MILESTONES, type)
    || matches < 0 || matches > 4 || streakLength < 1 || !Number.isFinite(minutes) || minutes <= 0)
    throw new Error('活动参与预算无效');
  let metric = p.wins * 100;
  if (type === 'worldEvent') metric = p.wins * ((p.route === 'risk' ? 11 : 7) + matches);
  else if ((type === 'invasion' || type === 'factionAssault') && p.route === 'risk') metric = p.wins * 120;
  else if (type === 'classTrials') {
    // 四连胜之后每场200分；按指定连胜长度分段，不假设失败具体发生顺序。
    const mult = (i: number) => [1, 1.3, 1.6, 2][Math.min(i, 3)]!;
    const cycle = Math.min(streakLength, p.wins);
    if (cycle > 0) {
      const block = (n: number) => Array.from({length: Math.min(n,4)}, (_,i) => Math.min(240, Math.round(100 * mult(i) * (p.route === 'risk' ? 1.25 : 1)))).reduce((a,b)=>a+b,0)
        + Math.max(0,n-4) * (p.route === 'risk' ? 240 : 200);
      metric = Math.floor(p.wins / cycle) * block(cycle) + block(p.wins % cycle);
    }
  }
  return { metric, wins: p.wins, minutes: (p.wins + losses) * minutes,
    gems: EVENT_MILESTONES[type].filter(m => metric >= m.points).reduce((sum,m) => sum + (m.gems ?? 0),0) };
}
export interface GemBudget {
  kingdomProgress?: KingdomProgressBudget;
  /** 以下可选来源只有显式设置才计入，避免默认假定满活跃/全胜。 */
  eventPoints?: Partial<Record<EventTypeId, number>>; // 兼容旧输入；worldEvent 的单位是物资
  eventParticipation?: Partial<Record<EventTypeId, EventParticipation>>;
  /** 使用显式进度而非胜场模型时，可单独给共享周胜场；避免从积分反推造成虚增。 */
  eventWeeklyWins?: number;
  successfulDefenses?: number;
  invasionWeeklyVp?: number; // Expected weekly earned VP, all reached rewards claimed.
  invasionDistribution?: readonly number[]; // Legacy input retained for report compatibility; use invasionWeeklyVp for rank income.
  hunt?: { runs: number; meanFinalBoard: readonly number[] }; // 八档终盘物件均数，总和64
  firstWinDays: number; arenaRuns: number; arenaDistribution: readonly number[];
  otherWeeklyIncome: number; otherWeeklySpending: number; gachaFraction: number; startingGems: number;
}
/** 示例假设，非玩家统计；其他玩法收入需设计师显式填写。 */
export const BUDGET_SCENARIOS: Record<string, GemBudget> = {
  light: { firstWinDays: 3, arenaRuns: 1, arenaDistribution: [.3,.25,.2,.1,.08,.05,.02], otherWeeklyIncome: 0, otherWeeklySpending: 0, gachaFraction: 1, startingGems: 0 },
  standard: { firstWinDays: 7, arenaRuns: 3, arenaDistribution: [.1,.15,.2,.2,.15,.1,.1], otherWeeklyIncome: 0, otherWeeklySpending: 0, gachaFraction: 1, startingGems: 0 },
  active: { firstWinDays: 7, arenaRuns: 7, arenaDistribution: [.03,.07,.1,.15,.2,.2,.25], otherWeeklyIncome: 0, otherWeeklySpending: 0, gachaFraction: 1, startingGems: 0 },
};
// 活动重做后的示例假设；旧情景保留为“不参与活动”的对照组。
Object.assign(BUDGET_SCENARIOS, {
  weeklyLight: { ...BUDGET_SCENARIOS.light!, eventParticipation: {
    invasion: { wins: 6, losses: 1 }, factionAssault: { wins: 6, losses: 1 },
  }, successfulDefenses: 2 },
  weeklyStandard: { ...BUDGET_SCENARIOS.standard!, eventParticipation: {
    invasion: { wins: 9, losses: 2 }, factionAssault: { wins: 9, losses: 2 },
    worldEvent: { wins: 9, matchingTroops: 2, losses: 1 }, classTrials: { wins: 3, streakLength: 3, losses: 1 },
  }, successfulDefenses: 3 },
  weeklyFull: { ...BUDGET_SCENARIOS.standard!, eventParticipation: {
    invasion: { wins: 12, losses: 2 }, raidBoss: { wins: 9, losses: 6, minutesPerBattle: 5 },
    towerOfDoom: { wins: 9, losses: 3 }, factionAssault: { wins: 9, losses: 2 },
    worldEvent: { wins: 10, losses: 2 }, classTrials: { wins: 6, route: 'risk', streakLength: 6, losses: 1 },
  }, successfulDefenses: 4 },
} satisfies Record<string, GemBudget>);
export function gemBudget(b: GemBudget) {
  const nums = [b.firstWinDays,b.arenaRuns,b.otherWeeklyIncome,b.otherWeeklySpending,b.gachaFraction,b.startingGems,...b.arenaDistribution];
  if (nums.some(n => !Number.isFinite(n) || n < 0) || b.firstWinDays > 7 || b.gachaFraction > 1
    || b.arenaDistribution.length !== 7 || Math.abs(b.arenaDistribution.reduce((a,c)=>a+c,0)-1) > 1e-8) throw new Error('宝石预算参数无效');
  const validDistribution = (d: readonly number[], n: number) => d.length===n && d.every(v=>Number.isFinite(v)&&v>=0) && Math.abs(d.reduce((a,c)=>a+c,0)-1)<1e-8;
  let events=0, modeledWins=0, eventMinutes=0;
  for (const [id, participation] of Object.entries(b.eventParticipation ?? {})) {
    if (!Object.hasOwn(EVENT_MILESTONES, id) || !participation || b.eventPoints?.[id as EventTypeId] !== undefined)
      throw new Error('活动参与预算与显式进度重复或类型无效');
    const projected = projectEventParticipation(id as EventTypeId, participation);
    events += projected.gems; modeledWins += projected.wins; eventMinutes += projected.minutes;
  }
  const weeklyWins = b.eventWeeklyWins ?? modeledWins;
  if (!Number.isSafeInteger(weeklyWins) || weeklyWins < 0 || weeklyWins < modeledWins) throw new Error('共享周胜场无效');
  const eventShared = EVENT_SHARED_GOALS.filter(g => weeklyWins >= g.wins).reduce((sum,g)=>sum+g.gems,0);
  events += eventShared;
  for (const [type, points] of Object.entries(b.eventPoints??{})) {
    if (!Object.hasOwn(EVENT_MILESTONES, type) || !Number.isFinite(points) || points<0) throw new Error('活动积分预算无效');
    events += EVENT_MILESTONES[type as EventTypeId].filter(m=>points>=m.points).reduce((sum,m)=>sum+(m.gems??0),0);
  }
  const defenses=b.successfulDefenses??0;
  if(!Number.isFinite(defenses)||defenses<0)throw new Error('守土次数预算无效');
  events+=Math.min(defenses,EVENT_WEEKLY_PLAY_REWARD_CAP.invasion)*EVENT_DEFENSE_REWARD.gems;
  const rankVp=b.invasionWeeklyVp;
  if(rankVp!==undefined && (!Number.isFinite(rankVp)||rankVp<0))throw new Error('入侵周 VP 预算无效');
  const invasion=rankVp===undefined?0:INVASION_RANKS.filter(r=>r.vp<=rankVp).reduce((sum,r)=>sum+r.gems,0);
  if(b.invasionDistribution) {
    if(!validDistribution(b.invasionDistribution,4))throw new Error('入侵周结算概率无效');
  }
  let hunt=0;
  if(b.hunt) {
    const {runs,meanFinalBoard:board}=b.hunt;
    if(!Number.isFinite(runs)||runs<0||board.length!==8||board.some(v=>!Number.isFinite(v)||v<0)||Math.abs(board.reduce((a,c)=>a+c,0)-HUNT_CELLS)>1e-8)throw new Error('寻宝终盘预算无效');
    hunt=runs*board.reduce((sum,n,tier)=>sum+n*HUNT_EXPECTED_GEMS[tier]!,0);
  }
  const kingdom = kingdomProgressBudget(b.kingdomProgress);
  const firstWin = b.firstWinDays * DAILY_FIRST_WIN_GEMS;
  const arenaRewards = 0; // Official Arena rewards no gems.
  const arenaFees = 0; // Entry is paid in gold.
  const netWeekly = firstWin + arenaRewards + events + invasion + hunt + b.otherWeeklyIncome - arenaFees - b.otherWeeklySpending;
  const dailyGacha = Math.max(0,netWeekly)*b.gachaFraction/7;
  return { firstWin, arenaRewards, arenaFees, events, eventShared, eventMinutes, invasion, hunt, netWeekly, dailyGacha,
    weeklyPulls: dailyGacha*7/GEM_CHEST.singleCost, kingdom,
    firstWeekGachaGems: Math.max(0, netWeekly + kingdom.firstWeekGems)*b.gachaFraction,
  };
}
/** 按均匀推图速度累计有限首通收入；逐段求首次达到预算的日期，不永久外推首通收入。 */
export function budgetDaysForGems(gems: number, budget: GemBudget): number {
  const net = gemBudget(budget);
  if (gems <= budget.startingGems) return 0;
  const rows = net.kingdom.byDifficulty.filter(r => r.weeklyClears > 0 && r.remaining > 0);
  const boundaries = [...new Set(rows.map(r => r.remaining / r.weeklyClears * 7))].sort((a, b) => a - b);
  const cashAt = (days: number) => budget.startingGems + Math.max(0,
    net.netWeekly / 7 * days + rows.reduce((sum, r) =>
      sum + Math.min(r.remaining, days / 7 * r.weeklyClears) * r.gemsPerClear, 0)) * budget.gachaFraction;
  let start = 0;
  for (const end of boundaries) {
    const finishCash = cashAt(end);
    if (finishCash >= gems) {
      // 未截零的原始现金流在每段内线性；目标高于起始库存，解原始直线即可。
      const rawCash = (days: number) => budget.startingGems + (
        net.netWeekly / 7 * days + rows.reduce((sum, r) =>
          sum + Math.min(r.remaining, days / 7 * r.weeklyClears) * r.gemsPerClear, 0)) * budget.gachaFraction;
      const atStart = rawCash(start);
      return start + (gems - atStart) / ((rawCash(end) - atStart) / (end - start));
    }
    start = end;
  }
  return net.dailyGacha > 0 ? start + (gems - cashAt(start)) / net.dailyGacha : Infinity;
}
export interface ForecastInput {
  rarity: number; selected?: boolean; selectedCount?: number; batchSize?: 1|10;
  pursuitRemaining?: number; budget?: GemBudget; weights?: readonly number[];
  singleCost?: number; multiCost?: number;
}
/** 在“此前未命中目标”的条件下逐张传播十连保底状态，因此付费十连与首命中位置分开计算。 */
export function forecastTarget(input: ForecastInput) {
  const { rarity, selected = true, selectedCount = selected ? 9 : 0, batchSize = 10 } = input;
  const weights = input.weights ?? GEM_CHEST_WEIGHTS;
  const total = weights.reduce((a,b)=>a+b,0);
  const pool = TROOPS.filter(t=>t.rarityIdx===rarity).length;
  if (!pool || weights.length !== 6 || total <= 0 || weights.some(n=>!Number.isFinite(n)||n<0)
    || !Number.isInteger(selectedCount) || selectedCount<0 || selectedCount>GACHA_RULES.slotsPerRarity
    || (selected && (rarity<3 || selectedCount===0))) throw new Error('抽卡模型参数无效');
  const share = GACHA_RULES.wishlistShares[rarity] ?? 0;
  const conditional = selected ? share/GACHA_RULES.slotsPerRarity
    : (1-share*selectedCount/GACHA_RULES.slotsPerRarity)/(pool-selectedCount);
  const survival = [1];
  let low = 1, high = 0;
  for(let i=0;i<batchSize;i++) {
    let nextLow=0, nextHigh=0;
    for(const [seen,mass] of [[false,low],[true,high]] as const) {
      weights.forEach((w,r)=>{
        const finalR = batchSize===10 && i===9 && !seen && r<GACHA_PITY_MIN_IDX ? GACHA_PITY_MIN_IDX : r;
        const p = mass*w/total*(finalR===rarity ? 1-conditional : 1);
        if(seen || finalR>=GACHA_PITY_MIN_IDX) nextHigh+=p; else nextLow+=p;
      });
    }
    low=nextLow;high=nextHigh;survival.push(low+high);
  }
  const cycleSurvival = Math.min(1,Math.max(0,survival[batchSize]!));
  const cap = input.pursuitRemaining ?? Infinity;
  if (cap!==Infinity && (rarity!==5 || !selected || !Number.isSafeInteger(cap) || cap<1 || cap>1e6)) throw new Error('追寻模型需选中神话角色与正整数剩余抽数');
  const survive = (n:number) => n>=cap ? 0 : Math.pow(cycleSurvival,Math.floor(n/batchSize))*survival[n%batchSize]!;
  let meanFirst:number, meanPaid:number;
  if(cap===Infinity) {
    meanFirst=cycleSurvival===1 ? Infinity : survival.slice(0,batchSize).reduce((a,b)=>a+b,0)/(1-cycleSurvival);
    meanPaid=cycleSurvival===1 ? Infinity : batchSize/(1-cycleSurvival);
  } else {
    meanFirst=0;meanPaid=0;
    for(let n=0;n<cap;n++) { meanFirst+=survive(n); if(n%batchSize===0) meanPaid+=batchSize*survive(n); }
  }
  const quantile = (p:number) => {
    if (cycleSurvival===1 && cap===Infinity) return Infinity;
    const cycles=cycleSurvival===0 ? 1 : cycleSurvival===1 ? Infinity : Math.max(1,Math.ceil(Math.log(1-p)/Math.log(cycleSurvival)));
    return Math.min(cycles*batchSize,Math.ceil(cap/batchSize)*batchSize);
  };
  const price=batchSize===10 ? (input.multiCost??GEM_CHEST.multiCost)/10 : input.singleCost??GEM_CHEST.singleCost;
  if(!Number.isFinite(price)||price<=0) throw new Error('抽卡价格需为正数');
  const days=(pulls:number)=> input.budget ? budgetDaysForGems(pulls*price,input.budget) : Infinity;
  return { rarity, pool, conditional, naturalPerPull:weights[rarity]!/total*conditional,
    meanFirst, meanPaid, meanGems:meanPaid*price, budgetEquivalentDays:days(meanPaid),
    p50Paid:quantile(.5), p90Paid:quantile(.9), p90Days:days(quantile(.9)), hardCap:cap,
    maxPaid:Math.ceil(cap/batchSize)*batchSize };
}
/** 设计师校准建议，不写回参数；旧追寻轮次继续使用存档快照。 */
export function calibratePursuit(targetDays:number, budget:GemBudget) {
  if(!Number.isFinite(targetDays)||targetDays<=0) throw new Error('目标天数需为正数');
  const daily=gemBudget(budget).dailyGacha;
  return daily<=0 ? null : Math.max(10,Math.round(targetDays*daily/GEM_CHEST.singleCost/10)*10);
}
export function economyReport(budget:GemBudget = BUDGET_SCENARIOS.standard!) {
  const net = gemBudget(budget);
  return { assumptions:budget, budget:net, kingdomCampaign:kingdomCampaignCapacity(),
    warnings: [
      '活动参与按胜场、路线、连胜、配队与单场时长估算，不是实测；世界物资用均值估算阈值，临界档位存在随机偏差。严苛试炼风险路线假定主角存活。',
      '仅计入显式输入的收入；未填写的活动、入侵周结算、寻宝与战斗收集等收入不计。一次性库存不视为持续收入。',
      '天数为预算等价换算；王国首通按各难度填写的速度均匀入账、耗尽即止，不是随机收入或解锁门槛下的真实首获时间期望。',
      '王国首通独立于持续周收入；weeklyPulls与追寻校准只用持续收入，firstWeekGachaGems包含当周首通。未提供推图参数时不计首通收入。',
      ...(net.dailyGacha <= 0 ? ['持续抽卡预算为零，需补充收入或减少其它支出。'] : []),
      ...(net.dailyGacha > 0 && GACHA_RULES.firstPursuitLimit*GEM_CHEST.singleCost/net.dailyGacha > 90
        ? ['当前情景首次追寻上限超过90天预算；200/400为待调优初始值，应校准收入与追寻上限。'] : []),
    ],
    calibration: [30,60,90].map(targetDays=>({
      targetDays, suggestedLimit:calibratePursuit(targetDays,budget),
      dailyBudgetForCurrentFirstLimit:GACHA_RULES.firstPursuitLimit*GEM_CHEST.singleCost/targetDays,
      dailyBudgetForCurrentRepeatLimit:GACHA_RULES.repeatPursuitLimit*GEM_CHEST.singleCost/targetDays,
    })),
    targets:[3,4,5].map(rarity=>({
    withoutWishlist:forecastTarget({rarity,budget,selected:false}),
    natural:forecastTarget({rarity,budget}),
    ...(rarity===5 ? {firstPursuit:forecastTarget({rarity,budget,pursuitRemaining:GACHA_RULES.firstPursuitLimit}), repeatPursuit:forecastTarget({rarity,budget,pursuitRemaining:GACHA_RULES.repeatPursuitLimit})} : {})
  })) };
}
