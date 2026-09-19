/**
 * 特质被动系统（战斗技能系统 · 需求 10.1, 10.4, 10.5）。
 *
 * 特质经「钩子」在回合循环的固定时机生效，核心循环不内联具体特质内容（需求 10.5）：
 *   - onBattleStart：战斗开始
 *   - onTurnStart：回合开始（如 regeneration 再生）
 *   - onIncomingDamage：受击伤害修正（如 armored/stoneskin/spellarmor 减伤）
 *   - onHit：受击后触发（如 frenzy 狂暴加攻击）
 *   - onDefeat：阵亡时
 *
 * 覆盖统计到的最高频防御/回复特质。纯逻辑：无 pixi/gsap/dom 依赖。
 */
import type { Character } from '../types';
import type { GameEvent, BuffEvent } from '../events';

/** 伤害来源类型：骷髅普攻 / 技能法术 / 状态持续伤害等 */
export type DamageSource = 'skull' | 'spell' | 'status' | 'true';

/** 受击伤害修正上下文 */
export interface IncomingDamageContext {
  target: Character;
  source: DamageSource;
  /** 修正前的伤害 */
  amount: number;
}

/** 特质钩子（全部可选，注册表按 code 查表调用） */
export interface TraitHook {
  code: string;
  /** 回合开始（对己方每个存活角色）；产出事件（如治疗 buff） */
  onTurnStart?(char: Character): GameEvent[];
  /**
   * 受击伤害修正：返回修正后的伤害（用于减伤类特质）。
   * 多个特质叠加时按注册顺序依次修正。
   */
  onIncomingDamage?(ctx: IncomingDamageContext): number;
  /** 受击之后触发（如 frenzy 加攻击）；产出事件 */
  onHit?(char: Character): GameEvent[];
}

// —— 高频特质实现 ——

/** 全副武装：降低来自骷髅头的伤害 25%（向下取整） */
const armored: TraitHook = {
  code: 'armored',
  onIncomingDamage: (ctx) =>
    ctx.source === 'skull' ? Math.floor(ctx.amount * 0.75) : ctx.amount,
};

/** 铁壁铜墙：降低来自骷髅头的伤害 50%（向下取整） */
const stoneskin: TraitHook = {
  code: 'stoneskin',
  onIncomingDamage: (ctx) =>
    ctx.source === 'skull' ? Math.floor(ctx.amount * 0.5) : ctx.amount,
};

/** 法术铠甲：降低来自法术的伤害 25%（向下取整） */
const spellarmor: TraitHook = {
  code: 'spellarmor',
  onIncomingDamage: (ctx) =>
    ctx.source === 'spell' ? Math.floor(ctx.amount * 0.75) : ctx.amount,
};

/** 狂暴：受到攻击时获得 1 点攻击力 */
const frenzy: TraitHook = {
  code: 'frenzy',
  onHit: (char) => {
    char.attack += 1;
    const ev: BuffEvent = { type: 'buff', source: 'trait', targetId: char.id, stat: 'attack', amount: 1 };
    return [ev];
  },
};

/** 再生：每回合开始恢复 1 点生命值（不超过 maxHp） */
const regeneration: TraitHook = {
  code: 'regeneration',
  onTurnStart: (char) => {
    if (char.hp >= char.maxHp) return [];
    char.hp = Math.min(char.maxHp, char.hp + 1);
    const ev: BuffEvent = { type: 'buff', source: 'trait', targetId: char.id, stat: 'hp', amount: 1 };
    return [ev];
  },
};

/** 内置高频特质注册表（code → 钩子） */
export const BUILTIN_TRAITS: ReadonlyMap<string, TraitHook> = new Map(
  [armored, stoneskin, spellarmor, frenzy, regeneration].map((t) => [t.code, t]),
);

/**
 * 特质注册表：可注册内置与自定义特质，供回合循环/伤害结算查询（需求 10.5）。
 */
export class TraitRegistry {
  private hooks = new Map<string, TraitHook>();

  constructor(includeBuiltins = true) {
    if (includeBuiltins) {
      for (const [code, hook] of BUILTIN_TRAITS) this.hooks.set(code, hook);
    }
  }

  register(hook: TraitHook): void {
    this.hooks.set(hook.code, hook);
  }

  get(code: string): TraitHook | undefined {
    return this.hooks.get(code);
  }

  /**
   * 应用角色所有特质的受击伤害修正（按 traitCodes 顺序叠加，需求 10.1）。
   * @param traitCodes 该角色拥有的特质 code 列表（来自 TroopData.traits）
   */
  reduceIncomingDamage(
    traitCodes: readonly string[],
    target: Character,
    source: DamageSource,
    amount: number,
  ): number {
    let result = amount;
    for (const code of traitCodes) {
      const hook = this.hooks.get(code);
      if (hook?.onIncomingDamage) {
        result = hook.onIncomingDamage({ target, source, amount: result });
      }
    }
    return Math.max(0, result);
  }

  /** 触发角色回合开始特质，聚合事件（需求 10.1） */
  fireTurnStart(traitCodes: readonly string[], char: Character): GameEvent[] {
    const events: GameEvent[] = [];
    for (const code of traitCodes) {
      const hook = this.hooks.get(code);
      if (hook?.onTurnStart) events.push(...hook.onTurnStart(char));
    }
    return events;
  }

  /** 触发角色受击后特质，聚合事件（需求 10.1） */
  fireOnHit(traitCodes: readonly string[], char: Character): GameEvent[] {
    const events: GameEvent[] = [];
    for (const code of traitCodes) {
      const hook = this.hooks.get(code);
      if (hook?.onHit) events.push(...hook.onHit(char));
    }
    return events;
  }
}
