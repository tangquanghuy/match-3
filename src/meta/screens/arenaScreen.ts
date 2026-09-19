/**
 * 竞技场 · 现开赛（计划 §5.9 三屏合一）：报名 → 三轮 3 选 1 → 编队连战。
 * 全流程走 arena 系统（draft 卡即用即弃，不进收藏）；奖表/费用从 economy 派生。
 */
import { ARENA, ARENA_REWARDS, arenaDraftLevel } from '../data/economy';
import { getTroopById } from '../../data/troops';
import { troopStatsAtLevel } from '../../data/leveling';
import { currentDraftChoices } from '../systems/arena';
import { pickEnemies, type EnemyTier } from '../systems/encounter';
import { KINGDOM_ORDER } from '../data/kingdoms';
import { SeededRNG } from '../../engine/rng';
import { isFailure, weekStartOf } from '../gateway';
import { bottomNavHtml, gemSvg, mountIcons, toast, toastHtml, topbarHtml, $, $$ } from '../shell/chrome';
import { renderSpell } from '../shell/spellText';
import type { Screen, ShellCtx } from '../shell/screen';
import { troopImg } from './teamScreen';

const fmt = (n: number): string => n.toLocaleString('en-US');
const ROMAN = ['Ⅰ', 'Ⅱ', 'Ⅲ'];

const RARITY_CLS: Record<number, string> = { 0: 'common', 1: 'common', 2: 'rare', 3: 'epic', 4: 'legend', 5: 'mythic' };
const RARITY_CN: Record<number, string> = { 0: '普通', 1: '精良', 2: '稀有', 3: '传说', 4: '史诗', 5: '神话' };
const MANA_CN: Record<string, string> = { red: '红', green: '绿', blue: '蓝', yellow: '黄', purple: '紫', brown: '棕' };

function opponentTiers(wins: number, size: number): EnemyTier[] {
  if (wins <= 0) return Array.from({ length: size }, () => 'minion' as const);
  if (wins === 1) return ['elite' as const, ...Array.from({ length: size - 1 }, () => 'minion' as const)];
  return ['elite' as const, ...Array.from({ length: Math.max(size - 2, 0) }, () => 'minion' as const), 'boss' as const];
}

/**
 * 竞技场对手是 draft seed 的纯函数。这里复用与 gateway 计划相同的 RNG 顺序，
 * 让编队页看到的阵容和实际出战保持一致，而不提前改变存档阶段。
 */
function opponentPreview(seed: number, wins: number) {
  const rng = new SeededRNG((seed ^ ((wins + 1) * 0x9e3779b9)) >>> 0);
  const kingdom = KINGDOM_ORDER[rng.nextInt(KINGDOM_ORDER.length)]!;
  const level = ARENA.opponentLevels[wins]!;
  const size = ARENA.opponentSizes[wins]!;
  return { kingdom, level, enemies: pickEnemies(kingdom, level, opponentTiers(wins, size), rng) };
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
  /** 编队阶段本地站位（draft 卡 id 序），展示与确认都用它 */
  private order: number[] = [];
  private listeners: Array<[EventTarget, string, EventListenerOrEventListenerObject]> = [];

  html(): string {
    const rewardsCopy = ARENA_REWARDS.map((r, i) => {
      const parts = [`黄金 ${fmt(r.gold)}`];
      if (r.gems) parts.push(`宝石 ${fmt(r.gems)}`);
      if (r.goldKeys) parts.push(`金钥匙 ×${r.goldKeys}`);
      const tag = i === 3 ? '完胜' : i === 2 ? '进阶' : i === 1 ? '回本' : '保底';
      return `<div class="prize${i === 3 ? ' featured' : ''}"><em>${i}</em><div><b>${i} 胜 · ${tag}</b><span>${parts.join(' · ')}</span></div></div>`;
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
      <div class="arena-modal-veil" id="forfeitModal" hidden>
        <section class="arena-confirm" role="dialog" aria-modal="true" aria-labelledby="forfeitTitle">
          <small class="eyebrow">LEAVE THIS RUN</small>
          <h2 id="forfeitTitle">确定弃赛？</h2>
          <p id="forfeitCopy">当前牌组会清除，并按已得胜场自动发奖。</p>
          <div class="forfeit-reward" id="forfeitReward"></div>
          <div class="arena-confirm-actions">
            <button class="secondary" id="cancelForfeit" type="button">继续挑战</button>
            <button class="danger-primary" id="confirmForfeit" type="button"><span data-icon="flag"></span>确认弃赛</button>
          </div>
        </section>
      </div>
      ${bottomNavHtml('', '现开赛卡组独立')}
      ${toastHtml()}`;
  }

  mount(ctx: ShellCtx): void {
    this.ctx = ctx;
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
        const level = arenaDraftLevel(o.rarityIdx);
        const stats = troopStatsAtLevel(troop, level);
        const spell = renderSpell(troop.spell.description, stats.magic, { interactive: false }).html;
        const conflicts = manaConflict(draft.picked, troop.id);
        return `<button class="draft-card r-${cls}${conflicts.length ? ' has-conflict' : ''}" data-i="${i}" type="button">
          ${troopImg(troop, false, `alt="${troop.name}"`)}
          <span class="shade"></span>
          <span class="mana">${gemSvg(troop.manaColors.map((c) => c.toLowerCase()))}<i>${troop.manaCost}</i></span>
          <b class="rarity">${RARITY_CN[o.rarityIdx] ?? ''}</b>
          <div class="draft-card-info">
            <h3>${troop.name}</h3>
            <small>${troop.kingdom ?? '无王国'} · 满配 Lv.${level} · 临时卡</small>
            <div class="draft-stats" aria-label="攻击、护甲、生命、魔力">
              <span title="攻击"><b>攻</b>${stats.attack}</span>
              <span title="护甲"><b>护</b>${stats.armor}</span>
              <span title="生命"><b>生</b>${stats.health}</span>
              <span title="魔力"><b>魔</b>${stats.magic}</span>
            </div>
            <div class="draft-spell">
              <strong>${troop.spell.name}</strong>
              <p class="draft-spell-copy">${spell || '暂无技能描述'}</p>
            </div>
            ${conflicts.length ? `<span class="mana-conflict" title="与已锁定部队共享法力颜色">同色法力：${conflicts.map((c) => MANA_CN[c] ?? c).join('、')}</span>` : ''}
          </div>
          <i class="pick-flag">已选</i>
        </button>`;
      })
      .join('');
    mountIcons(cardsEl);
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
        const preview = opponentPreview(draft.seed, i);
        const enemyCards = preview.enemies
          .map((enemy) => {
            const troop = getTroopById(enemy.troopId);
            if (!troop) return '';
            return `<span class="match-enemy" title="${troop.name} · Lv.${enemy.level}">${troopImg(troop, false, `alt="${troop.name}"`)}<b>${troop.name}</b></span>`;
          })
          .join('');
        return `<div class="match ${cls}" data-match="${i}">
          <span class="match-no">${ROMAN[i]}</span>
          <div class="match-copy"><b>第 ${i + 1} 战</b><small>${preview.kingdom} · 对手 Lv.${lv} · ${ARENA.opponentSizes[i]} 人</small><div class="match-preview">${enemyCards}</div></div>
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

  private openForfeitModal(): void {
    const draft = this.draft();
    if (!draft) return;
    const reward = ARENA_REWARDS[Math.min(Math.max(draft.wins, 0), ARENA_REWARDS.length - 1)]!;
    $('#forfeitCopy').textContent = `当前 ${draft.wins} 胜；确认后会清除临时牌组，并自动发放这一档奖励。`;
    $('#forfeitReward').innerHTML = `<span><b>${draft.wins} 胜</b> 本届结算</span><strong>黄金 +${fmt(reward.gold)}${reward.gems ? ` · 宝石 +${fmt(reward.gems)}` : ''}${reward.goldKeys ? ` · 金钥匙 ×${reward.goldKeys}` : ''}</strong>`;
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
