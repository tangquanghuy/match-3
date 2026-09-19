/**
 * 竞技场 · 现开赛（计划 §5.9 三屏合一）：报名 → 三轮 3 选 1 → 编队连战。
 * 全流程走 arena 系统（draft 卡即用即弃，不进收藏）；奖表/费用从 economy 派生。
 */
import { ARENA, ARENA_REWARDS, arenaDraftLevel } from '../data/economy';
import { getTroopById } from '../../data/troops';
import { currentDraftChoices } from '../systems/arena';
import { isFailure, weekStartOf } from '../gateway';
import { bottomNavHtml, gemSvg, mountIcons, toast, toastHtml, topbarHtml, $, $$ } from '../shell/chrome';
import type { Screen, ShellCtx } from '../shell/screen';
import { troopImg } from './teamScreen';

const fmt = (n: number): string => n.toLocaleString('en-US');
const ROMAN = ['Ⅰ', 'Ⅱ', 'Ⅲ'];

const RARITY_CLS: Record<number, string> = { 0: 'common', 1: 'common', 2: 'rare', 3: 'epic', 4: 'legend', 5: 'mythic' };
const RARITY_CN: Record<number, string> = { 0: '普 通', 1: '非 普', 2: '稀 有', 3: '超稀有', 4: '史 诗', 5: '传 说' };

export class ArenaScreen implements Screen {
  private ctx!: ShellCtx;
  private selectedPick: number | null = null;
  /** 编队阶段本地站位（draft 卡 id 序），展示与确认都用它 */
  private order: number[] = [];
  private listeners: Array<[EventTarget, string, EventListenerOrEventListenerObject]> = [];

  html(): string {
    const rewardsCopy = ARENA_REWARDS.map((r, i) => {
      const parts = [`黄金 ${fmt(r.gold)}`];
      if (r.gems) parts.push(`宝石 ${fmt(r.gems)}`);
      if (r.goldKeys) parts.push(`金钥匙 ×${r.goldKeys}`);
      const tag = i === 3 ? '完胜' : i === 2 ? '进阶' : i === 1 ? '回本' : '保底';
      return `<div class="prize${i === 3 ? ' featured' : ''}"><em>${i}</em><div><b>${i} 胜 · ${tag}</b><span>${parts.join(' · ')}</span></div><i>${tag}</i></div>`;
    }).join('');
    const matches = ARENA.opponentLevels
      .map(
        (lv, i) => `<div class="match ${i === 0 ? 'pending' : 'locked'}" data-match="${i}">
          <span class="match-no">${ROMAN[i]}</span>
          <div><b>第 ${i + 1} 战</b><small>对手 Lv.${lv} · ${ARENA.opponentSizes[i]} 人</small></div>
          <i class="match-state">待出战</i>
        </div>`,
      )
      .join('');
    return `
      ${topbarHtml()}
      <main class="screen arena-screen">
        <div class="arena-head">
          <div>
            <small>WEEKLY DRAFT ARENA</small>
            <h1>现 开 赛</h1>
          </div>
          <div class="ticket">
            <span data-icon="ticket"></span>
            <b id="ticketCopy">免费票 ×1</b>
            <small>本周首场免费 · 其后 宝石 ${ARENA.entryFeeGems}</small>
          </div>
        </div>

        <div class="steps" role="list">
          <button class="step on" data-step="signup" type="button">
            <span class="step-index">1</span>
            <span class="step-copy"><b>报名</b><small>规则与奖表</small></span>
          </button>
          <i class="step-rail" aria-hidden="true"></i>
          <button class="step" data-step="draft" type="button">
            <span class="step-index">2</span>
            <span class="step-copy"><b>现场抽卡</b><small>三轮 3 选 1</small></span>
          </button>
          <i class="step-rail" aria-hidden="true"></i>
          <button class="step" data-step="battle" type="button">
            <span class="step-index">3</span>
            <span class="step-copy"><b>编队连战</b><small>最多 ${ARENA.rounds} 场 AI</small></span>
          </button>
        </div>

        <section class="panel arena-panel" id="signup">
          <div class="panel-inner signup-grid">
            <div class="signup-copy">
              <small class="eyebrow">ENTER THE ARENA</small>
              <h2>一场定胜负的限定牌局</h2>
              <p>${ARENA.rounds} 轮现场抽卡，组成 ${ARENA.rounds} 人临时队伍，连续挑战 ${ARENA.rounds} 场难度递增的 AI。卡片仅在本场使用，赛毕自动清除，不会进入收藏。</p>
              <div class="kv-grid signup-kv">
                <div><small>报名费用</small><b id="feeCopy">免费票 ×1</b></div>
                <div><small>队伍限制</small><b>${ARENA.rounds} 人 · 无主角</b></div>
                <div><small>每轮选择</small><b>${ARENA.choicesPerRound} 选 1 · 稀有度阶梯收官 Epic+</b></div>
              </div>
              <button class="primary" id="enter" type="button">使用免费票报名 <span data-icon="arrow"></span></button>
              <button class="secondary" id="forfeit" type="button" hidden>弃赛（按已得胜场结算）</button>
            </div>
            <aside class="prize-card">
              <small>胜场奖表</small>
              ${rewardsCopy}
              <p>失败保留战斗内收集的灵魂。中途退出可弃赛，按已得胜场发奖。</p>
            </aside>
          </div>
        </section>

        <section class="panel arena-panel" id="draft" hidden>
          <div class="panel-inner draft-layout">
            <div class="draft-top">
              <div>
                <small class="eyebrow">DRAFT ROUND <b id="round">1</b> / ${ARENA.rounds}</small>
                <h2>选择一张加入临时牌组</h2>
              </div>
              <span class="draft-note" id="bandNote">本轮档位：—</span>
            </div>
            <div class="draft-cards" id="draftCards"></div>
            <div class="draft-foot">
              <div class="picked-strip">
                <small>已锁定</small>
                <div class="picked-slots" id="pickedSlots"></div>
              </div>
              <button class="primary" id="nextDraft" type="button" disabled>确认选择</button>
            </div>
          </div>
        </section>

        <section class="panel arena-panel" id="battle" hidden>
          <div class="panel-inner battle-grid">
            <div class="lineup-col">
              <div class="battle-head">
                <div>
                  <small class="eyebrow">DRAFTED TEAM</small>
                  <h2>限定编队</h2>
                </div>
              </div>
              <div class="run-slots" id="draftTeam"></div>
              <p class="lineup-hint">队首吃骷髅 · ▲▼ 调整站位（draft 卡按稀有度档上限满配出战）</p>
            </div>
            <div class="gauntlet-col">
              <div class="battle-head">
                <div>
                  <small class="eyebrow">ARENA RUN</small>
                  <h2>三战之路</h2>
                </div>
                <span class="run-score">胜场 <b id="wins">0</b> / ${ARENA.rounds}</span>
              </div>
              <div class="gauntlet" id="gauntlet">${matches}</div>
              <div class="battle-note"><span data-icon="lock"></span>主角不出战 · 本场卡组将在赛毕清除</div>
              <div class="battle-actions">
                <button class="secondary" id="clearDraft" type="button">弃赛</button>
                <button class="primary" id="fight" type="button"><span data-icon="swords"></span><span id="fightLabel">开始第 1 场</span></button>
              </div>
            </div>
          </div>
        </section>
      </main>
      ${bottomNavHtml('', '现开赛卡组独立')}
      ${toastHtml()}`;
  }

  mount(ctx: ShellCtx): void {
    this.ctx = ctx;
    this.bind('#enter', 'click', () => void this.enter());
    this.bind('#nextDraft', 'click', () => void this.confirmPick());
    this.bind('#fight', 'click', () => void this.fight());
    this.bind('#clearDraft', 'click', () => void this.forfeit());
    this.bind('#forfeit', 'click', () => void this.forfeit());
    this.on($('#draftTeam'), 'click', (e) => this.shiftClicked(e));
    this.render();
  }

  private draft() {
    return this.ctx.save().arena.activeDraft;
  }

  private render(): void {
    const draft = this.draft();
    const stage = !draft ? 'signup' : draft.stage === 'picking' ? 'draft' : 'battle';
    this.show(stage);
    if (stage === 'signup') this.renderSignup();
    if (stage === 'draft') this.renderDraft();
    if (stage === 'battle') this.renderBattle();
  }

  private show(id: 'signup' | 'draft' | 'battle'): void {
    const order = ['signup', 'draft', 'battle'] as const;
    (['signup', 'draft', 'battle'] as const).forEach((k) => {
      const el = $('#' + k);
      el.hidden = k !== id;
    });
    const idx = order.indexOf(id);
    const activeDraft = this.draft();
    $$('.step').forEach((step, i) => {
      const reached = activeDraft ? (activeDraft.stage === 'fighting' ? 2 : activeDraft.stage === 'building' ? 2 : 1) >= i : i === 0;
      step.classList.toggle('on', i === idx);
      step.classList.toggle('done', i < idx && reached);
      const indexEl = step.querySelector<HTMLElement>('.step-index');
      if (indexEl) indexEl.textContent = i < idx ? '✓' : String(i + 1);
    });
  }

  private renderSignup(): void {
    const save = this.ctx.save();
    const free = save.arena.lastFreeEntryAt < weekStartOf(Date.now());
    $('#ticketCopy').textContent = free ? '免费票 ×1' : '本周免费已用';
    $('#feeCopy').textContent = free ? '免费票 ×1' : `宝石 ${ARENA.entryFeeGems}`;
    ($('#enter') as HTMLButtonElement).disabled = false;
    ($('#enter').querySelector('span') as HTMLElement | null);
    $('#forfeit').hidden = !save.arena.activeDraft;
  }

  private renderDraft(): void {
    const state = currentDraftChoices(this.ctx.save());
    this.selectedPick = null;
    ($('#nextDraft') as HTMLButtonElement).disabled = true;
    const draft = this.draft();
    if (!state || !draft) return;
    $('#round').textContent = String(draft.picked.length + 1);
    const band = ARENA.roundBands[Math.min(draft.picked.length, ARENA.roundBands.length - 1)]!;
    const bandNote = $('#bandNote');
    if (bandNote) bandNote.textContent = `本轮档位：${RARITY_CN[band.min] ?? band.min} ~ ${RARITY_CN[band.max] ?? band.max}`;
    const cardsEl = $('#draftCards');
    cardsEl.innerHTML = state.options
      .map((o, i) => {
        const troop = getTroopById(o.troopId);
        if (!troop) return '';
        const cls = RARITY_CLS[o.rarityIdx] ?? 'common';
        return `<button class="draft-card r-${cls}" data-i="${i}" type="button">
          ${troopImg(troop, false, `alt="${troop.name}"`)}
          <span class="shade"></span>
          <span class="mana">${gemSvg(troop.manaColors.map((c) => c.toLowerCase()))}<i>${troop.manaCost}</i></span>
          <b class="rarity">${RARITY_CN[o.rarityIdx] ?? ''}</b>
          <h3>${troop.name}</h3>
          <small>${troop.kingdom ?? '无王国'} · 满配 Lv.${arenaDraftLevel(o.rarityIdx)} · 临时卡</small>
          <i class="pick-flag">已选</i>
        </button>`;
      })
      .join('');
    this.renderPicked(draft.picked);
    $$('#draftCards .draft-card').forEach((btn) =>
      this.on(btn, 'click', () => {
        $$('#draftCards .draft-card').forEach((el) => el.classList.remove('selected'));
        btn.classList.add('selected');
        this.selectedPick = Number((btn as HTMLElement).dataset.i);
        ($('#nextDraft') as HTMLButtonElement).disabled = false;
      }),
    );
  }

  private renderPicked(picked: number[]): void {
    const slots = [0, 1, 2]
      .map((i) => {
        const troop = picked[i] !== undefined ? getTroopById(picked[i]!) : null;
        if (!troop) return '<div class="picked-slot"></div>';
        return `<div class="picked-slot filled">${troopImg(troop, false, `alt="${troop.name}"`)}</div>`;
      })
      .join('');
    $('#pickedSlots').innerHTML = slots;
  }

  private async confirmPick(): Promise<void> {
    const state = currentDraftChoices(this.ctx.save());
    if (!state || this.selectedPick === null) return;
    const option = state.options[this.selectedPick];
    if (!option) return;
    const { result } = await this.ctx.gateway.pickDraftCard(option.troopId);
    if (isFailure(result)) {
      toast(result.message);
      return;
    }
    const draft = this.draft();
    if (result.done || !draft || draft.stage !== 'picking') {
      this.order = draft?.picked ? [...draft.picked] : [];
      toast('牌组完成，进入编队连战。');
    } else {
      toast(`第 ${result.round} 轮可选，继续抽卡。`);
    }
    this.render();
  }

  private renderBattle(): void {
    const draft = this.draft();
    if (!draft) return;
    this.order = draft.picked.length === ARENA.rounds ? (this.order.length === ARENA.rounds ? this.order : [...draft.picked]) : [...draft.picked];
    this.order = this.normalizeOrder();
    const teamEl = $('#draftTeam');
    teamEl.innerHTML = this.order
      .map((id, i) => {
        const troop = getTroopById(id);
        if (!troop) return '';
        const level = arenaDraftLevel(troop.rarityIdx);
        return `<div class="run-slot">
          ${troopImg(troop, false, `alt="${troop.name}"`)}
          <div class="slot-body">
            <b>${troop.name}</b>
            <span>${RARITY_CN[troop.rarityIdx] ?? ''} · 耗蓝 ${troop.manaCost} · Lv.${level} 满配</span>
          </div>
          <span class="pos${i === 0 ? ' skull' : ''}">${i + 1}${i === 0 ? '<span data-icon="skull"></span>' : ''}</span>
          <div class="shift" role="group" aria-label="${troop.name} 站位调整">
            <button type="button" data-shift="up" data-i="${i}" aria-label="${troop.name} 前移一位" title="前移一位"${i === 0 ? ' disabled' : ''}>▲</button>
            <button type="button" data-shift="down" data-i="${i}" aria-label="${troop.name} 后移一位" title="后移一位"${i === this.order.length - 1 ? ' disabled' : ''}>▼</button>
          </div>
        </div>`;
      })
      .join('');
    mountIcons(teamEl);

    // 连战进度
    const wins = draft.wins;
    $('#wins').textContent = String(wins);
    const gauntlet = $('#gauntlet');
    gauntlet.innerHTML = ARENA.opponentLevels
      .map((lv, i) => {
        const done = i < wins;
        const current = draft.stage === 'fighting' ? i === wins : i === 0;
        const cls = done ? 'done' : current ? 'pending' : 'locked';
        const state = done ? '胜利' : current && draft.stage === 'fighting' ? '待出战' : '尚未开始';
        return `<div class="match ${cls}" data-match="${i}">
          <span class="match-no">${ROMAN[i]}</span>
          <div><b>第 ${i + 1} 战</b><small>对手 Lv.${lv} · ${ARENA.opponentSizes[i]} 人</small></div>
          <i class="match-state">${state}</i>
        </div>`;
      })
      .join('');
    $('#fightLabel').textContent = draft.stage === 'building' ? `开始第 1 场` : `开始第 ${wins + 1} 场`;
    ($('#clearDraft') as HTMLButtonElement).textContent = '弃赛';
  }

  private normalizeOrder(): number[] {
    const draft = this.draft();
    if (!draft) return [];
    const valid = this.order.filter((id) => draft.picked.includes(id));
    const missing = draft.picked.filter((id) => !valid.includes(id));
    return [...valid, ...missing];
  }

  private shiftClicked(e: Event): void {
    const btn = (e.target as HTMLElement).closest('[data-shift]') as HTMLElement | null;
    if (!btn) return;
    const i = Number(btn.dataset.i);
    const dir = btn.dataset.shift === 'up' ? -1 : 1;
    const j = i + dir;
    if (j < 0 || j >= this.order.length) return;
    [this.order[i], this.order[j]] = [this.order[j]!, this.order[i]!];
    void this.applyOrder();
  }

  private async applyOrder(): Promise<void> {
    const { result } = await this.ctx.gateway.arrangeDraftTeam(this.order);
    if (isFailure(result)) toast(result.message);
    this.renderBattle();
  }

  private async enter(): Promise<void> {
    const now = Date.now();
    const { result } = await this.ctx.gateway.enterArena(now, weekStartOf(now));
    if (isFailure(result)) {
      toast(result.message);
      return;
    }
    toast(result ? '报名成功（本周免费票），开始第 1 轮现开。' : `报名成功：宝石 −${ARENA.entryFeeGems}。开始第 1 轮现开。`);
    this.render();
  }

  private async fight(): Promise<void> {
    const draft = this.draft();
    if (!draft) return;
    if (draft.stage === 'building') {
      // 先落库站位，再进入连战
      const { result } = await this.ctx.gateway.arrangeDraftTeam(this.normalizeOrder());
      if (isFailure(result)) {
        toast(result.message);
        return;
      }
      const started = await this.ctx.gateway.startDraftBattles();
      if (isFailure(started.result)) {
        toast(started.result.message);
        return;
      }
    }
    await this.ctx.launchArenaBattle();
  }

  private async forfeit(): Promise<void> {
    const draft = this.draft();
    if (!draft) return;
    if (!confirm('确定弃赛吗？按已得胜场发奖，卡组清除。')) return;
    const { result } = await this.ctx.gateway.forfeitDraft();
    if (isFailure(result)) {
      toast(result.message);
      return;
    }
    toast(`弃赛收官：${result.wins} 胜 · 黄金 +${fmt(result.rewards.gold)}${result.rewards.gems ? ` · 宝石 +${fmt(result.rewards.gems)}` : ''}${result.rewards.goldKeys ? ` · 金钥匙 ×${result.rewards.goldKeys}` : ''}`);
    this.order = [];
    this.render();
  }

  private on(target: EventTarget, type: string, fn: EventListenerOrEventListenerObject): void {
    target.addEventListener(type, fn);
    this.listeners.push([target, type, fn]);
  }

  private bind(selector: string, type: string, fn: EventListenerOrEventListenerObject): void {
    const el = $(selector);
    if (el) this.on(el, type, fn);
  }

  dispose(): void {
    for (const [target, type, fn] of this.listeners.splice(0)) {
      target.removeEventListener(type, fn);
    }
  }
}
