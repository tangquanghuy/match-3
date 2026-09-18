/**
 * 部队编成屏（计划 §5.3）。预设队、站位、旗帜、校验 issues 全走存档与 teamRules。
 * 名册 = 收藏中的部队 + 主角；立绘走本地降级图（troopTypes 映射 + 点名覆盖）。
 */
import type { TroopData } from '../../data/troops';
import { getTroopById } from '../../data/troops';
import type { TeamMember } from '../state/schema';
import { troopStatsOf } from '../systems/troopProgress';
import { heroStatsOf } from '../systems/hero';
import { anyWeaponById } from '../data/weaponCatalog';
import { bannerUnlocked } from '../systems/banners';
import { BANNERS, BANNER_COLOR_LABELS, bannerOf } from '../data/banners';
import { bottomNavHtml, mountIcons, toast, toastHtml, topbarHtml, gemSvg, $, $$ } from '../shell/chrome';
import { isFailure } from '../gateway';
import { renderSpell } from '../shell/spellText';
import type { Screen, ShellCtx } from '../shell/screen';

type SlotValue = number | 'hero' | null;
const PAGE_SIZE = 8;

/** GOW 封面 CDN（与战斗渲染 App.ts 同源同命名）：重绘立绘批次的上传源，命中不了的条目继续沿链回退 */
export function troopCdnArt(name: string): string {
  return `https://rpg.bolt.qzz.io/${encodeURIComponent('封面')}/${encodeURIComponent(name)}.webp`;
}

/** 本地兜底立绘：点名覆盖 → 种族通用图（注意在 troops/ 子目录下） */
const NAMED_ART: Record<string, string> = {
  法露特: '/meta/assets/troops/falute.webp',
  奥契丝: '/meta/assets/troops/orchis.webp',
  璐米欧儿: '/meta/assets/troops/lumiere.webp',
};
export function troopArtFallback(troop: TroopData | null, hero = false): string {
  if (hero) return '/meta/assets/troops/hero.webp';
  if (troop && NAMED_ART[troop.name]) return NAMED_ART[troop.name]!;
  const byType: Record<string, string> = {
    Knight: '/meta/assets/troops/troop-paladin.png', Elf: '/meta/assets/troops/troop-elf.png', Beast: '/meta/assets/troops/troop-lion.png',
    Dragon: '/meta/assets/troops/troop-dragon.png', Dwarf: '/meta/assets/troops/troop-dwarf.png', Goblin: '/meta/assets/troops/troop-goblin.png',
    Rogue: '/meta/assets/troops/troop-rogue.png', Mystic: '/meta/assets/troops/troop-wizard.png', Giant: '/meta/assets/troops/troop-orc.png',
    Orc: '/meta/assets/troops/troop-orc.png', Monster: '/meta/assets/troops/troop-shaman.png', Wildfolk: '/meta/assets/troops/troop-lion.png',
  };
  const t = troop?.troopTypes?.[0];
  return (t && byType[t]) || '/meta/assets/troops/troop-veteran.png';
}

/**
 * 立绘兜底链（依次尝试）：本地 GOW 官方图（troops.json `portrait` 字段，data/raw 1828 张全量，
 * dev/preview 由 vite 中间件服务）→ 点名定制图 → 生成图 CDN → 种族通用图。
 */
export function troopArtChain(troop: TroopData | null, hero = false): string[] {
  if (hero || !troop) return [troopArtFallback(troop, hero)];
  const chain: string[] = [];
  if (troop.portrait) chain.push(`/meta/assets/portraits/${troop.portrait}.webp`);
  if (NAMED_ART[troop.name]) chain.push(NAMED_ART[troop.name]!);
  chain.push(troopCdnArt(troop.name), troopArtFallback(troop, hero));
  return chain;
}

/** 立绘地址（链首）：本地 GOW 官方图 */
export function troopArt(troop: TroopData | null, hero = false): string {
  return troopArtChain(troop, hero)[0]!;
}

/** 带兜底链的 <img> 标签：onerror 沿链逐级回退（大列表建议保持 lazy） */
export function troopImg(troop: TroopData | null, hero = false, attrs = ''): string {
  const chain = troopArtChain(troop, hero);
  const fb = JSON.stringify(chain.slice(1));
  return `<img src="${chain[0]}" ${attrs} loading="lazy" data-fb='${fb}' onerror="const fb=JSON.parse(this.dataset.fb||'[]');const i=fb.indexOf(this.getAttribute('src'));if(i+1<fb.length){this.src=fb[i+1]}else{this.onerror=null}">`;
}

const TYPE_CN: Record<string, string> = {
  Knight: '骑士', Elf: '精灵', Beast: '野兽', Dragon: '龙', Dwarf: '矮人', Goblin: '地精',
  Rogue: '盗贼', Mystic: '法师', Giant: '巨人', Orc: '兽人', Monster: '怪物', Human: '人类',
  Divine: '神圣', Undead: '亡灵', Construct: '构装', Elemental: '元素', Fey: '妖精',
  Wargare: '鱼人', Centaur: '半人马', Raksha: '罗刹', Stryx: '鸦人', Naga: '娜迦',
  Merfolk: '人鱼', Urska: '熊族', Tauros: '牛族', Mech: '机械', Gnome: '侏儒', Immortal: '不朽',
};
export function typeCn(types: readonly string[]): string {
  return types.map((t) => TYPE_CN[t] ?? t).join('/');
}

/** [魔法+N] 类公式按当前魔法值求值（共享渲染器，非交互粗体高亮） */
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
  private filter = 'all';
  private search = '';
  private page = 0;
  private listeners: Array<[EventTarget, string, EventListenerOrEventListenerObject]> = [];

  html(): string {
    return `
      ${topbarHtml()}
      <div class="screen team-screen">
        <section class="team-switcher" aria-label="队伍预设">
          <div class="switcher-heading">
            <span data-icon="shield"></span>
            <div><b>我的队伍</b><small>切换并管理已保存的编队</small></div>
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
          <section class="panel lineup">
            <div class="panel-head lineup-head">
              <div><small>点选槽位作为编入目标 · 队首优先承受骷髅</small><h2 id="teamName">—</h2></div>
              <span class="active-badge" id="activeBadge">出战中</span>
            </div>
            <div class="slots" id="slots"></div>
            <div class="lineup-bar">
              <button class="banner-chip" id="banner" type="button"><span data-icon="banner"></span><span id="bannerCopy">旗帜：未选择</span></button>
              <span class="save-hint" id="saveHint">已保存</span>
              <button class="set-active" id="setActive" type="button"><span data-icon="banner"></span>设为出战</button>
              <button class="save-team" id="saveTeam" type="button">保存更改</button>
            </div>
          </section>
          <section class="panel roster">
            <div class="panel-head">
              <div><small>单击查看详情 · 双击编入选中槽位</small><h2>可编入成员</h2></div>
              <div class="meta">已拥有 <b id="ownedCount">0</b> 名</div>
            </div>
            <div class="filters" id="filters">
              <button class="filter-tab on" data-filter="all">全部</button>
              <button class="filter-tab" data-filter="hero">主角</button>
              <label class="roster-search"><span data-icon="funnel"></span><input id="searchInput" type="search" placeholder="搜索成员"></label>
            </div>
            <div class="roster-grid" id="roster"></div>
            <div class="pager">
              <button id="prevPage" type="button" aria-label="上一页"><span data-icon="arrow"></span></button>
              <span id="pageLabel">1 / 1</span>
              <button class="next" id="nextPage" type="button" aria-label="下一页"><span data-icon="arrow"></span></button>
            </div>
            <article class="inspect" id="inspect" aria-live="polite"></article>
          </section>
        </div>
      </div>
      ${bottomNavHtml('队伍', '3–4 人出战')}
      ${toastHtml()}`;
  }

  mount(ctx: ShellCtx): void {
    this.ctx = ctx;
    this.injectBannerPickerStyle();
    const save = ctx.save();
    this.selectedTeamIndex = Math.min(save.activeTeamIndex, Math.max(0, save.teams.length - 1));
    this.loadTeamIntoSlots();
    this.inspectedKey = this.slots.find((s): s is NonNullable<SlotValue> => s !== null) != null
      ? String(this.slots.find((s) => s !== null))
      : 'hero';
    this.filter = 'all';
    this.search = '';
    this.page = 0;

    // 种族筛选 tabs：从收藏里实际出现的种族生成（前 5 个）
    const types = new Map<string, string>();
    for (const key of Object.keys(save.collection)) {
      const troop = getTroopById(Number(key));
      const t = troop?.troopTypes?.[0];
      if (t && !types.has(t)) types.set(t, typeCn([t]));
    }
    const filterTabs = $('#filters');
    filterTabs.querySelectorAll('[data-filter="t"]').forEach((el) => el.remove());
    const searchLabel = filterTabs.querySelector('.roster-search');
    [...types.entries()].slice(0, 5).forEach(([raw, cn]) => {
      const b = document.createElement('button');
      b.className = 'filter-tab';
      b.dataset.filter = 't:' + raw;
      b.textContent = cn;
      filterTabs.insertBefore(b, searchLabel);
    });

    this.bind('#addTeam', 'click', () => void this.addTeam());
    this.bind('#renameTeam', 'click', () => void this.renameTeam());
    this.bind('#clearTeam', 'click', () => {
      this.slots = [null, null, null, null];
      this.selected = 0;
      this.renderAll();
      toast('已清空编队（保存前不会写入存档）。');
    });
    this.bind('#deleteTeam', 'click', () => void this.deleteTeam());
    this.bind('#saveTeam', 'click', () => void this.saveCurrent());
    this.bind('#setActive', 'click', () => void this.setActive());
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
    this.slots = team ? this.membersToSlots(team.members) : [null, null, null, null];
    this.banner = team?.bannerKingdomId ?? null;
    this.selected = Math.min(this.selected, 3);
  }

  private roster(): RosterEntry[] {
    const save = this.ctx.save();
    // 主角条目实时反映已装备武器：武器决定法术/法力色/耗蓝（官方口径）
    const equipped = anyWeaponById(save.hero.equippedWeapon) ?? null;
    const list: RosterEntry[] = [{
      key: 'hero',
      troop: null,
      name: '法露特',
      typeLabel: '主角',
      typeRaw: 'hero',
      level: save.hero.level,
      cost: equipped?.manaCost ?? 1,
      colors: equipped ? [...equipped.manaColors] : ['Brown'],
      copies: 1,
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
    $('#activeBadge').textContent = active ? '出战中' : count < 3 ? '未完成' : '备用队伍';
    $('#activeBadge').className = 'active-badge' + (active ? ' active' : count < 3 ? ' incomplete' : '');
    $('#saveHint').textContent = dirty ? '有未保存的更改' : '已保存';
    $('#saveHint').classList.toggle('dirty', dirty);
    ($('#saveTeam') as HTMLButtonElement).disabled = !dirty;
    $('#setActive').hidden = active;
    ($('#setActive') as HTMLButtonElement).disabled = count < 3;
    $('#setActive').title = count < 3 ? '至少编入 3 名成员' : '将这支队伍设为当前出战队伍';
    const banner = $('#bannerCopy');
    if (banner) banner.textContent = this.banner ? `旗帜：${this.banner}` : '旗帜：未选择';
    $('#ownedCount').textContent = String(Object.keys(save.collection).length);
    this.renderTeamTabs();
    this.renderSlots();
    this.renderRoster();
    this.renderInspect();
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
          <span class="team-tab-copy"><b>${team.name}</b><small>${isActive ? '出战中' : count < 3 ? '未完成' : `${count} 人编队`}</small></span>
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
        if (!t) {
          return `<button class="slot empty${this.selected === i ? ' on' : ''}" data-slot="${i}" type="button">
            <span class="slot-tag">${i + 1}</span>
            <span class="slot-art">空 位</span>
            <span class="slot-foot"><b>空位</b><span>点选作为编入目标</span></span>
          </button>`;
        }
        return `<button class="slot${i === 0 ? ' leader' : ''}${this.selected === i ? ' on' : ''}${this.inspectedKey === t.key ? ' look' : ''}" data-slot="${i}" type="button">
          <span class="slot-tag${i === 0 ? ' skull' : ''}" title="${i === 0 ? '1号位优先承受骷髅伤害' : `${i + 1}号位`}">${i + 1}${i === 0 ? '<span data-icon="skull"></span>' : ''}</span>
          <span class="slot-art">${manaCorner('slot-mana', t.colors)}${troopImg(t.troop, t.key === 'hero', `alt="${t.name}"`)}</span>
          <span class="slot-foot"><b>${t.name}</b><span>${t.typeLabel} · Lv.${t.level}</span></span>
        </button>`;
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
      this.on(el, 'dblclick', () => {
        this.slots[Number(el.dataset.slot)] = null;
        this.renderAll();
      });
    });
  }

  private visiblePool(): RosterEntry[] {
    return this.rosterCache.filter((t) => {
      const matchesFilter =
        this.filter === 'all' ||
        (this.filter === 'hero' ? t.key === 'hero' : this.filter.startsWith('t:') ? t.typeRaw === this.filter.slice(2) : t.typeRaw === this.filter);
      return matchesFilter && (!this.search || t.name.includes(this.search) || t.typeLabel.includes(this.search));
    });
  }

  private renderRoster(): void {
    const list = this.visiblePool();
    const pages = Math.max(1, Math.ceil(list.length / PAGE_SIZE));
    this.page = Math.min(this.page, pages - 1);
    const slice = list.slice(this.page * PAGE_SIZE, this.page * PAGE_SIZE + PAGE_SIZE);
    const rosterEl = $('#roster');
    rosterEl.innerHTML = slice
      .map((t) => {
        const used = this.slots.includes(t.key === 'hero' ? 'hero' : Number(t.key));
        return `<button class="mini${used ? ' in' : ''}${this.inspectedKey === t.key ? ' look' : ''}" data-id="${t.key}" title="${t.name} · 单击查看" type="button">
          ${troopImg(t.troop, t.key === 'hero', `alt="${t.name}"`)}
          ${manaCorner('mini-mana', t.colors, t.cost)}
          <span class="mini-lv">Lv.${t.level}</span>
          <span class="mini-shade"><b>${t.name}</b><span>${t.typeLabel} · ×${t.copies}</span></span>
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
  }

  private assignInspected(): void {
    const troop = this.byKey(this.inspectedKey ?? '');
    if (!troop) return;
    const value: SlotValue = troop.key === 'hero' ? 'hero' : Number(troop.key);
    if (this.slots.includes(value)) {
      toast(troop.name + ' 已在编队中。');
      return;
    }
    const occupantKey = this.slots[this.selected];
    const occupant = occupantKey != null ? this.byKey(String(occupantKey)) : undefined;
    this.slots[this.selected] = value;
    if (!occupant) {
      const next = this.slots.findIndex((s) => s === null);
      if (next >= 0) this.selected = next;
    }
    this.renderAll();
    toast(occupant ? `已用「${troop.name}」替换「${occupant.name}」。` : `已将「${troop.name}」编入 ${this.selected + 1} 号位。`);
  }

  private removeInspected(): void {
    const index = this.slots.findIndex((s) => s != null && String(s) === this.inspectedKey);
    if (index < 0) return;
    this.slots[index] = null;
    this.selected = index;
    this.renderAll();
  }

  private renderInspect(): void {
    const troop = this.byKey(this.inspectedKey ?? '');
    const dock = $('#inspect');
    if (!troop) {
      dock.innerHTML = '<p class="inspect-empty">点选一名成员查看技能、耗蓝与属性。<small>单击不会改变编队</small></p>';
      return;
    }
    const slotValue: SlotValue = troop.key === 'hero' ? 'hero' : Number(troop.key);
    const usedAt = this.slots.indexOf(slotValue);
    const occupantKey = this.slots[this.selected];
    const occupant = occupantKey != null ? this.byKey(String(occupantKey)) : undefined;
    const action =
      usedAt >= 0
        ? `<button class="inspect-act" id="inspectAct" type="button">卸下 · ${usedAt + 1}号位</button>`
        : occupant
          ? `<button class="inspect-act primary" id="inspectAct" type="button">替换 ${occupant.name}</button>`
          : `<button class="inspect-act primary" id="inspectAct" type="button">编入 ${this.selected + 1}号位</button>`;
    dock.innerHTML = `
      <div class="inspect-art">${troopImg(troop.troop, troop.key === 'hero')}</div>
      <div class="inspect-copy">
        <div class="inspect-name"><b>${troop.name}</b><span>${troop.typeLabel} · Lv.${troop.level}</span></div>
        <div class="inspect-spell">
          ${manaCorner('inspect-mana', troop.colors, troop.cost)}
          <div><strong>${troop.spellName}</strong><small>${troop.key === 'hero' ? '经武器施放' : '部队法术'}</small></div>
        </div>
        <p>${spellText(troop.spellDesc, troop.magic)}</p>
        ${statChips(troop.attack, troop.armor, troop.health, troop.magic)}
      </div>
      <div class="inspect-ops">
        ${action}
        <button class="inspect-codex" id="inspectCodex" type="button">图鉴</button>
      </div>`;
    mountIcons(dock);
    $('#inspectAct').onclick = () => (usedAt >= 0 ? this.removeInspected() : this.assignInspected());
    $('#inspectCodex').onclick = () => {
      // 主角 → 武器图鉴（718 目录，独立页）；部队 → 部队图鉴详情
      if (troop.key === 'hero') window.open('/weapons-codex.html', '_blank');
      else this.ctx.navigate('#troop/' + troop.key);
    };
  }

  // —— 网关操作 ——

  private async saveCurrent(): Promise<void> {
    const index = this.selectedTeamIndex;
    const team = this.currentTeam();
    const { result } = await this.ctx.gateway.saveTeam(index, {
      name: team?.name ?? '新队伍',
      members: this.slotsToMembers(),
      bannerKingdomId: this.banner,
    });
    if (result.ok) {
      this.closeBannerPicker();
      toast('编队已保存。');
    } else {
      toast(result.issues[0]?.message ?? '编队未通过校验。');
    }
    this.renderAll();
  }

  private async setActive(): Promise<void> {
    if (this.isDirty()) await this.saveCurrent();
    const { result } = await this.ctx.gateway.activateTeam(this.selectedTeamIndex);
    if (isFailure(result)) toast(result.message);
    this.renderAll();
    toast(`「${this.currentTeam()?.name ?? ''}」已设为出战队伍。`);
  }

  private async addTeam(): Promise<void> {
    // 存档要求每支预设队合法（3~4 人）：新建 = 复制当前队成员起底
    const save = this.ctx.save();
    const source = this.currentTeam();
    const members = source && !this.isDirty() ? source.members : this.slotsToMembers();
    if (members.length < 3) {
      toast('当前编队不足 3 人，先补齐再新建预设。');
      return;
    }
    const name = `新队伍 ${save.teams.length + 1}`.slice(0, 12);
    const { result } = await this.ctx.gateway.saveTeam(save.teams.length, {
      name,
      members,
      bannerKingdomId: source && !this.isDirty() ? source.bannerKingdomId : this.banner,
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
    await this.ctx.gateway.saveTeam(this.selectedTeamIndex, {
      name: name.slice(0, 12),
      members: team.members,
      bannerKingdomId: this.banner,
    });
    this.renderAll();
  }

  private async deleteTeam(): Promise<void> {
    const save = this.ctx.save();
    if (this.selectedTeamIndex === save.activeTeamIndex) {
      toast('出战中的队伍不能删除。');
      return;
    }
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

  private toggleBannerPicker(): void {
    const panel = document.querySelector('.team-workspace .lineup');
    if (!panel) return;
    if (this.closeBannerPicker()) return;
    const save = this.ctx.save();
    const row = (kingdom: string | null): string => {
      if (kingdom === null) {
        return `<button class="banner-opt${this.banner === null ? ' on' : ''}" data-banner="" type="button">
          <span class="banner-opt-name"><b>不挂旗帜</b><small>无加成、无惩罚</small></span></button>`;
      }
      const def = BANNERS[kingdom]!;
      const unlocked = bannerUnlocked(save, kingdom);
      const chips = Object.entries(def.boosts)
        .map(([color, mana]) => {
          const key = color as keyof typeof BANNER_COLOR_LABELS;
          return `<span class="banner-gem" title="${color} ${mana! > 0 ? '+' : '−'}${Math.abs(mana!)} 法力">${gemSvg([color.toLowerCase()])}<i>${BANNER_COLOR_LABELS[key]} ${mana! > 0 ? '+' : '−'}${Math.abs(mana!)}</i></span>`;
        })
        .join('');
      return `<button class="banner-opt${this.banner === kingdom ? ' on' : ''}${unlocked ? '' : ' locked'}" data-banner="${kingdom}"${unlocked ? '' : ' disabled'} type="button">
        <span class="banner-opt-name"><b>${kingdom}</b><small>${def.en}</small></span>
        <span class="banner-opt-boosts">${chips}</span>
        ${unlocked ? '' : '<small class="banner-lock">任务 8/8 解锁</small>'}
      </button>`;
    };
    const wrap = document.createElement('div');
    wrap.className = 'banner-picker';
    wrap.innerHTML = `
      <div class="banner-picker-head"><b>选择旗帜</b><small>匹配加成色时该色法力 ±N（每次匹配，官方王国旗帜语义）</small></div>
      <div class="banner-picker-list">
        ${row(null)}
        ${Object.keys(BANNERS).map((kingdom) => row(kingdom)).join('')}
      </div>`;
    wrap.addEventListener('click', (e) => {
      const btn = (e.target as HTMLElement).closest('[data-banner]') as HTMLElement | null;
      if (!btn || btn.hasAttribute('disabled')) return;
      const kingdom = btn.dataset.banner ?? '';
      this.banner = kingdom === '' ? null : kingdom;
      this.closeBannerPicker();
      const def = this.banner ? bannerOf(this.banner) : null;
      toast(def ? `已选「${this.banner}」旗帜（${describeBoosts(def.boosts)}），保存编队后出战生效。` : '已取消旗帜。');
      this.renderAll();
    });
    panel.appendChild(wrap);
  }

  /** 关闭弹出（已开着返回 true） */
  private closeBannerPicker(): boolean {
    const existing = document.querySelector('.banner-picker');
    existing?.remove();
    return Boolean(existing);
  }

  // —— 工具 ——

  private on(target: EventTarget, type: string, fn: EventListenerOrEventListenerObject): void {
    target.addEventListener(type, fn);
    this.listeners.push([target, type, fn]);
  }

  /** 旗帜选择弹出样式（新类名，不与小样级联冲突；切屏随 dispose 拔除） */
  private injectBannerPickerStyle(): void {
    if (document.getElementById('banner-picker-style')) return;
    const style = document.createElement('style');
    style.id = 'banner-picker-style';
    style.textContent = `
      .team-workspace .lineup { position: relative; }
      .banner-picker {
        position: absolute; left: 10px; right: 10px; bottom: 54px; z-index: 30;
        background: linear-gradient(#221c28, #120f18);
        border: 1px solid #8e7347; border-radius: 4px;
        box-shadow: 0 12px 30px rgba(0, 0, 0, .55);
        font: 12px var(--body);
      }
      .banner-picker-head { display: flex; align-items: baseline; gap: 8px; padding: 9px 12px; border-bottom: 1px solid #3a3350; color: #d8c290; font: 13px var(--display); }
      .banner-picker-head small { color: #9a8e9c; }
      .banner-picker-list { max-height: 262px; overflow-y: auto; padding: 6px; display: grid; grid-template-columns: 1fr 1fr; gap: 4px; }
      .banner-opt { display: flex; align-items: center; gap: 8px; padding: 7px 9px; text-align: left; background: #1a1622; border: 1px solid #322c42; border-radius: 3px; }
      .banner-opt:hover:not(:disabled) { border-color: #8e7347; filter: brightness(1.15); }
      .banner-opt.on { border-color: #d8c290; background: #241d2e; }
      .banner-opt.locked { opacity: .45; }
      .banner-opt-name { display: flex; flex-direction: column; min-width: 0; flex: 1; }
      .banner-opt-name b { color: #f0e2c0; font: 12px var(--display); }
      .banner-opt-name small { color: #9a8e9c; font-size: 10px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
      .banner-opt-boosts { display: flex; gap: 5px; flex: none; }
      .banner-gem { display: inline-flex; align-items: center; gap: 2px; color: #e6d4a4; font-size: 10px; }
      .banner-gem svg { width: 12px; height: 12px; }
      .banner-lock { color: #d39a70; font-size: 10px; white-space: nowrap; }
    `;
    document.head.appendChild(style);
  }

  private bind(selector: string, type: string, fn: EventListenerOrEventListenerObject): void {
    const el = $(selector);
    if (el) this.on(el, type, fn);
  }

  dispose(): void {
    this.closeBannerPicker();
    document.getElementById('banner-picker-style')?.remove();
    for (const [target, type, fn] of this.listeners.splice(0)) {
      target.removeEventListener(type, fn);
    }
  }
}
