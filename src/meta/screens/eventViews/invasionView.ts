/** 入侵视图：三路兵线地图（左侧来敌，右侧王都）+ 截击面板 */
import { getTroopById } from '../../../data/troops';
import {
  DEFENSES, INVASION_READINESS_MAX, INVASION_CITY_MAX, INVASION_HOLD_TURNS, INVASION_LANES, INVASION_MAX_DIST, SQUAD_INFO, SQUAD_TRAIT_DESC,
  invasionSquadLevel, squadHoldable, squadInspired, type DefenseId, type InvasionState, type Squad, type SquadKind,
} from '../../systems/eventModes/invasion';
import { troopImg } from '../teamScreen';
import { cssUrlVar, eventArt } from '../../shell/artAssets';
import { actButton, esc, fightButton, iconImg, type ViewCtx } from './shared';

const KIND_ICON: Record<SquadKind, string> = { raider: 'squad-raider', siege: 'squad-siege', warlord: 'squad-warlord', shaman: 'gem:status/curseGem', caravan: 'troop:6673' };
const squadIcon = (s: { kind: SquadKind; troops: number[] }): string => s.kind === 'shaman' || s.kind === 'caravan' ? `troop:${s.troops[s.kind === 'caravan' ? 1 : 0] ?? 0}` : KIND_ICON[s.kind];

const LANE_Y = [20, 50, 80];
const CITY = { x: 90, y: 50 };

/** 路线上第 dist 步的位置（百分比坐标） */
function stepPos(lane: number, dist: number): { x: number; y: number } {
  const t = (INVASION_MAX_DIST - dist) / INVASION_MAX_DIST; // 0 = 最远，1 = 城下
  const x = 10 + t * 68;
  const y = LANE_Y[lane]! + (CITY.y - LANE_Y[lane]!) * t * t * 0.8;
  return { x, y };
}

function squadDetail(v: ViewCtx, state: InvasionState, squad: Squad | undefined): string {
  if (!squad) {
    return `<div class="iv-detail empty"><span data-icon="compass"></span><p>选一支敌军出战：胜利消灭该兵团；每打完一场，其余兵团都会向王都推进。<br><small>优先拦截离王都近的敌军！守住一波可领取奖励并获得城防点。</small></p></div>`;
  }
  const info = SQUAD_INFO[squad.kind];
  const tags = [
    squad.dist >= 3 ? '<em class="good">先机：敌人 85% 生命开战 · 积分 +20</em>' : '',
    squad.dist <= 1 ? '<em class="good">背水：全队护甲 +8</em>' : '',
    squadInspired(state, squad) ? '<em class="bad">督战：敌人攻击 +15%</em>' : '',
  ].join('');
  const faces = squad.troops.map((id) => { const t = getTroopById(id); return `<figure>${troopImg(t ?? null, false, 'alt=""')}<figcaption>${esc(t?.name ?? '')}</figcaption></figure>`; }).join('');
  return `<div class="iv-detail">
      <header>${iconImg(squadIcon(squad), 'iv-detail-img')}<div><b>${info.name} · ${INVASION_LANES[squad.lane]}</b><span>距王都 ${squad.dist} 步 · 敌人 Lv.${invasionSquadLevel(state.wave, squad.kind)}</span></div></header>
      <p class="iv-detail-desc">${info.desc}</p>
      <div class="iv-faces">${faces}</div>
      ${SQUAD_TRAIT_DESC[squad.kind] ? `<p class="iv-trait"><b>兵团特性</b> ${esc(SQUAD_TRAIT_DESC[squad.kind]!)}</p>` : ''}
      <div class="iv-tags">${tags}</div>
      ${fightButton(v, `squad:${squad.id}`, squad.kind === 'caravan' ? '截住辎重队' : v.fightLabel)}
      ${squadHoldable(squad) ? `<div class="iv-hold"><p>城门坚守：撑过 ${INVASION_HOLD_TURNS} 个我方回合即胜，兵团被击退回 ${INVASION_MAX_DIST} 步外（不歼灭）</p>${fightButton(v, `hold:${squad.id}`, '城门坚守')}</div>` : ''}
    </div>`;
}

function defenseHtml(state: InvasionState): string {
  const rows = (Object.keys(DEFENSES) as DefenseId[]).map((id) => {
    const d = DEFENSES[id];
    const built = state.built.includes(id);
    return `<li class="${built ? 'built' : ''}">${iconImg(d.icon, 'iv-def-ico')}<div><b>${esc(d.name)}</b><small>${esc(d.desc)}</small></div>
        ${built ? '<em>已建成</em>' : actButton(`${d.cost} 点`, `build:${id}`, { disabled: state.defense < d.cost, title: `建造${d.name}` })}</li>`;
  }).join('');
  return `<div class="iv-defense"><h4>永久工事 <small>本周持续生效 · ${state.built.length}/${Object.keys(DEFENSES).length}</small></h4><ul>${rows}</ul></div>`;
}

export function invasionViewHtml(v: ViewCtx, state: InvasionState): string {
  const selected = state.squads.find((s) => v.selected === `squad:${s.id}`);
  const lanes = LANE_Y.map((_, lane) => {
    const pts = Array.from({ length: INVASION_MAX_DIST + 1 }, (_x, i) => stepPos(lane, INVASION_MAX_DIST - i));
    const d = `M 2 ${LANE_Y[lane]} ` + pts.map((p) => `L ${p.x} ${p.y}`).join(' ') + ` L ${CITY.x - 4} ${CITY.y}`;
    return `<path d="${d}" vector-effect="non-scaling-stroke"/>`;
  }).join('');
  const steps = LANE_Y.flatMap((_, lane) => Array.from({ length: INVASION_MAX_DIST }, (_x, i) => {
    const p = stepPos(lane, i + 1);
    return `<span class="iv-step" style="left:${p.x}%;top:${p.y}%">${i + 1}</span>`;
  })).join('');
  const laneLabels = INVASION_LANES.map((name, lane) => `<span class="iv-lane-name" style="top:${LANE_Y[lane]}%">${name}</span>`).join('');
  const stacks = new Map<string, number>();
  const tokens = state.squads.map((s) => {
    const key = `${s.lane}-${s.dist}`;
    const k = stacks.get(key) ?? 0;
    stacks.set(key, k + 1);
    const p = stepPos(s.lane, s.dist);
    const sel = selected?.id === s.id ? ' selected' : '';
    const label = `${SQUAD_INFO[s.kind].name} · ${INVASION_LANES[s.lane]} · 距王都 ${s.dist} 步`;
    return `<button type="button" class="iv-squad ${s.kind}${sel}${s.dist <= 1 ? ' danger' : ''}" style="left:calc(${p.x}% + ${k * 30}px);top:calc(${p.y}% - ${k * 44}px)" data-select="squad:${s.id}" title="${esc(label)}" aria-label="${esc(label)}">
        ${iconImg(squadIcon(s), 'iv-squad-img')}<b>${s.dist}</b></button>`;
  }).join('');
  const hearts = Array.from({ length: INVASION_CITY_MAX }, (_, i) => `<i class="${i < state.city ? 'on' : ''}"></i>`).join('');
  const legend = (Object.keys(SQUAD_INFO) as (keyof typeof SQUAD_INFO)[]).map((k) =>
    `<li>${iconImg(KIND_ICON[k], 'iv-legend-img')}<b>${SQUAD_INFO[k].name}</b><span>${SQUAD_INFO[k].desc}</span></li>`).join('');
  return `<div class="evm evm-invasion">
      <section class="iv-map" style='${cssUrlVar('iv-bg', eventArt('bg-invasion'))}'>
        <header class="iv-hud"><b>第 ${state.wave} 波</b><span>敌军 ${state.squads.length} 支</span><span>已守土 ${state.repelled} 次${state.fallen ? ` · 城破 ${state.fallen}` : ''}</span></header>
        <svg class="iv-lanes" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">${lanes}</svg>
        ${laneLabels}${steps}${tokens}
        <div class="iv-city" style="left:${CITY.x}%;top:${CITY.y}%"><b>王都</b><div class="iv-hearts" aria-label="城防 ${state.city}/${INVASION_CITY_MAX}">${hearts}</div></div>
      </section>
      <aside class="iv-side">
        ${squadDetail(v, state, selected)}
        <a class="iv-defense-link" href="#events/invasion/defense">城防建设 <b>${state.defense} 点</b> →</a>
        <ul class="iv-legend">${legend}</ul>
      </aside>
    </div>`;
}

/** 独立城防建设页：永久工事之外，可重复修缮与储备下一场战斗的补给。 */
export function invasionDefenseHtml(state: InvasionState): string {
  return `<div class="iv-build-page">
      <a class="ev-rewards-back" href="#events/invasion">← 返回入侵地图</a>
      <h2>城防建设</h2>
      <p>截击获胜获得 1 城防点；清除一波敌军后再获 2 点。城防点仅在本周有效。先建永久工事，再把多余点数投入修缮或战备。</p>
      <div class="iv-build-balance">可用城防点 <b>${state.defense}</b> · 王都城防 ${state.city}/${INVASION_CITY_MAX}</div>
      ${defenseHtml(state)}
      <div class="iv-defense"><h4>持续投入</h4><ul>
        <li><span data-icon="shield"></span><div><b>修缮王都</b><small>城防未满时恢复 1 点；新波次开始时城防也会回满。</small></div>${actButton('2 点', 'repair', { disabled: state.defense < 2 || state.city >= INVASION_CITY_MAX })}</li>
        <li><span data-icon="swords"></span><div><b>战备补给 ${state.readiness}/${INVASION_READINESS_MAX}</b><small>下一场入侵战斗全队攻击 +2、护甲 +4；每场消耗 1 份，最多储备 ${INVASION_READINESS_MAX} 份。</small></div>${actButton('2 点', 'supply', { disabled: state.defense < 2 || state.readiness >= INVASION_READINESS_MAX })}</li>
      </ul></div>
    </div>`;
}
