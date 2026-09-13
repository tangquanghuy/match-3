/**
 * 魔法缩放规格与求值（战斗技能系统 · 需求 1）。
 *
 * 《Gems of War》技能描述用方括号标记数值缩放，绝大多数技能数值由「法术强度(magic)」驱动。
 * 本模块把这些文本标记解析为结构化、可序列化的数值公式 ScalingSpec，并提供纯函数求值。
 *
 * 纯逻辑：无任何 pixi/gsap/dom 依赖，可被引擎与数据构建脚本共用（需求 12.1）。
 *
 * 覆盖的标记格式（频次来自 src/data/troops.json 统计）：
 *   [魔法 + N]           1250   → base=N,  mult=1
 *   [魔法]                 19    → base=0,  mult=1
 *   [(魔法 x M) + N]              → base=N,  mult=M      （M 可为小数，如 1.5 / 2）
 *   [(魔法 x M)]                  → base=0,  mult=M
 *   [(魔法 / D) + N]              → base=N,  mult=1/D    （D 为整数，如 2 / 4）
 *   [(魔法 / D)]                  → base=0,  mult=1/D
 *   [xN]                  476    → 二级修饰: multiplier
 *   [N:M]                 362    → 二级修饰: ratio（每 N 个来源提供 M）
 *
 * 说明：
 * - 伤害区间 `[low] – [high]`（如「[(魔法/2)+4] – [魔法+8]」）会被解析为**两个**按序排列的
 *   ScalingSpec（低/高界）。区间的随机取值语义由后续「伤害原语」批次解释，本模块只忠实产出规格。
 * - 纯常数（如「造成 8 点伤害」中的 8）不含方括号、散落于自由文本，无法可靠从文本抽取；
 *   本模块通过 `constantScaling(n)` 提供常数规格的表示（需求 1.2），常数的来源判定交由上层。
 */

/** 数值公式：value = round(base + magic * mult)。纯常数则 mult=0。 */
export interface ScalingSpec {
  /** 常数项 N */
  base: number;
  /** 魔力系数：默认 1；[魔法 x M]→M；[魔法 / D]→1/D；纯常数→0 */
  mult: number;
}

/** 二级修饰：技能数值随战场资源数量二次缩放（本阶段仅解析保存，效果在后续批次实现） */
export interface SecondaryModifier {
  kind: 'multiplier' | 'ratio';
  /** multiplier: [xN]→a=N；ratio: [N:M]→a=N */
  a: number;
  /** ratio 专用：[N:M]→b=M（每 a 个来源提供 b） */
  b?: number;
}

/** 一条技能预解析出的结构化元数据（写入 troops.json，见需求 2） */
export interface SkillMetadata {
  /** 按出现顺序解析出的魔法缩放（伤害额/护甲额/数量… 各占一个） */
  scalings: ScalingSpec[];
  /** 二级修饰标记（至多一个；数据中未见一条技能含多个） */
  modifier?: SecondaryModifier;
  /** 原始描述文本，供详情面板与回退 */
  raw: string;
  /** 是否解析出任一结构化缩放（false → 运行时可回退为仅扣法力） */
  parsed: boolean;
}

/** 构造一个常数缩放规格（需求 1.2） */
export function constantScaling(n: number): ScalingSpec {
  return { base: n, mult: 0 };
}

/**
 * 按施法者魔力求值缩放规格（需求 1.3）。
 * 结果恒为非负整数：`max(0, round(base + magic * mult))`。
 */
export function evaluateScaling(spec: ScalingSpec, magic: number): number {
  return Math.max(0, Math.round(spec.base + magic * spec.mult));
}

/** 匹配所有方括号标记（惰性，允许内部空白） */
const BRACKET_RE = /\[([^\]]*)\]/g;
/** 魔力除数：魔法 / D */
const MAGIC_DIV_RE = /魔法\s*\/\s*(\d+(?:\.\d+)?)/;
/** 魔力乘数：魔法 x M（兼容 ASCII x/X 与全角 ×） */
const MAGIC_MUL_RE = /魔法\s*[xX×]\s*(\d+(?:\.\d+)?)/;
/** 常数加项：+ N */
const PLUS_N_RE = /\+\s*(\d+(?:\.\d+)?)/;
/** 二级倍率：xN（整个 token 即 xN，可带小数） */
const MULTIPLIER_TOKEN_RE = /^[xX×]\s*(\d+(?:\.\d+)?)$/;
/** 二级比率：N:M */
const RATIO_TOKEN_RE = /^(\d+)\s*:\s*(\d+)$/;

/** 解析单个方括号内部内容：返回缩放规格、二级修饰、或 null（无法识别） */
function classifyToken(
  inner: string,
): { scaling?: ScalingSpec; modifier?: SecondaryModifier } | null {
  const s = inner.trim();

  // 含「魔法」→ 魔法缩放规格
  if (s.includes('魔法')) {
    let mult = 1;
    const div = MAGIC_DIV_RE.exec(s);
    const mul = MAGIC_MUL_RE.exec(s);
    if (div) {
      const d = Number(div[1]);
      mult = d !== 0 ? 1 / d : 0;
    } else if (mul) {
      mult = Number(mul[1]);
    }
    const plus = PLUS_N_RE.exec(s);
    const base = plus ? Number(plus[1]) : 0;
    return { scaling: { base, mult } };
  }

  // 二级倍率 [xN]
  const m = MULTIPLIER_TOKEN_RE.exec(s);
  if (m) return { modifier: { kind: 'multiplier', a: Number(m[1]) } };

  // 二级比率 [N:M]
  const r = RATIO_TOKEN_RE.exec(s);
  if (r) return { modifier: { kind: 'ratio', a: Number(r[1]), b: Number(r[2]) } };

  return null;
}

/**
 * 从技能描述文本解析出全部魔法缩放规格与二级修饰（需求 1.1, 1.4, 1.5, 1.6）。
 * 纯函数：相同输入产出完全相同结果。
 *
 * @returns scalings 按出现顺序；modifier 取首个识别到的二级修饰（数据中每条至多一个）。
 */
export function parseScalings(desc: string): {
  scalings: ScalingSpec[];
  modifier?: SecondaryModifier;
} {
  const scalings: ScalingSpec[] = [];
  let modifier: SecondaryModifier | undefined;

  // 每次调用重置正则的 lastIndex（BRACKET_RE 带 g 标志，有状态）
  BRACKET_RE.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = BRACKET_RE.exec(desc)) !== null) {
    const classified = classifyToken(match[1]);
    if (!classified) continue;
    if (classified.scaling) scalings.push(classified.scaling);
    if (classified.modifier && modifier === undefined) modifier = classified.modifier;
  }

  return modifier !== undefined ? { scalings, modifier } : { scalings };
}

/**
 * 从描述构建完整技能元数据（需求 2.1 的核心逻辑，供构建脚本与运行时共用）。
 * parsed = 至少解析出一个魔法缩放或一个二级修饰。
 */
export function buildSkillMetadata(desc: string): SkillMetadata {
  const { scalings, modifier } = parseScalings(desc);
  const parsed = scalings.length > 0 || modifier !== undefined;
  const meta: SkillMetadata = { scalings, raw: desc, parsed };
  if (modifier !== undefined) meta.modifier = modifier;
  return meta;
}
