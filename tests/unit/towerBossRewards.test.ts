import { describe, expect, it } from 'vitest';
import { EVENT_ARCANE_STONES, TOWER_BOSS_REWARDS, WEEK_MS, towerBossRewardKey } from '../../src/meta/data/events';
import { STONE_COLORS, INGOT_KEYS, parseStoneKey } from '../../src/meta/data/materials';
import { TOWER_ZONES } from '../../src/meta/data/towerData';
import { weekStartOf } from '../../src/meta/gateway/clock';
import { newSave } from '../../src/meta/state/schema';
import { recordsToSave, saveToRecords } from '../../src/meta/state/records';
import { ensureEventWeek, eventAction, eventModeState, currentEventTheme } from '../../src/meta/systems/events';
import { rewardTowerBoss } from '../../src/meta/systems/eventHighTierRewards';
import { doubleWeeklyMaterials } from '../../src/meta/data/weeklyRewards';
import { towerFloorOf } from '../../src/meta/systems/eventModes/tower';
import { battleIncomeView, resultSubtitle } from '../../src/meta/screens/resultScreen';
import { EventsScreen } from '../../src/meta/screens/eventsScreen';
import { towerViewHtml } from '../../src/meta/screens/eventViews/towerView';
import type { ShellCtx } from '../../src/meta/shell/screen';
import { eventBattle, fakeResult, settleEvent, towerNextBattle } from './helpers/eventDriver';

const WEEK = weekStartOf(Date.UTC(2026, 9, 1, 12));
function fresh(week = WEEK) {
  const save = newSave({ now: week, starterTroopIds: [6000, 6097, 6457] });
  save.hero.level = 20;
  return save;
}

describe('tower region boss guaranteed material rewards', () => {
  it('matches the three actual boss floors and uses valid positive material amounts', () => {
    let floor = 0;
    expect(TOWER_BOSS_REWARDS.map(r => r.floor)).toEqual(TOWER_ZONES.map(z => floor += z.rows));
    expect(TOWER_BOSS_REWARDS.map(r => r.zone)).toEqual([1, 2, 3]);
    for (const { mats } of TOWER_BOSS_REWARDS) {
      for (const [key, n] of Object.entries(mats.ingots!)) {
        expect(INGOT_KEYS).toContain(key);
        expect(Number.isInteger(n) && n > 0).toBe(true);
      }
      for (const [key, n] of Object.entries(mats.traitstones!)) {
        expect(parseStoneKey(key)).not.toBeNull();
        expect(Number.isInteger(n) && n > 0).toBe(true);
      }
    }
  });

  it.each(TOWER_BOSS_REWARDS)('pays floor $floor exactly once, independently of old reward limits', (row) => {
    const s = fresh(); const w = ensureEventWeek(s, WEEK, 'towerOfDoom');
    w.points = 99999; w.playRewards = 6; w.eventData.towerPaidFloors = 25;
    Object.assign(w.eventData, { arcaneTower16: 1, arcaneTower20: 1, arcaneTower25: 1 });
    const before = structuredClone(s.materials);
    expect(rewardTowerBoss(s, w, row.floor)).toEqual([expect.objectContaining({ mats: doubleWeeklyMaterials(row.mats) })]);
    for (const [key, n] of Object.entries(row.mats.ingots!)) {
      expect(s.materials.ingots[key] - (before.ingots[key] ?? 0)).toBe(n! * 2);
    }
    for (const [key, n] of Object.entries(row.mats.traitstones!)) {
      expect(s.materials.traitstones[key] - (before.traitstones[key] ?? 0)).toBe(n! * 2);
    }
    const after = structuredClone(s.materials);
    expect(w.eventData[towerBossRewardKey(row.floor)]).toBe(1);
    expect(rewardTowerBoss(s, w, row.floor)).toEqual([]);
    expect(s.materials).toEqual(after);
    expect(w.eventData.towerPaidFloors).toBe(25);
    expect(w.playRewards).toBe(6);
  });

  it('persists claims, resets next week, and never infers new claims from legacy highest floors', () => {
    let s = fresh(); let w = ensureEventWeek(s, WEEK, 'towerOfDoom');
    w.eventData.floorBest = 25; w.eventData.towerPaidFloors = 25; w.eventData.arcaneTower25 = 1;
    const before = structuredClone(s.materials);
    s = recordsToSave(saveToRecords(s), WEEK); w = ensureEventWeek(s, WEEK, 'towerOfDoom');
    expect(s.materials).toEqual(before);
    expect(w.eventData.towerBoss25).toBeUndefined();
    for (const floor of [0, 7, 9, 15, 17, 24, 26, 16.5]) expect(rewardTowerBoss(s, w, floor)).toEqual([]);
    expect(rewardTowerBoss(s, w, 25)).toHaveLength(1);
    // A later boss does not silently grant the other regions' unearned rewards.
    expect(w.eventData.towerBoss8).toBeUndefined();
    expect(w.eventData.towerBoss16).toBeUndefined();
    s = recordsToSave(saveToRecords(s), WEEK); w = ensureEventWeek(s, WEEK, 'towerOfDoom');
    const paid = structuredClone(s.materials);
    expect(rewardTowerBoss(s, w, 25)).toEqual([]);
    expect(s.materials).toEqual(paid);
    w = ensureEventWeek(s, WEEK + WEEK_MS, 'towerOfDoom');
    expect(rewardTowerBoss(s, w, 25)).toHaveLength(1);
    expect(s.materials.ingots.mythic - paid.ingots.mythic).toBe(4);
  });

  it('real route pays only boss victories, not losses, noncombat travel, relic choices or repeat runs', () => {
    let s = fresh();
    for (let runNumber = 0; runNumber < 2; runNumber++) {
      let reached = 0; const awarded: number[] = [];
      for (let guard = 0; guard < 40 && reached < 25; guard++) {
        const ledgerBefore = TOWER_BOSS_REWARDS.map(r => ensureEventWeek(s, WEEK, 'towerOfDoom').eventData[towerBossRewardKey(r.floor)] ?? 0);
        const out = eventBattle(s, 'towerOfDoom', WEEK);
        let w = ensureEventWeek(s, WEEK, 'towerOfDoom');
        // The driver traverses camps/events and selects the previous battle's relics.
        expect(TOWER_BOSS_REWARDS.map(r => w.eventData[towerBossRewardKey(r.floor)] ?? 0)).toEqual(ledgerBefore);
        const run = eventModeState(s, WEEK, 'towerOfDoom').run!;
        if (out.plan.source.kind !== 'event') throw new Error('Expected event source');
        const [r, c] = out.plan.source.choice!.slice(3).split('-').map(Number);
        const node = run.rows[r]!.find(n => n.col === c)!;
        const floor = towerFloorOf(run.zone, node.row);
        const row = TOWER_BOSS_REWARDS.find(reward => reward.floor === floor);
        if (row) {
          expect(node.kind).toBe('boss');
          const failed = recordsToSave(saveToRecords(s), WEEK);
          const before = structuredClone(failed.materials);
          const loss = settleEvent(failed, out, fakeResult(out, false), WEEK);
          expect(loss.lines.filter(l => l.label.includes('区通关材料'))).toEqual([]);
          expect(failed.materials.ingots).toEqual(before.ingots);
          expect(failed.materials.traitstones).toEqual(before.traitstones);
          expect(ensureEventWeek(failed, WEEK, 'towerOfDoom').eventData[towerBossRewardKey(floor)] ?? 0).toBe(ledgerBefore[row.zone - 1]);
        }
        const detail = settleEvent(s, out, undefined, WEEK);
        const lines = detail.lines.filter(l => l.label.includes('区通关材料'));
        if (row && runNumber === 0) {
          expect(lines).toEqual([expect.objectContaining({ key: 'tower-boss-clear', mats: doubleWeeklyMaterials(row.mats) })]);
          const balanceBeforeDisplay = structuredClone(s.materials);
          const income = battleIncomeView(detail);
          for (const [key, amount] of Object.entries(row.mats.ingots!)) {
            expect(income.materials.find(item => item.key === `ingot:${key}`)?.amount).toBeGreaterThanOrEqual(amount! * 2);
          }
          for (const [key, amount] of Object.entries(row.mats.traitstones!)) {
            expect(income.materials.find(item => item.key === `stone:${key}`)?.amount).toBeGreaterThanOrEqual(amount! * 2);
          }
          const subtitle = resultSubtitle(detail, { kingdom: '', sourceLabel: '末日之塔' });
          expect(subtitle).toContain(`第 ${row.zone} 区通关材料（第 ${floor} 层首领）`);
          expect(subtitle).toContain('已入账');
          expect(battleIncomeView(detail)).toEqual(income);
          expect(s.materials).toEqual(balanceBeforeDisplay);
          awarded.push(floor);
          // Materials are already owned while the boss relic is still awaiting a choice.
          expect(eventModeState(s, WEEK, 'towerOfDoom').run?.pending).toMatchObject({ kind: 'reward', source: 'boss' });
          const quit = recordsToSave(saveToRecords(s), WEEK);
          const materialBalance = structuredClone(quit.materials);
          expect(eventAction(quit, WEEK, 'towerOfDoom', 'abandon', 88).ok).toBe(true);
          expect(quit.materials.ingots).toEqual(materialBalance.ingots);
          expect(quit.materials.traitstones).toEqual(materialBalance.traitstones);
        } else {
          expect(lines).toEqual([]);
          expect(detail.lines.some(l => l.key === 'tower-boss-clear')).toBe(false);
          expect(resultSubtitle(detail, { kingdom: '', sourceLabel: '末日之塔' })).not.toContain('通关材料');
        }
        const balance = structuredClone(s.materials);
        const retry = settleEvent(s, out, undefined, WEEK); // Same settlement retried.
        expect(retry.lines.some(l => l.key === 'tower-boss-clear')).toBe(false);
        expect(battleIncomeView(retry).materials).toEqual([]);
        expect(s.materials).toEqual(balance);
        reached = floor;
        // Exercise actual persisted ledger and mode sanitation between battles.
        s = recordsToSave(saveToRecords(s), WEEK);
        w = ensureEventWeek(s, WEEK, 'towerOfDoom');
        if (row) expect(w.eventData[towerBossRewardKey(floor)]).toBe(1);
      }
      expect(reached).toBe(25);
      expect(awarded).toEqual(runNumber === 0 ? [8, 16, 25] : []);
      expect(eventAction(s, WEEK, 'towerOfDoom', 'skip', 90).ok).toBe(true);
      expect(eventModeState(s, WEEK, 'towerOfDoom').run).toBeNull();
    }
    expect(s.materials.ingots).toMatchObject({ rare: 12, ultraRare: 8, epic: 46, mythic: 4 });
    for (const key of EVENT_ARCANE_STONES.towerOfDoom) expect(s.materials.traitstones[key]).toBe(18);
    for (const { key } of STONE_COLORS) expect(s.materials.traitstones[`runic:${key}`]).toBeGreaterThanOrEqual(12);
  });

  it('rewards/rules pages and boss preview show the same bundle and weekly claim status', () => {
    const week = weekStartOf(Date.now()); const s = fresh(week);
    const w = ensureEventWeek(s, week, 'towerOfDoom');
    const screen = new EventsScreen(); const ctx = { save: () => s } as ShellCtx;
    const html = screen.html(ctx, 'towerOfDoom/rewards');
    expect(html).toContain('三区通关材料');
    for (const row of TOWER_BOSS_REWARDS) expect(html).toContain(`第 ${row.zone} 区 · 第 ${row.floor} 层首领`);
    expect(html).toContain('稀有钢锭 ×12');
    expect(html).toContain('神话钢锭 ×4');
    expect(screen.html(ctx, 'towerOfDoom/rules')).toContain('第 8 / 16 / 25 层首领');
    towerNextBattle(s, week);
    const state = eventModeState(s, week, 'towerOfDoom');
    const boss = state.run!.rows.flat().find(n => n.kind === 'boss')!;
    const view = { save: s, week: w, weekStart: week, theme: currentEventTheme(week, 'towerOfDoom'),
      selected: `node:${boss.row}-${boss.col}`, ready: () => null, fightLabel: '出战' };
    expect(towerViewHtml(view, state)).toContain('本周首通保底：稀有钢锭 ×12、传说钢锭 ×8、特质石 ×48');
    rewardTowerBoss(s, w, 8);
    expect(towerViewHtml(view, state)).toContain('本周已领：稀有钢锭 ×12');
    const claimed = screen.html(ctx, 'towerOfDoom/rewards');
    expect(claimed).toContain('<b>第 1 区 · 第 8 层首领</b><span>本周已领</span>');
    expect(claimed).toContain('<b>第 2 区 · 第 16 层首领</b><span>本周未领</span>');
  });
});
