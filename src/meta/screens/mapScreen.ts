/**
 * 世界地图屏（游戏首页，计划 §5.1 + §5.2 王国弹层）。
 * 节点/弹层的运行时数值全部来自存档 + kingdoms/tribute/kingdomOps 纯函数；
 * 小样仅保留布局与美术。任务/探索入口经 BattleLauncher 打真实对局。
 */
import { isFailure, todayStartOf, weekStartOf, type MetaGateway } from '../gateway';
import type { MetaSave } from '../state/schema';
import { KINGDOM_MAX_LEVEL, kingdomNodeState } from '../systems/kingdomOps';
import { EXPLORE_MAX_TIER, kingdomBonusStat, kingdomTroopPool } from '../data/kingdoms';
import { EVENT_MILESTONES, EVENT_TYPES, type EventTypeId } from '../data/events';
import { anyWeaponById } from '../data/weaponCatalog';
import { kingdomUpgradeCost, INVASION, TRIBUTE, KINGDOM_FIRST_CLEAR_GEMS } from '../data/economy';
import { eventMetricOf, eventShopOf } from '../systems/events';
import { bottomNavHtml, fitStage, mountIcons, toast, toastHtml, topbarHtml, $, $$ } from '../shell/chrome';
import type { Screen, ShellCtx } from '../shell/screen';
import { ART, KINGDOM_VIEWS, kingdomViewOf, type KingdomView } from './mapData';

const MAP_W = 5440;
const MAP_H = 2920;
const HOME_SCALE = 0.78;
const START_KINGDOM = '破碎尖塔';

const fmt = (n: number): string => n.toLocaleString('en-US');

/** 时间戳 → 本地 HH:MM（进贡「下一袋 21:40」「21:40 满」文案用） */
const clockOf = (ts: number): string => {
  const d = new Date(ts);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
};

export interface EventRailStatus {
  claimableActivities: number;
  affordableShops: number;
  actionableActivities: number;
}

/** 地图入口只聚合“现在进去有事可做”的活动，六活动常驻本身不算提醒。 */
export function eventRailStatus(save: MetaSave, weekStart: number, now = weekStart): EventRailStatus {
  const claimable = new Set<EventTypeId>();
  const affordable = new Set<EventTypeId>();

  for (const def of EVENT_TYPES) {
    const shop = eventShopOf(save, weekStart, def.id, now);
    const metric = eventMetricOf(save, weekStart, def.id);
    const reached = EVENT_MILESTONES[def.id].some(
      (milestone, index) => metric.value >= milestone.points && !shop.week.claimed.includes(index),
    );
    if (reached) claimable.add(def.id);

    const canBuy = shop.rows.some(
      (row) => (row.stockLeft === null || row.stockLeft > 0) && shop.week.tokens >= row.goods.cost,
    );
    if (canBuy) affordable.add(def.id);
  }

  return {
    claimableActivities: claimable.size,
    affordableShops: affordable.size,
    actionableActivities: new Set([...claimable, ...affordable]).size,
  };
}

export interface NodeVm {
  view: KingdomView;
  level: number;
  locked: boolean;
  unlockLevel: number;
  questsDone: number;
  nextNode: number | null;
  exploreUnlocked: boolean;
  /** 当前 Hard/VH 关（1~6；0=没设过，按 1 显示） */
  exploreTier: number;
  tributeHours: number;
  tributeHits: number;
  /** 进贡口径单源（M-4）：三处 UI 共用 tributeReady，不再各用一套判据 */
  tributeGold: number;
  tributeSouls: number;
  tributeKeys: number;
  tributeReady: boolean;
  tributeOverflowing: boolean;
  tributeCapAt: number;
  tributeNextHourAt: number;
  ownedTroops: number;
  poolSize: number;
}

/** 存档 → 节点视图模型（真实数据单源） */
function nodeVms(gateway: MetaGateway): NodeVm[] {
  const save = gateway.current();
  const now = Date.now();
  return KINGDOM_VIEWS.map((view) => {
    const state = kingdomNodeState(save, view.name, now);
    const pool = kingdomTroopPool(view.name);
    return {
      view,
      level: save.kingdoms[view.name]?.level ?? 1,
      locked: state.locked,
      unlockLevel: state.unlockLevel,
      questsDone: state.questsDone,
      nextNode: state.nextNode,
      exploreUnlocked: state.exploreUnlocked,
      exploreTier: Math.min(EXPLORE_MAX_TIER, Math.max(1, save.kingdoms[view.name]?.exploreTier || 1)),
      tributeHours: state.tributeHours,
      tributeHits: state.tributeHits,
      tributeGold: state.tributeGold,
      tributeSouls: state.tributeSouls,
      tributeKeys: state.tributeKeys,
      tributeReady: state.tributeReady,
      tributeOverflowing: state.tributeOverflowing,
      tributeCapAt: state.tributeCapAt,
      tributeNextHourAt: state.tributeNextHourAt,
      ownedTroops: pool.filter((t) => save.collection[String(t.id)]).length,
      poolSize: pool.length,
    };
  });
}

function crestSvg(view: KingdomView): string {
  const metal = { gold: ['#8f6c37', '#f0d99c', '#9d763e'], silver: ['#6d7480', '#e4e8ec', '#8b9198'], copper: ['#7a4a28', '#e2b07a', '#8d5a32'] }[view.metal] ?? { gold: ['', '', ''] }.gold;
  const enamel = { spire: ['#3d4458', '#1c2230'], ice: ['#6f8698', '#2a3c4c'], forest: ['#35563d', '#1a2c20'], desert: ['#8a6236', '#3d2814'], gothic: ['#4a2c44', '#1c1018'], swamp: ['#3b5440', '#1a261c'] }[view.biome] ?? ['#3d4458', '#1c2230'];
  const gid = 'g' + view.en.replace(/\W/g, '');
  const eid = 'e' + view.en.replace(/\W/g, '');
  const shape = { heater: 'M50 7 L88 20 V54 C88 76 68 91 50 97 C32 91 12 76 12 54 V20 Z', kite: 'M50 6 L90 30 L74 94 L50 99 L26 94 L10 30 Z', round: 'M50 8 C78 8 90 28 90 52 C90 76 68 92 50 98 C32 92 10 76 10 52 C10 28 22 8 50 8 Z', hex: 'M50 7 L86 26 V70 L50 93 L14 70 V26 Z', tower: 'M20 16 H36 V10 H64 V16 H80 V40 L88 50 V90 H12 V50 L20 40 Z' }[view.shape] ?? 'M50 7 L88 20 V54 C88 76 68 91 50 97 C32 91 12 76 12 54 V20 Z';
  const emblem = { spire: 'M9 20V8l3-4 3 4v12M7 20h10M12 8v12', gear: 'M12 8a4 4 0 100 8 4 4 0 000-8zm0-5v3m0 12v3M4 12h3m10 0h3M6 6l2 2m8 8 2 2M6 18l2-2m8-8 2-2', thorn: 'M12 3v18M8 8l4 4 4-4M7 14l5 5 5-5', sword: 'M12 3l2 8-2 11-2-11zM8 11h8', sun: 'M12 8a4 4 0 100 8 4 4 0 000-8zm0-5v2m0 14v2M4 12h2m12 0h2M6 6l1.5 1.5M16.5 16.5 18 18M6 18l1.5-1.5M16.5 7.5 18 6', chest: 'M4 10V8a6 4 0 0116 0v2M3 10h18v10H3zM10 10v4h4v-4' }[view.emblem] ?? 'M12 8a4 4 0 100 8 4 4 0 000-8z';
  return `<svg viewBox="0 0 100 110" aria-hidden="true">
    <defs>
      <linearGradient id="${gid}" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stop-color="${metal[0]}"/><stop offset=".45" stop-color="${metal[1]}"/><stop offset="1" stop-color="${metal[2]}"/>
      </linearGradient>
      <linearGradient id="${eid}" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="${enamel[0]}"/><stop offset="1" stop-color="${enamel[1]}"/>
      </linearGradient>
    </defs>
    <ellipse cx="50" cy="102" rx="22" ry="5" fill="#000" opacity=".35"/>
    <path d="${shape}" fill="#14110c" stroke="url(#${gid})" stroke-width="8"/>
    <path d="${shape}" fill="url(#${eid})" stroke="url(#${gid})" stroke-width="2.6"/>
    <path d="${shape}" fill="none" stroke="#fff1c4" stroke-opacity=".28" stroke-width="1.1" transform="scale(.74) translate(17.5 16)"/>
    <circle cx="50" cy="48" r="16" fill="#0b0a0e" opacity=".35"/>
    <g fill="none" stroke="url(#${gid})" stroke-width="2.15" stroke-linejoin="round" stroke-linecap="round" transform="translate(27 31) scale(1.9)">
      <path d="${emblem}"/>
    </g>
    <path d="M37 7l13-6 13 6-4 7H41z" fill="url(#${gid})" stroke="#2a1d10" stroke-width=".8"/>
  </svg>`;
}

/**
 * 地图屏自有样式段（窗口 Q）。
 *
 * 为什么在 TS 里而不是 `shell/styles/*.css`：阶段 B 的文件所有权矩阵把
 * `src/meta/shell/styles/**` 判给窗口 L 独占，其它窗口只能在自己的屏 CSS 段里写。
 * L 的 `tokens.css`（`--ds-*`）交付后，本段的字面色值整体迁移到 token（见任务书批次 2 待办）。
 */
const MAP_CSS = `
  /* M-2：锁态节点——门槛明文是主角，王国名退为第二行；不出现裸数字 */
  .kmeta.locked {
    flex-direction: column;
    align-items: stretch;
    background: rgba(20, 16, 10, .92);
    border-color: rgba(216, 194, 144, .34);
  }
  .kgate {
    display: inline-flex; align-items: center; justify-content: center; gap: 4px;
    padding: 3px 8px 4px;
    background: linear-gradient(180deg, #5a4c32, #2a2214);
    font: 11px "Microsoft YaHei UI", "Microsoft YaHei", sans-serif;
    color: #ead6a4;
    text-shadow: 0 1px 2px #000;
    white-space: nowrap;
  }
  .kgate [data-icon] { width: 12px; height: 12px; color: #ead6a4; }
  .kname.sub {
    padding: 2px 8px 3px;
    font-size: 11px;
    color: #a99f8c;
    border-top: 1px solid rgba(216, 194, 144, .18);
  }
  /* 可收进贡：无底衬，落在盾尖上轻轻浮动。纹章图下方有一段透明边，数字要盖住尖端而不是掉进空隙。 */
  .ktrib {
    position: absolute;
    left: 0;
    right: 0;
    bottom: 8px;
    width: fit-content;
    margin-inline: auto;
    display: inline-flex; align-items: center; gap: 4px;
    padding: 0;
    background: none;
    border: 0;
    border-radius: 0;
    box-shadow: none;
    font: 700 26px Georgia, "Times New Roman", serif;
    letter-spacing: .2px;
    line-height: 1;
    color: #ffe7a4;
    text-shadow:
      0 1px 0 #140e06,
      1px 0 0 #140e06,
      -1px 0 0 #140e06,
      0 -1px 0 #140e06;
    pointer-events: none;
    z-index: 4;
    white-space: nowrap;
    animation: ktrib-bob 2.4s ease-in-out infinite;
  }
  .ktrib [data-icon] { width: 22px; height: 22px; color: #ffe7a4; filter: drop-shadow(0 1px 0 #140e06); }
  .ktrib.over {
    color: #ffc8bc;
    animation-duration: 1.6s;
  }
  .ktrib.over [data-icon] { color: #ffc8bc; }
  @keyframes ktrib-bob {
    0%, 100% { transform: translateY(1px); }
    50% { transform: translateY(-5px); }
  }
  /* 满溢时底栏按钮转红，文案只说「已满」，不再报国数 */
  .chip.over { border-color: #c45454; color: #ffd9d2; background: linear-gradient(180deg, rgba(90, 36, 32, .96), rgba(28, 12, 12, .96)); }
  .tribute-row.over #tributeCopy { color: #ffd0c8; }

  /* M-11：左右 rail 基线对齐。原 translateY(-58%) 对不同条目数给出不同基线（实测错开 58px） */
  .map-shell .rail { top: 96px; transform: none; }
  /* 锁态小锁原先压在副题文字上（入侵/战役/馈赠三处），挪到菱形右上角 */
  .map-shell .rail .rail-lock { right: -6px; bottom: auto; top: -6px; }
  /* E-9：角标落在菱形外沿，不盖住活动图标；副题负责解释这个数字。 */
  .map-shell .rail .rail-event-badge {
    position: absolute;
    top: -9px;
    right: -24px;
    min-width: 25px;
    height: 22px;
    padding: 0 6px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    transform: rotate(-45deg);
    border: 1px solid #f2d48d;
    border-radius: 999px;
    background: linear-gradient(180deg, #8d5b20, #4b2d0d);
    color: #fff3c7;
    font: 700 11px var(--body);
    line-height: 1;
    text-shadow: 0 1px 2px #000;
    box-shadow: 0 2px 8px #000b, inset 0 1px rgba(255,255,255,.2);
    pointer-events: none;
  }
  .map-shell .rail .rail-event-badge[hidden] { display: none; }
  .map-shell #railEvents.has-actions .facet {
    border-color: #e9c470;
    box-shadow: 0 0 0 1px #0b0b13, 0 0 15px rgba(233,196,112,.3), inset 0 1px rgba(240,218,183,.45);
  }
  .map-shell #railEvents.has-actions .rail-copy small { color: #e1c47e; }

  /* M-5：标签防重叠——逐节点纵向让位，由 layoutLabels() 写入 --label-dy */
  .knode .kmeta { transform: translateY(var(--label-dy, 0px)) scale(var(--label-s, 1)); }

  /* M-6：王国检索抽屉（42 国此前没有任何检索手段，只能盲拖 5440×2920 的图） */
  .map-tools {
    position: absolute;
    right: 18px; bottom: 18px;
    display: flex; flex-direction: column; gap: 8px;
    z-index: 7;
  }
  .kingdom-list-veil { justify-content: flex-start; }
  .kingdom-drawer {
    position: relative;
    width: 420px;
    height: 100%;
    display: flex; flex-direction: column;
    background: linear-gradient(160deg, #1b1722, #0e0d14 62%);
    border-right: 1px solid rgba(216, 194, 144, .42);
    box-shadow: 24px 0 80px #000c;
    padding: 18px 16px 16px;
    gap: 10px;
  }
  .kingdom-drawer header { display: flex; align-items: baseline; justify-content: space-between; }
  .kingdom-drawer header h2 { font: 22px var(--display); letter-spacing: 4px; color: #f4e2b4; }
  .kingdom-drawer input {
    width: 100%;
    padding: 9px 12px;
    background: rgba(8, 8, 14, .8);
    border: 1px solid #67563e;
    border-radius: 4px;
    color: #f2ead8;
    font: 13px var(--body);
  }
  .kingdom-drawer input:focus { outline: none; border-color: #e1c891; box-shadow: 0 0 0 2px #e8cc8644; }
  .kl-sorts { display: flex; gap: 6px; }
  .kl-sorts button {
    flex: 1;
    padding: 6px 4px;
    background: linear-gradient(180deg, #221d2b, #14121b);
    border: 1px solid #67563e;
    border-radius: 4px;
    color: #c4b6a3;
    font: 11px var(--body);
  }
  .kl-sorts button.on { border-color: #e1c891; color: #ffeebb; background: linear-gradient(180deg, #2e2636, #1a1724); }
  .kl-rows { flex: 1; min-height: 0; overflow-y: auto; display: flex; flex-direction: column; gap: 6px; padding-right: 4px; }
  .kl-row {
    display: grid;
    grid-template-columns: 30px 1fr auto;
    align-items: center;
    gap: 10px;
    padding: 8px 10px;
    background: linear-gradient(#20202c, #16161f);
    border: 1px solid rgba(186, 164, 139, .18);
    border-radius: 6px;
    text-align: left;
    color: #f2ead8;
    box-shadow: 0 3px 9px rgba(0, 0, 0, .28);
  }
  .kl-row:hover { border-color: #a1895c; transform: translateY(-1px); }
  .kl-row.locked { color: #9a917f; }
  .kl-row .kl-crest { width: 26px; height: 30px; display: block; overflow: hidden; }
  .kl-row .kl-crest img, .kl-row .kl-crest svg { width: 100%; height: 100%; object-fit: contain; display: block; }
  .kl-row.locked .kl-crest { filter: grayscale(1) brightness(.6); }
  .kl-row b { display: block; font: 600 13px var(--body); }
  .kl-row small { display: block; font-size: 11px; color: #91887a; }
  .kl-row .kl-tag {
    padding: 2px 7px 3px;
    border: 1px solid #67563e;
    border-radius: 999px;
    font: 11px var(--body);
    color: #c4b6a3;
    white-space: nowrap;
  }
  .kl-row .kl-tag.gold { border-color: #e1c891; color: #ffeebb; }
  .kl-row .kl-tag.over { border-color: #c45454; color: #ffd9d2; }
  .kl-empty { padding: 18px 8px; color: #91887a; font: 12px var(--body); text-align: center; }

  /* M-9：一键收贡的二次确认（改前无确认地一次性收全服，包括刚攒 1 小时、结了就亏的） */
  .tribute-sheet {
    width: 520px;
    max-height: 78%;
    display: flex; flex-direction: column; gap: 12px;
    padding: 20px;
    background: linear-gradient(160deg, #24222f, #14131d 55%);
    border: 1px solid rgba(216, 194, 144, .42);
    border-radius: 10px;
    box-shadow: 0 24px 80px #000c, inset 0 1px #f0dab718;
  }
  .tribute-sheet h2 { font: 22px var(--display); letter-spacing: 4px; color: #f4e2b4; }
  .kingdom-info > h2, .tip-veil .money-tip h2 { margin-top: 0; }
  .tribute-sheet .tb-rows { flex: 1; min-height: 0; overflow-y: auto; display: flex; flex-direction: column; gap: 6px; }
  .tb-row {
    display: grid; grid-template-columns: 1fr auto; gap: 8px;
    align-items: center;
    padding: 8px 10px;
    background: linear-gradient(#20202c, #16161f);
    border: 1px solid rgba(186, 164, 139, .18);
    border-radius: 6px;
    font: 12px var(--body);
    color: #f2ead8;
  }
  .tb-row.warn { border-color: #8a6a3a; }
  .tb-row small { display: block; color: #91887a; font-size: 11px; }
  .tb-row.warn small { color: #e0b46a; }
  .tribute-sheet .tb-total { font: 13px var(--body); color: #c4b6a3; }
  .tribute-sheet .tb-acts { display: flex; gap: 10px; justify-content: flex-end; align-items: stretch; }
  .tribute-sheet .tb-acts .cancel { flex: 0 0 auto; width: auto; padding: 0 20px; white-space: nowrap; }
  .tribute-sheet .tb-acts .primary { flex: 0 1 300px; }

  /* K-1/K-6：战斗是唯一主行动；进贡是顺手拿，升级退到长线养成。 */
  .kingdom-info { padding: 28px 38px 24px 34px; }
  .kingdom-open-body { min-height: 0; display: flex; flex: 1; flex-direction: column; }
  .kingdom-open-body .kv-grid {
    gap: 8px;
    margin: 12px 0 14px;
    padding: 0;
    border: 0;
  }
  .kstat {
    display: flex;
    align-items: center;
    gap: 10px;
    min-height: 64px;
    padding: 8px 10px;
    border: 1px solid rgba(198, 168, 112, .32);
    border-radius: 10px;
    background: linear-gradient(180deg, rgba(42, 36, 52, .95), rgba(16, 14, 22, .95));
    box-shadow: inset 0 1px rgba(240, 218, 183, .12);
  }
  .kstat-mark {
    width: 36px; height: 36px; flex: none;
    display: grid; place-items: center;
    border-radius: 9px;
    background: rgba(8, 7, 12, .55);
    border: 1px solid rgba(216, 194, 144, .4);
    color: #f0d98c;
  }
  .kstat-mark svg, .kstat-mark .gic { width: 20px; height: 20px; }
  .kstat small { display: block; margin: 0 0 2px; color: #9a9084; font-size: 11px; }
  .kstat b {
    display: flex; align-items: baseline; flex-wrap: wrap; gap: 6px;
    font: 600 15px "Microsoft YaHei UI", "Microsoft YaHei", sans-serif;
    color: #f6edd8;
  }
  .kstat b em { font-style: normal; font-size: 20px; color: #fff6df; letter-spacing: 0; }
  .kstat b i { font-style: normal; font-size: 12px; color: #9a9084; }
  .loot {
    display: inline-flex; align-items: center; gap: 3px;
    font: 700 16px Georgia, "Times New Roman", serif;
    color: #ffe7a8;
  }
  .loot svg, .loot .gic { width: 15px; height: 15px; }
  .loot.soul { color: #ddc8ff; }
  .loot.key { color: #f3d48a; }
  .kingdom-combat { display: flex; flex-direction: column; gap: 8px; }
  .kingdom-section-kicker { display: flex; align-items: baseline; justify-content: space-between; gap: 12px; }
  .kingdom-section-kicker b { color: #d4c19e; font: 16px var(--display); letter-spacing: 2px; }
  .kingdom-section-kicker small { color: #8e8493; font-size: 10px; }
  .kingdom-main-entry {
    min-height: 68px;
    display: grid;
    grid-template-columns: 38px minmax(0, 1fr) auto;
    align-items: center;
    gap: 12px;
    padding: 10px 14px;
    border-radius: 10px;
    border-color: #c6ad73;
    background: linear-gradient(105deg, #355c43, #223c2d 58%, #18271f);
    box-shadow: inset 0 0 0 2px rgba(20, 38, 28, .5), inset 0 1px rgba(228, 242, 213, .2), 0 5px 14px rgba(0, 0, 0, .35);
    text-align: left;
  }
  .kingdom-main-entry:hover:not(.locked) { border-color: #f0d99c; transform: translateY(-1px); }
  .kingdom-main-entry > [data-icon] { width: 30px; height: 30px; margin: 0; color: #f2dc9e; }
  .kingdom-main-entry .kingdom-action-copy { min-width: 0; }
  .kingdom-main-entry .kingdom-action-copy b { margin: 0 0 4px; color: #fff0c7; font-size: 18px; letter-spacing: 1px; }
  .kingdom-main-entry .kingdom-action-copy small { display: block; overflow: hidden; color: #c5d6c3; font-size: 11px; text-overflow: ellipsis; white-space: nowrap; }
  .kingdom-main-entry .kingdom-action-go { display: inline-flex; align-items: center; gap: 5px; color: #ffe6a6; font: 14px var(--display); white-space: nowrap; }
  .kingdom-main-entry .kingdom-action-go [data-icon] { width: 15px; height: 15px; transform: rotate(180deg); }
  .kingdom-combat .entry-cards { grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px; margin-top: 0; }
  .kingdom-combat .entry {
    min-height: 64px;
    display: grid;
    grid-template-columns: 40px minmax(0, 1fr);
    align-items: center;
    gap: 10px;
    padding: 8px 12px;
    border-radius: 10px;
  }
  .kingdom-combat .entry > [data-icon] {
    grid-row: 1 / span 2;
    width: 36px; height: 36px; margin: 0;
    display: grid; place-items: center;
    border-radius: 9px;
    background: rgba(8, 7, 12, .45);
    border: 1px solid rgba(216, 194, 144, .32);
    color: #f0d98c;
  }
  .kingdom-combat .entry > [data-icon] svg,
  .kingdom-combat .entry > [data-icon] .gic { width: 18px; height: 18px; }
  .kingdom-combat .entry b { margin: 0 0 2px; font-size: 15px; letter-spacing: 1px; }
  .kingdom-combat .entry small { overflow: hidden; font-size: 12px; text-overflow: ellipsis; white-space: nowrap; }
  .kingdom-combat .kingdom-main-entry { grid-template-columns: 38px minmax(0, 1fr) auto; }
  .kingdom-combat .kingdom-main-entry > [data-icon] {
    grid-row: auto;
    width: 30px; height: 30px;
    background: none;
    border: 0;
    color: #f2dc9e;
  }
  .kingdom-combat .kingdom-main-entry > [data-icon] svg,
  .kingdom-combat .kingdom-main-entry > [data-icon] .gic { width: 30px; height: 30px; }
  .kingdom-open-body .tribute-row {
    align-items: center;
    gap: 12px;
    min-height: 0;
    margin: 12px 0 10px;
    padding: 0;
    border: 0;
  }
  .tribute-meter { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 7px; }
  .tribute-meter-head {
    display: flex; align-items: center; gap: 6px;
    color: #f0e2c4;
    font: 600 14px "Microsoft YaHei UI", "Microsoft YaHei", sans-serif;
  }
  .tribute-meter-head [data-icon] { width: 16px; height: 16px; color: #e1c891; }
  .tribute-meter-head [data-icon] svg, .tribute-meter-head .gic { width: 16px; height: 16px; }
  .tribute-track {
    height: 8px; border-radius: 999px;
    background: #100e16;
    border: 1px solid #5a4c3e;
    overflow: hidden;
  }
  .tribute-track > i {
    display: block; height: 100%; width: 0;
    border-radius: inherit;
    background: linear-gradient(90deg, #8a6730, #f0d98c);
    box-shadow: 0 0 8px rgba(240, 217, 140, .35);
  }
  .tribute-row.over .tribute-track > i { background: linear-gradient(90deg, #8a3030, #e07070); box-shadow: 0 0 8px rgba(224, 112, 112, .4); }
  .tribute-btn {
    flex: 0 0 auto;
    min-width: 108px;
    height: 44px;
    padding: 0 16px;
    display: inline-flex; align-items: center; justify-content: center; gap: 8px;
    border-radius: 10px;
    border: 1px solid #f0d7a0;
    background: linear-gradient(180deg, #c9a15a, #7a5420 46%, #4a3010);
    color: #fff8e8;
    font: 600 16px "Microsoft YaHei UI", "Microsoft YaHei", sans-serif;
    letter-spacing: 2px;
    box-shadow: inset 0 1px rgba(255, 236, 190, .5), 0 4px 10px #0006;
  }
  .tribute-btn [data-icon] { width: 18px; height: 18px; color: #fff1c4; }
  .tribute-btn:hover:not(:disabled) { filter: brightness(1.08); }
  .tribute-btn:disabled { opacity: .4; filter: grayscale(.35); cursor: default; }
  .kingdom-open-body .upgrade-block { margin-top: auto; }
  .kingdom-open-body .upgrade-block .growth-track { height: 8px; border-radius: 999px; overflow: hidden; margin: 8px 0 10px; }
  .kingdom-open-body .upgrade-block .growth-track > i { border-radius: inherit; }
  .kingdom-upgrade {
    width: 100%;
    height: 46px;
    border-radius: 10px;
    font-size: 15px;
    letter-spacing: 2px;
  }
  .kingdom-upgrade .price {
    display: inline-flex; align-items: center; gap: 4px;
    margin-left: 12px; padding: 3px 10px;
    border: 0; border-radius: 999px;
    background: rgba(0, 0, 0, .28);
    font: 700 14px Georgia, "Times New Roman", serif;
  }

  /* K-3：锁定王国不再展示一屏破折号，改成只回答门槛与解锁收益。 */
  .kingdom-lock-panel { flex: 1; display: flex; flex-direction: column; justify-content: center; gap: 18px; }
  .kingdom-lock-level { display: flex; align-items: center; gap: 14px; padding: 16px; border: 1px solid #725f43; background: linear-gradient(120deg, #211d25, #15131b); }
  .kingdom-lock-level > [data-icon] { width: 34px; height: 34px; color: #d8c290; }
  .kingdom-lock-level small { display: block; margin-bottom: 5px; color: #91887a; }
  .kingdom-lock-level b { color: #f4e2b4; font: 22px var(--display); }
  .kingdom-lock-level span { display: block; margin-top: 5px; color: #b7ab9c; font-size: 12px; }
  .kingdom-lock-benefits { display: grid; gap: 8px; padding: 0; margin: 0; list-style: none; }
  .kingdom-lock-benefits li { display: flex; align-items: center; gap: 10px; color: #cfc3b0; font-size: 13px; }
  .kingdom-lock-benefits li:before { content: ""; width: 7px; height: 7px; flex: none; transform: rotate(45deg); border: 1px solid #c3a66f; background: #6c5732; }
  .kingdom-lock-panel .primary { margin-top: 4px; }

  /* 地图在窄桌面、平板和手机上使用真实像素布局，不再把 1600px 舞台整体缩成缩略图。 */
  @media (max-width: 1399px) {
    .stage.map-responsive { width: 100vw; height: 100dvh; transform: none !important; }
    .stage.map-responsive .topbar { height: 66px; padding: 0 12px; gap: 6px; }
    .stage.map-responsive .player { flex: 1; min-width: 0; width: auto; gap: 8px; }
    .stage.map-responsive .player > img { width: 38px; height: 38px; }
    .stage.map-responsive .player strong { overflow: hidden; margin: 0; font-size: 14px; text-overflow: ellipsis; white-space: nowrap; }
    .stage.map-responsive .player span { font-size: 9px; }
    .stage.map-responsive .player span i { margin-left: 5px; }
    .stage.map-responsive .player .xp { width: 90px; margin-top: 4px; }
    .stage.map-responsive .top-title { display: none; }
    .stage.map-responsive .wallet { flex: none; gap: 3px; }
    .stage.map-responsive .money { gap: 3px; padding: 0; }
    .stage.map-responsive .money:not([data-currency="gold"]) { display: none; }
    .stage.map-responsive .money > [data-icon] { width: 19px; height: 19px; }
    .stage.map-responsive .money small { font-size: 9px; margin-bottom: 1px; }
    .stage.map-responsive .money b { font-size: 12px; }
    .stage.map-responsive .orb { width: 29px; height: 29px; margin-left: 2px; }
    .stage.map-responsive .orb [data-icon] { width: 16px; height: 16px; }
    .stage.map-responsive .bottom-bar { height: 58px; padding: 0 6px; }
    .stage.map-responsive .world-mark,
    .stage.map-responsive .bottom-hint { display: none; }
    .stage.map-responsive .bottom-bar nav { position: static; width: 100%; transform: none; gap: 0; }
    .stage.map-responsive .bottom-bar nav button { flex: 1; min-width: 0; width: auto; flex-direction: column; gap: 1px; font-size: 10px; letter-spacing: 0; }
    .stage.map-responsive .bottom-bar nav button > [data-icon] { width: 20px; height: 20px; }

    .stage.map-responsive .map-shell { inset: 66px 0 58px; }
    .stage.map-responsive .map-frame { left: 10px; right: 10px; top: 76px; bottom: 58px; }
    .stage.map-responsive .map-shell .rail {
      top: 5px;
      bottom: auto;
      width: calc(50% - 8px);
      height: 64px;
      flex-direction: row;
      align-items: center;
      justify-content: space-around;
      gap: 2px;
    }
    .stage.map-responsive .map-shell .rail.left { left: 6px; right: auto; }
    .stage.map-responsive .map-shell .rail.right { left: auto; right: 6px; }
    .stage.map-responsive .rail button { flex: 1 1 0; width: auto; min-width: 0; gap: 3px; }
    .stage.map-responsive .rail .facet { width: 34px; height: 34px; }
    .stage.map-responsive .rail .facet > [data-icon]:not(.rail-lock) { width: 19px; height: 19px; }
    .stage.map-responsive .rail .rail-copy { min-width: 0; }
    .stage.map-responsive .rail .rail-copy b { max-width: 100%; overflow: hidden; font-size: 10px; text-overflow: ellipsis; white-space: nowrap; }
    .stage.map-responsive .rail .rail-copy small { display: none; }
    .stage.map-responsive .map-shell .rail .rail-lock { right: -7px; top: -7px; width: 14px !important; height: 14px !important; }
    .stage.map-responsive .map-shell .rail .rail-event-badge { top: -9px; right: -18px; min-width: 20px; height: 18px; padding: 0 5px; font-size: 9px; }
    .stage.map-responsive .compass { left: 9px; bottom: 8px; width: 55px; height: 55px; }
    .stage.map-responsive .map-tools { right: 9px; bottom: 9px; }
    .stage.map-responsive .map-tools .chip { min-height: 36px; padding: 6px 10px; font-size: 11px; }
    .stage.map-responsive .daily { left: 8px; right: 8px; bottom: 7px; transform: none; gap: 5px; }
    .stage.map-responsive .daily .chip { flex: 1 1 0; min-width: 0; min-height: 42px; justify-content: center; padding: 5px 7px; font-size: 10px; line-height: 1.25; }
    .stage.map-responsive .daily .chip > span:last-child { overflow: hidden; display: -webkit-box; -webkit-box-orient: vertical; -webkit-line-clamp: 2; }
    .stage.map-responsive .toast { bottom: 70px; max-width: calc(100% - 24px); padding: 10px 14px; text-align: center; }

    .stage.map-responsive .kingdom-sheet { width: min(1040px, calc(100vw - 32px)); height: min(700px, calc(100dvh - 32px)); grid-template-columns: minmax(280px, 38%) minmax(0, 1fr); }
    .stage.map-responsive .kingdom-info { overflow-y: auto; padding: 28px 34px 24px 28px; }
    .stage.map-responsive .kingdom-info h2 { font-size: 29px; }
    .stage.map-responsive .kv-grid { margin: 16px 0; }
    .stage.map-responsive .entry-cards { margin-top: 16px; }
    .stage.map-responsive .kingdom-drawer { width: min(420px, 100vw); }
    .stage.map-responsive .tribute-sheet,
    .stage.map-responsive .money-tip { width: min(520px, calc(100vw - 24px)); }
  }

  @media (max-width: 699px) {
    .stage.map-responsive .topbar { height: 59px; padding: 0 10px; }
    .stage.map-responsive .player > img { width: 34px; height: 34px; }
    .stage.map-responsive .player strong { font-size: 13px; }
    .stage.map-responsive .player span i,
    .stage.map-responsive .player .xp { display: none; }
    .stage.map-responsive .money small { display: none; }
    .stage.map-responsive .money b { font-size: 11px; }
    .stage.map-responsive .orb { width: 30px; height: 30px; margin-left: 4px; }
    .stage.map-responsive .bottom-bar { height: 57px; padding: 0 4px; }
    .stage.map-responsive .map-shell { inset: 59px 0 57px; }
    .stage.map-responsive .map-shell .rail { width: calc(50% - 5px); height: 59px; top: 3px; }
    .stage.map-responsive .map-shell .rail.left { left: 3px; }
    .stage.map-responsive .map-shell .rail.right { right: 3px; }
    .stage.map-responsive .rail button.is-lock { display: none; }
    .stage.map-responsive .rail .facet { width: 32px; height: 32px; }
    .stage.map-responsive .rail .rail-copy b { font-size: 9px; }
    .stage.map-responsive .map-frame { left: 5px; right: 5px; top: 66px; bottom: 61px; border-radius: 6px; }
    .stage.map-responsive .map-frame:after { inset: 4px; }
    .stage.map-responsive .daily { left: 5px; right: 5px; bottom: 6px; gap: 3px; }
    .stage.map-responsive .daily .chip { min-height: 47px; padding: 4px; font-size: 9px; }
    .stage.map-responsive .daily .chip [data-icon] { display: none; }
    .stage.map-responsive .compass { width: 48px; height: 48px; }
    .stage.map-responsive .map-tools .chip { min-height: 34px; padding: 5px 8px; }
    .stage.map-responsive .map-tools .chip [data-icon] { width: 13px; height: 13px; }

    .stage.map-responsive .modal-veil { align-items: end; padding: 0; }
    .stage.map-responsive .kingdom-sheet {
      width: 100%;
      height: min(760px, calc(100dvh - 10px));
      display: flex;
      flex-direction: column;
      overflow-y: auto;
      border-width: 1px 0 0;
    }
    .stage.map-responsive .kingdom-art { flex: 0 0 218px; border-right: 0; border-bottom: 1px solid #7a6540; }
    .stage.map-responsive .kingdom-art img { object-position: 50% 28%; }
    .stage.map-responsive .kingdom-art .art-caption { display: none; }
    .stage.map-responsive .kingdom-info { flex: none; overflow: visible; padding: 17px 15px 20px; }
    .stage.map-responsive .kingdom-info h2 { margin: 0 0 8px; font-size: 24px; letter-spacing: 2px; }
    .stage.map-responsive .kingdom-blurb { min-height: 0; font-size: 11px; line-height: 1.55; }
    .stage.map-responsive .kv-grid { gap: 6px; margin: 12px 0; padding: 0; }
    .stage.map-responsive .kstat { flex-direction: column; align-items: flex-start; gap: 4px; min-height: 0; padding: 8px 8px; }
    .stage.map-responsive .kstat-mark { width: 26px; height: 26px; }
    .stage.map-responsive .kstat-mark svg, .stage.map-responsive .kstat-mark .gic { width: 15px; height: 15px; }
    .stage.map-responsive .kstat small { font-size: 10px; }
    .stage.map-responsive .kstat b { font-size: 13px; }
    .stage.map-responsive .kstat b em { font-size: 16px; }
    .stage.map-responsive .loot { font-size: 13px; }
    .stage.map-responsive .section-line { align-items: flex-start; gap: 8px; }
    .stage.map-responsive .section-line h3 { flex: none; font-size: 15px; }
    .stage.map-responsive .section-line span { text-align: right; }
    .stage.map-responsive .primary { height: 46px; font-size: 15px; }
    .stage.map-responsive .tribute-row { align-items: stretch; flex-direction: column; margin: 14px 0 12px; }
    .stage.map-responsive .tribute-btn { width: 100%; min-height: 44px; }
    .stage.map-responsive .kingdom-section-kicker small { display: none; }
    .stage.map-responsive .kingdom-main-entry { grid-template-columns: 34px minmax(0, 1fr); min-height: 72px; padding: 9px 10px; }
    .stage.map-responsive .kingdom-main-entry .kingdom-action-go { grid-column: 2; font-size: 11px; }
    .stage.map-responsive .kingdom-main-entry .kingdom-action-copy b { font-size: 15px; }
    .stage.map-responsive .kingdom-main-entry .kingdom-action-copy small { font-size: 9px; }
    .stage.map-responsive .entry-cards { gap: 6px; margin-top: 0; }
    .stage.map-responsive .entry { min-width: 0; padding: 10px 7px; text-align: center; }
    .stage.map-responsive .kingdom-combat .entry { display: flex; min-height: 70px; flex-direction: column; gap: 4px; }
    .stage.map-responsive .entry [data-icon] { margin: 0 auto 2px; }
    .stage.map-responsive .entry b { font-size: 12px; letter-spacing: 0; }
    .stage.map-responsive .entry small { display: block; overflow: hidden; font-size: 9px; text-overflow: ellipsis; white-space: nowrap; }
    .stage.map-responsive .kingdom-combat .entry > [data-icon] { width: 28px; height: 28px; }
    .stage.map-responsive .kingdom-combat .entry > [data-icon] svg,
    .stage.map-responsive .kingdom-combat .entry > [data-icon] .gic { width: 16px; height: 16px; }
    .stage.map-responsive .kingdom-open-body .upgrade-block { margin-top: 3px; }
    .stage.map-responsive .kingdom-lock-panel { min-height: 360px; justify-content: flex-start; padding-top: 10px; }
    .stage.map-responsive .kingdom-lock-level { padding: 13px; }
    .stage.map-responsive .kingdom-lock-level b { font-size: 19px; }
    .stage.map-responsive .sheet-close { width: 36px; height: 36px; }
    .stage.map-responsive .kingdom-list-veil { align-items: stretch; }
    .stage.map-responsive .kingdom-drawer { width: 100%; height: 100%; padding: 14px 12px 12px; border-right: 0; }
    .stage.map-responsive .tribute-sheet,
    .stage.map-responsive .money-tip { max-height: calc(100dvh - 12px); overflow-y: auto; padding: 20px 16px 16px; border-width: 1px 0 0; }
    .stage.map-responsive .tribute-sheet .tb-acts { display: grid; grid-template-columns: 1fr 2fr; }
    .stage.map-responsive .tribute-sheet .tb-acts .cancel,
    .stage.map-responsive .tribute-sheet .tb-acts .primary { width: 100%; min-width: 0; margin: 0; padding-inline: 8px; }
  }
`;

export class MapScreen implements Screen {
  private nodes: NodeVm[] = [];
  private selected = START_KINGDOM;
  private openName: string | null = null;
  private heroLevel = 1;
  private cam = { x: 0, y: 0, s: HOME_SCALE };
  private drag = { on: false, moved: false, id: null as string | null, lx: 0, ly: 0, vx: 0, vy: 0, t: 0, inertia: 0 };
  /** 王国抽屉（M-6）的排序与搜索词 */
  private listSort: 'progress' | 'tribute' | 'name' = 'progress';
  private listQuery = '';
  private labelJob = 0;
  private listeners: Array<[EventTarget, string, EventListenerOrEventListenerObject, AddEventListenerOptions?]> = [];

  html(ctx: ShellCtx): string {
    return `
      <style id="mapScreenCss">${MAP_CSS}</style>
      ${topbarHtml()}
      <div class="map-shell">
        <aside class="rail left" aria-label="玩法入口">
          <button type="button" class="on" data-rail="王国任务" id="railQuest">
            <span class="facet"><span data-icon="flag"></span></span>
            <span class="rail-copy"><b>王国任务</b><small id="railQuestCopy">章节战斗</small></span>
          </button>
          <button type="button" class="is-lock" data-rail="战役" id="railCampaign" data-locked="1">
            <span class="facet"><span data-icon="book"></span><i class="rail-lock" data-icon="lock"></i></span>
            <span class="rail-copy"><b>战役</b><small>敬请期待</small></span>
          </button>
          <button type="button" data-rail="活动中心" id="railEvents">
            <span class="facet"><span data-icon="time"></span><span class="rail-event-badge" id="railEventsBadge" hidden><b id="railEventsBadgeCount">0</b></span></span>
            <span class="rail-copy"><b>活动中心</b><small id="railEventsCopy">限时活动</small></span>
          </button>
          <button type="button" class="is-lock" data-rail="入侵" id="railInvasion" data-locked="1">
            <span class="facet"><span data-icon="skull"></span><i class="rail-lock" data-icon="lock"></i></span>
            <span class="rail-copy"><b>入侵</b><small id="railInvasionCopy">未解锁</small></span>
          </button>
        </aside>
        <div class="map-frame">
          <div class="map-viewport" id="mapViewport">
            <div class="map-world" id="mapWorld">
              <img class="map-art" src="/meta/assets/world-map-mosaic-v2.webp" alt="克里斯塔拉大陆奇幻世界地图" draggable="false">
              <div class="map-nodes" id="nodes"></div>
            </div>
            <div class="map-vignette" aria-hidden="true"></div>
          </div>
          <div class="map-tools">
            <button class="chip" id="kingdomListBtn" type="button"><span data-icon="book"></span><span>王国列表 · 42</span></button>
          </div>
          <button class="compass" id="compass" type="button" aria-label="重置视野">
            <svg viewBox="0 0 88 88" aria-hidden="true">
              <circle cx="44" cy="44" r="40" class="c-ring"/>
              <circle cx="44" cy="44" r="33" class="c-inner"/>
              <path class="c-tick" d="M44 8v8M44 72v8M8 44h8M72 44h8"/>
              <path class="c-needle-n" d="M44 16 L50 44 L44 40 L38 44 Z"/>
              <path class="c-needle-s" d="M44 72 L38 44 L44 48 L50 44 Z"/>
              <text x="44" y="22">N</text>
            </svg>
          </button>
        </div>
        <aside class="rail right" aria-label="养成入口">
          <button type="button" data-rail="武器库" id="railVault">
            <span class="facet"><span data-icon="swords"></span></span>
            <span class="rail-copy"><b>武器库</b><small id="railVaultCopy">更换装备</small></span>
          </button>
          <button type="button" data-rail="神殿" id="railTemple">
            <span class="facet"><span data-icon="temple"></span></span>
            <span class="rail-copy"><b>神殿</b><small id="railTempleCopy">职业进阶</small></span>
          </button>
          <button type="button" class="is-lock" data-rail="馈赠" id="railGifts" data-locked="1">
            <span class="facet"><span data-icon="chest"></span><i class="rail-lock" data-icon="lock"></i></span>
            <span class="rail-copy"><b>馈赠</b><small>敬请期待</small></span>
          </button>
        </aside>
        <div class="daily" id="daily">
          <button class="chip" id="dailyWin" type="button"><span data-icon="swords"></span><span id="dailyWinCopy">每日首胜</span></button>
          <button class="chip gold" id="dailyTribute" type="button"><span data-icon="bag"></span><span id="dailyTributeCopy">进贡</span></button>
          <button class="chip" id="dailyArena" type="button"><span data-icon="ticket"></span><span id="dailyArenaCopy">竞技场</span></button>
          <button class="chip" id="dailyHunt" type="button"><span data-icon="compass"></span><span id="dailyHuntCopy">寻宝</span></button>
        </div>
      </div>
      ${bottomNavHtml('地图', `Lv.${ctx.save().hero.level} · 42 王国`)}
      ${toastHtml()}

      <div class="modal-veil" id="kingdomVeil" hidden>
        <section class="kingdom-sheet" id="kingdomSheet" role="dialog" aria-modal="true" aria-labelledby="kingdomName">
          <button class="sheet-close" id="kingdomClose" type="button" aria-label="关闭"><span data-icon="close"></span></button>
          <div class="kingdom-art" id="kingdomArt">
            <img id="kingdomPortrait" alt="">
            <div class="art-shade"></div>
            <div class="art-frame" aria-hidden="true"></div>
            <div class="art-caption"><small id="kingdomEn">BROKEN SPIRE</small><b id="kingdomArtName">破碎尖塔</b></div>
          </div>
          <div class="kingdom-info">
            <h2 id="kingdomName">破碎尖塔</h2>
            <p class="kingdom-blurb" id="kingdomBlurb"></p>
            <section class="kingdom-lock-panel" id="kingdomLockPanel" hidden>
              <div class="kingdom-lock-level">
                <span data-icon="lock"></span>
                <div><small>解锁门槛</small><b id="kingdomLockLevel">冒险者 Lv.1</b><span id="kingdomLockGap">当前等级不足</span></div>
              </div>
              <div class="kingdom-section-kicker"><b>解锁后可获得</b><small>完成当前可推进的主线来提升等级</small></div>
              <ul class="kingdom-lock-benefits">
                <li>主线 · HARD · VERY HARD</li>
                <li id="kingdomLockTroops">王国部队收藏</li>
                <li id="kingdomLockBonus">满级王国加成</li>
              </ul>
              <button class="primary" id="kingdomLockedCta" type="button"><span data-icon="flag"></span><span>前往当前可推进的王国</span></button>
            </section>
            <div class="kingdom-open-body" id="kingdomOpenBody">
              <div class="kv-grid">
                <div class="kstat">
                  <span class="kstat-mark" data-icon="flag"></span>
                  <div><small>等级</small><b id="kingdomLevel"><em>1</em><i>/ 10</i></b></div>
                </div>
                <div class="kstat" id="kingdomStock">
                  <span class="kstat-mark" data-icon="coin"></span>
                  <div><small>进贡</small><b id="kingdomTribute">累积中</b></div>
                </div>
                <div class="kstat">
                  <span class="kstat-mark" id="kingdomBonusIcon" data-icon="wing"></span>
                  <div><small>满级</small><b id="kingdomBonus"><em>—</em></b></div>
                </div>
              </div>
              <section class="kingdom-combat">
                <div class="kingdom-section-kicker"><b>当前行动</b></div>
                <button class="entry kingdom-main-entry" id="entryQuest" type="button">
                  <span data-icon="flag"></span>
                  <span class="kingdom-action-copy"><b id="questEntryTitle">王国任务</b><small id="questProgress">0 / 8</small></span>
                  <span class="kingdom-action-go"><span id="questEntryAction">进入主线</span><span data-icon="arrow"></span></span>
                </button>
                <div class="entry-cards">
                  <button class="entry" id="entryExplore" type="button"><span data-icon="compass"></span><span><b>HARD</b><small id="exploreState">通关后开放</small></span></button>
                  <button class="entry" id="entryTroops" type="button"><span data-icon="book"></span><span><b>王国部队</b><small id="troopProgress">0 / 8</small></span></button>
                </div>
              </section>
              <div class="tribute-row" id="tributeRow">
                <div class="tribute-meter">
                  <div class="tribute-meter-head"><span data-icon="time"></span><span id="tributeCopy">累积中</span></div>
                  <div class="tribute-track" aria-hidden="true"><i id="tributeFill"></i></div>
                </div>
                <button class="tribute-btn" id="kingdomCollect" type="button"><span data-icon="bag"></span><span id="collectLabel">收取</span></button>
              </div>
              <div class="upgrade-block" id="upgradeBlock">
                <div class="section-line"><h3>王国升级</h3><span id="upgradeHint"></span></div>
                <div class="growth-track"><i id="kingdomFill"></i></div>
                <button class="secondary kingdom-upgrade" id="kingdomUpgrade" type="button"><span data-icon="chevrons"></span><span id="upgradeLabel">投入升级</span><span class="price"><span data-icon="coin"></span><b id="upgradeCost">0</b></span></button>
              </div>
            </div>
          </div>
        </section>
      </div>

      <div class="modal-veil kingdom-list-veil" id="kingdomListVeil" hidden>
        <aside class="kingdom-drawer" role="dialog" aria-modal="true" aria-label="王国列表">
          <header>
            <div><h2>42 王国</h2></div>
            <button class="sheet-close" id="kingdomListClose" type="button" aria-label="关闭"><span data-icon="close"></span></button>
          </header>
          <input id="kingdomSearch" type="search" placeholder="搜索王国名 / 英文名…" autocomplete="off" spellcheck="false">
          <div class="kl-sorts" role="group" aria-label="排序">
            <button type="button" class="on" data-sort="progress">按推进度</button>
            <button type="button" data-sort="tribute">按进贡</button>
            <button type="button" data-sort="name">按名称</button>
          </div>
          <div class="kl-rows" id="kingdomListRows"></div>
        </aside>
      </div>

      <div class="modal-veil" id="tributeVeil" hidden>
        <section class="tribute-sheet" role="dialog" aria-modal="true" aria-labelledby="tributeSheetTitle">
          <div><h2 id="tributeSheetTitle">一键收取进贡</h2></div>
          <p class="tb-total" id="tributeNote"></p>
          <div class="tb-rows" id="tributeRows"></div>
          <p class="tb-total" id="tributeTotal"></p>
          <div class="tb-acts">
            <button class="cancel" id="tributeCancel" type="button">取消</button>
            <button class="primary" id="tributeConfirm" type="button"><span data-icon="coin"></span><span id="tributeConfirmLabel">确认收取</span></button>
          </div>
        </section>
      </div>

      <div class="modal-veil tip-veil" id="moneyVeil" hidden>
        <section class="money-tip etched" role="dialog" aria-modal="true" aria-labelledby="moneyTitle">
          <h2 id="moneyTitle">黄金</h2>
          <ul id="moneyWays"></ul>
          <button class="cancel" id="moneyClose" type="button">关闭</button>
        </section>
      </div>`;
  }

  mount(ctx: ShellCtx): void {
    // `render()` mounts the screen before the shared chrome pass. Establish native map sizing
    // first so the initial camera uses the real viewport instead of the 1600px design canvas.
    fitStage();
    const save = ctx.save();
    this.heroLevel = save.hero.level;
    this.nodes = nodeVms(ctx.gateway);
    this.renderNodes(save);
    this.refreshDaily(save, ctx);

    this.focusKingdom(this.selected, this.homeScale());

    const viewport = $('#mapViewport');
    this.on(viewport, 'pointerdown', (e) => this.onPointerDown(e as PointerEvent));
    this.on(window, 'pointermove', (e) => this.onPointerMove(e as PointerEvent));
    this.on(window, 'pointerup', (e) => this.endDrag(e as PointerEvent));
    this.on(window, 'pointercancel', (e) => this.endDrag(e as PointerEvent));
    this.on(viewport, 'wheel', (e) => this.onWheel(e as WheelEvent), { passive: false });
    this.on(viewport, 'dragstart', (e) => e.preventDefault());
    this.on($('#compass'), 'click', () => this.focusKingdom(START_KINGDOM, this.homeScale()));
    this.on($('#kingdomClose'), 'click', () => this.closeKingdom());
    this.on($('#kingdomVeil'), 'click', (e) => {
      if (e.target === $('#kingdomVeil')) this.closeKingdom();
    });
    this.on($('#kingdomUpgrade'), 'click', () => void this.upgrade(ctx));
    this.on($('#kingdomCollect'), 'click', () => void this.collect(ctx));
    this.on($('#entryQuest'), 'click', () => this.enterQuest(ctx));
    this.on($('#entryExplore'), 'click', () => this.enterExplore(ctx));
    this.on($('#entryTroops'), 'click', () => this.enterTroops(ctx));
    this.on($('#kingdomLockedCta'), 'click', () => {
      this.closeKingdom();
      this.openRailQuest(ctx);
    });
    this.on($('#dailyWin'), 'click', () => {
      const claimed = ctx.save().dailyFirstWinAt >= todayStartOf(Date.now());
      toast(claimed ? '今日首胜已领取，明天再来。' : '打赢任意一场战斗，结算时自动领取每日首胜宝石。');
    });
    // M-9：不可撤销的批量结算改走二次确认层（改前点一下就把全服收干）
    this.on($('#dailyTribute'), 'click', () => this.openTributeConfirm(ctx));
    this.on($('#tributeCancel'), 'click', () => ($('#tributeVeil').hidden = true));
    this.on($('#tributeConfirm'), 'click', () => {
      $('#tributeVeil').hidden = true;
      void this.collectAllTribute(ctx);
    });
    this.on($('#tributeVeil'), 'click', (e) => {
      if (e.target === $('#tributeVeil')) $('#tributeVeil').hidden = true;
    });
    this.bindKingdomList();
    this.on($('#dailyArena'), 'click', () => ctx.navigate('#arena'));
    this.on($('#dailyHunt'), 'click', () => ctx.navigate('#hunt'));

    this.bindRail(ctx);

    const invasionBtn = $('#railInvasion');
    if (invasionBtn) {
      const unlocked = ctx.save().hero.level >= INVASION.unlockHeroLevel;
      if (unlocked) {
        invasionBtn.classList.remove('is-lock');
        invasionBtn.removeAttribute('data-locked');
        $('#railInvasionCopy').textContent = '入侵排位';
      }
      this.on(invasionBtn, 'click', () => {
        if (ctx.save().hero.level >= INVASION.unlockHeroLevel) ctx.navigate('#invasion');
        else toast(`入侵需要主角 ${INVASION.unlockHeroLevel} 级（当前 Lv.${ctx.save().hero.level}）。`);
      });
    }

    const ways: Record<string, Array<[string, string]>> = {
      gold: [['战斗结算', '击杀与首胜'], ['王国进贡', '按小时累积，上限 12 小时'], ['分解多余卡', '不回收已投入养成']],
      soul: [['战斗结算', '按敌人稀有度 × 等级'], ['幽魂宝石', '战斗内拾取'], ['王国进贡', '与黄金一并结算']],
      gem: [['王国逐关首通', `普通 ${KINGDOM_FIRST_CLEAR_GEMS.normal} / 困难 ${KINGDOM_FIRST_CLEAR_GEMS.hard} / 非常困难 ${KINGDOM_FIRST_CLEAR_GEMS.veryHard} 宝石，每关仅一次`], ['竞技场胜场', '按最终胜场结算'], ['每日首胜', '本地日期判定'], ['每周活动', '里程碑与守土奖励']],
      key: [['进贡概率', '随王国等级提高'], ['任务奖励', '章节节点'], ['成就', '长期目标']],
    };
    const titles: Record<string, string> = { gold: '黄金', soul: '灵魂', gem: '宝石', key: '金钥匙' };
    $$('[data-currency]').forEach((btn) =>
      this.on(btn, 'click', () => {
        const kind = (btn as HTMLElement).dataset.currency!;
        if (kind === 'gem') {
          ctx.navigate('#shop/gems');
          return;
        }
        $('#moneyTitle').textContent = titles[kind]!;
        $('#moneyWays').innerHTML = (ways[kind] ?? []).map(([a, b]) => `<li><span>${a}</span><b>${b}</b></li>`).join('');
        $('#moneyVeil').hidden = false;
      }),
    );
    this.on($('#moneyClose'), 'click', () => ($('#moneyVeil').hidden = true));
    this.on($('#moneyVeil'), 'click', (e) => {
      if (e.target === $('#moneyVeil')) $('#moneyVeil').hidden = true;
    });
    this.on(window, 'keydown', (e) => {
      if ((e as KeyboardEvent).key === 'Escape') {
        this.closeKingdom();
        $('#moneyVeil').hidden = true;
        $('#kingdomListVeil').hidden = true;
        $('#tributeVeil').hidden = true;
      }
    });
    // M-12（本屏局部）：底部提示的锁图标与「Lv.12 · 42 王国」毫无关系 → 换地图图标。
    // 全局修法要改 chrome.ts:bottomNavHtml（L 独占），已在台账登记为对 L 的需求。
    const hintIcon = $('.bottom-hint [data-icon]');
    if (hintIcon) {
      hintIcon.dataset.icon = 'map';
      mountIcons($('.bottom-hint'));
    }
  }

  // —— M-6 王国检索抽屉（42 国在 3 步内可达） ——

  private bindKingdomList(): void {
    this.on($('#kingdomListBtn'), 'click', () => {
      this.listQuery = '';
      ($('#kingdomSearch') as HTMLInputElement).value = '';
      this.renderKingdomList();
      $('#kingdomListVeil').hidden = false;
      ($('#kingdomSearch') as HTMLInputElement).focus();
    });
    this.on($('#kingdomListClose'), 'click', () => ($('#kingdomListVeil').hidden = true));
    this.on($('#kingdomListVeil'), 'click', (e) => {
      if (e.target === $('#kingdomListVeil')) $('#kingdomListVeil').hidden = true;
    });
    this.on($('#kingdomSearch'), 'input', (e) => {
      this.listQuery = (e.target as HTMLInputElement).value.trim().toLowerCase();
      this.renderKingdomList();
    });
    $$('.kl-sorts button').forEach((btn) =>
      this.on(btn, 'click', () => {
        this.listSort = (btn.dataset.sort ?? 'progress') as typeof this.listSort;
        $$('.kl-sorts button').forEach((b) => b.classList.toggle('on', b === btn));
        this.renderKingdomList();
      }),
    );
  }

  private renderKingdomList(): void {
    const q = this.listQuery;
    const rows = this.nodes
      .filter((n) => !q || n.view.name.toLowerCase().includes(q) || n.view.en.toLowerCase().includes(q))
      .sort((a, b) => {
        if (this.listSort === 'name') return a.view.name.localeCompare(b.view.name, 'zh-Hans-CN');
        if (this.listSort === 'tribute') {
          const av = a.tributeReady ? a.tributeGold + 1 : 0;
          const bv = b.tributeReady ? b.tributeGold + 1 : 0;
          if (av !== bv) return bv - av;
        }
        // 推进度：可玩优先（未锁 > 锁），其中未打完的在前，再按门槛等级
        if (a.locked !== b.locked) return a.locked ? 1 : -1;
        const ap = a.nextNode === null ? 1 : 0;
        const bp = b.nextNode === null ? 1 : 0;
        if (ap !== bp) return ap - bp;
        return a.unlockLevel - b.unlockLevel;
      });
    const el = $('#kingdomListRows');
    el.innerHTML = rows.length
      ? rows
          .map((n) => {
            const tag = n.locked
              ? `<span class="kl-tag">冒险者 Lv.${n.unlockLevel}</span>`
              : n.tributeReady
                ? `<span class="kl-tag ${n.tributeOverflowing ? 'over' : 'gold'}">进贡 ${fmt(n.tributeGold)}${n.tributeOverflowing ? ' · 满溢' : ''}</span>`
                : `<span class="kl-tag">任务 ${n.questsDone}/8</span>`;
            const sub = n.locked
              ? `${n.view.en} · 未解锁`
              : `${n.view.en} · Lv.${n.level} · 任务 ${n.questsDone}/8${n.exploreUnlocked ? ' · HARD' : ''}`;
            return `<button class="kl-row${n.locked ? ' locked' : ''}" type="button" data-id="${n.view.name}">
              <span class="kl-crest">${n.view.crest ? `<img src="${n.view.crest}" alt="">` : crestSvg(n.view)}</span>
              <span><b>${n.view.name}</b><small>${sub}</small></span>
              ${tag}
            </button>`;
          })
          .join('')
      : '<p class="kl-empty">没有匹配的王国。</p>';
    $$('.kl-row', el).forEach((row) =>
      this.on(row, 'click', () => {
        $('#kingdomListVeil').hidden = true;
        this.openKingdom(row.dataset.id!);
      }),
    );
  }

  // —— M-9 一键收贡的二次确认（不可撤销的批量结算必须先看清收什么） ——

  private openTributeConfirm(ctx: ShellCtx): void {
    const ready = this.nodes.filter((n) => !n.locked && n.tributeReady);
    if (!ready.length) {
      toast('尚无可领取进贡。');
      return;
    }
    const gold = ready.reduce((s, n) => s + n.tributeGold, 0);
    const souls = ready.reduce((s, n) => s + n.tributeSouls, 0);
    const keys = ready.reduce((s, n) => s + n.tributeKeys, 0);
    // 「还没攒满就收」= 把计时器拨回 now，未满溢的部分等于白亏（M-9 的核心风险）
    const early = ready.filter((n) => !n.tributeOverflowing && n.tributeHours < TRIBUTE.capHours);
    $('#tributeNote').textContent = early.length
      ? `收取会把该国的累积计时拨回现在。下面 ${early.length} 国还没攒满 ${TRIBUTE.capHours} 小时，现在收等于少拿后面的产出。`
      : '收取会把累积计时拨回现在。';
    $('#tributeRows').innerHTML = ready
      .map((n) => {
        const earlyOne = !n.tributeOverflowing && n.tributeHours < TRIBUTE.capHours;
        const parts = [
          n.tributeGold ? `黄金 ${fmt(n.tributeGold)}` : '',
          n.tributeSouls ? `灵魂 ${n.tributeSouls}` : '',
          n.tributeKeys ? `金钥匙 ${n.tributeKeys}` : '',
        ].filter(Boolean).join(' · ');
        const note = n.tributeOverflowing
          ? `已满 ${TRIBUTE.capHours} 小时并溢出，建议立刻收`
          : earlyOne
            ? `只累计 ${n.tributeHours}/${TRIBUTE.capHours} 小时，${clockOf(n.tributeCapAt)} 才满`
            : `已攒满 ${TRIBUTE.capHours} 小时`;
        return `<div class="tb-row${earlyOne ? ' warn' : ''}"><span><b>${n.view.name}</b><small>${note}</small></span><span>${parts}</span></div>`;
      })
      .join('');
    $('#tributeTotal').textContent = `合计：黄金 ${fmt(gold)} · 灵魂 ${souls}${keys ? ` · 金钥匙 ${keys}` : ''}（${ready.length} 国）`;
    $('#tributeConfirmLabel').textContent = `确认收取 ${ready.length} 国`;
    mountIcons($('#tributeVeil'));
    $('#tributeVeil').hidden = false;
    void ctx;
  }

  // —— M-5 标签防重叠（逐节点纵向让位；缩放时标签跟着缩） ——

  private layoutLabels(): void {
    cancelAnimationFrame(this.labelJob);
    this.labelJob = requestAnimationFrame(() => {
      const nodes = $$('.knode');
      const placed: Array<{ left: number; right: number; top: number; bottom: number }> = [];
      // 从上到下贪心让位：先到先占，后来者纵向试几档偏移
      const ordered = nodes
        .map((el) => ({ el, label: $('.kmeta', el) }))
        .filter((x) => x.label)
        .sort((a, b) => a.el.getBoundingClientRect().top - b.el.getBoundingClientRect().top);
      for (const { el, label } of ordered) {
        label.style.setProperty('--label-dy', '0px');
        const base = label.getBoundingClientRect();
        let dy = 0;
        for (const candidate of [0, 26, -84, 52, -110, 78]) {
          const box = {
            left: base.left,
            right: base.right,
            top: base.top + candidate,
            bottom: base.bottom + candidate,
          };
          const clash = placed.some(
            (p) => box.right > p.left + 1 && box.left < p.right - 1 && box.bottom > p.top + 1 && box.top < p.bottom - 1,
          );
          if (!clash) {
            dy = candidate;
            placed.push(box);
            break;
          }
          if (candidate === 78) {
            dy = candidate;
            placed.push(box);
          }
        }
        if (dy) label.style.setProperty('--label-dy', `${dy}px`);
        void el;
      }
    });
  }

  // —— rail 入口（M-1：7 个入口全部有明确行为，零「点了没反应」） ——

  /**
   * 当前应推进的王国：优先当前选中的（若还有未打的关），否则按 KINGDOM_VIEWS 顺序
   * 取第一个「已解锁且任务链未打完」的王国；全部打完则回落到选中王国。
   */
  private questTargetKingdom(): string {
    const sel = this.nodes.find((n) => n.view.name === this.selected);
    if (sel && !sel.locked && sel.nextNode !== null) return sel.view.name;
    const next = this.nodes.find((n) => !n.locked && n.nextNode !== null);
    return next?.view.name ?? this.selected;
  }

  /** rail 七入口：绑定 + 副题改「当前状态」（审查提案 M-1 规则 3） */
  private bindRail(ctx: ShellCtx): void {
    const save = ctx.save();

    // 左 1 · 王国任务 → 当前推进王国的主线页
    const questTarget = this.questTargetKingdom();
    const questVm = this.nodes.find((n) => n.view.name === questTarget);
    if ($('#railQuestCopy')) {
      $('#railQuestCopy').textContent = questVm
        ? `${questTarget} ${questVm.questsDone}/8`
        : '章节战斗';
    }
    this.on($('#railQuest'), 'click', () => this.openRailQuest(ctx));

    // 左 2 · 战役：无对应系统 → 诚实锁态（不留亮着点了没反应的按钮）
    this.on($('#railCampaign'), 'click', () => toast('战役（主线剧情）尚未开放，敬请期待。'));

    // 左 3 · 活动中心：用 per-event 周状态聚合真正可处理的奖励/兑换提醒。
    const eventsButton = $('#railEvents');
    const eventStatus = eventRailStatus(save, weekStartOf(Date.now()), Date.now());
    const statusParts = [
      eventStatus.claimableActivities > 0 ? `${eventStatus.claimableActivities} 个奖励待领取` : '',
      eventStatus.affordableShops > 0 ? `${eventStatus.affordableShops} 家商店可兑换` : '',
    ].filter(Boolean);
    const compactStatus = eventStatus.claimableActivities > 0 && eventStatus.affordableShops > 0
      ? `待领 ${eventStatus.claimableActivities} · 可换 ${eventStatus.affordableShops}`
      : eventStatus.claimableActivities > 0
        ? `${eventStatus.claimableActivities} 个奖励待领`
        : `${eventStatus.affordableShops} 家可兑换`;
    if (eventStatus.actionableActivities > 0) {
      eventsButton.classList.add('has-actions');
      $('#railEventsBadge').hidden = false;
      $('#railEventsBadgeCount').textContent = String(eventStatus.actionableActivities);
      $('#railEventsCopy').textContent = compactStatus;
      eventsButton.setAttribute('aria-label', `活动中心，${statusParts.join('，')}`);
      eventsButton.title = statusParts.join('，');
    } else {
      $('#railEventsCopy').textContent = '本周活动';
      eventsButton.setAttribute('aria-label', '活动中心，本周暂无可领取或可兑换内容');
    }
    this.on(eventsButton, 'click', () => ctx.navigate('#events'));

    // 右 1 · 武器库 → 英雄页武器区（窗口 M 的 #weapons 交付后改指向该屏）
    const weapon = anyWeaponById(save.hero.equippedWeapon);
    if ($('#railVaultCopy')) {
      $('#railVaultCopy').textContent = weapon ? `已装备 · ${weapon.name}` : '尚未装备武器';
    }
    this.on($('#railVault'), 'click', () => ctx.navigate('#hero'));

    // 右 2 · 神殿（职业进阶）→ 英雄页职业圣殿区
    if ($('#railTempleCopy')) {
      $('#railTempleCopy').textContent = `已解锁职业 ${save.hero.unlockedClasses.length}`;
    }
    this.on($('#railTemple'), 'click', () => ctx.navigate('#hero'));

    // 右 3 · 馈赠：无对应系统 → 诚实锁态
    this.on($('#railGifts'), 'click', () => toast('每周礼遇尚未开放，敬请期待。'));
  }

  /** 王国任务 rail 的落点（批次 3 后改为 #quest/<王国> 主线页） */
  private openRailQuest(ctx: ShellCtx): void {
    const target = this.questTargetKingdom();
    const vm = this.nodes.find((n) => n.view.name === target);
    if (!vm || vm.locked) {
      toast('暂无可推进的王国任务，先提升冒险者等级解锁新王国。');
      return;
    }
    // M10 已落地：rail 直接进王国主线页（在那里才能看到 8 关结构与阵容）
    ctx.navigate('#quest/' + encodeURIComponent(target));
  }

  /** 外壳挂载后的二次刷新（战斗归来等场景直接复用） */
  private renderNodes(save: MetaSave): void {
    const nodesEl = $('#nodes');
    nodesEl.innerHTML = this.nodes
      .map((n) => {
        const locked = n.locked;
        const cls = ['knode', n.view.hero ? 'hero' : 'far', n.view.name === this.selected ? 'sel' : '', locked ? 'locked' : '', !locked && n.tributeReady ? 'has-trib' : '']
          .filter(Boolean)
          .join(' ');
        const mark = n.view.crest ? `<img src="${n.view.crest}" alt="" draggable="false">` : crestSvg(n.view);
        // M-2：锁态与王国等级不再共用一个「裸数字」槽位。
        //   解锁 → 主角是王国名 + 蓝签王国等级（+ 可收进贡角标）；
        //   锁态 → 主角是门槛明文「🔒 冒险者 Lv.N 解锁」，王国名退为第二行。
        const meta = locked
          ? `<span class="kmeta locked">
               <span class="kgate"><span data-icon="lock"></span>冒险者 Lv.${n.unlockLevel} 解锁</span>
               <span class="kname sub">${n.view.name}</span>
             </span>`
          : `<span class="kmeta">
               <span class="kname">${n.view.name}</span>
               <span class="klv" title="王国 ${n.level} 级">${n.level}</span>
             </span>`;
        const tributeMark = n.tributeGold
          ? `<span data-icon="coin"></span>${fmt(n.tributeGold)}`
          : n.tributeSouls
            ? `<span data-icon="soul"></span>${n.tributeSouls}`
            : `<span data-icon="key"></span>${n.tributeKeys}`;
        const bubble = !locked && n.tributeReady
          ? `<span class="ktrib${n.tributeOverflowing ? ' over' : ''}" title="${n.tributeOverflowing ? '进贡已满，请收取' : '有进贡可收'}">${tributeMark}</span>`
          : '';
        const aria = locked
          ? `${n.view.name}，未解锁，需冒险者 ${n.unlockLevel} 级`
          : `${n.view.name}，王国 ${n.level} 级${n.tributeReady ? '，有进贡可收' : ''}`;
        return `<button class="${cls}" data-id="${n.view.name}" style="left:${n.view.x}%;top:${n.view.y}%" aria-label="${aria}">
          <span class="crest">${mark}${bubble}</span>
          ${meta}
        </button>`;
      })
      .join('');
    mountIcons(nodesEl);
    $$('.knode', nodesEl).forEach((el) =>
      this.on(el, 'click', () => this.openKingdom(el.dataset.id!)),
    );
    this.layoutLabels();
    void save;
  }

  private refreshDaily(save: MetaSave, ctx: ShellCtx): void {
    const now = Date.now();
    const winReady = save.dailyFirstWinAt < todayStartOf(now);
    $('#dailyWinCopy').textContent = winReady ? '每日首胜未领' : '每日首胜已领';
    $('#dailyWin').classList.toggle('hot', winReady);
    // 底栏只说玩家要做的事：可收、已满、还在累积。国数和金额留在确认层。
    const readyKingdoms = this.nodes.filter((n) => !n.locked && n.tributeReady);
    const urgent = readyKingdoms.some((n) => n.tributeOverflowing);
    $('#dailyTributeCopy').textContent = urgent
      ? '进贡已满'
      : readyKingdoms.length
        ? '收取进贡'
        : '进贡累积中';
    $('#dailyTribute').classList.toggle('gold', readyKingdoms.length > 0);
    $('#dailyTribute').classList.toggle('over', urgent);
    $('#dailyArenaCopy').textContent = save.arena.activeDraft ? '继续竞技场' : '竞技场 · 1000黄金';
    $('#dailyArena').classList.toggle('hot', !!save.arena.activeDraft);
    const maps = save.materials.treasureMaps;
    $('#dailyHuntCopy').textContent = save.treasureHunt
      ? '寻宝进行中'
      : maps > 0
        ? `寻宝 ${maps.toLocaleString('en-US')}`
        : '寻宝';
    void ctx;
  }

  // —— 王国弹层 ——

  private openKingdom(name: string): void {
    const vm = this.nodes.find((n) => n.view.name === name);
    if (!vm) return;
    this.selected = name;
    this.openName = name;
    $$('.knode').forEach((n) => n.classList.toggle('sel', n.dataset.id === name));
    this.focusKingdom(name, Math.max(this.cam.s, 1));

    const locked = vm.locked;
    const view = vm.view;
    $('#kingdomSheet').classList.toggle('is-locked', locked);
    $('#kingdomLockPanel').hidden = !locked;
    $('#kingdomOpenBody').hidden = locked;
    const portrait = $('#kingdomPortrait') as HTMLImageElement;
    portrait.src = ART[view.biome] ?? ART.spire!;
    portrait.alt = view.name + '王国立绘';
    $('#kingdomArt').classList.toggle('locked', locked);
    $('#kingdomEn').textContent = view.en;
    $('#kingdomArtName').textContent = view.name;
    $('#kingdomName').textContent = view.name;
    $('#kingdomBlurb').textContent = locked
      ? `冒险者达到 Lv.${vm.unlockLevel} 后开放此王国。`
      : view.blurb || `${view.name}的领地等待着你的旗帜。`;
    $('#kingdomLevel').innerHTML = locked
      ? '<em>—</em>'
      : `<em>${vm.level}</em><i>/ ${KINGDOM_MAX_LEVEL}</i>`;
    const loot = [
      vm.tributeGold ? `<span class="loot"><span data-icon="coin"></span>${fmt(vm.tributeGold)}</span>` : '',
      vm.tributeSouls ? `<span class="loot soul"><span data-icon="soul"></span>${vm.tributeSouls}</span>` : '',
      vm.tributeKeys ? `<span class="loot key"><span data-icon="key"></span>${vm.tributeKeys}</span>` : '',
    ].filter(Boolean);
    $('#kingdomTribute').innerHTML = locked
      ? '—'
      : vm.tributeReady
        ? loot.join('')
        : vm.tributeHours > 0
          ? '这轮没有'
          : '累积中';
    const statCn: Record<string, string> = { health: '生命', armor: '护甲', attack: '攻击', magic: '魔法' };
    const statIcon: Record<string, string> = { health: 'soul', armor: 'gear', attack: 'swords', magic: 'crystal' };
    const bonusKey = kingdomBonusStat(view.name);
    const bonusStat = statCn[bonusKey] ?? bonusKey;
    $('#kingdomBonusIcon').dataset.icon = statIcon[bonusKey] ?? 'wing';
    $('#kingdomBonus').innerHTML = vm.level >= KINGDOM_MAX_LEVEL
      ? `<em>${bonusStat} +1</em><i>已生效</i>`
      : `<em>${bonusStat} +1</em><i>${KINGDOM_MAX_LEVEL} 级</i>`;
    $('#kingdomLockLevel').textContent = `冒险者 Lv.${vm.unlockLevel}`;
    $('#kingdomLockGap').textContent = `你现在 Lv.${this.heroLevel}，还差 ${Math.max(0, vm.unlockLevel - this.heroLevel)} 级`;
    $('#kingdomLockTroops').textContent = `${vm.poolSize} 名王国部队收藏`;
    $('#kingdomLockBonus').textContent = `满级加成：全体${bonusStat} +1`;
    $('#kingdomFill').style.width = locked ? '0%' : `${(vm.level / KINGDOM_MAX_LEVEL) * 100}%`;
    let cost = 0;
    try {
      cost = kingdomUpgradeCost(vm.level);
    } catch {
      cost = 0;
    }
    $('#upgradeHint').textContent = !locked && vm.level >= KINGDOM_MAX_LEVEL ? '已生效' : '';
    $('#upgradeCost').textContent = fmt(cost);
    ($('#kingdomUpgrade') as HTMLButtonElement).disabled = locked || vm.level >= KINGDOM_MAX_LEVEL;
    $('#upgradeLabel').textContent = locked ? '王国未解锁' : vm.level >= KINGDOM_MAX_LEVEL ? '已达满级' : '投入升级';
    $('.price', $('#kingdomUpgrade')).hidden = locked || vm.level >= KINGDOM_MAX_LEVEL;
    // M-4：收取按钮的可用性与库存同源（改前用小时数判，于是「0 袋 + 按钮可点 + 点了说没有」）
    ($('#kingdomCollect') as HTMLButtonElement).disabled = locked || !vm.tributeReady;
    $('#collectLabel').textContent = '收取';
    $('#tributeRow').classList.toggle('over', !locked && vm.tributeOverflowing);
    $('#tributeFill').style.width = locked ? '0%' : `${Math.min(100, (vm.tributeHours / TRIBUTE.capHours) * 100)}%`;
    $('#tributeCopy').textContent = locked
      ? '解锁后开始'
      : vm.tributeOverflowing
        ? '已满'
        : `下一笔 ${clockOf(vm.tributeNextHourAt)}`;
    $('#tributeRow').title = locked
      ? ''
      : vm.tributeOverflowing
        ? '已经攒满，再等也不会变多'
        : `最多攒 ${TRIBUTE.capHours} 小时`;
    mountIcons($('#kingdomOpenBody'));
    // K-10：把「你卡在第几关、下一步点哪」写在卡上，而不是让玩家自己从 8/8 推断
    $('#questProgress').textContent = locked
      ? `需冒险者 Lv.${vm.unlockLevel}`
      : vm.nextNode === null
        ? '8 / 8 已全通'
        : `${vm.questsDone}/8 · 下一关 第 ${vm.nextNode} 关`;
    $('#questEntryTitle').textContent = vm.nextNode === null ? 'HARD / VERY HARD' : `王国任务 · 第 ${vm.nextNode} 关`;
    $('#questEntryAction').textContent = vm.nextNode === null ? '前往 HARD' : '进入主线';
    $('#exploreState').textContent = locked
      ? `需冒险者 Lv.${vm.unlockLevel}`
      : vm.exploreUnlocked
        ? '已开放'
        : '主线 8/8 后开放';
    $('#troopProgress').textContent = locked ? `解锁后 ${vm.poolSize} 名` : `${vm.ownedTroops} / ${vm.poolSize}`;
    $('#entryExplore').classList.toggle('locked', locked || !vm.exploreUnlocked);
    $('#entryQuest').classList.toggle('locked', locked);
    // K-3：锁定态下这张卡此前**不带 locked**，看起来完全可点
    $('#entryTroops').classList.toggle('locked', locked);
    $('#kingdomVeil').hidden = false;
  }

  private closeKingdom(): void {
    $('#kingdomVeil').hidden = true;
    this.openName = null;
  }

  // —— 弹层操作（全走网关） ——

  private async upgrade(ctx: ShellCtx): Promise<void> {
    if (!this.openName) return;
    const { result } = await ctx.gateway.upgradeKingdomLevel(this.openName);
    if (isFailure(result)) {
      toast(result.message);
    } else {
      toast(result >= KINGDOM_MAX_LEVEL
        ? `${this.openName} 达到 10 级，全体部队${kingdomBonusStat(this.openName)} +1。`
        : `${this.openName} 提升至 ${result} 级。`);
    }
    this.afterMutation(ctx);
  }

  private async collect(ctx: ShellCtx): Promise<void> {
    if (!this.openName) return;
    const { result } = await ctx.gateway.collectKingdomTribute(this.openName, Date.now());
    toast(
      result.hits > 0
        ? `进贡已收取：黄金 +${fmt(result.gold)}，灵魂 +${result.souls}${result.goldKeys ? '，金钥匙 +1' : ''}`
        : '暂无可领取的进贡。',
    );
    this.afterMutation(ctx);
  }

  private async collectAllTribute(ctx: ShellCtx): Promise<void> {
    const ready = this.nodes.filter((n) => !n.locked && n.tributeReady);
    if (!ready.length) {
      toast('尚无可领取进贡。');
      return;
    }
    let gold = 0;
    let souls = 0;
    let keys = 0;
    for (const n of ready) {
      const { result } = await ctx.gateway.collectKingdomTribute(n.view.name, Date.now());
      gold += result.gold;
      souls += result.souls;
      keys += result.goldKeys;
    }
    toast(`已收取 ${ready.length} 国进贡：黄金 +${fmt(gold)}，灵魂 +${souls}${keys ? `，金钥匙 +${keys}` : ''}`);
    this.afterMutation(ctx);
  }

  /**
   * M10：任务/探索两个入口**不再直接开战**，改进王国主线页（`#quest/<王国>`）——
   * 玩家先看到 8 关结构、敌人阵容、奖励位置与探索档位，再决定出战。
   */
  private enterQuest(ctx: ShellCtx): void {
    if (!this.openName) return;
    const vm = this.nodes.find((n) => n.view.name === this.openName);
    if (!vm || vm.locked) {
      toast(`${this.openName} 尚未解锁：需冒险者 Lv.${vm?.unlockLevel ?? '?'}。`);
      return;
    }
    ctx.navigate(
      '#quest/' + encodeURIComponent(vm.view.name) + (vm.nextNode === null ? '/hard' : ''),
    );
  }

  private enterExplore(ctx: ShellCtx): void {
    if (!this.openName) return;
    const vm = this.nodes.find((n) => n.view.name === this.openName);
    if (!vm || vm.locked) {
      toast(`${this.openName} 尚未解锁：需冒险者 Lv.${vm?.unlockLevel ?? '?'}。`);
      return;
    }
    if (!vm.exploreUnlocked) {
      toast(`主线通关后开放 HARD / VERY HARD（当前 ${vm.questsDone}/8）。`);
      return;
    }
    ctx.navigate('#quest/' + encodeURIComponent(vm.view.name) + '/hard');
  }

  /** K-2：王国部队不再只给一句 toast，跳图鉴并带王国筛选参数 */
  private enterTroops(ctx: ShellCtx): void {
    if (!this.openName) return;
    ctx.navigate('#troop/kingdom=' + encodeURIComponent(this.openName));
  }

  /** 网关变更后：重算节点与弹层 + **同步顶栏钱包**（存档对象不变，重读视图即可） */
  private afterMutation(ctx: ShellCtx): void {
    this.heroLevel = ctx.save().hero.level;
    this.nodes = nodeVms(ctx.gateway);
    this.renderNodes(ctx.save());
    this.refreshDaily(ctx.save(), ctx);
    if (this.openName) this.openKingdom(this.openName);
    // M-3：地图上花钱/收钱后顶栏必须立即正确，否则玩家读成「没扣钱」而连点
    ctx.refreshChrome();
  }

  // —— 相机与拖拽（小样原逻辑移植） ——

  private stageScale(): number {
    if ($('#stage').classList.contains('map-responsive')) return 1;
    return $('#stage').getBoundingClientRect().width / 1600 || 1;
  }

  private homeScale(): number {
    const width = $('#mapViewport').getBoundingClientRect().width;
    if (width < 500) return 0.62;
    if (width < 900) return 0.7;
    return HOME_SCALE;
  }

  private viewSize(): { w: number; h: number } {
    const k = this.stageScale();
    const vp = $('#mapViewport').getBoundingClientRect();
    return { w: vp.width / k, h: vp.height / k };
  }

  private applyCam(): void {
    this.clampCam();
    $('#mapWorld').style.transform = `translate(${this.cam.x}px, ${this.cam.y}px) scale(${this.cam.s})`;
    // M-5：改前是 `1 / cam.s` 的**反向补偿**——越缩小标签越大（实测最小视野 --label-s=1.120），
    // 于是"缩小看全局"这个动作本身在加剧标签重叠。改为跟随相机（以默认视野为 1.0），
    // 下限 0.72 保住可读性，上限 1.0 不让放大视野时标签溢出。
    const labelS = Math.min(1, Math.max(0.72, this.cam.s / HOME_SCALE));
    $('#nodes').style.setProperty('--label-s', labelS.toFixed(3));
    this.layoutLabels();
  }

  private clampCam(): void {
    const { w: VIEW_W, h: VIEW_H } = this.viewSize();
    const w = MAP_W * this.cam.s;
    const h = MAP_H * this.cam.s;
    this.cam.x = Math.min(0, Math.max(VIEW_W - w, this.cam.x));
    this.cam.y = Math.min(0, Math.max(VIEW_H - h, this.cam.y));
  }

  private focusKingdom(name: string, scale: number): void {
    const view = kingdomViewOf(name);
    const { w: VIEW_W, h: VIEW_H } = this.viewSize();
    this.cam.s = scale;
    this.cam.x = VIEW_W / 2 - (view.x / 100) * MAP_W * this.cam.s;
    this.cam.y = VIEW_H / 2 - (view.y / 100) * MAP_H * this.cam.s;
    this.applyCam();
  }

  private onPointerDown(e: PointerEvent): void {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    const t = e.target as HTMLElement;
    if (t.closest('.rail, .compass, .daily, .orb, .wallet, .topbar, .bottom-bar, .modal-veil')) return;
    e.preventDefault();
    cancelAnimationFrame(this.drag.inertia);
    this.drag.on = true;
    this.drag.moved = false;
    this.drag.id = t.closest('.knode')?.getAttribute('data-id') ?? null;
    this.drag.lx = e.clientX;
    this.drag.ly = e.clientY;
    this.drag.t = performance.now();
    this.drag.vx = this.drag.vy = 0;
    $('#mapViewport').classList.add('grabbing');
    try {
      (e.target as HTMLElement).setPointerCapture(e.pointerId);
    } catch {
      /* 指针捕获失败不阻塞拖拽 */
    }
  }

  private onPointerMove(e: PointerEvent): void {
    if (!this.drag.on) return;
    const k = this.stageScale();
    const dx = (e.clientX - this.drag.lx) / k;
    const dy = (e.clientY - this.drag.ly) / k;
    this.drag.lx = e.clientX;
    this.drag.ly = e.clientY;
    const now = performance.now();
    const dt = Math.max(8, now - this.drag.t);
    this.drag.t = now;
    this.drag.vx = dx * (16.67 / dt);
    this.drag.vy = dy * (16.67 / dt);
    if (Math.hypot(dx, dy) > 0.6) this.drag.moved = true;
    this.cam.x += dx;
    this.cam.y += dy;
    this.applyCam();
  }

  private endDrag(e: PointerEvent): void {
    if (!this.drag.on) return;
    this.drag.on = false;
    $('#mapViewport').classList.remove('grabbing');
    if (!this.drag.moved && this.drag.id) {
      this.openKingdom(this.drag.id);
      return;
    }
    if (!this.drag.moved) return;
    let vx = this.drag.vx;
    let vy = this.drag.vy;
    cancelAnimationFrame(this.drag.inertia);
    const tick = (): void => {
      vx *= 0.9;
      vy *= 0.9;
      if (Math.hypot(vx, vy) < 0.18) return;
      this.cam.x += vx;
      this.cam.y += vy;
      this.applyCam();
      this.drag.inertia = requestAnimationFrame(tick);
    };
    this.drag.inertia = requestAnimationFrame(tick);
    void e;
  }

  private onWheel(e: WheelEvent): void {
    e.preventDefault();
    const { w: VIEW_W, h: VIEW_H } = this.viewSize();
    const rect = $('#mapViewport').getBoundingClientRect();
    const k = this.stageScale();
    const mx = (e.clientX - rect.left) / k;
    const my = (e.clientY - rect.top) / k;
    const prev = this.cam.s;
    const minS = Math.max(0.55, VIEW_W / MAP_W, VIEW_H / MAP_H);
    const next = Math.min(1.55, Math.max(minS, this.cam.s * (e.deltaY > 0 ? 0.92 : 1.08)));
    const wx = (mx - this.cam.x) / prev;
    const wy = (my - this.cam.y) / prev;
    this.cam.s = next;
    this.cam.x = mx - wx * next;
    this.cam.y = my - wy * next;
    this.applyCam();
  }

  /** 事件绑定记账，路由切屏时统一解绑（防泄漏） */
  on(target: EventTarget, type: string, fn: EventListenerOrEventListenerObject, opts?: AddEventListenerOptions): void {
    target.addEventListener(type, fn, opts);
    this.listeners.push([target, type, fn, opts]);
  }

  dispose(): void {
    cancelAnimationFrame(this.drag.inertia);
    cancelAnimationFrame(this.labelJob);
    for (const [target, type, fn, opts] of this.listeners.splice(0)) {
      target.removeEventListener(type, fn, opts);
    }
  }
}
