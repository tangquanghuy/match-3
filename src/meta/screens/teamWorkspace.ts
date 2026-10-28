import { escapeHtml } from './troopCard';

/** Shared native formation workspace. Data and actions are supplied by each host. */
export function teamWorkspaceHtml(): string {
  return `
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
`;
}

export interface TeamInspectView {
  art: string;
  name: string;
  identity: string;
  mana: string;
  spellName: string;
  couplet?: boolean;
  spellSource: string;
  /** HTML from the shared spell renderer. */
  description: string;
  stats: string;
  actions: string;
}

export function teamInspectHtml(view: TeamInspectView): string {
  return `
      <div class="inspect-art">${view.art}</div>
      <div class="inspect-copy">
        <div class="inspect-name"><b>${escapeHtml(view.name)}</b><span>${escapeHtml(view.identity)}</span></div>
        <div class="inspect-spell">
          ${view.mana}
          <div><strong class="${view.couplet ? 'spell-couplet' : ''}">${escapeHtml(view.spellName)}</strong><small>${escapeHtml(view.spellSource)}</small></div>
        </div>
        <p>${view.description}</p>
        ${view.stats}
      </div>
      <div class="inspect-ops">${view.actions}</div>`;
}
