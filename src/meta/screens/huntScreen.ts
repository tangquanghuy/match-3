import { stoneName } from '../data/materials';
import { toast, toastHtml, topbarHtml } from '../shell/chrome';
import type { Screen, ShellCtx } from '../shell/screen';
import { isFailure } from '../gateway';
import { LOOT_ART } from './huntArt';
import {
  HUNT_START_TURNS,
  LOOT_LADDER,
  stonesFromMoves,
  type HuntGrant,
  type HuntMoveOk,
} from '../systems/treasureHunt';
import { HuntBoardScene } from '../../render/HuntBoardScene';
import { dailyArt } from '../shell/artAssets';
import type { TreasureHuntState } from '../state/schema';

const fmt = (n: number): string => n.toLocaleString('en-US');

function ladderHtml(): string {
  return LOOT_LADDER.map((row, index) => `
    <li><img src="${LOOT_ART[index]}" alt="" draggable="false"><div><b>${row.name}</b><small>${row.reward}</small></div></li>
  `).join('');
}

function grantLines(grant: HuntGrant): string {
  const rows: string[] = [];
  if (grant.gold) rows.push(`黄金 +${fmt(grant.gold)}`);
  if (grant.souls) rows.push(`灵魂 +${fmt(grant.souls)}`);
  if (grant.glory) rows.push(`荣耀 +${fmt(grant.glory)}`);
  if (grant.gems) rows.push(`宝石 +${fmt(grant.gems)}`);
  if (grant.goldKeys) rows.push(`金钥匙 +${fmt(grant.goldKeys)}`);
  for (const [key, n] of Object.entries(grant.traitstones)) {
    if (n > 0) rows.push(`${stoneName(key)} +${n}`);
  }
  return rows.map((line) => `<li>${line}</li>`).join('') || '<li>本次暂无奖励</li>';
}

export class HuntScreen implements Screen {
  private scene: HuntBoardScene | null = null;
  private root!: HTMLElement;
  private busy = false;
  private disposed = false;
  private ready = false;
  private generation = 0;
  private current: TreasureHuntState | null = null;
  private feedbackTimer: ReturnType<typeof setTimeout> | undefined;
  private abort = new AbortController();

  html(ctx: ShellCtx): string {
    const maps = ctx.save().materials.treasureMaps;
    return `${topbarHtml()}
      <div class="screen hunt-screen">
        <header class="hunt-toolbar">
          <a class="hunt-back" href="#map" aria-label="返回地图">‹ <span>地图</span></a>
          <div class="hunt-title"><img src="${dailyArt('hunt')}" alt=""><h1>寻宝</h1></div>
          <span class="hunt-maps" id="huntMaps">藏宝图 ${fmt(maps)}</span>
          <button class="hunt-help" id="huntHelp" type="button" aria-label="寻宝规则" aria-expanded="false">规则</button>
        </header>
        <div class="hunt-status" aria-live="polite">
          <span class="hunt-turns"><b id="huntTurns">${HUNT_START_TURNS}</b> 剩余步数</span>
          <span id="huntMoves">已走 0 步</span><span id="huntStones">特质石 0</span>
        </div>
        <section class="hunt-stage">
          <div class="hunt-board" id="huntBoard" data-ready="false" aria-busy="true"></div>
          <div class="hunt-feedback" id="huntFeedback" aria-live="polite"></div>
          <div class="hunt-gate" id="huntGate">
            <img class="hunt-cover-art" src="${dailyArt('hunt')}" alt="藏宝图">
            <h2>合成宝物，探寻金库</h2>
            <p>交换相邻宝物，三连合成更高一级。<br>步数用完后，结算棋盘上的全部宝物。</p>
            <button class="hunt-begin" id="huntBegin" type="button" disabled>棋盘加载中…</button>
            <small id="huntCost">每局消耗 1 张藏宝图</small>
          </div>
          <div class="hunt-result" id="huntResult" hidden>
            <h2>寻宝收获</h2><ul class="hunt-loot" id="huntLoot"></ul>
            <button class="hunt-again" id="huntAgain" type="button">再开一局 · 1 张藏宝图</button>
            <a class="hunt-back" href="#map">返回地图</a>
          </div>
        </section>
        <footer class="hunt-hint">三连 −1 步<span>·</span>四连不耗步<span>·</span>五连及以上 +1 步</footer>
        <dialog class="hunt-rules" id="huntRules" aria-labelledby="huntRulesTitle">
          <button id="huntCloseRules" class="hunt-close" aria-label="关闭规则">×</button>
          <h2 id="huntRulesTitle">寻宝规则</h2>
          <p>拖动交换，或依次点选相邻两格。三件相同宝物合成高一级，空位自动下落补齐。</p>
          <p>同一手按最大的合成组计算步数：三连消耗 1 步，四连不耗步，五连及以上增加 1 步。</p>
          <p>金库不可交换或继续合成。每完成 15 次交换，结算时额外获得 1 颗随机特质石。中途返回地图会保留进度。</p>
          <h3>每件宝物随机开出以下一项</h3><ol>${ladderHtml()}</ol>
        </dialog>
      </div>${toastHtml()}`;
  }

  private el<T extends HTMLElement = HTMLElement>(id: string): T { return this.root.querySelector<T>('#' + id)!; }

  mount(ctx: ShellCtx, root: HTMLElement): void {
    this.generation++;
    this.disposed = false;
    this.busy = false;
    this.ready = false;
    this.abort = new AbortController();
    this.root = root;
    this.current = ctx.save().treasureHunt;
    this.el('huntBegin').addEventListener('click', () => {
      if (!this.ready) void this.initialize(ctx); else void this.start(ctx);
    });
    this.el('huntAgain').addEventListener('click', () => void this.start(ctx));
    const dialog = this.el<HTMLDialogElement>('huntRules');
    this.el('huntHelp').addEventListener('click', () => { dialog.showModal(); this.el('huntHelp').setAttribute('aria-expanded', 'true'); });
    this.el('huntCloseRules').addEventListener('click', () => dialog.close());
    dialog.addEventListener('close', () => this.el('huntHelp').setAttribute('aria-expanded', 'false'));
    dialog.addEventListener('click', e => { if (e.target === dialog) { const r = dialog.getBoundingClientRect(); if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) dialog.close(); } });
    document.addEventListener('visibilitychange', () => this.scene?.setSuspended(document.hidden), { signal: this.abort.signal });
    void this.initialize(ctx);
  }

  private isCurrent(generation: number): boolean { return !this.disposed && generation === this.generation; }

  private async initialize(ctx: ShellCtx): Promise<void> {
    if (this.busy || this.disposed) return;
    const generation = this.generation;
    this.busy = true;
    this.el<HTMLButtonElement>('huntBegin').disabled = true;
    this.el('huntBegin').textContent = '棋盘加载中…';
    const scene = new HuntBoardScene(this.el('huntBoard'));
    this.scene = scene;
    try {
      await scene.init();
      if (!this.isCurrent(generation)) return;
      this.ready = true;
      this.el('huntBoard').dataset.ready = 'true';
      this.el('huntBoard').setAttribute('aria-busy', 'false');
      scene.onSwap = (a, b) => void this.swap(ctx, a, b);
      scene.onMerge = event => {
        const best = Math.max(...event.groups.map(g => g.consumed.length + 1));
        if (event.chainCount > 1) this.feedback(`${event.chainCount} 连锁`);
        else if (best >= 5) this.feedback('五连 · 额外步数');
        else if (best === 4) this.feedback('四连 · 保留步数');
      };
      scene.setSuspended(document.hidden);
      if (this.current) this.showBoard(this.current);
      else {
        const maps = ctx.save().materials.treasureMaps;
        this.el<HTMLButtonElement>('huntBegin').disabled = maps <= 0;
        this.el('huntBegin').textContent = maps > 0 ? '开始寻宝' : '藏宝图不足';
      }
    } catch {
      scene.dispose();
      if (this.isCurrent(generation)) { this.scene = null; this.ready = false; this.el('huntBoard').dataset.ready = 'false'; this.el('huntBegin').textContent = '加载失败，点击重试'; this.el<HTMLButtonElement>('huntBegin').disabled = false; }
    } finally { if (this.isCurrent(generation)) this.busy = false; }
  }

  private async start(ctx: ShellCtx): Promise<void> {
    if (this.busy || !this.ready || this.disposed) return;
    const generation = this.generation;
    this.busy = true;
    this.el<HTMLButtonElement>('huntBegin').disabled = true;
    this.el<HTMLButtonElement>('huntAgain').disabled = true;
    try {
      const begun = await ctx.gateway.startTreasureHunt();
      if (!this.isCurrent(generation)) return;
      ctx.refreshChrome();
      if (isFailure(begun.result)) { toast(begun.result.message); return; }
      this.el('huntResult').hidden = true;
      this.showBoard(begun.result.state);
      this.el('huntMaps').textContent = `藏宝图 ${fmt(ctx.save().materials.treasureMaps)}`;
    } catch { if (this.isCurrent(generation)) toast('连接中断，请重试'); }
    finally {
      if (this.isCurrent(generation)) this.busy = false;
      if (this.isCurrent(generation)) for (const id of ['huntBegin', 'huntAgain']) this.el<HTMLButtonElement>(id).disabled = ctx.save().materials.treasureMaps <= 0;
    }
  }

  private async swap(ctx: ShellCtx, from: number, to: number): Promise<void> {
    if (this.busy || this.disposed || !this.current || !this.scene) return;
    const generation = this.generation;
    this.busy = true;
    this.scene.enabled = false;
    this.el('huntBoard').setAttribute('aria-busy', 'true');
    let accepted: HuntMoveOk | null = null;
    try {
      const played = await ctx.gateway.playTreasureHunt(from, to);
      if (!this.isCurrent(generation)) return;
      if (isFailure(played.result)) {
        await this.scene.reject(from, to);
        if (this.isCurrent(generation)) this.feedback(played.result.message);
        return;
      }
      accepted = played.result;
      await this.scene.play(accepted.events);
      if (!this.isCurrent(generation)) return;
      this.acceptResult(ctx, accepted);
      if (accepted.shuffled) this.feedback('棋盘已重排');
    } catch {
      if (this.isCurrent(generation)) {
        // Reconcile from the gateway after a connection/playback error; never reroll a move locally.
        if (accepted) {
          this.acceptResult(ctx, accepted);
        } else {
          this.current = ctx.save().treasureHunt;
          if (this.current) { this.scene.sync(this.current.cells); this.paint(ctx); }
          this.feedback('连接中断，请重试');
        }
      }
    } finally {
      if (this.isCurrent(generation)) this.busy = false;
      if (this.isCurrent(generation)) { this.scene.enabled = this.current !== null; this.el('huntBoard').setAttribute('aria-busy', 'false'); }
    }
  }

  private acceptResult(ctx: ShellCtx, result: HuntMoveOk): void {
    this.current = { cells: result.cells, turns: result.turns, moves: result.moves, rng: result.rng };
    this.scene!.sync(result.cells);
    this.paint(ctx);
    if (result.over && result.grant) { this.current = null; this.showGrant(ctx, result.grant); }
  }

  private showBoard(state: TreasureHuntState): void {
    this.current = state;
    this.el('huntGate').hidden = true;
    this.scene!.sync(state.cells);
    this.scene!.enabled = true;
    this.scene!.startMusic();
    this.paintCounters();
  }

  private paintCounters(): void {
    if (!this.current) return;
    this.el('huntTurns').textContent = String(this.current.turns);
    this.el('huntMoves').textContent = `已走 ${this.current.moves} 步`;
    this.el('huntStones').textContent = `特质石 ${stonesFromMoves(this.current.moves)}`;
  }

  private paint(ctx: ShellCtx): void { this.paintCounters(); ctx.refreshChrome(); }
  private feedback(text: string): void {
    clearTimeout(this.feedbackTimer);
    this.el('huntFeedback').textContent = text;
    this.feedbackTimer = setTimeout(() => { if (!this.disposed) this.el('huntFeedback').textContent = ''; }, 1500);
  }

  private showGrant(ctx: ShellCtx, grant: HuntGrant): void {
    this.el('huntLoot').innerHTML = grantLines(grant);
    const maps = ctx.save().materials.treasureMaps;
    this.el<HTMLButtonElement>('huntAgain').disabled = maps <= 0;
    this.el('huntAgain').textContent = maps > 0 ? '再开一局 · 1 张藏宝图' : '藏宝图不足';
    this.el('huntResult').hidden = false;
    this.el<HTMLButtonElement>('huntAgain').focus();
  }

  dispose(): void {
    this.disposed = true;
    clearTimeout(this.feedbackTimer);
    this.abort.abort();
    this.el<HTMLDialogElement>('huntRules').close();
    this.scene?.dispose(); this.scene = null;
  }
}
