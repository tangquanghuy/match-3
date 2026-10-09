import { portraitUrl } from '../../data/portraitUrl';
import { gameNow, isFailure } from '../gateway';
import { EXPLORE_ENEMY_LEVELS, EXPLORE_MAX_TIER, exploreStageLabel, kingdomUnlockLevel, KINGDOM_ORDER } from '../data/kingdoms';
import { enemyEncounterStats } from '../data/enemyDifficulty';
import { buildPlayerSnapshots, encounterPower } from '../systems/battleBridge';
import { teamPower } from '../systems/combatPower';
import { getTroopById } from '../../data/troops';
import { exploreUnlocked, explorePreviewSeed, kingdomNodeState } from '../systems/kingdomOps';
import { planExploreEncounter } from '../systems/encounter';
import { exploreBattleSeed, kingdomArcaneKey, maxExploreTier } from '../systems/explore';
import { EXPLORE_DROPS, KINGDOM_FIRST_CLEAR_GEMS, EXPLORE_HIGH_TIER_FIRST_CLEAR_GEMS } from '../data/economy';
import { stoneName } from '../data/materials';
import { stoneMarkupForKey } from '../shell/materialArt';
import { bottomNavHtml, mountIcons, toast, toastHtml, topbarHtml, $ } from '../shell/chrome';
import type { Screen, ShellCtx } from '../shell/screen';
import { ART, kingdomViewOf } from './mapData';
import QUEST_CSS from './questScreen.css?inline';
import CSS from './exploreScreen.css?inline';
import landscape from '@assets/meta/explore/relic-landscape.webp';
import difficultySigil from '@assets/meta/explore/difficulty-sigil.webp';

const esc = (s: string): string => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

export class ExploreScreen implements Screen {
  private kingdom = '';
  private busy = false;
  private disposed = false;
  private difficultyFocus: string | null = null;
  private listeners: Array<[EventTarget, string, EventListener]> = [];

  html(ctx: ShellCtx, param?: string): string {
    try { this.kingdom = decodeURIComponent((param ?? '').split('/')[0]!); } catch { this.kingdom = ''; }
    const shell = (body: string) => `<style>${QUEST_CSS}
${CSS}</style>${topbarHtml()}<main class="screen explore-screen">${body}</main>${bottomNavHtml('地图', '王国探索')}${toastHtml()}`;
    if (!KINGDOM_ORDER.includes(this.kingdom)) return shell('<div class="ex-empty"><h2>请选择王国</h2><button class="secondary" id="exploreBack">返回地图</button></div>');
    const save = ctx.save();
    const entry = save.kingdoms[this.kingdom];
    const open = exploreUnlocked(save, this.kingdom) && !kingdomNodeState(save, this.kingdom, gameNow()).locked;
    const run = entry?.exploreRun;
    const max = maxExploreTier(save);
    const tier = run?.tier ?? Math.max(1, Math.min(entry?.exploreTier || 1, max));
    const stage = run?.stage ?? 0;
    const view = kingdomViewOf(this.kingdom);
    const art = ART[view.biome] ?? ART.spire!;
    const plan = planExploreEncounter(this.kingdom, tier, run ? exploreBattleSeed(run) : explorePreviewSeed(this.kingdom, tier), stage, run?.id);
    const player = buildPlayerSnapshots(save);
    const playerPower = player.ok ? teamPower(player.playerTeam).toLocaleString() : '未编队';
    const opponentPower = encounterPower(plan.enemies).toLocaleString();
    const arcane = kingdomArcaneKey(this.kingdom);
    const enemies = plan.enemies.map((enemy, index) => {
      const troop = getTroopById(enemy.troopId)!;
      const stats = enemyEncounterStats(troop, enemy.level, enemy.statMultiplier);
      return `<div class="ex-enemy ${enemy.tier === 'boss' ? 'boss' : ''}" data-enemy-id="${troop.id}"><span class="ex-enemy-slot" aria-label="队列 ${index + 1}">${index + 1}</span>
        ${troop.artUrl || troop.portrait ? `<img src="${esc(troop.artUrl ?? portraitUrl(troop.portrait))}" alt="" loading="lazy">` : ''}
        <div class="ex-enemy-info"><strong>${esc(troop.name)}</strong><small>Lv.${enemy.level}${enemy.tier === 'boss' ? ' · BOSS' : ''}</small>
        <div class="ex-stats"><span title="护甲"><i data-icon="shield"></i>${stats.armor}</span><span title="生命"><i data-icon="heart"></i>${stats.health}</span><span title="攻击"><i data-icon="swords"></i>${stats.attack}</span><span title="魔法">魔 ${stats.magic}</span></div></div>
      </div>`;
    }).join('');
    return shell(`<div class="ex-art" style="background-image:url('${art}')"></div><div class="ex-content">
      <header class="ex-header"><div>${view.crest ? `<img src="${view.crest}" alt="">` : ''}<div><small>王国探索</small><h1>${esc(this.kingdom)}</h1></div></div><button class="secondary" id="exploreBack" type="button"><span data-icon="arrow"></span>地图</button></header>
      <div class="ex-layout"><section class="ex-main" aria-label="探索路线">
        <div class="ex-expedition">
          <img class="ex-landscape" src="${landscape}" alt="" draggable="false">
          <div class="ex-selector" role="group" aria-label="选择探索难度">
          <div class="ex-section-heading"><h2>探索难度</h2><span>${run ? '本轮难度已锁定' : `已解锁 ${max} / ${EXPLORE_MAX_TIER}`}</span></div>
          <div class="ex-difficulty-stage">
            <button type="button" class="ex-step" id="explorePrev" aria-label="降低探索难度" data-tier="${tier - 1}" ${!open || !!run || tier <= 1 ? 'disabled' : ''}><span aria-hidden="true">‹</span></button>
            <div class="ex-difficulty-feature" data-tier="${tier}">
              <div class="ex-medallion"><img src="${difficultySigil}" alt="" draggable="false"><span>难度</span><strong>${tier}</strong></div>
              <span class="ex-level">敌人等级 <b>Lv.${EXPLORE_ENEMY_LEVELS[tier - 1]}</b></span>
              <span class="ex-tier-status">${run ? '本轮进行中' : entry?.clearedExploreTiers?.includes(tier) ? '已征服 · 可再次挑战' : '选择难度，开启探索'}</span>
            </div>
            <button type="button" class="ex-step" id="exploreNext" aria-label="提高探索难度" data-tier="${tier + 1}" ${!open || !!run || tier >= max ? 'disabled' : ''}><span aria-hidden="true">›</span></button>
          </div>
          <div class="ex-scale ${!open || !!run ? 'is-locked' : ''}" style="--ex-available:${(max - 1) / 11};--ex-selected:${(tier - 1) / 11}">
            <div class="ex-scale-track"><span></span></div>
            <input id="exploreDifficulty" class="ex-range" type="range" min="1" max="${max}" step="1" value="${tier}" aria-label="探索难度" aria-valuetext="难度 ${tier}，敌人等级 ${EXPLORE_ENEMY_LEVELS[tier - 1]}" ${!open || !!run ? 'disabled' : ''}>
            <div class="ex-scale-labels" aria-hidden="true">${EXPLORE_ENEMY_LEVELS.map((_, i) => `<span class="${i + 1 === tier ? 'selected' : ''} ${i >= max ? 'locked' : ''}">${i + 1}</span>`).join('')}</div>
          </div>
        </div>
        </div><div class="ex-journey">
        <div class="ex-section-heading ex-route-heading"><h2>${run ? '本轮进度' : '探索路线'}</h2><span>${stage} / 6</span></div>
        <ol class="ex-route">${Array.from({ length: 6 }, (_, i) => `<li class="${i < stage ? 'done' : i === stage ? 'current' : ''} ${i >= 4 ? 'boss' : ''}" ${i === stage ? 'aria-current="step"' : ''}><span class="ex-node"><i data-icon="${i < stage ? 'check' : i === 5 ? 'skull' : 'swords'}"></i><b>${i + 1}</b></span><span>${i < 4 ? `遭遇战 ${i + 1}` : i === 4 ? '首领' : '最终 Boss'}</span></li>`).join('')}</ol>
        <div class="ex-material"><span class="ex-stone">${stoneMarkupForKey(arcane)}</span><div><small class="ex-reward-label">本王国秘法石</small><b>${esc(stoneName(arcane))}</b><span>基础抽取每次 ${EXPLORE_DROPS.arcaneStoneChance * 100}% 掉秘法石 · 旗帜颜色更易出现</span></div></div>
        <div class="ex-first-clear" data-first-clear="${entry?.clearedExploreTiers?.includes(tier) ? 'completed' : 'available'}">${entry?.clearedExploreTiers?.includes(tier) ? '本难度首通已完成' : `首通秘法石 ×1 · +${tier <= 6 ? KINGDOM_FIRST_CLEAR_GEMS[tier <= 3 ? 'hard' : 'veryHard'] : EXPLORE_HIGH_TIER_FIRST_CLEAR_GEMS} 宝石`}</div>
        </div>
      </section><aside class="ex-panel" aria-label="本场战斗">
        <div class="ex-section-heading"><h2>${exploreStageLabel(stage)}</h2><span>难度 ${tier}</span></div>
        <div class="ex-power">敌方战力 <b>${opponentPower}</b><span>/</span>我方 <b>${playerPower}</b></div>
        <div class="ex-enemies">${enemies}</div><small class="ex-preview-note">${run ? '本场敌方阵容' : '阵容预览 · 开始探索时确定'}</small>
        <div class="ex-deploy">${!open ? `<p class="ex-gate">${save.hero.level < kingdomUnlockLevel(this.kingdom) ? `冒险者 Lv.${kingdomUnlockLevel(this.kingdom)} 开放王国` : '通关本王国主线后开放'}</p>` : ''}
        <button class="primary" id="exploreFight" type="button" ${open ? '' : 'disabled'}><span data-icon="swords"></span>${run ? '继续探索' : '开始探索'}</button>
        ${run ? '<button class="ex-abandon" id="exploreAbandon" type="button">放弃本轮</button>' : ''}</div>
      </aside></div></div>
      <dialog class="ex-confirm" id="exploreConfirm" aria-labelledby="exploreConfirmTitle"><h2 id="exploreConfirmTitle">放弃本轮探索？</h2><p>已获得的奖励保留，下一轮从第一场开始。</p><div><button type="button" class="secondary" id="exploreKeep">继续本轮</button><button type="button" class="primary" id="exploreConfirmAbandon">放弃本轮</button></div></dialog>`);
  }

  mount(ctx: ShellCtx): void {
    this.disposed = false;
    document.getElementById('stage')?.classList.add('quest-responsive');
    mountIcons(document);
    this.on($('#exploreBack'), () => ctx.navigate('#map'));
    const chooseDifficulty = (tier: number, focus: string) => {
      void this.action(async () => {
        const { result } = await ctx.gateway.setKingdomExploreTier(this.kingdom, tier);
        if (this.disposed) return;
        if (isFailure(result)) toast(result.message);
        this.difficultyFocus = focus;
        ctx.refresh();
      });
    };
    document.querySelectorAll<HTMLButtonElement>('.ex-step').forEach(button => this.on(button, () => {
      chooseDifficulty(Number(button.dataset.tier), button.id);
    }));
    const range = document.getElementById('exploreDifficulty') as HTMLInputElement | null;
    if (range) {
      const change = () => chooseDifficulty(Number(range.value), range.id);
      range.addEventListener('change', change);
      this.listeners.push([range, 'change', change]);
    }
    if (this.difficultyFocus) {
      const target = document.getElementById(this.difficultyFocus) as HTMLButtonElement | HTMLInputElement | null;
      (target?.disabled ? range : target)?.focus({ preventScroll: true });
      this.difficultyFocus = null;
    }
    this.on($('#exploreFight'), () => {
      void this.action(() => ctx.launchExplore(this.kingdom));
    });
    const dialog = document.getElementById('exploreConfirm') as HTMLDialogElement | null;
    this.on($('#exploreAbandon'), () => dialog?.showModal());
    this.on($('#exploreKeep'), () => dialog?.close());
    this.on($('#exploreConfirmAbandon'), () => {
      void this.action(async () => {
        const { result } = await ctx.gateway.abandonKingdomExplore(this.kingdom);
        if (isFailure(result)) toast(result.message);
        dialog?.close();
        if (!this.disposed) ctx.refresh();
      });
    });
  }

  private async action(fn: () => Promise<void>): Promise<void> {
    if (this.busy) return;
    this.busy = true;
    const buttons = [...document.querySelectorAll<HTMLButtonElement | HTMLInputElement>('.explore-screen button, .explore-screen input')].map(b => [b, b.disabled] as const);
    buttons.forEach(([b]) => { b.disabled = true; });
    try { await fn(); } catch (error) { if (!this.disposed) toast(error instanceof Error ? error.message : '网络请求失败，请重试'); }
    finally { this.busy = false; if (!this.disposed) buttons.forEach(([b, was]) => { b.disabled = was; }); }
  }

  private on(target: Element | null, callback: () => void): void {
    if (!target) return;
    const fn = () => callback();
    target.addEventListener('click', fn);
    this.listeners.push([target, 'click', fn]);
  }

  dispose(): void {
    this.disposed = true;
    document.getElementById('stage')?.classList.remove('quest-responsive');
    for (const [target, event, listener] of this.listeners.splice(0)) target.removeEventListener(event, listener);
  }
}
