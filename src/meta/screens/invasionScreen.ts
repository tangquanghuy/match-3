/**
 * 入侵 PvP 屏（素材批 2026-09-19）——排位官网阶/每周 VP/镜像对手一览。
 * 榜单与候选都是纯函数读模型（systems/invasion）；出战与结算走网关 +
 * launchInvasionBattle（结算 toast 汇报 VP/荣耀/名次），跨周 lazy 周结在网关方法里触发。
 */
import { INVASION, INVASION_LEAGUES, INVASION_ZONES } from '../data/economy';
import { getTroopById } from '../../data/troops';
import {
  invasionCandidates,
  invasionStandings,
  type StandingRow,
} from '../systems/invasion';
import { weekStartOf } from '../gateway';
import { bottomNavHtml, toastHtml, topbarHtml, $$ } from '../shell/chrome';
import type { Screen, ShellCtx } from '../shell/screen';

/** 联赛徽章色（与稀有度色系对齐的官阶梯度） */
const LEAGUE_COLORS = [
  '#9a8f86', '#c0c7ce', '#e6b84c', '#67c1b5', '#4fb06d',
  '#4f8fd0', '#9a6fd0', '#d09a4f', '#d04f5f', '#e8d24a',
] as const;

export class InvasionScreen implements Screen {
  private listeners: Array<[EventTarget, string, EventListenerOrEventListenerObject]> = [];

  html(ctx: ShellCtx): string {
    const save = ctx.save();
    const now = Date.now();
    const weekStart = weekStartOf(now);
    const locked = save.hero.level < INVASION.unlockHeroLevel;

    if (locked) {
      return `
        ${topbarHtml()}
        <div class="screen inv-screen">
          <section class="panel inv-panel inv-locked">
            <small>RANKED INVASION</small>
            <h1>入 侵</h1>
            <p>与其他指挥官的防守镜像对战，赢取荣耀与官阶。</p>
            <p class="inv-lock-hint">主角达到 <b>Lv.${INVASION.unlockHeroLevel}</b> 后解锁（当前 Lv.${save.hero.level}）。</p>
          </section>
        </div>
        ${bottomNavHtml('', '官阶=每周 VP 联赛')}
        ${toastHtml()}`;
    }

    const leagueName = INVASION_LEAGUES[save.invasion.league]!;
    const leagueColor = LEAGUE_COLORS[save.invasion.league]!;
    const standings = invasionStandings(save, now, weekStart);
    const zone = INVASION_ZONES[save.invasion.league]!;
    const candidates = invasionCandidates(save, now, weekStart);

    const candidateRows = candidates
      .map((m) => {
        const defense = m.defense
          .map((d) => {
            const troop = getTroopById(d.troopId);
            return troop ? `<span class="inv-def" title="Lv.${d.level} ${d.tier}">${troop.name}</span>` : '';
          })
          .join('');
        return `
          <div class="inv-rival${m.frenzy ? ' frenzy' : ''}">
            <div class="inv-rival-head">
              <b class="inv-rival-name">${m.name}${m.frenzy ? '<i class="inv-frenzy-tag" title="血怒：战胜 VP×2">血怒</i>' : ''}</b>
              <span class="inv-rival-nums"><span title="防守评分">⚔ ${m.rating}</span><span title="本周积分">VP ${m.vp}</span></span>
            </div>
            <div class="inv-rival-defense">${defense}</div>
            <button class="inv-attack" data-invade="${m.id}" type="button">出 击</button>
          </div>`;
      })
      .join('');

    const topRows = standings.rows.slice(0, 10);
    const playerRow = standings.rows.find((r) => r.isPlayer)!;
    const playerOutsideTop = standings.rows.indexOf(playerRow) >= 10;
    const standingsRows = (rows: StandingRow[]): string =>
      rows
        .map((r) => {
          const place = standings.rows.indexOf(r) + 1;
          const inPromote = zone.promote > 0 && place <= zone.promote;
          const inRelegate = zone.relegate > 0 && place >= zone.relegate;
          return `
            <div class="inv-row${r.isPlayer ? ' me' : ''}${inPromote ? ' up' : ''}${inRelegate ? ' down' : ''}">
              <span class="inv-place">${place}</span>
              <span class="inv-name">${r.name}${r.frenzy ? ' <i class="inv-frenzy-tag">血怒</i>' : ''}</span>
              <span class="inv-vp">${r.vp}</span>
            </div>`;
        })
        .join('');

    return `
      ${topbarHtml()}
      <div class="screen inv-screen">
        <section class="panel inv-panel">
          <header class="inv-head">
            <div class="inv-league" style="--league:${leagueColor}">
              <small>YOUR LEAGUE</small>
              <h1>${leagueName}</h1>
              <span>历史最高 ${INVASION_LEAGUES[save.invasion.bestLeague]} · 第 ${save.invasion.seasonsPlayed + 1} 赛季</span>
            </div>
            <div class="inv-stats">
              <div class="inv-stat"><small>本周 VP</small><b>${save.invasion.vp}</b></div>
              <div class="inv-stat"><small>当前名次</small><b>${standings.placement}<i>/ 30</i></b></div>
              <div class="inv-stat"><small>荣耀</small><b>${save.currencies.glory}</b></div>
            </div>
          </header>
          <p class="inv-zone-hint">本周名次 <b>前 ${zone.promote}</b> 晋级${zone.relegate > 0 ? ` · <b>第 ${zone.relegate} 名以后</b> 降级` : ' · 顶端联赛只升不降'}；胜场得 VP（4 消/速胜/存活加分），20 荣耀可在宝箱殿换荣耀箱。</p>

          <div class="inv-cols">
            <section class="inv-candidates">
              <h2><small>TODAY'S TARGETS</small>今日对手</h2>
              <div class="inv-rivals">${candidateRows}</div>
            </section>
            <section class="inv-board">
              <h2><small>WEEKLY LEADERBOARD</small>本周榜单</h2>
              <div class="inv-rows">${standingsRows(topRows)}${playerOutsideTop ? '<div class="inv-ellipsis">…</div>' : ''}${standingsRows([playerRow])}</div>
              <div class="inv-zone-legend"><i class="up"></i>晋级区 <i class="down"></i>降级区</div>
            </section>
          </div>
        </section>
      </div>
      ${bottomNavHtml('', '官阶=每周 VP 联赛')}
      ${toastHtml()}`;
  }

  mount(ctx: ShellCtx): void {
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
