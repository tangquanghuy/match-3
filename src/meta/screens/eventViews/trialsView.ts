/** 职业试炼视图：本周 8 道规则试炼卡 + 星级目标 */
import {
  TRIALS_PER_WEEK, TRIAL_AFFIXES, TRIAL_FAST_TURNS, TRIAL_STAR_POINTS, TRIAL_WIN_POINTS, goalText, trialAffixOf, trialById, trialLevel, trialStarCount, type TrialsState,
} from '../../systems/eventModes/trials';
import { activeTeam } from '../../systems/teamRules';
import { cssUrlVar, eventArt } from '../../shell/artAssets';
import { esc, fightButton, type ViewCtx } from './shared';

const stars = (got: readonly boolean[]): string => got.map((g) => `<i class="${g ? 'on' : ''}">★</i>`).join('');

function affixTag(weekStart: number, id: string): string {
  const a = TRIAL_AFFIXES[trialAffixOf(weekStart, id)];
  return `<span class="ct-affix-tag ${a.good ? 'good' : 'bad'}" title="${esc(a.desc)}">${esc(a.name)}</span>`;
}

export function trialsViewHtml(v: ViewCtx, state: TrialsState): string {
  const defaultId = state.trials.find((t) => !(state.stars[t] ?? []).every(Boolean)) ?? state.trials[0]!;
  const selId = v.selected?.match(/^trial:(\w+)$/)?.[1] ?? defaultId;
  const cards = state.trials.map((id, i) => {
    const def = trialById(id);
    if (!def) return '';
    const got = state.stars[id] ?? [false, false, false];
    const full = got.every(Boolean);
    return `<button type="button" class="ct-card${id === selId ? ' selected' : ''}${full ? ' full' : ''}" data-select="trial:${id}">
        <small>第 ${i + 1} 道 · Lv.${trialLevel(i)}</small><b>${esc(def.name)}</b><span class="ct-rule">${esc(def.rule)}</span>${affixTag(v.weekStart, id)}
        <span class="ct-stars">${stars(got)}</span>
      </button>`;
  }).join('');
  const index = state.trials.indexOf(selId);
  const def = trialById(selId);
  const got = state.stars[selId] ?? [false, false, false];
  const fresh = got.filter((g) => !g).length;
  const hero = activeTeam(v.save)?.members.some((m) => m.kind === 'hero') ?? false;
  const total = trialStarCount(state);
  const detail = def ? `<div class="ct-detail">
      <header><small>第 ${index + 1} 道试炼 · 敌人 Lv.${trialLevel(index)}</small><h3>${esc(def.name)}</h3></header>
      <p class="ct-rule-big"><span>规则</span>${esc(def.rule)}</p>
      <p class="ct-affix ${TRIAL_AFFIXES[trialAffixOf(v.weekStart, selId)].good ? 'good' : 'bad'}"><span>本周词条</span><b>${esc(TRIAL_AFFIXES[trialAffixOf(v.weekStart, selId)].name)}</b> ${esc(TRIAL_AFFIXES[trialAffixOf(v.weekStart, selId)].desc)}</p>
      <ol class="ct-goals">${def.goals.map((g, i) => `<li class="${got[i] ? 'on' : ''}"><i>★</i><span>${goalText(g)}</span>${got[i] ? '<em>已达成</em>' : `<em>+${TRIAL_STAR_POINTS} 分</em>`}</li>`).join('')}</ol>
      <p class="ct-points">本场最多 <b>${TRIAL_WIN_POINTS + TRIAL_STAR_POINTS * fresh}</b> 分（胜利 ${TRIAL_WIN_POINTS} + 新星 ${fresh} × ${TRIAL_STAR_POINTS}）· 职业经验 ×2，三星 ×3 · 我方 ${TRIAL_FAST_TURNS} 回合内速胜 15% 钻石彩头</p>
      ${hero ? '' : '<p class="ct-hero-lock"><span data-icon="lock"></span>主角未编入队伍 <a href="#team">去编队</a></p>'}
      ${fightButton(v, `trial:${selId}`)}
    </div>` : '';
  return `<div class="evm evm-trials" style='${cssUrlVar('ct-bg', eventArt('bg-trials'))}'>
      <section class="ct-list">
        <header class="ct-head"><b>本周试炼</b><span>星级 <b>${total}</b> / ${TRIALS_PER_WEEK * 3}</span><span>已挑战 ${state.attempts} 次</span></header>
        <div class="ct-grid">${cards}</div>
      </section>
      <aside class="ct-side">${detail}<a class="ct-class" href="#hero"><span data-icon="book"></span>更换职业</a></aside>
    </div>`;
}
