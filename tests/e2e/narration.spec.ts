import { test, expect } from '@playwright/test';
import type { AudioManager } from '../../src/render/AudioManager';
import type { BattleNarrator } from '../../src/render/BattleNarrator';
import type { EventStreamPlayer } from '../../src/render/EventStreamPlayer';
import type { GameState } from '../../src/engine/GameState';
import type { NarrationClip } from '../../src/render/NarrationCatalog';

test('all finalized narration recordings decode in Chromium', async ({page}) => {
  await page.goto('/skills-test.html');
  const result = await page.evaluate(async () => {
    const path = '/src/render/NarrationCatalog.ts';
    const {NARRATION_CLIPS} = await import(/* @vite-ignore */ path) as typeof import('../../src/render/NarrationCatalog');
    const ctx = new AudioContext();
    const durations: number[] = [];
    for (const clip of NARRATION_CLIPS) {
      const response = await fetch(clip.url);
      if (!response.ok) throw new Error(clip.id);
      const decoded = await ctx.decodeAudioData(await response.arrayBuffer());
      durations.push(decoded.duration);
    }
    await ctx.close();
    return {count: durations.length, shortest: Math.min(...durations)};
  });
  expect(result.count).toBe(81);
  expect(result.shortest).toBeGreaterThan(0);
});

type RuntimeApp = {
  audio: AudioManager;
  narrator: BattleNarrator;
  player: EventStreamPlayer;
  getEngine(): {getState(): GameState};
  destroy(): void;
};

test('App routes a timed heavy hit to real voice playback and restores ducking on mute', async ({page}) => {
  await page.goto('/index.html');
  await page.waitForFunction(() => document.querySelectorAll('.gcard').length >= 6);
  await page.mouse.click(5, 5);
  await page.waitForFunction(() => {
    const app = (window as unknown as {__app: RuntimeApp}).__app;
    return (app.audio as unknown as {ctx: AudioContext}).ctx?.state === 'running';
  });
  const result = await page.evaluate(async () => {
    const app = (window as unknown as {__app: RuntimeApp}).__app;
    const state = app.getEngine().getState();
    // Exercise the actual App callback, director, GSAP timeline and audio buses, not an engine mutation.
    app.narrator.start(state);
    (app.narrator as unknown as {random: () => number}).random = () => 0;
    const left = state.teams.Left.characters[0], right = state.teams.Right.characters[0];
    const chosen: string[] = [];
    const originalPlay = app.audio.playNarration.bind(app.audio);
    app.audio.playNarration = (clip: NarrationClip, interrupt?: boolean) => {
      chosen.push(clip.pool); return originalPlay(clip, interrupt);
    };
    // Avoid rendering artificial damage; preserve the production narration batch hook.
    app.player.onBattleEvent = null;
    await app.player.play([{type: 'skill-damage', casterId: left.id, targetId: right.id,
      range: 'single', damage: right.hp + right.armor, resultingHp: 0, resultingArmor: 0}]);
    const buses = app.audio as unknown as {speaking: boolean; sfxBus: GainNode; narrationBus: GainNode; ctx: AudioContext};
    const until = performance.now() + 4000;
    while (!buses.speaking && performance.now() < until) await new Promise(r => setTimeout(r, 20));
    const speaking = buses.speaking;
    const ducked = buses.sfxBus.gain.value / buses.narrationBus.gain.value;
    app.audio.setMuted(true);
    const stopped = !app.audio.isNarrationBusy();
    const restored = buses.sfxBus.gain.value / buses.narrationBus.gain.value;
    const ctx = buses.ctx;
    app.destroy();
    return {chosen, speaking, ducked, stopped, restored, contextState: ctx.state};
  });
  expect(result.chosen).toEqual(['spell_heavy.ally']);
  expect(result.speaking).toBe(true);
  expect(result.ducked).toBeCloseTo(.55, 2);
  expect(result.stopped).toBe(true);
  expect(result.restored).toBeCloseTo(1, 2);
  expect(result.contextState).toBe('closed');
});
