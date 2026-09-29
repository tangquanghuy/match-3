/** 末日之塔 · 爬塔地图视图（自下而上一层层爬；StS 式分叉路线） */
import {
  TOWER_AFFIXES, TOWER_BLESSINGS, TOWER_EVENTS, TOWER_NODE_INFO, TOWER_RUNES, TOWER_TUNING, TOWER_ZONES, relicById,
} from '../../data/towerData';
import {
  TOWER_FLOORS, towerFloorLevel, towerFloorOf, towerReachable, type TowerNode, type TowerRun, type TowerState,
} from '../../systems/eventModes/tower';
import { actButton, artImg, esc, fightButton, memberName, pct, type ViewCtx } from './shared';
import { cssUrlVar, eventArt } from '../../shell/artAssets';

const ROW_H = 64;

/** 祝福 / 符文的配图（复用遗物与棋盘图标） */
const BOON_ICON: Record<string, string> = {
  bless_gold: 'tile-gold', bless_relic: 'node-treasure', bless_hp: 'relic-vital_chalice', bless_atk: 'relic-ember_sigil', bless_rare: 'relic-curse_frailty',
  rune_atk: 'relic-ember_sigil', rune_arm: 'relic-iron_bulwark', rune_hp: 'relic-vital_chalice', rune_mag: 'relic-sage_quill', rune_heal: 'relic-mending_moss', rune_gold: 'tile-gold',
};
const PAD = 18;

function relicChip(id: string, extra = ''): string {
  const r = relicById(id);
  if (!r) return '';
  return `<span class="tw-relic ${r.rarity}" title="${esc(`${r.name}：${r.desc}`)}" ${extra}>${artImg(`relic-${id}`, 'tw-relic-img', r.name)}</span>`;
}

function relicCard(id: string, action: string, footer = '', disabled = false): string {
  const r = relicById(id);
  if (!r) return '';
  const tag = { common: '普通遗物', rare: '稀有遗物', boss: '首领遗物', curse: '诅咒' }[r.rarity];
  return `<button type="button" class="tw-card ${r.rarity}" data-act="${esc(action)}"${disabled ? ' disabled' : ''}>
      ${artImg(`relic-${id}`, 'tw-card-img', r.name)}
      <small>${tag}</small><b>${esc(r.name)}</b><span>${esc(r.desc)}</span>${footer}
    </button>`;
}

function textCard(title: string, desc: string, action: string, opts: { icon?: string; tag?: string; disabled?: boolean; footer?: string } = {}): string {
  return `<button type="button" class="tw-card" data-act="${esc(action)}"${opts.disabled ? ' disabled' : ''}>
      ${opts.icon ? artImg(opts.icon, 'tw-card-img') : ''}
      ${opts.tag ? `<small>${esc(opts.tag)}</small>` : ''}<b>${esc(title)}</b><span>${esc(desc)}</span>${opts.footer ?? ''}
    </button>`;
}

function pendingHtml(v: ViewCtx, run: TowerRun): string {
  const p = run.pending;
  if (!p) return '';
  let title = '';
  let body = '';
  let foot = '';
  switch (p.kind) {
    case 'blessing':
      title = '开局祝福';
      body = `<p class="tw-modal-copy">塔门前的守望者向你伸出手——选择一份祝福带上塔。</p><div class="tw-cards">${p.options.map((id, i) =>
        textCard(TOWER_BLESSINGS[id].name, TOWER_BLESSINGS[id].desc, `pick:${i}`, { tag: '祝福', icon: BOON_ICON[id] })).join('')}</div>`;
      break;
    case 'reward': {
      title = p.source === 'boss' ? '首领战利品' : p.source === 'elite' ? '精英战利品' : '战斗奖励';
      const rune = p.source === 'battle';
      body = `<p class="tw-modal-copy">塔金 <b>+${p.gold}</b> 已入袋。${rune ? '挑选一枚符文：' : p.source === 'boss' ? '挑选一件首领遗物（强大，但有代价）：' : '挑选一件遗物：'}</p>
        <div class="tw-cards">${p.options.map((id, i) => rune
          ? textCard(TOWER_RUNES[id as keyof typeof TOWER_RUNES]?.name ?? id, TOWER_RUNES[id as keyof typeof TOWER_RUNES]?.desc ?? '', `pick:${i}`, { tag: '符文', icon: BOON_ICON[id] })
          : relicCard(id, `pick:${i}`)).join('') || '<p class="tw-modal-copy">没有可选的遗物了。</p>'}</div>`;
      foot = actButton(p.source === 'boss' ? '放弃并继续' : '放弃奖励', 'skip', { cls: 'ghost' });
      break;
    }
    case 'camp': {
      const dead = (v.week.runTeam ?? []).some((m) => m.defeated || m.hp <= 0);
      title = '营地';
      body = `<p class="tw-modal-copy">篝火噼啪作响。今晚只来得及做一件事。</p><div class="tw-cards">
        ${textCard('休整', `存活成员回复 ${Math.round(TOWER_TUNING.campRestPct * 100)}% 生命`, 'camp:rest', { icon: 'node-camp' })}
        ${textCard('磨砺', `全队攻击 +${TOWER_TUNING.campTrainAttack}（本轮永久）`, 'camp:train', { icon: 'relic-ember_sigil' })}
        ${textCard('招魂', dead ? `一名阵亡成员以 ${Math.round(TOWER_TUNING.campRevivePct * 100)}% 生命归队` : '无人阵亡', 'camp:revive', { icon: 'relic-phoenix_feather', disabled: !dead })}
      </div>`;
      break;
    }
    case 'treasure':
      title = '宝库';
      body = `<p class="tw-modal-copy">尘封的宝库里还剩下这些：</p><div class="tw-cards">
        ${p.relic ? relicCard(p.relic, 'claim') : ''}
        ${textCard(`塔金 +${p.gold}`, '一袋沉甸甸的塔金', 'claim', { icon: 'tile-gold', tag: '塔金' })}
      </div>`;
      foot = actButton('全部收下', 'claim', { cls: 'primary' });
      break;
    case 'merchant': {
      const curse = run.relics.includes('curse_frailty');
      title = '塔中商人';
      body = `<p class="tw-modal-copy">「塔金换命，童叟无欺。」 你有 <b>${run.gold}</b> 塔金。</p><div class="tw-cards">
        ${p.stock.map((item, i) => relicCard(item.relic, `buy:${i}`, `<em class="tw-price${run.gold < item.price ? ' short' : ''}">${item.sold ? '已售出' : `${item.price} 塔金`}</em>`, item.sold || run.gold < item.price)).join('')}
        ${textCard('治疗', `存活成员回复 ${Math.round(TOWER_TUNING.healPct * 100)}% 生命`, 'buy:heal', { icon: 'relic-mending_moss', disabled: p.healUsed || run.gold < TOWER_TUNING.healPrice, footer: `<em class="tw-price">${p.healUsed ? '已使用' : `${TOWER_TUNING.healPrice} 塔金`}</em>` })}
        ${textCard('驱除诅咒', curse ? '移除「虚弱之面」' : '你身上没有诅咒', 'buy:purge', { icon: 'relic-curse_frailty', disabled: !curse || p.purgeUsed || run.gold < TOWER_TUNING.purgePrice, footer: `<em class="tw-price">${TOWER_TUNING.purgePrice} 塔金</em>` })}
      </div>`;
      foot = actButton('离开', 'leave', { cls: 'ghost' });
      break;
    }
    case 'event': {
      const ev = TOWER_EVENTS.find((e) => e.id === p.event);
      if (!ev) return '';
      title = ev.title;
      body = `<p class="tw-modal-copy tw-event-text">${esc(ev.text)}</p><div class="tw-choices">${ev.options.map((o, i) =>
        `<button type="button" class="tw-choice" data-act="event:${i}"${ev.id === 'gambler' && i === 0 && run.gold < 40 ? ' disabled' : ''}><b>${esc(o.label)}</b><span>${esc(o.desc)}</span></button>`).join('')}</div>`;
      break;
    }
  }
  return `<div class="tw-modal" role="dialog" aria-modal="false" aria-label="${esc(title)}"><section class="tw-modal-card">
      <h3>${esc(title)}</h3>${body}${foot ? `<footer>${foot}</footer>` : ''}
    </section></div>`;
}

function mapHtml(v: ViewCtx, run: TowerRun): string {
  const rows = run.rows;
  const height = rows.length * ROW_H + PAD * 2;
  const cy = (row: number): number => height - PAD - row * ROW_H - ROW_H / 2;
  const cx = (col: number): number => (col + 0.5) * 20;
  const reachable = towerReachable(run);
  const reach = new Set(reachable.map((n) => `${n.row}-${n.col}`));
  const visited = new Set(run.path);
  const edges: string[] = [];
  for (const row of rows) {
    for (const node of row) {
      for (const c of node.next) {
        const from = `${node.row}-${node.col}`;
        const to = `${node.row + 1}-${c}`;
        const walked = visited.has(from) && visited.has(to);
        const open = run.at && run.at.row === node.row && run.at.col === node.col;
        edges.push(`<line x1="${cx(node.col)}" y1="${cy(node.row)}" x2="${cx(c)}" y2="${cy(node.row + 1)}" class="${walked ? 'walked' : open ? 'open' : ''}" vector-effect="non-scaling-stroke"/>`);
      }
    }
  }
  const nodes = rows.flat().map((node) => {
    const id = `${node.row}-${node.col}`;
    const state = visited.has(id) ? 'done' : reach.has(id) ? 'reach' : run.at && node.row <= run.at.row ? 'past' : 'future';
    const sel = v.selected === `go:${id}` ? ' selected' : '';
    const info = TOWER_NODE_INFO[node.kind];
    const affix = node.affix ? ` · ${TOWER_AFFIXES[node.affix].name}` : '';
    const label = `第 ${towerFloorOf(run.zone, node.row)} 层 · ${info.name}${affix}`;
    const attr = state === 'reach' ? `data-select="go:${id}"` : 'tabindex="-1"';
    return `<button type="button" class="tw-node ${node.kind} ${state}${sel}" style="left:${cx(node.col)}%;top:${cy(node.row)}px" ${attr} title="${esc(label)}" aria-label="${esc(label)}"${state === 'reach' ? '' : ' aria-disabled="true"'}>
        ${artImg(`node-${node.kind}`, 'tw-node-img', info.name)}${node.affix ? '<i class="tw-affix"></i>' : ''}
      </button>`;
  }).join('');
  const floors = rows.map((_row, r) => `<span class="tw-floor-mark" style="top:${cy(r)}px">${towerFloorOf(run.zone, r)}</span>`).join('');
  const scrollRow = reachable[0]?.row ?? run.at?.row ?? 0;
  return `<div class="tw-map-scroll" data-scroll-y="${Math.max(0, cy(scrollRow) - 220)}">
      <div class="tw-map" style="height:${height}px">
        <svg class="tw-edges" viewBox="0 0 100 ${height}" preserveAspectRatio="none" aria-hidden="true">${edges.join('')}</svg>
        ${floors}${nodes}
      </div>
    </div>`;
}

function detailHtml(v: ViewCtx, run: TowerRun): string {
  if (run.pending) return '<footer class="tw-detail"><span class="tw-detail-hint">先处理当前节点的事项</span></footer>';
  const m = v.selected?.match(/^go:(\d+)-(\d+)$/);
  const node: TowerNode | undefined = m ? towerReachable(run).find((n) => n.row === Number(m[1]) && n.col === Number(m[2])) : undefined;
  if (!node) return '<footer class="tw-detail"><span class="tw-detail-hint"><span data-icon="chevrons"></span>点击地图上发光的节点，选择下一层要走的路</span></footer>';
  const info = TOWER_NODE_INFO[node.kind];
  const floor = towerFloorOf(run.zone, node.row);
  const battle = node.kind === 'battle' || node.kind === 'elite' || node.kind === 'boss';
  const level = towerFloorLevel(floor) + (node.kind === 'boss' ? 3 : node.kind === 'elite' ? 2 : 0);
  const affix = node.affix ? TOWER_AFFIXES[node.affix] : null;
  return `<footer class="tw-detail">
      ${artImg(`node-${node.kind}`, 'tw-detail-img', info.name)}
      <div class="tw-detail-copy">
        <b>第 ${floor} 层 · ${info.name}${affix ? `<em class="tw-affix-tag">${affix.name}</em>` : ''}</b>
        <span>${esc(info.hint)}${battle ? ` 敌人 Lv.${level}${affix ? ` · ${affix.desc}` : ''}` : ''}</span>
      </div>
      ${battle ? fightButton(v, `go:${node.row}-${node.col}`, node.kind === 'boss' ? '挑战首领' : '出战') : actButton('前往', `go:${node.row}-${node.col}`, { cls: 'primary big' })}
    </footer>`;
}

function sideHtml(v: ViewCtx, run: TowerRun): string {
  const team = (v.week.runTeam ?? []).map((m) => {
    const dead = m.defeated || m.hp <= 0;
    return `<li class="${dead ? 'dead' : ''}"><span>${esc(memberName(m.externalId))}</span><i><em style="width:${pct(m.hp, m.maxHp)}%"></em></i><b>${dead ? '阵亡' : `${Math.round(m.hp)}/${Math.round(m.maxHp)}`}</b></li>`;
  }).join('');
  const bonus = [
    run.bonus.attack ? `攻击 ${run.bonus.attack > 0 ? '+' : ''}${run.bonus.attack}` : '',
    run.bonus.armor ? `护甲 ${run.bonus.armor > 0 ? '+' : ''}${run.bonus.armor}` : '',
    run.bonus.magic ? `魔法 +${run.bonus.magic}` : '',
    run.bonus.hpPct ? `生命 +${Math.round(run.bonus.hpPct * 100)}%` : '',
  ].filter(Boolean).join(' · ');
  const zones = TOWER_ZONES.map((z, i) => `<i class="${i < run.zone ? 'done' : i === run.zone ? 'now' : ''}" title="${z.name}"></i>`).join('');
  return `<aside class="tw-side">
      <div class="tw-stat-row">
        <div><small>当前层</small><b>${run.floor} <em>/ ${TOWER_FLOORS}</em></b></div>
        <div class="tw-gold"><small>塔金</small><b>${artImg('tile-gold', 'tw-gold-img')}${run.gold}</b></div>
      </div>
      <div class="tw-zones" aria-label="区域进度">${zones}</div>
      <section><h4>登塔队伍</h4><ul class="tw-team">${team}</ul></section>
      <section><h4>遗物 <small>${run.relics.length}</small></h4><div class="tw-relics">${run.relics.map((id) => relicChip(id)).join('') || '<span class="tw-empty">还没有遗物</span>'}</div></section>
      ${bonus ? `<section><h4>本轮加成</h4><p class="tw-bonus">${bonus}</p></section>` : ''}
      ${actButton('放弃并结算', 'abandon', { cls: 'danger', confirm: `按已通过的第 ${run.floor} 层结算本轮？当前队伍状态、遗物与塔金将清除，本周最高层与积分保留。` })}
    </aside>`;
}

function startHtml(v: ViewCtx, state: TowerState): string {
  const best = v.week.eventData.floorBest ?? 0;
  const last = state.last ? `<p class="tw-last">上一轮：${esc(state.last.reason)} · 到达第 ${state.last.floor} 层</p>` : '';
  const kinds = (['battle', 'elite', 'camp', 'treasure', 'merchant', 'event', 'boss'] as const).map((k) =>
    `<li>${artImg(`node-${k}`, 'tw-legend-img')}<b>${TOWER_NODE_INFO[k].name}</b><span>${TOWER_NODE_INFO[k].hint}</span></li>`).join('');
  return `<div class="tw-start">
      <section class="tw-start-hero">
        <h3>登上末日之塔</h3>
        <p>25 层，三个区域，每区一张随机分叉的地图。自己决定走哪条路：多打精英换遗物，还是绕去营地保命。队伍生命与阵亡一路延续，战败即结束。</p>
        <div class="tw-start-stats"><span>本周最高 <b>${best}</b> / ${TOWER_FLOORS} 层</span><span>本周登塔 <b>${state.runs}</b> 轮</span></div>
        ${last}
        <div class="tw-start-actions">${actButton('<span data-icon="swords"></span>开始登塔', 'start', { cls: 'primary big' })}<a href="#team"><span data-icon="gear"></span>调整编队</a></div>
        <small class="tw-start-note">开始后当前编队与站位锁定到本轮结束。</small>
      </section>
      <ul class="tw-legend">${kinds}</ul>
    </div>`;
}

export function towerViewHtml(v: ViewCtx, state: TowerState): string {
  const style = cssUrlVar('tw-bg', eventArt('bg-tower'));
  if (!state.run) return `<div class="evm evm-tower" style='${style}'>${startHtml(v, state)}</div>`;
  const run = state.run;
  const zone = TOWER_ZONES[run.zone]!;
  const first = towerFloorOf(run.zone, 0);
  return `<div class="evm evm-tower" style='${style}'>
      <section class="tw-mapcard">
        <header class="tw-zone"><b>第 ${run.zone + 1} 区 · ${zone.name}</b><small>第 ${first}–${first + zone.rows - 1} 层</small><span>${esc(zone.blurb)}</span></header>
        ${mapHtml(v, run)}
        ${detailHtml(v, run)}
        ${pendingHtml(v, run)}
      </section>
      ${sideHtml(v, run)}
    </div>`;
}
