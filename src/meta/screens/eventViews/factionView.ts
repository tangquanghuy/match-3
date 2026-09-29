/** 阵营突袭视图：4×3 领地图 + 战区加成 + 反扑倒计时 */
import {
  DISTRICT_INFO, FACTION_CAPITAL_MIN_MATCH, FACTION_COLS, FACTION_COUNTER_EVERY, FACTION_ROWS,
  factionBonuses, factionLevel, factionMatchCount, factionTargets, type FactionState,
} from '../../systems/eventModes/faction';
import { cssUrlVar, eventArt } from '../../shell/artAssets';
import { artImg, esc, fightButton, type ViewCtx } from './shared';

export function factionViewHtml(v: ViewCtx, state: FactionState): string {
  const kingdom = v.theme.kingdom ?? '—';
  const targets = new Set(factionTargets(state).map((d) => `${d.x}-${d.y}`));
  const sel = state.districts.find((d) => v.selected === `tile:${d.x}-${d.y}` && targets.has(`${d.x}-${d.y}`));
  const tiles = [...state.districts].sort((a, b) => a.y - b.y || a.x - b.x).map((d) => {
    const id = `${d.x}-${d.y}`;
    const info = DISTRICT_INFO[d.kind];
    const st = d.owner === 'player' ? 'mine' : targets.has(id) ? 'target' : 'locked';
    const label = `${info.name} · ${d.owner === 'player' ? '已占领' : targets.has(id) ? '可进攻' : '未接壤'} · ${info.bonus}`;
    return `<button type="button" class="fa-tile ${d.kind} ${st}${sel === d ? ' selected' : ''}" style="grid-column:${d.x + 1};grid-row:${d.y + 1}" ${st === 'target' ? `data-select="tile:${id}"` : 'tabindex="-1" aria-disabled="true"'} title="${esc(label)}" aria-label="${esc(label)}">
        ${artImg(`district-${d.kind}`, 'fa-tile-img', info.name)}
        <b>${info.name}</b>
        <small>${d.owner === 'player' ? '己方' : st === 'target' ? `Lv.${factionLevel(state, d)}` : '敌占'}</small>
      </button>`;
  }).join('');
  const b = factionBonuses(state);
  const match = factionMatchCount(v.save, kingdom);
  const bonusRows = [
    [`阵营部队 ×${match}`, `攻击 +${match * 2} · 生命 +${match * 10}`],
    ['军营', b.attack ? `攻击 +${b.attack}` : ''],
    ['城塞', b.armor ? `护甲 +${b.armor}` : ''],
    ['粮仓/村落', b.hpPct ? `生命 +${Math.round(b.hpPct * 100)}%` : ''],
    ['圣坛', b.mastery ? `法力精通 +${b.mastery}` : ''],
    ['瞭望塔', b.enemyHp < 1 ? `敌人 ${Math.round(b.enemyHp * 100)}% 生命开战` : ''],
  ].filter(([, val]) => val).map(([k, val]) => `<li><span>${k}</span><b>${val}</b></li>`).join('');
  const owned = state.districts.filter((d) => d.owner === 'player').length;
  const counter = Array.from({ length: FACTION_COUNTER_EVERY }, (_, i) => `<i class="${i < FACTION_COUNTER_EVERY - state.counterIn ? 'on' : ''}"></i>`).join('');
  const detail = sel
    ? `<div class="fa-detail">
        <header>${artImg(`district-${sel.kind}`, 'fa-detail-img')}<div><b>${DISTRICT_INFO[sel.kind].name}</b><span>守军 Lv.${factionLevel(state, sel)}</span></div></header>
        <p>${sel.kind === 'capital' ? `攻陷王城完成第 ${state.round} 轮征服。需要出战队伍中至少 ${FACTION_CAPITAL_MIN_MATCH} 名${esc(kingdom)}部队（当前 ${match} 名）。` : `占领后获得战区加成：<b>${DISTRICT_INFO[sel.kind].bonus}</b>`}</p>
        ${fightButton(v, `tile:${sel.x}-${sel.y}`)}
      </div>`
    : '<div class="fa-detail empty"><span data-icon="flag"></span><p>选择一块发光的地块发起进攻。<br><small>边境与己方领地相邻的地块才能进攻。</small></p></div>';
  return `<div class="evm evm-faction">
      <section class="fa-map" style='${cssUrlVar('fa-bg', eventArt('bg-faction'))}'>
        <header class="fa-hud"><b>${esc(kingdom)} · 第 ${state.round} 轮征服</b><span>占领 ${owned} / ${FACTION_COLS * FACTION_ROWS}</span><span class="fa-front">← 边境</span></header>
        <div class="fa-grid">${tiles}</div>
      </section>
      <aside class="fa-side">
        ${detail}
        <div class="fa-counter"><div><small>敌军反扑</small><b>${state.counterIn} 场后</b></div><div class="fa-pips">${counter}</div><span>夺回一块接壤的己方地块</span></div>
        <div class="fa-bonus"><h4>战区加成</h4><ul>${bonusRows || '<li><span>尚未占领任何地块</span></li>'}</ul>
          <a href="#troop/filter/kingdom/${encodeURIComponent(kingdom)}"><span data-icon="helmet"></span>查看${esc(kingdom)}部队</a></div>
      </aside>
    </div>`;
}
