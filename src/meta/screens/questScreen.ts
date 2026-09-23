/**
 * 王国关卡页 `#quest/<王国>` / `#quest/<王国>/hard` / `#quest/<王国>/veryhard`
 *
 * 公主连结式：王国风景上铺编号节点，顶栏 NORMAL / HARD / VERY HARD。
 * 主线 8 关线性推进；Hard 3 关 + Very Hard 3 关在主线通关后可重复刷。
 */
import { isFailure } from '../gateway';
import { getTroopById } from '../../data/troops';
import {
  EXPLORE_MAX_TIER,
  HARD_NODE_COUNT,
  QUESTS_PER_KINGDOM,
  VERY_HARD_NODE_COUNT,
  exploreEnemyLevel,
  exploreTierForNode,
  kingdomUnlockLevel,
  questEnemyLevel,
  type KingdomStageMode,
} from '../data/kingdoms';
import {
  exploreLineupPreview,
  kingdomNodeState,
  questLineupPreview,
} from '../systems/kingdomOps';
import type { EncounterEnemy } from '../systems/encounter';
import { bottomNavHtml, mountIcons, toastHtml, topbarHtml, $, $$ } from '../shell/chrome';
import type { Screen, ShellCtx } from '../shell/screen';
import { KINGDOM_VIEWS, kingdomViewOf, ART } from './mapData';
import { questRewardsHtml, questModeLootHtml } from './questRewards';
import QUEST_CSS from './questScreen.css?inline';

type PinPt = { x: number; y: number };

const MODE_LABEL: Record<KingdomStageMode, string> = {
  normal: 'NORMAL',
  hard: 'HARD',
  veryHard: 'VERY HARD',
};
const MODE_CN: Record<KingdomStageMode, string> = { normal: '普通', hard: '困难', veryHard: '非常困难' };

/** 路线与地标错落排布；窄屏使用同序的折返路线。 */
const NORMAL_PINS: PinPt[] = [
  { x: 9, y: 71 },
  { x: 21, y: 48 },
  { x: 33, y: 62 },
  { x: 45, y: 36 },
  { x: 57, y: 55 },
  { x: 69, y: 28 },
  { x: 81, y: 43 },
  { x: 92, y: 21 },
];
const MOBILE_NORMAL_PINS: PinPt[] = [
  { x: 24, y: 12 }, { x: 76, y: 12 },
  { x: 76, y: 36 }, { x: 24, y: 36 },
  { x: 24, y: 60 }, { x: 76, y: 60 },
  { x: 76, y: 84 }, { x: 24, y: 84 },
];

const HARD_PINS: PinPt[] = [
  { x: 20, y: 64 },
  { x: 50, y: 35 },
  { x: 80, y: 56 },
];

const VERY_HARD_PINS: PinPt[] = [
  { x: 22, y: 57 },
  { x: 50, y: 34 },
  { x: 78, y: 54 },
];
const MOBILE_FARM_PINS: PinPt[] = [{ x: 26, y: 22 }, { x: 73, y: 49 }, { x: 28, y: 78 }];


function decodeSeg(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function parseMode(raw: string): KingdomStageMode {
  const key = raw.toLowerCase().replace(/[\s_-]/g, '');
  if (key === 'hard') return 'hard';
  if (key === 'veryhard' || key === 'vh') return 'veryHard';
  return 'normal';
}

function pinsFor(mode: KingdomStageMode): PinPt[] {
  if (mode === 'hard') return HARD_PINS;
  if (mode === 'veryHard') return VERY_HARD_PINS;
  return NORMAL_PINS;
}

function mobilePinsFor(mode: KingdomStageMode): PinPt[] {
  return mode === 'normal' ? MOBILE_NORMAL_PINS : MOBILE_FARM_PINS;
}

function routeHtml(mode: KingdomStageMode, nextNode: number | null, farmOpen: boolean): string {
  return [false, true].map((mobile) => {
    const pts = mobile ? mobilePinsFor(mode) : pinsFor(mode);
    const reached = mode === 'normal' ? (nextNode ?? pts.length) : (farmOpen ? pts.length : 1);
    return `<svg class="qpaths ${mobile ? 'qpaths-mobile' : 'qpaths-wide'}" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
      <path class="qpath-shadow" d="${curvePath(pts)}"></path>
      <path class="qpath-bed" d="${curvePath(pts)}"></path>
      <path class="qpath" d="${curvePath(pts, reached)}"></path>
    </svg>`;
  }).join('');
}

function nodeCount(mode: KingdomStageMode): number {
  if (mode === 'hard') return HARD_NODE_COUNT;
  if (mode === 'veryHard') return VERY_HARD_NODE_COUNT;
  return QUESTS_PER_KINGDOM;
}

function curvePath(pts: PinPt[], reached = pts.length): string {
  if (!pts.length) return '';
  if (pts.length === 1) return `M ${pts[0]!.x} ${pts[0]!.y}`;
  const tension = 0.18;
  let d = `M ${pts[0]!.x} ${pts[0]!.y}`;
  for (let i = 0; i < Math.min(pts.length, reached) - 1; i++) {
    const p0 = pts[i - 1] ?? pts[i]!;
    const p1 = pts[i]!;
    const p2 = pts[i + 1]!;
    const p3 = pts[i + 2] ?? p2;
    const c1x = p1.x + (p2.x - p0.x) * tension;
    const c1y = p1.y + (p2.y - p0.y) * tension;
    const c2x = p2.x - (p3.x - p1.x) * tension;
    const c2y = p2.y - (p3.y - p1.y) * tension;
    d += ` C ${c1x.toFixed(2)} ${c1y.toFixed(2)} ${c2x.toFixed(2)} ${c2y.toFixed(2)} ${p2.x} ${p2.y}`;
  }
  return d;
}

function portraitUrl(troopId: number): string | null {
  const troop = getTroopById(troopId);
  return troop?.portrait ? `/meta/assets/portraits/${troop.portrait}.webp` : null;
}

function lineupOf(kingdom: string, mode: KingdomStageMode, node: number): EncounterEnemy[] {
  try {
    if (mode === 'normal') return questLineupPreview(kingdom, node);
    return exploreLineupPreview(kingdom, exploreTierForNode(mode, node));
  } catch {
    return [];
  }
}

function leadPortrait(enemies: EncounterEnemy[]): string {
  const lead = enemies.find((e) => e.tier === 'boss') ?? enemies[0];
  if (!lead) return '';
  const src = portraitUrl(lead.troopId);
  return src
    ? `<img class="qpin-stand" src="${src}" alt="" loading="lazy" onerror="this.remove()">`
    : '';
}

function foeTile(enemy: EncounterEnemy): string {
  const troop = getTroopById(enemy.troopId);
  const src = portraitUrl(enemy.troopId);
  const name = troop?.name ?? `#${enemy.troopId}`;
  const img = src
    ? `<img src="${src}" alt="" loading="lazy" onerror="this.remove()">`
    : '';
  return `<span class="qd-foe ${enemy.tier}" title="${name}">${img}</span>`;
}

function enemyLevel(kingdom: string, mode: KingdomStageMode, node: number): number {
  if (mode === 'normal') return questEnemyLevel(kingdom, node);
  return exploreEnemyLevel(kingdom, exploreTierForNode(mode, node));
}

function storedTier(saveTier: number): number {
  if (!Number.isInteger(saveTier) || saveTier < 1) return 1;
  return Math.min(saveTier, EXPLORE_MAX_TIER);
}

export class QuestScreen implements Screen {
  private kingdom = '';
  private mode: KingdomStageMode = 'normal';
  private selectedNode = 1;
  private listeners: Array<[EventTarget, string, EventListenerOrEventListenerObject]> = [];

  private parseRoute(param?: string): { kingdom: string; mode: KingdomStageMode } {
    const segs = (param ?? '').split('/').filter(Boolean).map(decodeSeg);
    const kingdom = segs[0] ?? '';
    const mode = parseMode(segs[1] ?? '');
    return {
      kingdom: KINGDOM_VIEWS.some((v) => v.name === kingdom) ? kingdom : '',
      mode,
    };
  }

  private hashFor(mode: KingdomStageMode): string {
    const base = '#quest/' + encodeURIComponent(this.kingdom);
    if (mode === 'normal') return base;
    return `${base}/${mode === 'hard' ? 'hard' : 'veryhard'}`;
  }

  html(ctx: ShellCtx, param?: string): string {
    const route = this.parseRoute(param);
    this.kingdom = route.kingdom;
    this.mode = route.mode;
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
          <button class="secondary qback" id="questBack" type="button"><span data-icon="arrow"></span>返回地图</button>
        </section>`);
    }

    const save = ctx.save();
    const view = kingdomViewOf(this.kingdom);
    const state = kingdomNodeState(save, this.kingdom, Date.now());
    const art = ART[view.biome] ?? ART.spire!;

    if (state.locked) {
      return shell(`
        <section class="quest-locked">
          <img class="ql-art" src="${art}" alt="">
          <small class="eyebrow">${view.en}</small>
          <h2>${this.kingdom}</h2>
          <p>冒险者 Lv.${kingdomUnlockLevel(this.kingdom)}</p>
          <button class="secondary" id="questBack" type="button"><span data-icon="arrow"></span>返回地图</button>
        </section>`);
    }

    const farmOpen = state.exploreUnlocked;
    const count = nodeCount(this.mode);
    const pts = pinsFor(this.mode);
    const saveTier = storedTier(save.kingdoms[this.kingdom]?.exploreTier ?? 0);
    this.selectedNode = this.defaultNode(state.nextNode, saveTier);

    const pins = Array.from({ length: count }, (_, i) => this.pinHtml(i + 1, pts[i]!, farmOpen, state.nextNode)).join('');
    const enemies = lineupOf(this.kingdom, this.mode, this.selectedNode);
    const fightable = this.canFight(farmOpen, state.nextNode, this.selectedNode);

    return shell(`
      <div class="quest-map" data-mode="${this.mode}">
        <div class="quest-art" style="background-image:url('${art}')"></div>
        <div class="quest-atmosphere" aria-hidden="true"></div>
        <div class="quest-stage">
          <div class="quest-route">
          ${routeHtml(this.mode, state.nextNode, farmOpen)}
          <div class="qpins">${pins}</div>
          </div>
        </div>
        <div class="qhud">
          ${view.crest ? `<img class="crest" src="${view.crest}" alt="">` : ''}
          <div>
            <small>${view.en}</small>
            <h1>${this.kingdom}</h1>
            <div class="qh-progress" aria-label="普通关卡进度 ${state.questsDone}/${QUESTS_PER_KINGDOM}">
              <span class="qh-track">${Array.from({ length: QUESTS_PER_KINGDOM }, (_, i) => `<i class="${i < state.questsDone ? 'done' : ''}"></i>`).join('')}</span>
              <span>${state.questsDone}<em> / ${QUESTS_PER_KINGDOM}</em></span>
            </div>
          </div>
        </div>
        <nav class="qtabs" aria-label="关卡难度">
          ${this.tabBtn('normal', this.mode, true)}
          ${this.tabBtn('hard', this.mode, farmOpen)}
          ${this.tabBtn('veryHard', this.mode, farmOpen)}
        </nav>
        <button class="secondary qback" id="questBack" type="button"><span data-icon="arrow"></span>地图</button>
        <div class="qmap-compass" aria-hidden="true"><span data-icon="compass"></span><i>N</i></div>
        <footer class="quest-dock">
          <div class="qd-copy" aria-live="polite">
            <small id="qdMode">${MODE_LABEL[this.mode]} <i> / </i> ${String(this.selectedNode).padStart(2, '0')}</small>
            <b id="qdTitle">${this.kingdom} ${this.selectedNode}</b>
            <span id="qdSub">Lv.${enemyLevel(this.kingdom, this.mode, this.selectedNode)}</span>
          </div>
          <div class="qd-enemies"><span class="qd-label">敌方阵容</span><div class="qd-foes" id="qdFoes">${enemies.map(foeTile).join('')}</div></div>
          <div class="qd-loot"><span class="qd-label">${this.mode === 'normal' ? '关卡奖励' : '可能获得'}</span><div class="qd-rewards" id="qdRewards">${questRewardsHtml(this.kingdom, this.mode, this.selectedNode)}</div></div>
          <div class="qd-action"><button class="primary" id="questFight" type="button" ${fightable ? '' : 'disabled'}>
            <span data-icon="${fightable ? 'swords' : this.mode === 'normal' && state.nextNode === null ? 'check' : 'lock'}"></span><span id="qdFightLabel">${this.fightLabel(state.nextNode, fightable)}</span>
          </button><small id="qdGate">${this.mode !== 'normal' && !farmOpen ? `普通 ${state.questsDone} / ${QUESTS_PER_KINGDOM}` : ''}</small></div>
        </footer>
      </div>`);
  }

  mount(ctx: ShellCtx): void {
    document.getElementById('stage')?.classList.add('quest-responsive');
    mountIcons(document);
    this.bind('#questBack', 'click', () => ctx.navigate('#map'));
    this.bind('#questFight', 'click', () => void this.fight(ctx));
    $$('.qtab').forEach((tab) =>
      this.on(tab, 'click', () => {
        const next = tab.dataset.mode as KingdomStageMode;
        if (!next || next === this.mode) return;
        ctx.navigate(this.hashFor(next));
      }),
    );
    $$('.qpin').forEach((pin) =>
      this.on(pin, 'click', () => void this.selectNode(ctx, Number(pin.dataset.node))),
    );
    const stage = $('.quest-stage');
    const selected = $('.qpin.on');
    if (stage && selected && stage.scrollHeight > stage.clientHeight) {
      stage.scrollTop = selected.offsetTop - stage.clientHeight / 2;
    }
  }

  private tabBtn(mode: KingdomStageMode, current: KingdomStageMode, open: boolean): string {
    const locked = !open;
    return `<button type="button" class="qtab ${mode === current ? 'on' : ''} ${locked ? 'locked' : ''}" data-mode="${mode}" aria-pressed="${mode === current}" aria-label="${MODE_CN[mode]} ${MODE_LABEL[mode]}${locked ? '，普通通关后解锁，可预览' : ''}">
      <span class="qtab-copy"><b>${MODE_LABEL[mode]}</b><small>${MODE_CN[mode]}</small></span>
      <span class="qtab-loot" aria-hidden="true">${questModeLootHtml(this.kingdom, mode)}</span>
      <span class="qtab-state" data-icon="${locked ? 'lock' : mode === current ? 'check' : 'chevrons'}"></span>
    </button>`;
  }

  private defaultNode(nextNode: number | null, saveTier: number): number {
    if (this.mode === 'normal') return nextNode ?? QUESTS_PER_KINGDOM;
    if (this.mode === 'hard') return saveTier <= HARD_NODE_COUNT ? saveTier : 1;
    return saveTier > HARD_NODE_COUNT ? saveTier - HARD_NODE_COUNT : 1;
  }

  private pinStatus(node: number, nextNode: number | null): 'done' | 'current' | 'locked' | 'open' {
    if (this.mode === 'normal') {
      if (nextNode === null || node < nextNode) return 'done';
      if (node === nextNode) return 'current';
      return 'locked';
    }
    return 'open';
  }

  private pinHtml(node: number, pt: PinPt, farmOpen: boolean, nextNode: number | null): string {
    const status = this.mode === 'normal' || farmOpen ? this.pinStatus(node, nextNode) : 'locked';
    const enemies = lineupOf(this.kingdom, this.mode, node);
    const hasBoss = enemies.some((enemy) => enemy.tier === 'boss');
    const showStand = this.mode !== 'normal' || hasBoss;
    const reward = this.mode === 'normal' && (node === 4 || node === 8);
    const mobile = mobilePinsFor(this.mode)[node - 1]!;
    const statusLabel = { done: '已通关', current: '当前关卡', locked: '未解锁', open: '可挑战' }[status];
    const cls = [
      'qpin',
      this.mode,
      status,
      node === this.selectedNode ? 'on' : '',
      reward ? 'reward' : '',
      hasBoss ? 'has-boss' : '',
    ]
      .filter(Boolean)
      .join(' ');
    return `<button type="button" class="${cls}" style="--pin-x:${pt.x}%;--pin-y:${pt.y}%;--pin-mobile-x:${mobile.x}%;--pin-mobile-y:${mobile.y}%" data-node="${node}" aria-pressed="${node === this.selectedNode}" aria-label="${MODE_CN[this.mode]} 第 ${node} 关，${statusLabel}">
      <span class="qpin-focus" aria-hidden="true"></span>
      ${showStand ? leadPortrait(enemies) : ''}
      ${hasBoss ? '<span class="qpin-boss">BOSS</span>' : ''}
      <span class="qpin-disc"><span class="qpin-status" data-icon="${status === 'done' ? 'check' : status === 'locked' ? 'lock' : 'swords'}"></span><span>${String(node).padStart(2, '0')}</span></span>
      ${this.mode !== 'normal' ? `<span class="qpin-loot" aria-hidden="true">${questModeLootHtml(this.kingdom, this.mode)}</span>` : reward ? '<span class="qpin-chest" data-icon="chest"></span>' : ''}
    </button>`;
  }

  private fightLabel(nextNode: number | null, fightable: boolean): string {
    if (fightable) return '出战';
    if (this.mode === 'normal' && (nextNode === null || this.selectedNode < nextNode)) return '已通关';
    return '未解锁';
  }

  private canFight(farmOpen: boolean, nextNode: number | null, node: number): boolean {
    if (this.mode === 'normal') return node === nextNode;
    return farmOpen;
  }

  private async selectNode(ctx: ShellCtx, node: number): Promise<void> {
    if (!Number.isInteger(node) || node < 1 || node > nodeCount(this.mode)) return;
    this.selectedNode = node;
    $$('.qpin').forEach((pin) => {
      const selected = Number(pin.dataset.node) === node;
      pin.classList.toggle('on', selected);
      pin.setAttribute('aria-pressed', String(selected));
    });
    const foes = $('#qdFoes');
    if (foes) foes.innerHTML = lineupOf(this.kingdom, this.mode, node).map(foeTile).join('');
    const title = $('#qdTitle');
    if (title) title.textContent = `${this.kingdom} ${node}`;
    const sub = $('#qdSub');
    if (sub) sub.textContent = `Lv.${enemyLevel(this.kingdom, this.mode, node)}`;
    const mode = $('#qdMode');
    if (mode) mode.innerHTML = `${MODE_LABEL[this.mode]} <i> / </i> ${String(node).padStart(2, '0')}`;
    const rewards = $('#qdRewards');
    if (rewards) rewards.innerHTML = questRewardsHtml(this.kingdom, this.mode, node);
    const fight = $('#questFight') as HTMLButtonElement | null;
    const state = kingdomNodeState(ctx.save(), this.kingdom, Date.now());
    if (fight) {
      fight.disabled = !this.canFight(state.exploreUnlocked, state.nextNode, node);
      $('#qdFightLabel').textContent = this.fightLabel(state.nextNode, !fight.disabled);
      fight.querySelector<HTMLElement>('[data-icon]')!.dataset.icon = !fight.disabled ? 'swords' : this.fightLabel(state.nextNode, false) === '已通关' ? 'check' : 'lock';
    }
    mountIcons($('.quest-dock'));
    if (this.mode !== 'normal' && state.exploreUnlocked) {
      const tier = exploreTierForNode(this.mode, node);
      const { result } = await ctx.gateway.setKingdomExploreTier(this.kingdom, tier);
      if (isFailure(result)) return;
    }
  }

  private async fight(ctx: ShellCtx): Promise<void> {
    const state = kingdomNodeState(ctx.save(), this.kingdom, Date.now());
    if (!this.canFight(state.exploreUnlocked, state.nextNode, this.selectedNode)) return;
    if (this.mode === 'normal') {
      await ctx.launchQuest(this.kingdom, this.selectedNode);
      return;
    }
    await ctx.launchExplore(this.kingdom, exploreTierForNode(this.mode, this.selectedNode));
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
    document.getElementById('stage')?.classList.remove('quest-responsive');
    for (const [target, type, fn] of this.listeners.splice(0)) {
      target.removeEventListener(type, fn);
    }
  }
}
