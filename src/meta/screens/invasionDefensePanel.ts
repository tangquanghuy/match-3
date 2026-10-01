import { defenseEntryKey, defenseRewardsReady, validSnapshot } from '../systems/invasionDefense';
import type { MetaSave, TeamPreset } from '../state/schema';
import { getTroopById } from '../../data/troops';
import { troopImg } from './teamScreen';
import { validateTeam } from '../systems/teamRules';

const esc = (value: string): string => value.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
function lineup(save: MetaSave, team: TeamPreset | null): string {
  if (!team) return '<p class="inv-defense-empty">尚未部署防守队伍</p>';
  return `<ol class="inv-defense-lineup">${team.members.map((m, i) => {
    const hero = m.kind === 'hero';
    const troop = m.kind === 'troop' ? getTroopById(m.troopId) ?? null : null;
    const name = hero ? '主角' : troop?.name ?? '未知部队';
    const level = m.kind === 'troop' ? save.collection[String(m.troopId)]?.level ?? 1 : save.hero.level;
    return `<li><span class="inv-defense-slot">${i + 1}</span>${troopImg(troop, hero, '', save.character)}<div><b>${esc(name)}</b><small>Lv.${level}</small></div></li>`;
  }).join('')}</ol>`;
}
export function invasionDefensePanel(save: MetaSave): string {
  const team = save.invasion.defenseTeam;
  const reward = save.invasion.defenseProgress.rewards;
  const ready = defenseRewardsReady(save);
  const savedIndex = team ? save.teams.findIndex(t => JSON.stringify(t) === JSON.stringify(team)) : -1;
  const initial = team ? savedIndex : Math.max(0, Math.min(save.activeTeamIndex, save.teams.length - 1));
  const options = save.teams.map((t, i) => {
    const valid = validateTeam(save, t).ok;
    return `<option value="${i}"${i === initial ? ' selected' : ''}${valid ? '' : ' disabled'}>${esc(t.name)}${valid ? '' : '（编队未完成）'}</option>`;
  }).join('');
  return `<section class="inv-secondary-body inv-defense-page" data-invasion-defense>
    <header class="inv-defense-heading"><h2>领地防守</h2><a href="#invasion/defense-log" data-defense-log-link>防守记录 <span aria-hidden="true">→</span></a></header>
    <section class="inv-defense-treasury${ready ? ' is-ready' : ''}" aria-label="防守奖励">
      <div class="inv-defense-treasury-art" aria-hidden="true"><span data-icon="coin"></span>${ready ? '<i class="defense-floating-coin"></i><i class="defense-floating-coin"></i><i class="defense-floating-coin"></i>' : ''}</div>
      <div class="inv-defense-treasury-copy"><h3>防守奖励</h3><div class="inv-defense-resources"><span><i data-icon="coin"></i><b>${reward.gold.toLocaleString()}</b><small>金币</small></span><span><i data-icon="soul"></i><b>${reward.souls.toLocaleString()}</b><small>灵魂</small></span><span><i data-icon="glory"></i><b>${reward.glory.toLocaleString()}</b><small>荣誉</small></span></div></div>
      <button type="button" class="primary" data-claim-defense${ready ? '' : ' disabled'}>${ready ? '领取奖励' : '暂无奖励'}</button>
    </section>
    <section class="inv-defense-config"><header><h3>防守队伍</h3><span>当前：<b data-defense-name>${team ? esc(team.name) : '尚未部署'}</b></span></header>
      <div class="inv-defense-picker"><label for="invasionDefensePreset">选择队伍</label><select id="invasionDefensePreset">${team && savedIndex < 0 ? `<option value="-1" selected>当前防守 · ${esc(team.name)}</option>` : ''}${options}</select></div>
      ${team && savedIndex < 0 ? `<div data-defense-preview="-1">${lineup(save, team)}</div>` : ''}
      ${save.teams.map((t, i) => `<div data-defense-preview="${i}"${i === initial ? '' : ' hidden'}>${lineup(save, t)}</div>`).join('')}
      <div class="inv-defense-actions"><a href="#team">编辑队伍</a><button type="button" class="primary" data-deploy-defense${initial >= 0 && save.teams[initial] && validateTeam(save, save.teams[initial]!).ok ? '' : ' disabled'}>部署防守</button></div>
    </section>
  </section>`;
}
export function invasionDefenseLogPanel(save: MetaSave, now: number): string {
  const log = save.invasion.defenseLog;
  const entries = log?.entries.map(e => {
    const key = defenseEntryKey(e);
    const accounted = save.invasion.defenseProgress.results.find(r => r.key === key);
    const delta = accounted?.vpDelta;
    const vp = delta === undefined ? '待核算' : `${delta > 0 ? '+' : ''}${delta} VP`;
    const used = accounted?.revenge;
    const eligible = !e.defenderWon && !e.revenge && e.at >= save.createdAt;
    const available = eligible && !used && validSnapshot(e.attackerSnapshot, now);
    const revengeLabel = used === 'won' ? '复仇成功' : used === 'lost' ? '复仇失利' : used === 'pending' ? '已出战' : eligible ? '阵容已过期' : '';
    return `<li class="inv-defense-event" data-defense-result="${e.defenderWon ? 'win' : 'loss'}" data-can-revenge="${available}">
      <div class="inv-defense-event-copy"><b>${esc(e.name)}</b><small><time datetime="${new Date(e.at).toISOString()}">${new Date(e.at).toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false })}</time>${e.revenge ? ' · 对手复仇' : ''}${e.frenzy ? ' · 血怒镜像' : ''}${e.surrendered ? ' · 对手认输／离场' : ''}</small>
      <span class="inv-defense-event-outcome"><strong class="${e.defenderWon ? 'held' : 'lost'}">${e.defenderWon ? '防守成功' : '防守失利'}</strong><span class="inv-defense-vp ${delta && delta > 0 ? 'held' : 'lost'}">${vp}</span></span></div>
      ${available ? `<button type="button" data-revenge="${esc(key)}">复仇战 <span aria-hidden="true">↗</span></button>` : `<small class="inv-revenge-state">${revengeLabel}</small>`}</li>`;
  }).join('') ?? '';
  return `<section class="inv-secondary-body inv-defense-page inv-defense-log-page" data-invasion-defense-log>
    <header class="inv-defense-heading"><h2>防守记录</h2><button type="button" data-refresh-defense>刷新</button></header>
    <section class="inv-defense-history">
      <div class="inv-defense-filters" role="group" aria-label="筛选防守记录"><button type="button" data-defense-filter="all" aria-pressed="true">全部</button><button type="button" data-defense-filter="loss" aria-pressed="false">失守</button><button type="button" data-defense-filter="revenge" aria-pressed="false">可复仇</button><small>最近 50 场</small></div>
      ${entries ? `<ol>${entries}</ol><p class="inv-defense-empty" data-defense-filter-empty hidden>暂无符合条件的记录</p>` : `<p class="inv-defense-empty">${log ? '暂无被入侵记录' : '战报尚未同步'}</p>`}
    </section>
  </section>`;
}
