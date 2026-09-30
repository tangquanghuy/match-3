/** 入侵视图：三路兵线地图（左侧来敌，右侧王都）+ 截击面板 */
import { getTroopById } from '../../../data/troops';
import {
  DEFENSES, INVASION_CITY_MAX, INVASION_HOLD_TURNS, INVASION_LANES, INVASION_MAX_DIST, SQUAD_INFO, SQUAD_TRAIT_DESC,
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
    return `<div class="iv-detail empty"><span data-icon="compass"></span><p>点击地图上的敌军兵团，选择本场截击目标。<br><small>其余兵团会在战后向王都推进一步。</small></p></div>`;
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
  return `<div class="iv-defense"><h4>城防建设 <small>城防点 <b>${state.defense}</b> · 每胜 +1，守土 +2</small></h4><ul>${rows}</ul></div>`;
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
        ${defenseHtml(state)}
        <ul class="iv-legend">${legend}</ul>
      </aside>
    </div>`;
}
