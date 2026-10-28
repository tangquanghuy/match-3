/** 本体加载页与酒馆入口共享同一份阵容、背景和布局。 */
import type { CombatantSnapshot } from '@session/index';
import { tutorialArt } from './artAssets';

export type BattleLoadingUnit = Pick<CombatantSnapshot, 'name'> & Partial<Pick<CombatantSnapshot, 'portraitUrl' | 'levelLabel' | 'tier' | 'race'>>;

function escapeHtml(text: string): string {
  return text.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
}

function lineup(team: readonly BattleLoadingUnit[], side: 'player' | 'enemy'): string {
  return team.map((unit, i) => `<figure class="bl-unit${unit.tier === 'boss' ? ' boss' : ''}" aria-label="${escapeHtml(unit.name)}" style="--i:${i}">
      ${unit.portraitUrl ? `<img src="${escapeHtml(unit.portraitUrl)}" alt="" decoding="async" data-bl-portrait>` : '<span class="bl-unit-blank"></span>'}
    </figure>`).join('') || `<p class="bl-empty">${side === 'player' ? '我方' : '敌方'}</p>`;
}

export interface BattleLoadingViewOptions {
  title: string;
  subtitle?: string;
  playerTeam: readonly BattleLoadingUnit[];
  enemyTeam: readonly BattleLoadingUnit[];
  playerEmpty?: string;
}

export function createBattleLoadingView(options: BattleLoadingViewOptions): HTMLElement {
  const el = document.createElement('div');
  el.className = options.title ? 'bl-screen' : 'bl-screen bl-screen--untitled';
  const bg = tutorialArt('battle-loading');
  if (bg) el.style.setProperty('--bl-bg', `url("${bg}")`);
  el.innerHTML = `
    <div class="bl-backdrop" aria-hidden="true"></div>
    ${options.title ? `<header class="bl-head"><small>即将开战</small><h1 id="blTitle">${escapeHtml(options.title)}</h1>${options.subtitle ? `<p>${escapeHtml(options.subtitle)}</p>` : ''}</header>` : ''}
    <div class="bl-versus" style="--bl-n:${Math.max(1, options.playerTeam.length, options.enemyTeam.length)}">
      <section class="bl-side bl-side--player" aria-label="我方阵容">${options.playerTeam.length ? lineup(options.playerTeam, 'player') : `<p class="bl-empty">${escapeHtml(options.playerEmpty ?? '我方')}</p>`}</section>
      <div class="bl-vs" aria-hidden="true"><span>VS</span></div>
      <section class="bl-side bl-side--enemy" aria-label="敌方阵容">${lineup(options.enemyTeam, 'enemy')}</section>
    </div>
    <footer class="bl-foot"></footer>`;
  for (const img of el.querySelectorAll<HTMLImageElement>('[data-bl-portrait]')) {
    const mark = (): void => { img.dataset.loaded = '1'; };
    if (img.complete && img.naturalWidth > 0) mark();
    else img.addEventListener('load', mark, { once: true });
  }
  return el;
}
