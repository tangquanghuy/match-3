/**
 * 主角屏（v2 · 官方 38 职业）：等级/四维、职业圣殿（装备/解锁）、天赋树
 * （3 树 × 7 档，每档三树选一、可随时改配）、职业专属特质（3 槽金+魂解锁）、
 * 武器库（唯一施法手段：装备后决定法力色/耗蓝/法术）。
 */
import {
  CHAMPION_TIERS,
  CLASSES,
  classById,
  classXpToNext,
  classUnlockText,
  tierUnlocked,
  type ClassDef,
  type TalentDef,
} from '../data/classes';
import { type WeaponDef } from '../data/weapons';
import { canUseWeapon, classLevelOf, classWinsOf, heroStatsOf, temperingBonusOf } from '../systems/hero';
import {
  ALL_CATALOG_WEAPONS,
  STARTER_WEAPONS,
  catalogIconUrl,
  anyWeaponById,
  ownedWeapons,
  ownedWeaponIds,
  ownsWeapon,
} from '../data/weaponCatalog';
import { rarityMetaByKey } from '../data/rarity';
import { acquireOf, CLASS_WEAPON_WINS } from '../data/weaponAcquire';
import { SOULFORGE_RECIPES } from '../data/soulforge';
import {
  AFFIX_UNLOCK_LEVELS,
  DOOMED_AFFIX_UNLOCK_LEVELS,
  affixUnlockedCount,
  forgeTierUnlockLevel,
} from '../systems/forge';
import { temperingLevelOf } from '../systems/forgeOps';
import { heroTraitSlots, talentPicksOf } from '../systems/talents';
import { traitBadgeSvg } from '../../render/traitBadges';
import { TALENT_DYNAMIC_CODES } from '../data/talentDefs';
import { bottomNavHtml, gemSvg, mountIcons, toast, toastHtml, topbarHtml, $, $$ } from '../shell/chrome';
import { isFailure } from '../gateway';
import type { Screen, ShellCtx } from '../shell/screen';
import { formulaKind, formulaParts, formulaRule, renderSpell } from '../shell/spellText';
import {
  combatManaMastery,
  kingdomMasteryBonus,
  MASTERY_GEM,
  MASTERY_HEX,
  MASTERY_NAME,
  MANA_COLORS,
  pendingMasteryCount,
  personalManaMastery,
  surgeChancePct,
  type ManaColor,
} from '../systems/manaMastery';

/** 职业图标（icon 库键；未列出的用 helmet 兜底） */
const CLASS_ICON: Record<string, string> = {
  knight: 'helmet',
  warrior: 'swords',
  archer: 'banner',
  thief: 'barbute',
  assassin: 'barbute',
  necromancer: 'skull',
  deathknight: 'skull',
  priest: 'sparkles',
  heirophant: 'sparkles',
  warpriest: 'sparkles',
  sorcerer: 'sparkles',
  archmagus: 'sparkles',
  frostmage: 'sparkles',
  elementalist: 'swirl',
  stormcaller: 'swirl',
  shaman: 'swirl',
  druid: 'swirl',
  bard: 'banner',
  monk: 'swirl',
  corsair: 'banner',
  marauder: 'swords',
  barbarian: 'swords',
  slayer: 'swords',
  mechanist: 'orb',
  dragonguard: 'shield',
  warden: 'swirl',
};

/**
 * 武器卡面（官方 webp，`public/static/weapons/`）。
 *
 * 2026-09-19 窗口 M：程序化剪影 `shell/weaponIcons.ts` 已退役（UX-2 混排的根因——
 * 同一个列表里一边是透明底单色矢量、一边是满幅彩绘，且 `WEAPON_ICONS` 缺
 * mace/tome/shield/ring 四键让 7/20 把兜底成同一把长剑）。现在 718/718 把都有官方卡面，
 * 取图只有这一个出口。
 */
function weaponArtHtml(w: WeaponDef, lazy = false): string {
  const url = catalogIconUrl(w);
  if (!url) return '<div class="tile-img tile-img-missing" aria-hidden="true"></div>';
  return `<img class="tile-img"${lazy ? ' loading="lazy"' : ''} src="${url}" alt="${w.name}"/>`;
}

const spaced = (s: string): string => s.split('').join(' ');

const RING_R = 31;
const RING_C = 2 * Math.PI * RING_R;

function masteryRingHtml(pct: number): string {
  const offset = RING_C * (1 - Math.max(0, Math.min(1, pct)));
  return `<svg class="mastery-ring" viewBox="0 0 72 72" aria-hidden="true">
    <circle class="mastery-ring-track" cx="36" cy="36" r="${RING_R}"></circle>
    <circle class="mastery-ring-fill" cx="36" cy="36" r="${RING_R}" stroke-dasharray="${RING_C.toFixed(2)}" stroke-dashoffset="${offset.toFixed(2)}"></circle>
  </svg>`;
}

function masteryChoiceHtml(color: ManaColor, from: number): string {
  return `<button type="button" class="mastery-choice" data-mastery-color="${color}" style="--mc:${MASTERY_HEX[color]}">
    <span class="mastery-choice-gem">${gemSvg([MASTERY_GEM[color]])}</span>
    <b>${MASTERY_NAME[color]}</b>
    <span class="mastery-choice-delta"><i>${from}</i><em>→</em><strong>${from + 1}</strong></span>
    <span class="mastery-choice-cta">点亮此色</span>
  </button>`;
}

/** 天赋效果是否实际产出数值；不可用内容只以玩家口径的「暂未开放」呈现。 */
function effectUsable(t: TalentDef): 'yes' | 'no' | 'na' {
  if (t.effect.kind === 'pvp') return 'na';
  if (t.effect.kind === 'unimplemented') return TALENT_DYNAMIC_CODES.has(t.code) ? 'yes' : 'no';
  return 'yes';
}

export class HeroScreen implements Screen {
  private ctx!: ShellCtx;
  private pickedWeaponId: string | null = null;
  private forgeMode = false;
  private pickedRecipeId: string | null = null;
  private listeners: Array<[EventTarget, string, EventListenerOrEventListenerObject]> = [];
  /** 最近一次 spellSheet 渲染的公式集（bindSheetTips 消费） */
  private sheetFormulas: ReturnType<typeof renderSpell>['formulas'] = [];

  html(): string {
    return `
      ${topbarHtml()}
      <div class="screen hero-screen">
        <section class="panel hero-card">
          <div class="hero-art">
            <img src="/static/hero/seiji.webp" alt="影织者">
            <div class="shade"></div>
          </div>
          <div class="hero-metrics">
            <div class="hero-stats" id="heroStats" role="group" aria-label="主角当前四维"></div>
            <button class="mastery-compact" id="openMastery" type="button" aria-haspopup="dialog" aria-label="法力精通"></button>
          </div>
        </section>
        <section class="panel hero-info">
          <div class="panel-head class-head">
            <div class="class-head-copy">
              <div class="progress-emblem"><span data-icon="helmet"></span></div>
              <div>
                <div class="career-title-wrap">
                  <h2 class="career-name" id="careerName">无职业</h2>
                  <span class="career-level-badge level-tier-1" id="careerBadge">
                    <span class="level-dot"></span>
                    <b class="level-num" id="careerLevel">冠军 Lv.0</b>
                  </span>
                  <span class="career-wins-badge" id="careerWins" hidden>0 / 250 胜</span>
                </div>
                <p id="careerHint">从职业圣殿装备已解锁职业</p>
              </div>
            </div>
            <div class="class-head-track">
              <div class="meta">冠军经验 <b id="classXpText">0</b></div>
              <div class="class-xp"><i id="classXpFill"></i></div>
              <span class="next-reward" id="nextReward">—</span>
            </div>
          </div>
          <section class="weapon-slab" id="weaponSlab" aria-label="已装备武器"></section>
          <section class="class-vault" id="classes">
            <div class="section-title">
              <div><h3>职业圣殿</h3><small>破碎尖塔初始职业 · 其余按王国主线 4／8 关与困难／非常困难解锁</small></div>
              <div class="class-vault-actions">
                <span id="classUnlockCount">0 / 38 已解锁</span>
                <button class="ghost class-expand talent-expand" id="openTree" type="button" aria-haspopup="dialog">
                  天赋树 <b id="talentSummary">0 / 7</b>
                </button>
                <button class="ghost class-expand" id="classExpand" type="button" aria-haspopup="dialog">选择职业</button>
              </div>
            </div>
            <div class="class-current" id="classCurrent" aria-live="polite"></div>
            <div class="career-perks" id="perkBoard">
              <div class="perk-summary-head">
                <b>当前职业特质</b>
                <span>特质效果随当前职业生效</span>
              </div>
              <div class="perk-slots" id="perkSlots"></div>
            </div>
          </section>
          <section class="talent-board">
            <div class="section-title">
              <div><h3>天赋路径</h3><small>冠军等级解锁档位 · 每档三树选一 · 随时免费改配</small></div>
              <button class="ghost" id="openTreeBoard" type="button">查看完整天赋树</button>
            </div>
            <div class="talent-path" id="talentPath" aria-label="0 / 7 已选"></div>
          </section>
        </section>
      </div>
      ${bottomNavHtml('英雄', '职业由王国任务链解锁')}
      ${toastHtml()}

      </div>

      <div class="modal-veil vault-veil mastery-veil" id="masteryVeil" hidden>
        <section class="vault-sheet mastery-sheet" role="dialog" aria-modal="true" aria-labelledby="masteryTitle">
          <header class="vault-head">
            <div class="vault-mark"><span data-icon="swirl"></span></div>
            <div class="vault-heading">
              <h2 id="masteryTitle">法 力 精 通</h2>
              <p>升级择一加色 · 三消涌动 · 五消必涌</p>
            </div>
            <div class="vault-count" id="masteryCount">待分配 <b>0</b></div>
            <button class="vault-close" id="masteryClose" type="button" aria-label="关闭法力精通"><span data-icon="close"></span></button>
          </header>
          <div class="mastery-body" id="masteryBody"></div>
        </section>
      </div>

      <div class="modal-veil vault-veil tree-veil" id="treeVeil" hidden>
        <section class="vault-sheet tree-sheet" role="dialog" aria-modal="true" aria-labelledby="treeTitle">
          <header class="vault-head">
            <div class="vault-mark"><span data-icon="swirl"></span></div>
            <div class="vault-heading">
              <h2 id="treeTitle">天 赋 树</h2>
              <p id="treeSub">每档三树选一 · 随时免费改配</p>
            </div>
            <div class="vault-count" id="treeCount">0 / 7 已选</div>
            <button class="vault-close" id="treeClose" type="button" aria-label="关闭天赋树"><span data-icon="close"></span></button>
          </header>
          <div class="tree-body">
            <div class="talent-tree" id="talentTree"></div>
          </div>
        </section>
      </div>

      <div class="modal-veil vault-veil class-veil" id="classVeil" hidden>
        <section class="vault-sheet class-sheet" role="dialog" aria-modal="true" aria-labelledby="classTitle">
          <header class="vault-head">
            <div class="vault-mark"><span data-icon="helmet"></span></div>
            <div class="vault-heading">
              <h2 id="classTitle">职业圣殿</h2>
              <p>按职业图标与王国快速选择，装备后查看对应天赋与武器</p>
            </div>
            <div class="vault-count" id="classModalCount">0 / 38 已解锁</div>
            <button class="vault-close" id="classClose" type="button" aria-label="关闭职业圣殿"><span data-icon="close"></span></button>
          </header>
          <div class="class-sheet-body">
            <div class="class-grid class-grid-full" id="classList"></div>
          </div>
        </section>
      </div>

      <div class="modal-veil perk-veil" id="perkVeil" hidden>
        <section class="perk-sheet" role="dialog" aria-modal="true" aria-labelledby="perkDetailTitle">
          <header class="perk-sheet-head">
            <div class="perk-sheet-mark"><span data-icon="sparkles"></span></div>
            <div><h2 id="perkDetailTitle">职业特质</h2><p id="perkDetailState"></p></div>
            <button class="vault-close" id="perkClose" type="button" aria-label="关闭特质详情"><span data-icon="close"></span></button>
          </header>
          <div class="perk-sheet-body">
            <p id="perkDetailText"></p>
            <div id="perkDetailAction"></div>
          </div>
        </section>
      </div>

      <div class="modal-veil vault-veil" id="vaultVeil" hidden>
        <section class="vault-sheet" role="dialog" aria-modal="true" aria-labelledby="vaultTitle">
          <header class="vault-head">
            <div class="vault-mark"><span data-icon="swords"></span></div>
            <div class="vault-heading">
              <h2 id="vaultTitle">武 器 库</h2>
              <p>武器是主角唯一的施法手段 · 决定法力颜色、法力值消耗与法术</p>
            </div>
            <div class="vault-count">已获得 <b id="vaultOwned">0</b> / <i id="vaultTotal">0</i></div>
            <button class="secondary" id="vaultForge" type="button">熔炉锻造</button>
            <button class="vault-close" id="vaultClose" type="button" aria-label="关闭武器库"><span data-icon="close"></span></button>
          </header>
          <div class="vault-body">
            <div class="vault-rack" id="vaultRack" role="listbox" aria-label="武器列表"></div>
            <aside class="vault-detail" id="vaultDetail"></aside>
          </div>
        </section>
      </div>`;
  }

  mount(ctx: ShellCtx): void {
    this.ctx = ctx;
    this.bind('#vaultClose', 'click', () => ($('#vaultVeil').hidden = true));
    this.bind('#vaultForge', 'click', () => {
      this.forgeMode = !this.forgeMode;
      this.pickedWeaponId = null;
      this.renderRack();
      this.renderVaultDetail();
    });
    this.on($('#vaultVeil'), 'click', (e) => {
      if (e.target === $('#vaultVeil')) $('#vaultVeil').hidden = true;
    });
    this.bind('#openTree', 'click', () => this.openTree());
    this.bind('#openTreeBoard', 'click', () => this.openTree());
    this.bind('#openMastery', 'click', () => this.openMastery());
    this.bind('#masteryClose', 'click', () => ($('#masteryVeil').hidden = true));
    this.on($('#masteryVeil'), 'click', (e) => {
      if (e.target === $('#masteryVeil')) $('#masteryVeil').hidden = true;
    });
    this.bind('#masteryBody', 'click', (e) => {
      const btn = (e.target as HTMLElement).closest('[data-mastery-color]') as HTMLElement | null;
      if (btn?.dataset.masteryColor) void this.pickMastery(btn.dataset.masteryColor);
    });
    this.bind('#masteryBody', 'keydown', (e) => {
      const ke = e as KeyboardEvent;
      if (ke.key !== 'Enter' && ke.key !== ' ') return;
      const btn = (ke.target as HTMLElement).closest('[data-mastery-color]') as HTMLElement | null;
      if (!btn?.dataset.masteryColor) return;
      ke.preventDefault();
      void this.pickMastery(btn.dataset.masteryColor);
    });
    this.bind('#classExpand', 'click', () => {
      this.renderClasses();
      $('#classVeil').hidden = false;
    });
    this.bind('#classClose', 'click', () => ($('#classVeil').hidden = true));
    this.on($('#classVeil'), 'click', (e) => {
      if (e.target === $('#classVeil')) $('#classVeil').hidden = true;
    });
    this.bind('#perkClose', 'click', () => ($('#perkVeil').hidden = true));
    this.on($('#perkVeil'), 'click', (e) => {
      if (e.target === $('#perkVeil')) $('#perkVeil').hidden = true;
    });
    this.bind('#treeClose', 'click', () => ($('#treeVeil').hidden = true));
    this.on($('#treeVeil'), 'click', (e) => {
      if (e.target === $('#treeVeil')) $('#treeVeil').hidden = true;
    });
    this.on(document, 'click', (e) => {
      if (!(e.target as HTMLElement).closest('.spell-copy .spell-stat, .spell-tip')) this.closeSpellTips();
    });
    this.on(window, 'keydown', (e) => {
      if ((e as KeyboardEvent).key !== 'Escape') return;
      const openTip = document.querySelector('.weapon-spell .spell-tip:not([hidden])');
      if (openTip) {
        this.closeSpellTips();
        return;
      }
      $('#treeVeil').hidden = true;
      $('#classVeil').hidden = true;
      $('#perkVeil').hidden = true;
      $('#vaultVeil').hidden = true;
      $('#masteryVeil').hidden = true;
    });
    this.renderAll();
  }

  private renderAll(): void {
    const save = this.ctx.save();
    const hero = save.hero;
    const stats = heroStatsOf(save);
    const temper = temperingBonusOf(save);
    const cls = hero.classId ? classById(hero.classId) : undefined;
    const level = hero.classId ? classLevelOf(save, hero.classId) : 0;

    // —— 主角卡与职业头 ——
    const stat = (kind: string, label: string, icon: string, value: number, bonus: number): string => `
      <span class="hero-stat stat-${kind}" title="${label}${bonus > 0 ? `（含淬炼 +${bonus}）` : ''}" aria-label="${label} ${value}${bonus > 0 ? `，淬炼加成 ${bonus}` : ''}">
        <span data-icon="${icon}"></span><b>${value}</b>
      </span>`;
    $('#heroStats').innerHTML = [
      stat('atk', '攻击', 'swords', stats.attack, temper.attack),
      stat('armor', '护甲', 'shield', stats.armor, temper.armor),
      stat('hp', '生命', 'heart', stats.health, temper.health),
      stat('magic', '魔力', 'orb', stats.magic, temper.magic),
    ].join('');
    $('#careerName').textContent = cls?.name ?? '无职业';
    $('#careerLevel').textContent = `冠军 Lv.${level}`;
    const levelTier = level >= 60 ? 5 : level >= 40 ? 4 : level >= 20 ? 3 : level >= 10 ? 2 : 1;
    $('#careerBadge').className = `career-level-badge level-tier-${levelTier}`;
    const winsEl = $('#careerWins');
    if (cls) {
      const wins = classWinsOf(save, cls.id);
      winsEl.hidden = false;
      winsEl.textContent = `${wins} / ${CLASS_WEAPON_WINS} 胜`;
      const need = classXpToNext(level);
      const xp = hero.classXp[cls.id] ?? 0;
      $('#careerHint').innerHTML = `冠军经验来自携带主角的胜场 · 再获得 <b>${Math.max(0, need - xp)}</b> 点升级`;
      $('#classXpText').textContent = `${xp} / ${need}`;
      ($('#classXpFill') as HTMLElement).style.width = `${Math.min(100, (xp / need) * 100)}%`;
      const nextTier = CHAMPION_TIERS.find((t) => t > level);
      $('#nextReward').textContent = nextTier ? `冠军 Lv.${nextTier} 解锁第 ${CHAMPION_TIERS.indexOf(nextTier) + 1} 档天赋` : '天赋已全部解锁';
    } else {
      winsEl.hidden = true;
      $('#careerHint').textContent = '从职业圣殿装备已解锁职业';
      $('#classXpText').textContent = '0';
      ($('#classXpFill') as HTMLElement).style.width = '0%';
      $('#nextReward').textContent = '—';
    }

    this.renderTalentPath(cls ?? null, level);
    this.renderMasteryCompact();
    this.renderPerks();
    this.renderClasses();
    this.renderSlab();
  }

  // —— 天赋路径（V5 小样：横向节点摘要）——

  /** 档位节点图标（game-icons 键；V5 五档版为 shield/swords/heart/banner/crown） */
  private static readonly TIER_ICONS = ['shield', 'swords', 'heart', 'banner', 'crown', 'swirl', 'skull'];

  private renderTalentPath(cls: ClassDef | null, level: number): void {
    const button = $('#openTree') as HTMLButtonElement;
    const summary = $('#talentSummary');
    const path = $('#talentPath');
    const pickedCount = cls ? talentPicksOf(this.ctx.save(), cls.id).filter(Boolean).length : 0;
    summary.textContent = `${pickedCount} / 7`;
    button.disabled = !cls;
    button.setAttribute('aria-label', cls ? `打开天赋树，已选择 ${pickedCount} / 7` : '天赋树尚未解锁');
    if (!cls) {
      path.innerHTML = '<div class="talent-node"><span data-icon="helmet"></span><b>待解锁</b><small>装备职业后点亮天赋</small></div>';
      mountIcons(path);
      path.setAttribute('aria-label', '0 / 7 已选');
      return;
    }
    const picks = talentPicksOf(this.ctx.save(), cls.id);
    // 已选档位走 claimed；未选但已解锁的第一档走 current（V5 的「下一个 actionable」）；
    // 其余未选已解锁档位 plain；未解锁档位 small 显等级。
    let currentAssigned = false;
    path.innerHTML = cls.trees[0]!.talents
      .map((_, tier) => {
        const open = tierUnlocked(level, tier);
        const pickedCode = picks[tier];
        const picked = pickedCode
          ? cls.trees.map((tr) => tr.talents[tier]).find((t) => t && t.code === pickedCode)
          : undefined;
        const icon = HeroScreen.TIER_ICONS[tier] ?? 'helmet';
        let state = '';
        let small: string;
        if (picked) {
          state = 'claimed';
          small = '已选';
        } else if (open && !currentAssigned) {
          state = 'current';
          currentAssigned = true;
          small = '可配置';
        } else if (open) {
          small = '可配置';
        } else {
          small = `Lv.${CHAMPION_TIERS[tier]} 解锁`;
        }
        const line = tier > 0 ? `<i class="path-line${picked ? ' on' : ''}"></i>` : '';
        const label = picked ? picked!.nameZh : '未选';
        return `${line}<button class="talent-node ${state}" data-tier="${tier}" type="button" title="${picked ? picked!.descriptionZh : `冠军 Lv.${CHAMPION_TIERS[tier]} 解锁`}">` +
          `<span data-icon="${icon}"></span><b>${label}</b><small>${small}</small></button>`;
      })
      .join('');
    mountIcons(path);
    path.setAttribute('aria-label', `${pickedCount} / 7 已选`);
    $$('#talentPath [data-tier]').forEach((btn) =>
      this.on(btn, 'click', () => this.openTree()),
    );
  }

  private renderMasteryCompact(): void {
    const el = $('#openMastery');
    if (!el) return;
    const save = this.ctx.save();
    const personal = personalManaMastery(save);
    const combat = combatManaMastery(save);
    const pending = pendingMasteryCount(save);
    const gems = MANA_COLORS.map((color) => {
      const mine = personal[color];
      const extra = combat[color] > mine ? `（战斗 ${combat[color]}）` : '';
      return `<span class="mastery-mini${combat[color] <= 0 ? ' is-empty' : ''}" style="--mc:${MASTERY_HEX[color]}" title="${MASTERY_NAME[color]} ${mine}${extra}">
        ${gemSvg([MASTERY_GEM[color]])}
        <b>${mine}</b>
      </span>`;
    }).join('');
    el.innerHTML = `<span class="mastery-compact-label">法力精通${pending > 0 ? `<em>${pending}</em>` : ''}</span><span class="mastery-minis">${gems}</span>`;
    el.classList.toggle('has-pending', pending > 0);
  }

  private openMastery(): void {
    this.renderMasteryModal();
    $('#masteryVeil').hidden = false;
  }

  private renderMasteryModal(): void {
    const save = this.ctx.save();
    const personal = personalManaMastery(save);
    const combat = combatManaMastery(save);
    const bonus = kingdomMasteryBonus(save);
    const pending = pendingMasteryCount(save);
    const offer = save.hero.masteryOffers[0];
    const offered = new Set(offer ?? []);
    $('#masteryCount').innerHTML = pending > 0 ? `待分配 <b>${pending}</b>` : '已分配完毕';
    const offerHtml = offer
      ? `<section class="mastery-rite">
          <div class="mastery-rite-head">
            <small>升阶仪式</small>
            <b>从两色中择一</b>
            <em>还剩 ${pending} 点</em>
          </div>
          <div class="mastery-rite-row">
            ${masteryChoiceHtml(offer[0], personal[offer[0]])}
            <span class="mastery-or" aria-hidden="true"><span>或</span></span>
            ${masteryChoiceHtml(offer[1], personal[offer[1]])}
          </div>
        </section>`
      : '<p class="mastery-idle">升级主角后，会从随机两色中择一加一点精通。</p>';
    const sigils = MANA_COLORS.map((color) => {
      const mine = personal[color];
      const kingdom = bonus[color];
      const value = combat[color];
      const lit = offered.has(color);
      return `<article class="mastery-sigil${lit ? ' is-offered' : ''}${mine <= 0 ? ' is-empty' : ''}" style="--mc:${MASTERY_HEX[color]}"${lit ? ` data-mastery-color="${color}" role="button" tabindex="0"` : ''}>
        <div class="mastery-sigil-orb">
          ${masteryRingHtml(value / 50)}
          ${gemSvg([MASTERY_GEM[color]])}
        </div>
        <div class="mastery-sigil-meta">
          <b>${MASTERY_NAME[color]}</b>
          <strong>${mine}</strong>
          <span class="mastery-surge">涌动 ${surgeChancePct(value)}</span>
          ${kingdom > 0 ? `<small class="mastery-kingdom">王国 +${kingdom}</small>` : ''}
        </div>
      </article>`;
    }).join('');
    $('#masteryBody').innerHTML = `${offerHtml}<div class="mastery-sigils">${sigils}</div>
      <footer class="mastery-legend">
        <span><i>3 消</i> 概率翻倍</span>
        <span><i>4 消</i> 永不涌动</span>
        <span><i>5 消</i> 必涌动</span>
        <span>武器解锁只看个人精通</span>
      </footer>`;
  }

  private async pickMastery(color: string): Promise<void> {
    const { result } = await this.ctx.gateway.pickManaMastery(color);
    if (isFailure(result)) {
      toast(result.message);
      return;
    }
    this.ctx.refreshChrome();
    this.renderAll();
    if (!$('#masteryVeil').hidden) this.renderMasteryModal();
  }

  /** 次级页面：完整天赋树（与武器库同款 modal 模式） */
  private openTree(): void {
    const save = this.ctx.save();
    const cls = save.hero.classId ? classById(save.hero.classId) : undefined;
    if (!cls) {
      toast('装备职业后才能配置天赋。');
      return;
    }
    this.renderTalentTree(cls, classLevelOf(save, cls.id));
    $('#treeVeil').hidden = false;
  }

  // —— 天赋树：3 树 × 7 档，每档选一 ——

  private renderTalentTree(cls: ClassDef, level: number): void {
    const board = $('#talentTree');
    const save = this.ctx.save();
    if (!cls) {
      board.innerHTML = '<div class="talent-empty">装备职业后可配天赋</div>';
      $('#treeCount').textContent = '0 / 7 已选';
      return;
    }
    const picks = talentPicksOf(save, cls.id);
    const pickedCount = picks.filter(Boolean).length;

    // 树头
    let html = '<div class="tree-corner"></div>';
    for (const tree of cls.trees) {
      html += `<div class="tree-head"><span>${tree.nameZh}</span><small>${tree.name}</small></div>`;
    }
    // 7 档行：左档位轨 + 三树的该档天赋
    for (let tier = 0; tier < 7; tier++) {
      const need = CHAMPION_TIERS[tier]!;
      const open = tierUnlocked(level, tier);
      html += `<div class="tier-rail${open ? ' on' : ''}"><b>Lv.${need}</b><small>冠军</small></div>`;
      for (const tree of cls.trees) {
        const talent = tree.talents[tier]!;
        const pickedHere = picks[tier] === talent.code;
        const usable = effectUsable(talent);
        const state = pickedHere ? 'picked' : open && usable === 'yes' ? 'pickable' : 'locked';
        const badge = usable !== 'yes' ? '<em class="talent-flag na">暂未开放</em>' : '';
        const description = usable === 'yes' ? talent.descriptionZh : '该天赋尚未开放';
        const icon = traitBadgeSvg(talent.code);
        const iconHtml = icon
          ? `<i class="talent-cell-icon">${icon}</i>`
          : '<i class="talent-cell-icon"></i>';
        // 已选格：正文点击不再取消（防误触丢选取），显式 ✕ 才取消
        const cancel = pickedHere
          ? '<button class="talent-cancel" data-cancel="1" data-tier="' + tier + '" type="button" title="取消选取">✕</button>'
          : '';
        const small = !open ? `冠军 Lv.${need} 解锁` : pickedHere ? '已选' : usable === 'yes' ? '点击选取' : '暂未开放';
        html += `<div class="talent-cell ${state}${usable !== 'yes' ? ' dim' : ''}" data-tier="${tier}" data-code="${talent.code}" data-usable="${usable}"
          role="${open && usable === 'yes' ? 'button' : 'note'}" title="${description}"
          aria-disabled="${!open || usable !== 'yes'}">
          ${cancel}${iconHtml}<b>${talent.nameZh}</b>${badge}
          <small class="talent-desc">${description}</small>
          <small>${small}</small>
        </div>`;
      }
    }
    board.innerHTML = html;
    $('#treeTitle').textContent = `${cls.name} · 天赋树`;
    $('#treeCount').textContent = `${pickedCount} / 7 已选`;
    $$('#talentTree .talent-cell').forEach((cell) => {
      const el = cell as HTMLElement;
      if (el.classList.contains('picked')) return; // 已选格正文点击 = 无操作（防误触取消）
      this.on(el, 'click', () => {
        if (el.classList.contains('locked')) {
          if (el.dataset.usable !== 'yes' && tierUnlocked(level, Number(el.dataset.tier))) {
            toast('该天赋暂未开放，当前不会产生效果。');
          } else {
            toast(`第 ${Number(el.dataset.tier) + 1} 档天赋需要冠军等级 ${CHAMPION_TIERS[Number(el.dataset.tier)!]}。`);
          }
          return;
        }
        void this.talentClicked(cls.id, Number(el.dataset.tier), el.dataset.code!);
      });
    });
    $$('#talentTree [data-cancel]').forEach((btn) => {
      this.on(btn, 'click', (e) => {
        e.stopPropagation();
        void this.cancelTalent(cls.id, Number((btn as HTMLElement).dataset.tier));
      });
    });
  }

  private async talentClicked(classId: string, tier: number, code: string): Promise<void> {
    const save = this.ctx.save();
    const level = classLevelOf(save, classId);
    if (!tierUnlocked(level, tier)) {
      toast(`第 ${tier + 1} 档天赋需要冠军等级 ${CHAMPION_TIERS[tier]}。`);
      return;
    }
    const { result } = await this.ctx.gateway.pickHeroTalent(classId, tier, code);
    if (isFailure(result)) {
      toast(result.message);
      return;
    }
    toast('天赋已生效（免费改配，取消用已选格右上角的 ✕）。');
    this.renderAll();
    this.openTree(); // 次级页保持打开并刷新到最新选取状态
  }

  /** 显式取消档位选取（已选格上的 ✕；正文点击不会触发） */
  private async cancelTalent(classId: string, tier: number): Promise<void> {
    const { result } = await this.ctx.gateway.clearHeroTalent(classId, tier);
    if (isFailure(result)) {
      toast(result.message);
      return;
    }
    toast('已取消该档选取（免费改配）。');
    this.renderAll();
    this.openTree();
  }

  // —— 职业特质 3 槽 ——

  private renderPerks(): void {
    const board = $('#perkBoard');
    const slots = $('#perkSlots');
    const holder = heroTraitSlots(this.ctx.save());
    if (!holder) {
      board.hidden = true;
      return;
    }
    board.hidden = false;
    slots.innerHTML = holder.def.perks
      .map((p, i) => {
        const unlocked = holder.state[i]!;
        // 已实现（引擎静态特质）或已收编（动态定义）都真实生效
        const implemented = p.implemented || TALENT_DYNAMIC_CODES.has(p.code);
        const flag = implemented ? '' : '<em class="talent-flag na">暂未开放</em>';
        const badge = traitBadgeSvg(p.code);
        const icon = badge
          ? `<span class="perk-symbol">${badge}</span>`
          : '<span class="perk-symbol perk-symbol-fallback" data-icon="sparkles"></span>';
        const action = !implemented
          ? '<span class="perk-state is-locked">暂未开放</span>'
          : unlocked
            ? '<span class="perk-state"><i></i>生效中</span>'
            : `<button class="ghost perk-unlock" data-slot="${i + 1}" type="button">解锁</button>`;
        const description = implemented ? p.descriptionZh : '该特质尚未开放';
        return `<div class="perk-slot${unlocked ? ' on' : ''}${implemented ? '' : ' dim locked'}" data-perk="${i}" role="button" tabindex="0" aria-label="${p.nameZh}：${description}">
          ${icon}
          <div class="perk-copy">
            <div class="perk-head"><b>${p.nameZh}</b>${flag}<i>特质 ${i + 1}</i></div>
            <small><span>${implemented ? '效果' : '状态'}</span>${description}</small>
          </div>
          <div class="perk-foot">${action}</div>
        </div>`;
      })
      .join('');
    mountIcons(slots);
    $$('#perkSlots [data-slot]').forEach((btn) => {
      this.on(btn, 'click', (e) => {
        e.stopPropagation();
        void this.perkClicked(Number((btn as HTMLElement).dataset.slot));
      });
    });
    $$('#perkSlots [data-perk]').forEach((slot) => {
      const open = () => this.openPerkDetail(Number((slot as HTMLElement).dataset.perk));
      this.on(slot, 'click', open);
      this.on(slot, 'keydown', (e) => {
        const key = (e as KeyboardEvent).key;
        if (key !== 'Enter' && key !== ' ') return;
        e.preventDefault();
        open();
      });
    });
  }

  private openPerkDetail(index: number): void {
    const holder = heroTraitSlots(this.ctx.save());
    const perk = holder?.def.perks[index];
    if (!holder || !perk) return;
    const unlocked = holder.state[index]!;
    const implemented = perk.implemented || TALENT_DYNAMIC_CODES.has(perk.code);
    $('#perkDetailTitle').textContent = perk.nameZh;
    $('#perkDetailState').textContent = !implemented
      ? '暂未开放 · 当前不会产生效果'
      : unlocked
        ? '已解锁 · 当前出战生效'
        : `特质 ${index + 1} · 尚未解锁`;
    $('#perkDetailText').textContent = implemented ? perk.descriptionZh : '该特质尚未开放。';
    $('#perkDetailAction').innerHTML = !implemented
      ? '<span class="perk-detail-active is-locked">暂未开放</span>'
      : unlocked
        ? '<span class="perk-detail-active">● 生效中</span>'
        : `<button class="perk-detail-unlock primary" data-detail-unlock="${index + 1}" type="button">解锁特质</button>`;
    const unlock = $('#perkDetailAction').querySelector<HTMLElement>('[data-detail-unlock]');
    if (unlock) {
      this.on(unlock, 'click', () => {
        $('#perkVeil').hidden = true;
        void this.perkClicked(index + 1);
      });
    }
    $('#perkVeil').hidden = false;
  }

  private async perkClicked(slot: number): Promise<void> {
    const { result } = await this.ctx.gateway.unlockHeroTrait(slot);
    if (isFailure(result)) {
      toast(result.message);
      return;
    }
    toast(`特质槽 ${slot} 已解锁（金 ${result.cost.gold} + 灵魂 ${result.cost.souls}）。`);
    this.renderAll();
  }

  // —— 职业圣殿 ——

  private renderClasses(): void {
    const save = this.ctx.save();
    const grid = $('#classList');
    const ordered = [...CLASSES].sort((a, b) => {
      const rank = (c: ClassDef) => c.id === save.hero.classId ? 0 : save.hero.unlockedClasses.includes(c.id) ? 1 : 2;
      return rank(a) - rank(b);
    });
    const classButton = (c: ClassDef, compact = false): string => {
      const unlocked = save.hero.unlockedClasses.includes(c.id);
      const equipped = save.hero.classId === c.id;
      const level = classLevelOf(save, c.id);
      const wins = classWinsOf(save, c.id);
      const small = equipped
        ? `冠军 Lv.${level} · ${wins} 胜 · 装备中`
        : unlocked
          ? `冠军 Lv.${level} · ${wins} 胜`
          : classUnlockText(c.id);
      return `<button class="class-btn${equipped ? ' on' : ''}${unlocked ? '' : ' lock'}" data-id="${c.id}" data-kind="${CLASS_ICON[c.id] ?? 'helmet'}" type="button" title="${c.nameEn}"${compact ? ' data-preview="true"' : ''}>
        <span data-icon="${CLASS_ICON[c.id] ?? 'helmet'}"></span>
        <b>${c.name}</b>
        <small>${small}</small>
      </button>`;
    };
    grid.innerHTML = ordered.map((c) => classButton(c)).join('');
    mountIcons(grid);
    const current = save.hero.classId ? classById(save.hero.classId) : undefined;
    const currentEl = $('#classCurrent');
    if (currentEl) {
      currentEl.innerHTML = current
        ? `<div class="class-current-emblem" data-kind="${CLASS_ICON[current.id] ?? 'helmet'}"><span data-icon="${CLASS_ICON[current.id] ?? 'helmet'}"></span></div>
           <div class="class-current-copy"><b>${current.name}</b><small>${current.kingdom} · 当前装备职业</small></div>
           <div class="class-current-level"><b>冠军 Lv.${classLevelOf(save, current.id)}</b><small>${classWinsOf(save, current.id)} / ${CLASS_WEAPON_WINS} 胜</small></div>`
        : `<div class="class-current-empty"><span data-icon="helmet"></span><div><b>尚未装备职业</b><small>从职业圣殿选择已解锁职业</small></div></div>`;
      mountIcons(currentEl);
    }
    $('#classUnlockCount').textContent = `${save.hero.unlockedClasses.length} / ${CLASSES.length} 已解锁`;
    $('#classModalCount').textContent = `${save.hero.unlockedClasses.length} / ${CLASSES.length} 已解锁`;
    $('#classExpand').textContent = '选择职业';
    $$('#classList [data-id]').forEach((btn) =>
      this.on(btn, 'click', () => void this.classClicked((btn as HTMLElement).dataset.id!)),
    );
  }

  private async classClicked(classId: string): Promise<void> {
    const save = this.ctx.save();
    const def = classById(classId);
    if (!save.hero.unlockedClasses.includes(classId)) {
      toast(`${def?.name ?? classId}未解锁 · ${classUnlockText(classId)}。`);
      return;
    }
    if (save.hero.classId === classId) {
      toast(`当前职业：${def?.name} · 冠军 Lv.${classLevelOf(save, classId)} · ${classWinsOf(save, classId)} 胜`);
      return;
    }
    const { result } = await this.ctx.gateway.equipHeroClass(classId);
    if (isFailure(result)) {
      toast(result.message);
      return;
    }
    toast(`已装备职业「${def?.name}」· 天赋树与职业特质随之切换。`);
    this.renderAll();
  }

  // —— 武器 ——

  private weaponState(w: WeaponDef): 'equipped' | 'usable' | 'locked' {
    const save = this.ctx.save();
    if (save.hero.equippedWeapon === w.id) return 'equipped';
    return canUseWeapon(save, w) ? 'usable' : 'locked';
  }

  /**
   * 获取途径（**唯一出口**，H-9 的三处重复且自相矛盾在此收口）。
   *
   * 旧实现有两套口径打架：`sourceText()` 按 `unlockLevel` 输出「主角 Lv.1 解锁」，
   * 而 `weaponCatalog` 给所有目录武器写死 `unlockLevel: 1` → 一把 130 万灵魂的神话武器
   * 同屏既写「熔炉锻造获得」又写「主角 Lv.1 解锁」。现在只按真实途径回答。
   */
  private sourceText(w: WeaponDef): string {
    const acquire = acquireOf(w);
    return acquire.label;
  }

  private rarityClsOfRarity(rarity: string): { cn: string; cls: string } {
    const meta = rarityMetaByKey(rarity);
    return { cn: meta.label, cls: `r-${meta.className}` };
  }

  /** 稀有度：假数据退役后武器全部自带官方 rarity，不再有「按解锁档推导」的第二口径 */
  private rarityOf(w: WeaponDef): { cn: string; cls: string } {
    return this.rarityClsOfRarity(w.rarity);
  }

  private spellSheet(w: WeaponDef, extraHead?: string): string {
    const colors = w.manaColors.map((c) => c.toLowerCase());
    const parsed = renderSpell(w.description, heroStatsOf(this.ctx.save()).magic);
    this.sheetFormulas = parsed.formulas;
    const first = parsed.formulas[0];
    const bar = first
      ? `<div class="formula"><span>${formulaKind(first.unit)}</span><strong>${formulaRule(first.expr)}</strong></div>`
      : '';
    return `
      <article class="weapon-spell">
        <header class="wspell-head">
          <div class="wspell-mark">${gemSvg(colors)}<b>${w.manaCost}</b></div>
          <div class="wspell-title"><h3>${spaced(w.name)}</h3></div>
          ${extraHead ?? ''}
        </header>
        <div class="wspell-body">
          <p class="spell-copy">${parsed.html}</p>
          ${bar}
          <div class="spell-tip" hidden><i class="spell-tip-arrow" aria-hidden="true"></i><small></small><em></em><ul></ul></div>
        </div>
      </article>`;
  }

  /**
   * 词缀与解锁档（H-5 的一部分）。
   *
   * 数据一直都在（`weapons.json` 侧 710/718 把有 affixes），此前被 `weaponCatalog.ts`
   * 的 `affixes: []` 整列丢弃。解锁档走 `forge.affixUnlockedCount`（普通 4 档 5/10/15/20、
   * Doomed 5 档 4/8/12/16/20）。
   *
   * **诚实标注**：词缀的战斗语义是 `WEAPON-FORGE-DESIGN` 里程碑 F4，尚未实现——
   * 面板必须写明「展示口径」，不能让玩家以为已经在打（`06-forge.md` 的「确实缺源」第 2 项）。
   */
  private affixList(w: WeaponDef): string {
    if (w.affixes.length === 0) return '';
    const level = temperingLevelOf(this.ctx.save(), w.id);
    const unlocked = affixUnlockedCount(w.rarity, level);
    const levels = w.rarity === 'Doomed' ? DOOMED_AFFIX_UNLOCK_LEVELS : AFFIX_UNLOCK_LEVELS;
    const rows = w.affixes
      .map((affix, i) => {
        const need = levels[i];
        const on = i < unlocked;
        return `<li class="${on ? 'on' : 'off'}">
          <span class="affix-gate">${on ? '●' : '🔒'} ${need === undefined ? '—' : `Lv.${need}`}</span>
          <b>${affix.name}</b>
          <small>${affix.description}</small>
        </li>`;
      })
      .join('');
    return `<section class="detail-affixes">
      <div class="ink-rule"><i></i><span>淬炼词缀 ${unlocked} / ${w.affixes.length}</span><i></i></div>
      <ul>${rows}</ul>
      <small class="affix-note">词缀效果二期生效（当前仅解锁展示）</small>
    </section>`;
  }

  /** 绑定一个 weapon-spell 面板的数值点击 → 计算过程浮层（小样同款交互） */
  private bindSheetTips(sheet: HTMLElement): void {
    const magic = heroStatsOf(this.ctx.save()).magic;
    const copy = sheet.querySelector<HTMLElement>('.spell-copy');
    const body = sheet.querySelector<HTMLElement>('.wspell-body');
    const tip = sheet.querySelector<HTMLElement>('.spell-tip');
    const bar = sheet.querySelector<HTMLElement>('.formula');
    if (!copy || !body || !tip) return;
    const formulas = this.sheetFormulas;
    copy.querySelectorAll<HTMLElement>('.spell-stat').forEach((btn, i) => {
      this.on(btn, 'click', (e) => {
        e.stopPropagation();
        const formula = formulas[i];
        if (!formula) return;
        if (btn.getAttribute('aria-expanded') === 'true') {
          this.closeSheetTip(sheet);
          return;
        }
        const parts = formulaParts(formula.expr, magic);
        tip.querySelector('small')!.textContent = formulaKind(formula.unit) + '计算';
        tip.querySelector('em')!.textContent = formulaRule(formula.expr);
        tip.querySelector('ul')!.innerHTML =
          parts.rows.map((row) => `<li><span>${row.label}</span><b>${row.value}</b></li>`).join('') +
          `<li class="sum"><span>合计</span><b>${parts.total ?? '—'}</b></li>`;
        copy.querySelectorAll<HTMLElement>('.spell-stat').forEach((el) =>
          el.setAttribute('aria-expanded', el === btn ? 'true' : 'false'),
        );
        if (bar) bar.style.visibility = 'hidden';
        tip.hidden = false;
        const stage = document.getElementById('stage');
        const scale = stage?.classList.contains('hero-responsive')
          ? 1
          : Math.min(innerWidth / 1600, innerHeight / 900) || 1;
        const box = body.getBoundingClientRect();
        const r = btn.getBoundingClientRect();
        const maxW = box.width / scale - 28;
        const width = Math.min(268, maxW);
        let left = (r.left - box.left) / scale + (r.width / scale) / 2 - width / 2;
        left = Math.max(14, Math.min(left, box.width / scale - width - 14));
        tip.style.left = `${left}px`;
        tip.style.top = `${(r.bottom - box.top) / scale + 8}px`;
        tip.style.width = `${width}px`;
        const arrow = tip.querySelector<HTMLElement>('.spell-tip-arrow');
        if (arrow) arrow.style.left = `${(r.left + r.width / 2 - box.left) / scale - left}px`;
      });
    });
  }

  private closeSheetTip(sheet: HTMLElement): void {
    const tip = sheet.querySelector<HTMLElement>('.spell-tip');
    const bar = sheet.querySelector<HTMLElement>('.formula');
    if (bar) bar.style.visibility = '';
    if (tip) tip.hidden = true;
    sheet.querySelectorAll<HTMLElement>('.spell-stat').forEach((el) => el.setAttribute('aria-expanded', 'false'));
  }

  private renderSlab(): void {
    const save = this.ctx.save();
    const w = anyWeaponById(save.hero.equippedWeapon);
    if (!w) {
      $('#weaponSlab').innerHTML = '<div class="slab-body"><div class="plate-caption"><b>未装备武器</b><span>去武器库选择一把</span></div></div>';
      return;
    }
    const rarity = this.rarityOf(w);
    // 分母诚实（H-4）：这里是「我拥有的把数」，不是假的 5 / 730
    const owned = ownedWeaponIds(save).length;
    const plateArt = weaponArtHtml(w);
    $('#weaponSlab').innerHTML = `
      <div class="slab-body ${rarity.cls}">
        <div class="weapon-plate" aria-label="${w.name}武器立绘">
          <div class="plate-art">${plateArt}</div>
        </div>
        ${this.spellSheet(w, `<div class="weapon-slab-actions"><button class="secondary" id="swapWeapon" type="button"><span data-icon="bag"></span>武器库 <i>${owned}</i></button><button class="secondary" id="weaponCodex" type="button"><span data-icon="book"></span>武器图鉴</button></div>`)}
      </div>`;
    mountIcons($('#weaponSlab'));
    const slabSheet = document.querySelector('#weaponSlab .weapon-spell') as HTMLElement | null;
    if (slabSheet) this.bindSheetTips(slabSheet);
    $('#swapWeapon').onclick = () => this.ctx.navigate('#weapons/owned');
    const codexBtn = document.getElementById('weaponCodex');
    if (codexBtn) codexBtn.onclick = () => this.ctx.navigate('#weapons/all');
  }

  private openVault(): void {
    const save = this.ctx.save();
    this.pickedWeaponId = save.hero.equippedWeapon;
    this.closeSpellTips();
    $('#vaultVeil').hidden = false;
    this.renderRack();
    this.renderVaultDetail();
  }

  private renderRack(): void {
    if (this.forgeMode) {
      this.renderRecipes();
      return;
    }
    const save = this.ctx.save();
    const rack = $('#vaultRack');
    // 列表 = 我拥有的武器（起始池 22 把 ∪ 已锻造的目录武器）——全部官方卡面，零剪影（UX-2）
    const tiles = ownedWeapons(save);
    rack.innerHTML = tiles.map((w) => {
      const state = this.weaponState(w);
      const rarity = this.rarityOf(w);
      const flag =
        state === 'equipped'
          ? '<em class="tile-flag">装备中</em>'
          : state === 'locked'
            ? '<em class="tile-flag lock"><span data-icon="lock"></span>不可装备</em>'
            : '';
      return `<button class="rack-tile ${rarity.cls} is-${state === 'usable' ? 'owned' : state}${this.pickedWeaponId === w.id ? ' picked' : ''}" data-weapon="${w.id}" type="button" role="option" aria-selected="${this.pickedWeaponId === w.id}">
        <span class="tile-rarity">${rarity.cn}</span>
        <div class="tile-art">${weaponArtHtml(w, true)}</div>
        ${flag}
        <b class="tile-name">${w.name}</b>
        <span class="tile-mana">${gemSvg(w.manaColors.map((c) => c.toLowerCase()))}<i>${w.manaCost}</i></span>
      </button>`;
    }).join('');
    mountIcons(rack);
    $$('#vaultRack [data-weapon]').forEach((btn) =>
      this.on(btn, 'click', () => {
        this.pickedWeaponId = (btn as HTMLElement).dataset.weapon!;
        this.renderRack();
        this.renderVaultDetail();
      }),
    );
    // 分母诚实（H-4）：拥有 N / 目录全量 718，不再是「首批 20 + 可装备 710」拼出来的假 730
    $('#vaultOwned').textContent = String(tiles.length);
    $('#vaultTotal').textContent = String(ALL_CATALOG_WEAPONS.length);
  }

  /** 熔炉配方列表（forgeMode） */
  private renderRecipes(): void {
    const save = this.ctx.save();
    const rack = $('#vaultRack');
    rack.innerHTML = SOULFORGE_RECIPES.map(({ recipe: r }) => {
      const owned = ownsWeapon(save, r.weaponId);
      const cat = anyWeaponById(r.weaponId);
      // 名称单源（F-4）：熔炉不再用自己那套翻译（9 配方里 6 个与目录官方名不一致）
      const name = cat?.name ?? r.name;
      const rarity = this.rarityClsOfRarity(cat?.rarity ?? r.rarity);
      const can = save.currencies.souls >= r.souls && save.currencies.gold >= r.gold && save.hero.level >= forgeTierUnlockLevel(r.tier) && !owned;
      return `<button class="rack-tile ${rarity.cls} is-owned${this.pickedRecipeId === r.weaponId ? ' picked' : ''}" data-recipe="${r.weaponId}" type="button">
        <span class="tile-rarity">${rarity.cn}</span>
        <div class="tile-art">${cat ? weaponArtHtml(cat, true) : ''}</div>
        ${owned ? '<em class="tile-flag">已拥有</em>' : ''}
        <b class="tile-name">${name}</b>
        <span class="tile-mana"><i>${r.souls.toLocaleString()} 魂 + ${r.gold.toLocaleString()} 金</i></span>
        ${can ? '' : '<em class="tile-flag lock">材料/等级不足</em>'}
      </button>`;
    }).join('');
    $('#vaultOwned').textContent = String(ownedWeaponIds(save).length);
    $('#vaultTotal').textContent = String(ALL_CATALOG_WEAPONS.length);
    $$('#vaultRack [data-recipe]').forEach((btn) =>
      this.on(btn, 'click', () => {
        this.pickedRecipeId = (btn as HTMLElement).dataset.recipe!;
        this.renderRecipes();
        this.renderRecipeDetail();
      }),
    );
    if (this.pickedRecipeId) this.renderRecipeDetail();
  }

  /** 熔炉配方详情 + 锻造按钮（forgeMode） */
  private renderRecipeDetail(): void {
    const save = this.ctx.save();
    const recipe = SOULFORGE_RECIPES.find((r) => r.recipe.weaponId === this.pickedRecipeId)?.recipe ?? null;
    const detail = $('#vaultDetail');
    if (!recipe) {
      detail.className = 'vault-detail';
      detail.innerHTML = '<div class="detail-source">左侧选择一份熔炉配方</div>';
      return;
    }
    const cat = anyWeaponById(recipe.weaponId);
    // 名称与稀有度单源取目录（F-4：熔炉那套翻译与目录官方名 9 配方里 6 个不一致）
    const name = cat?.name ?? recipe.name;
    const rarity = this.rarityClsOfRarity(cat?.rarity ?? recipe.rarity);
    const owned = ownsWeapon(save, recipe.weaponId);
    const ok = save.currencies.souls >= recipe.souls && save.currencies.gold >= recipe.gold && save.hero.level >= forgeTierUnlockLevel(recipe.tier) && !owned;
    detail.className = 'vault-detail ' + rarity.cls;
    detail.innerHTML = `
      <div class="detail-art ${rarity.cls}">
        <i class="plate-lamp"></i>
        <i class="plate-corner tl"></i><i class="plate-corner tr"></i>
        <i class="plate-corner bl"></i><i class="plate-corner br"></i>
        ${cat ? weaponArtHtml(cat) : ''}
      </div>
      <div class="detail-rarity ${rarity.cls}"><i></i><span>${rarity.cn} · Tier ${recipe.tier}</span><i></i></div>
      <h3 class="detail-name">${name}</h3>
      <p class="detail-source">熔炉锻造 · ${SOULFORGE_RECIPES.find((r) => r.recipe.weaponId === recipe.weaponId)?.source ?? ''}</p>
      <p class="detail-source">消耗：灵魂 ${recipe.souls.toLocaleString()}（持有 ${save.currencies.souls.toLocaleString()}）· 黄金 ${recipe.gold.toLocaleString()}（持有 ${save.currencies.gold.toLocaleString()}）· 需主角 Lv.${forgeTierUnlockLevel(recipe.tier)}</p>
      <button class="primary" id="doForge" type="button" ${ok ? '' : 'disabled'}>锻 造</button>`;
    const doForge = $('#doForge');
    if (doForge)
      doForge.onclick = () => void (async () => {
        const { result } = await this.ctx.gateway.forgeCatalogWeapon(recipe.weaponId);
        if (isFailure(result)) {
          toast(result.message);
          return;
        }
        toast(`锻造成功：「${name}」已入武器库，可直接装备。`);
        this.renderAll();
        this.openVault();
        this.forgeMode = true;
        this.pickedRecipeId = recipe.weaponId;
        this.renderRecipes();
        this.renderRecipeDetail();
      })();
  }

  private renderVaultDetail(): void {
    const w = anyWeaponById(this.pickedWeaponId) ?? STARTER_WEAPONS[0]!;
    const state = this.weaponState(w);
    const rarity = this.rarityOf(w);
    const art = weaponArtHtml(w);
    // 来源只印一次、只有一个口径（H-9：旧实现同屏印三次且目录武器自相矛盾）
    const source = this.sourceText(w);
    const action =
      state === 'equipped'
        ? '<button class="primary" disabled type="button"><span data-icon="check"></span>已装备</button>'
        : state === 'usable'
          ? '<button class="primary" id="equipWeapon" type="button"><span data-icon="swords"></span>装 备</button>'
          : '<button class="primary" disabled type="button"><span data-icon="lock"></span>不可装备</button>';
    const detail = $('#vaultDetail');
    detail.className = 'vault-detail ' + rarity.cls;
    detail.innerHTML = `
      <div class="detail-art ${rarity.cls}${state === 'locked' ? ' is-locked' : ''}">
        <i class="plate-lamp"></i>
        <i class="plate-corner tl"></i><i class="plate-corner tr"></i>
        <i class="plate-corner bl"></i><i class="plate-corner br"></i>
        ${art}
        ${state === 'locked' ? '<span class="detail-rank lock"><span data-icon="lock"></span></span>' : ''}
      </div>
      <div class="detail-rarity ${rarity.cls}"><i></i><span>${rarity.cn}</span><i></i></div>
      <h3 class="detail-name">${w.name}<small class="detail-name-en">${w.nameEn}</small></h3>
      <!-- H-5：武器详情此前零属性；四维与词缀的数据一直都在 weapons.json 里，
           是 weaponCatalog 建 def 时没搬（affixes 写死 []）——本批已补搬 -->
      <div class="detail-stats" role="group" aria-label="武器属性加成">
        <span title="攻击"><span data-icon="swords"></span><b>+${w.attack}</b></span>
        <span title="护甲"><span data-icon="shield"></span><b>+${w.armor}</b></span>
        <span title="生命"><span data-icon="heart"></span><b>+${w.health}</b></span>
        <span title="魔力"><span data-icon="orb"></span><b>+${w.magic}</b></span>
      </div>
      ${this.spellSheet(w)}
      ${this.affixList(w)}
      <p class="detail-source">${source}</p>
      ${action}`;
    mountIcons(detail);
    const detailSheet = detail.querySelector('.weapon-spell') as HTMLElement | null;
    if (detailSheet) this.bindSheetTips(detailSheet);
    const equip = $('#equipWeapon');
    if (equip)
      equip.onclick = () => void (async () => {
        const { result } = await this.ctx.gateway.equipHeroWeapon(w.id);
        if (isFailure(result)) {
          toast(result.message);
          return;
        }
        this.renderAll();
        this.openVault();
        toast(`已装备「${w.name}」· 主角法力颜色与法术随之改变。`);
      })();
  }

  private closeSpellTips(): void {
    $$('.weapon-spell').forEach((sheet) => this.closeSheetTip(sheet));
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
