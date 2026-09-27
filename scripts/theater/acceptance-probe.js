/** Browser-only instrumentation. Installed on a fresh theater page per scenario.
 * No production timing or effect code is modified. All player.play events count,
 * including gem clears, cascades, mana, trait reactions and replacements.
 */
export async function installAcceptanceProbe({ action = 'cast', stress = null } = {}) {
  const a = window.__theaterApp;
  const { gsap } = await import('gsap');
  const { AnimConfig } = await import('/src/render/AnimationConfig.ts');
  const { AiTargetChooser, prototypeChosenTargetMode } = await import('/src/engine/skills/targetChooser.ts');
  const { AiBranchChooser, skillChoices, selectSkillBranch } = await import('/src/engine/skills/branchChooser.ts');
  const { AiCellChooser } = await import('/src/engine/skills/cellChooser.ts');
  const { AiColorChooser } = await import('/src/engine/skills/colorChooser.ts');
  const { SeededRNG } = await import('/src/engine/rng.ts');
  const state = a.getEngine().getState();
  const caster = state.teams.Left.characters[0];
  const rng = new SeededRNG(42);
  const proto = a.registry.prototypes.get(caster.skillId);
  const choices = proto ? skillChoices(proto) : undefined;
  const selectedBranch = choices ? new AiBranchChooser().choose(choices.labels) : null;
  const inputProto = choices ? selectSkillBranch(proto, selectedBranch) : proto;
  a.branchPicker.pick = async () => selectedBranch;
  AnimConfig.globalScale = 1;
  a.stopIdle();
  a.startIdle = () => {}; // Ambient hint timers are outside the accepted action.
  a.confirmCast = async () => true;
  a.targetPicker.pick = async () => new AiTargetChooser().choose(prototypeChosenTargetMode(inputProto), state, caster.id, rng);
  a.cellPicker.pick = async (_card, _wrapper, _coords, _hint, accepts) => {
    if (accepts) {
      const color = new AiColorChooser().choose(state, caster.id);
      let chosen = null;
      state.board.forEach((gem, pos) => { if (!chosen && gem?.type.kind === 'color' && gem.type.color === color) chosen = pos; });
      return chosen;
    }
    return new AiCellChooser().choose(state, caster.id, rng);
  };
  if (stress === 'defeat') for (const ch of state.teams.Right.characters) { ch.hp = 1; ch.armor = 0; }
  if (stress === 'dot') for (const ch of state.teams.Right.characters) {
    ch.statuses.push({ id: 'poison', turns: 4, magnitude: 1 }, { id: 'burning', turns: 4, magnitude: 3 });
  }
  caster.mana = caster.manaCost;
  a.refreshTeams();

  const p = { started: false, done: false, action, stress, eventCounts: {}, segments: [], fx: [], events: [],
    engineMs: 0, timelineMs: 0, playbackMs: 0, inputReadyMs: null, visualCompleteMs: null,
    peakFrameFX: 0, errors: [], warnings: [], stageMs: {}, frameDeltas: [] };
  window.__acceptance = p;
  let start = 0, lastFrame = 0, lastVisualActivity = 0;
  const now = () => performance.now() - start;
  const activeFX = new Map();
  let observer;
  const startMeasurement = () => {
    if (p.started) return;
    p.started = true;
    start = performance.now();
    lastVisualActivity = start;
    observer = new MutationObserver(records => {
      for (const record of records) {
        for (const el of record.addedNodes) if (el instanceof HTMLElement && el.dataset.fx) {
          const config = AnimConfig.frameFX[el.dataset.fx];
          const entry = { name: el.dataset.fx, startMs: now(), durationMs: Number(el.dataset.fxDurationMs ?? config?.duration ?? 0), endMs: null,
            heavy: !!config && (config.duration >= 600 || config.displayH >= 250) };
          p.fx.push(entry); activeFX.set(el, entry);
          p.peakFrameFX = Math.max(p.peakFrameFX, activeFX.size);
          lastVisualActivity = performance.now();
        }
        for (const el of record.removedNodes) if (activeFX.has(el)) {
          activeFX.get(el).endMs = now(); activeFX.delete(el);
          lastVisualActivity = performance.now();
        }
      }
    });
    observer.observe(a.overlay, { childList: true, subtree: true });
    requestAnimationFrame(function frame(t) {
      if (p.done) return;
      if (lastFrame) p.frameDeltas.push(t - lastFrame);
      lastFrame = t;
      requestAnimationFrame(frame);
    });
  };
  const resolve = a.session.resolve.bind(a.session);
  a.session.resolve = function (...args) {
    startMeasurement();
    const before = performance.now();
    const events = resolve(...args);
    p.engineMs += performance.now() - before;
    return events;
  };
  const pass = a.session.passTurn.bind(a.session);
  a.session.passTurn = function (...args) {
    startMeasurement();
    const before = performance.now();
    const events = pass(...args);
    p.engineMs += performance.now() - before;
    return events;
  };
  const stage = e => {
    if (['gem-explode', 'gem-destroy', 'special-gem-trigger'].includes(e.type)) return 'gem-clear';
    if (['gravity', 'refill', 'elimination', 'reshuffle', 'gem-create', 'gem-transform'].includes(e.type)) return 'board-and-cascades';
    if (e.type === 'mana-gain') return 'mana';
    if (e.type === 'buff' && e.source === 'trait') return 'trait-buff';
    if (e.type.startsWith('status-')) return 'status';
    if (['summon', 'defeat', 'flee', 'troop-transform'].includes(e.type)) return 'roster-change';
    return 'skill-and-other';
  };
  const append = a.player.appendSegment.bind(a.player);
  a.player.appendSegment = function (tl, ev, index, ...rest) {
    const before = tl.duration();
    const childrenBefore = new Set(tl.getChildren(false, true, true));
    const result = append(tl, ev, index, ...rest);
    const childrenAdded = tl.getChildren(false, true, true).filter(child => !childrenBefore.has(child));
    const addedMs = (tl.duration() - before) * 1000;
    p.segments.push({ index, type: ev.type, source: ev.source ?? null, stage: stage(ev), startMs: childrenAdded.length ? Math.min(...childrenAdded.map(child => child.startTime())) * 1000 : null,
      endMs: childrenAdded.length ? Math.max(...childrenAdded.map(child => child.endTime())) * 1000 : null,
      parentEndBeforeMs: before * 1000, addedMs });
    p.stageMs[stage(ev)] = (p.stageMs[stage(ev)] ?? 0) + addedMs;
    return result;
  };
  const play = a.player.play.bind(a.player);
  a.player.play = async function (events) {
    startMeasurement();
    p.events.push(...events);
    for (const e of events) p.eventCounts[e.type] = (p.eventCounts[e.type] ?? 0) + 1;
    const before = performance.now();
    const promise = play(events);
    p.timelineMs += (a.player.timeline?.duration() ?? 0) * 1000;
    await promise;
    p.playbackMs += performance.now() - before;
    p.playbackEndMs = now();
  };
  const restore = a.restoreAfterCast.bind(a);
  a.restoreAfterCast = function () {
    restore();
    p.inputReadyMs = now(); // Legacy field: restore callback timestamp, see actualInputReadyMs.
    p.inputRestoreMs = p.inputReadyMs;
    p.actualInputReadyMs = a.input.enabled ? p.inputReadyMs : null;
    p.inputEnabled = a.input.enabled;
    p.finalState = state.state;
    p.fxAtInputReady = [...activeFX.values()].map(x => ({ ...x }));
    p.animationsAtInputReady = document.getAnimations().filter(x => x.playState === 'running' && x.effect?.getTiming().iterations !== Infinity)
      .map(x => ({ name: x.animationName ?? 'web-animation', target: x.effect?.target?.className ?? '',
        text: x.effect?.target?.textContent?.slice(0, 40) ?? '', timing: x.effect?.getComputedTiming() }));
  };
  const originalWarn = console.warn;
  console.warn = (...args) => { p.warnings.push(args.map(String).join(' ')); originalWarn(...args); };
  const finish = async () => {
    // Await only finite visual tails; persistent status overlays are intentionally infinite.
    // The quiet window establishes completion but is NOT added to visualCompleteMs.
    const deadline = performance.now() + 12000;
    let quietSince = 0;
    while (performance.now() < deadline) {
      const finite = document.getAnimations().filter(animation => {
        const iterations = animation.effect?.getTiming().iterations;
        return iterations !== Infinity && (animation.playState === 'running' || animation.pending);
      });
      const finiteTweens = gsap.globalTimeline.getChildren(true, true, false)
        .filter(tween => tween.isActive() && tween.repeat() !== -1 && tween.duration() > 0);
      if (!activeFX.size && !finite.length && !finiteTweens.length) {
        if (!quietSince) quietSince = performance.now();
        if (performance.now() - quietSince >= 180) break;
      } else {
        quietSince = 0;
        lastVisualActivity = performance.now();
      }
      await new Promise(requestAnimationFrame);
    }
    p.visualCompleteMs = Math.max(p.inputReadyMs ?? p.playbackEndMs ?? 0, lastVisualActivity - start);
    p.visualTailMs = Math.max(0, p.visualCompleteMs - (p.inputReadyMs ?? p.playbackEndMs ?? 0));
    p.totalMs = Math.max(p.inputReadyMs ?? 0, p.visualCompleteMs);
    p.tailTimedOut = !quietSince || performance.now() - quietSince < 180;
    p.fxBatches = {};
    for (const fx of p.fx) {
      const batches = p.fxBatches[fx.name] ??= [];
      const last = batches.at(-1);
      if (last && fx.startMs - last.startMs < 80) last.instances++;
      else batches.push({ startMs: fx.startMs, instances: 1 });
    }
    p.fxCounts = {};
    for (const fx of p.fx) p.fxCounts[fx.name] = (p.fxCounts[fx.name] ?? 0) + 1;
    p.flags = [];
    if (p.totalMs > 12000) p.flags.push('P1:full-chain-over-12s');
    else if (p.totalMs > 6000) p.flags.push('P2:full-chain-over-6s');
    if (p.visualTailMs > 100 && p.inputEnabled) p.flags.push('review:input-before-finite-visual-tail');
    if (p.tailTimedOut) p.flags.push('P1:visual-tail-timeout');
    for (const [name, count] of Object.entries(p.fxCounts)) {
      if (p.fxBatches[name].length >= 4 && p.fx.some(fx => fx.name === name && fx.heavy)) p.flags.push(`review:repeated-heavy:${name}:${count}`);
    }
    if (p.fxBatches.energy_burst?.some(b => b.instances >= 16)) p.flags.push('review:dense-simultaneous-explosions');
    if (p.warnings.length) p.flags.push('review:console-warnings');
    const accountedMs = Object.values(p.stageMs).reduce((sum, ms) => sum + ms, 0);
    if (Math.abs(accountedMs - p.timelineMs) > 1) p.errors.push('stage totals differ from whole event timeline');
    if (p.playbackEndMs > p.totalMs + 1) p.errors.push('measurement ended before event playback');
    if (action === 'cast' && p.finalState === 'AwaitingInput' && !p.inputEnabled) p.errors.push('cast completed but player input remained disabled');
    p.done = true;
    observer?.disconnect();
    console.warn = originalWarn;
  };
  p.run = async () => {
    try {
      if (action === 'pass') {
        const events = a.session.passTurn();
        await a.playEventsWithTail(events);
        a.refreshTeams();
        p.inputReadyMs = now(); p.finalState = state.state;
        p.inputEnabled = false; // Turn handoff probe, not a player cast.
        p.fxAtInputReady = [...activeFX.values()].map(x => ({ ...x }));
        p.animationsAtInputReady = document.getAnimations().filter(x => x.playState === 'running' && x.effect?.getTiming().iterations !== Infinity)
          .map(x => ({ name: x.animationName ?? 'web-animation', target: x.effect?.target?.className ?? '',
            text: x.effect?.target?.textContent?.slice(0, 40) ?? '', timing: x.effect?.getComputedTiming() }));
      } else {
        await a.castPlayerSkill(caster.id);
        const deadline = performance.now() + 3000;
        while (p.inputReadyMs === null && performance.now() < deadline) await new Promise(requestAnimationFrame);
        if (!p.started || p.inputReadyMs === null) p.errors.push('cast did not reach restoreAfterCast');
      }
      await finish();
    } catch (error) { p.errors.push(String(error?.stack ?? error)); p.done = true; observer?.disconnect(); }
  };
  return { skillId: caster.skillId, casterId: caster.id, selectedBranch, traits: caster.traitIds, actualSpeed: AnimConfig.globalScale };
}


/** Vite transforms this module import; bare imports inside page.evaluate do not resolve. */
export async function settleAcceptanceSetup() {
  const { gsap } = await import('gsap');
  const begin=performance.now(); let pending=0;
  do {
    pending=document.getAnimations().filter(a => a.effect?.getTiming().iterations !== Infinity && (a.playState==='running'||a.pending)).length
      + gsap.globalTimeline.getChildren(true,true,false).filter(t => t.isActive() && t.repeat()!==-1 && t.duration()>0).length;
    if (!pending) break;
    await new Promise(requestAnimationFrame);
  } while(performance.now()-begin<5000);
  return { excludedMs:performance.now()-begin, finiteAnimationsRemaining:pending };
}
