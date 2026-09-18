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
  tierUnlocked,
  type ClassDef,
  type TalentDef,
} from '../data/classes';
import { WEAPONS, type WeaponDef } from '../data/weapons';
import { canUseWeapon, classLevelOf, heroStatsOf } from '../systems/hero';
import { heroTraitSlots, talentPicksOf } from '../systems/talents';
import { traitBadgeSvg } from '../../render/traitBadges';
import { TALENT_DYNAMIC_CODES } from '../data/talentDefs';
import { bottomNavHtml, gemSvg, mountIcons, toast, toastHtml, topbarHtml, $, $$ } from '../shell/chrome';
import { isFailure } from '../gateway';
import type { Screen, ShellCtx } from '../shell/screen';
import { mountWeaponDefs, weaponArt } from '../shell/weaponIcons';
import { formulaKind, formulaParts, formulaRule, renderSpell } from '../shell/spellText';

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

const RARITY: Record<string, { cn: string; cls: string }> = {
  common: { cn: '普通', cls: 'r-common' },
  rare: { cn: '稀有', cls: 'r-rare' },
  epicplus: { cn: '史诗上', cls: 'r-epicplus' },
  epic: { cn: '史诗', cls: 'r-epic' },
  legend: { cn: '传说', cls: 'r-legend' },
  mythic: { cn: '神话', cls: 'r-mythic' },
};

/** 武器展示分类（weaponType → 剪影种类） */
function weaponKind(w: WeaponDef): string {
  switch (w.weaponType) {
    case 'axe': return 'axe';
    case 'dagger': return 'dagger';
    case 'bow': return 'bow';
    case 'tome': return 'tome';
    case 'mace': case 'hammer': return 'mace';
    case 'staff': return 'staff';
    case 'shield': return 'shield';
    case 'scythe': return 'scythe';
    case 'polearm': return 'spear';
    case 'jewellery': case 'relic': return 'ring';
    default: return 'sword';
  }
}

const spaced = (s: string): string => s.split('').join(' ');

/** 天赋效果是否实际产出数值（UI 灰显「未实现/不适用」标）；动态定义批视为已生效 */
function effectUsable(t: TalentDef): 'yes' | 'no' | 'na' {
  if (t.effect.kind === 'pvp') return 'na';
  if (t.effect.kind === 'unimplemented') return TALENT_DYNAMIC_CODES.has(t.code) ? 'yes' : 'no';
  return 'yes';
}

export class HeroScreen implements Screen {
  private ctx!: ShellCtx;
  private pickedWeaponId: string | null = null;
  private listeners: Array<[EventTarget, string, EventListenerOrEventListenerObject]> = [];
  /** 最近一次 spellSheet 渲染的公式集（bindSheetTips 消费） */
  private sheetFormulas: ReturnType<typeof renderSpell>['formulas'] = [];

  html(): string {
    return `
      ${topbarHtml()}
      <div class="screen hero-screen">
        <section class="panel hero-card">
          <img src="/meta/assets/seiji.webp" alt="法露特">
          <div class="shade"></div>
          <div class="hero-name">
            <small>冒 险 者</small>
            <b>法 露 特</b>
            <div class="hero-stats" id="heroStats"></div>
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
                    <b class="level-num" id="careerLevel">Lv.0</b>
                  </span>
                </div>
                <p id="careerHint">通关王国任务链解锁职业</p>
              </div>
            </div>
            <div class="class-head-track">
              <div class="meta">冠军经验 <b id="classXpText">0</b></div>
              <div class="class-xp"><i id="classXpFill"></i></div>
              <span class="next-reward" id="nextReward">—</span>
            </div>
          </div>
          <section class="weapon-slab" id="weaponSlab" aria-label="已装备武器"></section>
          <section class="perk-board career-perks-legacy" id="perkBoardCareerLegacy">
            <div class="section-title">
              <div><h3>职业特质</h3><small>金币与灵魂解锁 · 按顺序解锁 · 只对装备中的职业生效</small></div>
            </div>
            <div class="perk-slots" id="perkSlotsCareerLegacy"></div>
          </section>
          <section class="talent-board">
            <div class="section-title">
              <div><h3>天赋路径</h3><small>冠军等级解锁档位 · 每档三树选一 · 随时免费改配</small></div>
              <button class="ghost" id="openTree" type="button">查看完整天赋树</button>
            </div>
            <div class="talent-path" id="talentPath" aria-label="0 / 7 已选"></div>
          </section>
          <section class="perk-board perk-board-legacy" id="perkBoardLegacy">
            <div class="section-title">
              <div><h3>职业特质</h3><small>金 + 灵魂解锁 · 顺序解锁 · 只对装备中的职业生效</small></div>
            </div>
            <div class="perk-slots" id="perkSlotsLegacy"></div>
          </section>
          <section class="class-vault" id="classes">
            <div class="section-title">
              <div><h3>职业圣殿</h3><small>通关对应王国任务链 8 关解锁</small></div>
              <div class="class-vault-actions">
                <span id="classUnlockCount">0 / 38 已解锁</span>
                <button class="ghost class-expand" id="classExpand" type="button" aria-haspopup="dialog">选择职业</button>
              </div>
            </div>
            <div class="career-perks" id="perkBoard">
              <div class="perk-summary-head">
                <b>职业特质</b>
                <span>特质效果随当前职业生效</span>
              </div>
              <div class="perk-slots" id="perkSlots"></div>
            </div>
          </section>
        </section>
      </div>
      ${bottomNavHtml('英雄', '职业由王国任务链解锁')}
      ${toastHtml()}

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
              <p>武器是主角唯一的施法手段 · 决定法力色、耗蓝与法术</p>
            </div>
            <div class="vault-count">已获得 <b id="vaultOwned">0</b> / <i id="vaultTotal">0</i></div>
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
    mountWeaponDefs();
    this.bind('#vaultClose', 'click', () => ($('#vaultVeil').hidden = true));
    this.on($('#vaultVeil'), 'click', (e) => {
      if (e.target === $('#vaultVeil')) $('#vaultVeil').hidden = true;
    });
    this.bind('#openTree', 'click', () => this.openTree());
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
    });
    this.renderAll();
  }

  private renderAll(): void {
    const save = this.ctx.save();
    const hero = save.hero;
    const stats = heroStatsOf(save);
    const cls = hero.classId ? classById(hero.classId) : undefined;
    const level = hero.classId ? classLevelOf(save, hero.classId) : 0;

    // —— 主角卡与职业头 ——
    $('#heroStats').innerHTML = `
      <span title="攻击"><span data-icon="swords"></span><b>${stats.attack}</b></span>
      <span title="护甲"><span data-icon="shield"></span><b>${stats.armor}</b></span>
      <span title="生命"><span data-icon="heart"></span><b>${stats.health}</b></span>
      <span title="魔力"><span data-icon="orb"></span><b>${stats.magic}</b></span>`;
    $('#careerName').textContent = cls?.name ?? '无职业';
    $('#careerLevel').textContent = `Lv.${level}`;
    const levelTier = level >= 60 ? 5 : level >= 40 ? 4 : level >= 20 ? 3 : level >= 10 ? 2 : 1;
    $('#careerBadge').className = `career-level-badge level-tier-${levelTier}`;
    if (cls) {
      const need = classXpToNext(level);
      const xp = hero.classXp[cls.id] ?? 0;
      $('#careerHint').innerHTML = `冠军经验来自携带主角的胜场 · 再获得 <b>${Math.max(0, need - xp)}</b> 点升级`;
      $('#classXpText').textContent = `${xp} / ${need}`;
      ($('#classXpFill') as HTMLElement).style.width = `${Math.min(100, (xp / need) * 100)}%`;
      const nextTier = CHAMPION_TIERS.find((t) => t > level);
      $('#nextReward').textContent = nextTier ? `Lv.${nextTier} 解锁第 ${CHAMPION_TIERS.indexOf(nextTier) + 1} 档天赋` : '天赋已全部解锁';
    } else {
      $('#careerHint').textContent = '通关王国任务链解锁职业';
      $('#classXpText').textContent = '0';
      ($('#classXpFill') as HTMLElement).style.width = '0%';
      $('#nextReward').textContent = '—';
    }

    this.renderTalentPath(cls ?? null, level);
    this.renderPerks();
    this.renderClasses();
    this.renderSlab();
  }

  // —— 天赋路径（V5 小样：横向节点摘要）——

  /** 档位节点图标（game-icons 键；V5 五档版为 shield/swords/heart/banner/crown） */
  private static readonly TIER_ICONS = ['shield', 'swords', 'heart', 'banner', 'crown', 'swirl', 'skull'];

  private renderTalentPath(cls: ClassDef | null, level: number): void {
    const path = $('#talentPath');
    const save = this.ctx.save();
    if (!cls) {
      path.innerHTML = '<div class="talent-node"><span data-icon="helmet"></span><b>待解锁</b><small>装备职业后点亮天赋</small></div>';
      mountIcons(path);
      path.setAttribute('aria-label', '0 / 7 已选');
      return;
    }
    const picks = talentPicksOf(save, cls.id);
    const pickedCount = picks.filter(Boolean).length;
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
      html += `<div class="tier-rail${open ? ' on' : ''}"><b>${need}</b><small>级</small></div>`;
      for (const tree of cls.trees) {
        const talent = tree.talents[tier]!;
        const pickedHere = picks[tier] === talent.code;
        const usable = effectUsable(talent);
        const state = pickedHere ? 'picked' : open ? 'pickable' : 'locked';
        const badge =
          usable === 'no' ? '<em class="talent-flag na">未实现</em>' : usable === 'na' ? '<em class="talent-flag na">PvP</em>' : '';
        const icon = traitBadgeSvg(talent.code);
        const iconHtml = icon
          ? `<i class="talent-cell-icon">${icon}</i>`
          : '<i class="talent-cell-icon"></i>';
        // 已选格：正文点击不再取消（防误触丢选取），显式 ✕ 才取消
        const cancel = pickedHere
          ? '<button class="talent-cancel" data-cancel="1" data-tier="' + tier + '" type="button" title="取消选取">✕</button>'
          : '';
        const small = open ? (pickedHere ? '已选' : '点击选取') : `Lv.${need} 解锁`;
        html += `<div class="talent-cell ${state}${usable !== 'yes' ? ' dim' : ''}" data-tier="${tier}" data-code="${talent.code}"
          role="${open ? 'button' : 'note'}" title="${talent.descriptionZh}"
          aria-disabled="${!open}">
          ${cancel}${iconHtml}<b>${talent.nameZh}</b>${badge}
          <small class="talent-desc">${talent.descriptionZh}</small>
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
          toast(`第 ${Number(el.dataset.tier) + 1} 档天赋需要冠军等级 ${CHAMPION_TIERS[Number(el.dataset.tier)!]}。`);
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
        const flag = implemented ? '' : '<em class="talent-flag na">未实现</em>';
        const badge = traitBadgeSvg(p.code);
        const icon = badge
          ? `<span class="perk-symbol">${badge}</span>`
          : '<span class="perk-symbol perk-symbol-fallback" data-icon="sparkles"></span>';
        const action = unlocked
          ? '<span class="perk-state"><i></i>生效中</span>'
          : `<button class="ghost perk-unlock" data-slot="${i + 1}" type="button">解锁</button>`;
        return `<div class="perk-slot${unlocked ? ' on' : ''}${implemented ? '' : ' dim'}" data-perk="${i}" role="button" tabindex="0" aria-label="${p.nameZh}：${p.descriptionZh}">
          ${icon}
          <div class="perk-copy">
            <div class="perk-head"><b>${p.nameZh}</b>${flag}<i>特质 ${i + 1}</i></div>
            <small><span>效果</span>${p.descriptionZh}</small>
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
    $('#perkDetailTitle').textContent = perk.nameZh;
    $('#perkDetailState').textContent = unlocked ? '已解锁 · 当前出战生效' : `特质 ${index + 1} · 尚未解锁`;
    $('#perkDetailText').textContent = perk.descriptionZh;
    $('#perkDetailAction').innerHTML = unlocked
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
    grid.innerHTML = ordered.map((c) => {
      const unlocked = save.hero.unlockedClasses.includes(c.id);
      const equipped = save.hero.classId === c.id;
      const level = classLevelOf(save, c.id);
      const small = equipped ? `Lv.${level} · 装备中` : unlocked ? `Lv.${level}` : `${c.kingdom} 8 关`;
      return `<button class="class-btn${equipped ? ' on' : ''}${unlocked ? '' : ' lock'}" data-id="${c.id}" data-kind="${CLASS_ICON[c.id] ?? 'helmet'}" type="button" title="${c.nameEn}">
        <span data-icon="${CLASS_ICON[c.id] ?? 'helmet'}"></span>
        <b>${c.name}</b>
        <small>${small}</small>
      </button>`;
    }).join('');
    mountIcons(grid);
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
      toast(`${def?.name ?? classId}未解锁 · 通关 ${def?.kingdom ?? ''} 任务链 8 关。`);
      return;
    }
    if (save.hero.classId === classId) {
      toast(`当前职业：${def?.name} Lv.${classLevelOf(save, classId)}`);
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

  private sourceText(w: WeaponDef): string {
    if (w.classId === null) return `主角 Lv.${w.unlockLevel} 解锁`;
    const cls = CLASSES.find((c) => c.id === w.classId);
    return `${cls?.name ?? w.classId} 冠军 Lv.${w.unlockLevel} 解锁`;
  }

  private rarityOf(w: WeaponDef): { cn: string; cls: string } {
    // 武器档位展示：职业毕业武器（20 级）给传说，10 级给史诗，通用按主角等级段
    if (w.classId !== null && w.unlockLevel >= 20) return RARITY.legend!;
    if (w.classId !== null) return RARITY.epic!;
    if (w.unlockLevel >= 15) return RARITY.epicplus!;
    if (w.unlockLevel >= 8) return RARITY.rare!;
    return RARITY.common!;
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
          <div class="ink-rule"><i></i><span>${this.sourceText(w)}</span><i></i></div>
          <p class="spell-copy">${parsed.html}</p>
          ${bar}
          <div class="spell-tip" hidden><i class="spell-tip-arrow" aria-hidden="true"></i><small></small><em></em><ul></ul></div>
        </div>
      </article>`;
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
        const scale = Math.min(innerWidth / 1600, innerHeight / 900) || 1;
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
    const w = WEAPONS.find((x) => x.id === save.hero.equippedWeapon);
    if (!w) {
      $('#weaponSlab').innerHTML = '<div class="slab-body"><div class="plate-caption"><b>未装备武器</b><span>去武器库选择一把</span></div></div>';
      return;
    }
    const rarity = this.rarityOf(w);
    const owned = save.hero.unlockedWeapons.length;
    $('#weaponSlab').innerHTML = `
      <div class="slab-body ${rarity.cls}">
        <div class="weapon-plate">
          <i class="plate-lamp"></i>
          <i class="plate-corner tl"></i><i class="plate-corner tr"></i>
          <i class="plate-corner bl"></i><i class="plate-corner br"></i>
          <div class="plate-art">${weaponArt(weaponKind(w))}</div>
          <div class="plate-caption">
            <b>${w.name}</b>
            <span>${rarity.cn} · ${w.classId === null ? '通用武器' : (CLASSES.find((c) => c.id === w.classId)?.name ?? '') + '系'}</span>
          </div>
        </div>
        ${this.spellSheet(w, `<button class="secondary" id="swapWeapon" type="button"><span data-icon="bag"></span>武器库 <i>${owned} / ${WEAPONS.length}</i></button><button class="secondary" id="weaponCodex" type="button">武器图鉴</button>`)}
      </div>`;
    mountIcons($('#weaponSlab'));
    const slabSheet = document.querySelector('#weaponSlab .weapon-spell') as HTMLElement | null;
    if (slabSheet) this.bindSheetTips(slabSheet);
    $('#swapWeapon').onclick = () => this.openVault();
    const codexBtn = document.getElementById('weaponCodex');
    if (codexBtn) codexBtn.onclick = () => window.open('/weapons-codex.html', '_blank');
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
    const save = this.ctx.save();
    const rack = $('#vaultRack');
    rack.innerHTML = WEAPONS.map((w) => {
      const state = this.weaponState(w);
      const rarity = this.rarityOf(w);
      const flag =
        state === 'equipped'
          ? '<em class="tile-flag">装备中</em>'
          : state === 'locked'
            ? '<em class="tile-flag lock"><span data-icon="lock"></span>未解锁</em>'
            : '';
      return `<button class="rack-tile ${rarity.cls} is-${state === 'usable' ? 'owned' : state}${this.pickedWeaponId === w.id ? ' picked' : ''}" data-weapon="${w.id}" type="button" role="option" aria-selected="${this.pickedWeaponId === w.id}">
        <span class="tile-rarity">${rarity.cn}</span>
        <div class="tile-art">${weaponArt(weaponKind(w))}</div>
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
    $('#vaultOwned').textContent = String(save.hero.unlockedWeapons.length);
    $('#vaultTotal').textContent = String(WEAPONS.length);
  }

  private renderVaultDetail(): void {
    const w = WEAPONS.find((x) => x.id === this.pickedWeaponId) ?? WEAPONS[0]!;
    const state = this.weaponState(w);
    const rarity = this.rarityOf(w);
    const action =
      state === 'equipped'
        ? '<button class="primary" disabled type="button"><span data-icon="check"></span>已装备</button>'
        : state === 'usable'
          ? '<button class="primary" id="equipWeapon" type="button"><span data-icon="swords"></span>装 备</button>'
          : '<button class="primary" disabled type="button"><span data-icon="lock"></span>未解锁</button>';
    const detail = $('#vaultDetail');
    detail.className = 'vault-detail ' + rarity.cls;
    detail.innerHTML = `
      <div class="detail-art ${rarity.cls}${state === 'locked' ? ' is-locked' : ''}">
        <i class="plate-lamp"></i>
        <i class="plate-corner tl"></i><i class="plate-corner tr"></i>
        <i class="plate-corner bl"></i><i class="plate-corner br"></i>
        ${weaponArt(weaponKind(w))}
        ${state === 'locked' ? '<span class="detail-rank lock"><span data-icon="lock"></span></span>' : '<span class="detail-rank">' + this.sourceText(w) + '</span>'}
      </div>
      <div class="detail-rarity ${rarity.cls}"><i></i><span>${rarity.cn}</span><i></i></div>
      <h3 class="detail-name">${w.name}</h3>
      ${this.spellSheet(w)}
      <p class="detail-source">${this.sourceText(w)}</p>
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
        toast(`已装备「${w.name}」· 主角法力色与法术随之改变。`);
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
