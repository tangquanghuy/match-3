/** 世界事件视图：20 格环形庆典棋盘 + 掷骰台 + 遭遇/集市弹层 + 出战（换骰子） */
import { EVENT_MILESTONES } from '../../data/events';
import { raceName } from '../../data/races';
import {
  BOARD_SIZE, ENCOUNTER_INFO, TILE_INFO, WORLD_BLESSINGS, WORLD_BLESSING_PRICE, WORLD_ENCOUNTER_ACTION,
  worldDiceFor, worldThemeColor, type BoardTile, type WorldEncounter, type WorldState,
} from '../../systems/eventModes/world';
import { SPECIAL_TUNING } from '../../systems/specialEncounters';
import { cssUrlVar, eventArt } from '../../shell/artAssets';
import { COLOR_CN, COLOR_HEX, actButton, esc, fightButton, iconImg, type ViewCtx } from './shared';

const TILE_ICON: Record<BoardTile, string> = {
  start: 'node-treasure', supply: 'tile-supply', harvest: 'tile-supply', gold: 'tile-gold', chest: 'node-treasure',
  lantern: 'tile-lantern', trap: 'tile-trap', caravan: 'tile-caravan', portal: 'node-event',
  gnome: 'troop:6497', band: 'troop:7063', market: 'node-merchant', arena: 'node-elite',
};

const ENCOUNTER_ICON: Record<WorldEncounter, string> = {
  treasureGnome: 'troop:6497', gnomeBand: 'troop:7063', gnomeParty: 'troop:6673', mimic: 'troop:6277',
  bandit: 'tile-trap', arena: 'node-elite',
};

/** 遭遇的奖励预览（与 specialEncounters / world.progress 同口径） */
function encounterRewards(enc: WorldEncounter): string[] {
  const T = SPECIAL_TUNING;
  const pctOf = (p: number): string => `${Math.round(p * 100)}%`;
  switch (enc) {
    case 'treasureGnome': return [`击倒地精：黄金 +${T.gnome.gold}`, `${pctOf(T.gnome.gemChance)} 钻石 +${T.gems}`, `${pctOf(T.gnome.mapChance)} 藏宝图 +1`, `地精逃跑：零钱 +${T.gnome.fleeGold}`];
    case 'gnomeBand': return [`每击倒一名乐手：黄金 +${T.band.goldEach}`, `全员击倒：${pctOf(T.band.gemChance)} 钻石 +${T.gems}、${pctOf(T.band.mapChance)} 藏宝图`];
    case 'gnomeParty': return ['珠宝地精：20% 钻石 +30', `灵魂地精：灵魂 +${T.party.souls}`, `荣耀地精：荣耀 +${T.party.glory}`, '机械地精：30% 熔铸符卷'];
    case 'mimic': return [`击倒宝箱怪：黄金 +${T.mimic.gold}`, `${pctOf(T.mimic.gemChance)} 钻石 +${T.gems}`, `${pctOf(T.mimic.mapChance)} 藏宝图 +1`, '宝箱加倍：物资 +6、骰子 +1'];
    case 'bandit': return ['胜利：物资 +4', '放弃：交出 2 物资'];
    case 'arena': return ['胜利：物资 +10', `8 回合内速胜：15% 钻石 +${T.gems}`];
  }
}

/** 遭遇的战斗规则提示 */
function encounterRules(enc: WorldEncounter): string[] {
  switch (enc) {
    case 'treasureGnome': return ['击倒宝藏地精即获胜', '地精每回合 +3 法力，施法时有 30% 几率逃跑', '地精身亡撒出赃物宝石（摧毁得金币）'];
    case 'gnomeBand': return ['乐手每回合 +2 法力，每次演奏 30% 几率溜走', '开局棋盘有 4 颗糖果宝石'];
    case 'gnomeParty': return ['地精每回合 +2 法力，施法可能逃跑', '地精有 15% 几率闪避骷髅'];
    case 'mimic': return ['击倒宝箱怪即获胜', '宝箱怪受击掉出赃物宝石', '咬合：骷髅攻击使目标流血'];
    case 'bandit': return ['强盗的骷髅攻击会窃取法力'];
    case 'arena': return ['开局预置 2 颗 ×2 通配、2 颗沙漏', '每个我方回合开始创造 1 颗主题色糖果宝石'];
  }
}

/** 棋盘格在 6×6 外圈上的位置（顺时针，0 = 左上起点） */
function cell(i: number): { col: number; row: number } {
  if (i <= 5) return { col: i + 1, row: 1 };
  if (i <= 9) return { col: 6, row: i - 4 };
  if (i <= 15) return { col: 16 - i, row: 6 };
  return { col: 1, row: 21 - i };
}

function pendingHtml(v: ViewCtx, state: WorldState): string {
  const p = state.pending;
  if (!p) return '';
  if (p.kind === 'market') {
    return `<div class="wd-pending wd-market" role="dialog" aria-label="庆典集市">
        <h4>庆典集市</h4><p>花 ${WORLD_BLESSING_PRICE} 黄金购买一份祝福，下一场活动战斗生效（胜败都会消耗）。</p>
        <div class="wd-bless-list">${p.options.map((id, i) => {
          const b = WORLD_BLESSINGS[id];
          return `<button type="button" class="wd-bless" data-act="bless:${i}"${p.bought || v.save.currencies.gold < WORLD_BLESSING_PRICE ? ' disabled' : ''}>
              ${iconImg(b.icon, 'wd-bless-ico')}<b>${esc(b.name)}</b><small>${esc(b.desc)}</small><em>${WORLD_BLESSING_PRICE} 黄金</em></button>`;
        }).join('')}</div>
        ${actButton('离开集市', 'skip')}
      </div>`;
  }
  const info = ENCOUNTER_INFO[p.enc];
  const blocked = v.ready(WORLD_ENCOUNTER_ACTION);
  return `<div class="wd-pending wd-encounter" role="dialog" aria-label="${esc(info.name)}">
      <div class="wd-enc-head">${iconImg(ENCOUNTER_ICON[p.enc], 'wd-enc-art')}<div><h4>${esc(info.name)}${p.tier > 0 ? ' <em>强化</em>' : ''}</h4><p>${esc(info.blurb)}</p></div></div>
      <ul class="wd-enc-rules">${encounterRules(p.enc).map((r) => `<li>${esc(r)}</li>`).join('')}</ul>
      <ul class="wd-enc-rewards">${encounterRewards(p.enc).map((r) => `<li>${esc(r)}</li>`).join('')}</ul>
      <div class="wd-enc-actions">
        <button class="ev-fight" type="button" data-fight="${WORLD_ENCOUNTER_ACTION}"${blocked ? ' disabled' : ''}><span data-icon="swords"></span>出战</button>
        ${actButton(p.enc === 'bandit' ? '交出物资' : '放弃', 'skip', { confirm: p.enc === 'bandit' ? '交出 2 物资让强盗放行？' : `放弃「${info.name}」？遭遇会离开棋盘。` })}
      </div>
      ${blocked ? `<p class="ev-warning" role="status">${esc(blocked)}</p>` : ''}
    </div>`;
}

export function worldViewHtml(v: ViewCtx, state: WorldState): string {
  const theme = v.theme;
  const color = worldThemeColor(v.weekStart);
  const tiles = state.board.map((tile, i) => {
    const { col, row } = cell(i);
    const here = state.pos === i;
    return `<div class="wd-tile ${tile}${here ? ' here' : ''}" style="grid-column:${col};grid-row:${row}" title="${esc(`${TILE_INFO[tile].name}：${TILE_INFO[tile].desc}`)}">
        ${iconImg(TILE_ICON[tile], 'wd-tile-img')}<b>${TILE_INFO[tile].name}</b>${here ? '<span class="wd-pawn" aria-label="当前位置"></span>' : ''}
      </div>`;
  }).join('');
  const survey = worldDiceFor({ save: v.save, week: v.week, weekStart: v.weekStart, typeId: 'worldEvent', theme }, 'survey');
  const escort = worldDiceFor({ save: v.save, week: v.week, weekStart: v.weekStart, typeId: 'worldEvent', theme }, 'escort');
  const choice = v.selected === 'escort' ? 'escort' : 'survey';
  const locked = !!state.pending;
  const lucky = state.lucky > 0 && !locked
    ? `<div class="wd-lucky"><small>定向骰 ×${state.lucky} · 自选点数</small><div>${[1, 2, 3, 4, 5, 6].map((n) => {
        const target = state.board[(state.pos + n) % BOARD_SIZE]!;
        return `<button type="button" data-act="lucky:${n}" title="${esc(`前进 ${n} 格 → ${TILE_INFO[target].name}`)}"><b>${n}</b><small>${TILE_INFO[target].name}</small></button>`;
      }).join('')}</div></div>`
    : '';
  const goals = EVENT_MILESTONES.worldEvent;
  const next = goals.find((m) => state.supplies < m.points);
  const blessing = state.blessing ? WORLD_BLESSINGS[state.blessing] : null;
  return `<div class="evm evm-world">
      <section class="wd-board" style='${cssUrlVar('wd-bg', eventArt('bg-world'))}'>
        ${tiles}
        <div class="wd-center">
          ${locked ? pendingHtml(v, state) : `
          <div class="wd-supplies"><small>累计物资</small><b>${state.supplies}</b><span>${next ? `距「${esc(next.label)}」还差 ${next.points - state.supplies}` : '本周物资目标已全部达成'}</span></div>
          <div class="wd-dice">
            ${iconImg('tile-dice', 'wd-dice-img')}
            <div><small>庆典骰子</small><b>×${state.dice}</b></div>
            ${actButton('掷骰前进', 'roll', { cls: 'primary big', disabled: state.dice <= 0 })}
          </div>
          ${lucky}
          <p class="wd-last">${state.last ? `上一次：${state.last.roll} 点 → ${esc(state.last.text)}` : '赢下活动战斗获得骰子，再回来掷骰前进。'}${state.doubleNext ? ' <em>灯会：下一次落点翻倍</em>' : ''}</p>
          <p class="wd-laps">第 ${state.laps + 1} 圈 · 经过起点物资 +6${state.specials ? ` · 已击倒特殊遭遇 ${state.specials} 次` : ''}</p>`}
        </div>
      </section>
      <aside class="wd-side">
        <div class="wd-race"><small>本周加成种族</small><b>${theme.bonusRace ? esc(raceName(theme.bonusRace)) : '—'}</b><span>队伍中 ≥2 名 → 每胜骰子 +1（当前 ${survey.matches} 名）</span>
          ${theme.bonusRace ? `<a href="#troop/filter/race/${encodeURIComponent(theme.bonusRace)}"><span data-icon="helmet"></span>查看加成部队</a>` : ''}</div>
        <div class="wd-theme"><small>庆典主题色</small><b style="color:${COLOR_HEX[color]}">${COLOR_CN[color]}色</b><span>遗迹搜寻中${COLOR_CN[color]}色糖果宝石会自然掉落（匹配为全体${COLOR_CN[color]}色盟友充能）</span></div>
        ${blessing ? `<div class="wd-blessing">${iconImg(blessing.icon, 'wd-bless-ico')}<div><small>下一场祝福</small><b>${esc(blessing.name)}</b><span>${esc(blessing.desc)}</span></div></div>` : ''}
        <div class="wd-routes">
          <button type="button" class="wd-route${choice === 'survey' ? ' on' : ''}" data-select="survey"><b>遗迹搜寻</b><span>标准难度 · 糖果宝石掉落 · 胜利得骰子 ×${survey.dice}</span></button>
          <button type="button" class="wd-route${choice === 'escort' ? ' on' : ''}" data-select="escort"><b>护送商队</b><span>敌人 +5 级 · 坚守 8 回合即胜 · 骰子 ×${escort.dice}</span></button>
        </div>
        ${fightButton(v, choice)}
      </aside>
    </div>`;
}
