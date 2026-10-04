/** 突袭首领：讨伐和锻材挑战分别占据独立视图，主面板只承担一种出战。 */
import { ingotArt, materialImg } from '../../shell/materialArt';
import { getTroopById } from '../../../data/troops';
import { RAID_ARCHETYPES, RAID_PHASES, RAID_SUPPLIES, raidPhaseOf, raidTierLevel, raidWeakColor, type RaidState } from '../../systems/eventModes/raid';
import { activeTeam } from '../../systems/teamRules';
import { troopImg } from '../teamScreen';
import { cssUrlVar, eventArt } from '../../shell/artAssets';
import { COLOR_CN, COLOR_HEX, actButton, esc, fightButton, iconImg, pct, type ViewCtx } from './shared';

const fmt = (n: number): string => n.toLocaleString('en-US');

export function raidModeNav(mode: 'boss' | 'forge'): string {
  return `<nav class="rd-mode-nav" aria-label="首领挑战类型">
    <a href="#events/raidBoss" class="rd-mode-link${mode === 'boss' ? ' active' : ''}"${mode === 'boss' ? ' aria-current="page"' : ''}>讨伐首领</a>
    <a href="#events/raidBoss/forge" class="rd-mode-link rd-forge-entry${mode === 'forge' ? ' active' : ''}"${mode === 'forge' ? ' aria-current="page"' : ''}>${materialImg(ingotArt('epic'))}锻材挑战</a>
  </nav>`;
}

function supplyIcon(id: string, icon: string, weak: string): string {
  return id === 'giant' ? `gem:special/giantGem${weak}` : icon;
}

function supplyHtml(state: RaidState, weak: string): string {
  if (state.supply) {
    const s = RAID_SUPPLIES[state.supply];
    return `<div class="rd-supply on" title="${esc(s.desc)}">${iconImg(supplyIcon(state.supply, s.icon, weak), 'rd-sup-ico')}<div><small>已装备补给</small><b>${esc(s.name)}</b></div></div>`;
  }
  if (!state.offer) return '';
  return `<div class="rd-supply"><div class="rd-section-head"><h4>战术补给</h4>${actButton('跳过', 'supply:skip', { cls: 'ghost' })}</div>
    <div class="rd-sup-list">${state.offer.map((id, i) => {
      const s = RAID_SUPPLIES[id];
      return `<button type="button" class="rd-sup" data-act="supply:${i}" title="${esc(s.desc)}" aria-label="${esc(s.name)}：${esc(s.desc)}">${iconImg(supplyIcon(id, s.icon, weak), 'rd-sup-ico')}<b>${esc(s.name)}</b></button>`;
    }).join('')}</div></div>`;
}

export function raidViewHtml(v: ViewCtx, state: RaidState): string {
  const boss = getTroopById(state.lineup[0]!);
  const phase = raidPhaseOf(state.hp, state.max);
  const weak = raidWeakColor(v.weekStart);
  const guards = state.lineup.slice(1).map((id, i) => {
    const t = getTroopById(id);
    const extra = i === 2;
    return `<div class="rd-guard${extra ? ' reinforce' : ''}${extra && phase < 2 ? ' dormant' : ''}" title="${esc(t?.name ?? '')}${extra ? ' · 绝境阶段增援' : ''}">${troopImg(t ?? null, false, 'alt=""')}<span>${esc(t?.name ?? '护卫')}</span>${extra ? '<em>绝境增援</em>' : ''}</div>`;
  }).join('');
  const phases = RAID_PHASES.map((p, i) => `<li class="${i === phase ? 'now' : i < phase ? 'past' : ''}" title="${esc(p.desc)}"><b>${p.name}</b><span>${p.desc}</span></li>`).join('');
  const team = activeTeam(v.save)?.members ?? [];
  const roster = team.map((m) => {
    if (m.kind === 'hero') return '<li class="hero"><span class="rd-name">主角</span></li>';
    if (m.kind !== 'troop') return '';
    const t = getTroopById(m.troopId);
    const tired = state.fatiguePhase === phase && state.fatigue.includes(String(m.troopId));
    const weakHit = t?.manaColors.includes(weak);
    return `<li class="${tired ? 'tired' : ''}">${troopImg(t ?? null, false, 'alt="" class="rd-face"')}<span class="rd-name">${esc(t?.name ?? '')}</span>
      ${tired ? '<em class="tired">疲惫</em>' : weakHit ? `<em class="weak" style="--c:${COLOR_HEX[weak]}">破绽</em>` : ''}</li>`;
  }).join('');
  const archetype = RAID_ARCHETYPES[state.archetype];

  return `<div class="evm evm-raid" style='${cssUrlVar('rd-bg', eventArt('bg-raid'))}'>
    <div class="rd-content">
      <section class="rd-stage" aria-label="首领状态">
        <div class="rd-boss">
          <div class="rd-boss-art">${troopImg(boss ?? null, false, `alt="${esc(boss?.name ?? '首领')}"`)}</div>
          <div class="rd-boss-info">
            <small>第 ${state.tier} 阶 · ${esc(state.kingdom)} · Lv.${raidTierLevel(state.tier)}</small>
            <h3>${esc(boss?.name ?? '首领')}</h3>
            <div class="rd-hp" aria-label="首领血池"><i style="width:${pct(state.hp, state.max)}%"></i><s style="left:33.33%"></s><s style="left:66.67%"></s><b>${fmt(state.hp)} / ${fmt(state.max)}</b></div>
            <ol class="rd-phases">${phases}</ol>
          </div>
        </div>
        <div class="rd-stage-foot"><div class="rd-guards">${guards}</div><div class="rd-stats"><span>讨伐 <b>${state.slain}</b></span><span>最高伤害 <b>${fmt(state.bestHit)}</b></span><span>出击 <b>${state.attempts}</b></span></div></div>
      </section>
      <section class="rd-panel" aria-label="讨伐准备">
        <div class="rd-arch" title="${esc(archetype.desc)}">${iconImg(archetype.icon, 'rd-arch-ico')}<div><small>首领机制</small><b>${esc(archetype.name)}</b></div></div>
        ${supplyHtml(state, weak)}
        <div class="rd-weak" style="--c:${COLOR_HEX[weak]}"><span class="rd-gem"></span><div><small>本周破绽</small><b>${COLOR_CN[weak]}色 · 同色部队攻击 +30%</b></div></div>
        <div class="rd-roster"><div class="rd-section-head"><h4>出战阵容</h4><a class="rd-team-link" href="#team"><span data-icon="gear"></span>换队</a></div><ul>${roster}</ul></div>
        <div class="rd-boss-action"><p>额外掉落：宝石、藏宝图</p>${fightButton(v, 'raid')}</div>
      </section>
    </div>
  </div>`;
}
