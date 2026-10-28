import { test, expect } from '@playwright/test';

for (const reducedMotion of ['reduce', 'no-preference'] as const) {
  test(`ST04 seed49 actual cards and summon-transform-death (${reducedMotion})`, async ({ page }) => {
    await page.emulateMedia({ reducedMotion });
    await page.route('**/__transform_acceptance__', route => route.fulfill({
      contentType: 'text/html', body: '<html><head></head><body></body></html>',
    }));
    await page.goto('/__transform_acceptance__');
    const result = await page.evaluate(async () => {
      const load = (path: string) => import(/* @vite-ignore */ path);
      const [{ App }, { TeamView }, { TurnEngine }, { BoardGenerator }, { SeededRNG }, { ExtensionRegistry }, { createGameState }, { PlayerSide }, catalog, effects] = await Promise.all([
        load('/src/render/App.ts'), load('/src/render/TeamView.ts'), load('/src/engine/TurnEngine.ts'),
        load('/src/engine/boardGen.ts'), load('/src/engine/rng.ts'), load('/src/engine/registry.ts'),
        load('/src/engine/GameState.ts'), load('/src/engine/types.ts'), load('/src/sillytavern/enemyBlueprint.ts'),
        load('/src/engine/skills/effects/summon.ts'),
      ]);
      const check = (value: unknown, message: string) => { if (!value) throw new Error(message); };
      const settle = async (el: HTMLElement) => {
        for (let pass = 0; pass < 8; pass++) {
          // WAAPI finished promises resolve before onfinish handlers start the next phase.
          await new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
          const animations = el.getAnimations({ subtree: true }).filter(animation => {
            const timing = animation.effect?.getComputedTiming();
            return timing && Number.isFinite(timing.endTime) && (animation.playState === 'running' || animation.pending);
          });
          if (!animations.length) return;
          await Promise.allSettled(animations.map(animation => animation.finished));
        }
        throw new Error('card animations did not settle');
      };
      const registry = new ExtensionRegistry(); catalog.registerAdaptedCatalog(registry);
      const rng = new SeededRNG(49); let gid = 1;
      const board = new BoardGenerator(rng, () => gid++).generate();
      const caster = { ...catalog.resolveAdaptedSummon('unit:6594'), id: 4, defeated: false, statuses: [] };
      const target = { ...catalog.resolveAdaptedSummon('unit:6000'), id: 0, defeated: false, statuses: [], hp: 99999, maxHp: 99999, armor: 99999 };
      const state = createGameState(board, { player: PlayerSide.Left, characters: [target] }, { player: PlayerSide.Right, characters: [caster] });
      // Construct real cards before the engine resolves the action, as App does.
      const left = new TeamView(state.teams.Left, PlayerSide.Left);
      const right = new TeamView(state.teams.Right, PlayerSide.Right);
      left.mount(document.body, 0, 0); right.mount(document.body, 200, 0);
      state.activePlayer = PlayerSide.Right; caster.mana = caster.manaCost;
      const engine = new TurnEngine(state, rng, () => gid++, registry);
      engine.skullChance = 0; engine.setSummonResolver(catalog.resolveAdaptedSummon);
      const app = {
        engine, leftTeamView: left, rightTeamView: right, showTraitActivations() {},
        viewOf: (side: string) => side === PlayerSide.Left ? left : right,
        cardOfChar: (id: number) => left.getCard(id) ?? right.getCard(id),
        portraitById: new Map(), removeAllStatusPersist() {}, audio: { play() {} },
        cardCenterInOverlay: () => null, cardPointInOverlay: () => null, playFrameFX() {},
      };
      const events = engine.castSkill(caster.id);
      const terminal = JSON.stringify(state.teams);
      const forms = events.filter((event: { type: string }) => event.type === 'troop-transform');
      check(forms.length === 2, 'expected two seed49 transforms');
      const seen = [];
      for (const event of forms) {
        App.prototype.onBattleEvent.call(app, event);
        const card = left.getCard(0);
        await settle(card.el);
        const shown = card.shownStats().stats;
        check(shown.hp === event.form.hp && shown.maxHp === event.form.maxHp, 'wrong event HP');
        check(shown.attack === event.form.attack && shown.armor === event.form.armor && shown.magic === event.form.magic, 'wrong form attributes');
        check(shown.manaCost === event.form.manaCost && shown.mana === event.form.mana, 'wrong form mana');
        check(card.el.getAttribute('aria-label').startsWith(event.form.name), 'wrong accessible form name');
        check(card.el.querySelector('.photo').style.backgroundImage.includes(event.form.portraitUrl), 'wrong portrait');
        check(JSON.stringify(card.gemColors) === JSON.stringify(event.form.colors), 'wrong mana colors');
        check(JSON.stringify(card.char.traitIds) === JSON.stringify(event.form.traitIds), 'wrong form traits');
        check(card.char.skillId === event.form.skillId, 'wrong form skill');
        check(JSON.stringify(state.teams) === terminal, 'presentation mutated terminal engine');
        seen.push({ name: event.form.name, hp: shown.hp, manaCost: shown.manaCost });
      }
      left.refreshAll();
      check(left.getCard(0).char === target, 'tail did not rebind actual actor');
      const ctx = { state, casterId: target.id, rng, nextGemId: () => gid++, resolveSummonRef: catalog.resolveAdaptedSummon };
      const summonEvents = effects.summonEffect({ source: { ref: 'unit:6600' } }).apply(ctx);
      const summonEvent = summonEvents.find((event: { type: string }) => event.type === 'summon');
      const summoned = state.teams.Left.characters.find((actor: { id: number }) => actor.id === summonEvent.characterId);
      const transformEvents = effects.transformTroopEffect({ targets: [summoned], ref: 'unit:6472' }).apply(ctx);
      summoned.hp = 0; summoned.defeated = true;
      state.teams.Left.characters.splice(state.teams.Left.characters.indexOf(summoned), 1);
      const terminalAfterDeath = JSON.stringify(state.teams);
      App.prototype.onBattleEvent.call(app, summonEvent);
      const summonedCard = left.getCard(summoned.id);
      check(summonedCard?.shownStats().stats.hp === 18 && !summonedCard.shownStats().stats.defeated, 'missing/later-state summon card');
      await settle(summonedCard.el);
      App.prototype.onBattleEvent.call(app, transformEvents[0]);
      await settle(summonedCard.el);
      check(summonedCard.shownStats().stats.hp === 32, 'wrong summoned transform HP');
      App.prototype.onBattleEvent.call(app, { type: 'defeat', characterId: summoned.id });
      check(!left.getCard(summoned.id), 'dead summoned card not removed');
      await settle(summonedCard.el);
      check(!summonedCard.el.isConnected, 'dead summoned card remains in DOM');
      check(JSON.stringify(state.teams) === terminalAfterDeath, 'summon/death playback mutated engine');
      return { seen, removedSummon: true, terminalUnchanged: true };
    });
    expect(result.seen).toEqual([
      { name: '\u53ec\u5524\u4f536600', hp: 18, manaCost: 10 },
      { name: '\u53ec\u5524\u4f536472', hp: 32, manaCost: 22 },
    ]);
    expect(result.removedSummon).toBe(true);
    expect(result.terminalUnchanged).toBe(true);
  });
}
