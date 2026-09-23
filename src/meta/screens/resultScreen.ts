/**
 * 战斗结算屏（计划 §5.8）。逐行明细来自 settlement 的 SettlementDetail
 * （击杀/胜利/首胜/任务推进/战败保底），数字即入账结果，无二次计算。
 */
import type { SettlementDetail } from '../systems/settlement';
import { heroXpToNext } from '../data/classes';
import { getTroopById, type TroopData } from '../../data/troops';
import { INGOT_NAMES, stoneName, type IngotKey } from '../data/materials';
import { RARITY_NAMES } from '../data/rarity';
import { ART, KINGDOM_VIEWS } from './mapData';
import { troopArt } from './teamScreen';
import { bottomNavHtml, gemSvg, toast, toastHtml, topbarHtml, $ } from '../shell/chrome';
import { ingotArt, materialImg, scrollArt, stoneMarkupForKey, treasureMapMarkup } from '../shell/materialArt';
import type { PvpSettlementView, Screen, ShellCtx } from '../shell/screen';
import { isFailure } from '../gateway';
import {
  MASTERY_GEM,
  MASTERY_HEX,
  MASTERY_NAME,
  personalManaMastery,
} from '../systems/manaMastery';

const fmt = (n: number): string => n.toLocaleString('en-US');

/** 部队稀有度的唯一玩家口径（普通→神话），与图鉴/编队/宝箱共用六档。 */
export const RESULT_RARITY_NAMES = RARITY_NAMES;
const GENERIC_BATTLE_ART = '/meta/assets/world-map-mosaic-v2.webp';

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
    art: troop ? troopArt(troop) : '/meta/assets/troops/troop-veteran.png',
    note: reward.note,
  };
}

/** 结算背景只取王国主题图；竞技场/入侵等非王国来源使用中性世界图。 */
export function resultSummaryArt(kingdom: string): string {
  const view = KINGDOM_VIEWS.find((entry) => entry.name === kingdom);
  if (!view) return GENERIC_BATTLE_ART;
  return ART[view.biome] ?? ART.spire ?? GENERIC_BATTLE_ART;
}

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
            <div class="result-main-art" id="summaryArt" hidden>
              <img id="sumArt" alt="">
            </div>
            <div class="panel-inner">
              <div class="result-body">
              <div class="result-seal">
                <div class="victory-mark">
                  <i></i>
                  <h1 id="resultTitle">暂无战报</h1>
                  <i></i>
                </div>
                <p id="resultSub">完成一场战斗后，这里会显示奖励明细。</p>
              </div>

              <div class="xp-result" id="standardXp">
                <span>冒险者经验</span>
                <b id="xpGain">—</b>
                <div class="xp-track"><i id="xpFill" style="width:0%"></i></div>
                <small id="xpNote">暂无经验记录</small>
              </div>

              <div class="mastery-pick" id="masteryPick" hidden></div>

              <div class="result-income">
                <div class="reward-list" id="standardRewards">
                  <div class="reward-head">
                    <span>奖励明细</span>
                  </div>
                  <div id="rewardRows"></div>
                </div>

                <div class="drop-row" id="dropRow" hidden>
                  <article class="drop-card r-0" id="dropCard">
                    <img id="dropArt" alt="">
                  </article>
                  <div class="drop-copy">
                    <small>任务部队奖励</small>
                    <b id="dropName">—</b>
                    <span class="drop-rarity" id="dropRarity">—</span>
                    <span id="dropNote">—</span>
                  </div>
                </div>
              </div>

              <div class="quest-row" id="questRow">
                <span class="quest-icon" data-icon="flag"></span>
                <div class="quest-copy">
                  <b>王国任务进度</b>
                  <small id="questKingdom">—</small>
                  <div class="quest-track"><i id="questFill" style="width:0%"></i></div>
                </div>
                <strong id="questProgressText">—</strong>
              </div>

              <section class="pvp-settlement" id="pvpSettlement" hidden>
                <div class="pvp-heading">
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
              </div>

              <div class="result-actions">
                <button class="primary" id="again" type="button">返回地图</button>
                <button class="secondary" id="team" type="button">调整队伍</button>
                <button class="ghost" id="backToShop" type="button" hidden>去活动商店</button>
              </div>
            </div>
          </section>
        </div>
      </main>
      ${bottomNavHtml('', '战斗记录已保存')}
      ${toastHtml()}`;
  }

  mount(ctx: ShellCtx): void {
    this.ctx = ctx;
    const shop = $('#backToShop');
    if (shop && this.meta.shopHash) {
      shop.hidden = false;
      shop.addEventListener('click', () => ctx.navigate(this.meta.shopHash!));
    }
    this.bind('#again', 'click', () => ctx.navigate(this.meta.returnHash ?? '#map'));
    this.bind('#team', 'click', () => ctx.navigate('#team'));
    this.bind('#masteryPick', 'click', (e) => {
      const btn = (e.target as HTMLElement).closest('[data-mastery-color]') as HTMLElement | null;
      if (btn?.dataset.masteryColor) void this.pickMastery(btn.dataset.masteryColor);
    });
    this.paint();
  }

  /** 直链/刷新 #result 时的中性空态，不能沿用模板里的胜利默认值。 */
  private paintEmpty(): void {
    const screen = document.querySelector('.result-screen');
    screen?.classList.add('is-empty');
    for (const selector of ['#standardXp', '#standardRewards', '#dropRow', '#questRow', '#pvpSettlement', '#masteryPick']) {
      const element = document.querySelector<HTMLElement>(selector);
      if (element) element.hidden = true;
    }
    const summaryArt = $('#summaryArt');
    if (summaryArt) summaryArt.hidden = true;
    const image = $('#sumArt') as HTMLImageElement | null;
    if (image) {
      image.removeAttribute('src');
      image.alt = '';
    }
    $('#resultTitle').textContent = '暂无战报';
    $('#resultSub').textContent = '完成一场战斗后，这里会显示奖励明细。';
    $('#again').textContent = '去世界地图';
    $('#team').hidden = true;
    $('#backToShop').hidden = true;
  }

  private paintSummaryArt(): void {
    const frame = $('#summaryArt');
    if (frame) frame.hidden = false;
    const image = $('#sumArt') as HTMLImageElement | null;
    if (!image) return;
    image.src = resultSummaryArt(this.meta.kingdom);
    image.alt = '';
    image.hidden = false;
  }

  /** 普通战斗目前只返回来源页；在真正接入重放前不宣称「再战」。 */
  private standardReturnLabel(): string {
    const hash = this.meta.returnHash;
    if (!hash || hash === '#map') return '返回地图';
    if (hash.startsWith('#events')) return '返回活动页';
    if (hash === '#arena') return '返回竞技场';
    if (hash === '#invasion') return '返回入侵页';
    return '返回来源页';
  }

  private paint(): void {
    const d = this.detail;
    const screen = document.querySelector('.result-screen');
    screen?.classList.remove('is-pvp', 'is-empty', 'is-defeat', 'has-troop-reward');
    // ResultScreen 在路由间复用：每次先恢复默认可见性，再按当前战报收口。
    for (const selector of ['#standardXp', '#standardRewards', '#questRow']) {
      const element = document.querySelector<HTMLElement>(selector);
      if (element) element.hidden = false;
    }
    const dropRow = document.querySelector<HTMLElement>('#dropRow');
    if (dropRow) dropRow.hidden = true;
    const pvpPanel = $('#pvpSettlement');
    if (pvpPanel) pvpPanel.hidden = true;
    const summaryArt = $('#summaryArt');
    if (summaryArt) summaryArt.hidden = false;
    const shopButton = $('#backToShop');
    if (shopButton) shopButton.hidden = !this.meta.shopHash;
    $('#again').hidden = false;
    $('#team').hidden = false;
    if (!d) {
      this.paintEmpty();
      return;
    }
    this.paintSummaryArt();
    $('#again').textContent = this.standardReturnLabel();
    if (this.isPvp(d)) {
      if (shopButton) shopButton.hidden = true;
      this.paintPvp(d);
      return;
    }
    const save = this.ctx.save();
    const victory = d.victory;
    screen?.classList.toggle('is-defeat', !victory);
    $('#resultTitle').textContent = victory ? '胜 利' : '战 败';
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

    this.paintMasteryPick();

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
        line.mats?.treasureMaps ? (['treasureMaps', line.mats.treasureMaps] as [string, number]) : null,
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
          : key === 'treasureMaps'
            ? '藏宝图'
            : stoneName(key);
      const art = key.startsWith('ingot:')
        ? materialImg(ingotArt(key.slice(6)))
        : key === 'forgeScrolls'
          ? materialImg(scrollArt())
          : key === 'treasureMaps'
            ? treasureMapMarkup()
            : stoneMarkupForKey(key);
      rows.insertAdjacentHTML(
        'beforeend',
        `<div class="reward-row">
          <span class="reward-icon gem">${art}</span>
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
      const emptyLabel = victory ? '本场暂无额外奖励' : '战败保底';
      const emptyNote = victory ? '本场没有额外资源掉落，已完成的进度仍会保留。' : '仍可获得的少量补给已入账。';
      rows.insertAdjacentHTML(
        'beforeend',
        `<div class="reward-row reward-row--empty"><div><b>${emptyLabel}</b><small>${emptyNote}</small></div></div>`,
      );
    }
    $('#rewardRows').replaceWith(rows);
    rows.id = 'rewardRows';

    // 部队掉落
    if (d.troopRewards.length) {
      $('#dropRow').hidden = false;
      screen?.classList.add('has-troop-reward');
      const first = d.troopRewards[0]!;
      const reward = troopRewardView(first);
      const card = $('#dropCard');
      card.className = `drop-card r-${reward.rarityIdx}`;
      $('#dropRow').className = `drop-row r-${reward.rarityIdx}`;
      $('#dropName').textContent = reward.name;
      $('#dropNote').textContent = d.troopRewards.length > 1
        ? `${reward.note} · 另有 ${d.troopRewards.length - 1} 张奖励卡`
        : reward.note;
      $('#dropRarity').textContent = reward.rarityName;
      const art = $('#dropArt') as HTMLImageElement | null;
      if (art) {
        art.src = reward.art;
        art.alt = reward.name;
        art.hidden = false;
      }
    } else {
      const art = $('#dropArt') as HTMLImageElement | null;
      if (art) {
        art.removeAttribute('src');
        art.alt = '';
        art.hidden = true;
      }
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
  }

  private paintMasteryPick(): void {
    const panel = $('#masteryPick');
    if (!panel) return;
    const save = this.ctx.save();
    const offers = save.hero?.masteryOffers;
    const pending = offers?.length ?? 0;
    const offer = offers?.[0];
    if (pending <= 0 || !offer) {
      panel.hidden = true;
      panel.innerHTML = '';
      return;
    }
    const personal = personalManaMastery(save);
    panel.hidden = false;
    panel.innerHTML = `<div class="mastery-rite-head">
        <small>升阶仪式</small>
        <b>法力精通</b>
        <em>还剩 ${pending} 点</em>
      </div>
      <div class="mastery-rite-row">
        ${offer.map((color) => `<button type="button" class="mastery-choice" data-mastery-color="${color}" style="--mc:${MASTERY_HEX[color]}">
          <span class="mastery-choice-gem">${gemSvg([MASTERY_GEM[color]])}</span>
          <b>${MASTERY_NAME[color]}</b>
          <span class="mastery-choice-delta"><i>${personal[color]}</i><em>→</em><strong>${personal[color] + 1}</strong></span>
          <span class="mastery-choice-cta">点亮此色</span>
        </button>`).join('<span class="mastery-or" aria-hidden="true"><span>或</span></span>')}
      </div>`;
  }

  private async pickMastery(color: string): Promise<void> {
    const { result } = await this.ctx.gateway.pickManaMastery(color);
    if (isFailure(result)) {
      toast(result.message);
      return;
    }
    this.ctx.refreshChrome();
    this.paintMasteryPick();
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
    this.paintMasteryPick();
    const pvp = $('#pvpSettlement');
    pvp.hidden = false;
    const victory = view.settled.victory;
    $('#again').textContent = view.kind === 'arena'
      ? (view.settled.runOver ? '返回竞技场' : '继续竞技场')
      : '返回入侵页';
    $('#resultTitle').textContent = victory ? '胜 利' : '战 败';
    $('#resultSub').textContent = victory
      ? view.kind === 'arena' ? '竞技场连战战果已入账' : '入侵战果已入账'
      : view.kind === 'arena' ? '本届连战已结束，按已得胜场结算' : '入侵失败，保底奖励已入账';

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
        ? (rewardParts.length ? rewardParts.join(' · ') : '暂无额外奖励')
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
      $('#pvpReward').textContent = rewardParts.length ? rewardParts.join(' · ') : '本场无额外奖励';
    }
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
