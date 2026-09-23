/**
 * 角色/技能详情面板（战斗技能系统 · 需求 4）。
 *
 * 点击角色卡弹出的 DOM 覆盖层，展示角色完整属性、技能全文与全部特质。
 * 纯读：只消费 Character 与该角色对应的 TroopData，不触碰引擎状态（需求 4.5）。
 *
 * 设计：把「数据 → 展示模型」的映射抽成纯函数 buildDetailViewModel（可在 node 环境单测），
 * DOM 渲染与交互由 CharacterDetailPanel 承担（依赖 document，仅浏览器运行）。
 */
import { BaseColor } from '@engine/types';
import type { Character } from '@engine/types';
import { getTrait } from '@engine/traits';
import { skillDisplayOf } from '@session/assigner';
import type { TroopData } from '../data/troops';
import { STATUS_DESCRIPTIONS } from '../data/statusDescriptions';
import { statusBadge, statusBadgeIcon } from './statusBadges';
// 技能文案求值与英雄页/武器图鉴/施法确认层同一套渲染：面板里再出现裸的
// `[魔法+N]` 占位就与确认层自相矛盾（B-4 三条规则之二）。先 esc 再渲染，
// renderSpell 只改写 [..] 片段，对已转义文本安全。
import { renderSpell } from '../meta/shell/spellText';

/** 面板展示用的纯数据模型（与 DOM 无关，便于测试） */
export interface DetailViewModel {
  name: string;
  hp: number;
  maxHp: number;
  armor: number;
  attack: number;
  magic: number;
  /** 当前法力 */
  mana: number;
  /** 释放技能所需法力（= 技能法力消耗） */
  manaCost: number;
  colors: BaseColor[];
  /**
   * 当前状态（B-10）。阶段 A 的面板不列状态——玩家长按开面板想搞清"这张卡怎么了"，
   * 中毒几层、织网还剩几回合一个字都没有，只能退出去点卡面上 17px 的徽记。
   */
  statuses: { id: string; label: string; color: string; turns: number; magnitude?: number }[];
  /** 技能信息；无对应 TroopData 时为 null */
  skill: {
    name: string;
    description: string;
    /** 法力消耗（等于角色 manaCost） */
    manaCost: number;
  } | null;
  /**
   * 特质列表。以 Character.traitIds 为权威来源（宿主注入的角色没有 TroopData 也可见），
   * TroopData.traits 只作官方描述补充。implemented=false 表示引擎尚未实现该特质，
   * 战斗中不生效——如实展示而不是藏掉。
   */
  traits: { name: string; description: string; implemented: boolean }[];
}

/**
 * 从 Character（+可选 TroopData）构建展示模型（需求 4.1–4.3）。纯函数、无副作用。
 * hp 夹在 [0, maxHp]、mana 夹在 [0, manaCost]，避免展示越界的中间态数值。
 */
export interface CharacterDisplay {
  /** 快照携带的技能显示文本（宿主武器/兵种法术） */
  spellName?: string;
  spellDescription?: string;
  /** 库外特质 code 的中文名兜底（职业天赋/专属特质） */
  traitNames?: Record<string, string>;
}

export function buildDetailViewModel(
  char: Character,
  troop?: TroopData,
  display?: CharacterDisplay,
): DetailViewModel {
  // 技能：TroopData 优先（官方全文）；宿主角色没有兵种数据时，
  // 从分拣技能池取该 skillId 的名称/描述（分拣分配的技能都在池内）。
  const skill = troop
    ? {
        name: troop.spell.name,
        description: troop.spell.description,
        manaCost: char.manaCost,
      }
    : char.spellName || display?.spellName
      ? {
          name: char.spellName ?? display?.spellName ?? '',
          description: char.spellDescription ?? display?.spellDescription ?? '',
          manaCost: char.manaCost,
        }
      : (() => {
          const pool = skillDisplayOf(char.skillId ?? '');
          return pool
            ? { name: pool.name, description: pool.description, manaCost: char.manaCost }
            : null;
        })();

  // 特质合并：traitIds（引擎权威）→ 特质库取名称/描述；库里没有的（未实现 code）
  // 回落到 TroopData 的官方文本并标注未生效。TroopData 里多出的条目也列出。
  const traits: DetailViewModel['traits'] = [];
  const seen = new Set<string>();
  for (const code of char.traitIds ?? []) {
    seen.add(code);
    const lib = getTrait(code);
    const official = troop?.traits.find((t) => t.code === code);
    traits.push({
      name: official?.name ?? lib?.name ?? display?.traitNames?.[code] ?? char.traitNames?.[code] ?? code,
      description: official?.description ?? lib?.description ?? '',
      implemented: !!lib,
    });
  }
  for (const t of troop?.traits ?? []) {
    if (seen.has(t.code)) continue;
    traits.push({
      name: t.name,
      description: t.description,
      implemented: !!getTrait(t.code),
    });
  }

  return {
    name: char.name,
    hp: Math.max(0, Math.min(char.hp, char.maxHp)),
    maxHp: char.maxHp,
    armor: Math.max(0, char.armor),
    attack: char.attack,
    magic: char.magic,
    mana: Math.max(0, Math.min(char.mana, char.manaCost)),
    manaCost: char.manaCost,
    colors: [...char.colors],
    statuses: (char.statuses ?? []).map((s) => {
      const badge = statusBadge(s.id);
      return {
        id: s.id,
        label: badge.label,
        color: badge.color,
        turns: s.turns,
        ...(s.magnitude !== undefined ? { magnitude: s.magnitude } : {}),
      };
    }),
    skill,
    traits,
  };
}

/** 六色宝石色值（与卡片/棋盘呼应） */
const COLOR_HEX: Record<BaseColor, string> = {
  [BaseColor.Red]: '#e8555e',
  [BaseColor.Green]: '#57c06b',
  [BaseColor.Blue]: '#4f9fe0',
  [BaseColor.Yellow]: '#e8c24a',
  [BaseColor.Purple]: '#a074d4',
  [BaseColor.Brown]: '#c0823f',
};

const COLOR_NAME: Record<BaseColor, string> = {
  [BaseColor.Red]: '红',
  [BaseColor.Green]: '绿',
  [BaseColor.Blue]: '蓝',
  [BaseColor.Yellow]: '黄',
  [BaseColor.Purple]: '紫',
  [BaseColor.Brown]: '棕',
};

let stylesInjected = false;
function ensureStyles(): void {
  if (stylesInjected) return;
  stylesInjected = true;
  const css = `
  .cdp-backdrop{position:fixed;inset:0;z-index:1000;display:none;
    background:rgba(6,5,4,.62);backdrop-filter:blur(2px);
    align-items:center;justify-content:center;
    font-family:"Oswald","PingFang SC","Microsoft YaHei",sans-serif}
  .cdp-backdrop.open{display:flex}
  .cdp{position:relative;width:min(420px,86vw);max-height:84vh;overflow-y:auto;
    background:linear-gradient(160deg,#171208 0%,#0d0a06 100%);
    border:1px solid rgba(216,194,144,.4);border-radius:10px;
    box-shadow:0 12px 40px rgba(0,0,0,.7);color:#f0e2bf;padding:18px 20px 20px}
  .cdp-close{position:absolute;top:6px;right:8px;width:44px;height:44px;
    display:flex;align-items:center;justify-content:center;cursor:pointer;
    border:1px solid rgba(216,194,144,.35);border-radius:6px;
    background:rgba(20,18,15,.8);color:#d8c290;font-size:15px;line-height:1}
  .cdp-close:hover{color:#fff3d2;border-color:#c9a35c}
  .cdp-name{font-family:"Playfair Display",Georgia,serif;font-weight:800;font-size:22px;
    color:#f6efe0;margin:0 40px 4px 0;letter-spacing:.01em}
  .cdp-colors{display:flex;gap:6px;margin-bottom:12px}
  .cdp-color{display:inline-flex;align-items:center;gap:3px;font-size:11px;color:#cfc19a}
  .cdp-color .dot{width:10px;height:10px;transform:rotate(45deg);border-radius:2px;
    box-shadow:0 0 4px rgba(0,0,0,.5)}
  .cdp-stats{display:grid;grid-template-columns:repeat(2,1fr);gap:6px 14px;
    margin-bottom:14px;padding-bottom:12px;border-bottom:1px solid rgba(216,194,144,.18)}
  .cdp-stat{display:flex;justify-content:space-between;font-size:13px}
  .cdp-stat .k{color:#a89974}
  .cdp-stat .v{color:#f6efe0;font-variant-numeric:tabular-nums;font-weight:600}
  .cdp-section-title{font-size:12px;letter-spacing:.12em;text-transform:uppercase;
    color:#c9a35c;margin:0 0 6px}
  /* B-10：当前状态区（图标 + 中文名 + 实时数值 + 机制说明） */
  .cdp-statuses{display:flex;flex-direction:column;gap:6px;margin-bottom:14px}
  .cdp-status{display:flex;align-items:flex-start;gap:8px;padding:6px 8px;border-radius:6px;
    background:rgba(255,255,255,.03);border-left:2px solid color-mix(in srgb,var(--sc,#d8c290) 70%,transparent)}
  .cdp-status-ic{flex:none;width:22px;height:22px;display:flex;align-items:center;justify-content:center;
    filter:drop-shadow(0 0 3px color-mix(in srgb,var(--sc,#d8c290) 60%,transparent))}
  .cdp-status-ic img{width:20px;height:20px;object-fit:contain}
  .cdp-status-ic .status-icon-fallback{font:700 13px/1 "Oswald",sans-serif;color:#cfd2d6}
  .cdp-status-body{display:flex;flex-direction:column;gap:1px;min-width:0}
  .cdp-status-name{font-size:13px;font-weight:600;color:#f0e2bf}
  .cdp-status-name i{font-style:normal;font-weight:400;font-size:11px;color:var(--sc,#d8c290);margin-left:6px}
  .cdp-status-desc{font-size:12px;line-height:1.5;color:#b9ab84}
  .cdp-statuses+.cdp-skill{margin-top:0}
  .cdp-skill{margin-bottom:14px}
  .cdp-skill-head{display:flex;align-items:baseline;justify-content:space-between;gap:8px}
  .cdp-skill-name{font-family:"Playfair Display",Georgia,serif;font-weight:700;font-size:16px;color:#f1e9ff}
  .cdp-skill-cost{font-size:11px;color:#8fb8ff;white-space:nowrap}
  .cdp-skill-desc{font-size:13px;line-height:1.6;color:#ded0ac;margin-top:4px}
  .cdp-skill-desc b{color:#ffe6a8;font-weight:700}
  .cdp-traits{display:flex;flex-direction:column;gap:8px}
  .cdp-trait{padding:8px 10px;background:rgba(255,255,255,.03);border-radius:6px;
    border-left:2px solid rgba(216,194,144,.4)}
  .cdp-trait-name{font-size:13px;font-weight:600;color:#f0e2bf}
  .cdp-trait-desc{font-size:12px;line-height:1.5;color:#b9ab84;margin-top:2px}
  .cdp-trait-off{opacity:.55}
  .cdp-trait-off .cdp-trait-name{color:#a89974}
  .cdp-trait-tag{display:inline-block;margin-left:6px;padding:0 5px;font-size:10px;font-weight:400;
    color:#c9a35c;border:1px solid rgba(201,163,92,.5);border-radius:3px;vertical-align:1px}
  .cdp-empty{font-size:12px;color:#8a7c5c;font-style:italic}
  `;
  const style = document.createElement('style');
  style.id = 'cdp-styles';
  style.textContent = css;
  document.head.appendChild(style);
}

function esc(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

/**
 * 角色详情面板 DOM 组件。挂到 document.body 上的全屏覆盖层。
 * open() 显示某角色详情；点击背景、关闭钮或按 Esc 隐藏（需求 4.4）。
 */
export class CharacterDetailPanel {
  private backdrop: HTMLDivElement;
  private panel: HTMLDivElement;

  constructor(parent: HTMLElement = document.body) {
    ensureStyles();
    this.backdrop = document.createElement('div');
    this.backdrop.className = 'cdp-backdrop';
    this.panel = document.createElement('div');
    this.panel.className = 'cdp';
    this.backdrop.appendChild(this.panel);
    parent.appendChild(this.backdrop);

    // 点击背景（面板外）关闭（需求 4.4）
    this.backdrop.addEventListener('click', (e) => {
      if (e.target === this.backdrop) this.close();
    });
    // Esc 关闭
    window.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && this.isOpen()) this.close();
    });
  }

  isOpen(): boolean {
    return this.backdrop.classList.contains('open');
  }

  /** 打开面板展示角色详情（需求 4.1）。troop 缺省时仅展示属性，技能/特质区给出占位。 */
  open(char: Character, troop?: TroopData, display?: CharacterDisplay): void {
    const vm = buildDetailViewModel(char, troop, display);
    this.panel.innerHTML = this.render(vm);
    const close = this.panel.querySelector('.cdp-close');
    close?.addEventListener('click', () => this.close());
    this.backdrop.classList.add('open');
  }

  close(): void {
    this.backdrop.classList.remove('open');
  }

  private render(vm: DetailViewModel): string {
    const colors = vm.colors.length
      ? vm.colors
          .map(
            (c) =>
              `<span class="cdp-color"><span class="dot" style="background:${COLOR_HEX[c]}"></span>${COLOR_NAME[c]}</span>`,
          )
          .join('')
      : '<span class="cdp-empty">无关联颜色</span>';

    const skill = vm.skill
      ? `<div class="cdp-skill">
          <div class="cdp-section-title">技能</div>
          <div class="cdp-skill-head">
            <span class="cdp-skill-name">${esc(vm.skill.name)}</span>
            <span class="cdp-skill-cost">法力 ${vm.skill.manaCost}</span>
          </div>
          <div class="cdp-skill-desc">${renderSpell(esc(vm.skill.description), vm.magic, { interactive: false }).html}</div>
        </div>`
      : `<div class="cdp-skill">
          <div class="cdp-section-title">技能</div>
          <div class="cdp-empty">暂无技能数据</div>
        </div>`;

    // B-10：当前状态区。列出徽记图标 + 中文名 + 剩余回合/每回合数值 + 机制一句话
    // （机制文案与卡面徽记浮层同源 STATUS_DESCRIPTIONS，不另起一套）。
    const statuses = vm.statuses.length
      ? `<div class="cdp-statuses">${vm.statuses
          .map((s) => {
            const live: string[] = [];
            if (s.magnitude !== undefined) live.push(`每回合 ${s.magnitude} 点`);
            if (s.turns > 0) live.push(`剩余 ${s.turns} 回合`);
            const desc = STATUS_DESCRIPTIONS[s.label] ?? '效果未知。';
            return `<div class="cdp-status" style="--sc:${s.color}">
              <span class="cdp-status-ic">${statusBadgeIcon(s.id)}</span>
              <span class="cdp-status-body">
                <span class="cdp-status-name">${esc(s.label)}${live.length ? `<i>${esc(live.join(' · '))}</i>` : ''}</span>
                <span class="cdp-status-desc">${esc(desc)}</span>
              </span>
            </div>`;
          })
          .join('')}</div>`
      : '<div class="cdp-empty">当前没有任何状态</div>';

    const traits = vm.traits.length
      ? `<div class="cdp-traits">${vm.traits
          .map(
            (t) =>
              `<div class="cdp-trait${t.implemented ? '' : ' cdp-trait-off'}"><div class="cdp-trait-name">${esc(
                t.name,
              )}${t.implemented ? '' : '<span class="cdp-trait-tag">本场不生效</span>'}</div><div class="cdp-trait-desc">${esc(
                t.description,
              )}</div></div>`,
          )
          .join('')}</div>`
      : '<div class="cdp-empty">无特质</div>';

    return `
      <div class="cdp-close" role="button" aria-label="关闭">✕</div>
      <h2 class="cdp-name">${esc(vm.name)}</h2>
      <div class="cdp-colors">${colors}</div>
      <div class="cdp-stats">
        <div class="cdp-stat"><span class="k">生命</span><span class="v">${vm.hp}/${vm.maxHp}</span></div>
        <div class="cdp-stat"><span class="k">护甲</span><span class="v">${vm.armor}</span></div>
        <div class="cdp-stat"><span class="k">攻击</span><span class="v">${vm.attack}</span></div>
        <div class="cdp-stat"><span class="k">魔力</span><span class="v">${vm.magic}</span></div>
        <div class="cdp-stat"><span class="k">法力</span><span class="v">${vm.mana}/${vm.manaCost}</span></div>
      </div>
      <div class="cdp-section-title">当前状态</div>
      ${statuses}
      ${skill}
      <div class="cdp-section-title">特质</div>
      ${traits}
    `;
  }
}
