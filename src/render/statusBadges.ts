/**
 * 角色状态徽记。
 *
 * 已知状态使用 128×128 透明美术素材，在角色卡中按 16×16 显示。
 * 图案保持单一强剪影，外框、底色和主题辉光仍由 TeamView 统一控制。
 */
import poisonIcon from '@assets/status-icons/poison.png';
import burningIcon from '@assets/status-icons/burning.png';
import silenceIcon from '@assets/status-icons/silence.png';
import frozenIcon from '@assets/status-icons/frozen.png';
import stunIcon from '@assets/status-icons/stun.png';
import entangleIcon from '@assets/status-icons/entangle.png';
import webIcon from '@assets/status-icons/web.png';
import barrierIcon from '@assets/status-icons/barrier.png';
import bleedIcon from '@assets/status-icons/bleed.png';
import diseaseIcon from '@assets/status-icons/disease.png';
import markedIcon from '@assets/status-icons/marked.png';
import submergedIcon from '@assets/status-icons/submerged.png';
import curseIcon from '@assets/status-icons/curse.png';
import deathMarkIcon from '@assets/status-icons/death-mark.png';
import wolfIcon from '@assets/status-icons/wolf.png';
import rageIcon from '@assets/status-icons/rage.png';
import manaBurnIcon from '@assets/status-icons/mana-burn.png';
import charmIcon from '@assets/status-icons/charm.png';
import faerieFireIcon from '@assets/status-icons/faerie-fire.png';
import terrorIcon from '@assets/status-icons/terror.png';
import blessedIcon from '@assets/status-icons/blessed.png';
import enchantedIcon from '@assets/status-icons/enchanted.png';
import reflectIcon from '@assets/status-icons/reflect.png';

export interface StatusBadgeSpec {
  /** 中文名（tooltip/无障碍） */
  label: string;
  /** 主题色（徽记边框与外发光） */
  color: string;
  /** 透明 PNG；未知状态为 null，改用问号兜底 */
  icon: string | null;
}

const BADGES: Record<string, StatusBadgeSpec> = {
  poison: { label: '中毒', color: '#78e95f', icon: poisonIcon },
  burning: { label: '燃烧', color: '#ff7a35', icon: burningIcon },
  silence: { label: '沉默', color: '#ad78dc', icon: silenceIcon },
  frozen: { label: '冰冻', color: '#72c9ff', icon: frozenIcon },
  stun: { label: '击晕', color: '#f2cc58', icon: stunIcon },
  entangle: { label: '缠绕', color: '#67c95d', icon: entangleIcon },
  web: { label: '织网', color: '#bd8aeb', icon: webIcon },
  barrier: { label: '屏障', color: '#69dce9', icon: barrierIcon },
  bleed: { label: '出血', color: '#ef4d62', icon: bleedIcon },
  disease: { label: '疾病', color: '#bdc957', icon: diseaseIcon },
  marked: { label: '猎人标记', color: '#ff7548', icon: markedIcon },
  submerged: { label: '下潮', color: '#50b8e7', icon: submergedIcon },
  curse: { label: '诅咒', color: '#a876e1', icon: curseIcon },
  cursed: { label: '诅咒', color: '#a876e1', icon: curseIcon },
  death_mark: { label: '死亡标记', color: '#ff5066', icon: deathMarkIcon },
  deathmark: { label: '死亡标记', color: '#ff5066', icon: deathMarkIcon },
  wolf: { label: '狼化', color: '#c5ddf4', icon: wolfIcon },
  wolf_form: { label: '狼化', color: '#c5ddf4', icon: wolfIcon },
  rage: { label: '狂怒', color: '#ff8a49', icon: rageIcon },
  enraged: { label: '激怒', color: '#ff8a49', icon: rageIcon },
  mana_burn: { label: '法力燃烧', color: '#7f96ff', icon: manaBurnIcon },
  charm: { label: '魅惑', color: '#f28fd5', icon: charmIcon },
  charmed: { label: '魅惑', color: '#f28fd5', icon: charmIcon },
  faerie_fire: { label: '精灵火', color: '#c993ff', icon: faerieFireIcon },
  terror: { label: '恐怖', color: '#bd82e9', icon: terrorIcon },
  blessed: { label: '赐福', color: '#ffd56a', icon: blessedIcon },
  enchanted: { label: '附魔', color: '#e08cff', icon: enchantedIcon },
  reflect: { label: '反射', color: '#9ecfff', icon: reflectIcon },
};

const FALLBACK: StatusBadgeSpec = {
  label: '状态',
  color: '#9aa0a6',
  icon: null,
};

/**
 * 取状态图标规格。连字符统一为下划线；狼化沿用项目中的多种历史命名。
 */
export function statusBadge(statusId: string): StatusBadgeSpec {
  const normalized = statusId.toLowerCase().replace(/-/g, '_');
  const aliased = normalized === 'lycanthropy' ? 'wolf' : normalized;
  return BADGES[statusId] ?? BADGES[aliased] ?? FALLBACK;
}

/** 生成状态图标 DOM 字符串，保留原有调用点的纯字符串渲染方式。 */
export function statusBadgeIcon(statusId: string): string {
  const badge = statusBadge(statusId);
  if (!badge.icon) {
    return `<span class="status-icon-fallback" role="img" aria-label="${badge.label}">?</span>`;
  }
  return `<img src="${badge.icon}" alt="${badge.label}" draggable="false">`;
}
