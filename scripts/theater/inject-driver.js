/**
 * 放映厅页内驱动器（窗口 G）——由 scripts/skill_theater.mjs 经 page.evaluate 注入。
 *
 * 职责：把「程序化放映一场战斗」所需的浏览器侧访问收敛到一个干净的 API（window.__theater）：
 *   - 复用主游戏真实链路：session.resolve（引擎行动入口）→ EventStreamPlayer.play（演出）→
 *     advanceTurnHud/refreshTeams（HUD 同步）。绝不直接调 playFrameFX/audio.play。
 *   - App/SkillTestPage 的 TS private 字段只在运行时访问（private 仅编译期），不修改任何 src 文件。
 *   - 事件流经 onEventsProduced 钩子旁路收集（trim 后可结构化克隆，供 evaluate 回传）。
 *
 * 动作模型（两段式，供 Node 侧在动画中途截图）：
 *   beginAct(action)   —— 同步受理行动（session.resolve），异步播放演出，返回受理结果；
 *   finishAct()        —— 等播放与收尾完成，回传裁剪后的事件流。
 * action 取 BattleAction（{type:'swap'|'cast'}）或字符串 'pass'（空过回合）。
 */
(function () {
  'use strict';

  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  function theApp() {
    const a = window.__theaterApp || (window.__testPage && window.__testPage.app);
    if (!a) throw new Error('theater: App 未就绪');
    return a;
  }

  function engine() {
    return theApp().getEngine();
  }

  function q() {
    return (window.__evq = window.__evq || []);
  }

  /** 事件流裁剪：批量数组（gravity/refill/elimination/gem-*）压成计数，控制回传体积 */
  function trimEvents(events) {
    return events.map((ev) => {
      const c = Object.assign({}, ev);
      if (c.type === 'gravity' || c.type === 'reshuffle') c.moves = (c.moves || []).length;
      else if (c.type === 'refill' || c.type === 'gem-create') c.spawns = (c.spawns || []).length;
      else if (c.type === 'elimination') { c.cells = (c.cells || []).length; }
      else if (c.type === 'gem-transform') c.changes = (c.changes || []).length;
      else if (c.type === 'gem-destroy' || c.type === 'gem-explode') c.cells = (c.cells || []).length;
      return c;
    });
  }

  function firstKinds(events, n) {
    const out = [];
    for (const ev of events) {
      if (out.length >= (n || 8)) break;
      out.push(ev.type);
    }
    return out;
  }

  async function playAndSettle(events, settleMs) {
    const a = theApp();
    if (events && events.length) {
      await a['player'].play(events);
      try { a['advanceTurnHud'](events); } catch (e) { /* HUD 非关键 */ }
    }
    a.refreshTeams();
    await sleep(settleMs === undefined ? 320 : settleMs);
  }

  // —— 动态加载引擎辅助模块（vite dev 直接服务 TS 源码）——
  let mods = null;
  async function ensureMods() {
    if (!mods) {
      mods = {
        colorChooser: await import('/src/engine/skills/colorChooser.ts'),
        targetChooser: await import('/src/engine/skills/targetChooser.ts'),
        cellChooser: await import('/src/engine/skills/cellChooser.ts'),
        traits: await import('/src/engine/traits.ts'),
      };
    }
    return mods;
  }

  /** 棋盘拍平：64 格 {row,col,gem:{k,c}}；k=kind，c=颜色名/skull/特殊宝石 kind */
  function grid() {
    const board = engine().getState().board;
    const out = [];
    board.forEach((gem, pos) => {
      let g = null;
      if (gem) {
        const t = gem.type;
        g = { k: t.kind };
        if (t.kind === 'color') g.c = t.color;
        else if (t.kind === 'skull') g.c = 'skull';
        else if (t.spec) g.c = t.spec.kind;
      }
      out.push({ row: pos.row, col: pos.col, gem: g });
    });
    return out;
  }

  function joinKeyAt(g, r, c) {
    for (const cell of g) {
      if (cell.row === r && cell.col === c) return cell.gem ? cell.gem.c : null;
    }
    return null;
  }

  function runLen(g, r, c, key, dr, dc) {
    let n = 0;
    for (;;) {
      r += dr; c += dc;
      if (joinKeyAt(g, r, c) !== null && joinKeyAt(g, r, c) === key) n += 1;
      else break;
    }
    return n;
  }

  function makesRun(g, r, c, key) {
    if (key === null) return false;
    const v = 1 + runLen(g, r, c, key, 1, 0) + runLen(g, r, c, key, -1, 0);
    if (v >= 3) return true;
    const h = 1 + runLen(g, r, c, key, 0, 1) + runLen(g, r, c, key, 0, -1);
    return h >= 3;
  }

  function swapped(g, a, b) {
    const g2 = g.map((cell) => Object.assign({}, cell));
    const ca = g2.find((x) => x.row === a.row && x.col === a.col);
    const cb = g2.find((x) => x.row === b.row && x.col === b.col);
    if (!ca || !cb) return g2;
    const t = ca.gem; ca.gem = cb.gem; cb.gem = t;
    return g2;
  }

  const T = {
    /** 页面就绪后调用一次：接管事件流旁路 + 统一法力上限（便于快速攒满） */
    install(opts) {
      const a = theApp();
      a.onEventsProduced = (events) => { q().push(...events); };
      const manaCost = (opts && opts.manaCost) || 3;
      try { a.setAllManaCost(manaCost); } catch (e) { /* 状态不对时忽略 */ }
      a.refreshTeams();
      return { ok: true };
    },

    /** 技能库 id 清单（排除调试键）。E 的内容批次落库后这里自动变多——扩展口子。 */
    skillIds() {
      const reg = theApp()['registry'];
      const out = [];
      reg.prototypes.forEach((_proto, key) => {
        if (!String(key).startsWith('__debug')) out.push(String(key));
      });
      return out.sort((x, y) => Number(x) - Number(y));
    },

    /** 技能是否需要玩家选择（选色/选目标/选宝石）——自动化驱动用 AI 选择器替代 */
    async protoFlags(spellId) {
      const m = await ensureMods();
      const proto = theApp()['registry'].prototypes.get(String(spellId));
      if (!proto) return { exists: false };
      return {
        exists: true,
        needsColor: m.colorChooser.prototypeNeedsColor(proto),
        targetMode: m.targetChooser.prototypeChosenTargetMode(proto),
        needsCell: m.cellChooser.prototypeNeedsCell(proto),
      };
    },

    /** 特质 code 是否在引擎注册表中（traits.json 与 TRAIT_LIBRARY 的对账口） */
    async traitKnown(code) {
      const m = await ensureMods();
      return m.traits.TRAIT_LIBRARY.some((t) => t.code === code);
    },

    /** 双方队伍 + 局面摘要（meta 落盘 / 断言用） */
    stateSummary() {
      const st = engine().getState();
      const team = (side) => ({
        side,
        storm: st.teams[side].storm ? {
          color: st.teams[side].storm.color, turns: st.teams[side].storm.turns,
          dropKind: st.teams[side].storm.dropKind || null,
        } : null,
        queue: (st.teams[side].summonQueue || []).length,
        characters: st.teams[side].characters.map((ch) => ({
          id: ch.id, name: ch.name, hp: ch.hp, maxHp: ch.maxHp, armor: ch.armor,
          attack: ch.attack, magic: ch.magic, mana: ch.mana, manaCost: ch.manaCost,
          defeated: ch.defeated, skillId: ch.skillId, traitIds: ch.traitIds || [],
          troopTypes: ch.troopTypes || [], colors: ch.colors,
          statuses: ch.statuses.map((s) => ({ id: s.id, turns: s.turns })),
        })),
      });
      return {
        activePlayer: String(st.activePlayer),
        state: String(st.state),
        teams: { Left: team('Left'), Right: team('Right') },
      };
    },

    /** 裁判复位：血线抬高防阵亡、清状态、清法力、清召唤队列（演出证据已先行落盘） */
    referee(opts) {
      const o = opts || {};
      const hpFloor = o.hp || 220;
      const st = engine().getState();
      let healed = 0; let clearedStatuses = 0;
      for (const side of ['Left', 'Right']) {
        const t = st.teams[side];
        for (const ch of t.characters) {
          if (ch.maxHp < hpFloor) ch.maxHp = hpFloor;
          if (!ch.defeated && ch.hp < hpFloor) { ch.hp = hpFloor; healed += 1; }
          if (ch.statuses.length) { clearedStatuses += ch.statuses.length; ch.statuses.length = 0; }
          ch.mana = 0;
        }
        if (t.summonQueue && t.summonQueue.length) t.summonQueue.length = 0;
      }
      theApp().refreshTeams();
      return { healed, clearedStatuses };
    },

    fillManaAll() {
      theApp().fillAllMana();
    },

    setMana(charId, n) {
      const st = engine().getState();
      for (const side of ['Left', 'Right']) {
        const ch = st.teams[side].characters.find((c) => c.id === charId);
        if (ch) { ch.mana = Math.max(0, Math.min(ch.manaCost, n)); }
      }
      theApp().refreshTeams();
    },

    /** 直接设定某角色当前血量（触发「回合开始回复」类特质前制造缺口用） */
    setHp(charId, hp) {
      const st = engine().getState();
      for (const side of ['Left', 'Right']) {
        const ch = st.teams[side].characters.find((c) => c.id === charId);
        if (ch) { ch.hp = Math.max(1, Math.min(ch.maxHp, hp)); }
      }
      theApp().refreshTeams();
    },

    /** 换某角色技能为库内 spellId（走 App.setDebugSkill 正式注册路径） */
    setSkillChar(charId, spellId) {
      const a = theApp();
      const proto = a['registry'].prototypes.get(String(spellId));
      if (!proto) return false;
      a.setDebugSkill(charId, proto);
      return true;
    },

    clearEvents() { window.__evq = []; },

    takeEvents() {
      const out = trimEvents(q());
      window.__evq = [];
      return out;
    },

    /**
     * 两段式行动（见文件头）。action: BattleAction | 'pass'。
     * 返回受理信息；演出完成经 finishAct() 等待。
     */
    beginAct(action, settleMs) {
      const a = theApp();
      const st = engine().getState();
      if (st.state !== 'AwaitingInput') {
        window.__actEvents = [];
        window.__act = Promise.resolve();
        window.__actError = 'state=' + String(st.state);
        return { accepted: false, count: 0, kinds: [], reason: 'state=' + String(st.state) };
      }
      let events;
      if (action === 'pass') events = a.session.passTurn();
      else if (action && (action.type === 'swap' || action.type === 'cast')) events = a.session.resolve(action);
      else {
        window.__actEvents = [];
        window.__act = Promise.resolve();
        window.__actError = '非法 action: ' + JSON.stringify(action);
        return { accepted: false, count: 0, kinds: [], reason: '非法 action: ' + JSON.stringify(action) };
      }
      // App 的正式路径在 resolve 后回调 onEventsProduced；这里等价补上，保证旁路完整
      if (events.length) q().push(...events);
      window.__actError = null;
      window.__actEvents = trimEvents(events);
      window.__act = playAndSettle(events, settleMs).catch((e) => { window.__actError = String(e && e.message || e); });
      return { accepted: events.length > 0, count: events.length, kinds: firstKinds(events) };
    },

    async finishAct() {
      if (window.__act) await window.__act;
      const out = { events: window.__actEvents || [], error: window.__actError || null };
      window.__actEvents = []; window.__act = null; window.__actError = null;
      return out;
    },

    /** 特殊刺激：就地改格子（走 gem-transform 演出管线）；不受理时返回 false 供 Node 侧重试 */
    async paint(changes) {
      const a = theApp();
      return await a.debugSetGems(changes);
    },

    /** 若行动方不是 side，用一次真实空过换边（事件照常入旁路） */
    async ensureActive(side, settleMs) {
      const st = engine().getState();
      if (String(st.activePlayer) === side || String(st.state) === 'GameOver') return { passed: false };
      const evs = st.state === 'AwaitingInput' ? theApp().session.passTurn() : [];
      await playAndSettle(evs, settleMs === undefined ? 260 : settleMs);
      q().push(...evs);
      return { passed: evs.length > 0 };
    },

    /** 找一个能凑出指定颜色三连的相邻交换（特质配色刺激用）；交换后落点必须是该色 */
    findSwapForColor(color) {
      const g = grid();
      for (const cell of g) {
        const { row, col } = cell;
        for (const [dr, dc] of [[0, 1], [1, 0]]) {
          const r2 = row + dr, c2 = col + dc;
          if (r2 > 7 || c2 > 7) continue;
          const ka = joinKeyAt(g, row, col);
          const kb = joinKeyAt(g, r2, c2);
          if (ka === null || kb === null || ka === kb) continue;
          const g2 = swapped(g, { row, col }, { row: r2, col: c2 });
          const landedA = joinKeyAt(g2, row, col) === color;
          const landedB = joinKeyAt(g2, r2, c2) === color;
          if ((landedA && makesRun(g2, row, col, color)) || (landedB && makesRun(g2, r2, c2, color))) {
            return { from: { row, col }, to: { row: r2, col: c2 } };
          }
        }
      }
      return null;
    },

    /** 找任意一个合法交换（棋盘已有预置连消时，任意交换都会被受理并触发结算） */
    findAnySwap() {
      const g = grid();
      for (const cell of g) {
        const { row, col } = cell;
        for (const [dr, dc] of [[0, 1], [1, 0]]) {
          const r2 = row + dr, c2 = col + dc;
          if (r2 > 7 || c2 > 7) continue;
          const ka = joinKeyAt(g, row, col);
          const kb = joinKeyAt(g, r2, c2);
          if (ka === null || kb === null || ka === kb) continue;
          const g2 = swapped(g, { row, col }, { row: r2, col: c2 });
          const keyA = joinKeyAt(g2, row, col);
          const keyB = joinKeyAt(g2, r2, c2);
          if (makesRun(g2, row, col, keyA) || makesRun(g2, r2, c2, keyB)) {
            return { from: { row, col }, to: { row: r2, col: c2 } };
          }
        }
      }
      return null;
    },

    grid,
  };

  window.__theater = T;
})();
