/**
 * 演示档构建（本地开发后端专用；远端后端只允许 dev.resetToDemo 在 allowDev 下调用）。
 *
 * 目标：外壳首次进入就有一份「能玩起来」的进度——货币充裕、每王国前 2 名部队在册、
 * 首两个王国任务链全通（解锁骑士/狂战士）、若干进贡气泡可收。
 * 铺数据只用正式系统函数（grantTroop/levelUp/earn/addHeroXp/…），
 * 不手写 schema 字段——保证演示档与真实游玩走完全相同的校验与账目路径。
 * 除 now 外完全确定性：同参数两次构建逐字段一致（单测锁定）。
 */
import { newSave, type MetaSave } from '../state/schema';
import { starterTroopIds } from '../data/economy';
import { allKingdoms, kingdomTroopPool, QUESTS_PER_KINGDOM } from '../data/kingdoms';
import { CLASSES } from '../data/classes';
import { earn, earnMaterials } from '../systems/wallet';
import { grantTroop, levelUp, ascend } from '../systems/troopProgress';
import { addHeroXp, addClassXp, equipClass } from '../systems/hero';
import { pickTalent } from '../systems/talents';
import { eligibleClassIds } from '../systems/classUnlock';
import { setTeamPreset } from '../systems/teamRules';
import { temperWeaponOnSave } from '../systems/forgeOps';
import { STARTER_WEAPON_ID } from '../data/weapons';
import { STARTING_KINGDOM } from '../data/economy';
import { HOUR_MS } from '../gateway/clock';

/** 演示档 hero 等级锚点（约 35 场胜利的进度；恰好开放每周活动） */
const DEMO_HERO_LEVEL = 20;
/** 演示档职业等级锚点（与主角等级解耦，保持原演示口径） */
const DEMO_CLASS_LEVEL = 12;
/** 每个王国演示入册的前 N 名部队 */
const CARDS_PER_KINGDOM = 2;

export function buildDemoSave(now: number): MetaSave {
  const save = newSave({ now, starterTroopIds: starterTroopIds() });

  // —— 货币：铺开养成的演示口径（起始值之上追加） ——
  earn(save, { gold: 38_000, souls: 26_000, gems: 4_350, goldKeys: 6 });

  // —— 收藏：42 王国各前 2 名；UR 及以上多给 2 张同名当升阶材料 ——
  for (const kingdom of allKingdoms()) {
    for (const troop of kingdomTroopPool(kingdom).slice(0, CARDS_PER_KINGDOM)) {
      grantTroop(save, troop.id, troop.rarityIdx >= 3 ? 4 : 2);
    }
  }

  // —— 起始队练到 9 级，第一张再升一阶（养成页有东西可看） ——
  const starters = starterTroopIds();
  for (const id of starters) levelUp(save, id, 9);
  if (starters[0] !== undefined) ascend(save, starters[0]);

  // —— 主角：20 级（按「每胜 60 经验」的真实节奏喂到锚点级；经验有结转） ——
  for (let guard = 0; guard < 2000 && save.hero.level < DEMO_HERO_LEVEL; guard++) {
    addHeroXp(save, 60);
  }

  // —— 王国进度：前 2 个 8/8 全通，其后 5/3/1/0 递减；进贡锚点错开出气泡 ——
  const kingdoms = allKingdoms();
  const questDone = [QUESTS_PER_KINGDOM, QUESTS_PER_KINGDOM, 5, 3, 1];
  const kingdomLevel = [3, 2, 2, 1, 1];
  const tributeHoursAgo = [5, 20, 0, 9, 0];
  kingdoms.forEach((kingdom, idx) => {
    if (idx >= 5) return;
    save.kingdoms[kingdom] = {
      level: kingdomLevel[idx]!,
      questsDone: questDone[idx]!,
      exploreTier: idx < 2 ? 2 : 0,
      clearedExploreTiers: [],
      lastTributeAt: now - tributeHoursAgo[idx]! * HOUR_MS,
    };
  });

  // —— 职业：按分批门槛补发（与结算解锁同源 eligibleClassIds）；练一个到 12 级供演示 ——
  for (const classId of eligibleClassIds(save)) {
    if (!save.hero.unlockedClasses.includes(classId)) save.hero.unlockedClasses.push(classId);
    save.hero.classLevels[classId] ??= 1;
  }
  const demoClass = save.hero.unlockedClasses.map((id) => CLASSES.find((c) => c.id === id)).find(Boolean);
  if (demoClass) {
    equipClass(save, demoClass.id);
    for (let guard = 0; guard < 500 && (save.hero.classLevels[demoClass.id] ?? 0) < DEMO_CLASS_LEVEL; guard++) {
      addClassXp(save, demoClass.id, 25);
    }
    // 演示档点上前两档天赋（天赋树 UI 有东西可看；走正式系统函数保校验同源）
    pickTalent(save, demoClass.id, 0, demoClass.trees[0]!.talents[0]!.code);
    pickTalent(save, demoClass.id, 1, demoClass.trees[1]!.talents[1]!.code);
  }

  // —— 预设队：主角领衔的起始四人队，旗帜=起始王国 ——
  setTeamPreset(save, 0, {
    name: '先锋队',
    members: [{ kind: 'hero' }, ...starters.slice(0, 3).map((troopId) => ({ kind: 'troop' as const, troopId }))],
    bannerKingdomId: STARTING_KINGDOM,
  });

  // —— 素材库存（素材批演示口径）：钢锭/符卷/特质石铺到「淬炼与特质解锁都能试一手」 ——
  earnMaterials(save, {
    ingots: { common: 24, rare: 14, ultraRare: 8, epic: 4, mythic: 2 },
    forgeScrolls: 2,
    traitstones: {
      'minor:red': 10, 'minor:blue': 8, 'minor:green': 8, 'minor:yellow': 6, 'minor:purple': 5, 'minor:brown': 6,
      'major:red': 3, 'major:blue': 2, 'major:green': 2,
      'runic:red': 1, celestial: 1,
    },
    treasureMaps: 7,
  });
  earn(save, { glory: 120 });

  // —— 淬炼：起始武器 +3 级（锻造所手感演示；走正式系统保账目一致） ——
  if (starters.length >= 0) {
    for (let i = 0; i < 3; i++) temperWeaponOnSave(save, STARTER_WEAPON_ID);
  }

  // 演示档跳过新手引导，但保留一次新手十连（方便查看异界来客保底）
  save.onboarding = { step: 'done', noviceSummonUsed: false };
  save.stats.battlesWon = 34;
  save.stats.battlesLost = 7;
  if (demoClass) save.hero.classWins[demoClass.id] = 34;
  return save;
}
