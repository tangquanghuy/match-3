import { describe, expect, it } from 'vitest';
import { EVENT_MILESTONES, EVENT_SHARED_GOALS } from '../../src/meta/data/events';
import { INVASION_RANKS } from '../../src/meta/data/invasionRanks';
import { REGION_REWARDS } from '../../src/meta/data/regionalPvp';
import { newSave } from '../../src/meta/state/schema';
import { migrateSave } from '../../src/meta/state/save';
import { ensureEventWeek } from '../../src/meta/systems/events';
import { claimAllMail, claimMail, chooseMailMythic, readMail } from '../../src/meta/systems/mailbox';

const WEEK = Date.UTC(2026, 8, 28, 16);

describe('周奖励补发邮件', () => {
  it('按已领账本生成一次差额，领取附件后不重复发放', () => {
    const old = newSave({ now: WEEK });
    const week = ensureEventWeek(old, WEEK, 'invasion');
    week.claimed = [0];
    week.playRewards = 1;
    week.eventData = { revision: 2, gemPaid0: 150, currencyBonusPaid0: 1, sharedClaim0: 1, sharedCurrencyPaid0: 1 };
    old.regional!.claimed = [0];
    old.regional!.week = WEEK;
    old.regional!.burningSouls = 7;
    old.invasion.claimedRanks = ['rank-0'];
    old.invasion.weekStart = WEEK;
    const raw = JSON.parse(JSON.stringify(old));
    delete raw.mailbox;

    const loaded = migrateSave(raw, WEEK);
    expect(loaded.currencies).toEqual(old.currencies);
    expect(loaded.regional!.burningSouls).toBe(7);
    expect(loaded.mailbox.items).toHaveLength(4);
    const event = loaded.mailbox.items.find(item => item.id.startsWith('weekly-double:invasion:'))!;
    expect(event.currencies).toMatchObject({
      gems: EVENT_MILESTONES.invasion[0]!.gems! / 2 + EVENT_SHARED_GOALS[0]!.gems / 2 + 20,
      gold: EVENT_MILESTONES.invasion[0]!.gold! / 2 + EVENT_SHARED_GOALS[0]!.gold / 2,
      glory: 40,
    });
    expect(event.materials.traitstones).toMatchObject({ 'runic:red': 2, 'runic:blue': 2 });
    const regional = loaded.mailbox.items.find(item => item.id.startsWith('weekly-double:regional:'))!;
    expect(regional.currencies).toMatchObject({ gold: REGION_REWARDS[0]!.gold / 2, gems: REGION_REWARDS[0]!.gems / 2, souls: REGION_REWARDS[0]!.souls / 2 });
    expect(JSON.stringify(regional)).not.toContain('burning');
    const rank = loaded.mailbox.items.find(item => item.id.startsWith('weekly-double:invasion-ranks:'))!;
    expect(rank.currencies.gems).toBe(INVASION_RANKS[0]!.gems / 2);
    expect(loaded.eventWeeks.invasion!.eventData.gemPaid0).toBe(EVENT_MILESTONES.invasion[0]!.gems);

    expect(readMail(loaded, event.id, WEEK + 1)).toEqual({ ok: true });
    expect(loaded.mailbox.items.find(item => item.id === event.id)?.readAt).toBe(WEEK + 1);
    expect(claimAllMail(loaded, WEEK + 2)).toEqual({ ok: true, count: 4 });
    expect(loaded.regional!.burningSouls).toBe(7);
    expect(claimMail(loaded, event.id, WEEK + 3).ok).toBe(false);
    expect(claimAllMail(loaded, WEEK + 3).count).toBe(0);
    const reloaded = migrateSave(JSON.parse(JSON.stringify(loaded)), WEEK + 4);
    expect(reloaded.mailbox.items).toEqual(loaded.mailbox.items);
    expect(reloaded.currencies).toEqual(loaded.currencies);
  });

  it('新档没有补发邮件', () => {
    const save = migrateSave(JSON.parse(JSON.stringify(newSave({ now: WEEK }))), WEEK);
    expect(save.mailbox.items).toEqual([]);
    expect(save.mailbox.weeklyDoubleVersion).toBe(1);
    expect(save.mailbox.classTrialXpVersion).toBe(1);
  });

  it('旧档补发一次职业经验；未装备职业时可保留附件', () => {
    const old = newSave({ now: WEEK });
    const raw = JSON.parse(JSON.stringify(old));
    delete raw.mailbox.classTrialXpVersion;
    const loaded = migrateSave(raw, WEEK);
    const mail = loaded.mailbox.items.find(item => item.id === 'class-trials-xp:5000')!;
    expect(mail.classXp).toBe(5000);
    expect(migrateSave(JSON.parse(JSON.stringify(loaded)), WEEK + 1).mailbox.items).toHaveLength(1);
    loaded.hero.classId = null;
    expect(claimMail(loaded, mail.id, WEEK + 2)).toMatchObject({ ok: false, code: 'PREREQ_LOCKED' });
    expect(claimAllMail(loaded, WEEK + 2).count).toBe(0);
    expect(mail.claimedAt).toBeNull();
    loaded.hero.classId = old.hero.classId;
    const classId = loaded.hero.classId!;
    const before = loaded.hero.classXp[classId] ?? 0;
    expect(claimMail(loaded, mail.id, WEEK + 3)).toEqual({ ok: true });
    expect(loaded.hero.classXp[classId]).toBeGreaterThanOrEqual(before);
    expect(loaded.hero.classLevels[classId]).toBeGreaterThan(1);
    expect(claimMail(loaded, mail.id, WEEK + 4).ok).toBe(false);
  });

  it('旧版无修订账本保留原已付宝石及高塔楼层记录', () => {
    const old = newSave({ now: WEEK });
    const week = ensureEventWeek(old, WEEK, 'towerOfDoom');
    week.claimed = [4];
    week.eventData = { floorBest: 10 };
    const raw = JSON.parse(JSON.stringify(old));
    delete raw.mailbox;

    const loaded = migrateSave(raw, WEEK);
    const mail = loaded.mailbox.items.find(item => item.id.startsWith('weekly-double:towerOfDoom:'))!;
    expect(mail.currencies.gems).toBe(EVENT_MILESTONES.towerOfDoom[4]!.gems! - 60);
    expect(loaded.eventWeeks.towerOfDoom!.eventData.gemPaid4).toBe(EVENT_MILESTONES.towerOfDoom[4]!.gems);
    expect(loaded.eventWeeks.towerOfDoom!.eventData.towerPaidFloors).toBe(10);
  });
  it('claims traitstones exactly once while a cancelled or interrupted mythic choice stays pending', () => {
    const save = newSave({ now: WEEK });
    save.mailbox.items.push({ id: 'retirement-star', title: '神话自选', body: '补偿', sentAt: WEEK,
      readAt: null, claimedAt: null, currencies: {}, materials: { traitstones: { 'minor:yellow': 90, celestial: 18 } }, mythicChoice: 1 });
    const before = save.materials.traitstones['minor:yellow'] ?? 0;
    expect(chooseMailMythic(save, 'retirement-star', 7440, WEEK + 1).ok).toBe(false);
    expect(claimMail(save, 'retirement-star', WEEK + 2)).toEqual({ ok: true });
    expect(save.materials.traitstones['minor:yellow']).toBe(before + 90);
    expect(claimAllMail(save, WEEK + 3).count).toBe(0);
    expect(claimMail(save, 'retirement-star', WEEK + 3).ok).toBe(false);
    const restarted = migrateSave(JSON.parse(JSON.stringify(save)), WEEK + 4);
    expect(restarted.mailbox.items[0]).toMatchObject({ claimedAt: WEEK + 2, mythicChoice: 1 });
    expect(restarted.materials.traitstones['minor:yellow']).toBe(before + 90);
    expect(chooseMailMythic(restarted, 'retirement-star', 6000, WEEK + 5).ok).toBe(false);
    expect(chooseMailMythic(restarted, 'retirement-star', 7446, WEEK + 5).ok).toBe(false);
    expect(restarted.mailbox.items[0]!.mythicChoice).toBe(1);
    expect(restarted.collection['7440']).toBeUndefined();
    expect(chooseMailMythic(restarted, 'retirement-star', 7440, WEEK + 6)).toMatchObject({ ok: true, troopId: 7440, duplicate: false });
    expect(restarted.collection['7440']).toBeDefined();
    expect(restarted.mailbox.items[0]!.mythicChoice).toBe(0);
    expect(chooseMailMythic(restarted, 'retirement-star', 7440, WEEK + 7).ok).toBe(false);
    expect(restarted.materials.traitstones['minor:yellow']).toBe(before + 90);
  });

  it('two separate mails each grant exactly one mythic, including duplicates', () => {
    const save = newSave({ now: WEEK });
    for (const id of ['star', 'flower']) save.mailbox.items.push({ id, title: '自选', body: '', sentAt: WEEK,
      readAt: null, claimedAt: null, currencies: {}, materials: { traitstones: { celestial: 18 } }, mythicChoice: 1 });
    expect(claimAllMail(save, WEEK + 1)).toEqual({ ok: true, count: 2 });
    expect(save.materials.traitstones.celestial).toBe(36);
    expect(chooseMailMythic(save, 'star', 7440, WEEK + 2)).toMatchObject({ ok: true, duplicate: false });
    expect(chooseMailMythic(save, 'flower', 7440, WEEK + 3)).toMatchObject({ ok: true, duplicate: true });
    expect(save.collection['7440']!.copies).toBe(1);
    expect(claimAllMail(save, WEEK + 4).count).toBe(0);
  });
});
