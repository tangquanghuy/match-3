/**
 * 入侵 PvP 屏（素材批 2026-09-19）——排位官网阶/每周 VP/镜像对手一览。
 * 榜单与候选都是纯函数读模型（systems/invasion）；出战与结算走网关 +
 * launchInvasionBattle（结算 toast 汇报 VP/荣耀/名次），跨周 lazy 周结在网关方法里触发。
 */
import { INVASION, INVASION_LEAGUES, INVASION_VP_TABLE, INVASION_ZONES } from '../data/economy';
import { RARITY_NAMES as RARITY_CN } from '../data/rarity';
import { getTroopById } from '../../data/troops';
import {
  invasionCandidates,
  invasionStandings,
  type StandingRow,
} from '../systems/invasion';
import { weekStartOf } from '../gateway';
import { bottomNavHtml, toastHtml, topbarHtml, $$ } from '../shell/chrome';
import type { Screen, ShellCtx } from '../shell/screen';
import type { MetaSave } from '../state/schema';
import { troopImg } from './teamScreen';

/** 联赛徽章色（与稀有度色系对齐的官阶梯度） */
const LEAGUE_COLORS = [
  '#9a8f86', '#c0c7ce', '#e6b84c', '#67c1b5', '#4fb06d',
  '#4f8fd0', '#9a6fd0', '#d09a4f', '#d04f5f', '#e8d24a',
] as const;
const LEAGUE_ICONS = ['helmet', 'helmet', 'swords', 'swords', 'wing', 'wing', 'banner', 'banner', 'crown', 'crown'] as const;
const TIER_CN: Record<string, string> = { minion: '普通', elite: '精英', boss: '首领' };

function leagueEmblem(index: number, extraClass = ''): string {
  return `<span class="inv-rank-emblem ${extraClass}" style="--rank-color:${LEAGUE_COLORS[index] ?? LEAGUE_COLORS[0]}" role="img" aria-label="${INVASION_LEAGUES[index] ?? INVASION_LEAGUES[0]}官阶徽记"><span data-icon="${LEAGUE_ICONS[index] ?? 'helmet'}"></span></span>`;
}

function expectedVpRange(defense: readonly { level: number }[], frenzy: boolean): [number, number] {
  const average = defense.reduce((sum, d) => sum + d.level, 0) / Math.max(defense.length, 1);
  const row = INVASION_VP_TABLE.find((entry) => average <= entry.maxLevel) ?? INVASION_VP_TABLE[INVASION_VP_TABLE.length - 1]!;
  const multiplier = frenzy ? 2 : 1;
  return [row.min * multiplier, row.max * multiplier];
}

/**
 * 推荐目标只表达「预估收益 / 防守评分」的相对值，不改变匹配或结算规则。
 * 分数相同保留原候选池的先后顺序；推荐目标在手机轮播中优先展示。
 */
function targetValueOf(target: { defense: readonly { level: number }[]; frenzy: boolean; rating: number }): number {
  const [min, max] = expectedVpRange(target.defense, target.frenzy);
  return ((min + max) / 2) / Math.max(target.rating, 1);
}

function promotionProgress(
  league: number,
  placement: number,
  zone: { promote: number; relegate: number },
): { headline: string; note: string; tone: 'up' | 'behind' | 'top' } {
  if (league === INVASION_LEAGUES.length - 1) {
    return { headline: `第 ${placement}`, note: '最高官阶 · 不再晋级', tone: 'top' };
  }
  if (placement <= zone.promote) {
    return { headline: `第 ${placement}`, note: `已在晋级区 · 前 ${zone.promote} 名晋级`, tone: 'up' };
  }
  return {
    headline: `第 ${placement}`,
    note: `还差 ${placement - zone.promote} 名进入前 ${zone.promote}`,
    tone: 'behind',
  };
}

function nextRefreshText(now: number): string {
  const next = new Date(now);
  next.setHours(24, 0, 0, 0);
  const mins = Math.max(1, Math.ceil((next.getTime() - now) / 60_000));
  const hours = Math.floor(mins / 60);
  const rest = mins % 60;
  return `约 ${hours} 小时 ${String(rest).padStart(2, '0')} 分钟后`;
}

function playerSummary(save: MetaSave): string {
  const team = save.teams[save.activeTeamIndex];
  if (!team || team.members.length === 0) return '<span class="inv-summary-empty">尚未编入队伍</span>';
  const levels: number[] = [];
  let hero = false;
  for (const member of team.members) {
    if (member.kind === 'hero') {
      hero = true;
      levels.push(save.hero.level);
      continue;
    }
    const troop = getTroopById(member.troopId);
    if (!troop) continue;
    const rec = save.collection[String(member.troopId)];
    levels.push(rec?.level ?? 1);
  }
  const average = levels.length ? (levels.reduce((sum, level) => sum + level, 0) / levels.length).toFixed(1) : '—';
  return `<span>${team.members.length} 人${hero ? ' · 含主角' : ''}</span><span>平均 Lv.${average}</span>`;
}

/**
 * I-1：晋级/降级口径。`relegate === 0` 有两种含义——**本级是底层**（青铜，无降级区）
 * 与**本级是顶端**（钻石，promote 也为 0）。此前一句话把两者混成「顶端联赛只升不降」，
 * 青铜玩家第一眼就被告知自己打到头了。这里按 league 位置分开成句。
 */
function zoneText(league: number, leagueName: string): string {
  const zone = INVASION_ZONES[league]!;
  const isTop = league === INVASION_LEAGUES.length - 1;
  if (isTop) return `<b>${leagueName}</b> 是最高官阶：本周名次不再晋级${zone.relegate > 0 ? `，<b>第 ${zone.relegate} 名以后</b> 降级` : '，也不会降级'}。`;
  const promote = `本周名次 <b>前 ${zone.promote}</b> 晋级`;
  if (zone.relegate > 0) return `${promote} · <b>第 ${zone.relegate} 名以后</b> 降级。`;
  return `${promote} · <b>${leagueName}</b> 是最低官阶，不会降级。`;
}

/** VP 基础分区间（取官方表首末段的 base），例：`10~50` */
function vpBaseRangeText(): string {
  const first = INVASION_VP_TABLE[0]!;
  const last = INVASION_VP_TABLE[INVASION_VP_TABLE.length - 1]!;
  return `${first.base}~${last.base}`;
}

/**
 * I-2：此前公示的「4 消加分」在合同层拿不到（`eventSummary` 只有类型计数，
 * `TASK-META §6` 开放问题 2 已登记），而系统真正结算的是速胜/存活/额外回合三项。
 * 这里整词删除「4 消」，并把三张官方表的真实数值直接派生成文案。
 */
const VP_BONUS_TEXT = [
  `速胜 ≤${INVASION.speedBonuses.map((b) => b.maxTurns).join('/')} 回合 +${INVASION.speedBonuses.map((b) => b.bonus).join('/+')}`,
  `存活 ${INVASION.survivorBonuses.map((b) => b.survivors).join('/')} 人 +${INVASION.survivorBonuses.map((b) => b.bonus).join('/+')}`,
  `额外回合 ${INVASION.extraTurnBonuses.map((b) => b.count).join('/')} 次 +${INVASION.extraTurnBonuses.map((b) => b.bonus).join('/+')}`,
].join('、');

export class InvasionScreen implements Screen {
  private listeners: Array<[EventTarget, string, EventListenerOrEventListenerObject]> = [];

  html(ctx: ShellCtx, param?: string): string {
    const save = ctx.save();
    const now = Date.now();
    const weekStart = weekStartOf(now);
    const locked = save.hero.level < INVASION.unlockHeroLevel;

    if (locked) {
      return `
        ${topbarHtml()}
        <div class="screen inv-screen">
          <section class="panel inv-panel inv-locked">
            <div class="inv-lock-layout">
              <div class="inv-lock-hero">
                <div class="inv-lock-sigil" aria-hidden="true">
                  <i class="inv-lock-orbit orbit-a"></i><i class="inv-lock-orbit orbit-b"></i>
                  <div class="inv-lock-emblem"><span data-icon="skull"></span><i data-icon="lock"></i></div>
                </div>
                <h1>入 侵</h1>
                <p class="inv-lock-intro">与其他指挥官的防守镜像对战，赢取荣耀与官阶。</p>
                <span class="inv-lock-rule" aria-hidden="true"></span>
              </div>
              <div class="inv-lock-command">
                <div class="inv-lock-command-head">
                  <h2>官阶战场尚未开放</h2>
                  <p>先提升主角等级，解锁排位入侵。</p>
                </div>
                <div class="inv-lock-status" aria-label="入侵解锁进度">
                  <span data-icon="lock" aria-hidden="true"></span>
                  <div><small>解锁条件</small><b>主角 Lv.${INVASION.unlockHeroLevel}</b></div>
                  <div class="inv-lock-level"><span>当前 Lv.${save.hero.level}</span><i aria-hidden="true"><em style="width:${Math.min(100, (save.hero.level / INVASION.unlockHeroLevel) * 100)}%"></em></i></div>
                </div>
                <p class="inv-lock-hint"><b>主角经验来源</b>：完成王国任务与探索战斗，在胜利结算中获得经验。</p>
                <button class="primary inv-map-cta" id="invMapCta" type="button"><span data-icon="map" aria-hidden="true"></span><span>去世界地图打任务</span><span data-icon="arrow" aria-hidden="true"></span></button>
              </div>
              <div class="inv-lock-preview">${leagueEmblem(0)}<span><small>解锁后的起点</small><b>青铜官阶</b></span><span class="inv-lock-preview-note">每周凭对战积分争取晋级</span></div>
            </div>
          </section>
        </div>
        ${bottomNavHtml('', '官阶=每周 VP 联赛')}
        ${toastHtml()}`;
    }

    const leagueName = INVASION_LEAGUES[save.invasion.league]!;
    const standings = invasionStandings(save, now, weekStart);
    const zone = INVASION_ZONES[save.invasion.league]!;
    const candidates = invasionCandidates(save, now, weekStart);
    const recommendedId = candidates.length
      ? candidates.reduce((best, candidate) => (targetValueOf(candidate) > targetValueOf(best) ? candidate : best)).id
      : '';
    const orderedCandidates = [...candidates].sort((a, b) => Number(b.id === recommendedId) - Number(a.id === recommendedId));
    const promotion = promotionProgress(save.invasion.league, standings.placement, zone);

    const candidateRows = orderedCandidates
      .map((m, index) => {
        const [vpMin, vpMax] = expectedVpRange(m.defense, m.frenzy);
        const recommended = m.id === recommendedId;
        const defense = m.defense
          .map((d) => {
            const troop = getTroopById(d.troopId);
            if (!troop) return '';
            return `<span class="inv-def r-${troop.rarityIdx}" title="${troop.name} · ${RARITY_CN[troop.rarityIdx] ?? ''} · ${TIER_CN[d.tier] ?? d.tier} · Lv.${d.level}">
              ${troopImg(troop, false, `alt="${troop.name}"`)}
              <span class="inv-def-caption"><b>${troop.name}</b><small>${TIER_CN[d.tier] ?? d.tier} · Lv.${d.level}</small></span>
            </span>`;
          })
          .join('');
        return `
          <article class="inv-rival${m.frenzy ? ' frenzy' : ''}${recommended ? ' recommended' : ''}">
            <div class="inv-rival-head">
              <small>对手 ${String(index + 1).padStart(2, '0')}${recommended ? ' · 推荐' : ''}</small>
              <h3 class="inv-rival-name">${m.name}</h3>
              <span class="inv-rival-nums">防守评分 ${m.rating}${m.frenzy ? ' · 血怒' : ''}</span>
            </div>
            <div class="inv-rival-defense" aria-label="防守队阵容">${defense}</div>
            <div class="inv-rival-footer">
              <div class="inv-rival-expected"><small>胜利预计</small><b>+${vpMin}~${vpMax} <em>VP</em></b></div>
              <small class="inv-rival-risk">战败 −${INVASION.vpLoss} VP${m.frenzy ? ' · 血怒奖励 ×2' : ''}</small>
              <button class="inv-attack${recommended ? ' recommended' : ''}" data-invade="${m.id}" data-recommended="${recommended}" type="button" aria-label="出击 ${m.name}"><span data-icon="swords"></span>出击</button>
            </div>
          </article>`;
      })
      .join('');

    const standingsRows = (rows: StandingRow[]): string =>
      rows
        .map((r) => {
          const place = standings.rows.indexOf(r) + 1;
          return `
            <div class="inv-row${r.isPlayer ? ' me' : ''}">
              <span class="inv-place">${place}</span><span class="inv-name">${r.name}${r.isPlayer ? ' · 你' : ''}${r.frenzy ? ' · 血怒' : ''}</span><span class="inv-vp">${r.vp} VP</span>
            </div>${zone.promote > 0 && place === zone.promote ? `<div class="inv-cutline">前 ${zone.promote} 名晋级</div>` : ''}${zone.relegate > 0 && place === zone.relegate - 1 ? `<div class="inv-cutline danger">第 ${zone.relegate} 名起降级</div>` : ''}`;
        })
        .join('');

    const secondary = param === 'standings' || param === 'ranks' || param === 'rules' ? param : null;
    const rankList = INVASION_LEAGUES.map((name, index) => `
      <div class="inv-rank-row${index === save.invasion.league ? ' current' : ''}">
        ${leagueEmblem(index)}<span><b>${name}</b><small>${index === save.invasion.league ? '当前官阶' : index < save.invasion.league ? '已达成' : '尚未到达'}</small></span>
        <span class="inv-rank-condition">${index === INVASION_LEAGUES.length - 1 ? '最高官阶' : `前 ${INVASION_ZONES[index]!.promote} 名晋级`}</span>
      </div>`).join('');
    const rules = `<div class="inv-rules-body">
      <h2>官阶与战绩</h2><p>${zoneText(save.invasion.league, leagueName)}</p>
      <h2>胜负与积分</h2><p>胜利基础分按对手平均等级计算：${vpBaseRangeText()} VP。速胜、存活人数和额外回合可获得加分；血怒对手胜利积分翻倍。战败扣 ${INVASION.vpLoss} VP，积分不会低于零。</p>
      <h2>加分档位</h2><p>${VP_BONUS_TEXT}。</p>
      <h2>荣耀奖励</h2><p>胜利获得荣耀；每日首胜另有奖励。20 荣耀可在宝箱殿兑换荣耀箱。</p>
    </div>`;
    const secondaryContent = secondary === 'standings'
      ? `<section class="inv-secondary-body"><header><h2>本周榜单</h2><p>${leagueName}官阶 · ${standings.rows.length} 人 · 你当前第 ${standings.placement} 名</p></header><div class="inv-rows">${standingsRows(standings.rows)}</div></section>`
      : secondary === 'ranks'
        ? `<section class="inv-secondary-body"><header><h2>官阶总览</h2><p>每周结算后按名次晋级；当前官阶以徽记标示。</p></header><div class="inv-rank-list">${rankList}</div></section>`
        : `<section class="inv-secondary-body"><header><h2>对战规则</h2></header>${rules}</section>`;

    return `
      ${topbarHtml()}
      <div class="screen inv-screen${secondary ? ' inv-screen-secondary' : ''}">
        <section class="panel inv-panel inv-battle-hub">
          ${secondary ? `<nav class="inv-subnav" aria-label="入侵信息"><a href="#invasion"><span data-icon="arrow"></span>返回对战</a><a href="#invasion/standings"${secondary === 'standings' ? ' aria-current="page"' : ''}>本周榜单</a><a href="#invasion/ranks"${secondary === 'ranks' ? ' aria-current="page"' : ''}>官阶</a><a href="#invasion/rules"${secondary === 'rules' ? ' aria-current="page"' : ''}>规则</a></nav>${secondaryContent}` : `
          <header class="inv-hub-head">
            <div class="inv-hub-rank">${leagueEmblem(save.invasion.league)}<div><small>当前官阶 · 第 ${save.invasion.seasonsPlayed + 1} 赛季</small><h1>${leagueName}</h1><p>${promotion.note}</p></div></div>
            <div class="inv-hub-status"><span><small>本周 VP</small><b>${save.invasion.vp}</b></span><span><small>当前名次</small><b>${promotion.headline}<i> / 30</i></b></span></div>
            <nav class="inv-hub-links" aria-label="入侵信息"><a href="#invasion/standings">榜单 <span data-icon="arrow"></span></a><a href="#invasion/ranks">官阶 <span data-icon="arrow"></span></a><a href="#invasion/rules">规则 <span data-icon="arrow"></span></a></nav>
          </header>
          <div class="inv-choice-head"><div><small>每日 00:00 更新</small><h2>选择对手</h2></div><span class="inv-choice-refresh">${nextRefreshText(now)}</span><div class="inv-choice-pager" aria-label="切换对手"><button type="button" data-inv-prev aria-label="上一名对手" title="上一名对手" disabled><span data-icon="arrow"></span></button><span class="inv-choice-position" aria-live="polite">1 / ${orderedCandidates.length}</span><button type="button" data-inv-next aria-label="下一名对手" title="下一名对手"${orderedCandidates.length < 2 ? ' disabled' : ''}><span data-icon="arrow"></span></button></div></div>
          <div class="inv-rivals">${candidateRows}</div>
          <footer class="inv-hub-foot"><div><small>当前出战</small><b>${save.teams[save.activeTeamIndex]?.name ?? '未命名队伍'}</b><span>${playerSummary(save)}</span></div><a href="#team">调整队伍 <span data-icon="arrow"></span></a></footer>
          `}
        </section>
      </div>
      ${bottomNavHtml('', '入侵排位 · 每周结算')}
      ${toastHtml()}`;
  }

  mount(ctx: ShellCtx): void {
    const mapCta = document.querySelector<HTMLElement>('#invMapCta');
    if (mapCta) this.on(mapCta, 'click', () => ctx.navigate('#map'));
    const scroller = document.querySelector<HTMLElement>('.inv-rivals');
    const cards = scroller ? [...scroller.querySelectorAll<HTMLElement>('.inv-rival')] : [];
    const prev = document.querySelector<HTMLButtonElement>('[data-inv-prev]');
    const next = document.querySelector<HTMLButtonElement>('[data-inv-next]');
    const position = document.querySelector<HTMLElement>('.inv-choice-position');
    if (scroller && cards.length && prev && next && position) {
      let currentIndex = 0;
      const sync = () => {
        const step = cards[0]!.offsetWidth + Number.parseFloat(getComputedStyle(scroller).columnGap || '0');
        const index = Math.min(cards.length - 1, Math.max(0, Math.round(scroller.scrollLeft / step)));
        if (currentIndex !== index) {
          currentIndex = index;
          position.textContent = `${index + 1} / ${cards.length}`;
        }
        prev.disabled = index === 0;
        next.disabled = index === cards.length - 1;
      };
      const go = (offset: number) => {
        const index = Math.min(cards.length - 1, Math.max(0, currentIndex + offset));
        scroller.scrollTo({ left: cards[index]!.getBoundingClientRect().left - scroller.getBoundingClientRect().left + scroller.scrollLeft, behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
      };
      this.on(scroller, 'scroll', sync);
      this.on(prev, 'click', () => go(-1));
      this.on(next, 'click', () => go(1));
      this.on(window, 'resize', sync);
    }
    $$('[data-invade]').forEach((btn) =>
      this.on(btn, 'click', () => {
        const id = (btn as HTMLElement).dataset.invade!;
        void ctx.launchInvasionBattle(id);
      }),
    );
  }

  private on(target: EventTarget, type: string, fn: EventListenerOrEventListenerObject): void {
    target.addEventListener(type, fn);
    this.listeners.push([target, type, fn]);
  }

  dispose(): void {
    for (const [target, type, fn] of this.listeners.splice(0)) {
      target.removeEventListener(type, fn);
    }
  }
}
