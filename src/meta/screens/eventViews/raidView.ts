/** 突袭首领视图：首领立绘 + 三阶段血池 + 疲惫名单 + 破绽色 */
import { getTroopById } from '../../../data/troops';
import { RAID_ARCHETYPES, RAID_HEAVY_HIT, RAID_PHASES, RAID_SUPPLIES, raidPhaseOf, raidTierLevel, raidWeakColor, type RaidState } from '../../systems/eventModes/raid';
import { activeTeam } from '../../systems/teamRules';
import { troopImg } from '../teamScreen';
import { cssUrlVar, eventArt } from '../../shell/artAssets';
import { COLOR_CN, COLOR_HEX, actButton, esc, fightButton, iconImg, pct, type ViewCtx } from './shared';

const fmt = (n: number): string => n.toLocaleString('en-US');

function archetypeHtml(state: RaidState): string {
  const a = RAID_ARCHETYPES[state.archetype];
  return `<div class="rd-arch">${iconImg(a.icon, 'rd-arch-ico')}<div><small>首领机制</small><b>${esc(a.name)}</b><span>${esc(a.desc)}</span>
      <span class="rd-arch-tip">首领受骷髅伤害会掉落破绽色巨人宝石；单场打掉 ≥${Math.round(RAID_HEAVY_HIT * 100)}% 血池有 20% 几率得钻石，亲手讨伐 50% 得藏宝图</span></div></div>`;
}

function supplyIcon(id: string, icon: string, weak: string): string {
  return id === 'giant' ? `gem:special/giantGem${weak}` : icon;
}

function supplyHtml(state: RaidState, weak: string): string {
  if (state.supply) {
    const s = RAID_SUPPLIES[state.supply];
    return `<div class="rd-supply on">${iconImg(supplyIcon(state.supply, s.icon, weak), 'rd-sup-ico')}<div><small>已装备补给 · 下一场生效</small><b>${esc(s.name)}</b><span>${esc(s.desc)}</span></div></div>`;
  }
  if (!state.offer) return '';
  return `<div class="rd-supply"><h4>战术补给 <small>三选一 · 下一场生效</small></h4><div class="rd-sup-list">${state.offer.map((id, i) => {
    const s = RAID_SUPPLIES[id];
    return `<button type="button" class="rd-sup" data-act="supply:${i}">${iconImg(supplyIcon(id, s.icon, weak), 'rd-sup-ico')}<b>${esc(s.name)}</b><small>${esc(s.desc)}</small></button>`;
  }).join('')}</div>${actButton('不要补给', 'supply:skip', { cls: 'ghost' })}</div>`;
}

export function raidViewHtml(v: ViewCtx, state: RaidState): string {
  const boss = getTroopById(state.lineup[0]!);
  const phase = raidPhaseOf(state.hp, state.max);
  const weak = raidWeakColor(v.weekStart);
  const hpPct = pct(state.hp, state.max);
  const guards = state.lineup.slice(1).map((id, i) => {
    const t = getTroopById(id);
    const extra = i === 2;
    return `<div class="rd-guard${extra ? ' reinforce' : ''}${extra && phase < 2 ? ' dormant' : ''}" title="${esc(t?.name ?? '')}${extra ? ' · 绝境阶段增援' : ''}">${troopImg(t ?? null, false, 'alt=""')}<span>${esc(t?.name ?? '护卫')}</span>${extra ? '<em>绝境增援</em>' : ''}</div>`;
  }).join('');
  const phases = RAID_PHASES.map((p, i) => `<li class="${i === phase ? 'now' : i < phase ? 'past' : ''}"><b>${p.name}</b><span>${p.desc}</span></li>`).join('');

  const team = activeTeam(v.save)?.members ?? [];
  const roster = team.map((m) => {
    if (m.kind === 'hero') return '<li class="hero"><span class="rd-name">主角</span><em class="ok">不会疲惫</em></li>';
    if (m.kind !== 'troop') return '';
    const t = getTroopById(m.troopId);
    const tired = state.fatiguePhase === phase && state.fatigue.includes(String(m.troopId));
    const weakHit = t?.manaColors.includes(weak);
    return `<li class="${tired ? 'tired' : ''}">${troopImg(t ?? null, false, 'alt="" class="rd-face"')}<span class="rd-name">${esc(t?.name ?? '')}</span>
        ${weakHit ? `<em class="weak" style="--c:${COLOR_HEX[weak]}">破绽 +30%</em>` : ''}${tired ? '<em class="tired">疲惫 -40%</em>' : '<em class="ok">精力充沛</em>'}</li>`;
  }).join('');
  const tiredNames = state.fatiguePhase === phase ? state.fatigue.map((id) => getTroopById(Number(id))?.name).filter(Boolean) : [];

  return `<div class="evm evm-raid" style='${cssUrlVar('rd-bg', eventArt('bg-raid'))}'>
      <section class="rd-stage">
        <div class="rd-boss">
          <div class="rd-boss-art">${troopImg(boss ?? null, false, `alt="${esc(boss?.name ?? '首领')}"`)}</div>
          <div class="rd-boss-info">
            <small>第 ${state.tier} 阶首领 · ${esc(state.kingdom)} · Lv.${raidTierLevel(state.tier)}</small>
            <h3>${esc(boss?.name ?? '首领')}</h3>
            <div class="rd-hp" aria-label="首领血池">
              <i style="width:${hpPct}%"></i><s style="left:33.33%"></s><s style="left:66.67%"></s>
              <b>${fmt(state.hp)} / ${fmt(state.max)}</b>
            </div>
            <ol class="rd-phases">${phases}</ol>
          </div>
        </div>
        <div class="rd-guards">${guards}</div>
      </section>
      <section class="rd-panel">
        ${archetypeHtml(state)}
        ${supplyHtml(state, weak)}
        <div class="rd-weak" style="--c:${COLOR_HEX[weak]}"><span class="rd-gem"></span><div><small>本周破绽</small><b>${COLOR_CN[weak]}色</b><span>法力颜色含${COLOR_CN[weak]}色的部队攻击 +30%</span></div></div>
        <div class="rd-roster"><h4>出战阵容 <small>疲惫的部队本阶段攻击 -40%，换人出战</small></h4><ul>${roster}</ul>
          <a class="rd-team-link" href="#team"><span data-icon="gear"></span>换一批部队</a></div>
        <div class="rd-tired"><h4>本阶段已疲惫 <small>${tiredNames.length}</small></h4><p>${tiredNames.length ? tiredNames.map((n) => esc(n!)).join('、') : '暂无——首领进入新阶段或被讨伐时全员恢复'}</p></div>
        <div class="rd-stats"><span>已讨伐 <b>${state.slain}</b></span><span>最高单场 <b>${fmt(state.bestHit)}</b></span><span>出击 <b>${state.attempts}</b> 次</span></div>
        ${fightButton(v, 'raid')}
      </section>
    </div>`;
}
