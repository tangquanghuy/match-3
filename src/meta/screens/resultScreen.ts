/**
 * 战斗结算屏（计划 §5.8）。逐行明细来自 settlement 的 SettlementDetail
 * （击杀/胜利/首胜/任务推进/战败保底），数字即入账结果，无二次计算。
 */
import type { SettlementDetail } from '../systems/settlement';
import { heroXpToNext } from '../data/classes';
import { INGOT_NAMES, stoneName, type IngotKey } from '../data/materials';
import { bottomNavHtml, toast, toastHtml, topbarHtml, $ } from '../shell/chrome';
import type { PvpSettlementView, Screen, ShellCtx } from '../shell/screen';

const fmt = (n: number): string => n.toLocaleString('en-US');

interface ResultMeta {
  kingdom: string;
  sourceLabel: string;
  /** 战斗来源页（活动战= '#events'）；有值时结算屏提供直达返回 */
  returnHash?: string;
  /** 活动结算页的商店直达入口。 */
  shopHash?: string;
}

export class ResultScreen implements Screen {
  private ctx!: ShellCtx;
  private detail: SettlementDetail | PvpSettlementView | null = null;
  private meta: ResultMeta = { kingdom: '', sourceLabel: '' };
  private listeners: Array<[EventTarget, string, EventListenerOrEventListenerObject]> = [];

  setDetail(detail: SettlementDetail | PvpSettlementView, meta: ResultMeta): void {
    this.detail = detail;
    this.meta = meta;
  }

  html(): string {
    return `
      ${topbarHtml()}
      <main class="screen result-screen">
        <div class="result-layout">
          <section class="panel result-main">
            <div class="panel-inner">
              <div class="result-seal">
                <small class="result-kicker" id="kicker">BATTLE COMPLETE</small>
                <div class="victory-mark">
                  <i></i>
                  <h1 id="resultTitle">胜 利</h1>
                  <i></i>
                </div>
                <b class="victory-en" id="resultEn">VICTORY</b>
                <p id="resultSub">—</p>
              </div>

              <div class="xp-result" id="standardXp">
                <span>冒险者经验</span>
                <b id="xpGain">+0 XP</b>
                <div class="xp-track"><i id="xpFill" style="width:0%"></i></div>
                <small id="xpNote">—</small>
              </div>

              <div class="reward-list" id="standardRewards">
                <div class="reward-head">
                  <span>奖励明细</span>
                  <small>数字即入账结果</small>
                </div>
                <div id="rewardRows"></div>
              </div>

              <div class="drop-row" id="dropRow" hidden>
                <div class="drop-copy">
                  <small>任务部队奖励</small>
                  <b id="dropName">—</b>
                  <span id="dropNote">—</span>
                </div>
                <article class="drop-card r-rare" id="dropCard">
                  <img id="dropArt" alt="">
                  <div class="card-label"><small id="dropRarity">—</small><b id="dropName2">—</b></div>
                </article>
              </div>

              <div class="quest-row" id="questRow">
                <span class="quest-icon" data-icon="flag"></span>
                <div class="quest-copy">
                  <b>王国任务进度</b>
                  <small id="questKingdom">—</small>
                  <div class="quest-track"><i id="questFill" style="width:0%"></i></div>
                </div>
                <strong id="questProgressText">—</strong>
                <button class="primary claim-btn" id="claim" type="button" disabled>已入账</button>
              </div>

              <section class="pvp-settlement" id="pvpSettlement" hidden>
                <div class="pvp-heading">
                  <small id="pvpKicker">MATCH RESULT</small>
                  <h2 id="pvpTitle">—</h2>
                  <p id="pvpSubtitle">—</p>
                </div>
                <div class="pvp-stat-grid">
                  <div><small id="pvpStatLabel1">—</small><b id="pvpStatValue1">—</b></div>
                  <div><small id="pvpStatLabel2">—</small><b id="pvpStatValue2">—</b></div>
                  <div><small id="pvpStatLabel3">—</small><b id="pvpStatValue3">—</b></div>
                </div>
                <div class="pvp-breakdown" id="pvpBreakdown"></div>
                <div class="pvp-reward" id="pvpReward">—</div>
              </section>

              <div class="result-actions">
                <button class="primary" id="again" type="button">返回地图再战</button>
                <button class="secondary" id="team" type="button">调整队伍</button>
                <button class="ghost" id="backToSource" type="button" hidden>回到活动页</button>
                <button class="ghost" id="backToShop" type="button" hidden>去活动商店</button>
                <button class="ghost" id="map" type="button">返回地图</button>
              </div>
            </div>
          </section>

          <aside class="panel result-summary">
            <div class="panel-inner">
              <small class="eyebrow">BATTLE SUMMARY</small>
              <h2 id="sumKingdom">—</h2>
              <div class="summary-art">
                <img id="sumArt" alt="">
                <div class="art-shade"></div>
                <div class="art-frame" aria-hidden="true"></div>
                <div class="art-caption"><small id="sumEn">KINGDOM</small><b id="sumName">—</b></div>
              </div>
              <div class="kv-grid summary-kv">
                <div><small>结局</small><b id="sumResult">—</b></div>
                <div><small>主角升级</small><b id="sumHeroLevel">—</b></div>
                <div><small>职业解锁</small><b id="sumClassUnlock">—</b></div>
              </div>
              <div class="summary-team">
                <small>结算说明</small>
                <p class="settle-note">奖励按结算行逐条入账：击杀按敌方稀有度 × 等级，战斗内收集从 BattleResult.economy 并入，首胜按本地日历判定。</p>
              </div>
            </div>
          </aside>
        </div>
      </main>
      ${bottomNavHtml('', '战斗记录已保存')}
      ${toastHtml()}`;
  }

  mount(ctx: ShellCtx): void {
    this.ctx = ctx;
    const back = $('#backToSource');
    if (back) {
      const hash = this.meta.returnHash;
      if (hash) {
        back.hidden = false;
        back.textContent = hash === '#events' ? '回到活动页' : '返回来源页';
        back.addEventListener('click', () => ctx.navigate(hash));
      }
    }
    const shop = $('#backToShop');
    if (shop && this.meta.shopHash) {
      shop.hidden = false;
      shop.addEventListener('click', () => ctx.navigate(this.meta.shopHash!));
    }
    this.bind('#again', 'click', () => ctx.navigate(this.meta.returnHash ?? '#map'));
    this.bind('#team', 'click', () => ctx.navigate('#team'));
    this.bind('#map', 'click', () => ctx.navigate('#map'));
    this.bind('#claim', 'click', () => toast('奖励已在此前结算时入账，无需重复领取。'));
    this.paint();
  }

  private paint(): void {
    const d = this.detail;
    if (!d) return;
    // ResultScreen 在路由间复用；从 PvP 返回普通战斗时恢复被 PvP 隐藏的标准区块。
    const screen = document.querySelector('.result-screen');
    screen?.classList.remove('is-pvp');
    for (const selector of ['#standardXp', '#standardRewards', '#questRow']) {
      const element = document.querySelector<HTMLElement>(selector);
      if (element) element.hidden = false;
    }
    const dropRow = document.querySelector<HTMLElement>('#dropRow');
    if (dropRow) dropRow.hidden = true;
    const pvpPanel = $('#pvpSettlement');
    if (pvpPanel) pvpPanel.hidden = true;
    const shopButton = $('#backToShop');
    if (shopButton) shopButton.hidden = this.isPvp(d) || !this.meta.shopHash;
    if (this.isPvp(d)) {
      this.paintPvp(d);
      return;
    }
    const save = this.ctx.save();
    const victory = d.victory;
    $('#kicker').textContent = `BATTLE COMPLETE · ${this.meta.sourceLabel}`;
    $('#resultTitle').textContent = victory ? '胜 利' : '战 败';
    $('#resultEn').textContent = victory ? 'VICTORY' : 'DEFEAT';
    const questText =
      d.questProgress != null
        ? `${this.meta.kingdom} · 第 ${d.questProgress.to} 章已完成`
        : this.meta.kingdom
          ? `${this.meta.kingdom} · 战斗结束`
          : '战斗结束';
    $('#resultSub').textContent =
      questText + (d.classUnlocked ? ` · 解锁职业「${d.classUnlocked}」` : '');

    // 经验
    $('#xpGain').textContent = `+${fmt(d.xpGained)} XP`;
    const need = heroXpToNext(save.hero.level);
    $('#xpFill').style.width = `${Math.min(100, (save.hero.xp / need) * 100)}%`;
    $('#xpNote').textContent =
      `Lv.${save.hero.level} · ${fmt(save.hero.xp)} / ${fmt(need)}` +
      (d.heroLevelsGained > 0 ? ` · 升了 ${d.heroLevelsGained} 级` : '') +
      (d.classLevelUp ? ` · 职业 ${d.classLevelUp.classId} → Lv.${d.classLevelUp.newLevel}` : '');

    // 明细行按币种聚合（同一币种多行合并 note）
    const rows = document.createElement('div');
    const icons: Record<string, string> = { gold: 'coin', souls: 'soul', gems: 'crystal', goldKeys: 'key', glory: 'swords' };
    const names: Record<string, string> = { gold: '黄金', souls: '灵魂', gems: '宝石', goldKeys: '金钥匙', glory: '荣耀' };
    for (const key of ['gold', 'souls', 'gems', 'goldKeys', 'glory'] as const) {
      const lines = d.lines.filter((l) => (l.deltas[key] ?? 0) > 0);
      const total = lines.reduce((s, l) => s + (l.deltas[key] ?? 0), 0);
      if (total <= 0) continue;
      const notes = lines.map((l) => l.label).join(' + ');
      rows.insertAdjacentHTML(
        'beforeend',
        `<div class="reward-row">
          <span class="reward-icon ${key === 'gold' ? 'coin' : key === 'souls' ? 'soul' : key === 'gems' ? 'gem' : 'skull'}" data-icon="${icons[key]}"></span>
          <div><b>${names[key]}</b><small>${notes}</small></div>
          <strong>+${fmt(total)}</strong>
        </div>`,
      );
    }
    // 素材行（素材批：钢锭/符卷/特质石——活动里程碑与探索掉落的入账展示）
    const matTotals: Record<string, number> = {};
    const matNotes: Record<string, string[]> = {};
    for (const line of d.lines) {
      const entries: Array<[string, number]> = [
        ...Object.entries(line.mats?.ingots ?? {}).map(([k, n]) => [`ingot:${k}`, n] as [string, number]),
        line.mats?.forgeScrolls ? (['forgeScrolls', line.mats.forgeScrolls] as [string, number]) : null,
        ...Object.entries(line.mats?.traitstones ?? {}),
      ].filter((v): v is [string, number] => v !== null && (v[1] ?? 0) > 0);
      for (const [key, n] of entries) {
        matTotals[key] = (matTotals[key] ?? 0) + n;
        (matNotes[key] ??= []).push(line.label);
      }
    }
    for (const [key, total] of Object.entries(matTotals)) {
      const label = key.startsWith('ingot:')
        ? INGOT_NAMES[key.slice(6) as IngotKey] ?? key
        : key === 'forgeScrolls'
          ? '熔铸符卷'
          : stoneName(key);
      rows.insertAdjacentHTML(
        'beforeend',
        `<div class="reward-row">
          <span class="reward-icon gem" data-icon="orb"></span>
          <div><b>${label}</b><small>${(matNotes[key] ?? []).join(' + ')}</small></div>
          <strong>+${fmt(total)}</strong>
        </div>`,
      );
    }
    // 活动玩法推进行（无货币入账也必须可见：防线/血池/塔层/物资/连胜的反馈链路）
    const progressLines = d.lines.filter((l) => l.key === 'event-points' || l.key === 'event-progress');
    for (const l of progressLines) {
      rows.insertAdjacentHTML(
        'beforeend',
        `<div class="reward-row">
          <span class="reward-icon gem" data-icon="sparkles"></span>
          <div><b>${l.label}</b><small>${l.note ?? ''}</small></div>
        </div>`,
      );
    }
    if (!rows.childElementCount) {
      rows.insertAdjacentHTML('beforeend', '<div class="reward-row"><div><b>战败保底</b><small>仍可获得的少量补给已入账</small></div></div>');
    }
    $('#rewardRows').replaceWith(rows);
    rows.id = 'rewardRows';

    // 部队掉落
    if (d.troopRewards.length) {
      $('#dropRow').hidden = false;
      const first = d.troopRewards[0]!;
      $('#dropName').textContent = first.note;
      $('#dropNote').textContent = d.troopRewards.map((r) => r.note).join(' · ');
      $('#dropName2').textContent = first.note;
    }

    // 任务进度
    if (d.questProgress) {
      $('#questKingdom').textContent = this.meta.kingdom;
      $('#questProgressText').textContent = `${d.questProgress.to} / 8`;
      $('#questFill').style.width = `${(d.questProgress.to / 8) * 100}%`;
    } else if (this.meta.kingdom) {
      $('#questKingdom').textContent = this.meta.kingdom;
      const done = this.ctx.save().kingdoms[this.meta.kingdom]?.questsDone ?? 0;
      $('#questProgressText').textContent = `${done} / 8`;
      $('#questFill').style.width = `${(done / 8) * 100}%`;
    }

    // 侧栏
    $('#sumKingdom').textContent = this.meta.kingdom || '野外遭遇';
    $('#sumName').textContent = this.meta.kingdom || '—';
    $('#sumResult').textContent = victory ? '胜利' : '战败保底';
    $('#sumHeroLevel').textContent = d.heroLevelsGained > 0 ? `+${d.heroLevelsGained}` : '—';
    $('#sumClassUnlock').textContent = d.classUnlocked ?? '—';
  }

  private isPvp(detail: SettlementDetail | PvpSettlementView): detail is PvpSettlementView {
    return 'kind' in detail && (detail.kind === 'arena' || detail.kind === 'invasion');
  }

  private paintPvp(view: PvpSettlementView): void {
    const screen = document.querySelector('.result-screen');
    screen?.classList.add('is-pvp');
    for (const selector of ['#standardXp', '#standardRewards', '#dropRow', '#questRow']) {
      const element = document.querySelector<HTMLElement>(selector);
      if (element) element.hidden = true;
    }
    const pvp = $('#pvpSettlement');
    pvp.hidden = false;
    const victory = view.settled.victory;
    $('#again').textContent = view.kind === 'arena'
      ? (view.settled.runOver ? '返回竞技场' : '继续竞技场')
      : '返回入侵页';
    $('#kicker').textContent = `BATTLE COMPLETE · ${this.meta.sourceLabel}`;
    $('#resultTitle').textContent = victory ? '胜 利' : '战 败';
    $('#resultEn').textContent = victory ? 'VICTORY' : 'DEFEAT';
    $('#resultSub').textContent = victory
      ? view.kind === 'arena' ? '竞技场连战战果已入账' : '入侵战果已入账'
      : view.kind === 'arena' ? '本届连战已结束，按已得胜场结算' : '入侵失败，保底奖励已入账';

    $('#pvpKicker').textContent = view.kind === 'arena' ? 'ARENA RUN' : 'INVASION REPORT';
    $('#pvpTitle').textContent = view.kind === 'arena' ? '竞技场连战' : '入侵战结算';
    $('#pvpSubtitle').textContent = view.kind === 'arena'
      ? (view.settled.runOver ? '本届连战已收官' : '胜利后可继续挑战下一场')
      : `${view.settled.leagueName} · 第 ${view.settled.placement} 名`;

    const setStat = (index: 1 | 2 | 3, label: string, value: string): void => {
      $(`#pvpStatLabel${index}`).textContent = label;
      $(`#pvpStatValue${index}`).textContent = value;
    };
    const survivors = view.battle.combatants.filter((combatant) =>
      combatant.side === 'player' && !combatant.defeated,
    ).length;
    if (view.kind === 'arena') {
      setStat(1, '当前胜场', `${view.settled.wins} / 3`);
      setStat(2, '本场回合', `${view.battle.turns}`);
      setStat(3, '我方存活', `${survivors} / ${view.battle.combatants.filter((c) => c.side === 'player').length}`);
      $('#pvpBreakdown').innerHTML = view.settled.runOver
        ? '<div class="pvp-line"><span>连战状态</span><b>已收官</b></div>'
        : '<div class="pvp-line"><span>连战状态</span><b>继续挑战</b></div>';
      const rewards = view.settled.rewards;
      const rewardParts = [
        rewards.gold > 0 ? `黄金 +${fmt(rewards.gold)}` : '',
        rewards.gems > 0 ? `宝石 +${fmt(rewards.gems)}` : '',
        rewards.goldKeys > 0 ? `金钥匙 ×${fmt(rewards.goldKeys)}` : '',
      ].filter(Boolean);
      $('#pvpReward').textContent = view.settled.runOver
        ? `奖励已入账：${rewardParts.length ? rewardParts.join(' · ') : '暂无额外奖励'}`
        : '收官奖励将在本届连战结束时入账';
    } else {
      const delta = view.settled.vpDelta;
      setStat(1, 'VP 变化', `${delta >= 0 ? '+' : ''}${fmt(delta)}`);
      setStat(2, '当前 VP', fmt(view.settled.vp));
      setStat(3, '当前排名', `第 ${view.settled.placement} 名`);
      const bonus = view.settled.bonuses;
      const multiplier = view.frenzy ? 2 : 1;
      const lines = [
        ['基础 VP', victory ? `+${fmt(view.settled.vpBase)}` : '—'],
        ['速胜', victory ? `+${fmt(bonus.speed)}` : '—'],
        ['存活', victory ? `+${fmt(bonus.survivors)}` : '—'],
        ['额外回合', victory ? `+${fmt(bonus.extraTurns)}` : '—'],
        ['血怒倍率', view.frenzy && victory ? '×2' : '未触发'],
        ['加分合计', victory ? `+${fmt(bonus.total)}${multiplier > 1 ? ` · ×${multiplier} 后计入` : ''}` : '—'],
      ];
      $('#pvpBreakdown').innerHTML = lines
        .map(([label, value]) => `<div class="pvp-line"><span>${label}</span><b>${value}</b></div>`)
        .join('');
      const rewardParts = [
        view.settled.glory > 0 ? `荣耀 +${fmt(view.settled.glory)}` : '',
        view.settled.gold > 0 ? `黄金 +${fmt(view.settled.gold)}` : '',
        view.settled.firstWinToday ? '每日首胜' : '',
      ].filter(Boolean);
      $('#pvpReward').textContent = rewardParts.length ? `奖励已入账：${rewardParts.join(' · ')}` : '本场无额外奖励';
    }
    $('#sumKingdom').textContent = this.meta.kingdom;
    $('#sumName').textContent = view.kind === 'arena' ? 'ARENA RUN' : 'INVASION';
    $('#sumEn').textContent = view.kind === 'arena' ? 'ARENA' : 'PVP';
    $('#sumResult').textContent = victory ? '胜利' : '战败保底';
    $('#sumHeroLevel').textContent = '—';
    $('#sumClassUnlock').textContent = view.kind === 'arena'
      ? `${view.settled.wins} 胜`
      : `${view.settled.vp} VP`;
  }

  private on(target: EventTarget, type: string, fn: EventListenerOrEventListenerObject): void {
    target.addEventListener(type, fn);
    this.listeners.push([target, type, fn]);
  }

  private bind(selector: string, type: string, fn: EventListenerOrEventListenerObject): void {
    const el = $(selector);
    if (el) this.on(el, type, fn);
  }

  dispose(): void {
    for (const [target, type, fn] of this.listeners.splice(0)) {
      target.removeEventListener(type, fn);
    }
  }
}
