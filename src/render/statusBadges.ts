/**
 * 状态图标映射（技能编写与演出 · 需求 6.5, 6.6）。
 *
 * 把状态 id 映射为一个可区分的 SVG 图标 + 主题色 + 中文名，供角色卡状态栏渲染。
 * 纯 SVG/代码绘制，零美术素材依赖（需求 6.6）。
 */

export interface StatusBadgeSpec {
  /** 中文名（tooltip/无障碍） */
  label: string;
  /** 主题色（图标描边/填充与外发光） */
  color: string;
  /** 24x24 viewBox 内的 SVG 内容（不含外层 svg 标签） */
  svg: string;
}

/** 已知状态的图标规格 */
const BADGES: Record<string, StatusBadgeSpec> = {
  // 中毒：绿色毒滴
  poison: {
    label: '中毒',
    color: '#57c06b',
    svg: '<path d="M12 3c3 4 5 6.5 5 9.5A5 5 0 0 1 7 12.5C7 9.5 9 7 12 3z" fill="#57c06b" stroke="#1e5a2c" stroke-width="1.2"/>',
  },
  // 燃烧：橙色火苗
  burning: {
    label: '燃烧',
    color: '#ff8a3d',
    svg: '<path d="M12 3c1.5 3-1.5 4-1.5 6.5A2 2 0 0 0 14 10c0-1.2-.5-2 .3-3.2 1.8 1.4 3.2 3.7 3.2 6.2a5.5 5.5 0 1 1-11 0C6.5 8.5 9.5 6 12 3z" fill="#ff8a3d" stroke="#a83c10" stroke-width="1.1"/>',
  },
  // 沉默：紫色禁言（嘴上叉）
  silence: {
    label: '沉默',
    color: '#a074d4',
    svg: '<circle cx="12" cy="12" r="8.5" fill="#2a1e3d" stroke="#a074d4" stroke-width="1.4"/><path d="M8 10h8M9 14h6" stroke="#c9a8ee" stroke-width="1.4" stroke-linecap="round"/><path d="M6 6l12 12" stroke="#e06bd0" stroke-width="1.6" stroke-linecap="round"/>',
  },
  // 冰冻：蓝色冰晶
  frozen: {
    label: '冰冻',
    color: '#5eb5ff',
    svg: '<path d="M12 3v18M4.5 7.5l15 9M19.5 7.5l-15 9" stroke="#5eb5ff" stroke-width="1.6" stroke-linecap="round"/><path d="M12 3l-2 2m2-2l2 2M12 21l-2-2m2 2l2-2" stroke="#bfe4ff" stroke-width="1.2" stroke-linecap="round"/>',
  },
  // 击晕：黄色星旋
  stun: {
    label: '击晕',
    color: '#e8c24a',
    svg: '<path d="M12 3l2.2 4.6 5 .7-3.6 3.5.9 5-4.5-2.4L7.5 16.8l.9-5L4.8 8.3l5-.7z" fill="#e8c24a" stroke="#8a6b12" stroke-width="1"/>',
  },
  // 缠绕：绿色藤蔓缠绕
  entangle: {
    label: '缠绕',
    color: '#5bbf57',
    svg: '<path d="M8 3c-3 3-3 6 0 9s3 6 0 9M16 3c3 3 3 6 0 9s-3 6 0 9" fill="none" stroke="#5bbf57" stroke-width="1.7" stroke-linecap="round"/><path d="M8 7.5c2 .5 6 .5 8 0M8 16.5c2-.5 6-.5 8 0" stroke="#8fe08a" stroke-width="1.2" stroke-linecap="round"/>',
  },
  // 织网：紫色蛛网（魔力归零，GoW Web；与缠绕的绿藤蔓区分）
  web: {
    label: '织网',
    color: '#b07ae0',
    svg: '<circle cx="12" cy="12" r="8.5" fill="none" stroke="#b07ae0" stroke-width="1.3"/><circle cx="12" cy="12" r="5.2" fill="none" stroke="#b07ae0" stroke-width="1.1"/><circle cx="12" cy="12" r="2" fill="none" stroke="#b07ae0" stroke-width="1"/><path d="M12 3.5v17M3.5 12h17M6 6l12 12M18 6L6 18" stroke="#d0b0ee" stroke-width="0.9"/>',
  },
  // 屏障：青色护盾（一次性挡下整发伤害）
  barrier: {
    label: '屏障',
    color: '#66d9e8',
    svg: '<path d="M12 3l7 2.5v6c0 4-3 7.2-7 9.5-4-2.3-7-5.5-7-9.5v-6z" fill="#123b45" stroke="#66d9e8" stroke-width="1.5"/><path d="M8.5 12.2l2.6 2.6 4.4-5" fill="none" stroke="#a8f0f7" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/>',
  },
  // 出血：深红血滴（DoT，且期间治疗无效）
  bleed: {
    label: '出血',
    color: '#e0435a',
    svg: '<path d="M12 3c3 4.6 5 7.2 5 10a5 5 0 0 1-10 0c0-2.8 2-5.4 5-10z" fill="#e0435a" stroke="#7d1220" stroke-width="1.2"/><path d="M10.2 13.5c0 1.7 1 2.8 2.4 3.1" fill="none" stroke="#ffd0d6" stroke-width="1.2" stroke-linecap="round"/>',
  },
  // 疾病：暗黄病菌（治疗减半）
  disease: {
    label: '疾病',
    color: '#b5c24a',
    svg: '<circle cx="12" cy="12" r="5.5" fill="#3a3d18" stroke="#b5c24a" stroke-width="1.4"/><path d="M12 3.2v3M12 17.8v3M3.2 12h3M17.8 12h3M6 6l2.1 2.1M15.9 15.9L18 18M18 6l-2.1 2.1M8.1 15.9L6 18" stroke="#b5c24a" stroke-width="1.3" stroke-linecap="round"/><circle cx="10.4" cy="11" r="1.1" fill="#dbe88a"/><circle cx="13.6" cy="13.4" r="1.1" fill="#dbe88a"/>',
  },
  // 猎人标记：红色准星（纯标记，让屠戮类特质倍率生效）
  marked: {
    label: '猎人标记',
    color: '#ff6b4a',
    svg: '<circle cx="12" cy="12" r="7" fill="none" stroke="#ff6b4a" stroke-width="1.6"/><path d="M12 2.5v4M12 17.5v4M2.5 12h4M17.5 12h4" stroke="#ff6b4a" stroke-width="1.5" stroke-linecap="round"/><circle cx="12" cy="12" r="2.1" fill="#ff6b4a"/>',
  },
  // 下潮：水面下沉（不可被技能指定）
  submerged: {
    label: '下潮',
    color: '#4aa8d8',
    svg: '<path d="M3 9c2-1.6 3.6-1.6 5.6 0s3.8 1.6 5.8 0 3.6-1.6 5.6 0" fill="none" stroke="#4aa8d8" stroke-width="1.7" stroke-linecap="round"/><path d="M3 14c2-1.6 3.6-1.6 5.6 0s3.8 1.6 5.8 0 3.6-1.6 5.6 0" fill="none" stroke="#9fd8ef" stroke-width="1.4" stroke-linecap="round"/><path d="M12 17.5v3.5M10 19.5l2 2 2-2" fill="none" stroke="#4aa8d8" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/>',
  },
  // 诅咒：暗紫骷髅
  curse: {
    label: '诅咒',
    color: '#9a6bd4',
    svg: '<path d="M12 3a7 7 0 0 0-7 7c0 2.5 1.3 4 3 5v3h8v-3c1.7-1 3-2.5 3-5a7 7 0 0 0-7-7z" fill="#2a1e3d" stroke="#9a6bd4" stroke-width="1.3"/><circle cx="9.3" cy="10.5" r="1.6" fill="#c9a8ee"/><circle cx="14.7" cy="10.5" r="1.6" fill="#c9a8ee"/>',
  },
  // 死亡标记：红色裂纹准星，状态本身不造成伤害，由倍率钩子消费
  death_mark: {
    label: '死亡标记',
    color: '#ff4f62',
    svg: '<circle cx="12" cy="12" r="7.2" fill="#3b1420" stroke="#ff4f62" stroke-width="1.4"/><path d="M12 2.7v4M12 17.3v4M2.7 12h4M17.3 12h4" stroke="#ff8b91" stroke-width="1.5" stroke-linecap="round"/><path d="M8 8l8 8M16 8l-8 8" stroke="#ff4f62" stroke-width="1.2" stroke-linecap="round"/>',
  },
  deathmark: {
    label: '死亡标记',
    color: '#ff4f62',
    svg: '<circle cx="12" cy="12" r="7.2" fill="#3b1420" stroke="#ff4f62" stroke-width="1.4"/><path d="M12 2.7v4M12 17.3v4M2.7 12h4M17.3 12h4" stroke="#ff8b91" stroke-width="1.5" stroke-linecap="round"/><path d="M8 8l8 8M16 8l-8 8" stroke="#ff4f62" stroke-width="1.2" stroke-linecap="round"/>',
  },
  // 狼化：冷白獠牙轮廓
  wolf: {
    label: '狼化',
    color: '#b9d8f5',
    svg: '<path d="M5 5.5l3.8 2.2A7.4 7.4 0 0 1 12 7a7.4 7.4 0 0 1 3.2.7L19 5.5l-.9 5.3a7.2 7.2 0 0 1 .9 3.5c0 3.6-3.1 6.2-7 6.2s-7-2.6-7-6.2a7.2 7.2 0 0 1 .9-3.5z" fill="#25364a" stroke="#b9d8f5" stroke-width="1.2"/><circle cx="9.3" cy="12" r="1" fill="#e9f5ff"/><circle cx="14.7" cy="12" r="1" fill="#e9f5ff"/><path d="M9 15.2c1.8 1.2 4.2 1.2 6 0" fill="none" stroke="#b9d8f5" stroke-width="1.1" stroke-linecap="round"/>',
  },
  wolf_form: {
    label: '狼化',
    color: '#b9d8f5',
    svg: '<path d="M5 5.5l3.8 2.2A7.4 7.4 0 0 1 12 7a7.4 7.4 0 0 1 3.2.7L19 5.5l-.9 5.3a7.2 7.2 0 0 1 .9 3.5c0 3.6-3.1 6.2-7 6.2s-7-2.6-7-6.2a7.2 7.2 0 0 1 .9-3.5z" fill="#25364a" stroke="#b9d8f5" stroke-width="1.2"/><circle cx="9.3" cy="12" r="1" fill="#e9f5ff"/><circle cx="14.7" cy="12" r="1" fill="#e9f5ff"/><path d="M9 15.2c1.8 1.2 4.2 1.2 6 0" fill="none" stroke="#b9d8f5" stroke-width="1.1" stroke-linecap="round"/>',
  },
  rage: {
    label: '狂怒',
    color: '#ff8d55',
    svg: '<path d="M12 2.8c2.2 3.7 4.8 5.4 4.8 9.2a4.8 4.8 0 1 1-9.6 0c0-2.2 1.1-4.2 3.2-6.2-.1 1.9.4 2.8 1.3 3.6.4-2.1.4-3.9.3-6.6z" fill="#7d241d" stroke="#ff8d55" stroke-width="1.2"/><path d="M12 11c1.5 1.5 1.8 2.4 1.8 3.3a1.8 1.8 0 1 1-3.6 0c0-.8.4-1.6 1.8-3.3z" fill="#ffd0a8"/>',
  },
  mana_burn: {
    label: '法力燃烧',
    color: '#718cff',
    svg: '<path d="M13.2 2.8L5.5 13h5.1l-.8 8.2L18.5 11h-5.2z" fill="#2a367f" stroke="#718cff" stroke-width="1.3" stroke-linejoin="round"/><path d="M12.2 6.5l-2.8 5.2h2.7" fill="none" stroke="#c2cbff" stroke-width="1.1" stroke-linecap="round"/>',
  },
  charm: {
    label: '魅惑',
    color: '#f08bd4',
    svg: '<path d="M12 20.5S4.5 16.3 4.5 10.2A3.7 3.7 0 0 1 12 8.6a3.7 3.7 0 0 1 7.5 1.6c0 6.1-7.5 10.3-7.5 10.3z" fill="#5c244f" stroke="#f08bd4" stroke-width="1.3"/><path d="M8.4 12.2h2M13.6 12.2h2M9.3 15c1.6 1 3.8 1 5.4 0" fill="none" stroke="#ffd3f2" stroke-width="1.1" stroke-linecap="round"/>',
  },
};

/** 兜底图标（未知状态）：灰色问号盾 */
const FALLBACK: StatusBadgeSpec = {
  label: '状态',
  color: '#9aa0a6',
  svg: '<circle cx="12" cy="12" r="8.5" fill="#26282b" stroke="#9aa0a6" stroke-width="1.3"/><text x="12" y="16" text-anchor="middle" font-size="11" fill="#cfd2d6">?</text>',
};

/** 取某状态的图标规格；未知状态返回兜底（需求 6.5）。
 *  别名归一：连字符/下划线互转（death-mark↔death_mark）；狼化族同物异名
 *  （wolf / wolf_form / wolf-form / lycanthropy 官方特质名）共用一枚。 */
export function statusBadge(statusId: string): StatusBadgeSpec {
  const normalized = statusId.toLowerCase().replace(/-/g, '_');
  const aliased = normalized === 'lycanthropy' ? 'wolf' : normalized;
  return BADGES[statusId] ?? BADGES[aliased] ?? FALLBACK;
}

/** 生成完整的内联 SVG 字符串（24x24），供直接插入 DOM */
export function statusBadgeSvg(statusId: string): string {
  const b = statusBadge(statusId);
  return `<svg viewBox="0 0 24 24" width="16" height="16" aria-label="${b.label}" role="img">${b.svg}</svg>`;
}
