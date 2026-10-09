import { EVENT_HIGH_TIER_REWARDS, EVENT_LEGACY_GEMS_PAID, EVENT_MILESTONES, EVENT_SHARED_GOALS, EVENT_TYPES, EVENT_WEEKLY_RULES, TOWER_BOSS_REWARDS, eventArcaneBundle, towerBossRewardKey, type EventTypeId } from '../data/events';
import { INVASION_RANKS } from '../data/invasionRanks';
import { REGION_REWARDS } from '../data/regionalPvp';
import { getTroopById } from '../../data/troops';
import { grantTroop } from './troopProgress';
import { BLOCKED_WISHLIST_IDS } from './wishlist';
import type { MaterialDelta } from '../data/materials';
import type { EventWeekState, InvasionState, MailboxState, MailItem, MetaSave } from '../state/schema';
import type { RegionalState } from '../state/regional';
import type { CurrencyDelta, MetaFailure } from '../types';
import { fail } from '../types';
import { classLevelOf, addClassXp } from './hero';
import { earn, earnMaterials } from './wallet';

function positive(value: unknown): number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value > 0 ? value : 0;
}

function cleanMap(value: unknown): Record<string, number> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return Object.fromEntries(Object.entries(value).flatMap(([key, amount]) => positive(amount) ? [[key, amount]] : []));
}

function cleanMaterials(value: unknown): MaterialDelta {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  const raw = value as Record<string, unknown>;
  const ingots = cleanMap(raw.ingots);
  const traitstones = cleanMap(raw.traitstones);
  return {
    ...(Object.keys(ingots).length ? { ingots } : {}),
    ...(Object.keys(traitstones).length ? { traitstones } : {}),
    ...(positive(raw.forgeScrolls) ? { forgeScrolls: positive(raw.forgeScrolls) } : {}),
    ...(positive(raw.treasureMaps) ? { treasureMaps: positive(raw.treasureMaps) } : {}),
  };
}

export function hydrateMailbox(value: unknown): MailboxState {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return { weeklyDoubleVersion: 0, classTrialXpVersion: 0, items: [] };
  const raw = value as Record<string, unknown>;
  const items: MailItem[] = [];
  const ids = new Set<string>();
  for (const entry of Array.isArray(raw.items) ? raw.items : []) {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) continue;
    const item = entry as Record<string, unknown>;
    if (typeof item.id !== 'string' || !item.id || ids.has(item.id)) continue;
    if (typeof item.title !== 'string' || typeof item.body !== 'string') continue;
    ids.add(item.id);
    const currencies = cleanMap(item.currencies);
    items.push({
      id: item.id, title: item.title.slice(0, 100), body: item.body.slice(0, 500),
      sentAt: positive(item.sentAt), readAt: item.readAt === null ? null : positive(item.readAt) || null,
      claimedAt: item.claimedAt === null ? null : positive(item.claimedAt) || null,
      currencies: Object.fromEntries(Object.entries(currencies).filter(([key]) => ['gold', 'souls', 'gems', 'goldKeys', 'glory', 'gloryKeys', 'trophies'].includes(key))),
      materials: cleanMaterials(item.materials),
      ...(positive(item.classXp) ? { classXp: positive(item.classXp) } : {}),
      ...(Math.min(10, positive(item.mythicChoice)) ? { mythicChoice: Math.min(10, positive(item.mythicChoice)) } : {}),
    });
  }
  return { weeklyDoubleVersion: positive(raw.weeklyDoubleVersion), classTrialXpVersion: positive(raw.classTrialXpVersion), items };
}

export function backfillClassTrialXpMail(mailbox: MailboxState, now: number): void {
  if (mailbox.classTrialXpVersion >= 1) return;
  if (!mailbox.items.some(item => item.id === 'class-trials-xp:5000')) {
    mailbox.items.push({
      id: 'class-trials-xp:5000', title: '职业试炼经验补发',
      body: '职业经验奖励调整，补发 5,000 职业经验。领取时发放给当前装备的职业。',
      sentAt: now, readAt: null, claimedAt: null, currencies: {}, materials: {}, classXp: 5000,
    });
  }
  mailbox.classTrialXpVersion = 1;
}

function addCurrency(target: CurrencyDelta, gain: CurrencyDelta): void {
  for (const [key, amount] of Object.entries(gain)) {
    if (positive(amount)) (target as Record<string, number>)[key] = ((target as Record<string, number>)[key] ?? 0) + amount!;
  }
}

function addMaterials(target: MaterialDelta, gain: MaterialDelta): void {
  for (const [key, amount] of Object.entries(gain.ingots ?? {})) {
    if (!amount) continue;
    target.ingots ??= {};
    (target.ingots as Record<string, number>)[key] = ((target.ingots as Record<string, number>)[key] ?? 0) + amount;
  }
  for (const [key, amount] of Object.entries(gain.traitstones ?? {})) {
    if (!amount) continue;
    target.traitstones ??= {};
    target.traitstones[key] = (target.traitstones[key] ?? 0) + amount;
  }
  if (gain.forgeScrolls) target.forgeScrolls = (target.forgeScrolls ?? 0) + gain.forgeScrolls;
  if (gain.treasureMaps) target.treasureMaps = (target.treasureMaps ?? 0) + gain.treasureMaps;
}

function hasReward(currencies: CurrencyDelta, materials: MaterialDelta): boolean {
  return Object.values(currencies).some(Boolean) || Object.values(materials.ingots ?? {}).some(Boolean)
    || Object.values(materials.traitstones ?? {}).some(Boolean) || !!materials.forgeScrolls || !!materials.treasureMaps;
}

function enqueue(mailbox: MailboxState, id: string, title: string, body: string, sentAt: number, currencies: CurrencyDelta, materials: MaterialDelta = {}): void {
  if (!hasReward(currencies, materials) || mailbox.items.some(item => item.id === id)) return;
  mailbox.items.push({ id, title, body, sentAt, readAt: null, claimedAt: null, currencies, materials });
}

/** Only the retained weekly ledgers can prove a past claim; every generated mail has a stable ID. */
export function backfillWeeklyRewardMail(
  mailbox: MailboxState,
  eventWeeks: Partial<Record<EventTypeId, EventWeekState>>,
  regional: RegionalState,
  invasion: InvasionState,
  now: number,
): void {
  if (mailbox.weeklyDoubleVersion >= 1) return;
  for (const def of EVENT_TYPES) {
    const week = eventWeeks[def.id];
    if (!week) continue;
    const currencies: CurrencyDelta = {};
    const materials: MaterialDelta = {};
    for (const index of week.claimed) {
      const row = EVENT_MILESTONES[def.id][index];
      if (!row) continue;
      const gemsPaid = Math.max(week.eventData[`gemPaid${index}`] ?? 0,
        week.eventData.revision ? 0 : EVENT_LEGACY_GEMS_PAID[def.id][index] ?? 0);
      addCurrency(currencies, {
        gold: (row.gold ?? 0) / 2, souls: (row.souls ?? 0) / 2,
        goldKeys: (row.goldKeys ?? 0) / 2, glory: (row.glory ?? 0) / 2,
        gems: Math.max(0, (row.gems ?? 0) - gemsPaid),
      });
      addMaterials(materials, {
        ingots: Object.fromEntries(Object.entries(row.mats?.ingots ?? {}).map(([key, amount]) => [key, (amount ?? 0) / 2])),
        traitstones: Object.fromEntries(Object.entries(row.mats?.traitstones ?? {}).map(([key, amount]) => [key, (amount ?? 0) / 2])),
        forgeScrolls: (row.mats?.forgeScrolls ?? 0) / 2,
        treasureMaps: (row.mats?.treasureMaps ?? 0) / 2,
      });
      week.eventData[`gemPaid${index}`] = row.gems ?? 0;
    }
    // Prevent the legacy no-revision branch from replacing the settled gem ledger on first event access.
    if (!week.eventData.revision && def.id === 'towerOfDoom') {
      week.eventData.towerPaidFloors ??= Math.min(EVENT_WEEKLY_RULES.towerFloors, week.eventData.floorBest ?? 0);
    }
    week.eventData.revision = 3;
    if (def.id === 'invasion') {
      EVENT_SHARED_GOALS.forEach((goal, index) => {
        if (week.eventData[`sharedClaim${index}`] !== 1) return;
        addCurrency(currencies, { gems: goal.gems / 2, gold: goal.gold / 2, souls: goal.souls / 2 });
      });
      const count = week.playRewards;
      addCurrency(currencies, { gems: count * 20, glory: count * 40 });
      addMaterials(materials, { traitstones: { 'runic:red': count * 2, 'runic:blue': count * 2 } });
    } else if (def.id === 'factionAssault') {
      const count = week.playRewards;
      addCurrency(currencies, { glory: count * 40 });
      addMaterials(materials, { ingots: { epic: count }, traitstones: { 'runic:green': count, 'runic:brown': count } });
    } else if (def.id === 'raidBoss') {
      for (let tier = 1; tier <= week.playRewards; tier++) {
        addCurrency(currencies, { glory: 30 + 20 * tier });
        addMaterials(materials, { ingots: { epic: 2, ...(tier >= 3 ? { mythic: 1 } : {}) } });
      }
      addMaterials(materials, { traitstones: {
        ...Object.fromEntries(Object.entries(eventArcaneBundle('raidBoss', EVENT_HIGH_TIER_REWARDS.raid.amount)).map(([key, amount]) => [key, amount * (week.eventData.arcaneRaidKills ?? 0)])),
        celestial: week.eventData.celestialRaidKills ?? 0,
      } });
    } else if (def.id === 'towerOfDoom') {
      const floors = week.eventData.towerPaidFloors ?? 0;
      addCurrency(currencies, { glory: floors * 2 });
      addMaterials(materials, { forgeScrolls: Math.floor(floors / 5) });
      for (const reward of TOWER_BOSS_REWARDS) {
        if (week.eventData[towerBossRewardKey(reward.floor)]) addMaterials(materials, reward.mats);
      }
      for (const reward of EVENT_HIGH_TIER_REWARDS.tower) {
        if (!week.eventData[`arcaneTower${reward.floor}`]) continue;
        addMaterials(materials, { traitstones: { ...eventArcaneBundle('towerOfDoom', reward.amount), celestial: reward.celestial } });
      }
    }
    enqueue(mailbox, `weekly-double:${def.id}:${week.weekStart}`, `${def.name}奖励补发`, '已领取周奖励提升后的差额，请领取附件。', now, currencies, materials);
  }
  const regionalCurrencies: CurrencyDelta = {};
  for (const index of regional.claimed) {
    const row = REGION_REWARDS[index];
    if (row) addCurrency(regionalCurrencies, { gold: row.gold / 2, gems: row.gems / 2, souls: row.souls / 2 });
  }
  enqueue(mailbox, `weekly-double:regional:${regional.week}`, '永生战域奖励补发', '已领取周奖励的黄金、宝石和灵魂差额。燃烧灵魂数量不变。', now, regionalCurrencies);
  const rankCurrencies: CurrencyDelta = {};
  for (const id of invasion.claimedRanks) {
    const rank = INVASION_RANKS.find(row => row.id === id);
    if (rank) addCurrency(rankCurrencies, { gems: rank.gems / 2 });
  }
  enqueue(mailbox, `weekly-double:invasion-ranks:${invasion.weekStart}`, '入侵官阶奖励补发', '已领取官阶宝石奖励提升后的差额，请领取附件。', now, rankCurrencies);
  mailbox.weeklyDoubleVersion = 1;
}

export function readMail(save: MetaSave, id: string, now: number): { ok: true } | MetaFailure {
  const item = save.mailbox.items.find(mail => mail.id === id);
  if (!item) return fail('INVALID', '邮件不存在');
  item.readAt ??= now;
  return { ok: true };
}

export function claimMail(save: MetaSave, id: string, now: number): { ok: true } | MetaFailure {
  const item = save.mailbox.items.find(mail => mail.id === id);
  if (!item) return fail('INVALID', '邮件不存在');
  if (item.claimedAt !== null) return fail('ALREADY_UNLOCKED', '附件已领取');
  const classId = save.hero.classId;
  if (item.classXp && (!classId || !save.hero.unlockedClasses.includes(classId) || classLevelOf(save, classId) <= 0)) {
    return fail('PREREQ_LOCKED', '请先装备已解锁的职业再领取职业经验');
  }
  earn(save, item.currencies);
  earnMaterials(save, item.materials);
  if (item.classXp && classId) addClassXp(save, classId, item.classXp);
  item.readAt ??= now;
  item.claimedAt = now;
  return { ok: true };
}

/** Materials are claimed independently. Selecting a troop is an atomic, durable command. */
export function chooseMailMythic(save: MetaSave, id: string, troopId: number, now: number): { ok: true; troopId: number; duplicate: boolean } | MetaFailure {
  const item = save.mailbox.items.find(mail => mail.id === id);
  if (!item || !item.mythicChoice || item.claimedAt === null) return fail('INVALID', '神话自选附件尚未领取或已使用');
  const troop = Number.isInteger(troopId) ? getTroopById(troopId) : undefined;
  if (!troop || troop.rarityIdx !== 5 || BLOCKED_WISHLIST_IDS.has(troopId) || troopId === 7446 || troopId === 7622)
    return fail('INVALID', '请选择可获取的神话部队');
  const duplicate = !!(save.collectionTruth ?? save.collection)[String(troopId)];
  if (!grantTroop(save, troopId)) return fail('INVALID', '部队领取失败');
  item.mythicChoice -= 1;
  item.readAt ??= now;
  return { ok: true, troopId, duplicate };
}

export function claimAllMail(save: MetaSave, now: number): { ok: true; count: number } {
  let count = 0;
  for (const item of save.mailbox.items) {
    if (item.claimedAt !== null) continue;
    if (claimMail(save, item.id, now).ok) count++;
  }
  return { ok: true, count };
}
