/** 世界事件视图：20 格环形庆典棋盘 + 掷骰台 + 出战（换骰子） */
import { EVENT_MILESTONES } from '../../data/events';
import { raceName } from '../../data/races';
import { BOARD_SIZE, TILE_INFO, worldDiceFor, type BoardTile, type WorldState } from '../../systems/eventModes/world';
import { cssUrlVar, eventArt } from '../../shell/artAssets';
import { actButton, artImg, esc, fightButton, type ViewCtx } from './shared';

const TILE_ICON: Record<BoardTile, string> = {
  start: 'node-treasure', supply: 'tile-supply', harvest: 'tile-supply', gold: 'tile-gold', chest: 'node-treasure',
  lantern: 'tile-lantern', trap: 'tile-trap', caravan: 'tile-caravan', portal: 'node-event',
};

/** 棋盘格在 6×6 外圈上的位置（顺时针，0 = 左上起点） */
function cell(i: number): { col: number; row: number } {
  if (i <= 5) return { col: i + 1, row: 1 };
  if (i <= 9) return { col: 6, row: i - 4 };
  if (i <= 15) return { col: 16 - i, row: 6 };
  return { col: 1, row: 21 - i };
}

export function worldViewHtml(v: ViewCtx, state: WorldState): string {
  const theme = v.theme;
  const tiles = state.board.map((tile, i) => {
    const { col, row } = cell(i);
    const here = state.pos === i;
    return `<div class="wd-tile ${tile}${here ? ' here' : ''}" style="grid-column:${col};grid-row:${row}" title="${esc(`${TILE_INFO[tile].name}：${TILE_INFO[tile].desc}`)}">
        ${artImg(TILE_ICON[tile], 'wd-tile-img')}<b>${TILE_INFO[tile].name}</b>${here ? '<span class="wd-pawn" aria-label="当前位置"></span>' : ''}
      </div>`;
  }).join('');
  const survey = worldDiceFor({ save: v.save, week: v.week, weekStart: v.weekStart, typeId: 'worldEvent', theme }, 'survey');
  const escort = worldDiceFor({ save: v.save, week: v.week, weekStart: v.weekStart, typeId: 'worldEvent', theme }, 'escort');
  const choice = v.selected === 'escort' ? 'escort' : 'survey';
  const lucky = state.lucky > 0
    ? `<div class="wd-lucky"><small>定向骰 ×${state.lucky} · 自选点数</small><div>${[1, 2, 3, 4, 5, 6].map((n) => {
        const target = state.board[(state.pos + n) % BOARD_SIZE]!;
        return `<button type="button" data-act="lucky:${n}" title="${esc(`前进 ${n} 格 → ${TILE_INFO[target].name}`)}"><b>${n}</b><small>${TILE_INFO[target].name}</small></button>`;
      }).join('')}</div></div>`
    : '';
  const goals = EVENT_MILESTONES.worldEvent;
  const next = goals.find((m) => state.supplies < m.points);
  return `<div class="evm evm-world">
      <section class="wd-board" style='${cssUrlVar('wd-bg', eventArt('bg-world'))}'>
        ${tiles}
        <div class="wd-center">
          <div class="wd-supplies"><small>累计物资</small><b>${state.supplies}</b><span>${next ? `距「${esc(next.label)}」还差 ${next.points - state.supplies}` : '本周物资目标已全部达成'}</span></div>
          <div class="wd-dice">
            ${artImg('tile-dice', 'wd-dice-img')}
            <div><small>庆典骰子</small><b>×${state.dice}</b></div>
            ${actButton('掷骰前进', 'roll', { cls: 'primary big', disabled: state.dice <= 0 })}
          </div>
          ${lucky}
          <p class="wd-last">${state.last ? `上一次：${state.last.roll} 点 → ${esc(state.last.text)}` : '赢下活动战斗获得骰子，再回来掷骰前进。'}${state.doubleNext ? ' <em>灯会：下一次落点翻倍</em>' : ''}</p>
          <p class="wd-laps">第 ${state.laps + 1} 圈 · 经过起点物资 +6</p>
        </div>
      </section>
      <aside class="wd-side">
        <div class="wd-race"><small>本周加成种族</small><b>${theme.bonusRace ? esc(raceName(theme.bonusRace)) : '—'}</b><span>队伍中 ≥2 名 → 每胜骰子 +1（当前 ${survey.matches} 名）</span>
          ${theme.bonusRace ? `<a href="#troop/filter/race/${encodeURIComponent(theme.bonusRace)}"><span data-icon="helmet"></span>查看加成部队</a>` : ''}</div>
        <div class="wd-routes">
          <button type="button" class="wd-route${choice === 'survey' ? ' on' : ''}" data-select="survey"><b>遗迹搜寻</b><span>标准难度 · 胜利得骰子 ×${survey.dice}</span></button>
          <button type="button" class="wd-route${choice === 'escort' ? ' on' : ''}" data-select="escort"><b>护送商队</b><span>敌人 +5 级 · 胜利得骰子 ×${escort.dice}</span></button>
        </div>
        ${fightButton(v, choice)}
      </aside>
    </div>`;
}
