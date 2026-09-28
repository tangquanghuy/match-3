/**
 * 王国弹层与进贡宝库的 HTML 片段（纯函数，只读存档视图）。
 *
 * 让「王国等级」「进贡」「旗帜」「主城」在弹层里各有一块看得见的位置：
 *  - 等级：盾徽数字 + 10 格轨道 + 当前/下一级/满级三行收益（GoW：每级 +进贡几率、+该国法力精通，
 *    10 级全体部队与主角 +1 绑定属性）；
 *  - 进贡：本国配比（黄金/灵魂/荣耀）、每小时几率、主城翻倍、当前库存；
 *  - 宝库：全部王国一起收，多国同一小时进贡另给宝石与金钥匙。
 */
import { KINGDOM_MAX_LEVEL, kingdomLevelTrack, kingdomMasteryColors } from '../systems/kingdomOps';
import type { TributeTreasury } from '../systems/tribute';
import { tributeMultiBonus, TRIBUTE, TRIBUTE_MULTI_BONUS } from '../data/economy';
import { tributeSpecialtyOf, tributeYield, type TributeSpecialty } from '../data/kingdomTribute';
import { kingdomBonusStat } from '../data/kingdoms';
import { gemSvg } from '../shell/chrome';
import { kingdomViewOf } from './mapData';

const fmt = (n: number): string => n.toLocaleString('en-US');
const pct = (n: number): string => `${Math.round(n * 100)}%`;

export const CURRENCY_ICON = {
  gold: new URL('../../assets/chrome/gold.png', import.meta.url).href,
  souls: new URL('../../assets/chrome/soul.png', import.meta.url).href,
  glory: new URL('../../assets/chrome/glory.png', import.meta.url).href,
  gems: new URL('../../assets/chrome/gem.png', import.meta.url).href,
  goldKeys: new URL('../../assets/chrome/key.png', import.meta.url).href,
} as const;

export type CurrencyKey = keyof typeof CURRENCY_ICON;

export const CURRENCY_NAME: Record<CurrencyKey, string> = {
  gold: '黄金', souls: '灵魂', glory: '荣耀', gems: '宝石', goldKeys: '金钥匙',
};

export const STAT_NAME: Record<string, string> = { health: '生命', armor: '护甲', attack: '攻击', magic: '魔法' };

export const SPECIALTY_NAME: Record<TributeSpecialty, string> = {
  gold: '黄金之国', souls: '灵魂之国', glory: '荣耀之国', mixed: '均衡进贡',
};

/** 货币小图标 + 数额 */
export function currencyAmount(key: CurrencyKey, amount: number, cls = ''): string {
  return `<span class="kc-amount ${key} ${cls}" title="${CURRENCY_NAME[key]}"><img src="${CURRENCY_ICON[key]}" alt="${CURRENCY_NAME[key]}" draggable="false"><b>${fmt(amount)}</b></span>`;
}

/** 一组货币（数额为 0 的不显示） */
export function currencyList(amounts: Partial<Record<CurrencyKey, number>>, cls = ''): string {
  return (Object.keys(CURRENCY_ICON) as CurrencyKey[])
    .filter((k) => (amounts[k] ?? 0) > 0)
    .map((k) => currencyAmount(k, amounts[k]!, cls))
    .join('');
}

/** 王国等级 10 格轨道（最后一格是满级属性加成） */
export function levelPipsHtml(level: number): string {
  return Array.from({ length: KINGDOM_MAX_LEVEL }, (_, i) => {
    const lv = i + 1;
    const state = lv <= level ? 'on' : lv === level + 1 ? 'next' : '';
    return `<i class="kh-pip ${state}${lv === KINGDOM_MAX_LEVEL ? ' star' : ''}" title="Lv.${lv}"></i>`;
  }).join('');
}

function masteryChips(kingdom: string, amount: number): string {
  const colors = kingdomMasteryColors(kingdom);
  if (!colors.length || amount <= 0) return '—';
  return colors.map((c) => `<span class="kh-mastery">${gemSvg([c.toLowerCase()])}<b>+${amount}</b></span>`).join('');
}

/** 当前 / 下一级 / 满级 三行收益 */
export function levelPerksHtml(kingdom: string, level: number): string {
  const track = kingdomLevelTrack();
  const now = track[Math.max(0, Math.min(level, KINGDOM_MAX_LEVEL) - 1)]!;
  const next = level < KINGDOM_MAX_LEVEL ? track[level]! : null;
  const stat = STAT_NAME[kingdomBonusStat(kingdom)] ?? '属性';
  const maxed = level >= KINGDOM_MAX_LEVEL;
  return `
    <li class="kh-perk now"><span class="kh-perk-tag">当前 Lv.${level}</span>
      <span>进贡几率 <b>${pct(now.tributeChance)}</b>/时</span>
      <span>产出 <b>×${now.tributeScale.toFixed(1)}</b></span>
      <span class="kh-perk-mastery">精通 ${masteryChips(kingdom, now.mastery)}</span>
    </li>
    ${next ? `<li class="kh-perk next"><span class="kh-perk-tag">下一级 Lv.${next.level}</span>
      <span>几率 <b>${pct(next.tributeChance)}</b></span>
      <span>产出 <b>×${next.tributeScale.toFixed(1)}</b></span>
      <span>精通 <b>+1</b></span>
    </li>` : ''}
    <li class="kh-perk max${maxed ? ' done' : ''}"><span class="kh-perk-tag">Lv.${KINGDOM_MAX_LEVEL} 满级</span>
      <span>全体部队与主角 <b>${stat} +1</b></span>
      <em>${maxed ? '已生效' : `还差 ${KINGDOM_MAX_LEVEL - level} 级`}</em>
    </li>`;
}

/** 本国一次进贡的配比（黄金/灵魂/荣耀）+ 几率 + 主城 */
export function tributeYieldHtml(kingdom: string, level: number, home: boolean, chance: number): string {
  const per = tributeYield(kingdom, level, home);
  const amounts = currencyList({ gold: per.gold, souls: per.souls, glory: per.glory }, 'lg');
  return `<div class="kh-yield-row">${amounts || '<span class="kh-muted">本国不产进贡</span>'}</div>
    <small class="kh-yield-note">每小时 <b>${pct(chance)}</b> 几率进贡一次${home ? ' · <em class="kh-home-x">主城 ×2</em>' : ''}</small>`;
}

export function specialtyTagHtml(kingdom: string): string {
  const s = tributeSpecialtyOf(kingdom);
  const icon = s === 'gold' ? CURRENCY_ICON.gold : s === 'souls' ? CURRENCY_ICON.souls : s === 'glory' ? CURRENCY_ICON.glory : CURRENCY_ICON.gems;
  return `<span class="kh-tag spec-${s}"><img src="${icon}" alt="" draggable="false">${SPECIALTY_NAME[s]}</span>`;
}

// ---------------------------------------------------------------------------
// 宝库（一键收取全部进贡）
// ---------------------------------------------------------------------------

const clock = (ts: number): string => {
  const d = new Date(ts);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
};

/** 宝库总览：大额合计 + 多国同进贡加成 + 逐国明细 */
export function treasuryBodyHtml(t: TributeTreasury, now: number): string {
  const totals = t.totals;
  const ready = t.kingdoms.filter((p) => p.ready);
  const idle = t.kingdoms.filter((p) => !p.ready);
  const bigTotals = (['gold', 'souls', 'glory', 'gems', 'goldKeys'] as CurrencyKey[])
    .map((k) => `<div class="tr-total ${k}${totals[k] > 0 ? '' : ' zero'}">
        <img src="${CURRENCY_ICON[k]}" alt="" draggable="false">
        <b data-count="${totals[k]}">${fmt(totals[k])}</b>
        <small>${CURRENCY_NAME[k]}</small>
      </div>`)
    .join('');
  const bonusRows = t.bonuses.length
    ? t.bonuses.map((b) => `<li><span class="tr-bonus-time">${clock(b.at)}</span>
        <span class="tr-bonus-crests">${b.kingdoms.slice(0, 6).map((k) => crestImg(k)).join('')}${b.kingdoms.length > 6 ? `<i>+${b.kingdoms.length - 6}</i>` : ''}</span>
        <span class="tr-bonus-count">${b.kingdoms.length} 国同时进贡</span>
        <span class="tr-bonus-gain">${currencyList({ gems: b.gems, goldKeys: b.goldKeys })}</span></li>`).join('')
    : `<li class="tr-bonus-empty">这段时间没有两个以上王国在同一小时进贡。开放的王国越多、王国等级越高，越容易触发。</li>`;
  const kingdomRows = ready
    .map((p) => {
      const view = kingdomViewOf(p.kingdom);
      const note = p.overflowing
        ? `<em class="warn">已攒满 ${TRIBUTE.capHours} 小时，超出部分作废</em>`
        : `${p.hours} 小时里进贡 ${p.hits} 次`;
      return `<li class="tr-row${p.home ? ' home' : ''}">
        ${crestImg(p.kingdom)}
        <span class="tr-row-name"><b>${view.name}${p.home ? '<i class="tr-home">主城</i>' : ''}</b><small>${note}</small></span>
        <span class="tr-row-gain">${currencyList({ gold: p.gold, souls: p.souls, glory: p.glory })}</span>
      </li>`;
    })
    .join('');
  const tierHint = TRIBUTE_MULTI_BONUS.map((tier) => `${tier.min} 国 ${tier.gems} 宝石${tier.goldKeys ? `+${tier.goldKeys} 钥匙` : ''}`).join(' · ');
  const nextNote = t.ready
    ? t.overflowing
      ? '有王国已攒满 12 小时，建议现在收取。'
      : `最早 ${clock(t.earliestCapAt)} 攒满 12 小时；现在收也不会吞掉正在累积的小时。`
    : `下一次结算 ${clock(t.nextHourAt)}。`;
  void now;
  return `
    <div class="tr-totals">${bigTotals}</div>
    <p class="tr-note">${nextNote}</p>
    <section class="tr-block">
      <header><b>多国同时进贡</b><small>${tierHint}</small></header>
      <ul class="tr-bonus">${bonusRows}</ul>
    </section>
    <section class="tr-block">
      <header><b>本次进贡的王国 · ${ready.length}</b><small>${idle.length ? `另有 ${idle.length} 国这段时间没有进贡` : '全部开放王国都有进贡'}</small></header>
      <ul class="tr-rows">${kingdomRows || '<li class="tr-bonus-empty">暂时没有王国进贡。</li>'}</ul>
    </section>`;
}

function crestImg(kingdom: string): string {
  const crest = kingdomViewOf(kingdom).crest;
  return crest ? `<img class="tr-crest" src="${crest}" alt="${kingdom}" title="${kingdom}" draggable="false">` : `<span class="tr-crest">${kingdom.slice(0, 1)}</span>`;
}

/** 多国同进贡加成的一句话说明（王国弹层用） */
export function multiBonusHint(): string {
  const three = tributeMultiBonus(3);
  return `宝库一键收取时，同一小时有 2 国以上进贡另给宝石（3 国起加金钥匙，3 国 ${three.gems} 宝石 + ${three.goldKeys} 钥匙）。`;
}
