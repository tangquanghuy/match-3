/**
 * 王国主线页 `#quest/<王国>`（M10，任务书 `TASK-META §9` / `TASK-MAP-UI` 批次 3）。
 *
 * 为什么有这一屏：地图弹层的「任务/探索」此前**直接开战**，玩家看不到 8 关结构、
 * 敌人阵容、奖励位置与探索档位——"我在打什么、下一关是什么、打到第几关有部队奖励"
 * 三个问题在开战前全无答案（`02-kingdom-sheet.md` K-10）。
 *
 * 系统层零新逻辑：关卡状态/等级/规模/阵容预览/奖励部队全部是现有纯函数，
 * 出战与档位写入全走现有网关方法。
 */
import { isFailure } from '../gateway';
import { getTroopById } from '../../data/troops';
import {
  EXPLORE_TEAM_SIZES,
  exploreEnemyLevel,
  QUESTS_PER_KINGDOM,
  QUEST_TEAM_SIZES,
  questEnemyLevel,
  kingdomQuestRewardTroop,
  kingdomUnlockLevel,
} from '../data/kingdoms';
import { kingdomNodeState, questLineupPreview } from '../systems/kingdomOps';
import type { EncounterEnemy } from '../systems/encounter';
import { bottomNavHtml, mountIcons, toast, toastHtml, topbarHtml, $, $$ } from '../shell/chrome';
import type { Screen, ShellCtx } from '../shell/screen';
import { KINGDOM_VIEWS, kingdomViewOf, ART } from './mapData';

/**
 * 本屏样式段（窗口 Q）。`shell/styles/**` 归 L 独占，新页样式先写在屏自己的段里；
 * L 的 `tokens.css` 交付后按下表迁移：
 *   面板底 → `--ds-l1`、卡片底 → `--ds-l2`/`--ds-l2-raise`、当前关卡 → `--ds-l3`
 *   描边 `#67563e` → `--ds-edge`、`#e1c891` → `--ds-edge-hot`
 *   主 CTA → `.btn.btn--lg.btn--primary`、次级 → `.btn--secondary`
 */
const QUEST_CSS = `
  .quest-screen {
    position: absolute;
    inset: 64px 0 72px;
    padding: 18px 40px 24px;
    display: flex; flex-direction: column; gap: 14px;
    overflow-y: auto;
  }
  .quest-head {
    display: grid;
    grid-template-columns: 74px 1fr auto;
    align-items: center;
    gap: 16px;
    padding: 12px 16px;
    background: linear-gradient(160deg, #1b1722, #10101a 62%);
    border: 1px solid rgba(216, 194, 144, .34);
    border-radius: 10px;
    box-shadow: 0 0 0 1px rgba(38, 31, 22, .96), 0 18px 40px #0008;
  }
  .quest-head .qh-crest { width: 64px; height: 72px; }
  .quest-head .qh-crest img, .quest-head .qh-crest svg { width: 100%; height: 100%; object-fit: contain; }
  .quest-head small.eyebrow { display: block; letter-spacing: 3px; color: #91887a; font-size: 10px; }
  .quest-head h1 { margin: 0; font: 27px var(--display); letter-spacing: 5px; color: #f4e2b4; }
  .quest-head .qh-sub { font: 12px var(--body); color: #c4b6a3; }
  .quest-head .qh-acts { display: flex; align-items: center; gap: 10px; }
  .qh-progress {
    display: flex; align-items: center; gap: 8px;
    font: 13px var(--body); color: #c4b6a3;
  }
  .qh-bar { width: 148px; height: 8px; background: #14121b; border: 1px solid #67563e; border-radius: 999px; overflow: hidden; }
  .qh-bar i { display: block; height: 100%; background: linear-gradient(90deg, #8e7347, #f0d99c); }

  .quest-section { display: flex; flex-direction: column; gap: 10px; }
  .quest-section > header { display: flex; align-items: baseline; gap: 12px; }
  .quest-section > header h2 { font: 19px var(--display); letter-spacing: 2px; color: #f4e2b4; }
  .quest-section > header span { font: 12px var(--body); color: #91887a; }

  .quest-track { display: flex; gap: 10px; overflow-x: auto; padding: 4px 2px 10px; }
  .qnode {
    flex: 0 0 170px;
    display: flex; flex-direction: column; gap: 6px;
    padding: 10px;
    text-align: left;
    background: linear-gradient(#20202c, #16161f);
    border: 1px solid rgba(186, 164, 139, .18);
    border-radius: 6px;
    box-shadow: 0 3px 9px rgba(0, 0, 0, .28);
    color: #f2ead8;
    transition: transform .12s, border-color .12s;
  }
  .qnode .qn-top { display: flex; align-items: center; justify-content: space-between; gap: 6px; }
  .qnode .qn-no { font: 15px Georgia, serif; letter-spacing: 1px; color: #d8c290; }
  .qnode .qn-state { font: 11px var(--body); padding: 1px 7px 2px; border: 1px solid #67563e; border-radius: 999px; color: #c4b6a3; }
  .qnode .qn-line { font: 11px var(--body); color: #91887a; }
  .qnode .qn-foes { display: flex; flex-direction: column; gap: 3px; }
  .qnode .qn-foe { display: flex; align-items: center; gap: 6px; font: 11px var(--body); color: #c4b6a3; }
  .qnode .qn-foe img { width: 20px; height: 20px; border-radius: 3px; object-fit: cover; background: #0d0d14; }
  .qnode .qn-foe i.tier { width: 6px; height: 6px; border-radius: 50%; background: #67563e; flex: none; }
  .qnode .qn-foe i.tier.elite { background: #4f8fd0; }
  .qnode .qn-foe i.tier.boss { background: #c45454; }
  .qnode .qn-reward {
    display: flex; align-items: center; gap: 5px;
    padding: 4px 6px;
    background: rgba(106, 83, 38, .28);
    border: 1px solid #8e7347;
    border-radius: 4px;
    font: 11px var(--body); color: #ffeebb;
  }
  .qnode .qn-reward [data-icon] { width: 12px; height: 12px; color: #ffd77a; }
  .qnode.done { opacity: .78; }
  .qnode.done .qn-state { border-color: #4f7d5f; color: #8fd0aa; }
  .qnode.locked { color: #8d8576; background: #14141c; }
  .qnode.locked .qn-no { color: #8a7c5d; }
  .qnode.current {
    flex: 0 0 210px;
    background: linear-gradient(#2a2736, #1a1826);
    border: 2px solid #e1c891;
    box-shadow: 0 8px 18px #0006, inset 0 1px rgba(240, 218, 183, .12);
    transform: translateY(-2px);
  }
  .qnode.current .qn-state { border-color: #e1c891; color: #ffeebb; }

  .quest-cta { display: flex; align-items: center; gap: 14px; flex-wrap: wrap; }
  .quest-cta .primary, .quest-cta .secondary { flex: 0 1 380px; }
  .quest-cta .cta-note { font: 12px var(--body); color: #91887a; }

  .explore-box {
    display: flex; flex-direction: column; gap: 10px;
    padding: 14px 16px;
    background: linear-gradient(160deg, #1b1722, #10101a 62%);
    border: 1px solid rgba(216, 194, 144, .28);
    border-radius: 10px;
  }
  .explore-box.locked { opacity: .82; }
  .tier-row { display: flex; gap: 8px; }
  .tier-row button {
    flex: 0 0 84px;
    padding: 8px 4px;
    background: linear-gradient(#20202c, #16161f);
    border: 1px solid rgba(186, 164, 139, .18);
    border-radius: 6px;
    color: #c4b6a3;
    font: 12px var(--body);
  }
  .tier-row button b { display: block; font: 15px Georgia, serif; color: #f2ead8; }
  .tier-row button.on {
    border: 2px solid #e1c891;
    background: linear-gradient(#2a2736, #1a1826);
    color: #ffeebb;
    transform: translateY(-2px);
  }
  .tier-row button.on b { color: #ffeebb; }
  .explore-box .ex-line { font: 12px var(--body); color: #c4b6a3; }
  .explore-box .ex-hint { font: 11px var(--body); color: #91887a; }

  .quest-locked {
    margin: 40px auto;
    max-width: 560px;
    display: flex; flex-direction: column; gap: 12px; align-items: center;
    padding: 28px;
    background: linear-gradient(160deg, #1b1722, #10101a 62%);
    border: 1px solid rgba(216, 194, 144, .28);
    border-radius: 10px;
    text-align: center;
  }
  .quest-locked img { width: 210px; border-radius: 6px; filter: grayscale(1) brightness(.5); }
  .quest-locked h2 { font: 22px var(--display); letter-spacing: 4px; color: #f4e2b4; }
  .quest-locked p { font: 13px var(--body); color: #c4b6a3; }
`;

const STATE_LABEL = { done: '✓ 已通关', current: '▶ 当前可战', locked: '🔒 未解锁' } as const;

function foeLine(enemy: EncounterEnemy): string {
  const troop = getTroopById(enemy.troopId);
  const name = troop?.name ?? `#${enemy.troopId}`;
  // 立绘缺失的部队（本地 1828 张之外）不留空框，直接只显示名字
  const art = troop?.portrait
    ? `<img src="/meta/assets/portraits/${troop.portrait}.webp" alt="" loading="lazy" onerror="this.remove()">`
    : '';
  return `<span class="qn-foe"><i class="tier ${enemy.tier}"></i>${art}<span>${name}</span></span>`;
}

export class QuestScreen implements Screen {
  private kingdom = '';
  private listeners: Array<[EventTarget, string, EventListenerOrEventListenerObject]> = [];

  /** hash 里的王国名（中文）可能被浏览器百分号编码，两种形态都吃 */
  private resolveKingdom(param?: string): string {
    const raw = param ?? '';
    let name = raw;
    try {
      name = decodeURIComponent(raw);
    } catch {
      name = raw;
    }
    return KINGDOM_VIEWS.some((v) => v.name === name) ? name : '';
  }

  html(ctx: ShellCtx, param?: string): string {
    this.kingdom = this.resolveKingdom(param);
    const shell = (body: string): string =>
      `<style id="questScreenCss">${QUEST_CSS}</style>
       ${topbarHtml()}
       <main class="screen quest-screen">${body}</main>
       ${bottomNavHtml('地图', '王国主线')}
       ${toastHtml()}`;

    if (!this.kingdom) {
      return shell(`
        <section class="quest-locked">
          <h2>王国不存在</h2>
          <p>这个链接指向的王国不在克里斯塔拉的 42 国之内。</p>
          <button class="secondary" id="questBack" type="button"><span data-icon="arrow"></span>返回地图</button>
        </section>`);
    }

    const save = ctx.save();
    const view = kingdomViewOf(this.kingdom);
    const state = kingdomNodeState(save, this.kingdom, Date.now());

    // 直链访问未解锁王国：给锁态页而不是崩（`TASK-META §9.5` 验收 6）
    if (state.locked) {
      return shell(`
        <section class="quest-locked">
          <img src="${ART[view.biome] ?? ART.spire!}" alt="">
          <small class="eyebrow">${view.en}</small>
          <h2>🔒 ${this.kingdom} 尚未解锁</h2>
          <p>需要冒险者 Lv.${kingdomUnlockLevel(this.kingdom)}（你现在 Lv.${save.hero.level}）。<br>解锁后开放 8 章王国任务与探索模式。</p>
          <button class="secondary" id="questBack" type="button"><span data-icon="arrow"></span>返回地图</button>
        </section>`);
    }

    const done = state.questsDone;
    const next = state.nextNode;
    const tier = Math.min(5, Math.max(1, save.kingdoms[this.kingdom]?.exploreTier || 1));

    const nodes = Array.from({ length: QUESTS_PER_KINGDOM }, (_, i) => {
      const node = i + 1;
      const status: keyof typeof STATE_LABEL = node <= done ? 'done' : node === next ? 'current' : 'locked';
      const size = QUEST_TEAM_SIZES[i]!;
      const level = questEnemyLevel(this.kingdom, node);
      const rewardId = node === 4 || node === 8 ? kingdomQuestRewardTroop(this.kingdom, node) : null;
      const reward = rewardId ? getTroopById(rewardId) : null;
      // 阵容预览只对"看得见的关"算（未解锁关也给，玩家需要知道前面有什么）
      let foes = '';
      try {
        foes = questLineupPreview(this.kingdom, node).map(foeLine).join('');
      } catch {
        foes = '<span class="qn-line">阵容待定</span>';
      }
      return `<article class="qnode ${status}" data-node="${node}">
        <div class="qn-top"><span class="qn-no">第 ${node} 关</span><span class="qn-state">${STATE_LABEL[status]}</span></div>
        <div class="qn-line">敌人 Lv.${level} · ${size} 人队</div>
        <div class="qn-foes">${foes}</div>
        ${reward ? `<div class="qn-reward"><span data-icon="chest"></span>部队奖励：${reward.name}</div>` : ''}
      </article>`;
    }).join('');

    const ctaLabel = next === null ? '任务链已全通' : `出战 · 第 ${next} 关`;
    const ctaNote =
      next === null
        ? '8/8 已通关。继续刷这个王国的材料请走下方探索模式。'
        : `第 ${next} 关：敌人 Lv.${questEnemyLevel(this.kingdom, next)} · ${QUEST_TEAM_SIZES[next - 1]} 人队${next === 4 || next === 8 ? ' · 通关得部队奖励' : ''}`;

    const tiers = EXPLORE_TEAM_SIZES.map((size, i) => {
      const t = i + 1;
      return `<button type="button" class="${t === tier ? 'on' : ''}" data-tier="${t}">
        <b>${t} 档</b>Lv.${exploreEnemyLevel(this.kingdom, t)} · ${size} 人
      </button>`;
    }).join('');

    return shell(`
      <header class="quest-head">
        <span class="qh-crest">${view.crest ? `<img src="${view.crest}" alt="">` : ''}</span>
        <div>
          <small class="eyebrow">${view.en} · KINGDOM QUESTS</small>
          <h1>${this.kingdom}</h1>
          <div class="qh-sub">王国 Lv.${state.kingdom ? save.kingdoms[this.kingdom]?.level ?? 1 : 1} · ${view.blurb || '主线 8 关，第 4 关与第 8 关各给一名部队奖励。'}</div>
        </div>
        <div class="qh-acts">
          <span class="qh-progress"><b>${done} / ${QUESTS_PER_KINGDOM}</b><span class="qh-bar"><i style="width:${(done / QUESTS_PER_KINGDOM) * 100}%"></i></span></span>
          <button class="secondary" id="questBack" type="button"><span data-icon="arrow"></span>返回地图</button>
        </div>
      </header>

      <section class="quest-section">
        <header><h2>任务链</h2><span>线性推进：只能打下一关，重复刷取走探索</span></header>
        <div class="quest-track" id="questTrack">${nodes}</div>
        <div class="quest-cta">
          <button class="primary" id="questFight" type="button" ${next === null ? 'disabled' : ''}>
            <span data-icon="swords"></span><span>${ctaLabel}</span>
          </button>
          <span class="cta-note">${ctaNote}</span>
        </div>
      </section>

      <section class="quest-section">
        <header><h2>探索模式</h2><span>${state.exploreUnlocked ? '重复刷取材料与灵魂' : '任务链 8/8 通关后开放'}</span></header>
        <div class="explore-box ${state.exploreUnlocked ? '' : 'locked'}">
          ${state.exploreUnlocked
            ? `<div class="tier-row" id="tierRow">${tiers}</div>
               <div class="ex-line" id="exLine">当前 ${tier} 档：敌人 Lv.${exploreEnemyLevel(this.kingdom, tier)} · ${EXPLORE_TEAM_SIZES[tier - 1]} 人队</div>
               <p class="ex-hint">档位越高敌人越强、掉落越好；切换即保存。每日首胜额外双倍结算（当天第一场胜利，全局只算一次）。</p>
               <div class="quest-cta">
                 <!-- 一屏一主 CTA（DESIGN-SYSTEM §4 硬门槛 2）：主线未打完时探索是次级动作 -->
                 <button class="${next === null ? 'primary' : 'secondary'}" id="exploreFight" type="button"><span data-icon="compass"></span><span>探索出战 · ${tier} 档</span></button>
               </div>`
            : `<div class="ex-line">🔒 需要先把任务链打到 8/8（当前 ${done}/8）。</div>
               <p class="ex-hint">探索模式开放后可无限重复刷取该王国的材料、灵魂与部队掉落，并可选 1~5 档难度。</p>`}
        </div>
      </section>`);
  }

  mount(ctx: ShellCtx): void {
    mountIcons(document);
    this.bind('#questBack', 'click', () => ctx.navigate('#map'));
    this.bind('#questFight', 'click', () => void this.fight(ctx));
    this.bind('#exploreFight', 'click', () => void this.explore(ctx));
    $$('.tier-row button').forEach((btn) =>
      this.on(btn, 'click', () => void this.setTier(ctx, Number(btn.dataset.tier))),
    );
    // 节点卡：点已通关/未解锁的关给一句明确说明（不留"点了没反应"）
    $$('.qnode').forEach((card) =>
      this.on(card, 'click', () => {
        if (card.classList.contains('current')) {
          void this.fight(ctx);
          return;
        }
        toast(
          card.classList.contains('done')
            ? '这一关已通关。任务链是线性的，重复刷取请走探索模式。'
            : '要先按顺序打完前面的关卡才能进这一关。',
        );
      }),
    );
  }

  private async fight(ctx: ShellCtx): Promise<void> {
    const state = kingdomNodeState(ctx.save(), this.kingdom, Date.now());
    if (state.nextNode === null) {
      toast('任务链已 8/8 通关，去探索模式重复刷取材料。');
      return;
    }
    await ctx.launchQuest(this.kingdom, state.nextNode);
  }

  private async explore(ctx: ShellCtx): Promise<void> {
    const state = kingdomNodeState(ctx.save(), this.kingdom, Date.now());
    if (!state.exploreUnlocked) {
      toast('通关 8 章任务链后开放探索。');
      return;
    }
    await ctx.launchExplore(this.kingdom);
  }

  private async setTier(ctx: ShellCtx, tier: number): Promise<void> {
    const { result } = await ctx.gateway.setKingdomExploreTier(this.kingdom, tier);
    if (isFailure(result)) {
      toast(result.message);
      return;
    }
    // 即时持久化 + 就地更新（不整屏重建，保持滚动位置）
    $$('.tier-row button').forEach((b) => b.classList.toggle('on', Number(b.dataset.tier) === tier));
    const line = $('#exLine');
    if (line) {
      line.textContent = `当前 ${tier} 档：敌人 Lv.${exploreEnemyLevel(this.kingdom, tier)} · ${EXPLORE_TEAM_SIZES[tier - 1]} 人队`;
    }
    const fight = $('#exploreFight span:last-child');
    if (fight) fight.textContent = `探索出战 · ${tier} 档`;
    toast(`探索难度已设为 ${tier} 档（已保存）。`);
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
