import { describe, expect, it } from 'vitest';
import { EVENT_MILESTONES, EVENT_SHARED_GOALS } from '../../src/meta/data/events';
import { INVASION_RANKS } from '../../src/meta/data/invasionRanks';
import { REGION_REWARDS } from '../../src/meta/data/regionalPvp';
import { newSave } from '../../src/meta/state/schema';
import { migrateSave } from '../../src/meta/state/save';
import { ensureEventWeek } from '../../src/meta/systems/events';
import { claimAllMail, claimMail, readMail } from '../../src/meta/systems/mailbox';

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
});
