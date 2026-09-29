import { INVASION_RANKS, invasionRankAt, INVASION_VP_BY_DIFFICULTY, INVASION_RANK_GEMS_TOTAL } from '../data/invasionRanks';
import { enemyTraitCount } from '../data/enemyDifficulty';
/**
 * 入侵 PvP 屏（素材批 2026-09-19）——排位官网阶/每周 VP/镜像对手一览。
 * 榜单与候选都是纯函数读模型（systems/invasion）；出战与结算走网关 +
 * launchInvasionBattle（结算 toast 汇报 VP/荣耀/名次），跨周 lazy 周结在网关方法里触发。
 */
import { INVASION, INVASION_LEAGUES } from '../data/economy';
import { RARITY_NAMES as RARITY_CN } from '../data/rarity';
import { getTroopById } from '../../data/troops';
import {
  invasionCandidates,
  invasionVictoryVp,
  invasionStandings,
  type StandingRow,
} from '../systems/invasion';
import { weekStartOf, gameNow } from '../gateway';
import { bottomNavHtml, toastHtml, topbarHtml, toast, $$ } from '../shell/chrome';
import type { Screen, ShellCtx } from '../shell/screen';
import type { MetaSave } from '../state/schema';
import { troopImg } from './teamScreen';
import { BANNER_ART_CSS, bannerArtHtml, bannerBoostChips } from '../shell/bannerArt';

const TIER_CN: Record<string, string> = { minion: '普通', elite: '精英', boss: '首领' };
function leagueEmblem(index: number): string {
  const rank = INVASION_RANKS[index] ?? INVASION_RANKS[0]!;
  return `<span class="inv-rank-emblem"><img src="${rank.icon}" alt="${rank.name} 官阶徽记" width="72" height="80"></span>`;
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

export class InvasionScreen implements Screen {
  private listeners: Array<[EventTarget, string, EventListenerOrEventListenerObject]> = [];

  html(ctx: ShellCtx, param?: string): string {
    const save = ctx.save();
    const now = gameNow();
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
              <div class="inv-lock-preview">${leagueEmblem(0)}<span><small>解锁后的起点</small><b>青铜官阶</b></span><span class="inv-lock-preview-note">本周晋阶 VP 达标即可晋阶</span></div>
            </div>
          </section>
        </div>
        ${bottomNavHtml('', '官阶 · 本周晋阶 VP 晋阶')}
        ${toastHtml()}`;
    }

    const rank = invasionRankAt(save.invasion.progressionVp);
    const nextRank = INVASION_RANKS[rank.index + 1];
    const isTop = !nextRank;
    const leagueName = rank.name;
    const unclaimed = INVASION_RANKS.filter(r => r.vp <= save.invasion.progressionVp && !save.invasion.claimedRanks.includes(r.id));
    const progress = nextRank ? Math.min(100, (save.invasion.progressionVp - rank.vp) / (nextRank.vp - rank.vp) * 100) : 100;
    const progressNote = nextRank ? `再获 ${nextRank.vp - save.invasion.progressionVp} VP 晋升 ${nextRank.name}` : '已达最高官阶 · 参与每周排名';
    const standings = invasionStandings(save, now, weekStart);
    const candidates = invasionCandidates(save, now, weekStart);
    // Always show low -> middle -> high; do not recommend a complete combo just
    // because raw stats miss its strength or Blood Frenzy doubles its rewards.
    const recommendedId = candidates.find(m => m.difficulty === 'easy')?.id ?? '';
    const orderedCandidates = candidates;

    const candidateRows = orderedCandidates
      .map((m) => {
        const victoryVp = invasionVictoryVp(m);
        const recommended = m.id === recommendedId;
        const defense = m.defense
          .map((d) => {
            const troop = getTroopById(d.troopId);
            if (!troop) return '';
            return `<span class="inv-def r-${troop.rarityIdx}" title="${troop.name} · ${RARITY_CN[troop.rarityIdx] ?? ''} · ${TIER_CN[d.tier] ?? d.tier} · Lv.${d.level}">
              ${troopImg(troop, false, `alt="${troop.name}"`)}
              <span class="inv-def-caption"><b>${troop.name}</b><small>Lv.${d.level} · ${d.traitCount ?? enemyTraitCount(d.level)}/3 特质</small></span>
            </span>`;
          })
          .join('');
        return `
          <article data-difficulty="${m.difficulty}" data-vp-multiplier="${m.frenzyMultiplier}" class="inv-rival${m.frenzy ? ' frenzy' : ''}${m.frenzyMultiplier === 2 ? ' frenzy-double' : ''}${recommended ? ' recommended' : ''}">
            <div class="inv-rival-head${m.bannerKingdom ? ' has-banner' : ''}">
              ${m.bannerKingdom ? `<span class="inv-rival-banner" title="${m.bannerKingdom}旗帜">${bannerArtHtml(m.bannerKingdom, { size: 58 })}</span>` : ''}
              <h3 class="inv-rival-name">${m.name}</h3>
              ${m.bannerKingdom ? `<span class="inv-rival-boosts" aria-label="${m.bannerKingdom}旗帜加成"><small>${m.bannerKingdom}</small><span class="kb-boosts">${bannerBoostChips(m.bannerKingdom)}</span></span>` : ''}
              <span class="inv-rival-nums"><span>属性分 ${m.rating}</span>${m.frenzy ? `<span class="inv-frenzy-badge" title="基础属性提升 ${Math.round(((m.defense[0]?.statMultiplier ?? 1) - 1) * 100)}%，更强的敌方阵容"><i aria-hidden="true">◆</i>血怒 <b>VP ×${m.frenzyMultiplier}</b></span>` : ''}</span>
            </div>
            <div class="inv-rival-defense" aria-label="防守队阵容">${defense}</div>
            <div class="inv-rival-footer">
              <div class="inv-rival-expected"><small>胜利获得</small><b>+${victoryVp} <em>VP</em></b></div>
              <small class="inv-rival-risk">战败 −${INVASION.vpLoss} VP</small>
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
              <span class="inv-place">${place}</span><span class="inv-name">${r.name}${r.isPlayer ? ' · 你' : ''}</span><span class="inv-vp">${r.vp} VP</span>
            </div>`;
        })
        .join('');

    const route = param?.split('/')[0];
    const secondary = route === 'standings' || route === 'ranks' || route === 'rules' ? route : null;
    const pageSize = typeof window !== 'undefined' && window.innerWidth <= 900 ? 3 : 6;
    const pageCount = Math.ceil(INVASION_RANKS.length / pageSize);
    const rawPage = Number(param?.split('/')[1]);
    const defaultPage = Math.floor((unclaimed[0]?.index ?? rank.index) / pageSize);
    const rankPage = param?.includes('/') && Number.isFinite(rawPage) ? Math.min(pageCount - 1, Math.max(0, Math.floor(rawPage))) : defaultPage;
    const rankList = INVASION_RANKS.slice(rankPage * pageSize, (rankPage + 1) * pageSize).map(r => {
      const claimed = save.invasion.claimedRanks.includes(r.id);
      const reached = save.invasion.progressionVp >= r.vp;
      return `<article class="inv-rank-row${r.index === rank.index ? ' current' : ''}${reached ? ' reached' : ''}">
        ${leagueEmblem(r.index)}<div class="inv-rank-copy"><b>${r.name}</b><small>${r.vp.toLocaleString()} VP${r.index === rank.index ? ' · 当前' : ''}</small></div>
        <div class="inv-rank-reward"><span><i data-icon="gem"></i>${r.gems} 宝石</span><button type="button" data-claim-rank="${r.id}"${claimed || !reached ? ' disabled' : ''}>${claimed ? '已领取' : reached ? '领取' : '未达成'}</button></div>
      </article>`;
    }).join('');
    const rankOverview = `<section class="inv-rank-overview">${leagueEmblem(rank.index)}<div><small>当前官阶</small><h2>${rank.name}</h2><p>${progressNote}</p><progress aria-label="晋阶进度" max="100" value="${progress}"></progress><small>本周 ${save.invasion.progressionVp.toLocaleString()} VP${nextRank ? ` / ${nextRank.vp.toLocaleString()} VP` : ''}</small></div><div class="inv-rank-claimable"><b>${unclaimed.reduce((sum, r) => sum + r.gems, 0)}</b><small>待领宝石</small></div></section>`;
    const rankPager = `<nav class="inv-rank-pager" aria-label="官阶分页">${Array.from({length: pageCount}, (_, i) => `<a href="#invasion/ranks/${i}"${i === rankPage ? ' aria-current="page"' : ''}>${pageSize === 3 ? INVASION_LEAGUES[i] : `${INVASION_LEAGUES[i * 2]} · ${INVASION_LEAGUES[i * 2 + 1]}`}</a>`).join('')}</nav>`;
    const rules = `<div class="inv-rules-body">
      <h2>官阶与战绩</h2><p>本周获得的 VP 达到门槛立即晋阶，战败不减少晋阶进度。每周重置官阶进度和领奖记录，每阶每周领取一次；钻石 III 开放周榜排名。</p>
      <h2>三档对手</h2><p>每次提供三名对手，自由选择挑战。免费刷新，不限次数；官阶越高，对手越强。</p><h2>胜负与积分</h2><p>三档对手每胜分别获得 ${INVASION_VP_BY_DIFFICULTY.easy}／${INVASION_VP_BY_DIFFICULTY.normal}／${INVASION_VP_BY_DIFFICULTY.hard} VP，不受等级、回合数或存活人数影响。血怒对手随机出现，阵容与基础属性更强：×1.5 血怒基础属性提升 25%，×2 血怒提升 50%，胜利 VP 按标示倍率增加；并非每次刷新都会出现。战败扣 ${INVASION.vpLoss} 榜单 VP，保底为零，不扣晋阶 VP。每周一重置，未领取奖励过期；每周全部领取共 ${INVASION_RANK_GEMS_TOTAL.toLocaleString()} 宝石。</p>
      <h2>荣耀奖励</h2><p>胜利获得荣耀；每日首胜另有奖励。20 荣耀可在宝箱殿兑换荣耀箱。</p>
    </div>`;
    const secondaryContent = secondary === 'standings'
      ? `<section class="inv-secondary-body"><header><h2>本周榜单</h2><p>${isTop ? `${leagueName} · ${standings.rows.length} 人 · 你当前第 ${standings.placement} 名` : '达到钻石 III 后开放排名；当前晋阶只看本周晋阶 VP。'}</p></header>${isTop ? `<div class="inv-rows">${standingsRows(standings.rows)}</div>` : '<a class="inv-rank-link" href="#invasion/ranks">查看官阶进度</a>'}</section>`
      : secondary === 'ranks'
        ? `<section class="inv-secondary-body inv-ranks-page"><header><h2>官阶与奖励</h2><p>每周 ${INVASION_RANK_GEMS_TOTAL.toLocaleString()} 宝石 · 每周一重置</p></header>${rankOverview}${rankPager}<div class="inv-rank-list">${rankList}</div><p class="inv-rank-page-note">第 ${rankPage + 1} / ${pageCount} 页 · 共 30 阶</p></section>`
        : `<section class="inv-secondary-body"><header><h2>对战规则</h2></header>${rules}</section>`;

    return `
      <style>${BANNER_ART_CSS}</style>
      ${topbarHtml()}
      <div class="screen inv-screen${secondary ? ' inv-screen-secondary' : ''}">
        <section class="panel inv-panel inv-battle-hub">
          ${secondary ? `<nav class="inv-subnav" aria-label="入侵信息"><a href="#invasion"><span data-icon="arrow"></span>返回对战</a>${isTop ? `<a href="#invasion/standings"${secondary === 'standings' ? ' aria-current="page"' : ''}>本周榜单</a>` : ''}<a href="#invasion/ranks"${secondary === 'ranks' ? ' aria-current="page"' : ''}>官阶</a><a href="#invasion/rules"${secondary === 'rules' ? ' aria-current="page"' : ''}>规则</a></nav>${secondaryContent}` : `
          <header class="inv-hub-head">
            <div class="inv-hub-rank">${leagueEmblem(rank.index)}<div><small>当前官阶</small><h1>${leagueName}</h1><p>${progressNote}</p></div></div>
            <div class="inv-hub-status"><span><small>本周 VP</small><b>${save.invasion.vp}</b></span><span><small>${isTop ? '当前名次' : '本周晋阶 VP'}</small><b>${isTop ? `第 ${standings.placement}` : save.invasion.progressionVp}</b></span></div>
            <nav class="inv-hub-links" aria-label="入侵信息">${isTop ? '<a href="#invasion/standings">榜单 <span data-icon="arrow"></span></a>' : ''}<a href="#invasion/ranks">官阶${unclaimed.length ? `<i class="inv-reward-dot">${unclaimed.length} 可领</i>` : ''} <span data-icon="arrow"></span></a><a href="#invasion/rules">规则 <span data-icon="arrow"></span></a></nav>
          </header>
          <div class="inv-choice-head"><div><small>免费刷新 · 不限次数</small><h2>选择对手</h2></div><button type="button" class="inv-choice-refresh" data-inv-refresh>刷新对手</button><div class="inv-choice-pager" aria-label="切换对手"><button type="button" data-inv-prev aria-label="上一名对手" title="上一名对手" disabled><span data-icon="arrow"></span></button><span class="inv-choice-position" aria-live="polite">1 / ${orderedCandidates.length}</span><button type="button" data-inv-next aria-label="下一名对手" title="下一名对手"${orderedCandidates.length < 2 ? ' disabled' : ''}><span data-icon="arrow"></span></button></div></div>
          <div class="inv-rivals">${candidateRows}</div>
          <footer class="inv-hub-foot"><div><small>当前出战</small><b>${save.teams[save.activeTeamIndex]?.name ?? '未命名队伍'}</b><span>${playerSummary(save)}</span></div><a href="#team">调整队伍 <span data-icon="arrow"></span></a></footer>
          `}
        </section>
      </div>
      ${bottomNavHtml('', '本周晋阶 VP 晋阶 · 官阶页领取宝石')}
      ${toastHtml()}`;
  }

  mount(ctx: ShellCtx): void {
    const now = ctx.gateway.now();
    if (ctx.save().hero.level >= INVASION.unlockHeroLevel && ctx.save().invasion.weekStart !== weekStartOf(now)) {
      void ctx.gateway.syncInvasionSeason().then(() => ctx.refresh());
      return;
    }
    const refreshButton = document.querySelector<HTMLButtonElement>('[data-inv-refresh]');
    if (refreshButton) this.on(refreshButton, 'click', () => {
      refreshButton.disabled = true;
      void ctx.gateway.refreshInvasionOpponents().then(update => {
        ctx.refresh();
        if (!update.result.ok) toast(update.result.message);
      }).catch(() => { refreshButton.disabled = false; toast('刷新失败，请重试'); });
    });
    $$('[data-claim-rank]').forEach(button => this.on(button, 'click', () => {
      const btn = button as HTMLButtonElement;
      btn.disabled = true;
      void ctx.gateway.claimInvasionRank(btn.dataset.claimRank!, ctx.save().invasion.weekStart).then(update => {
        ctx.refresh();
        toast(update.result.ok ? `已领取 ${update.result.gems} 宝石` : update.result.message);
      }).catch(() => { btn.disabled = false; toast('领取失败，请重试'); });
    }));
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
