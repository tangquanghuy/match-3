# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: battleSettings.spec.ts >> battle audio controls persist independently; cancellation preserves the match; surrender settles once
- Location: tests\e2e\battleSettings.spec.ts:25:1

# Error details

```
Error: expect(locator).toHaveText(expected) failed

Locator: locator('.gop-title')
Expected: "已放弃"
Timeout: 5000ms
Error: element(s) not found

Call log:
  - Expect "toHaveText" with timeout 5000ms
  - waiting for locator('.gop-title')
    - waiting for" http://localhost:5173/index.html" navigation to finish...
    - navigated to "http://localhost:5173/index.html"

```

```yaml
- img
- text: "4"
- img
- text: "42"
- button "查看法力值详情，当前 6/12":
  - img
- img
- text: "6"
- img "减伤"
- img "法力"
- img "生命"
- img
- text: "4"
- img
- text: "40"
- button "查看法力值详情，当前 0/12":
  - img
- img
- text: "8"
- img
- text: "4"
- img
- text: "42"
- button "查看法力值详情，当前 0/12":
  - img
- img
- text: "10"
- img "回复"
- img "减伤"
- img
- text: "4"
- img
- text: "40"
- button "查看法力值详情，当前 0/12":
  - img
- img
- text: "12"
- img
- text: "4"
- img
- text: "40"
- button "查看法力值详情，当前 0/12":
  - img
- img
- text: "6"
- img "减伤"
- img "闪避"
- img
- text: "4"
- img
- text: "40"
- button "查看法力值详情，当前 0/12":
  - img
- img
- text: "8"
- img "剧毒"
- img "免疫"
- img "反伤"
- img
- text: "4"
- img
- text: "40"
- button "查看法力值详情，当前 0/12":
  - img
- img
- text: "10"
- img
- text: "4"
- img
- text: "40"
- button "查看法力值详情，当前 0/12":
  - img
- img
- text: "12"
- button "全屏":
  - img
- text: TURN 01
- button "战斗设置": ⚙
```

# Test source

```ts
  1   | ﻿import { expect, test, type Page } from '@playwright/test';
  2   | import type { App } from '../../src/render/App';
  3   | import type { AudioManager } from '../../src/render/AudioManager';
  4   | import type { EventStreamPlayer } from '../../src/render/EventStreamPlayer';
  5   | import type { BattleSession } from '../../src/session/BattleSession';
  6   | import type { BattleNarrator } from '../../src/render/BattleNarrator';
  7   | 
  8   | type Runtime = Omit<App, 'audio' | 'player' | 'session' | 'narrator'> & {
  9   |   audio: AudioManager; player: EventStreamPlayer; session: BattleSession; narrator: BattleNarrator;
  10  |   input: { enabled: boolean }; startupPlaying: boolean; afterResolve(): void;
  11  |   resultCount: number; voicePools: string[];
  12  | };
  13  | declare global { interface Window { __settingsTestApp?: Runtime } }
  14  | 
  15  | async function openBattle(page: Page): Promise<void> {
  16  |   await page.goto('/index.html');
  17  |   await page.waitForFunction(() => {
  18  |     const app = (window as unknown as { __app: Runtime }).__app;
  19  |     if (!app || app.startupPlaying || !document.querySelector('.battle-settings-button')) return false;
  20  |     window.__settingsTestApp = app;
  21  |     return true;
  22  |   });
  23  | }
  24  | 
  25  | test('battle audio controls persist independently; cancellation preserves the match; surrender settles once', async ({ page }) => {
  26  |   const errors: string[] = [];
  27  |   page.on('pageerror', e => errors.push(e.message));
  28  |   await openBattle(page);
  29  |   await page.evaluate(() => {
  30  |     const app = window.__settingsTestApp!;
  31  |     app.resultCount = 0; app.voicePools = [];
  32  |     app.onBattleFinished = () => { app.resultCount++; };
  33  |     const play = app.audio.playNarration.bind(app.audio);
  34  |     app.audio.playNarration = (clip, interrupt) => { app.voicePools.push(clip.pool); return play(clip, interrupt); };
  35  |     app.getEngine().getState().economy.gold = 100;
  36  |   });
  37  |   await page.getByRole('button', { name: '战斗设置', exact: true }).click();
  38  |   const dialog = page.getByRole('dialog');
  39  |   await expect(dialog).toBeVisible();
  40  |   await dialog.locator('#masterVolume').fill('50');
  41  |   await dialog.locator('#musicVolume').fill('30');
  42  |   await dialog.locator('#soundEffectsEnabled').uncheck();
  43  |   await dialog.locator('#narrationVolume').fill('85');
  44  |   await expect(dialog.locator('#soundEffectsVolume')).toBeDisabled();
  45  |   await expect(dialog.locator('#narrationVolume')).toBeEnabled();
  46  |   await expect.poll(() => page.evaluate(() => {
  47  |     const audio = window.__settingsTestApp!.audio as unknown as { master: GainNode; sfxBus: GainNode; narrationBus: GainNode };
  48  |     return [audio.master?.gain.value, audio.sfxBus?.gain.value, Number(audio.narrationBus?.gain.value.toFixed(2))];
  49  |   })).toEqual([0.5, 0, 0.85]);
  50  |   await dialog.getByRole('button', { name: '放弃本局' }).click();
  51  |   await expect(dialog.getByRole('button', { name: '继续战斗' })).toBeFocused();
  52  |   await dialog.getByRole('button', { name: '继续战斗' }).click();
  53  |   expect(await page.evaluate(() => window.__settingsTestApp!.exportResult())).toBeNull();
  54  |   expect(await page.evaluate(() => window.__settingsTestApp!.input.enabled)).toBe(true);
  55  |   await page.getByRole('button', { name: '战斗设置', exact: true }).click();
  56  |   await dialog.getByRole('button', { name: '放弃本局' }).click();
  57  |   await dialog.getByRole('button', { name: '确认放弃' }).click();
> 58  |   await expect(page.locator('.gop-title')).toHaveText('已放弃');
      |                                            ^ Error: expect(locator).toHaveText(expected) failed
  59  |   const result = await page.evaluate(() => ({ result: window.__settingsTestApp!.exportResult(),
  60  |     count: window.__settingsTestApp!.resultCount, pools: window.__settingsTestApp!.voicePools,
  61  |     more: window.__settingsTestApp!.session.surrender() }));
  62  |   expect(result.result).toMatchObject({ winner: 'enemy', endReason: 'surrender', economy: { gold: 0, souls: 0, gems: 0 } });
  63  |   expect(result.result!.defeatedExternalIds).toEqual([]);
  64  |   expect(result.count).toBe(1);
  65  |   expect(result.more).toEqual([]);
  66  |   expect(result.pools.some(p => p.startsWith('retreat.'))).toBe(true);
  67  |   expect(result.pools.some(p => p.startsWith('defeat.'))).toBe(false);
  68  |   await page.goto('/game.html#settings');
  69  |   await expect(page.locator('#masterVolume')).toHaveValue('50');
  70  |   await expect(page.locator('#musicVolume')).toHaveValue('30');
  71  |   await expect(page.locator('#narrationVolume')).toHaveValue('85');
  72  |   await expect(page.locator('#soundEffectsEnabled')).not.toBeChecked();
  73  |   await page.reload();
  74  |   await expect(page.locator('#masterVolume')).toHaveValue('50');
  75  |   expect(errors).toEqual([]);
  76  | });
  77  | 
  78  | test('opening settings holds queued enemy actions and abandonment cancels the queue', async ({ page }) => {
  79  |   await openBattle(page);
  80  |   await page.getByRole('button', { name: '战斗设置', exact: true }).click();
  81  |   const before = await page.evaluate(() => {
  82  |     const app = window.__settingsTestApp!;
  83  |     const state = app.getEngine().getState();
  84  |     state.activePlayer = 'Right' as typeof state.activePlayer;
  85  |     app.afterResolve();
  86  |     return state.actionLog.length;
  87  |   });
  88  |   await page.waitForTimeout(1900);
  89  |   expect(await page.evaluate(() => window.__settingsTestApp!.getEngine().getState().actionLog.length)).toBe(before);
  90  |   await page.getByRole('button', { name: '放弃本局' }).click();
  91  |   await page.getByRole('button', { name: '确认放弃' }).click();
  92  |   await expect(page.locator('.gop-title')).toHaveText('已放弃');
  93  |   await page.waitForTimeout(1300);
  94  |   expect(await page.evaluate(() => window.__settingsTestApp!.getEngine().getState().actionLog.length)).toBe(before);
  95  |   await page.evaluate(() => window.__settingsTestApp!.destroy());
  96  |   await expect(page.getByRole('button', { name: '战斗设置' })).toHaveCount(0);
  97  |   await expect(page.locator('dialog.battle-settings')).toHaveCount(0);
  98  | });
  99  | 
  100 | test('settings pauses a pending timeline, resumes without overlap, and cancel releases its promise', async ({ page }) => {
  101 |   await openBattle(page);
  102 |   await page.getByRole('button', { name: '战斗设置', exact: true }).click();
  103 |   await page.evaluate(() => {
  104 |     const app = window.__settingsTestApp!;
  105 |     const state = app.getEngine().getState();
  106 |     const victim = state.teams.Right.characters[0];
  107 |     app.player.onNarrationBatch = null;
  108 |     void app.player.play([{ type: 'skill-damage', casterId: state.teams.Left.characters[0].id,
  109 |       targetId: victim.id, range: 'single', damage: 0, resultingHp: victim.hp, resultingArmor: victim.armor }]);
  110 |   });
  111 |   expect(await page.evaluate(() => window.__settingsTestApp!.player.isPlaying())).toBe(true);
  112 |   await page.getByRole('button', { name: '返回战斗' }).click();
  113 |   expect(await page.evaluate(() => window.__settingsTestApp!.input.enabled)).toBe(false);
  114 |   await expect.poll(() => page.evaluate(() => window.__settingsTestApp!.player.isPlaying())).toBe(false);
  115 |   await page.evaluate(() => window.__settingsTestApp!.afterResolve());
  116 |   await page.getByRole('button', { name: '战斗设置', exact: true }).click();
  117 |   await page.evaluate(() => {
  118 |     const app = window.__settingsTestApp!;
  119 |     // A paused non-empty timeline must release an awaiting caller on cancellation.
  120 |     const state = app.getEngine().getState();
  121 |     const pending = app.player.play([{ type: 'game-over', winner: state.activePlayer }]);
  122 |     app.player.cancel();
  123 |     return pending;
  124 |   });
  125 |   expect(await page.evaluate(() => window.__settingsTestApp!.exportResult())).toBeNull();
  126 | });
  127 | 
  128 | test('mobile landscape settings and confirmation stay within the viewport', async ({ page }) => {
  129 |   await page.setViewportSize({ width: 844, height: 390 });
  130 |   await openBattle(page);
  131 |   await page.getByRole('button', { name: '战斗设置', exact: true }).click();
  132 |   const dialog = page.getByRole('dialog');
  133 |   await expect(dialog).toBeVisible();
  134 |   const box = await dialog.boundingBox();
  135 |   expect(box!.x).toBeGreaterThanOrEqual(0);
  136 |   expect(box!.y).toBeGreaterThanOrEqual(0);
  137 |   expect(box!.y + box!.height).toBeLessThanOrEqual(390);
  138 |   await page.screenshot({ path: 'artifacts/settings/battle-settings-mobile.png' });
  139 |   await dialog.getByRole('button', { name: '放弃本局' }).click();
  140 |   await expect(dialog.getByRole('button', { name: '继续战斗' })).toBeFocused();
  141 |   await page.keyboard.press('Escape');
  142 |   await expect(dialog.getByRole('heading')).toHaveText('战斗设置');
  143 |   await page.keyboard.press('Escape');
  144 |   await expect(dialog).not.toBeVisible();
  145 |   await expect(page.getByRole('button', { name: '战斗设置', exact: true })).toBeFocused();
  146 | });
  147 | 
  148 | test('closing settings resumes queued AI; a natural result takes precedence over surrender', async ({ page }) => {
  149 |   await openBattle(page);
  150 |   await page.getByRole('button', { name: '战斗设置', exact: true }).click();
  151 |   const before = await page.evaluate(() => {
  152 |     const app = window.__settingsTestApp!;
  153 |     const state = app.getEngine().getState();
  154 |     state.activePlayer = 'Right' as typeof state.activePlayer;
  155 |     app.afterResolve();
  156 |     return state.actionLog.length;
  157 |   });
  158 |   await page.getByRole('button', { name: '返回战斗' }).click();
```