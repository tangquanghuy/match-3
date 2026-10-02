/**
 * 末日之塔 · 爬塔地图视图（自下而上一层层爬；StS 式分叉路线）。
 *
 * 2026-09-29 深化批（UX）：
 *  - 跑图时收起活动左栏，地图卡顶部是本轮 HUD（区段进度 / 楼层 / 塔金 / 图例 / 遗物图鉴）；
 *  - 地图上**任意节点**都能点开查看（类型、层数、敌人等级、词缀、奖励预览、能否到达），
 *    选中后高亮从当前位置走过去的所有路线；可拖拽平移，重渲染保持滚动位置；
 *  - 右栏：队伍头像与残血、法力加成（遗物 + 灵纹 + 编队旗帜，六色逐一可见）、遗物清单（名字与效果直接可读）；
 *  - 奖励/营地/商人/奇遇弹层可「收起查看地图」。
 * 客户端行为（拖拽、滚动记忆、面板开关）在 mountTowerBoard，由 eventsScreen.mount 调用。
 */
import { TOWER_BOSS_REWARDS, towerBossRewardKey } from '../../data/events';
import { INGOT_NAMES, type IngotKey } from '../../data/materials';
import { characterPortrait, type CharacterProfile } from '../../state/character';
import {
  TOWER_AFFIXES, TOWER_BLESSINGS, TOWER_EVENTS, TOWER_NODE_INFO, TOWER_RELICS, TOWER_RUNES, TOWER_TUNING, TOWER_ZONES,
  relicById, type RelicDef, type RelicRarity, type TowerAffix, type TowerNodeKind,
} from '../../data/towerData';
import {
  TOWER_FLOORS, towerBannerTotals, towerFloorOf, towerFutureReach, towerNodeAt, towerNodeLevel, towerReachable, towerRouteTo,
  type TowerNode, type TowerPending, type TowerRun, type TowerState,
} from '../../systems/eventModes/tower';
import { memberKey } from '../../systems/eventModes/common';
import { activeTeam } from '../../systems/teamRules';
import { equippedBannerOf } from '../../systems/banners';
import { fnv1a32 } from '../../data/hash';
import { BaseColor } from '../../../engine/types';
import { getTroopById } from '../../../data/troops';
import { COLOR_CN, COLOR_HEX, actButton, esc, fightButton, memberName, pct, type ViewCtx } from './shared';
import { cssUrlVar, eventArt, gemArt, statusArt } from '../../shell/artAssets';

const ROW_H = 78;
const PAD_TOP = 86;
const PAD_BOTTOM = 46;
const ALL_COLORS = Object.values(BaseColor) as BaseColor[];
const COLOR_GEM: Record<BaseColor, string> = {
  [BaseColor.Red]: 'red', [BaseColor.Blue]: 'blue', [BaseColor.Green]: 'green',
  [BaseColor.Yellow]: 'yellow', [BaseColor.Purple]: 'purple', [BaseColor.Brown]: 'brown',
};
const RARITY_CN: Record<RelicRarity, string> = { common: '普通', rare: '稀有', boss: '首领', curse: '诅咒' };
const BATTLE_KINDS: readonly TowerNodeKind[] = ['battle', 'elite', 'boss'];

// ---------------------------------------------------------------------------
// 小部件
// ---------------------------------------------------------------------------

/** 图标名 → URL：`gem:<路径>` 棋盘宝石、`status:<名>` 状态图标，其余走活动素材 */
function iconUrl(icon: string): string {
  if (icon.startsWith('gem:')) return gemArt(icon.slice(4));
  if (icon.startsWith('status:')) return statusArt(icon.slice(7));
  return eventArt(icon);
}

function iconImg(icon: string, cls: string, alt = ''): string {
  const url = iconUrl(icon);
  return url ? `<img class="${cls}" src="${url}" alt="${esc(alt)}" draggable="false" />` : `<span class="${cls} evm-art-missing" aria-hidden="true"></span>`;
}

function memberPortrait(externalId: string, character: CharacterProfile | null): string {
  const key = memberKey(externalId);
  if (key === 'hero') return character?.portrait === 'legacy' ? '/static/troops/hero.webp' : characterPortrait(character);
  const troop = getTroopById(Number(key));
  return troop?.artUrl ?? (troop?.portrait ? `/static/portraits/${troop.portrait}.webp` : '');
}

function colorWord(c: BaseColor): string {
  return `<em class="tw-c" style="--c:${COLOR_HEX[c]}">${COLOR_CN[c]}色</em>`;
}

function relicTags(r: RelicDef): string {
  return `<small class="tw-tags"><i class="tw-rar ${r.rarity}">${RARITY_CN[r.rarity]}</i>${r.tags.map((t) => `<i>${t}</i>`).join('')}</small>`;
}

function relicCard(id: string, action: string, footer = '', disabled = false): string {
  const r = relicById(id);
  if (!r) return '';
  return `<button type="button" class="tw-card ${r.rarity}" data-act="${esc(action)}"${disabled ? ' disabled' : ''}>
      ${iconImg(r.icon, 'tw-card-img', r.name)}
      ${relicTags(r)}<b>${esc(r.name)}</b><span>${esc(r.desc)}</span>${footer}
    </button>`;
}

function textCard(title: string, desc: string, action: string, opts: { icon?: string; tag?: string; disabled?: boolean; footer?: string } = {}): string {
  return `<button type="button" class="tw-card" data-act="${esc(action)}"${opts.disabled ? ' disabled' : ''}>
      ${opts.icon ? iconImg(opts.icon, 'tw-card-img') : ''}
      ${opts.tag ? `<small class="tw-tags"><i>${esc(opts.tag)}</i></small>` : ''}<b>${esc(title)}</b><span>${desc}</span>${opts.footer ?? ''}
    </button>`;
}

function affixChips(node: TowerNode, withDesc = false): string {
  return [node.affix, node.affix2].filter((a): a is TowerAffix => !!a).map((a) => {
    const def = TOWER_AFFIXES[a];
    return `<span class="tw-affix-chip">${iconImg(def.icon, 'tw-affix-img')}<b>${def.name}</b>${withDesc ? `<em>${esc(def.desc)}</em>` : ''}</span>`;
  }).join('');
}

function rewardPreview(node: TowerNode, v: ViewCtx, run: TowerRun): string {
  const [bl, bh] = TOWER_TUNING.goldBattle;
  const [el, eh] = TOWER_TUNING.goldElite;
  const [tl, th] = TOWER_TUNING.treasureGold;
  const m = TOWER_TUNING.starGoldMult;
  switch (node.kind) {
    case 'battle': return `符文 / 灵纹三选一 · 塔金 ${bl}–${bh}`;
    case 'elite': return node.star ? `稀有遗物三选一 · 塔金 ${Math.round(el * m)}–${Math.round(eh * m)}` : `遗物三选一 · 塔金 ${el}–${eh}`;
    case 'boss': {
      const reward = TOWER_BOSS_REWARDS.find(r => r.floor === towerFloorOf(run.zone, node.row));
      const materials = reward ? Object.entries(reward.mats.ingots ?? {}).map(([key, n]) => `${INGOT_NAMES[key as IngotKey]} ×${(n ?? 0) * 2}`).join('、')
        + `、特质石 ×${Object.values(reward.mats.traitstones ?? {}).reduce((sum, n) => sum + (n ?? 0), 0) * 2}` : '';
      const status = reward && v.week.eventData[towerBossRewardKey(reward.floor)] ? '本周已领' : '本周首通保底';
      return `首领遗物三选一 · 塔金 ${TOWER_TUNING.goldBoss} · 全队回复 ${Math.round(TOWER_TUNING.bossHealPct * 100)}%${materials ? ` · ${status}：${materials}` : ''}`;
    }
    case 'camp': return '休整 / 磨砺 / 冥想 / 招魂 四选一';
    case 'treasure': return `一件遗物 + 塔金 ${tl}–${th}`;
    case 'merchant': return '遗物、治疗、驱除诅咒，可付费换一批货';
    case 'event': return '随机奇遇，本轮尽量不重复';
  }
}

function nodeTitle(run: TowerRun, node: TowerNode): string {
  const info = TOWER_NODE_INFO[node.kind];
  return `第 ${towerFloorOf(run.zone, node.row)} 层 · ${node.star ? '强化' : ''}${info.name}`;
}

// ---------------------------------------------------------------------------
// 弹层：祝福 / 奖励 / 营地 / 宝库 / 商人 / 奇遇
// ---------------------------------------------------------------------------

function pendingTitle(p: TowerPending): string {
  switch (p.kind) {
    case 'blessing': return '开局祝福';
    case 'reward': return p.source === 'boss' ? '首领战利品' : p.source === 'elite' ? '精英战利品' : '战斗奖励';
    case 'camp': return '营地';
    case 'treasure': return '宝库';
    case 'merchant': return '塔中商人';
    case 'event': return TOWER_EVENTS.find((e) => e.id === p.event)?.title ?? '奇遇';
  }
}

function fillColors(text: string, colors: readonly BaseColor[] | undefined): string {
  return esc(text).replace(/\{c(\d)\}/g, (_m, i: string) => {
    const c = colors?.[Number(i)];
    return c ? colorWord(c) : '某种颜色';
  });
}

function pendingHtml(v: ViewCtx, run: TowerRun): string {
  const p = run.pending;
  if (!p) return '';
  let body = '';
  let foot = '';
  switch (p.kind) {
    case 'blessing':
      body = `<p class="tw-modal-copy">塔门前的守望者向你伸出手——选择一份祝福带上塔。</p><div class="tw-cards">${p.options.map((id, i) =>
        textCard(TOWER_BLESSINGS[id].name, esc(TOWER_BLESSINGS[id].desc), `pick:${i}`, { tag: '祝福', icon: TOWER_BLESSINGS[id].icon })).join('')}</div>`;
      break;
    case 'reward': {
      const rune = p.source === 'battle';
      body = `<p class="tw-modal-copy">塔金 <b>+${p.gold}</b> 已入袋。${rune ? '挑选一枚符文（灵纹 = 该色宝石法力 +1，本轮永久）：' : p.source === 'boss' ? '挑选一件首领遗物（强大，但有代价）：' : '挑选一件遗物：'}</p>
        <div class="tw-cards">${p.options.map((id, i) => {
          if (!rune) return relicCard(id, `pick:${i}`);
          const def = TOWER_RUNES[id as keyof typeof TOWER_RUNES] as { name: string; desc: string; icon: string; color?: BaseColor } | undefined;
          if (!def) return '';
          const now = def.color ? run.bonus.banner[def.color] ?? 0 : 0;
          return textCard(def.name, esc(def.desc), `pick:${i}`, { tag: def.color ? '灵纹' : '符文', icon: def.icon,
            footer: def.color ? `<em class="tw-price">当前 +${now} / 上限 +${TOWER_TUNING.runeBannerCap}</em>` : '' });
        }).join('') || '<p class="tw-modal-copy">没有可选的奖励了。</p>'}</div>`;
      foot = actButton(p.source === 'boss' ? '放弃并继续' : '放弃奖励', 'skip', { cls: 'ghost' });
      break;
    }
    case 'camp': {
      const dead = (v.week.runTeam ?? []).some((m) => m.defeated || m.hp <= 0);
      body = `<p class="tw-modal-copy">篝火噼啪作响。今晚只来得及做一件事。</p><div class="tw-cards">
        ${textCard('休整', `存活成员回复 ${Math.round(TOWER_TUNING.campRestPct * 100)}% 生命`, 'camp:rest', { icon: 'node-camp' })}
        ${textCard('磨砺', `全队攻击 +${TOWER_TUNING.campTrainAttack}（本轮永久）`, 'camp:train', { icon: 'relic-ember_sigil' })}
        ${textCard('冥想', `全队魔法 +${TOWER_TUNING.campMeditateMagic}（本轮永久）`, 'camp:meditate', { icon: 'relic-sage_quill' })}
        ${textCard('招魂', dead ? `一名阵亡成员以 ${Math.round(TOWER_TUNING.campRevivePct * 100)}% 生命归队` : '无人阵亡', 'camp:revive', { icon: 'relic-phoenix_feather', disabled: !dead })}
      </div>`;
      break;
    }
    case 'treasure':
      body = `<p class="tw-modal-copy">尘封的宝库里还剩下这些：</p><div class="tw-cards">
        ${p.relic ? relicCard(p.relic, 'claim') : ''}
        ${textCard(`塔金 +${p.gold}`, '一袋沉甸甸的塔金', 'claim', { icon: 'tile-gold', tag: '塔金' })}
      </div>`;
      foot = actButton('全部收下', 'claim', { cls: 'primary' });
      break;
    case 'merchant': {
      const curse = run.relics.map((id) => relicById(id)).find((r) => r?.rarity === 'curse');
      const price = (n: number, used = false, usedText = '已使用'): string => `<em class="tw-price${!used && run.gold < n ? ' short' : ''}">${used ? usedText : `${n} 塔金`}</em>`;
      body = `<p class="tw-modal-copy">「塔金换命，童叟无欺。」 你有 <b>${run.gold}</b> 塔金。</p><div class="tw-cards">
        ${p.stock.map((item, i) => relicCard(item.relic, `buy:${i}`, price(item.price, item.sold, '已售出'), item.sold || run.gold < item.price)).join('')}
        ${textCard('治疗', `存活成员回复 ${Math.round(TOWER_TUNING.healPct * 100)}% 生命`, 'buy:heal', { icon: 'relic-mending_moss', disabled: p.healUsed || run.gold < TOWER_TUNING.healPrice, footer: price(TOWER_TUNING.healPrice, p.healUsed) })}
        ${textCard('驱除诅咒', curse ? `移除「${esc(curse.name)}」` : '你身上没有诅咒', 'buy:purge', { icon: 'relic-curse_frailty', disabled: !curse || p.purgeUsed || run.gold < TOWER_TUNING.purgePrice, footer: price(TOWER_TUNING.purgePrice, p.purgeUsed) })}
        ${textCard('换一批货', '重新进货三件遗物（每个商人一次）', 'buy:reroll', { icon: 'node-merchant', disabled: !!p.rerolled || run.gold < TOWER_TUNING.rerollPrice, footer: price(TOWER_TUNING.rerollPrice, !!p.rerolled, '已换过') })}
      </div>`;
      foot = actButton('离开', 'leave', { cls: 'ghost' });
      break;
    }
    case 'event': {
      const ev = TOWER_EVENTS.find((e) => e.id === p.event);
      if (!ev) return '';
      body = `<p class="tw-modal-copy tw-event-text">${esc(ev.text)}</p><div class="tw-choices">${ev.options.map((o, i) => {
        const short = o.cost !== undefined && run.gold < o.cost;
        return `<button type="button" class="tw-choice" data-act="event:${i}"${short ? ' disabled' : ''}><b>${fillColors(o.label, p.colors)}${o.cost ? `<em class="tw-price${short ? ' short' : ''}">${o.cost} 塔金</em>` : ''}</b><span>${fillColors(o.desc, p.colors)}</span></button>`;
      }).join('')}</div>`;
      break;
    }
  }
  const title = pendingTitle(p);
  return `<div class="tw-modal" role="dialog" aria-modal="false" aria-label="${esc(title)}"><section class="tw-modal-card">
      <header><h3>${esc(title)}</h3><button type="button" class="tw-peek" data-tw-toggle="peek" aria-label="收起弹层查看地图"><span class="tw-peek-hide">收起 · 查看地图</span><span class="tw-peek-show">展开「${esc(title)}」</span></button></header>
      <div class="tw-modal-body">${body}</div>${foot ? `<footer>${foot}</footer>` : ''}
    </section></div>`;
}

// ---------------------------------------------------------------------------
// 地图
// ---------------------------------------------------------------------------

/** 车道宽与左右留白（像素）。地图画布按「实际用到的车道」计算宽度，在容器里居中；比容器宽时可左右拖动。 */
const LANE_W = 112;
const PAD_X = 72;

interface MapGeom { width: number; height: number; minCol: number }

function mapGeom(run: TowerRun): MapGeom {
  const cols = run.rows.flat().filter((n) => n.kind !== 'boss').map((n) => n.col);
  const minCol = Math.min(...cols);
  const maxCol = Math.max(...cols);
  return {
    width: PAD_X * 2 + (maxCol - minCol + 1) * LANE_W,
    height: PAD_TOP + run.rows.length * ROW_H + PAD_BOTTOM,
    minCol,
  };
}

/** 节点坐标（像素，自下而上；含确定性抖动）；首领固定在画布正中 */
function nodePos(run: TowerRun, node: TowerNode, g: MapGeom): { x: number; y: number } {
  const base = g.height - PAD_BOTTOM - node.row * ROW_H - ROW_H / 2;
  if (node.kind === 'boss') return { x: g.width / 2, y: base - 10 };
  const h = fnv1a32(`tw-jit-${run.seed}-${run.zone}-${node.row}-${node.col}`);
  const jx = ((h & 0xff) / 255 - 0.5) * 0.4;
  const jy = (((h >>> 8) & 0xff) / 255 - 0.5) * 18;
  return { x: PAD_X + (node.col - g.minCol + 0.5 + jx) * LANE_W, y: base + jy };
}

function selectedNode(v: ViewCtx, run: TowerRun): TowerNode | undefined {
  const m = v.selected?.match(/^(?:node|go):(\d+)-(\d+)$/);
  return m ? towerNodeAt(run, Number(m[1]), Number(m[2])) : undefined;
}

function mapHtml(v: ViewCtx, run: TowerRun): string {
  const rows = run.rows;
  const geom = mapGeom(run);
  const { width, height } = geom;
  const reach = new Set(towerReachable(run).map((n) => `${n.row}-${n.col}`));
  const future = towerFutureReach(run);
  const visited = new Set(run.path);
  const cur = run.at ? `${run.at.row}-${run.at.col}` : '';
  const sel = selectedNode(v, run);
  const route = sel ? towerRouteTo(run, sel.row, sel.col) : new Set<string>();
  const pos = new Map(rows.flat().map((n) => [`${n.row}-${n.col}`, nodePos(run, n, geom)]));

  const edges: string[] = [];
  for (const node of rows.flat()) {
    const from = `${node.row}-${node.col}`;
    for (const c of node.next) {
      const to = `${node.row + 1}-${c}`;
      const a = pos.get(from);
      const b = pos.get(to);
      if (!a || !b) continue;
      const walked = visited.has(from) && visited.has(to) && run.path.indexOf(to) === run.path.indexOf(from) + 1;
      const onRoute = route.has(`${from}>${to}`);
      const open = from === cur && reach.has(to);
      const live = (from === cur || future.has(from)) && future.has(to);
      const cls = walked ? 'walked' : onRoute ? 'route' : open ? 'open' : live ? 'live' : 'dead';
      edges.push(`<line x1="${a.x.toFixed(1)}" y1="${a.y.toFixed(1)}" x2="${b.x.toFixed(1)}" y2="${b.y.toFixed(1)}" class="${cls}"/>`);
    }
  }
  const nodes = rows.flat().map((node) => {
    const id = `${node.row}-${node.col}`;
    const p = pos.get(id)!;
    const state = id === cur ? 'current' : visited.has(id) ? 'done' : reach.has(id) ? 'reach' : future.has(id) ? 'future' : 'locked';
    const selCls = sel && sel.row === node.row && sel.col === node.col ? ' selected' : '';
    const info = TOWER_NODE_INFO[node.kind];
    const affixText = [node.affix, node.affix2].filter(Boolean).map((a) => TOWER_AFFIXES[a!].name).join('、');
    const label = `${nodeTitle(run, node)}${affixText ? ` · ${affixText}` : ''}`;
    const badges = node.affix ? `<i class="tw-node-affix">${[node.affix, node.affix2].filter(Boolean).map((a) => iconImg(TOWER_AFFIXES[a!].icon, 'tw-node-affix-img')).join('')}</i>` : '';
    return `<button type="button" class="tw-node ${node.kind} ${state}${node.star ? ' star' : ''}${selCls}" style="left:${p.x.toFixed(1)}px;top:${p.y.toFixed(1)}px" data-select="node:${id}" title="${esc(label)}" aria-label="${esc(label)}">
        ${iconImg(`node-${node.kind}`, 'tw-node-img', info.name)}${badges}${state === 'current' ? '<span class="tw-pin" aria-hidden="true">你</span>' : ''}
      </button>`;
  }).join('');
  const floors = rows.map((_row, r) => `<span class="tw-floor-mark" style="top:${height - PAD_BOTTOM - r * ROW_H - ROW_H / 2}px">${towerFloorOf(run.zone, r)}</span>`).join('');
  const focusRow = [...reach][0] ? Number([...reach][0]!.split('-')[0]) : run.at?.row ?? 0;
  const focusY = height - PAD_BOTTOM - focusRow * ROW_H - ROW_H / 2;
  // 横向聚焦：可前往节点（或当前节点）的平均 x，没有则画布中线
  const focusNodes = [...reach].map((k) => pos.get(k)!).filter(Boolean);
  const cp = cur ? pos.get(cur) : undefined;
  const focusX = focusNodes.length ? focusNodes.reduce((s, p) => s + p.x, 0) / focusNodes.length : cp?.x ?? width / 2;
  return `<div class="tw-map-scroll" data-tw-scroll data-tw-key="${run.seed}-${run.zone}-${run.path.length}-${run.pending ? 'p' : 'm'}" data-focus-y="${Math.round(focusY)}" data-focus-x="${Math.round(focusX)}">
      <div class="tw-floors" aria-hidden="true">${floors}</div>
      <div class="tw-map" style="width:${width}px;height:${height}px">
        <svg class="tw-edges" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" aria-hidden="true">${edges.join('')}</svg>
        ${nodes}
      </div>
    </div>`;
}

function detailHtml(v: ViewCtx, run: TowerRun): string {
  const node = selectedNode(v, run);
  const reachable = towerReachable(run);
  if (!node) {
    const chips = reachable.map((n) => `<button type="button" class="tw-next-chip ${n.kind}" data-select="node:${n.row}-${n.col}">${iconImg(`node-${n.kind}`, 'tw-next-img')}${n.star ? '强化' : ''}${TOWER_NODE_INFO[n.kind].name}</button>`).join('');
    return `<footer class="tw-detail empty">
        <span class="tw-detail-hint"><span data-icon="chevrons"></span>${run.pending ? '先处理当前节点的事项（可以收起弹层查看地图）' : '点击地图上任意节点查看详情，发光的节点可以前往；按住拖动地图'}</span>
        ${chips && !run.pending ? `<div class="tw-next"><small>下一步</small>${chips}</div>` : ''}
      </footer>`;
  }
  const id = `${node.row}-${node.col}`;
  const info = TOWER_NODE_INFO[node.kind];
  const battle = BATTLE_KINDS.includes(node.kind);
  const canGo = reachable.some((n) => n.row === node.row && n.col === node.col);
  const future = towerFutureReach(run).has(id);
  const cur = run.at && run.at.row === node.row && run.at.col === node.col;
  const done = run.path.includes(id);
  const steps = node.row - (run.at?.row ?? -1);
  const status = cur ? '<em class="tw-state here">你在这里</em>'
    : done ? '<em class="tw-state done">已走过</em>'
      : canGo ? '<em class="tw-state go">下一步可前往</em>'
        : future ? `<em class="tw-state future">在你的路线上 · 还需 ${steps} 步</em>`
          : '<em class="tw-state lock">已无法到达</em>';
  const action = canGo
    ? battle ? fightButton(v, `go:${id}`, node.kind === 'boss' ? '挑战首领' : '出战') : actButton('前往', `go:${id}`, { cls: 'primary big' })
    : `<button type="button" class="evm-btn ghost" data-select="">关闭</button>`;
  return `<footer class="tw-detail">
      <div class="tw-detail-icon ${node.kind}${node.star ? ' star' : ''}">${iconImg(`node-${node.kind}`, 'tw-detail-img', info.name)}</div>
      <div class="tw-detail-copy">
        <b>${nodeTitle(run, node)}${status}</b>
        <span>${esc(info.hint)}</span>
        <span class="tw-detail-meta">${battle ? `<i>敌人 Lv.${towerNodeLevel(run.zone, node)}</i>` : ''}<i>奖励：${rewardPreview(node, v, run)}</i></span>
        ${node.affix ? `<span class="tw-affix-row">${affixChips(node, true)}</span>` : ''}
      </div>
      <div class="tw-detail-act">${action}</div>
    </footer>`;
}

// ---------------------------------------------------------------------------
// HUD / 右栏 / 图鉴与图例
// ---------------------------------------------------------------------------

function hudHtml(v: ViewCtx, run: TowerRun): string {
  const zone = TOWER_ZONES[run.zone]!;
  const first = towerFloorOf(run.zone, 0);
  const zones = TOWER_ZONES.map((z, i) => `<li class="${i < run.zone ? 'done' : i === run.zone ? 'now' : ''}"><i></i><span>${z.name}</span></li>`).join('');
  return `<header class="tw-hud">
      <div class="tw-hud-zone"><small>第 ${run.zone + 1} 区 · 第 ${first}–${first + zone.rows - 1} 层</small><b>${zone.name}</b><span>${esc(zone.blurb)}</span></div>
      <ol class="tw-hud-zones" aria-label="区域进度">${zones}</ol>
      <div class="tw-hud-stats">
        <span><small>楼层</small><b>${run.floor}<em>/${TOWER_FLOORS}</em></b></span>
        <span><small>塔金</small><b>${iconImg('tile-gold', 'tw-gold-img')}${run.gold}</b></span>
        <span><small>积分</small><b>${v.week.points}</b></span>
      </div>
      <div class="tw-hud-tools">
        <button type="button" class="tw-tool" data-tw-toggle="legend"><span data-icon="map"></span>图例</button>
        <button type="button" class="tw-tool" data-tw-toggle="codex"><span data-icon="chest"></span>遗物图鉴</button>
        <a class="tw-tool" href="#events/towerOfDoom/rules"><span data-icon="book"></span>玩法说明</a>
      </div>
    </header>`;
}

function manaHtml(v: ViewCtx, run: TowerRun): string {
  const relicBanner = towerBannerTotals(run);
  const team = activeTeam(v.save);
  const teamBanner = team ? equippedBannerOf(v.save, team)?.boosts ?? {} : {};
  const mastery = run.relics.reduce((s, id) => s + (relicById(id)?.effect?.mastery ?? 0), 0);
  const cells = ALL_COLORS.map((c) => {
    const own = relicBanner[c] ?? 0;
    const flag = teamBanner[c] ?? 0;
    const total = Math.min(TOWER_TUNING.bannerCap, own + flag);
    const cls = total > 0 ? 'up' : total < 0 ? 'down' : '';
    const tip = `${COLOR_CN[c]}色：遗物与灵纹 ${own >= 0 ? '+' : ''}${own}，编队旗帜 ${flag >= 0 ? '+' : ''}${flag}（单色上限 +${TOWER_TUNING.bannerCap}）`;
    return `<li class="${cls}" title="${esc(tip)}">${iconImg(`gem:${COLOR_GEM[c]}`, 'tw-mana-gem', COLOR_CN[c])}<b>${total > 0 ? '+' : ''}${total}</b></li>`;
  }).join('');
  return `<section class="tw-sec"><h4>法力加成 <small>每次匹配额外获得</small></h4><ul class="tw-mana">${cells}</ul>
      ${mastery ? `<p class="tw-note">全色法力精通 +${mastery}（3 消有 ${Math.round((mastery / (mastery + 100)) * 100)}% 几率涌动翻倍）</p>` : ''}</section>`;
}

function relicListHtml(run: TowerRun): string {
  const counts = new Map<string, number>();
  for (const id of run.relics) counts.set(id, (counts.get(id) ?? 0) + 1);
  const order: RelicRarity[] = ['boss', 'rare', 'common', 'curse'];
  const items = [...counts.entries()]
    .map(([id, n]) => ({ r: relicById(id), n }))
    .filter((x): x is { r: RelicDef; n: number } => !!x.r)
    .sort((a, b) => order.indexOf(a.r.rarity) - order.indexOf(b.r.rarity));
  const list = items.map(({ r, n }) => `<li class="tw-relic-row ${r.rarity}">
      <span class="tw-relic-ico">${iconImg(r.icon, 'tw-relic-img', r.name)}${n > 1 ? `<em>×${n}</em>` : ''}</span>
      <div><b>${esc(r.name)}</b>${relicTags(r)}<p>${esc(r.desc)}</p></div>
    </li>`).join('');
  return `<section class="tw-sec tw-relic-sec"><h4>遗物 <small>${run.relics.length} 件</small><button type="button" class="tw-link" data-tw-toggle="codex">全部图鉴</button></h4>
      ${list ? `<ul class="tw-relic-list">${list}</ul>` : '<p class="tw-empty">还没有遗物。精英、宝库、商人与奇遇都能获得遗物。</p>'}</section>`;
}

function sideHtml(v: ViewCtx, run: TowerRun): string {
  const members = v.week.runTeam ?? [];
  const aliveN = members.filter((m) => !m.defeated && m.hp > 0).length;
  const team = members.map((m) => {
    const dead = m.defeated || m.hp <= 0;
    const ratio = pct(m.hp, m.maxHp);
    const url = memberPortrait(m.externalId, v.save.character);
    return `<li class="${dead ? 'dead' : ratio < 35 ? 'low' : ''}">
        <span class="tw-face">${url ? `<img src="${esc(url)}" alt="" loading="lazy" referrerpolicy="no-referrer" draggable="false" />` : ''}${dead ? '<i data-icon="skull"></i>' : ''}</span>
        <div><span>${esc(memberName(m.externalId))}</span><b>${dead ? '阵亡' : `${Math.round(m.hp)}/${Math.round(m.maxHp)}`}</b><i class="tw-hp"><em style="width:${ratio}%"></em></i></div>
      </li>`;
  }).join('');
  const bonus = [
    run.bonus.attack ? `攻击 ${run.bonus.attack > 0 ? '+' : ''}${run.bonus.attack}` : '',
    run.bonus.armor ? `护甲 ${run.bonus.armor > 0 ? '+' : ''}${run.bonus.armor}` : '',
    run.bonus.magic ? `魔法 ${run.bonus.magic > 0 ? '+' : ''}${run.bonus.magic}` : '',
    run.bonus.hpPct ? `生命上限 ${run.bonus.hpPct > 0 ? '+' : ''}${Math.round(run.bonus.hpPct * 100)}%` : '',
  ].filter(Boolean).map((t) => `<i>${t}</i>`).join('');
  return `<aside class="tw-side">
      <section class="tw-sec"><h4>登塔队伍 <small>存活 ${aliveN}/${members.length}</small></h4><ul class="tw-team">${team}</ul>
        ${bonus ? `<p class="tw-bonus">${bonus}</p>` : ''}</section>
      ${manaHtml(v, run)}
      ${relicListHtml(run)}
      ${actButton('放弃并结算', 'abandon', { cls: 'danger', confirm: `按已通过的第 ${run.floor} 层结算本轮？当前队伍状态、遗物与塔金将清除，本周最高层与积分保留。` })}
    </aside>`;
}

function codexHtml(run: TowerRun | null): string {
  const owned = new Set(run?.relics ?? []);
  const groups: [RelicRarity, string][] = [['common', '普通遗物'], ['rare', '稀有遗物'], ['boss', '首领遗物'], ['curse', '诅咒']];
  const sections = groups.map(([rar, label]) => {
    const list = TOWER_RELICS.filter((r) => r.rarity === rar);
    return `<section><h4>${label} <small>${list.length} 件 · 来源：${rar === 'common' ? '精英 / 宝库 / 商人 / 奇遇' : rar === 'rare' ? '精英 / 宝库 / 商人 / 奇遇（较少）' : rar === 'boss' ? '击败区首领' : '奇遇与魔鬼交易的代价'}</small></h4>
      <ul class="tw-codex-grid">${list.map((r) => `<li class="${r.rarity}${owned.has(r.id) ? ' owned' : ''}">${iconImg(r.icon, 'tw-codex-img', r.name)}<div><b>${esc(r.name)}${owned.has(r.id) ? '<em>已拥有</em>' : ''}</b>${relicTags(r)}<p>${esc(r.desc)}</p></div></li>`).join('')}</ul></section>`;
  }).join('');
  return `<div class="tw-sheet" data-tw-panel="codex" hidden role="dialog" aria-label="遗物图鉴"><section class="tw-sheet-card">
      <header><h3>遗物图鉴</h3><p>遗物的战斗效果复用棋盘上已有的机制：旗帜法力加成、风暴、特殊宝石（燃烧 / 冻结 / 织网 / 末日骷髅 / 沙漏 / 闪电 / 通配 / 炸弹）与状态。「每名队员」类效果随存活人数变化，被击晕的队员当回合不触发。</p><button type="button" class="tw-close" data-tw-close aria-label="关闭">×</button></header>
      <div class="tw-sheet-body">${sections}</div>
    </section></div>`;
}

function legendHtml(): string {
  const kinds = (['battle', 'elite', 'camp', 'treasure', 'merchant', 'event', 'boss'] as const).map((k) =>
    `<li>${iconImg(`node-${k}`, 'tw-legend-img')}<b>${TOWER_NODE_INFO[k].name}</b><span>${TOWER_NODE_INFO[k].hint}</span></li>`).join('');
  const affixes = (Object.keys(TOWER_AFFIXES) as TowerAffix[]).map((a) => {
    const def = TOWER_AFFIXES[a] as { name: string; desc: string; icon: string; minZone?: number };
    return `<li>${iconImg(def.icon, 'tw-legend-img small')}<b>${def.name}</b><span>${esc(def.desc)}${def.minZone ? `（第 ${def.minZone + 1} 区起）` : ''}</span></li>`;
  }).join('');
  return `<div class="tw-sheet" data-tw-panel="legend" hidden role="dialog" aria-label="图例"><section class="tw-sheet-card narrow">
      <header><h3>图例</h3><p>精英身上的小图标是词缀；金色边框的「强化精英」有两个词缀，奖励只出稀有遗物。首领前一层固定是营地。</p><button type="button" class="tw-close" data-tw-close aria-label="关闭">×</button></header>
      <div class="tw-sheet-body"><h4>节点</h4><ul class="tw-legend">${kinds}</ul><h4>精英词缀</h4><ul class="tw-legend">${affixes}</ul></div>
    </section></div>`;
}

function startHtml(v: ViewCtx, state: TowerState): string {
  const best = v.week.eventData.floorBest ?? 0;
  const last = state.last ? `<p class="tw-last">上一轮：${esc(state.last.reason)} · 到达第 ${state.last.floor} 层</p>` : '';
  const members = activeTeam(v.save)?.members ?? [];
  const faces = members.map((m, i) => {
    const ext = `p${i}-${m.kind === 'hero' ? 'hero' : m.troopId}`;
    const url = memberPortrait(ext, v.save.character);
    return `<li><span class="tw-face">${url ? `<img src="${esc(url)}" alt="" loading="lazy" referrerpolicy="no-referrer" draggable="false" />` : ''}</span><b>${esc(memberName(ext))}</b></li>`;
  }).join('');
  const kinds = (['battle', 'elite', 'camp', 'treasure', 'merchant', 'event', 'boss'] as const).map((k) =>
    `<li>${iconImg(`node-${k}`, 'tw-legend-img')}<b>${TOWER_NODE_INFO[k].name}</b><span>${TOWER_NODE_INFO[k].hint}</span></li>`).join('');
  const sample = ['doom_skull_idol', 'bone_horn', 'ember_seed', 'sand_glass', 'wild_prism', 'prism_flame'].map((id) => relicById(id)).filter((r): r is RelicDef => !!r);
  return `<div class="tw-start">
      <section class="tw-start-hero">
        <h3>登上末日之塔</h3>
        <p>25 层，三个区域，每区一张随机分叉的地图。自己决定走哪条路：多打精英换遗物，还是绕去营地保命。队伍生命与阵亡一路延续，战败即结束。</p>
        <p>第 8 / 16 / 25 层首领每周首通，额外保底获得钢锭与特质石，胜利时自动入账。<a href="#events/towerOfDoom/rewards">查看通关材料</a></p>
        <div class="tw-start-stats"><span>本周最高 <b>${best}</b> / ${TOWER_FLOORS} 层</span><span>本周登塔 <b>${state.runs}</b> 轮</span><span>遗物 <b>${TOWER_RELICS.length}</b> 件</span></div>
        ${last}
        ${faces ? `<div class="tw-start-team"><small>出战队伍（开始后锁定到本轮结束）</small><ul>${faces}</ul><a href="#team"><span data-icon="gear"></span>调整编队</a></div>` : ''}
        <div class="tw-start-actions">${actButton('<span data-icon="swords"></span>开始登塔', 'start', { cls: 'primary big' })}<button type="button" class="evm-btn ghost" data-tw-toggle="codex">遗物图鉴</button></div>
      </section>
      <aside class="tw-start-side">
        <section><h4>节点</h4><ul class="tw-legend">${kinds}</ul></section>
        <section><h4>遗物一瞥 <small>复用棋盘机制</small></h4><ul class="tw-sample">${sample.map((r) => `<li class="${r.rarity}">${iconImg(r.icon, 'tw-sample-img', r.name)}<div><b>${esc(r.name)}</b><span>${esc(r.desc)}</span></div></li>`).join('')}</ul></section>
      </aside>
    </div>`;
}

export function towerViewHtml(v: ViewCtx, state: TowerState): string {
  const style = cssUrlVar('tw-bg', eventArt('bg-tower'));
  if (!state.run) return `<div class="evm evm-tower" style='${style}'>${startHtml(v, state)}${codexHtml(null)}</div>`;
  const run = state.run;
  return `<div class="evm evm-tower is-running" style='${style}'>
      <section class="tw-mapcard">
        ${hudHtml(v, run)}
        ${mapHtml(v, run)}
        ${detailHtml(v, run)}
        ${pendingHtml(v, run)}
      </section>
      ${sideHtml(v, run)}
      ${codexHtml(run)}${legendHtml()}
    </div>`;
}

// ---------------------------------------------------------------------------
// 客户端行为：滚动记忆 / 拖拽平移 / 面板开关
// ---------------------------------------------------------------------------

const SCROLL = { key: '', top: 0, left: 0 };

type OnFn = (target: EventTarget, type: string, fn: EventListenerOrEventListenerObject) => void;

export function mountTowerBoard(board: HTMLElement, on: OnFn): void {
  const scroller = board.querySelector<HTMLElement>('[data-tw-scroll]');
  if (scroller) {
    const key = scroller.dataset.twKey ?? '';
    if (SCROLL.key === key) {
      scroller.scrollTop = SCROLL.top;
      scroller.scrollLeft = SCROLL.left;
    } else {
      SCROLL.key = key;
      const map = scroller.querySelector<HTMLElement>('.tw-map');
      // 纵向：下一步那一行贴近视口底部（留一行余量），上方尽量多露出后面的路
      scroller.scrollTop = Math.max(0, Number(scroller.dataset.focusY) + ROW_H * 1.1 - scroller.clientHeight);
      // 画布比容器宽时，横向先对准下一步可走的节点
      scroller.scrollLeft = Math.max(0, (map?.offsetLeft ?? 0) + Number(scroller.dataset.focusX) - scroller.clientWidth / 2);
      SCROLL.top = scroller.scrollTop;
      SCROLL.left = scroller.scrollLeft;
    }
    on(scroller, 'scroll', () => { SCROLL.top = scroller.scrollTop; SCROLL.left = scroller.scrollLeft; });

    // 鼠标/触控笔按住拖动平移；触摸走原生滚动。拖动超过 5px 后吞掉随后的 click，避免误选节点。
    let drag: { x: number; y: number; top: number; left: number; moved: boolean } | null = null;
    let swallow = false;
    on(scroller, 'pointerdown', (e) => {
      const ev = e as PointerEvent;
      if (ev.button !== 0 || ev.pointerType === 'touch') return;
      drag = { x: ev.clientX, y: ev.clientY, top: scroller.scrollTop, left: scroller.scrollLeft, moved: false };
    });
    on(scroller, 'pointermove', (e) => {
      const ev = e as PointerEvent;
      if (!drag) return;
      const dx = ev.clientX - drag.x;
      const dy = ev.clientY - drag.y;
      if (!drag.moved && Math.hypot(dx, dy) > 5) {
        drag.moved = true;
        scroller.classList.add('dragging');
        try { scroller.setPointerCapture(ev.pointerId); } catch { /* 指针已释放 */ }
      }
      if (drag.moved) {
        scroller.scrollLeft = drag.left - dx;
        scroller.scrollTop = drag.top - dy;
      }
    });
    const end = (): void => {
      if (drag?.moved) swallow = true;
      drag = null;
      scroller.classList.remove('dragging');
    };
    on(scroller, 'pointerup', end);
    on(scroller, 'pointercancel', end);
    on(scroller, 'click', (e) => {
      if (!swallow) return;
      swallow = false;
      e.stopPropagation();
      e.preventDefault();
    });
  }

  // 图例 / 图鉴 / 弹层收起：纯客户端开关，不写存档、不重渲染
  const panels = (): HTMLElement[] => [...board.querySelectorAll<HTMLElement>('[data-tw-panel]')];
  on(board, 'click', (e) => {
    const target = e.target as HTMLElement;
    const toggle = target.closest<HTMLElement>('[data-tw-toggle]');
    if (toggle) {
      const name = toggle.dataset.twToggle!;
      if (name === 'peek') {
        board.querySelector('.tw-modal')?.classList.toggle('peek');
        return;
      }
      for (const p of panels()) p.hidden = p.dataset.twPanel !== name || !p.hidden;
      return;
    }
    const sheet = target.closest<HTMLElement>('[data-tw-panel]');
    if (target.closest('[data-tw-close]') || (sheet && target === sheet)) {
      for (const p of panels()) p.hidden = true;
    }
  });
  on(document, 'keydown', (e) => {
    if ((e as KeyboardEvent).key !== 'Escape') return;
    for (const p of panels()) p.hidden = true;
  });
}
