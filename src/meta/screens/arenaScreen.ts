import './arenaDraft.css';
import { arenaStatsMarkup, arenaTroopDetailMarkup } from './arenaPresentation';
import { escapeHtml } from './troopCard';
/**
 * 竞技场 · 现开赛（计划 §5.9 三屏合一）：报名 → 四轮 3 选 1 → 编队连战。
 * 全流程走 arena 系统（draft 卡即用即弃，不进收藏）；奖表/费用从 economy 派生。
 */
import { ARENA, ARENA_REWARDS, arenaDraftLevel } from '../data/economy';
import { RARITY_CLASS_NAMES as RARITY_CLS } from '../data/rarity';
import { getTroopById } from '../../data/troops';
import { currentDraftChoices, arenaOpponentPreview, arenaUnlocked } from '../systems/arena';
import { isFailure } from '../gateway';
import { bottomNavHtml, gemSvg, mountIcons, toast, toastHtml, topbarHtml, $, $$ } from '../shell/chrome';
import { bindTermTips } from '../shell/termTip';
import type { Screen, ShellCtx } from '../shell/screen';
import { troopImg } from './teamScreen';

const fmt = (n: number): string => n.toLocaleString('en-US');
const ROMAN = ['Ⅰ', 'Ⅱ', 'Ⅲ', 'Ⅳ', 'Ⅴ', 'Ⅵ'];
const RARITY_CN = ARENA.rarityLabels;

const MANA_CN: Record<string, string> = { red: '红', green: '绿', blue: '蓝', yellow: '黄', purple: '紫', brown: '棕' };

function arenaTroopImg(troop: Parameters<typeof troopImg>[0], attrs: string): string {
  return troopImg(troop, false, attrs).replace('loading="lazy"', 'loading="eager"');
}

function manaConflict(ids: readonly number[], candidateId: number): string[] {
  const candidate = getTroopById(candidateId);
  if (!candidate) return [];
  const pickedColors = new Set(
    ids.flatMap((id) => getTroopById(id)?.manaColors.map((color) => String(color).toLowerCase()) ?? []),
  );
  return [...new Set(candidate.manaColors.map((color) => String(color).toLowerCase()).filter((color) => pickedColors.has(color)))];
}

export class ArenaScreen implements Screen {
  private ctx!: ShellCtx;
  private selectedPick: number | null = null;
  private picking = false;
  private termTipsDetail?: () => void;
  /** 编队阶段本地站位（draft 卡 id 序），展示与确认都用它 */
  private order: number[] = [];
  private listeners: Array<[EventTarget, string, EventListenerOrEventListenerObject]> = [];
  private termTipsDraft?: () => void;
  private ticketTimer: number | null = null;
  private arranging = false;
  private starting = false;
  private mounted = false;

  html(ctx: ShellCtx, param?: string): string {
    if (param?.startsWith('detail/')) return this.detailHtml(ctx, Number(param.slice(7)));
    const showcase = [6029, 7478, 6194]
      .map((id) => getTroopById(id))
      .filter((troop) => troop !== undefined);
    const showcaseArt = showcase
      .map(
        (troop, i) => `<figure class="arena-marquee-unit unit-${i + 1}">
          ${arenaTroopImg(troop, `alt="${troop.name}"`)}
          <figcaption>${troop.name}</figcaption>
        </figure>`,
      )
      .join('');
    const rewardsCopy = ARENA_REWARDS.map((r, i) => {
      const parts = [`黄金 ${fmt(r.gold)}`];
      if (r.souls) parts.push(`灵魂 ${fmt(r.souls)}`);
      if (r.gloryKeys) parts.push(`荣耀钥匙 ×${r.gloryKeys}`);
      if (r.trophies) parts.push(`公会奖杯 ${r.trophies}`);
      const tag = i === ARENA.winsToFinish ? '完胜' : i >= 3 ? '进阶' : '基础';
      return `<div class="prize${i === ARENA.winsToFinish ? ' featured' : ''}" data-wins="${i}"><em>${i}</em><div class="prize-copy"><b>${i} 胜</b><small class="prize-tier">${tag}</small><span class="prize-rewards">${parts.join(' · ')}</span></div></div>`;
    }).reverse().join('');
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
            <h1>现 开 赛</h1>
          </div>
          <div class="ticket">
            <span data-icon="ticket"></span>
            <b id="ticketCopy">黄金 1,000</b>
            <small id="ticketRule">每届报名 · 黄金 ${ARENA.entryFeeGold}</small>
            <small id="ticketReset">固定15级 · 无特质</small>
          </div>
        </div>

        <div class="steps" role="list">
          <div class="step on" data-step="signup" role="listitem" aria-current="step">
            <span class="step-index">1</span>
            <span class="step-copy"><b>报名</b><small>规则与奖表</small></span>
          </div>
          <i class="step-rail" aria-hidden="true"></i>
          <div class="step" data-step="draft" role="listitem">
            <span class="step-index">2</span>
            <span class="step-copy"><b>现场抽卡</b><small>四轮 3 选 1</small></span>
          </div>
          <i class="step-rail" aria-hidden="true"></i>
          <div class="step" data-step="battle" role="listitem">
            <span class="step-index">3</span>
            <span class="step-copy"><b>编队连战</b><small>六胜或两败结束</small></span>
          </div>
        </div>

        ${toastHtml()}
        <section class="panel arena-panel" id="signup">
          <div class="panel-inner signup-grid">
            <div class="signup-stage">
              <div class="arena-marquee" aria-label="本周竞技场参赛阵容展示">
                <div class="arena-marquee-art">${showcaseArt}</div>
                <div class="arena-marquee-mark" aria-hidden="true"><span data-icon="swords"></span></div>
              </div>
              <div class="signup-copy">
                <h2>现场组牌，四人现开</h2>
                <p>${ARENA.rounds} 轮各选一张临时卡，挑战同规则的四人队，六胜或两败结束。本届牌组赛后清除，不影响收藏。</p>
                <div class="signup-kv" aria-label="竞技场规则摘要">
                  <div><small>报名</small><b id="feeCopy">黄金 1,000</b></div>
                  <div><small>阵容</small><b>${ARENA.rounds} 人 · 无主角</b></div>
                  <div><small>选牌</small><b>${ARENA.choicesPerRound} 选 1 · 四轮</b></div>
                </div>
                <div class="signup-actions">
                  <button class="primary" id="enter" type="button"><span id="enterLabel">支付黄金报名</span><span data-icon="arrow"></span></button>
                  <button class="secondary" id="forfeit" type="button" hidden>弃赛（按已得胜场结算）</button>
                </div>
              </div>
            </div>
            <aside class="prize-card">
              <header><small>本届奖励</small><b>胜场奖表</b></header>
              ${rewardsCopy}
              <p>失败保留战斗内收集的灵魂。中途退出可弃赛，按已得胜场发奖。</p>
            </aside>
          </div>
        </section>

        <section class="panel arena-panel" id="draft" hidden>
          <div class="panel-inner draft-layout">
            <div class="draft-top">
              <div>
                <small class="eyebrow">第 <b id="round">1</b> / ${ARENA.rounds} 轮</small>
                <h2>挑选你的部队</h2>
              </div>
              <span class="draft-note" id="bandNote">本轮档位：—</span>
            </div>
            <div class="arena-draft-workspace">
              <div class="arena-candidates">
                <div class="draft-cards" id="draftCards"></div>
              </div>
              <div class="arena-draft-footer">
                <aside class="arena-roster" aria-label="本届阵容">
                  <header><h3>本届阵容</h3><small id="pickedLabel">已锁定 0/${ARENA.rounds}</small></header>
                  <div class="picked-slots" id="pickedSlots"></div>
                </aside>
                <div class="draft-foot">
                  <span id="draftSelectionHint" aria-live="polite">选择本轮部队</span>
                  <button class="primary" id="nextDraft" type="button" disabled>确认选择</button>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section class="panel arena-panel" id="battle" hidden>
          <div class="panel-inner battle-grid">
            <div class="lineup-col">
              <div class="battle-head">
                <div>
                  <h2>限定编队</h2>
                </div>
              </div>
              <div class="run-slots" id="draftTeam"></div>
              <p class="lineup-hint">队首吃骷髅 · ▲▼ 调整站位（双方固定 15 级 · 无特质 · 无外部加成）</p>
            </div>
            <div class="gauntlet-col">
              <div class="battle-head">
                <div>
                  <h2>六胜挑战</h2>
                </div>
                <span class="run-score">胜场 <b id="wins">0</b> / ${ARENA.winsToFinish} · 败场 <b id="losses">0</b> / ${ARENA.lossesToFinish}</span>
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
      <div class="arena-modal-veil" id="forfeitModal" hidden>
        <section class="arena-confirm" role="dialog" aria-modal="true" aria-labelledby="forfeitTitle">
          <h2 id="forfeitTitle">确定弃赛？</h2>
          <p id="forfeitCopy">当前牌组会清除，并按已得胜场自动发奖。</p>
          <div class="forfeit-reward" id="forfeitReward"></div>
          <div class="arena-confirm-actions">
            <button class="secondary" id="cancelForfeit" type="button">继续挑战</button>
            <button class="danger-primary" id="confirmForfeit" type="button"><span data-icon="flag"></span>确认弃赛</button>
          </div>
        </section>
      </div>
      ${bottomNavHtml('', '现开赛卡组独立')}`;
  }

  mount(ctx: ShellCtx, root: HTMLElement, param?: string): void {
    this.ctx = ctx;
    this.mounted = true;
    if (param?.startsWith('detail/')) {
      this.bind('#arenaDetailBack', 'click', () => ctx.navigate('#arena'));
      this.termTipsDetail = bindTermTips(root);
      root.querySelector<HTMLElement>('#arenaDetailTitle')?.focus({ preventScroll: true });
      return;
    }
    this.bind('#enter', 'click', () => void this.enter());
    this.bind('#nextDraft', 'click', () => void this.confirmPick());
    this.bind('#fight', 'click', () => void this.fight());
    this.bind('#clearDraft', 'click', () => this.openForfeitModal());
    this.bind('#forfeit', 'click', () => this.openForfeitModal());
    this.bind('#cancelForfeit', 'click', () => this.closeForfeitModal());
    this.bind('#confirmForfeit', 'click', () => void this.forfeit());
    this.on(document, 'keydown', (event) => {
      if ((event as KeyboardEvent).key === 'Escape' && !$('#forfeitModal').hidden) this.closeForfeitModal();
    });
    this.on($('#draftTeam'), 'click', (e) => {
      const inspect = (e.target as HTMLElement).closest<HTMLElement>('[data-inspect-troop]');
      if (inspect) this.openTroopDetail(Number(inspect.dataset.inspectTroop), `[data-inspect-troop="${inspect.dataset.inspectTroop}"]`);
      else this.shiftClicked(e);
    });
    this.bind('#pickedSlots', 'click', (e) => {
      const slot = (e.target as HTMLElement).closest<HTMLElement>('[data-roster-troop]');
      if (!slot) return;
      this.openTroopDetail(Number(slot.dataset.rosterTroop), `[data-roster-troop="${slot.dataset.rosterTroop}"]`);
    });
    if (this.ticketTimer !== null) window.clearInterval(this.ticketTimer);
    this.ticketTimer = window.setInterval(() => this.updateTicketCopy(), 60_000);
    this.render();
    try {
      const focus = sessionStorage.getItem('arena.ui.focus');
      sessionStorage.removeItem('arena.ui.focus');
      if (focus && /^\[data-(roster|inspect|candidate)-troop="\d+"\]$/.test(focus)) root.querySelector<HTMLElement>(focus)?.focus({ preventScroll: true });
    } catch { /* UI state is optional when browser storage is restricted. */ }
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
      if (i === idx) step.setAttribute('aria-current', 'step');
      else step.removeAttribute('aria-current');
      const indexEl = step.querySelector<HTMLElement>('.step-index');
      if (indexEl) indexEl.textContent = i < idx ? '✓' : String(i + 1);
    });
  }

  private renderSignup(): void {
    const save = this.ctx.save();
    $('#feeCopy').textContent = `黄金 ${fmt(ARENA.entryFeeGold)}`;
    const enter = $('#enter') as HTMLButtonElement;
    const unlocked = arenaUnlocked(save);
    const canPay = unlocked && save.currencies.gold >= ARENA.entryFeeGold;
    enter.disabled = !canPay;
    enter.title = !unlocked ? '完成破碎尖塔任务链后解锁竞技场' : canPay ? '' : `黄金不足，还差 ${ARENA.entryFeeGold - save.currencies.gold}`;
    $('#enterLabel').textContent = !unlocked ? '完成破碎尖塔后解锁' : canPay ? '支付黄金报名' : '黄金不足';
    this.updateTicketCopy();
  }

  private updateTicketCopy(): void {
    if ($('#ticketCopy')) $('#ticketCopy').textContent = `黄金 ${fmt(ARENA.entryFeeGold)}`;
    if ($('#ticketRule')) $('#ticketRule').textContent = '每届报名 · 六胜或两败结束';
    if ($('#ticketReset')) $('#ticketReset').textContent = `固定15级 · 无特质 · 奖杯 ${fmt(this.ctx.save().currencies.trophies)}`;
  }

  private renderDraft(): void {
    const state = currentDraftChoices(this.ctx.save());
    this.selectedPick = null;
    ($('#nextDraft') as HTMLButtonElement).disabled = true;
    $('#draftSelectionHint').textContent = '选择本轮部队';
    const draft = this.draft();
    if (!state || !draft) return;
    $('#round').textContent = String(draft.picked.length + 1);
    const band = ARENA.roundBands[Math.min(draft.picked.length, ARENA.roundBands.length - 1)]!;
    const bandNote = $('#bandNote');
    if (bandNote) bandNote.textContent = `本轮档位：${ARENA.rarityLabels[band.min]}`;
    const cardsEl = $('#draftCards');
    cardsEl.innerHTML = state.options
      .map((o, i) => {
        const troop = getTroopById(o.troopId);
        if (!troop) return '';
        const cls = RARITY_CLS[o.rarityIdx] ?? 'common';
        const level = arenaDraftLevel(o.rarityIdx);
        const conflicts = manaConflict(draft.picked, troop.id);
        return `<div class="arena-candidate"><button class="draft-card r-${cls}${conflicts.length ? ' has-conflict' : ''}" data-i="${i}" type="button" aria-pressed="false">
          <div class="draft-card-art">
            ${arenaTroopImg(troop, `alt="${troop.name}"`)}
            <span class="shade"></span>
            <span class="mana">${gemSvg(troop.manaColors.map((c) => c.toLowerCase()))}<i>${troop.manaCost}</i></span>
            <b class="rarity">${RARITY_CN[o.rarityIdx] ?? ''}</b>
            <i class="pick-flag">已选</i>
          </div>
          <div class="draft-card-info">
            <h3>${troop.name}</h3>
            <small>${troop.kingdom ?? '无王国'} · Lv.${level} · 无特质</small>
            ${arenaStatsMarkup(troop)}
            ${conflicts.length ? `<span class="mana-conflict" title="与已锁定部队共享法力颜色">同色法力：${conflicts.map((c) => MANA_CN[c] ?? c).join('、')}</span>` : ''}
          </div>
        </button><button class="arena-candidate-detail" type="button" data-candidate-troop="${troop.id}" aria-label="查看${escapeHtml(troop.name)}详情">查看详情 <span aria-hidden="true">›</span></button></div>`;
      })
      .join('');
    mountIcons(cardsEl);
    this.termTipsDraft?.();
    this.termTipsDraft = bindTermTips(cardsEl);
    this.renderPicked(draft.picked);
    $$('#draftCards .draft-card').forEach((btn) =>
      this.on(btn, 'click', (e) => {
        // 术语点击不选卡：让解释面板独享这次点击
        if (this.picking || (e.target as HTMLElement).closest('.spell-term')) return;
        $$('#draftCards .draft-card').forEach((el) => {
          el.classList.remove('selected');
          el.setAttribute('aria-pressed', 'false');
        });
        btn.classList.add('selected');
        btn.setAttribute('aria-pressed', 'true');
        this.selectedPick = Number((btn as HTMLElement).dataset.i);
        this.rememberSelection(state.options[this.selectedPick]!.troopId);
        ($('#nextDraft') as HTMLButtonElement).disabled = false;
        const troop = getTroopById(state.options[this.selectedPick]!.troopId);
        $('#draftSelectionHint').textContent = troop ? `已选择 · ${troop.name}` : '确认加入本届阵容';
      }),
    );
    $$('#draftCards [data-candidate-troop]').forEach(btn => this.on(btn, 'click', () =>
      this.openTroopDetail(Number(btn.dataset.candidateTroop), `[data-candidate-troop="${btn.dataset.candidateTroop}"]`)));
    try {
      const remembered = JSON.parse(sessionStorage.getItem('arena.ui.selection') ?? 'null') as { key: string; id: number } | null;
      if (remembered?.key === this.selectionKey()) {
        const index = state.options.findIndex(option => option.troopId === remembered.id);
        if (index >= 0) document.querySelector<HTMLButtonElement>(`#draftCards .draft-card[data-i="${index}"]`)?.click();
      }
    } catch { /* Ignore stale presentation state. */ }
  }

  private selectionKey(): string {
    const draft = this.draft();
    return draft ? `${draft.seed}:${draft.picked.join(',')}` : '';
  }

  private rememberSelection(id: number): void {
    try { sessionStorage.setItem('arena.ui.selection', JSON.stringify({ key: this.selectionKey(), id })); } catch { /* Optional UI state. */ }
  }

  private renderPicked(picked: number[]): void {
    const pickedLabel = $('#pickedLabel');
    if (pickedLabel) pickedLabel.textContent = `已锁定 ${picked.length}/${ARENA.rounds}`;
    const slots = Array.from({ length: ARENA.rounds }, (_, i) => i)
      .map((i) => {
        const troop = picked[i] !== undefined ? getTroopById(picked[i]!) : null;
        if (!troop) {
          return `<div class="picked-slot empty" aria-label="第 ${i + 1} 张待选择"><span class="picked-slot-index">${i + 1}</span><b>待选择</b><small>${i + 1}/${ARENA.rounds}</small></div>`;
        }
        const rarity = RARITY_CLS[troop.rarityIdx] ?? 'common';
        return `<button type="button" class="picked-slot filled r-${rarity}" data-roster-troop="${troop.id}" aria-label="查看第 ${i + 1} 张：${escapeHtml(troop.name)}">${arenaTroopImg(troop, 'alt=""')}<span class="picked-slot-index">${i + 1}</span><div class="picked-slot-copy"><b>${escapeHtml(troop.name)}</b><small>${RARITY_CN[troop.rarityIdx] ?? ''} · ${troop.manaColors.map(c => MANA_CN[c.toLowerCase()] ?? c).join(' / ')}</small></div><span class="arena-slot-inspect" aria-hidden="true">›</span></button>`;
      })
      .join('');
    $('#pickedSlots').innerHTML = slots;
  }

  private openTroopDetail(id: number, focus: string): void {
    if (this.picking || this.arranging || this.starting) return;
    const available = [...(this.draft()?.picked ?? []), ...(currentDraftChoices(this.ctx.save())?.options.map(option => option.troopId) ?? [])];
    if (!available.includes(id)) return;
    try { sessionStorage.setItem('arena.ui.focus', focus); } catch { /* Optional focus restoration. */ }
    this.ctx.navigate(`#arena/detail/${id}`);
  }

  private detailHtml(ctx: ShellCtx, id: number): string {
    const draft = ctx.save().arena.activeDraft;
    const candidates = currentDraftChoices(ctx.save())?.options.map(option => option.troopId) ?? [];
    const available = [...(draft?.picked ?? []), ...candidates];
    const troop = available.includes(id) ? getTroopById(id) : undefined;
    const index = draft?.picked.indexOf(id) ?? -1;
    const peers = index >= 0 ? draft!.picked : candidates;
    return `${topbarHtml()}
      <main class="screen arena-screen arena-detail-page">
        <header class="arena-detail-nav"><button class="secondary" id="arenaDetailBack" type="button">‹ 返回${draft?.stage === 'picking' ? '选人' : '竞技场'}</button><h1 id="arenaDetailTitle" tabindex="-1">部队详情</h1><span>${troop ? index >= 0 ? `本届阵容 · 第 ${index + 1} 位` : '本轮候选' : ''}</span></header>
        ${troop ? `<section class="arena-detail-body r-${RARITY_CLS[troop.rarityIdx] ?? 'common'}">
          <div class="arena-detail-portrait">${arenaTroopImg(troop, `alt="${escapeHtml(troop.name)}"`)}<span>${RARITY_CN[troop.rarityIdx] ?? ''}</span></div>
          <div class="arena-detail-copy">${arenaTroopDetailMarkup(troop)}</div>
        </section>
        <nav class="arena-detail-peers" aria-label="${index >= 0 ? '本届阵容' : '本轮候选'}">${peers.map(peerId => {
          const peer = getTroopById(peerId);
          return peer ? `<a href="#arena/detail/${peerId}" ${peerId === id ? 'aria-current="page"' : ''}>${arenaTroopImg(peer, 'alt=""')}<span>${escapeHtml(peer.name)}</span></a>` : '';
        }).join('')}</nav>` : '<p class="arena-detail-expired">本轮阵容已更新，请返回竞技场。</p>'}
      </main>${bottomNavHtml('', '现开赛卡组独立')}`;
  }

  private async confirmPick(): Promise<void> {
    if (this.picking) return;
    const state = currentDraftChoices(this.ctx.save());
    if (!state || this.selectedPick === null) return;
    const option = state.options[this.selectedPick];
    if (!option) return;
    this.picking = true;
    const button = $('#nextDraft') as HTMLButtonElement;
    button.disabled = true;
    button.textContent = '正在确认…';
    $('#draftCards').setAttribute('aria-busy', 'true');
    try {
      const { result } = await this.ctx.gateway.pickDraftCard(option.troopId);
      if (!this.mounted) return;
      if (isFailure(result)) {
        toast(result.message);
        return;
      }
      const draft = this.draft();
      if (result.done || !draft || draft.stage !== 'picking') {
        this.order = draft?.picked ? [...draft.picked] : [];
        toast('牌组完成，进入编队连战。');
      }
    } catch {
      try { await this.ctx.gateway.sync(); } catch { /* Preserve the acknowledged roster for retry. */ }
      if (this.mounted) toast('选牌结果待确认，请核对本届阵容后重试。');
    } finally {
      this.picking = false;
      if (this.mounted) {
        button.textContent = '确认选择';
        $('#draftCards').removeAttribute('aria-busy');
        this.render();
      }
    }
  }

  private renderBattle(): void {
    const draft = this.draft();
    if (!draft) return;
    this.order = draft.picked.length === ARENA.rounds ? (this.order.length === ARENA.rounds ? this.order : [...draft.picked]) : [...draft.picked];
    this.order = this.normalizeOrder();
    const busy = this.arranging || this.starting;
    const locked = busy || this.ctx.save().pendingBattle?.mode === 'arena';
    ($('#fight') as HTMLButtonElement).disabled = busy;
    ($('#clearDraft') as HTMLButtonElement).disabled = busy;
    const teamEl = $('#draftTeam');
    teamEl.innerHTML = this.order
      .map((id, i) => {
        const troop = getTroopById(id);
        if (!troop) return '';
        const level = arenaDraftLevel(troop.rarityIdx);
        const rarity = RARITY_CLS[troop.rarityIdx] ?? 'common';
        return `<div class="run-slot r-${rarity}">
          ${arenaTroopImg(troop, `alt="${troop.name}"`)}
          <div class="slot-body">
            <b>${troop.name}</b>
            <span>${RARITY_CN[troop.rarityIdx] ?? ''} · 耗蓝 ${troop.manaCost} · Lv.${level} · 无特质</span>
          </div>
          <button class="arena-slot-detail" type="button" data-inspect-troop="${troop.id}" aria-label="查看${escapeHtml(troop.name)}详情"${busy ? ' disabled' : ''}>详情</button>
          <span class="pos${i === 0 ? ' skull' : ''}">${i + 1}${i === 0 ? '<span data-icon="skull"></span>' : ''}</span>
          <div class="shift" role="group" aria-label="${troop.name} 站位调整">
            <button type="button" data-shift="up" data-i="${i}" aria-label="${troop.name} 前移一位" title="前移一位"${locked || i === 0 ? ' disabled' : ''}>▲</button>
            <button type="button" data-shift="down" data-i="${i}" aria-label="${troop.name} 后移一位" title="后移一位"${locked || i === this.order.length - 1 ? ' disabled' : ''}>▼</button>
          </div>
        </div>`;
      })
      .join('');
    mountIcons(teamEl);

    // 连战进度
    const wins = draft.wins;
    $('#wins').textContent = String(wins);
    const gauntlet = $('#gauntlet');
    $('#losses').textContent = String(draft.losses ?? 0);
    const preview = arenaOpponentPreview(draft.seed, wins, draft.losses ?? 0);
    gauntlet.innerHTML = `<div class="arena-win-track" aria-label="六胜进度">${ARENA.opponentLevels.map((_, i) => `<span class="${i < wins ? 'done' : ''}">${i + 1}</span>`).join('')}</div>
      <div class="match pending" aria-current="step">
        <span class="match-no">${wins + (draft.losses ?? 0) + 1}</span>
        <div class="match-copy"><b>本场对手 · ${preview.policy.label}</b><small>固定 Lv.15 · 4 人 · 无特质</small>
          <div class="match-preview">${preview.enemies.map(enemy => {
            const troop = getTroopById(enemy.troopId)!;
            return `<span class="match-enemy" title="${troop.name} · Lv.15">${arenaTroopImg(troop, `alt="${troop.name}"`)}<b>${troop.name}</b></span>`;
          }).join('')}</div>
        </div>
      </div><p>双方普通、稀有、超稀有、史诗各一张。等级不变，对手选牌与站位随胜场逐步改善，仍保留随机性。</p>`;
    $('#fightLabel').textContent = `开始第 ${wins + (draft.losses ?? 0) + 1} 场`;
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
    if (this.arranging || this.starting || this.ctx.save().pendingBattle?.mode === 'arena') return;
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
    this.arranging = true;
    const order = [...this.order];
    this.renderBattle();
    try {
      const { result } = await this.ctx.gateway.arrangeDraftTeam(order);
      if (this.mounted && isFailure(result)) toast(result.message);
    } catch {
      // 可能已入库但回包丢失，只读同步，不自动重发调整或作废战斗票。
      try { await this.ctx.gateway.sync(); } catch { /* 下次操作可重试 */ }
      if (this.mounted) toast('站位保存未确认，请检查站位后重试。');
    } finally {
      this.arranging = false;
      this.order = [...(this.draft()?.picked ?? [])];
      if (this.mounted) this.render();
    }
  }

  private async enter(): Promise<void> {
    const { result } = await this.ctx.gateway.enterArena();
    if (isFailure(result)) {
      toast(result.message);
      return;
    }
    toast(`报名成功：黄金 −${ARENA.entryFeeGold}。开始第 1 轮现开。`);
    this.render();
  }

  private async fight(): Promise<void> {
    if (this.arranging || this.starting) return;
    const draft = this.draft();
    if (!draft) return;
    this.starting = true;
    this.renderBattle();
    try {
      if (draft.stage === 'building') {
        // 先落库站位，再进入连战；慢响应期间禁止换位或重复开始。
        const { result } = await this.ctx.gateway.arrangeDraftTeam(this.normalizeOrder());
        if (!this.mounted) return;
        if (isFailure(result)) {
          toast(result.message);
          return;
        }
        const started = await this.ctx.gateway.startDraftBattles();
        if (!this.mounted) return;
        if (isFailure(started.result)) {
          toast(started.result.message);
          return;
        }
      }
      await this.ctx.launchArenaBattle();
    } catch {
      try { await this.ctx.gateway.sync(); } catch { /* 保留重试入口 */ }
      if (this.mounted) toast('开战准备未确认，请重试。');
    } finally {
      this.starting = false;
      this.order = [...(this.draft()?.picked ?? [])];
      if (this.mounted) this.render();
    }
  }

  private openForfeitModal(): void {
    const draft = this.draft();
    if (!draft) return;
    const reward = ARENA_REWARDS[Math.min(Math.max(draft.wins, 0), ARENA_REWARDS.length - 1)]!;
    $('#forfeitCopy').textContent = `当前 ${draft.wins} 胜；确认后会清除临时牌组，并自动发放这一档奖励。`;
    $('#forfeitReward').innerHTML = `<span><b>${draft.wins} 胜</b> 本届结算</span><strong>黄金 +${fmt(reward.gold)} · 灵魂 +${reward.souls} · 荣耀钥匙 ×${reward.gloryKeys} · 公会奖杯 +${reward.trophies}</strong>`;
    const modal = $('#forfeitModal');
    modal.hidden = false;
    mountIcons(modal);
    const confirmButton = $('#confirmForfeit') as HTMLButtonElement;
    confirmButton.focus();
  }

  private closeForfeitModal(): void {
    $('#forfeitModal').hidden = true;
  }

  private async forfeit(): Promise<void> {
    const draft = this.draft();
    if (!draft) return;
    this.closeForfeitModal();
    const { result } = await this.ctx.gateway.forfeitDraft();
    if (isFailure(result)) {
      toast(result.message);
      return;
    }
    toast(`弃赛收官：${result.wins} 胜 · 黄金 +${fmt(result.rewards.gold)} · 灵魂 +${result.rewards.souls} · 荣耀钥匙 ×${result.rewards.gloryKeys} · 公会奖杯 +${result.rewards.trophies}`);
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
    this.mounted = false;
    this.termTipsDraft?.();
    this.termTipsDetail?.();
    if (this.ticketTimer !== null) {
      window.clearInterval(this.ticketTimer);
      this.ticketTimer = null;
    }
    for (const [target, type, fn] of this.listeners.splice(0)) {
      target.removeEventListener(type, fn);
    }
  }
}
