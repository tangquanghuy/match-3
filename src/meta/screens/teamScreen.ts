import { portraitUrl } from '../../data/portraitUrl';
import type { BaseColor } from '../../engine/types';
import { isRegionId, regionDefinition, type RegionId } from '../data/regionalPvp';
import { raceNames } from '../data/races';
import { regionLegal, regionalRule } from '../systems/regionalPvp';
import { weekStartOf } from '../gateway/clock';
import { isCoupletSpell, spellTitleText } from '../../data/spellPresentation';
/**
 * 部队编成屏（计划 §5.3）。预设队、站位、旗帜、校验 issues 全走存档与 teamRules。
 * 名册 = 收藏中的部队 + 主角；立绘走本地降级图（troopTypes 映射 + 点名覆盖）。
 */
import { characterName, characterPortrait, DEFAULT_CHARACTER_PORTRAITS, type CharacterProfile } from '../state/character';
import { escapeHtml } from './troopCard';
import type { TroopData } from '../../data/troops';
import { getTroopById } from '../../data/troops';
import { isImmortal } from '../../data/immortals';
import type { TeamMember } from '../state/schema';
import { troopStatsOf } from '../systems/troopProgress';
import { buildPlayerSnapshots } from '../systems/battleBridge';
import { teamPower } from '../systems/combatPower';
import { heroKingdomOf, heroStatsOf, heroTroopTypeOf } from '../systems/hero';
import { anyWeaponById, CATALOG_WEAPONS, ownsWeapon } from '../data/weaponCatalog';
import { CLASSES } from '../data/classes';
import { resolvedTeamLoadout } from '../systems/teamRules';
import { RARITY_NAMES as RARITY_CN_ROSTER } from '../data/rarity';
import { bannerUnlocked } from '../systems/banners';
import { MIN_TEAM_SIZE, validateTeam, type TeamIssue } from '../systems/teamRules';
import { BANNERS, BANNER_COLOR_LABELS, bannerOf } from '../data/banners';
import { bottomNavHtml, mountIcons, toast, toastHtml, topbarHtml, gemSvg, icon, $, $$ } from '../shell/chrome';
import { isFailure } from '../gateway';
import { renderSpell } from '../shell/spellText';
import { bindTermTips } from '../shell/termTip';
import type { Screen, ShellCtx } from '../shell/screen';
import { BANNER_ART_CSS, bannerArtHtml, bannerBoostChips } from '../shell/bannerArt';
import { kingdomBonusOf } from '../systems/kingdomOps';
import { kingdomTeamEntries } from '../systems/kingdomTeamBonus';
import { TeamDrag, type DragSource, type DropTarget } from './teamDrag';
import TEAM_CSS from './teamScreen.css?inline';

const STAT_CN: Record<string, string> = { health: '生命', armor: '护甲', attack: '攻击', magic: '魔法' };

type SlotValue = number | 'hero' | null;
/** 名册每页张数（TM-6：阶段 A 8 张 / 85 名 = 11 页） */
const PAGE_SIZE = 12;
const ROSTER_COLORS = ['red', 'green', 'blue', 'yellow', 'purple', 'brown'] as const;
const COLOR_CN_ROSTER: Record<string, string> = { red: '红', green: '绿', blue: '蓝', yellow: '黄', purple: '紫', brown: '棕' };
/** GOW 封面 CDN（与战斗渲染 App.ts 同源同命名）：重绘立绘批次的上传源，命中不了的条目继续沿链回退 */
export function troopCdnArt(name: string): string {
  return `https://rpg.bolt.qzz.io/${encodeURIComponent('封面')}/${encodeURIComponent(name)}.webp`;
}

/** 本地兜底立绘：点名覆盖 → 种族通用图（注意在 troops/ 子目录下） */
const NAMED_ART: Record<string, string> = {
  法露特: '/static/troops/falute.webp',
  奥契丝: '/static/troops/orchis.webp',
  璐米欧儿: '/static/troops/lumiere.webp',
};
export function troopArtFallback(troop: TroopData | null, hero = false): string {
  if (hero) return '/static/troops/hero.webp';
  if (troop && NAMED_ART[troop.name]) return NAMED_ART[troop.name]!;
  const byType: Record<string, string> = {
    Knight: '/static/troops/troop-paladin.webp', Elf: '/static/troops/troop-elf.webp', Beast: '/static/troops/troop-lion.webp',
    Dragon: '/static/troops/troop-dragon.webp', Dwarf: '/static/troops/troop-dwarf.webp', Goblin: '/static/troops/troop-goblin.webp',
    Rogue: '/static/troops/troop-rogue.webp', Mystic: '/static/troops/troop-wizard.webp', Giant: '/static/troops/troop-orc.webp',
    Orc: '/static/troops/troop-orc.webp', Monster: '/static/troops/troop-shaman.webp', Wildfolk: '/static/troops/troop-lion.webp',
  };
  const t = troop?.troopTypes?.[0];
  return (t && byType[t]) || '/static/troops/troop-veteran.webp';
}

/**
 * 立绘兜底链（依次尝试）：自定义立绘（troops.json `portrait`，data/raw/custom-portraits，
 * dev/preview 由 vite 中间件服务）→ 点名定制图 → 生成图 CDN → 种族通用图。
 */
export function troopArtChain(troop: TroopData | null, hero = false): string[] {
  if (hero || !troop) return [troopArtFallback(troop, hero)];
  const chain: string[] = [];
  if (troop.artUrl) chain.push(troop.artUrl);
  if (troop.portrait) chain.push(portraitUrl(troop.portrait));
  if (NAMED_ART[troop.name]) chain.push(NAMED_ART[troop.name]!);
  chain.push(troopCdnArt(troop.name), troopArtFallback(troop, hero));
  return chain;
}

/** 立绘地址（链首）：自定义立绘 */
export function troopArt(troop: TroopData | null, hero = false): string {
  return troopArtChain(troop, hero)[0]!;
}

/** 带兜底链的 <img> 标签：onerror 沿链逐级回退（大列表建议保持 lazy） */
export function troopImg(troop: TroopData | null, hero = false, attrs = '', character?: CharacterProfile | null): string {
  const chain = hero && character && character.portrait !== 'legacy' ? [characterPortrait(character), DEFAULT_CHARACTER_PORTRAITS[character.gender]] : troopArtChain(troop, hero);
  const fb = JSON.stringify(chain.slice(1));
  return `<img src="${escapeHtml(chain[0]!)}" ${attrs} referrerpolicy="no-referrer" loading="lazy" data-fb='${escapeHtml(fb)}' onerror="const fb=JSON.parse(this.dataset.fb||'[]');const i=fb.indexOf(this.getAttribute('src'));if(i+1<fb.length){this.src=fb[i+1]}else{this.onerror=null}">`;
}

export function typeCn(types: readonly string[]): string {
  return raceNames(types);
}

/** [魔法+N] 类公式按当前魔力值求值（共享渲染器，非交互粗体高亮） */
function spellText(desc: string, magic: number): string {
  return renderSpell(desc, magic, { interactive: false }).html;
}

/** 旗帜加成的一句话文案（「蓝+2 棕+1 绿−1」） */
function describeBoosts(boosts: Record<string, number | undefined>): string {
  return Object.entries(boosts)
    .map(([color, mana]) => {
      const key = color as keyof typeof BANNER_COLOR_LABELS;
      return `${BANNER_COLOR_LABELS[key]}${mana! > 0 ? '+' : '−'}${Math.abs(mana!)}`;
    })
    .join(' ');
}

function manaCorner(cls: string, colors: readonly string[], cost?: number): string {
  const lower = colors.map((c) => c.toLowerCase());
  return `<span class="${cls}">${gemSvg(lower)}${cost == null ? '' : `<i>${cost}</i>`}</span>`;
}

function statChips(a: number, armor: number, health: number, magic: number): string {
  return (
    '<span class="stat-chips">'
    + `<span class="stat-atk" title="攻击"><span data-icon="swords"></span><b>${a}</b></span>`
    + `<span class="stat-armor" title="护甲"><span data-icon="shield"></span><b>${armor}</b></span>`
    + `<span class="stat-hp" title="生命"><span data-icon="heart"></span><b>${health}</b></span>`
    + `<span class="stat-mag" title="魔力"><span data-icon="orb"></span><b>${magic}</b></span>`
    + '</span>'
  );
}

interface RosterEntry {
  key: string; // 'hero' | String(troopId)
  troop: TroopData | null;
  name: string;
  typeLabel: string;
  typeRaw: string;
  level: number;
  cost: number;
  colors: string[];
  copies: number;
  /** 稀有度档（主角 = -1，小卡不画色边） */
  rarityIdx: number;
  attack: number;
  armor: number;
  health: number;
  magic: number;
  spellName: string;
  spellDesc: string;
}

export class TeamScreen implements Screen {
  private ctx!: ShellCtx;
  private selectedTeamIndex = 0;
  private slots: SlotValue[] = [null, null, null, null];
  /** 本地编辑态旗帜（保存时随编队一起写入；null = 不挂） */
  private banner: string | null = null;
  private selected = 0;
  private inspectedKey: string | null = null;
  private termTipsInspect?: () => void;
  private regionalMode = false;
  private regionalId:RegionId = 'WintersReach';
  private filter = 'all';
  private search = '';
  private page = 0;
  /** 名册筛选（TM-6：阶段 A 一维筛选都没有，只能翻 11 页肉眼扫） */
  private typeFilter = '';
  private rarityFilter = '';
  private colorFilter: string | null = null;
  private sortKey: 'level' | 'attack' | 'health' | 'cost' | 'rarity' | 'name' = 'level';
  /** 撤销一次"卸下"（TM-3：阶段 A 双击槽位静默删人且无法撤销） */
  private lastRemoved: { index: number; value: SlotValue } | null = null;
  private confirmAction: (() => void) | null = null;
  private listeners: Array<[EventTarget, string, EventListenerOrEventListenerObject]> = [];
  /** 未能保存的编辑（不满 4 人等）按预设序号暂存：切换队伍 / 离开再回来都还在 */
  private drafts = new Map<number, { slots: SlotValue[]; banner: string | null }>();
  private saveSeq = 0;
  private teamSaveQueue: Promise<unknown> = Promise.resolve();
  private pendingLoadouts = new Map<number, { heroClassId: string | null; heroWeaponId: string | null }>();

  /** Preserve request order so two quick selector changes cannot overwrite one another. */
  private persistTeam(index: number, team: Parameters<ShellCtx['gateway']['saveTeam']>[1]) {
    const request = this.teamSaveQueue.then(() => this.ctx.gateway.saveTeam(index, team));
    this.teamSaveQueue = request.then(() => undefined, () => undefined);
    return request;
  }
  private drag: TeamDrag | null = null;

  html(ctx: ShellCtx, param?: string): string {
    const regional = param?.startsWith('regional/') ?? false;
    const regionPart=param?.split('/')[2];
    const region:RegionId=isRegionId(regionPart)?regionPart:'WintersReach';
    const returnHash = regional ? '#regional/' + param!.slice('regional/'.length) : '#regional';
    const context = regional ? `<aside class="regional-team-context"><span>${regionDefinition(region)!.name} · 本周${regionalRule(weekStartOf(ctx.gateway.now()),region).name} · 仅显示可参战成员</span><a href="${escapeHtml(returnHash)}">返回备战 ›</a></aside>` : '';
    return `
      <style id="teamScreenCss">${TEAM_CSS}${BANNER_ART_CSS}</style>
      ${topbarHtml()}
      <div class="screen team-screen">
        ${context}
        <section class="team-switcher" aria-label="队伍预设">
          <div class="switcher-heading">
            <span data-icon="shield"></span>
            <div><b>我的队伍</b></div>
          </div>
          <div class="team-tabs" id="teamTabs"></div>
          <button class="add-team" id="addTeam" type="button"><span>＋</span>新建</button>
          <details class="team-menu">
            <summary>队伍管理</summary>
            <div class="team-menu-pop">
              <button id="renameTeam" type="button">重命名</button>
              <button id="clearTeam" type="button">清空成员</button>
              <button class="danger" id="deleteTeam" type="button">删除队伍</button>
            </div>
          </details>
        </section>

        <div class="team-workspace">
          <section class="panel lineup" id="lineupPanel">
            <div class="panel-head lineup-head">
              <div><h2 id="teamName">—</h2></div>
              <span class="active-badge" id="activeBadge">出战中</span>
            </div>
            <div class="team-gauge" id="teamGauge"></div>
            <div class="lineup-body">
              <div class="slots" id="slots"></div>
              <aside class="banner-post" id="bannerPost" aria-label="队伍旗帜">
                <span class="bp-label">队伍旗帜</span>
                <div class="bp-art" id="bannerArt"></div>
                <b class="bp-name" id="bannerCopy">未挂旗帜</b>
                <span class="kb-boosts" id="bannerBoosts"></span>
                <small class="bp-hit" id="bannerHit"></small>
                <button class="bp-change banner-chip" id="banner" type="button"><span data-icon="banner"></span><span>更换旗帜</span></button>
              </aside>
            </div>
            <div class="team-hero-loadout" id="teamHeroLoadout" hidden>
              <b>主角配置 <small>随队伍预设保存，设为出战时自动装备</small></b>
              <label>职业 <select id="teamHeroClass" aria-label="队伍主角职业"></select></label>
              <label>武器 <select id="teamHeroWeapon" aria-label="队伍主角武器"></select></label>
            </div>
            <ul class="team-checks" id="teamChecks"></ul>
            <div class="lineup-bar">
              <span class="drag-hint"><span data-icon="chevrons"></span>拖动卡牌调整站位 · 从右侧名册拖入编入 · 拖出队伍即卸下</span>
              <span class="save-hint" id="saveHint" role="status" aria-live="polite">已自动保存</span>
              <button class="set-active" id="setActive" type="button"><span data-icon="banner"></span>设为出战</button>
            </div>
          </section>
          <section class="panel roster">
            <div class="panel-head">
              <div><h2>可编入成员</h2></div>
              <div class="meta">已拥有 <b id="ownedCount">0</b> 名</div>
            </div>
            <div class="filters" id="filters">
              <button class="filter-tab on" data-filter="all">全部</button>
              <button class="filter-tab" data-filter="hero">主角</button>
              <span class="filter-sep"></span>
              <select id="typeFilter" aria-label="按种族筛选"><option value="">全部种族</option></select>
              <select id="rarityFilter" aria-label="按品质筛选">
                <option value="">全部品质</option>
                <option value="0">普通</option><option value="1">精良</option><option value="2">稀有</option>
                <option value="3">传说</option><option value="4">史诗</option><option value="5">神话</option>
              </select>
              <select id="sortRoster" aria-label="排序方式">
                <option value="level">等级 ↓</option>
                <option value="attack">攻击 ↓</option>
                <option value="health">生命 ↓</option>
                <option value="cost">耗蓝 ↑</option>
                <option value="rarity">稀有度 ↓</option>
                <option value="name">名字</option>
              </select>
              <label class="roster-search"><span data-icon="funnel"></span><input id="searchInput" type="search" placeholder="搜索成员"></label>
            </div>
            <div class="filters filters-colors">
              <small class="filter-hint">魔法色</small>
              <div class="color-chips" id="colorChips"></div>
              <button class="filter-reset is-off" id="resetRoster" type="button">清空筛选</button>
              <small class="roster-count" id="rosterCount"></small>
            </div>
            <div class="roster-grid" id="roster"></div>
            <div class="pager">
              <button id="prevPage" type="button" aria-label="上一页"><span data-icon="arrow"></span></button>
              <span id="pageLabel">1 / 1</span>
              <button class="next" id="nextPage" type="button" aria-label="下一页"><span data-icon="arrow"></span></button>
            </div>
            <article class="inspect" id="inspect" aria-live="polite"></article>
            <div class="roster-drop-label" aria-hidden="true">松手卸下</div>
          </section>
        </div>
      </div>
      ${bottomNavHtml('队伍', '编队')}
      ${toastHtml()}
      <!-- TM-9/TM-10：破坏性操作的二次确认（替掉"点一下就清空/删除"） -->
      <div class="modal-veil" id="teamConfirm" hidden>
        <section class="money-tip team-confirm-sheet" role="dialog" aria-modal="true" aria-labelledby="teamConfirmTitle">
          <h2 id="teamConfirmTitle">确认</h2>
          <ul id="teamConfirmLines"></ul>
          <button class="save-team" id="teamConfirmOk" type="button" style="width:100%;margin-top:18px">确认</button>
          <button class="cancel" id="teamConfirmCancel" type="button">取消</button>
        </section>
      </div>`;
  }

  mount(ctx: ShellCtx, root: HTMLElement, param?: string): void {
    this.ctx = ctx;
    this.regionalMode = param?.startsWith('regional/') ?? false;
    const regionPart=param?.split('/')[2];
    this.regionalId=isRegionId(regionPart)?regionPart:'WintersReach';
    this.typeFilter = '';
    this.rarityFilter = '';
    this.colorFilter = null;
    root.classList.add('team-responsive');
    const save = ctx.save();
    this.selectedTeamIndex = Math.min(save.activeTeamIndex, Math.max(0, save.teams.length - 1));
    this.loadTeamIntoSlots();
    this.inspectedKey = this.slots.find((s): s is NonNullable<SlotValue> => s !== null) != null
      ? String(this.slots.find((s) => s !== null))
      : 'hero';
    this.filter = 'all';
    this.search = '';
    this.page = 0;

    // 种族筛选改下拉全量（TM-6：阶段 A 只截前 5 个 tab，连自己队里的构装/元素都没有）
    const types = new Map<string, string>();
    for (const key of Object.keys(save.collection)) {
      const troop = getTroopById(Number(key));
      for (const t of troop?.troopTypes ?? []) if (!types.has(t)) types.set(t, typeCn([t]));
    }
    const typeSelect = $('#typeFilter') as HTMLSelectElement;
    [...types.entries()]
      .sort((a, b) => a[1].localeCompare(b[1], 'zh-Hans-CN'))
      .forEach(([raw, cn]) => {
        const opt = document.createElement('option');
        opt.value = raw;
        opt.textContent = cn;
        typeSelect.appendChild(opt);
      });
    const filterTabs = $('#filters');
    const colorChips = $('#colorChips');
    colorChips.innerHTML = ROSTER_COLORS.map(
      (c) => `<button class="color-chip" data-color="${c}" title="${COLOR_CN_ROSTER[c]}色法力" type="button">${gemSvg([c])}</button>`,
    ).join('');
    this.on(colorChips, 'click', (e) => {
      const chip = (e.target as HTMLElement).closest('[data-color]') as HTMLElement | null;
      if (!chip) return;
      this.colorFilter = this.colorFilter === chip.dataset.color ? null : chip.dataset.color!;
      this.page = 0;
      this.renderRoster();
    });
    this.on(typeSelect, 'change', () => {
      this.typeFilter = typeSelect.value;
      this.page = 0;
      this.renderRoster();
    });
    this.bind('#rarityFilter', 'change', () => {
      this.rarityFilter = ($('#rarityFilter') as HTMLSelectElement).value;
      this.page = 0;
      this.renderRoster();
    });
    this.bind('#sortRoster', 'change', () => {
      this.sortKey = ($('#sortRoster') as HTMLSelectElement).value as typeof this.sortKey;
      this.page = 0;
      this.renderRoster();
    });
    this.bind('#resetRoster', 'click', () => {
      this.typeFilter = this.rarityFilter = '';
      this.colorFilter = null;
      this.search = '';
      this.filter = 'all';
      typeSelect.value = '';
      ($('#rarityFilter') as HTMLSelectElement).value = '';
      ($('#searchInput') as HTMLInputElement).value = '';
      filterTabs.querySelectorAll('.filter-tab').forEach((b) => b.classList.toggle('on', (b as HTMLElement).dataset.filter === 'all'));
      this.page = 0;
      this.renderRoster();
    });
    // 二次确认弹层（TM-9/TM-10）
    this.bind('#teamConfirmOk', 'click', () => {
      const act = this.confirmAction;
      this.closeConfirm();
      act?.();
    });
    this.bind('#teamConfirmCancel', 'click', () => this.closeConfirm());
    this.on($('#teamConfirm'), 'click', (e) => {
      if ((e as MouseEvent).target === $('#teamConfirm')) this.closeConfirm();
    });
    this.on(document, 'keydown', (e) => {
      const ev = e as KeyboardEvent;
      if (ev.key === 'Escape') {
        if (!$('#teamConfirm').hidden) return this.closeConfirm();
        this.closeBannerPicker();
        return;
      }
      if ((ev.target as HTMLElement)?.closest('input, textarea, [contenteditable="true"]')) return;
      if ((ev.ctrlKey || ev.metaKey) && ev.key.toLowerCase() === 'z' && this.lastRemoved) {
        ev.preventDefault();
        this.undoRemove();
      }
    });

    this.bind('#addTeam', 'click', () => void this.addTeam());
    this.bind('#renameTeam', 'click', () => void this.renameTeam());
    // TM-9：「清空成员」紧贴「删除队伍」，阶段 A 一点就清空且无撤销
    this.bind('#clearTeam', 'click', () => {
      const count = this.slots.filter(Boolean).length;
      if (!count) return void toast('编队已经是空的。');
      this.askConfirm({
        title: '清空当前编队？',
        lines: [
          ['要清掉的成员', this.slots.filter(Boolean).map((s) => this.byKey(String(s))?.name ?? '?').join('、')],
          ['存档', '保存前不写入存档'],
        ],
        okLabel: `清空 ${count} 名成员`,
        run: () => {
          this.slots = [null, null, null, null];
          this.selected = 0;
          this.lastRemoved = null;
          this.changed();
          toast('已清空编队：补满 4 人后自动保存，存档里仍是上一次的完整阵容。');
        },
      });
    });
    this.bind('#deleteTeam', 'click', () => void this.deleteTeam());
    this.bind('#setActive', 'click', () => void this.setActive());
    this.bind('#teamHeroClass', 'change', () => void this.saveHeroLoadout());
    this.bind('#teamHeroWeapon', 'change', () => void this.saveHeroLoadout());
    this.drag = new TeamDrag($('.team-screen'), {
      source: (target) => this.dragSource(target),
      resolve: (x, y, src) => this.dropTarget(x, y, src),
      drop: (src, target) => this.onDrop(src, target),
    });
    this.drag.attach();
    this.bind('#banner', 'click', () => this.toggleBannerPicker());
    this.bind('#prevPage', 'click', () => {
      this.page = Math.max(0, this.page - 1);
      this.renderRoster();
    });
    this.bind('#nextPage', 'click', () => {
      this.page += 1;
      this.renderRoster();
    });
    $('#searchInput').addEventListener('input', (e) => {
      this.search = (e.target as HTMLInputElement).value.trim();
      this.page = 0;
      this.renderRoster();
    });
    this.on(filterTabs, 'click', (e) => {
      const btn = (e.target as HTMLElement).closest('[data-filter]') as HTMLElement | null;
      if (!btn) return;
      this.filter = btn.dataset.filter!;
      filterTabs.querySelectorAll('.filter-tab').forEach((b) => b.classList.toggle('on', b === btn));
      this.page = 0;
      this.renderRoster();
    });

    this.renderAll();
  }

  // —— 数据视图 ——

  private currentTeam() {
    return this.ctx.save().teams[this.selectedTeamIndex] ?? null;
  }

  private teamPreviewSave() {
    const save = this.ctx.save();
    const team = this.currentTeam();
    if (!team || !this.slots.includes('hero')) return save;
    const loadout = this.pendingLoadouts.get(this.selectedTeamIndex) ?? resolvedTeamLoadout(save, team);
    return { ...save, hero: { ...save.hero, classId: loadout.heroClassId, equippedWeapon: loadout.heroWeaponId } };
  }

  private renderHeroLoadout(): void {
    const row = $('#teamHeroLoadout');
    const team = this.currentTeam();
    const save = this.ctx.save();
    row.hidden = !team || !this.slots.includes('hero');
    if (row.hidden || !team) return;
    const loadout = this.pendingLoadouts.get(this.selectedTeamIndex) ?? resolvedTeamLoadout(save, team);
    const classes = CLASSES.filter(c => save.hero.unlockedClasses.includes(c.id));
    ($('#teamHeroClass') as HTMLSelectElement).innerHTML = '<option value="">无职业</option>' + classes.map(c =>
      `<option value="${escapeHtml(c.id)}"${c.id === loadout.heroClassId ? ' selected' : ''}>${escapeHtml(c.name)}</option>`).join('');
    const weapons = CATALOG_WEAPONS.filter(w => ownsWeapon(save, w.id));
    ($('#teamHeroWeapon') as HTMLSelectElement).innerHTML = '<option value="">无武器</option>' + weapons.map(w =>
      `<option value="${escapeHtml(w.id)}"${w.id === loadout.heroWeaponId ? ' selected' : ''}>${escapeHtml(w.name)}</option>`).join('');
  }

  private async saveHeroLoadout(): Promise<void> {
    const team = this.currentTeam();
    if (!team || !this.slots.includes('hero')) return;
    const index = this.selectedTeamIndex;
    const loadout = {
      heroClassId: ($('#teamHeroClass') as HTMLSelectElement).value || null,
      heroWeaponId: ($('#teamHeroWeapon') as HTMLSelectElement).value || null,
    };
    this.pendingLoadouts.set(index, loadout);
    const draftMembers = this.slotsToMembers();
    const draft = validateTeam(this.ctx.save(), { members: draftMembers, bannerKingdomId: this.banner, ...loadout }).ok;
    const { result } = await this.persistTeam(index, {
      name: team.name, members: draft ? draftMembers : team.members,
      bannerKingdomId: draft ? this.banner : team.bannerKingdomId,
      ...loadout,
    });
    if (this.pendingLoadouts.get(index) === loadout) {
      this.pendingLoadouts.delete(index);
      if (!result.ok) toast(result.issues[0]?.message ?? '主角配置保存失败');
      else toast('主角配置已保存到这支队伍。');
      this.renderAll();
    }
  }

  private membersToSlots(members: TeamMember[]): SlotValue[] {
    const slots: SlotValue[] = [null, null, null, null];
    members.forEach((m, i) => {
      if (i < 4) slots[i] = m.kind === 'hero' ? 'hero' : m.troopId;
    });
    return slots;
  }

  private slotsToMembers(): TeamMember[] {
    return this.slots
      .filter((s): s is Exclude<SlotValue, null> => s !== null)
      .map((s) => (s === 'hero' ? { kind: 'hero' as const } : { kind: 'troop' as const, troopId: s }));
  }

  private loadTeamIntoSlots(): void {
    const team = this.currentTeam();
    const draft = this.drafts.get(this.selectedTeamIndex);
    this.slots = draft ? [...draft.slots] : team ? this.membersToSlots(team.members) : [null, null, null, null];
    this.banner = draft ? draft.banner : team?.bannerKingdomId ?? null;
    this.selected = Math.min(this.selected, 3);
  }

  // —— 自动保存：每次改动后合法即写存档，不合法（不满 4 人等）暂存草稿并提示 ——

  /** 编辑后的统一出口：重画 + 自动保存 */
  private changed(): void {
    this.renderAll();
    void this.autosave();
  }

  private async autosave(): Promise<void> {
    const index = this.selectedTeamIndex;
    if (!this.isDirty()) {
      this.drafts.delete(index);
      this.setSaveState('saved');
      return;
    }
    const members = this.slotsToMembers();
    const validation = validateTeam(this.ctx.save(), { members, bannerKingdomId: this.banner });
    if (!validation.ok) {
      this.drafts.set(index, { slots: [...this.slots], banner: this.banner });
      this.setSaveState('incomplete', validation.issues[0]?.message);
      this.renderTeamTabs();
      return;
    }
    const seq = ++this.saveSeq;
    this.setSaveState('saving');
    const team = this.currentTeam();
    const { result } = await this.persistTeam(index, {
      name: team?.name ?? '新队伍',
      members,
      bannerKingdomId: this.banner,
      ...(this.pendingLoadouts.get(index) ?? resolvedTeamLoadout(this.ctx.save(), team ?? { name: '', members, bannerKingdomId: this.banner })),
    });
    if (seq !== this.saveSeq) return; // 期间又有新改动，以最后一次为准
    if (result.ok) {
      this.drafts.delete(index);
      this.setSaveState('saved');
    } else {
      this.drafts.set(index, { slots: [...this.slots], banner: this.banner });
      this.setSaveState('error', result.issues[0]?.message);
    }
    this.renderTeamTabs();
    this.renderChecks();
  }

  private setSaveState(state: 'saved' | 'saving' | 'incomplete' | 'error', detail?: string): void {
    const hint = $('#saveHint');
    if (!hint) return;
    const count = this.slots.filter(Boolean).length;
    hint.dataset.state = state;
    hint.classList.toggle('dirty', state === 'incomplete' || state === 'error');
    hint.textContent = state === 'saved'
      ? '已自动保存'
      : state === 'saving'
        ? '保存中…'
        : state === 'incomplete'
          ? count < MIN_TEAM_SIZE
            ? `还差 ${MIN_TEAM_SIZE - count} 人 · 补满后自动保存`
            : `未保存：${detail ?? '编队未通过校验'}`
          : `未保存：${detail ?? '保存失败'}`;
    hint.title = state === 'saved' ? '每次调整都会立即写入存档' : detail ?? '';
  }

  // —— 拖拽（名册 → 槽位编入 / 槽位互换 / 拖出卸下） ——

  private dragSource(target: HTMLElement): DragSource | null {
    const slot = target.closest<HTMLElement>('#slots [data-slot]');
    if (slot) {
      const index = Number(slot.dataset.slot);
      const value = this.slots[index];
      return value == null ? null : { kind: 'slot', key: String(value), index, el: slot };
    }
    const card = target.closest<HTMLElement>('#roster [data-id]');
    return card ? { kind: 'roster', key: card.dataset.id!, el: card } : null;
  }

  private dropTarget(x: number, y: number, src: DragSource): DropTarget | null {
    const el = document.elementFromPoint(x, y) as HTMLElement | null;
    const slot = el?.closest<HTMLElement>('#slots [data-slot]');
    if (slot) return { kind: 'slot', index: Number(slot.dataset.slot), el: slot };
    if (src.kind === 'slot' && el && !el.closest('#lineupPanel')) {
      const roster = document.querySelector<HTMLElement>('.panel.roster');
      if (roster) return { kind: 'out', el: roster };
    }
    return null;
  }

  private onDrop(src: DragSource, target: DropTarget): void {
    const value: SlotValue = src.key === 'hero' ? 'hero' : Number(src.key);
    const name = (v: SlotValue): string => (v == null ? '空位' : this.byKey(String(v))?.name ?? '成员');
    if (target.kind === 'out') {
      if (src.index != null) this.dropSlot(src.index);
      return;
    }
    const to = target.index;
    if (src.kind === 'slot') {
      const from = src.index!;
      if (from === to) return;
      const a = this.slots[from] ?? null;
      const b = this.slots[to] ?? null;
      this.slots[from] = b;
      this.slots[to] = a;
      this.selected = to;
      this.inspectedKey = String(a);
      this.changed();
      toast(b == null ? `「${name(a)}」移到 ${to + 1} 号位` : `站位互换：${to + 1} 号位「${name(a)}」↔ ${from + 1} 号位「${name(b)}」`);
      return;
    }
    // 名册拖入：有可用副本时编入；副本用尽时移动已有成员。
    const existing = this.slots.indexOf(value);
    const occupant = this.slots[to] ?? null;
    if (occupant === value) return;
    if (existing >= 0 && !this.canAddCopy(value)) {
      this.slots[existing] = occupant;
      this.slots[to] = value;
      toast(`「${name(value)}」移到 ${to + 1} 号位`);
    } else {
      this.slots[to] = value;
      toast(occupant == null ? `已将「${name(value)}」编入 ${to + 1} 号位` : `已用「${name(value)}」替换「${name(occupant)}」`);
    }
    this.selected = to;
    this.inspectedKey = src.key;
    this.changed();
  }

  private roster(): RosterEntry[] {
    const save = this.teamPreviewSave();
    // 主角条目实时反映队伍预设的武器：武器决定法术/法力色/耗蓝（官方口径）
    const equipped = anyWeaponById(save.hero.equippedWeapon) ?? null;
    const list: RosterEntry[] = [{
      key: 'hero',
      troop: null,
      name: save.character?.portrait === 'legacy' ? '主角' : characterName(save.character),
      typeLabel: `${typeCn([heroTroopTypeOf(save)])} · ${heroKingdomOf(save) ?? '无所属王国'}`,
      typeRaw: 'hero',
      level: save.hero.level,
      cost: equipped?.manaCost ?? 1,
      colors: equipped ? [...equipped.manaColors] : ['Brown'],
      copies: 1,
      rarityIdx: -1,
      ...heroStatsOf(save),
      spellName: equipped ? `主角法术 · ${equipped.name}` : '主角法术（未装备武器）',
      spellDesc: equipped
        ? equipped.description
        : '尚未装备武器：去英雄页的武器库装备一把，武器决定法术、法力色与耗蓝。',
    }];
    for (const [key, rec] of Object.entries(save.collection)) {
      const troop = getTroopById(Number(key));
      if (!troop) continue;
      const stats = troopStatsOf(troop, rec);
      list.push({
        key,
        troop,
        name: troop.name,
        typeLabel: typeCn(troop.troopTypes),
        typeRaw: troop.troopTypes[0] ?? '',
        level: rec.level,
        cost: troop.manaCost,
        colors: troop.manaColors,
        copies: rec.copies + 1,
        rarityIdx: troop.rarityIdx,
        attack: stats.attack,
        armor: stats.armor,
        health: stats.health,
        magic: stats.magic,
        spellName: troop.spell.name,
        spellDesc: troop.spell.description,
      });
    }
    return list;
  }

  private byKey(key: string): RosterEntry | undefined {
    return this.rosterCache.find((e) => e.key === key);
  }

  private slotCapacity(value: Exclude<SlotValue, null>): number {
    if (value === 'hero') return 1;
    const entry = this.byKey(String(value));
    return entry ? isImmortal(entry.troop) ? 1 : entry.copies : 0;
  }

  private canAddCopy(value: Exclude<SlotValue, null>): boolean {
    return this.slots.filter(slot => slot === value).length < this.slotCapacity(value);
  }

  private rosterCache: RosterEntry[] = [];

  private isDirty(): boolean {
    const team = this.currentTeam();
    if (!team) return false;
    const savedSlots = this.membersToSlots(team.members);
    const slotsDirty = savedSlots.some((s, i) => s !== this.slots[i]);
    return slotsDirty || this.banner !== (team.bannerKingdomId ?? null);
  }

  // —— 渲染 ——

  private renderAll(): void {
    this.rosterCache = this.roster();
    const save = this.ctx.save();
    const team = this.currentTeam();
    const active = this.selectedTeamIndex === save.activeTeamIndex;
    const count = this.slots.filter(Boolean).length;
    const dirty = this.isDirty();
    $('#teamName').textContent = team?.name ?? '—';
    // TM-9：0 人/不足 4 人的编辑态不许再挂「出战中」
    const badgeState = count < MIN_TEAM_SIZE ? 'incomplete' : active ? 'active' : '';
    $('#activeBadge').textContent = count === 0 ? '空编队' : count < MIN_TEAM_SIZE ? `未完成 ${count}/${MIN_TEAM_SIZE}` : active ? '出战中' : '备用队伍';
    $('#activeBadge').className = 'active-badge' + (badgeState ? ' ' + badgeState : '');
    this.renderGauge();
    this.renderSlots();
    const validation = this.renderChecks();
    // 自动保存：合法改动已立即写入；不合法的草稿显示「还差 N 人」
    if (!dirty) this.setSaveState('saved');
    else if (!validation.ok) this.setSaveState('incomplete', validation.issues[0]?.message);
    $('#setActive').hidden = active;
    ($('#setActive') as HTMLButtonElement).disabled = count < MIN_TEAM_SIZE || !validation.ok;
    $('#setActive').title = count < MIN_TEAM_SIZE ? `至少编入 ${MIN_TEAM_SIZE} 名成员` : '将这支队伍设为当前出战队伍';
    this.renderBannerPost();
    this.renderHeroLoadout();
    $('#ownedCount').textContent = String(Object.keys(save.collection).length);
    this.renderTeamTabs();
    this.renderRoster();
    this.renderInspect();
  }

  /** 旗帜展示位：彩绘旗面 + 加成色签 + 命中队伍用色 */
  private renderBannerPost(): void {
    const post = $('#bannerPost');
    if (!post) return;
    const kingdom = this.banner;
    $('#bannerArt').innerHTML = bannerArtHtml(kingdom, { size: 176 });
    $('#bannerCopy').textContent = kingdom ?? '未挂旗帜';
    $('#bannerBoosts').innerHTML = kingdom ? bannerBoostChips(kingdom) : '';
    const used = this.teamColors();
    const hits = kingdom
      ? Object.entries(BANNERS[kingdom]?.boosts ?? {}).filter(([c, n]) => (n ?? 0) > 0 && used[c.toLowerCase()]).length
      : 0;
    $('#bannerHit').textContent = kingdom
      ? hits ? `强化队伍的 ${hits} 种法力颜色` : '队伍暂未使用加成颜色'
      : '挂上旗帜，匹配对应颜色时额外获得法力';
    post.classList.toggle('is-empty', !kingdom);
    post.classList.toggle('no-hit', !!kingdom && hits === 0);
    mountIcons(post);
  }

  /** 汇总只展示队伍用色；个体属性与法术集中在选中详情。 */
  private renderGauge(): void {
    const box = $('#teamGauge');
    if (!box) return;
    const expanded = (box.querySelector('.kingdom-bonus-details') as HTMLDetailsElement | null)?.open ?? false;
    const members = this.slots
      .filter((s): s is Exclude<SlotValue, null> => s !== null)
      .map((s) => this.byKey(String(s)))
      .filter((t): t is RosterEntry => !!t);
    if (!members.length) {
      box.innerHTML = '<span class="gauge-summary">空编队 · 还差 4 人 · 法力色覆盖</span><span class="gauge-count">0 / 4</span>' + this.kingdomBonusesDropdown(expanded);
      return;
    }
    const draft = buildPlayerSnapshots(this.teamPreviewSave(), {
      name: this.currentTeam()?.name ?? '', members: this.slotsToMembers(), bannerKingdomId: this.banner,
      ...(this.pendingLoadouts.get(this.selectedTeamIndex) ?? resolvedTeamLoadout(this.ctx.save(), this.currentTeam() ?? { name: '', members: this.slotsToMembers(), bannerKingdomId: this.banner })),
    });
    const power = draft.ok ? teamPower(draft.playerTeam) : 0;
    const coverage = ROSTER_COLORS.map((c) => ({
      color: c,
      n: members.filter((m) => m.colors.some((x) => x.toLowerCase() === c)).length,
    }));
    box.innerHTML = `
      <span class="gauge-summary">战力 ${power.toLocaleString()} · 法力色覆盖</span>
      <span class="gauge-count" title="已编入 ${members.length} 名，最多 4 名">${members.length} / 4</span>
      <span class="gauge-colors" aria-label="法力色覆盖" title="法力色覆盖">
        ${coverage.map((c) => `<span class="cov${c.n ? '' : ' zero'}" title="${COLOR_CN_ROSTER[c.color]}色：${c.n} 名">${gemSvg([c.color])}<i>${c.n}</i></span>`).join('')}
      </span>
      ${this.kingdomBonusesDropdown(expanded)}`;
  }

  /** 把永久王国与当前编队同王国加成收进一处，避免属性全满时撑开仪表栏。 */
  private kingdomBonusesDropdown(expanded: boolean): string {
    const permanent = kingdomBonusOf(this.ctx.save());
    const entries = kingdomTeamEntries(this.teamPreviewSave(), this.slotsToMembers());
    const keys = ['health', 'armor', 'attack', 'magic'] as const;
    const describe = (stats: typeof permanent): string =>
      keys.filter((key) => stats[key] > 0).map((key) => `${STAT_CN[key]}+${stats[key]}`).join('、') || '暂无';
    const combined = { ...permanent };
    for (const entry of entries) for (const key of keys) combined[key] += entry.stats[key];
    const kingdomLines = entries.length
      ? entries.map((entry) => `<li><strong>${escapeHtml(entry.kingdom)}（${entry.count}/4）</strong><span>${describe(entry.stats)}</span></li>`).join('')
      : '<li><span>至少 2 名同王国成员才会激活；主角按装备武器所属王国计数。</span></li>';
    return `<details class="kingdom-bonus-details"${expanded ? ' open' : ''}>
      <summary>属性加成 <span aria-hidden="true">▾</span></summary>
      <div class="kingdom-bonus-menu">
        <div class="kingdom-bonus-section"><strong>王国满级 · 永久</strong><span>${describe(permanent)}</span></div>
        <div class="kingdom-bonus-section"><strong>同王国编队 · 当前队伍</strong><ul>${kingdomLines}</ul></div>
        <div class="kingdom-bonus-section total"><strong>本队合计</strong><span>${describe(combined)}</span></div>
      </div>
    </details>`;
  }

  /** 常驻列出编队校验状态；通过项也给出明确的可出战反馈。 */
  private renderChecks(): { ok: boolean; issues: TeamIssue[] } {
    const save = this.ctx.save();
    const members = this.slotsToMembers();
    const validation = validateTeam(save, { members, bannerKingdomId: this.banner });
    const list = $('#teamChecks');
    if (!list) return validation;
    list.hidden = false;
    list.innerHTML = validation.issues.length
      ? validation.issues.map((i) => `<li class="bad"><span data-icon="lock"></span>${i.message}</li>`).join('')
      : '<li class="ok"><span data-icon="check"></span>编队完整，可出战</li>';
    mountIcons(list);
    return validation;
  }

  private renderTeamTabs(): void {
    const save = this.ctx.save();
    $('#teamTabs').innerHTML = save.teams
      .map((team, index) => {
        const isSelected = index === this.selectedTeamIndex;
        const isActive = index === save.activeTeamIndex;
        const count = team.members.length;
        return `<button class="team-tab${isSelected ? ' on' : ''}${isActive ? ' active' : ''}" data-team="${index}" type="button">
          <span class="team-index">${String(index + 1).padStart(2, '0')}</span>
          <span class="team-tab-copy"><b>${team.name}</b><small>${count < MIN_TEAM_SIZE ? `未完成 ${count}/${MIN_TEAM_SIZE}` : `${count} 人编队`}${isActive ? ' · 出战' : ''}</small></span>
          ${isSelected && this.isDirty() ? '<i class="dirty-dot" title="有未保存的更改"></i>' : ''}
        </button>`;
      })
      .join('');
    $$('#teamTabs [data-team]').forEach((btn) =>
      this.on(btn, 'click', () => {
        const index = Number((btn as HTMLElement).dataset.team);
        if (index === this.selectedTeamIndex) return;
        this.selectedTeamIndex = index;
        this.selected = 0;
        this.loadTeamIntoSlots();
        this.inspectedKey = this.slots.find((s) => s !== null) != null ? String(this.slots.find((s) => s !== null)) : 'hero';
        this.page = 0;
        this.renderAll();
      }),
    );
  }

  private renderSlots(): void {
    const slotsEl = $('#slots');
    slotsEl.innerHTML = [0, 1, 2, 3]
      .map((i) => {
        const key = this.slots[i];
        const t = key != null ? this.byKey(String(key)) : undefined;
        // 站位操作（TM-2 换位 / TM-3 卸下）是槽位按钮的兄弟节点：按钮不能嵌按钮
        const ops = `<span class="slot-ops">
            <button class="slot-op" data-swap="${i}" type="button" aria-label="与上一格交换站位" title="${i === 0 ? '与 2 号位交换（把这张换下队首）' : `与 ${i} 号位交换`}">⇅</button>
            <button class="slot-op drop" data-drop="${i}" type="button" aria-label="卸下" title="卸下这名成员"${t ? '' : ' disabled'}>✕</button>
          </span>`;
        if (!t) {
          return `<div class="slot-wrap">
            <button class="slot empty${this.selected === i ? ' on' : ''}" data-slot="${i}" aria-label="${i + 1} 号位，空位" type="button">
              <span class="slot-tag${i === 0 ? ' skull' : ''}" title="${i === 0 ? '1 号位优先承受骷髅伤害' : `${i + 1} 号位`}">${i + 1}${i === 0 ? '<span data-icon="skull"></span>' : ''}</span>
              <span class="slot-art" aria-hidden="true">+</span>
              <span class="slot-foot"><b>空位</b></span>
            </button>${ops}</div>`;
        }
        return `<div class="slot-wrap">
          <button class="slot${i === 0 ? ' leader' : ''}${this.selected === i ? ' on' : ''}${this.inspectedKey === t.key ? ' look' : ''} ${t.rarityIdx >= 0 ? 'r-' + t.rarityIdx : 'r-hero'}" data-slot="${i}" title="${escapeHtml(t.name)} · ${t.typeLabel} · Lv.${t.level} · 耗蓝 ${t.cost}" type="button">
            <span class="slot-tag${i === 0 ? ' skull' : ''}" title="${i === 0 ? '1 号位优先承受骷髅伤害' : `${i + 1} 号位`}">${i + 1}${i === 0 ? '<span data-icon="skull"></span>' : ''}</span>
            <span class="slot-art">${manaCorner('slot-mana', t.colors, t.cost)}${troopImg(t.troop, t.key === 'hero', `alt="${escapeHtml(t.name)}"`, this.ctx.save().character)}</span>
            <span class="slot-foot"><b>${escapeHtml(t.name)}</b><span class="slot-level">Lv.${t.level}</span></span>
          </button>${ops}</div>`;
      })
      .join('');
    mountIcons(slotsEl);
    $$('[data-slot]', slotsEl).forEach((btn) => {
      const el = btn as HTMLElement;
      this.on(el, 'click', () => {
        this.selected = Number(el.dataset.slot);
        const occupant = this.slots[this.selected];
        if (occupant != null) this.inspectedKey = String(occupant);
        this.renderAll();
      });
      // TM-3：双击不再静默删人，改成"看这张卡的图鉴"（与名册单击语义靠拢）
      this.on(el, 'dblclick', () => {
        const occupant = this.slots[Number(el.dataset.slot)];
        if (occupant == null || occupant === 'hero') {
          toast('主角的资料在英雄页 · 卸下：把卡拖出队伍，或点卡片左下角 ✕');
          return;
        }
        this.ctx.navigate('#troop/' + occupant);
      });
    });
    $$('[data-swap]', slotsEl).forEach((btn) =>
      this.on(btn, 'click', (e) => {
        e.stopPropagation();
        this.swapSlot(Number((btn as HTMLElement).dataset.swap));
      }),
    );
    $$('[data-drop]', slotsEl).forEach((btn) =>
      this.on(btn, 'click', (e) => {
        e.stopPropagation();
        this.dropSlot(Number((btn as HTMLElement).dataset.drop));
      }),
    );
  }

  /** TM-2：与上一格交换（1 号位与 2 号位交换）——"队首吃骷髅"是页面自己写明的战术 */
  private swapSlot(index: number): void {
    const other = index === 0 ? 1 : index - 1;
    const a = this.slots[index] ?? null;
    const b = this.slots[other] ?? null;
    if (a === null && b === null) return;
    this.slots[index] = b;
    this.slots[other] = a;
    this.selected = other;
    this.changed();
    const who = (v: SlotValue): string => (v == null ? '空位' : this.byKey(String(v))?.name ?? '成员');
    toast(`站位已交换：${other + 1} 号位 ${who(b)} → ${who(a)}`);
  }

  /** TM-3：显式卸下 + 可撤销（阶段 A 是双击静默删人，无 toast 无确认无撤销） */
  private dropSlot(index: number): void {
    const value = this.slots[index] ?? null;
    if (value === null) return;
    const name = this.byKey(String(value))?.name ?? '成员';
    this.slots[index] = null;
    this.lastRemoved = { index, value };
    this.selected = index;
    this.changed();
    const undoHow = window.matchMedia?.('(pointer: coarse)').matches ? '点这里撤销' : '点这里或按 Ctrl+Z 撤销';
    toast(`已卸下「${name}」· 补满 ${MIN_TEAM_SIZE} 人后自动保存 · ${undoHow}`);
    const el = $('#toast');
    if (el) {
      el.classList.add('undoable');
      el.onclick = () => {
        el.onclick = null;
        el.classList.remove('undoable');
        this.undoRemove();
      };
    }
  }

  private undoRemove(): void {
    if (!this.lastRemoved) return;
    const { index, value } = this.lastRemoved;
    this.lastRemoved = null;
    if (this.slots[index] == null) this.slots[index] = value;
    else {
      const free = this.slots.findIndex((s) => s == null);
      if (free < 0) return void toast('队伍已满，撤销失败。');
      this.slots[free] = value;
    }
    this.changed();
    toast('已撤销卸下。');
  }

  /** 名册筛选 + 排序（TM-6：阶段 A 只有"全部/主角/5 个种族 tab"和按名字搜） */
  private visiblePool(): RosterEntry[] {
    const list = this.rosterCache.filter((t) => {
      if (this.regionalMode && !regionLegal({ templateId: t.key, troopTypes: t.key === 'hero' ? [heroTroopTypeOf(this.ctx.save())] : t.troop?.troopTypes, manaColors:t.colors as BaseColor[], kingdom:t.key === 'hero' ? heroKingdomOf(this.ctx.save()) : t.troop?.kingdom??undefined }, weekStartOf(this.ctx.gateway.now()),this.regionalId)) return false;
      if (this.filter === 'hero' && t.key !== 'hero') return false;
      if (this.typeFilter && !(t.key === 'hero' ? [heroTroopTypeOf(this.ctx.save())] : t.troop?.troopTypes ?? []).includes(this.typeFilter)) return false;
      if (this.rarityFilter !== '' && t.rarityIdx !== Number(this.rarityFilter)) return false;
      if (this.colorFilter && !t.colors.some((c) => c.toLowerCase() === this.colorFilter)) return false;
      if (this.search && !t.name.includes(this.search) && !t.typeLabel.includes(this.search) && !t.spellName.includes(this.search)) return false;
      return true;
    });
    const key = this.sortKey;
    const favorites = new Set(this.ctx.save().favoriteTroopIds);
    return list.sort((a, b) => {
      const favoriteOrder = Number(favorites.has(Number(b.key))) - Number(favorites.has(Number(a.key)));
      if (favoriteOrder) return favoriteOrder;
      if (key === 'name') return a.name.localeCompare(b.name, 'zh-Hans-CN');
      if (key === 'cost') return a.cost - b.cost || b.level - a.level;
      const val = (t: RosterEntry): number =>
        key === 'level' ? t.level : key === 'attack' ? t.attack : key === 'health' ? t.health + t.armor / 100 : t.rarityIdx;
      return val(b) - val(a) || a.name.localeCompare(b.name, 'zh-Hans-CN');
    });
  }

  private renderRoster(): void {
    const list = this.visiblePool();
    const pages = Math.max(1, Math.ceil(list.length / PAGE_SIZE));
    this.page = Math.min(this.page, pages - 1);
    const slice = list.slice(this.page * PAGE_SIZE, this.page * PAGE_SIZE + PAGE_SIZE);
    const rosterEl = $('#roster');
    const favorites = new Set(this.ctx.save().favoriteTroopIds);
    rosterEl.innerHTML = slice
      .map((t) => {
        const value = t.key === 'hero' ? 'hero' : Number(t.key);
        const used = this.slots.filter(slot => slot === value).length;
        const full = used >= this.slotCapacity(value);
        return `<button class="mini${full ? ' in' : ''}${this.inspectedKey === t.key ? ' look' : ''}${t.rarityIdx >= 0 ? ' r-' + t.rarityIdx : ' r-hero'}" data-id="${t.key}" title="${escapeHtml(t.name)} · ${t.rarityIdx >= 0 ? RARITY_CN_ROSTER[t.rarityIdx] : '主角'}${used ? ` · 已上阵 ${used}/${this.slotCapacity(value)}` : ''} · 单击查看 / 双击编入" type="button">
          <i class="rarity-edge" aria-hidden="true"></i>
          ${troopImg(t.troop, t.key === 'hero', `alt="${escapeHtml(t.name)}"`, this.ctx.save().character)}
          ${manaCorner('mini-mana', t.colors, t.cost)}
          <span class="mini-lv">Lv.${t.level}</span>
          <span class="mini-shade">${favorites.has(Number(t.key)) ? `<span class="mini-favorite" aria-label="已收藏">${icon('star')}</span>` : ''}<b>${escapeHtml(t.name)}</b></span>
        </button>`;
      })
      .join('');
    $$('[data-id]', rosterEl).forEach((btn) => {
      const el = btn as HTMLElement;
      this.on(el, 'click', () => {
        this.inspectedKey = el.dataset.id!;
        this.renderAll();
      });
      this.on(el, 'dblclick', () => {
        this.inspectedKey = el.dataset.id!;
        this.assignInspected();
      });
    });
    $('#pageLabel').textContent = `${this.page + 1} / ${pages}`;
    const countEl = $('#rosterCount');
    if (countEl) countEl.textContent = `匹配 ${list.length} 名`;
    const activeFilters = Boolean(this.typeFilter || this.rarityFilter !== '' || this.colorFilter || this.search || this.filter !== 'all');
    $('#resetRoster')?.classList.toggle('is-off', !activeFilters);
    $$('#colorChips [data-color]').forEach((x) => x.classList.toggle('selected', x.dataset.color === this.colorFilter));
  }

  private assignInspected(): void {
    const troop = this.byKey(this.inspectedKey ?? '');
    if (!troop) return;
    const value: SlotValue = troop.key === 'hero' ? 'hero' : Number(troop.key);
    if (this.slots[this.selected] === value) return;
    if (!this.canAddCopy(value)) {
      toast(troop.name + ' 没有可用副本。');
      return;
    }
    const occupantKey = this.slots[this.selected];
    const occupant = occupantKey != null ? this.byKey(String(occupantKey)) : undefined;
    this.slots[this.selected] = value;
    if (!occupant) {
      const next = this.slots.findIndex((s) => s === null);
      if (next >= 0) this.selected = next;
    }
    this.changed();
    toast(occupant ? `已用「${troop.name}」替换「${occupant.name}」。` : `已将「${troop.name}」编入 ${this.selected + 1} 号位。`);
  }

  private removeInspected(): void {
    const index = this.slots[this.selected] != null && String(this.slots[this.selected]) === this.inspectedKey
      ? this.selected : this.slots.findIndex((s) => s != null && String(s) === this.inspectedKey);
    if (index < 0) return;
    this.dropSlot(index);
  }

  private renderInspect(): void {
    const troop = this.byKey(this.inspectedKey ?? '');
    const dock = $('#inspect');
    if (!troop) {
      dock.innerHTML = '<p class="inspect-empty">未选中成员</p>';
      return;
    }
    const slotValue: SlotValue = troop.key === 'hero' ? 'hero' : Number(troop.key);
    const usedAt = this.slots[this.selected] === slotValue ? this.selected : this.slots.indexOf(slotValue);
    const canAdd = this.canAddCopy(slotValue) && this.slots[this.selected] !== slotValue;
    const occupantKey = this.slots[this.selected];
    const occupant = occupantKey != null ? this.byKey(String(occupantKey)) : undefined;
    const action =
      usedAt >= 0 && !canAdd
        ? `<button class="inspect-act" id="inspectAct" type="button">卸下 · ${usedAt + 1}号位</button>`
        : occupant
          ? `<button class="inspect-act primary" id="inspectAct" type="button">替换 ${escapeHtml(occupant.name)}</button>`
          : `<button class="inspect-act primary" id="inspectAct" type="button">编入 ${this.selected + 1}号位</button>`;
    dock.innerHTML = `
      <div class="inspect-art">${troopImg(troop.troop, troop.key === 'hero', '', this.ctx.save().character)}</div>
      <div class="inspect-copy">
        <div class="inspect-name"><b>${escapeHtml(troop.name)}</b><span>${troop.key === 'hero' ? '主角' : RARITY_CN_ROSTER[troop.rarityIdx]} · ${troop.typeLabel} · Lv.${troop.level}${troop.copies > 1 ? ` · ×${troop.copies}` : ''}</span></div>
        <div class="inspect-spell">
          ${manaCorner('inspect-mana', troop.colors, troop.cost)}
          <div><strong class="${isCoupletSpell(troop.spellName) ? 'spell-couplet' : ''}">${escapeHtml(spellTitleText(troop.spellName))}</strong><small>${troop.key === 'hero' ? '经武器施放' : '部队法术'}</small></div>
        </div>
        <p>${spellText(troop.spellDesc, troop.magic)}</p>
        ${statChips(troop.attack, troop.armor, troop.health, troop.magic)}
      </div>
      <div class="inspect-ops">
        ${action}
        <button class="inspect-codex" id="inspectCodex" type="button">图鉴</button>
      </div>`;
    mountIcons(dock);
    this.termTipsInspect?.();
    this.termTipsInspect = bindTermTips(dock);
    $('#inspectAct').onclick = () => (usedAt >= 0 && !canAdd ? this.removeInspected() : this.assignInspected());
    $('#inspectCodex').onclick = () => {
      // TM-11：主角图鉴统一进入壳内武器中心，不再打开独立网页或绕回英雄页。
      if (troop.key === 'hero') this.ctx.navigate('#weapons/owned');
      else this.ctx.navigate('#troop/' + troop.key);
    };
  }

  // —— 网关操作 ——

  private async setActive(): Promise<void> {
    if (this.isDirty()) {
      const validation = validateTeam(this.ctx.save(), { members: this.slotsToMembers(), bannerKingdomId: this.banner });
      if (!validation.ok) return void toast(validation.issues[0]?.message ?? '编队未通过校验。');
      await this.autosave();
      if (this.isDirty()) return;
    }
    await this.teamSaveQueue;
    const { result } = await this.ctx.gateway.activateTeam(this.selectedTeamIndex);
    this.renderAll();
    if (isFailure(result)) return void toast(result.message);
    toast(`「${this.currentTeam()?.name ?? ''}」已设为出战队伍。`);
  }

  private async addTeam(): Promise<void> {
    // 存档要求每支预设队合法（4 人）：新建 = 复制当前队成员起底
    const save = this.ctx.save();
    const source = this.currentTeam();
    // 自动保存下存档里的预设一定是最近一次合法阵容；未完成的草稿不拿来起底
    const members = source ? source.members : this.slotsToMembers();
    if (members.length < MIN_TEAM_SIZE) {
      // TM-10：这句只属于「新建」，不能被别的路径复用
      toast(`新建预设要从一支合法编队起底：当前 ${members.length} 人，先补到 ${MIN_TEAM_SIZE} 人。`);
      return;
    }
    const name = `新队伍 ${save.teams.length + 1}`.slice(0, 12);
    const { result } = await this.persistTeam(save.teams.length, {
      name,
      members,
      bannerKingdomId: source ? source.bannerKingdomId : this.banner,
      ...resolvedTeamLoadout(save, source ?? { name, members, bannerKingdomId: this.banner }),
    });
    if (result.ok) {
      this.selectedTeamIndex = result.index;
      this.loadTeamIntoSlots();
      toast('已创建新的编队预设。');
    }
    this.renderAll();
  }

  private async renameTeam(): Promise<void> {
    const team = this.currentTeam();
    if (!team) return;
    const name = prompt('输入新的队伍名称', team.name)?.trim();
    if (!name || name === team.name) return;
    await this.persistTeam(this.selectedTeamIndex, {
      name: name.slice(0, 12),
      members: team.members,
      bannerKingdomId: team.bannerKingdomId,
      ...resolvedTeamLoadout(this.ctx.save(), team),
    });
    this.renderAll();
  }

  /** TM-10：删除的拦截理由必须对症（阶段 A 空队态下弹的是"先补齐再新建预设"） */
  private async deleteTeam(): Promise<void> {
    const save = this.ctx.save();
    const team = this.currentTeam();
    if (save.teams.length <= 1) {
      toast('至少要保留一支预设队，这支不能删。');
      return;
    }
    if (this.selectedTeamIndex === save.activeTeamIndex) {
      toast('这支正在出战，不能删除——先把别的队「设为出战」再来删。');
      return;
    }
    this.askConfirm({
      title: `删除预设队「${team?.name ?? ''}」？`,
      lines: [
        ['成员', String(team?.members.length ?? 0) + ' 人'],
        ['影响', '只删这支预设，部队与养成进度不受影响'],
        ['不可撤销', '删除后无法找回'],
      ],
      okLabel: '删除这支预设',
      run: () => void this.doDeleteTeam(),
    });
  }

  private async doDeleteTeam(): Promise<void> {
    const save = this.ctx.save();
    const { result } = await this.ctx.gateway.deleteTeam(this.selectedTeamIndex);
    if (isFailure(result)) {
      toast(result.message);
      return;
    }
    this.selectedTeamIndex = Math.min(this.selectedTeamIndex, save.teams.length - 2);
    this.loadTeamIntoSlots();
    toast('队伍已删除。');
    this.renderAll();
  }

  // —— 旗帜选择（M6：解锁列表 + 加成色签） ——

  /** 队伍当前用色（旗帜是否值得挂，判据必须与选择器同屏，TM-5） */
  private teamColors(): Record<string, number> {
    const out: Record<string, number> = {};
    for (const s of this.slots) {
      if (s == null) continue;
      const entry = this.byKey(String(s));
      for (const c of entry?.colors ?? []) {
        const key = c.toLowerCase();
        out[key] = (out[key] ?? 0) + 1;
      }
    }
    return out;
  }

  private toggleBannerPicker(): void {
    // TM-5：改居中独立弹层（阶段 A 挂在 lineup 内部、盖住 3、4 号位，且 Esc/点空白都关不掉）
    const host = document.body;
    if (this.closeBannerPicker()) return;
    const save = this.ctx.save();
    const used = this.teamColors();
    const hitCount = (kingdom: string): number =>
      Object.entries(BANNERS[kingdom]?.boosts ?? {}).filter(([c, n]) => (n ?? 0) > 0 && used[c.toLowerCase()]).length;
    const row = (kingdom: string | null): string => {
      if (kingdom === null) {
        return `<button class="banner-opt${this.banner === null ? ' on' : ''}" data-banner="" type="button" aria-pressed="${this.banner === null}">
          <span class="banner-opt-name"><b>不装备旗帜</b><small>不改变法力获取</small></span></button>`;
      }
      const def = BANNERS[kingdom]!;
      const unlocked = bannerUnlocked(save, kingdom);
      const chips = Object.entries(def.boosts)
        .map(([color, mana]) => {
          const key = color as keyof typeof BANNER_COLOR_LABELS;
          return `<span class="banner-gem" title="${BANNER_COLOR_LABELS[key]}色 ${mana! > 0 ? '+' : '−'}${Math.abs(mana!)} 法力值">${gemSvg([color.toLowerCase()])}<i>${BANNER_COLOR_LABELS[key]} ${mana! > 0 ? '+' : '−'}${Math.abs(mana!)}</i></span>`;
        })
        .join('');
      const hits = hitCount(kingdom);
      return `<button class="banner-opt${this.banner === kingdom ? ' on' : ''}${unlocked ? '' : ' locked'}" data-banner="${kingdom}" aria-pressed="${this.banner === kingdom}"${unlocked ? '' : ' disabled'} type="button">
        ${bannerArtHtml(kingdom, { size: 96, locked: !unlocked, cls: 'banner-opt-art' })}
        <span class="banner-opt-name"><b>${kingdom}</b><small>${this.banner === kingdom ? '已装备' : unlocked ? '点击装备' : ''}</small></span>
        <span class="banner-opt-boosts">${chips}</span>
        ${unlocked ? (hits ? `<small class="banner-hit">强化 ${hits} 种队伍用色</small>` : '<small class="banner-hit neutral">队伍未使用加成色</small>') : '<small class="banner-lock">王国开放后解锁</small>'}
      </button>`;
    };
    const all = Object.keys(BANNERS);
    const unlockedList = all
      .filter((k) => bannerUnlocked(save, k))
      .sort((a, b) => hitCount(b) - hitCount(a) || a.localeCompare(b, 'zh-Hans-CN'));
    const lockedList = all.filter((k) => !bannerUnlocked(save, k));
    const usedCopy = ROSTER_COLORS.filter((c) => used[c]).map((c) => `${COLOR_CN_ROSTER[c]}×${used[c]}`).join(' ') || '暂无';
    const veil = document.createElement('div');
    veil.className = 'modal-veil banner-veil';
    veil.innerHTML = `
      <section class="banner-picker" role="dialog" aria-modal="true" aria-labelledby="bannerPickerTitle">
        <div class="banner-picker-head">
          <div><b id="bannerPickerTitle">选择旗帜</b><span class="banner-count">已解锁 ${unlockedList.length} / ${all.length}</span></div>
          <span class="banner-used">队伍用色 ${usedCopy}</span>
          <button class="sheet-close" data-banner-close type="button" aria-label="关闭"><span data-icon="close"></span></button>
        </div>
        <p class="banner-picker-note">每次消除对应颜色的宝石，按旗帜数值增加或减少法力。</p>
        <label class="banner-search"><span data-icon="search"></span><input type="search" id="bannerSearch" placeholder="搜索王国" aria-label="搜索王国" autocomplete="off"></label>
        <div class="banner-picker-list">
          <div class="banner-group">可用旗帜</div>
          ${row(null)}
          ${unlockedList.map((kingdom) => row(kingdom)).join('')}
          <details class="banner-locked-group">
            <summary>未解锁旗帜 · ${lockedList.length}</summary>
            ${lockedList.map((kingdom) => row(kingdom)).join('')}
          </details>
          <p class="banner-empty" hidden>没有找到这个王国</p>
        </div>
      </section>`;
    veil.addEventListener('click', (e) => {
      const target = e.target as HTMLElement;
      if (target === veil || target.closest('[data-banner-close]')) return void this.closeBannerPicker();
      const btn = target.closest('[data-banner]') as HTMLElement | null;
      if (!btn || btn.hasAttribute('disabled')) return;
      const kingdom = btn.dataset.banner ?? '';
      this.banner = kingdom === '' ? null : kingdom;
      this.closeBannerPicker();
      const def = this.banner ? bannerOf(this.banner) : null;
      toast(def ? `已挂上「${this.banner}」旗帜（${describeBoosts(def.boosts)}）。` : '已取下旗帜。');
      this.changed();
    });
    const search = veil.querySelector<HTMLInputElement>('#bannerSearch')!;
    search.addEventListener('input', () => {
      const query = search.value.trim().toLocaleLowerCase();
      let matches = 0;
      const locked = veil.querySelector<HTMLDetailsElement>('.banner-locked-group')!;
      let lockedMatches = 0;
      veil.querySelectorAll<HTMLButtonElement>('[data-banner]').forEach((button) => {
        const kingdom = button.dataset.banner ?? '';
        button.hidden = !!query && !kingdom.toLocaleLowerCase().includes(query);
        if (!button.hidden) {
          matches++;
          if (button.disabled) lockedMatches++;
        }
      });
      locked.hidden = lockedMatches === 0;
      if (query) locked.open = lockedMatches > 0;
      (veil.querySelector('.banner-group') as HTMLElement).hidden = !!query;
      (veil.querySelector('.banner-empty') as HTMLElement).hidden = matches > 0;
    });
    veil.addEventListener('keydown', (event) => {
      if (event.key !== 'Tab') return;
      const focusable = [...veil.querySelectorAll<HTMLElement>('button:not(:disabled), input, summary')]
        .filter((element) => element.getClientRects().length > 0);
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    });
    host.appendChild(veil);
    mountIcons(veil);
    veil.querySelector<HTMLButtonElement>('[data-banner-close]')!.focus();
  }

  /** 关闭弹出（已开着返回 true） */
  private closeBannerPicker(): boolean {
    const existing = document.querySelector('.banner-veil');
    existing?.remove();
    if (existing) document.querySelector<HTMLButtonElement>('#banner')?.focus({ preventScroll: true });
    return Boolean(existing);
  }

  // —— 二次确认（TM-9/TM-10） ——

  private askConfirm(opts: { title: string; lines: Array<[string, string]>; okLabel: string; run: () => void }): void {
    this.confirmAction = opts.run;
    $('#teamConfirmTitle').textContent = opts.title;
    $('#teamConfirmLines').innerHTML = opts.lines.map(([k, v]) => `<li><span>${k}</span><b>${v}</b></li>`).join('');
    $('#teamConfirmOk').textContent = opts.okLabel;
    $('#teamConfirm').hidden = false;
    $('#teamConfirmOk').focus();
  }

  private closeConfirm(): void {
    this.confirmAction = null;
    const veil = $('#teamConfirm');
    if (veil) veil.hidden = true;
  }

  // —— 工具 ——

  private on(target: EventTarget, type: string, fn: EventListenerOrEventListenerObject): void {
    target.addEventListener(type, fn);
    this.listeners.push([target, type, fn]);
  }

  private bind(selector: string, type: string, fn: EventListenerOrEventListenerObject): void {
    const el = $(selector);
    if (el) this.on(el, type, fn);
  }

  dispose(): void {
    document.getElementById('stage')?.classList.remove('team-responsive');
    this.drag?.detach();
    this.drag = null;
    this.closeBannerPicker();
    this.closeConfirm();
    this.termTipsInspect?.();
    for (const [target, type, fn] of this.listeners.splice(0)) {
      target.removeEventListener(type, fn);
    }
  }
}
