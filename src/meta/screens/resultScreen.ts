/**
 * 战斗结算屏（GoW 式全屏仪式感版）。
 *
 * 两个视图，同一路由 `#result`：
 * 1. 结算（summary）：「战斗胜利 / 战斗失败」标题 + 星座纹饰 → 来源副题（任务·王国·关卡·进度）
 *    → 横贯全屏的收益条（灵魂 / 经验值+等级条 / 黄金 / 本场宝石）→ 金色「继续」。
 *    只展示本场经验和实际战斗收益（含爬塔区域首领通关材料）；其他首胜、首通、周常及整轮奖励不合并展示。
 * 2. 升级（levelup）：主角本场升级时，「继续」先进入逐级升级页——双翼盾徽 + 等级数字、
 *    本级法力精通二选一（hero.masteryOffers 队首，经网关 pickManaMastery 入账）、
 *    底栏四维（本级提升项绿色高亮）。选定精通后才能继续；多级连升逐页呈现。
 *    该级若有新王国开放（kingdomsUnlockedBetween），在精通提示上方给出徽记 + 王国名。
 *
 * 音乐：挂载即压住氛围 BGM（backgroundMusic 'result' 静音槽），由 resultMusic 单次播放
 * 胜利 / 战败曲；升级页叠加升级号角；离开时淡出并交还氛围 BGM。
 */
import { backgroundMusic } from '../../audio/BackgroundMusic';
import { resultMusic } from '../../audio/ResultMusic';
import { prefersReducedMotion } from '../../preferences/playerPreferences';
import { heroStatsAt, heroXpToNext } from '../data/classes';
import { ALL_KINGDOMS_UNLOCK_LEVEL, kingdomsUnlockedBetween, QUESTS_PER_KINGDOM } from '../data/kingdoms';
import { getTroopById, type TroopData } from '../../data/troops';
import { RARITY_NAMES } from '../data/rarity';
import { temperingBonusOf } from '../systems/hero';
import {
  isManaColor,
  kingdomMasteryBonus,
  MASTERY_HEX,
  MASTERY_NAME,
  surgeChancePct,
  type ManaColor,
} from '../systems/manaMastery';
import { isFailure } from '../gateway';
import type { MetaSave } from '../state/schema';
import { ART, KINGDOM_VIEWS, kingdomViewOf } from './mapData';
import { troopArt } from './teamScreen';
import { escapeHtml } from './troopCard';
import { bottomNavHtml, icon, mountIcons, toast, toastHtml, topbarHtml, $ } from '../shell/chrome';
import type { SettlementView, Screen, ShellCtx } from '../shell/screen';
import { cssUrlVar, resultArt } from '../shell/artAssets';
import { ingotArt, materialImg, scrollArt, stoneMarkupForKey, treasureMapMarkup } from '../shell/materialArt';
import { INGOT_NAMES, stoneName, type IngotKey, type MaterialDelta } from '../data/materials';

const fmt = (n: number): string => n.toLocaleString('en-US');

/** 部队稀有度的唯一玩家口径（普通→神话），与图鉴/编队/宝箱共用六档。 */
export const RESULT_RARITY_NAMES = RARITY_NAMES;
const GENERIC_BATTLE_ART = '/static/map/world-map.webp';

/** 收益条的彩绘货币图标（与顶栏同源的 chrome 素材） */
const CURRENCY_ART = {
  souls: new URL('@assets/chrome/soul.png', import.meta.url).href,
  gold: new URL('@assets/chrome/gold.png', import.meta.url).href,
  gems: new URL('@assets/chrome/gem.png', import.meta.url).href,
  glory: new URL('@assets/chrome/glory.png', import.meta.url).href,
  goldKeys: new URL('@assets/chrome/key.png', import.meta.url).href,
} as const;

/** 结算/升级页彩绘素材（game-assets/bundled/meta/result/，透明底 WebP，随构建打包） */
const art = (name: string): string => resultArt(name);
/** 页面 CSS 里用到的底板图：以 CSS 变量挂到根节点（?raw 注入的 CSS 不改写 url） */
const RESULT_CSS_ART = [
  cssUrlVar('rs-art-continue', resultArt('continue-button')),
  cssUrlVar('rs-art-ribbon', resultArt('levelup-ribbon')),
  cssUrlVar('rs-art-card', resultArt('mastery-card')),
].filter(Boolean).join(';');
const MASTERY_ART: Record<ManaColor, string> = {
  Red: art('mastery-red'),
  Green: art('mastery-green'),
  Blue: art('mastery-blue'),
  Yellow: art('mastery-yellow'),
  Purple: art('mastery-purple'),
  Brown: art('mastery-brown'),
};

export interface TroopRewardView {
  troop: TroopData | null;
  name: string;
  rarityIdx: number;
  rarityName: string;
  art: string;
  note: string;
}

/** 把结算系统的 troopId 转成玩家可读的奖励卡资料，不带攻/护/生等战斗数值。 */
export function troopRewardView(reward: { troopId: number; note: string }): TroopRewardView {
  const troop = getTroopById(reward.troopId) ?? null;
  const rarityIdx = Math.min(Math.max(troop?.rarityIdx ?? 0, 0), RESULT_RARITY_NAMES.length - 1);
  return {
    troop,
    name: troop?.name ?? `未知部队 #${reward.troopId}`,
    rarityIdx,
    rarityName: RESULT_RARITY_NAMES[rarityIdx] ?? RESULT_RARITY_NAMES[0],
    art: troop ? troopArt(troop) : '/static/troops/troop-veteran.webp',
    note: reward.note,
  };
}

/** 结算背景只取王国主题图；竞技场/入侵等非王国来源使用中性世界图。 */
export function resultSummaryArt(kingdom: string): string {
  const view = KINGDOM_VIEWS.find((entry) => entry.name === kingdom);
  if (!view) return GENERIC_BATTLE_ART;
  return ART[view.biome] ?? ART.spire ?? GENERIC_BATTLE_ART;
}

export interface ResultMeta {
  kingdom: string;
  sourceLabel: string;
  /** 战斗来源页（活动战= '#events'）；有值时结算屏提供直达返回 */
  returnHash?: string;
  /** 活动结算页的商店直达入口。 */
  shopHash?: string;
}

/** Only this battle's income. Account/quest/weekly rewards stay in their own views. */
export interface BattleIncomeView {
  victory: boolean;
  xp: number;
  classXp?: number;
  trialClassXpBonus?: number;
  levelsGained: number;
  gold: number;
  souls: number;
  gems: number;
  glory?: number;
  goldKeys?: number;
  /** 本场素材收益（战斗内藏宝图 + 额外奖励素材），与货币卡并列展示 */
  materials: MaterialIncome[];
}

/** 一张素材收益卡：key 为 treasureMaps / forgeScrolls / ingot:<key> / stone:<key> */
export interface MaterialIncome {
  key: string;
  name: string;
  amount: number;
}

/** 本场收益口径：战斗行 + 通用额外奖励（周常/首胜/任务等账户奖励不并入） */
const BATTLE_INCOME_KEYS: readonly string[] = ['kills', 'victory', 'defeat', 'battle-collect', 'battle-bonus', 'tower-boss-clear', 'explore-drop'];

function materialIncome(lines: readonly { mats?: MaterialDelta }[]): MaterialIncome[] {
  const sums = new Map<string, MaterialIncome>();
  const add = (key: string, name: string, n: number | undefined): void => {
    if (!n || n <= 0) return;
    const cur = sums.get(key);
    if (cur) cur.amount += n; else sums.set(key, { key, name, amount: n });
  };
  for (const line of lines) {
    const m = line.mats;
    if (!m) continue;
    add('treasureMaps', '藏宝图', m.treasureMaps);
    add('forgeScrolls', '熔铸符卷', m.forgeScrolls);
    for (const [k, n] of Object.entries(m.ingots ?? {})) add(`ingot:${k}`, INGOT_NAMES[k as IngotKey] ?? k, n);
    for (const [k, n] of Object.entries(m.traitstones ?? {})) add(`stone:${k}`, stoneName(k), n);
  }
  return [...sums.values()];
}

/** 素材卡图标（与背包同源） */
function materialIconHtml(key: string): string {
  if (key === 'burningSouls') return `<span class="regional-flame" style="display:block;width:100%;height:100%;color:#ee985e" aria-hidden="true">${icon('soul')}</span>`;
  if (key === 'treasureMaps') return treasureMapMarkup();
  if (key === 'forgeScrolls') return materialImg(scrollArt());
  if (key.startsWith('ingot:')) return materialImg(ingotArt(key.slice(6)));
  if (key.startsWith('stone:')) return stoneMarkupForKey(key.slice(6));
  return '';
}

export function battleIncomeView(detail: SettlementView): BattleIncomeView {
  if ('kind' in detail && detail.kind === 'hunt') {
    const { grant } = detail;
    return {
      victory: true, xp: 0, levelsGained: 0,
      gold: grant.gold, souls: grant.souls, gems: grant.gems,
      glory: grant.glory, goldKeys: grant.goldKeys,
      materials: materialIncome([{ mats: { traitstones: grant.traitstones } }]),
    };
  }
  if ('kind' in detail) {
    const base = detail.settled.battleRewards;
    const collected = detail.settled.collected;
    return {
      victory: detail.settled.victory,
      xp: base?.xpGained ?? 0,
      levelsGained: base?.heroLevelsGained ?? 0,
      // Invasion's opponent bounty is earned in this match, unlike Arena run prizes.
      gold: (base?.gold ?? 0) + (collected?.gold ?? 0) + (detail.kind === 'invasion' ? detail.settled.gold : 0),
      souls: (base?.souls ?? 0) + (collected?.souls ?? 0),
      gems: collected?.gems ?? 0,
      materials: collected?.maps ? [{ key: 'treasureMaps', name: '藏宝图', amount: collected.maps }] : [],
    };
  }
  const battleLines = detail.lines.filter(line => BATTLE_INCOME_KEYS.includes(line.key));
  const sum = (key: 'gold' | 'souls' | 'gems' | 'glory' | 'goldKeys') =>
    battleLines.reduce((total, line) => total + (line.deltas[key] ?? 0), 0);
  return { victory: detail.victory, xp: detail.xpGained,
    ...(detail.classXpGained ? { classXp: detail.classXpGained } : {}),
    ...(detail.trialClassXpBonus ? { trialClassXpBonus: detail.trialClassXpBonus } : {}),
    levelsGained: detail.heroLevelsGained,
    gold: sum('gold'), souls: sum('souls'), gems: sum('gems'),
    ...(sum('glory') > 0 ? { glory: sum('glory') } : {}),
    ...(sum('goldKeys') > 0 ? { goldKeys: sum('goldKeys') } : {}),
    materials: [...materialIncome(battleLines), ...(detail.burningSouls ? [{ key: 'burningSouls', name: '燃烧灵魂', amount: detail.burningSouls }] : [])] };
}

/**
 * 标题下的来源副题（GoW：任务 - 王国 - 关卡 - 进度）。
 * questsDone：未推进时（战败/重打）仍显示当前王国主线进度。
 */
export function resultSubtitle(
  detail: SettlementView,
  meta: Pick<ResultMeta, 'kingdom' | 'sourceLabel'>,
  questsDone?: number,
): string {
  if ('kind' in detail) {
    if (detail.kind === 'hunt') return `寻宝 · 已走 ${fmt(detail.moves)} 步`;
    if (detail.kind === 'arena') {
      const s = detail.settled;
      return `竞技场 · 战绩 ${s.wins ?? 0} 胜 ${s.losses ?? 0} 负${s.runOver ? ' · 本届已结束' : ''}`;
    }
    return meta.sourceLabel || '入侵';
  }
  const label = meta.sourceLabel.trim();
  const towerClear = detail.lines.find(line => line.key === 'tower-boss-clear');
  if (towerClear) return [label, meta.kingdom, towerClear.label, '已入账'].filter(Boolean).join(' · ');
  const normal = /^NORMAL (\d+)$/.exec(label);
  if (normal) {
    const progress = detail.questProgress?.to ?? questsDone;
    return ['任务', meta.kingdom, `第 ${normal[1]} 关`,
      progress !== undefined ? `进度：${progress}/${QUESTS_PER_KINGDOM}` : '']
      .filter(Boolean).join(' · ');
  }
  if (/^(VERY )?HARD \d+$/.test(label)) {
    return ['探索', meta.kingdom, label.replace('VERY HARD', '非常困难').replace('HARD', '困难')].join(' · ');
  }
  return [label, meta.kingdom].filter(Boolean).join(' · ') || '战斗结束';
}

/** 战前经验（用于经验条从战前涨到战后；数据异常时夹到合法区间）。 */
export function preBattleXp(level: number, xp: number, gained: number, levelsGained: number): { level: number; xp: number } {
  const fromLevel = Math.max(1, level - Math.max(0, levelsGained));
  let spent = 0;
  for (let lv = fromLevel; lv < level; lv++) spent += heroXpToNext(lv);
  const fromXp = Math.min(Math.max(0, xp + spent - gained), heroXpToNext(fromLevel) - 1);
  return { level: fromLevel, xp: fromXp };
}

export type HeroStatKey = 'attack' | 'health' | 'armor' | 'magic';
export interface LevelUpStat { key: HeroStatKey; label: string; value: number; gain: number }

const STAT_ORDER: ReadonlyArray<[HeroStatKey, string]> = [
  ['attack', '攻击'], ['health', '生命'], ['armor', '护甲'], ['magic', '魔法'],
];

/**
 * 升到 level 时的四维与本级增量（含武器淬炼加成，增量只来自等级属性点）。
 * @param classId 已装备职业（提供官方基底）；缺省走无职业兜底基底
 */
export function levelUpStats(
  level: number,
  bonus: Partial<Record<HeroStatKey, number>> = {},
  classId: string | null = null,
): LevelUpStat[] {
  const now = heroStatsAt(level, classId);
  const before = heroStatsAt(Math.max(1, level - 1), classId);
  return STAT_ORDER.map(([key, label]) => ({
    key, label, value: now[key] + (bonus[key] ?? 0), gain: Math.max(0, now[key] - before[key]),
  }));
}

/** 升级页要逐页呈现的等级（本场升级的每一级） */
export function levelUpSequence(level: number, levelsGained: number): number[] {
  const gained = Math.max(0, Math.min(levelsGained, level - 1));
  return Array.from({ length: gained }, (_, i) => level - gained + 1 + i);
}

/** 本级待分配的法力精通二选一（存档队首）；没有待分配点数时为 null */
export function pendingMasteryOffer(save: Pick<MetaSave, 'hero'>): [ManaColor, ManaColor] | null {
  const offer = save.hero.masteryOffers?.[0];
  return offer && isManaColor(offer[0]) && isManaColor(offer[1]) ? offer : null;
}

/** 稳定伪随机（粒子布局用；同一场景每次一致，截图可复现） */
const hash01 = (i: number, k: number): number => {
  const v = Math.sin(i * 12.9898 + k * 78.233) * 43758.5453;
  return v - Math.floor(v);
};

export class ResultScreen implements Screen {
  private ctx!: ShellCtx;
  private detail: SettlementView | null = null;
  private meta: ResultMeta = { kingdom: '', sourceLabel: '' };
  private listeners: Array<[EventTarget, string, EventListenerOrEventListenerObject]> = [];
  private frames = new Set<number>();
  private summaryResize: ResizeObserver | null = null;
  private levels: number[] = [];
  private levelIndex = 0;
  private levelUpDone = false;
  private selected: ManaColor | null = null;
  private busy = false;

  setDetail(detail: SettlementView, meta: ResultMeta): void {
    this.detail = detail;
    this.meta = meta;
    this.levelUpDone = false;
  }

  html(): string {
    return `${topbarHtml()}
      <main class="screen result-screen" data-view="summary" style='${RESULT_CSS_ART}'>
        <div class="rs-art" id="summaryArt" hidden><img id="sumArt" alt="" decoding="async"></div>
        <div class="rs-shade" aria-hidden="true"></div>
        <div class="rs-particles" id="rsParticles" aria-hidden="true"></div>

        <section class="rs-summary" id="resultSummary" aria-labelledby="resultTitle">
          <div class="rs-summary-content" id="resultScroll" tabindex="0" role="region" aria-label="结算奖励">
          <header class="rs-banner">
            <div class="rs-banner-art" aria-hidden="true"><img src="${art('title-astrolabe')}" alt="" draggable="false"></div>
            <h1 id="resultTitle">暂无战报</h1>
          </header>
          <div class="rs-rule" aria-hidden="true"></div>
          <p class="rs-sub" id="resultSub">完成一场战斗后，这里会显示本场收益。</p>
          <div class="rs-strip" id="standardRewards" hidden>
            <div class="rs-rewards" id="rewardRows"></div>
          </div>
          </div>
          <button class="rs-scroll-more" id="resultScrollMore" type="button" hidden>向下查看其余奖励 ↓</button>
          <footer class="rs-footer result-actions">
            <button class="rs-ghost" id="team" type="button" hidden>调整队伍</button>
            <button class="rs-continue" id="again" type="button"><span>去世界地图</span></button>
          </footer>
        </section>

        <section class="rs-levelup" id="levelUp" hidden aria-labelledby="levelUpTitle">
          <div class="lu-rays" aria-hidden="true"></div>
          <div class="lu-emblem">
            <img class="lu-emblem-art" src="${art('levelup-emblem')}" alt="" draggable="false">
            <b class="lu-level" id="luLevel" aria-label="新等级">2</b>
            <div class="lu-ribbon"><h2 id="levelUpTitle">等级提升</h2></div>
          </div>
          <div class="lu-band" id="luBand">
            <p class="lu-unlock" id="luUnlock" role="status" hidden></p>
            <p class="lu-prompt" id="luPrompt"><b>选择一项法力精通</b><small id="luPromptNote"></small></p>
            <div class="lu-choices" id="luChoices"></div>
          </div>
          <footer class="lu-footer">
            <div class="lu-stats" id="luStats" aria-label="主角属性"></div>
            <button class="rs-continue" id="luContinue" type="button"><span>继续</span></button>
          </footer>
          <small class="lu-step" id="luStep" hidden></small>
        </section>
      </main>
      ${bottomNavHtml('', '')}${toastHtml()}`;
  }

  mount(ctx: ShellCtx): void {
    this.ctx = ctx;
    this.busy = false;
    backgroundMusic.setDucking('result', true);
    this.bind('#again', () => this.continueFromSummary());
    this.bind('#team', () => ctx.navigate(this.isHunt() ? '#map' : '#team'));
    this.bind('#luContinue', () => void this.continueFromLevelUp());
    this.bind('#luChoices', (e) => {
      const card = (e.target as HTMLElement).closest<HTMLElement>('[data-mastery-color]');
      if (card?.dataset.masteryColor) this.select(card.dataset.masteryColor);
    });
    this.paint();
    const scroll = $('#resultScroll');
    const updateScrollHint = () => {
      const hint = $('#resultScrollMore');
      const overflow = scroll.scrollHeight > scroll.clientHeight + 2;
      hint.hidden = !overflow;
      const atEnd = scroll.scrollTop + scroll.clientHeight >= scroll.scrollHeight - 2;
      hint.classList.toggle('is-at-end', atEnd);
      (hint as HTMLButtonElement).disabled = atEnd;
    };
    scroll.addEventListener('scroll', updateScrollHint, { passive: true });
    this.listeners.push([scroll, 'scroll', updateScrollHint]);
    this.bind('#resultScrollMore', () => scroll.scrollBy({
      top: scroll.clientHeight * 0.75, behavior: prefersReducedMotion() ? 'instant' : 'smooth',
    }));
    this.summaryResize = new ResizeObserver(updateScrollHint);
    this.summaryResize.observe(scroll);
    this.summaryResize.observe($('#rewardRows'));
    updateScrollHint();
    if (this.detail) resultMusic.play(battleIncomeView(this.detail).victory ? 'victory' : 'defeat');
  }

  private isHunt(): boolean {
    return !!this.detail && 'kind' in this.detail && this.detail.kind === 'hunt';
  }

  private returnLabel(): string {
    const hash = this.meta.returnHash;
    if (this.detail && 'kind' in this.detail && this.detail.kind === 'arena' && !this.detail.settled.runOver) return '继续竞技场';
    if (!hash || hash === '#map') return '返回地图';
    if (hash.startsWith('#events')) return '返回活动页';
    if (hash === '#hunt') return '返回寻宝';
    if (hash === '#arena') return '返回竞技场';
    if (hash === '#invasion') return '返回入侵页';
    return '返回来源页';
  }

  // -------------------------------------------------------------------------
  // 结算视图
  // -------------------------------------------------------------------------

  private paint(): void {
    const detail = this.detail;
    const screen = $('.result-screen');
    screen.classList.toggle('is-empty', !detail);
    screen.classList.remove('is-victory', 'is-defeat', 'is-pvp');
    screen.dataset.view = 'summary';
    $('#standardRewards').hidden = !detail;
    $('#summaryArt').hidden = !detail;
    $('#team').hidden = !detail;
    $('#team').textContent = this.isHunt() ? '返回地图' : '调整队伍';
    $('#rewardRows').replaceChildren();
    screen.classList.remove('has-many-rewards');
    const image = $('#sumArt') as HTMLImageElement;
    const again = $('#again');
    if (!detail) {
      image.removeAttribute('src');
      $('#resultTitle').textContent = '暂无战报';
      $('#resultSub').textContent = '完成一场战斗后，这里会显示本场收益。';
      again.innerHTML = '<span>去世界地图</span>';
      again.removeAttribute('aria-label');
      return;
    }
    image.src = resultSummaryArt(this.meta.kingdom);
    const income = battleIncomeView(detail);
    const surrendered = 'kind' in detail && detail.kind !== 'hunt' && detail.battle.endReason === 'surrender';
    screen.classList.add(income.victory ? 'is-victory' : 'is-defeat');
    screen.classList.toggle('is-pvp', 'kind' in detail && detail.kind !== 'hunt');
    const title = this.isHunt() ? '寻宝收获' : surrendered ? '已放弃' : income.victory ? '战斗胜利' : '战斗失败';
    $('#resultTitle').innerHTML = [...title].map((ch, i) => `<span style="--c:${i}">${ch}</span>`).join('');
    const save = this.ctx.save();
    $('#resultSub').textContent = resultSubtitle(detail, this.meta, save.kingdoms?.[this.meta.kingdom]?.questsDone ?? 0);
    again.innerHTML = this.isHunt() ? '<span>返回寻宝</span>' : '<span>继续</span>';
    again.setAttribute('aria-label', income.levelsGained > 0 ? '继续：查看等级提升' : `继续：${this.returnLabel()}`);
    again.title = income.levelsGained > 0 ? '查看等级提升' : this.returnLabel();

    const hero = save.hero;
    const need = heroXpToNext(hero.level);
    const rewards: Array<{ key: keyof typeof CURRENCY_ART; name: string; amount: number }> = [
      { key: 'souls', name: '灵魂', amount: income.souls },
      { key: 'gold', name: '黄金', amount: income.gold },
      // No empty gem card, fake gem roll, or aggregate of the whole account's gains.
      { key: 'gems', name: '宝石', amount: income.gems },
      { key: 'glory', name: '荣耀', amount: income.glory ?? 0 },
      { key: 'goldKeys', name: '金钥匙', amount: income.goldKeys ?? 0 },
    ];
    const currency = (r: (typeof rewards)[number], i: number) =>
      `<div class="rs-reward reward-row" data-battle-currency="${r.key}" style="--i:${i}">
        <span class="rs-reward-icon"><img src="${CURRENCY_ART[r.key]}" alt="" draggable="false"></span>
        <p><strong data-count="${r.amount}">+${fmt(r.amount)}</strong><span>${r.name}</span></p>
      </div>`;
    const xp = `<div class="rs-reward rs-xp" id="standardXp" style="--i:1">
        <span class="rs-reward-icon"><img src="${art('xp-icon')}" alt="" draggable="false"></span>
        <p><strong id="xpGain" data-count="${income.xp}">+${fmt(income.xp)}</strong><span>经验值</span></p>
        <div class="rs-level" role="progressbar" aria-label="主角经验" aria-valuemin="0"
          aria-valuemax="${need}" aria-valuenow="${hero.xp}">
          <i id="xpFill" style="width:${Math.min(100, hero.xp / need * 100)}%"></i>
          <b id="xpLevel">等级 ${hero.level}</b>
        </div>
        <small id="xpNote">${income.levelsGained > 0 ? `提升 ${income.levelsGained} 级 · ` : ''}${fmt(hero.xp)} / ${fmt(need)}</small>
        ${income.levelsGained > 0 ? '<em class="rs-levelup-tag">升级</em>' : ''}
      </div>`;
    const [souls, gold, ...extras] = rewards;
    const classXp = (income.classXp ?? 0) > 0 ? `<div class="rs-reward reward-row rs-class-xp" data-battle-class-xp style="--i:3">
        <span class="rs-reward-icon"><span data-icon="book"></span></span>
        <p><strong data-count="${income.classXp}">+${fmt(income.classXp ?? 0)}</strong><span>职业经验</span>${income.trialClassXpBonus ? `<small>试炼奖励 +${fmt(income.trialClassXpBonus)}</small>` : ''}</p>
      </div>` : '';
    const matCards = income.materials.map((m, i) =>
      `<div class="rs-reward reward-row rs-mat" data-battle-material="${escapeHtml(m.key)}" style="--i:${6 + i}">
        <span class="rs-reward-icon">${materialIconHtml(m.key)}</span>
        <p><strong data-count="${m.amount}">+${fmt(m.amount)}</strong><span>${escapeHtml(m.name)}</span></p>
      </div>`);
    $('#rewardRows').innerHTML = [
      currency(souls!, 0), this.isHunt() ? '' : xp, currency(gold!, 2), classXp,
      ...extras.filter(r => r.amount > 0).map((r, i) => currency(r, 3 + i)), ...matCards,
    ].join('');
    mountIcons($('#rewardRows'));
    screen.classList.toggle('has-many-rewards', $('#rewardRows').childElementCount > 4);
    this.particles(income.victory);
    this.animateSummary(income);
  }

  /** 胜利：上升的余烬；战败：缓落的灰烬。 */
  private particles(victory: boolean): void {
    const host = $('#rsParticles');
    if (!host) return;
    const count = victory ? 26 : 18;
    host.innerHTML = Array.from({ length: count }, (_, i) => {
      const x = (hash01(i, 1) * 100).toFixed(1);
      const size = (2 + hash01(i, 2) * (victory ? 4 : 3)).toFixed(1);
      const dur = (victory ? 7 : 11) + hash01(i, 3) * 6;
      const delay = -hash01(i, 4) * dur;
      const drift = ((hash01(i, 5) - 0.5) * 120).toFixed(0);
      return `<i style="--x:${x}%;--s:${size}px;--d:${dur.toFixed(1)}s;--delay:${delay.toFixed(1)}s;--drift:${drift}px"></i>`;
    }).join('');
  }

  private animateSummary(income: BattleIncomeView): void {
    const reduced = prefersReducedMotion();
    const screen = $('.result-screen');
    screen.classList.remove('is-entering');
    if (reduced) return;
    void screen.offsetWidth;
    screen.classList.add('is-entering');
    document.querySelectorAll<HTMLElement>('#rewardRows [data-count]').forEach((el, i) => {
      this.countUp(el, Number(el.dataset.count) || 0, 900 + i * 180);
    });
    this.animateXp(income);
  }

  private countUp(el: HTMLElement, to: number, delay: number): void {
    if (to <= 0) return;
    const duration = 900;
    // 不预先写 '+0'：首帧（p=0）自然归零；若 rAF 被节流/挂起，仍保留最终数值而非卡在 0。
    // 入场动画期间奖励块透明，首帧之前不会闪出终值。
    const begin = performance.now() + delay;
    const step = (now: number) => {
      const p = Math.min(1, Math.max(0, (now - begin) / duration));
      const eased = 1 - (1 - p) ** 3;
      el.textContent = `+${fmt(Math.round(to * eased))}`;
      if (p < 1) this.frame(step);
    };
    this.frame(step);
  }

  /** 经验条从战前涨到战后，跨级时满格翻页并闪光。 */
  private animateXp(income: BattleIncomeView): void {
    const hero = this.ctx.save().hero;
    const fill = $('#xpFill');
    const label = $('#xpLevel');
    const bar = fill?.parentElement;
    if (!fill || !label || !bar || income.xp <= 0) return;
    const start = preBattleXp(hero.level, hero.xp, income.xp, income.levelsGained);
    const segs: Array<{ level: number; from: number; to: number }> = [];
    let lv = start.level;
    let from = start.xp / heroXpToNext(lv);
    for (let k = 0; k < hero.level - start.level; k++) {
      segs.push({ level: lv, from, to: 1 });
      lv += 1;
      from = 0;
    }
    segs.push({ level: hero.level, from, to: hero.xp / heroXpToNext(hero.level) });
    const spans = segs.map((s) => Math.max(0.05, s.to - s.from));
    const total = spans.reduce((a, b) => a + b, 0);
    const duration = 700 + 450 * segs.length;
    const begin = performance.now() + 1100;
    let shownLevel = segs[0]!.level;
    fill.style.width = `${(segs[0]!.from * 100).toFixed(2)}%`;
    label.textContent = `等级 ${shownLevel}`;
    const step = (now: number) => {
      const p = Math.min(1, Math.max(0, (now - begin) / duration));
      let acc = p * total;
      let idx = 0;
      while (idx < segs.length - 1 && acc > spans[idx]!) { acc -= spans[idx]!; idx++; }
      const seg = segs[idx]!;
      const local = Math.min(1, acc / spans[idx]!);
      fill.style.width = `${Math.min(100, (seg.from + (seg.to - seg.from) * local) * 100).toFixed(2)}%`;
      if (seg.level !== shownLevel) {
        shownLevel = seg.level;
        label.textContent = `等级 ${shownLevel}`;
        bar.classList.remove('is-flash');
        void bar.offsetWidth;
        bar.classList.add('is-flash');
      }
      if (p < 1) this.frame(step);
    };
    this.frame(step);
  }

  private continueFromSummary(): void {
    const detail = this.detail;
    if (!detail) { this.ctx.navigate('#map'); return; }
    const income = battleIncomeView(detail);
    const levels = levelUpSequence(this.ctx.save().hero.level, income.levelsGained);
    if (!this.levelUpDone && levels.length > 0) {
      this.levels = levels;
      this.levelIndex = 0;
      this.showLevelUp();
      return;
    }
    this.exit();
  }

  private exit(): void {
    this.ctx.navigate(this.meta.returnHash ?? '#map');
  }

  // -------------------------------------------------------------------------
  // 升级视图
  // -------------------------------------------------------------------------

  private showLevelUp(): void {
    const level = this.levels[this.levelIndex]!;
    const screen = $('.result-screen');
    screen.dataset.view = 'levelup';
    $('#resultSummary').hidden = true;
    $('#levelUp').hidden = false;
    $('#luLevel').textContent = String(level);
    $('#luLevel').classList.toggle('is-wide', level >= 100);
    const step = $('#luStep');
    step.hidden = this.levels.length < 2;
    step.textContent = `${this.levelIndex + 1} / ${this.levels.length}`;
    this.selected = null;
    this.renderChoices();
    this.renderStats(level);
    this.renderUnlock(level);
    const section = $('#levelUp');
    section.classList.remove('is-entering');
    if (!prefersReducedMotion()) {
      void section.offsetWidth;
      section.classList.add('is-entering');
    }
    resultMusic.levelUp();
    $('#luContinue').focus({ preventScroll: true });
  }

  private offer(): [ManaColor, ManaColor] | null {
    return pendingMasteryOffer(this.ctx.save());
  }

  private renderChoices(): void {
    const save = this.ctx.save();
    const offer = this.offer();
    const band = $('#luBand');
    band.classList.toggle('is-done', !offer);
    const pending = save.hero.masteryOffers?.length ?? 0;
    const forced = offer?.[0] === offer?.[1];
    $('#luPrompt').querySelector('b')!.textContent = offer ? '选择一项法力精通' : '法力精通已全部分配';
    $('#luPromptNote').textContent = offer
      ? `${forced ? '优先补齐落后颜色' : '二选一'} · 永久提升该色三消涌动几率，并计入武器解锁${pending > 1 ? ` · 待分配 ${pending} 点` : ''}`
      : '可随时在英雄页查看精通与涌动几率';
    if (!offer) {
      $('#luChoices').innerHTML = '';
      this.syncContinue();
      return;
    }
    const bonus = kingdomMasteryBonus(save);
    const card = (color: ManaColor, i: number) => {
      const mine = Math.max(0, Math.floor(save.hero.manaMastery?.[color] ?? 0));
      const extra = bonus[color] ?? 0;
      return `<button type="button" class="lu-card" data-mastery-color="${color}" aria-pressed="false"
          style="--mc:${MASTERY_HEX[color]};--i:${i}">
          <span class="lu-card-frame"><span class="lu-card-face">
            <img class="lu-card-orb" src="${MASTERY_ART[color]}" alt="" draggable="false">
            <span class="lu-card-check" aria-hidden="true"></span>
          </span></span>
          <b>+1 ${MASTERY_NAME[color]}</b>
          <small><span>总精通 ${mine + extra} → ${mine + extra + 1}${extra ? `（王国 +${extra}）` : ''}</span><span>三消涌动 ${surgeChancePct(mine + extra)} → ${surgeChancePct(mine + 1 + extra)}</span></small>
        </button>`;
    };
    $('#luChoices').innerHTML = `${card(offer[0], 0)}${forced ? '' : `<span class="lu-or" aria-hidden="true"><span>或</span></span>${card(offer[1], 1)}`}`;
    this.syncContinue();
  }

  /** 这一级新开放的王国（每级约 1 个，Lv.42 全开）：徽记 + 名字，提示回地图看迷雾散开 */
  private renderUnlock(level: number): void {
    const el = $('#luUnlock');
    const opened = kingdomsUnlockedBetween(level - 1, level);
    el.hidden = opened.length === 0;
    if (!opened.length) {
      el.innerHTML = '';
      return;
    }
    const crest = (k: string): string => {
      const src = kingdomViewOf(k).crest;
      return src
        ? `<img class="lu-unlock-crest" src="${src}" alt="" draggable="false">`
        : `<span class="lu-unlock-crest is-text" aria-hidden="true">${escapeHtml(k.slice(0, 1))}</span>`;
    };
    el.innerHTML = `<span class="lu-unlock-tag">新王国开放</span>${opened.map((k) =>
      `<span class="lu-unlock-kingdom">${crest(k)}<b>${escapeHtml(k)}</b></span>`).join('')}
      <small>${level >= ALL_KINGDOMS_UNLOCK_LEVEL ? '全部王国已开放' : '地图迷雾已散开'}</small>`;
  }

  private renderStats(level: number): void {
    const save = this.ctx.save();
    const bonus = temperingBonusOf(save);
    $('#luStats').innerHTML = levelUpStats(level, bonus, save.hero.classId).map((s) =>
      `<div class="lu-stat${s.gain > 0 ? ' is-up' : ''}" data-stat="${s.key}" title="${s.label}">
        <img class="lu-stat-icon" src="${art(`stat-${s.key}`)}" alt="" draggable="false">
        <b>${s.value}</b>
        ${s.gain > 0 ? `<em><span class="lu-chevrons" data-icon="chevrons"></span>+${s.gain}</em>` : ''}
        <span class="sr-only">${s.label}${s.gain > 0 ? `，本级提升 ${s.gain}` : ''}</span>
      </div>`).join('');
    mountIcons($('#luStats'));
  }

  private select(color: string): void {
    if (this.busy || !isManaColor(color)) return;
    const offer = this.offer();
    if (!offer || (offer[0] !== color && offer[1] !== color)) return;
    this.selected = color;
    document.querySelectorAll<HTMLElement>('#luChoices [data-mastery-color]').forEach((el) => {
      const on = el.dataset.masteryColor === color;
      el.setAttribute('aria-pressed', String(on));
      el.classList.toggle('is-selected', on);
      el.classList.toggle('is-dimmed', !on);
    });
    $('#luBand').classList.remove('needs-pick');
    this.syncContinue();
  }

  private syncContinue(): void {
    const button = $('#luContinue');
    const blocked = !!this.offer() && !this.selected;
    button.classList.toggle('is-blocked', blocked);
    button.setAttribute('aria-disabled', String(blocked));
    const last = this.levelIndex >= this.levels.length - 1;
    button.setAttribute('aria-label', blocked ? '请先选择一项法力精通' : last ? `继续：${this.returnLabel()}` : '继续：下一次等级提升');
  }

  private async continueFromLevelUp(): Promise<void> {
    if (this.busy) return;
    const offer = this.offer();
    if (offer && !this.selected) {
      const band = $('#luBand');
      band.classList.remove('needs-pick');
      void band.offsetWidth;
      band.classList.add('needs-pick');
      toast('请先选择一项法力精通');
      return;
    }
    if (offer && this.selected) {
      this.busy = true;
      $('#luContinue').classList.add('is-busy');
      try {
        const { result } = await this.ctx.gateway.pickManaMastery(this.selected);
        if (isFailure(result)) {
          toast(result.message);
          this.renderChoices();
          return;
        }
        this.ctx.refreshChrome();
      } finally {
        this.busy = false;
        $('#luContinue')?.classList.remove('is-busy');
      }
    }
    if (this.levelIndex < this.levels.length - 1) {
      this.levelIndex += 1;
      this.showLevelUp();
      return;
    }
    this.levelUpDone = true;
    this.exit();
  }

  // -------------------------------------------------------------------------

  private frame(fn: FrameRequestCallback): void {
    const id = requestAnimationFrame((t) => { this.frames.delete(id); fn(t); });
    this.frames.add(id);
  }

  private bind(selector: string, fn: EventListener): void {
    const el = $(selector);
    if (!el) return;
    el.addEventListener('click', fn);
    this.listeners.push([el, 'click', fn]);
  }

  dispose(): void {
    for (const id of this.frames) cancelAnimationFrame(id);
    this.frames.clear();
    this.summaryResize?.disconnect();
    this.summaryResize = null;
    resultMusic.stop(0.9);
    backgroundMusic.finishResult();
    for (const [target, type, fn] of this.listeners.splice(0)) target.removeEventListener(type, fn);
  }
}
