/**
 * 武器图鉴页 —— 718 把全量目录：卡面立绘 + 中文描述 + 多维筛选 + 绑定保真度。
 * 纯 DOM 实现（工具页，不走 pixi 战斗渲染）；样式自注入，零外部资源依赖。
 * 数据：src/data/weapons.json；图标：public/gowhead-icons/{imageFile}。
 */
import weaponsJson from '../data/weapons.json';

interface WeaponRow {
  id: number;
  name: string;
  nameEn: string;
  referenceName: string;
  rarity: string;
  rarityIdx: number;
  kingdom: string;
  weaponType: string;
  role: string | null;
  roleName: string | null;
  attack: number;
  armor: number;
  health: number;
  magic: number;
  manaColors: string[];
  manaCost: number;
  spell: {
    id: number;
    name: string;
    description: string;
    meta: {
      fidelity: string;
      missingFeatures: string[];
      skippedClauses: string[];
    };
  };
  affixes: { name: string; description: string; rarity: string }[];
  releaseDate: string | null;
  immortal: boolean;
  imageFile: string;
}

const WEAPONS = weaponsJson as unknown as WeaponRow[];

const RARITY_ZH: Record<string, string> = {
  Common: '普通', Uncommon: '非普通', Rare: '稀有', UltraRare: '超稀有',
  Epic: '史诗', Mythic: '神话', Doomed: '末日',
};
const RARITY_COLOR: Record<string, string> = {
  Common: '#9aa0a6', Uncommon: '#57c84d', Rare: '#3d7bff', UltraRare: '#35c3dd',
  Epic: '#b04df0', Legendary: '#ff9d2e', Mythic: '#ff4d5e', Doomed: '#c83434',
};
const TYPE_ZH: Record<string, string> = {
  Sword: '剑', Bow: '弓', Axe: '斧', Polearm: '长柄', Staff: '法杖', Hammer: '锤',
  Dagger: '匕首', Missile: '投掷', Tome: '魔典', Mace: '钉锤', Scythe: '镰',
  Shield: '盾', Artifact: '神器', Jewellery: '首饰',
};
const COLOR_HEX: Record<string, string> = {
  Red: '#ff4d4d', Blue: '#4d8bff', Green: '#4dd66a', Yellow: '#ffd24a',
  Purple: '#b04df0', Brown: '#c8864b',
};
const COLOR_ZH: Record<string, string> = {
  Red: '红', Blue: '蓝', Green: '绿', Yellow: '黄', Purple: '紫', Brown: '棕',
};
const FIDELITY_ZH: Record<string, string> = { full: '完整实现', partial: '部分实现', 'mana-only': '占位' };
const FIDELITY_COLOR: Record<string, string> = { full: '#4dd66a', partial: '#ffd24a', 'mana-only': '#9aa0a6' };

const ICON_BASE = '/gowhead-icons/';

// —— 状态 ——
const state = {
  q: '',
  rarity: new Set<string>(),
  type: new Set<string>(),
  kingdom: new Set<string>(),
  color: new Set<string>(),
  fidelity: new Set<string>(),
  sort: 'id' as 'id' | 'rarity' | 'cost' | 'name',
  selected: null as WeaponRow | null,
};

const rarities = [...new Set(WEAPONS.map((w) => w.rarity))];
const types = [...new Set(WEAPONS.map((w) => w.weaponType))].sort();
const kingdoms = [...new Set(WEAPONS.map((w) => w.kingdom))].sort((a, b) => a.localeCompare(b, 'zh'));
const colors = ['Red', 'Blue', 'Green', 'Yellow', 'Purple', 'Brown'];

function applyFilters(): WeaponRow[] {
  let out = WEAPONS.filter((w) => {
    if (state.q) {
      const q = state.q.toLowerCase();
      const hay = `${w.name} ${w.nameEn} ${w.referenceName} ${RARITY_ZH[w.rarity] || ''} ${TYPE_ZH[w.weaponType] || ''} ${w.kingdom} ${w.roleName || ''}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    if (state.rarity.size && !state.rarity.has(w.rarity)) return false;
    if (state.type.size && !state.type.has(w.weaponType)) return false;
    if (state.kingdom.size && !state.kingdom.has(w.kingdom)) return false;
    if (state.color.size && !w.manaColors.some((c) => state.color.has(c))) return false;
    if (state.fidelity.size && !state.fidelity.has(w.spell.meta.fidelity)) return false;
    return true;
  });
  if (state.sort === 'rarity') out = out.slice().sort((a, b) => b.rarityIdx - a.rarityIdx || a.manaCost - b.manaCost);
  else if (state.sort === 'cost') out = out.slice().sort((a, b) => a.manaCost - b.manaCost);
  else if (state.sort === 'name') out = out.slice().sort((a, b) => a.name.localeCompare(b.name, 'zh'));
  return out;
}

function colorPips(w: WeaponRow): string {
  return w.manaColors.map((c) => `<span class="pip" style="background:${COLOR_HEX[c] || '#888'}" title="${COLOR_ZH[c] || c}"></span>`).join('');
}

function toggleSet(set: Set<string>, key: string): boolean {
  if (set.has(key)) { set.delete(key); return false; }
  set.add(key);
  return true;
}

// —— 渲染 ——

function chipRow(label: string, items: { key: string; label: string; color?: string }[], set: Set<string>): HTMLElement {
  const row = document.createElement('div');
  row.className = 'fc-row';
  const lab = document.createElement('span');
  lab.className = 'fc-label';
  lab.textContent = label;
  row.appendChild(lab);
  for (const it of items) {
    const b = document.createElement('button');
    b.className = 'chip' + (set.has(it.key) ? ' on' : '');
    b.textContent = it.label;
    if (it.color && set.has(it.key)) b.style.borderColor = it.color;
    b.addEventListener('click', () => {
      const on = toggleSet(set, it.key);
      b.classList.toggle('on', on);
      if (it.color) b.style.borderColor = on ? it.color : '';
      renderGrid();
    });
    row.appendChild(b);
  }
  return row;
}

function renderGrid(): void {
  const grid = document.getElementById('codex-grid')!;
  const count = document.getElementById('codex-count')!;
  const list = applyFilters();
  count.textContent = `${list.length} / ${WEAPONS.length} 把 · 战斗可用 ${WEAPONS.filter((w) => w.spell.meta.fidelity !== 'mana-only').length} · 完整实现 ${WEAPONS.filter((w) => w.spell.meta.fidelity === 'full').length}`;
  grid.innerHTML = '';
  const frag = document.createDocumentFragment();
  for (const w of list) {
    const card = document.createElement('button');
    card.className = 'wcard';
    card.style.borderColor = RARITY_COLOR[w.rarity] || '#666';
    const fid = w.spell.meta.fidelity;
    card.innerHTML = `
      <img loading="lazy" src="${ICON_BASE}${w.imageFile}" alt="${w.name}" onerror="this.style.visibility='hidden'"/>
      <div class="wname" title="${w.name} ${w.nameEn}">${w.name}</div>
      <div class="wmeta">
        <span class="wrar" style="color:${RARITY_COLOR[w.rarity]}">${RARITY_ZH[w.rarity] || w.rarity}</span>
        <span class="wpips">${colorPips(w)}</span>
        <span class="wcost">${w.manaCost}</span>
      </div>
      <div class="wfid" style="color:${FIDELITY_COLOR[fid]}">${FIDELITY_ZH[fid]}</div>`;
    card.addEventListener('click', () => showDetail(w));
    frag.appendChild(card);
  }
  grid.appendChild(frag);
}

function statLine(w: WeaponRow): string {
  const parts: string[] = [];
  if (w.attack) parts.push(`攻+${w.attack}`);
  if (w.armor) parts.push(`甲+${w.armor}`);
  if (w.health) parts.push(`血+${w.health}`);
  if (w.magic) parts.push(`魔+${w.magic}`);
  return parts.length ? parts.join(' · ') : '无主角加成';
}

function showDetail(w: WeaponRow): void {
  state.selected = w;
  const panel = document.getElementById('codex-detail')!;
  const meta = w.spell.meta;
  const affixes = w.affixes.length
    ? `<div class="dsec"><div class="dtitle">淬炼词缀（${w.affixes.length}）</div>${w.affixes
        .map((a) => `<div class="affix"><b>${a.name}</b>（${a.rarity}）：${a.description}</div>`)
        .join('')}</div>`
    : '';
  const skipped = meta.skippedClauses.length
    ? `<div class="dsec"><div class="dtitle">未实现子句（${meta.skippedClauses.length}）</div>${meta.skippedClauses
        .map((s) => `<div class="skip">· ${s}</div>`)
        .join('')}</div>`
    : '';
  panel.innerHTML = `
    <button id="dclose">✕</button>
    <div class="dhead">
      <img src="${ICON_BASE}${w.imageFile}" alt="${w.name}" style="border-color:${RARITY_COLOR[w.rarity]}"/>
      <div>
        <div class="dname">${w.name}<span class="den">${w.nameEn}</span></div>
        <div class="dsub">${RARITY_ZH[w.rarity] || w.rarity} · ${TYPE_ZH[w.weaponType] || w.weaponType} · ${w.kingdom}${w.roleName ? ' · ' + w.roleName : ''}${w.immortal ? ' · 不朽' : ''}</div>
        <div class="dsub">法力 ${w.manaCost} ${colorPips(w)} ｜ ${statLine(w)}</div>
        <div class="dfid" style="color:${FIDELITY_COLOR[meta.fidelity]}">绑定：${FIDELITY_ZH[meta.fidelity]}</div>
      </div>
    </div>
    <div class="dsec"><div class="dtitle">法术 · ${w.spell.name}</div><div class="ddesc">${w.spell.description}</div></div>
    ${affixes}
    ${skipped}
  `;
  panel.classList.add('open');
  panel.querySelector('#dclose')!.addEventListener('click', () => panel.classList.remove('open'));
}

function injectStyle(): void {
  const css = `
    #codex-root { font-family: 'Playfair Display', 'Noto Serif SC', serif; color: #f0e2bf; }
    #codex-head { padding: 12px 16px 6px; }
    #codex-title { font-size: 22px; font-weight: 700; color: #d8c290; letter-spacing: 2px; }
    #codex-count { font-size: 12px; color: #8a8f9c; margin-left: 12px; }
    #codex-q { background: #16161f; border: 1px solid #3a3f4b; color: #f0e2bf; padding: 4px 10px;
               border-radius: 4px; margin-left: 16px; width: 200px; }
    .fc-row { display: flex; flex-wrap: wrap; gap: 4px; align-items: center; padding: 3px 16px; }
    .fc-label { font-size: 12px; color: #8a8f9c; width: 58px; flex: none; }
    .chip { background: #16161f; border: 1px solid #3a3f4b; color: #b9bfc9; font-size: 12px;
            padding: 2px 8px; border-radius: 10px; cursor: pointer; }
    .chip.on { color: #f0e2bf; background: #262635; border-color: #d8c290; }
    #codex-body { display: flex; align-items: flex-start; }
    #codex-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(148px, 1fr));
                  gap: 10px; padding: 10px 16px 40px; flex: 1; }
    .wcard { background: #12121c; border: 1px solid #666; border-radius: 8px; padding: 8px;
             cursor: pointer; text-align: center; display: flex; flex-direction: column; gap: 4px;
             color: #f0e2bf; }
    .wcard:hover { background: #1c1c28; }
    .wcard img { width: 100%; aspect-ratio: 1; object-fit: contain; border-radius: 6px; background: #0a0a12; }
    .wname { font-size: 13px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .wmeta { display: flex; justify-content: space-between; align-items: center; font-size: 11px; }
    .wrar { font-weight: 600; }
    .pip { display: inline-block; width: 9px; height: 9px; border-radius: 50%; margin-right: 2px; }
    .wcost { color: #8a8f9c; }
    .wfid { font-size: 10px; }
    #codex-detail { display: none; position: sticky; top: 0; width: 360px; flex: none; max-height: 100vh;
                    overflow-y: auto; background: #12121c; border-left: 1px solid #3a3f4b; padding: 14px; }
    #codex-detail.open { display: block; }
    #dclose { float: right; background: none; border: none; color: #8a8f9c; font-size: 16px; cursor: pointer; }
    .dhead { display: flex; gap: 12px; }
    .dhead img { width: 96px; height: 96px; object-fit: contain; border: 2px solid #666; border-radius: 8px; background: #0a0a12; }
    .dname { font-size: 18px; font-weight: 700; }
    .den { font-size: 12px; color: #8a8f9c; margin-left: 8px; }
    .dsub { font-size: 12px; color: #b9bfc9; margin-top: 3px; }
    .dfid { font-size: 12px; margin-top: 4px; }
    .dsec { margin-top: 12px; }
    .dtitle { font-size: 13px; color: #d8c290; margin-bottom: 4px; }
    .ddesc { font-size: 13px; line-height: 1.6; }
    .affix, .skip { font-size: 12px; color: #b9bfc9; padding: 2px 0; }
    .skip { color: #c8864b; }
  `;
  const style = document.createElement('style');
  style.textContent = css;
  document.head.appendChild(style);
}

export function mount(container: HTMLElement): void {
  injectStyle();
  container.innerHTML = `
    <div id="codex-root">
      <div id="codex-head">
        <span id="codex-title">武器图鉴</span>
        <span id="codex-count"></span>
        <input id="codex-q" placeholder="搜索中/英文名…" />
      </div>
      <div id="codex-filters"></div>
      <div id="codex-body">
        <div id="codex-grid"></div>
        <div id="codex-detail"></div>
      </div>
    </div>`;
  (document.getElementById('codex-q') as HTMLInputElement).addEventListener('input', (e) => {
    state.q = (e.target as HTMLInputElement).value.trim();
    renderGrid();
  });
  const filters = document.getElementById('codex-filters')!;
  filters.appendChild(chipRow('稀有度', rarities.map((r) => ({ key: r, label: RARITY_ZH[r] || r, color: RARITY_COLOR[r] })), state.rarity));
  filters.appendChild(chipRow('类型', types.map((t) => ({ key: t, label: TYPE_ZH[t] || t })), state.type));
  filters.appendChild(chipRow('颜色', colors.map((c) => ({ key: c, label: COLOR_ZH[c], color: COLOR_HEX[c] })), state.color));
  filters.appendChild(chipRow('绑定', ['full', 'partial', 'mana-only'].map((f) => ({ key: f, label: FIDELITY_ZH[f] })), state.fidelity));
  filters.appendChild(chipRow('王国', kingdoms.map((k) => ({ key: k, label: k })), state.kingdom));
  const sortRow = document.createElement('div');
  sortRow.className = 'fc-row';
  sortRow.innerHTML = `<span class="fc-label">排序</span>`;
  const sorts: [string, string][] = [['id', '默认'], ['rarity', '稀有度'], ['cost', '费用'], ['name', '名称']];
  for (const [key, label] of sorts) {
    const b = document.createElement('button');
    b.className = 'chip' + (state.sort === key ? ' on' : '');
    b.textContent = label;
    b.addEventListener('click', () => {
      state.sort = key as typeof state.sort;
      sortRow.querySelectorAll('.chip').forEach((x) => x.classList.remove('on'));
      b.classList.add('on');
      renderGrid();
    });
    sortRow.appendChild(b);
  }
  filters.appendChild(sortRow);
  renderGrid();
}
