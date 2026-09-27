/**
 * BattleRequest 校验（需求 2.4、2.6；设计 §4）。
 *
 * 原则是「开战前失败」：宁可拒绝整份 request 并说清哪一条不合法，
 * 也不要带着不存在的技能进场、在战斗中静默扣法力却没有效果。
 */
import { ALL_BASE_COLORS } from '@engine/types';
import { MAX_ACTIVE_TEAM_SIZE } from '@engine/teamRoster';
import { normalizeTier } from './assigner';
import { BATTLE_SCHEMA_VERSION, RULESET_VERSION } from './contract';
import type { BattleRequest, CombatantSnapshot } from './contract';

/** 数值上限：防止宿主传入越界或畸形数值把战斗拖成不可结束的状态。 */
export const STAT_LIMITS = {
  hp: { min: 1, max: 9999 },
  attack: { min: 0, max: 999 },
  armor: { min: 0, max: 999 },
  magic: { min: 0, max: 999 },
  manaCost: { min: 1, max: 100 },
} as const;

/** 队伍人数：至少 1 人，上限与引擎在场编队上限一致。 */
export const TEAM_SIZE_LIMITS = { min: 1, max: MAX_ACTIVE_TEAM_SIZE } as const;

export type ValidationCode =
  | 'schema-version'
  | 'ruleset-version'
  | 'missing-field'
  | 'bad-type'
  | 'team-size'
  | 'duplicate-external-id'
  | 'stat-range'
  | 'mana-colors'
  | 'unknown-skill'
  | 'unknown-trait'
  | 'unknown-troop-type'
  | 'unknown-tier';

export interface ValidationIssue {
  /** 出问题的字段路径，如 `playerTeam[1].stats.hp` */
  path: string;
  code: ValidationCode;
  message: string;
}

export interface ValidateOptions {
  /** 客户端已注册的技能 id（`registry.skills` ∪ `registry.prototypes`） */
  knownSkillIds: ReadonlySet<string>;
  /** 客户端已注册的特质 id。特质系统上线前传空集合，任何 traitIds 都会被拒绝 */
  knownTraitIds?: ReadonlySet<string>;
  /**
   * 客户端认识的种族/类型。与技能、特质同口径：不在集合内的直接拒绝，
   * 省略该选项时任何非空 `troopTypes` 都会被拒绝，避免拼错族名后静默不吃光环。
   */
  knownTroopTypes?: ReadonlySet<string>;
}

export type ValidateResult =
  | { ok: true; request: BattleRequest }
  | { ok: false; issues: ValidationIssue[] };

const VALID_COLORS = new Set<string>(ALL_BASE_COLORS);

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim() !== '';
}

/** 只接受有限整数：NaN / Infinity / 小数都会让结算和复现失去确定性。 */
function isFiniteInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value);
}

function checkStat(
  issues: ValidationIssue[],
  path: string,
  value: unknown,
  limit: { min: number; max: number },
): void {
  if (!isFiniteInteger(value)) {
    issues.push({ path, code: 'bad-type', message: '必须是整数' });
    return;
  }
  if (value < limit.min || value > limit.max) {
    issues.push({
      path,
      code: 'stat-range',
      message: `必须在 ${limit.min}～${limit.max} 之间，实际 ${value}`,
    });
  }
}

function validateCombatant(
  issues: ValidationIssue[],
  path: string,
  raw: unknown,
  opts: ValidateOptions,
  seenExternalIds: Set<string>,
): void {
  if (!isPlainObject(raw)) {
    issues.push({ path, code: 'bad-type', message: '必须是对象' });
    return;
  }
  const c = raw as Partial<CombatantSnapshot>;

  if (!isNonEmptyString(c.externalId)) {
    issues.push({ path: `${path}.externalId`, code: 'missing-field', message: '必须是非空字符串' });
  } else if (seenExternalIds.has(c.externalId)) {
    issues.push({
      path: `${path}.externalId`,
      code: 'duplicate-external-id',
      message: `externalId「${c.externalId}」在本场重复，结果无法回传映射`,
    });
  } else {
    seenExternalIds.add(c.externalId);
  }

  if (!isNonEmptyString(c.name)) {
    issues.push({ path: `${path}.name`, code: 'missing-field', message: '必须是非空字符串' });
  }

  if (!isPlainObject(c.stats)) {
    issues.push({ path: `${path}.stats`, code: 'missing-field', message: '必须是对象' });
  } else {
    checkStat(issues, `${path}.stats.hp`, c.stats.hp, STAT_LIMITS.hp);
    checkStat(issues, `${path}.stats.attack`, c.stats.attack, STAT_LIMITS.attack);
    checkStat(issues, `${path}.stats.armor`, c.stats.armor, STAT_LIMITS.armor);
    checkStat(issues, `${path}.stats.magic`, c.stats.magic, STAT_LIMITS.magic);
  }

  if (c.initialHp !== undefined) checkStat(issues, `${path}.initialHp`, c.initialHp, { min: 1, max: c.stats?.hp ?? 1 });
  if (c.eventRarity !== undefined) checkStat(issues, `${path}.eventRarity`, c.eventRarity, { min: 0, max: 5 });
  if (c.eventTarget !== undefined && c.eventTarget !== 'boss' && c.eventTarget !== 'tower') {
    issues.push({ path: `${path}.eventTarget`, code: 'bad-type', message: '活动目标应为boss或tower' });
  }
  checkStat(issues, `${path}.manaCost`, c.manaCost, STAT_LIMITS.manaCost);

  if (!Array.isArray(c.manaColors) || c.manaColors.length === 0) {
    issues.push({ path: `${path}.manaColors`, code: 'mana-colors', message: '至少需要一种法力颜色' });
  } else {
    const seenColors = new Set<string>();
    c.manaColors.forEach((color, i) => {
      if (!VALID_COLORS.has(color as string)) {
        issues.push({
          path: `${path}.manaColors[${i}]`,
          code: 'mana-colors',
          message: `未知颜色「${String(color)}」`,
        });
      } else if (seenColors.has(color as string)) {
        issues.push({
          path: `${path}.manaColors[${i}]`,
          code: 'mana-colors',
          message: `颜色「${String(color)}」重复`,
        });
      } else {
        seenColors.add(color as string);
      }
    });
  }

  // 阶级（AIRP 分拣）：可选；给了就必须可识别（中英文别名均收）。
  // skillId 与 tier 二选一：都没有就无法确定技能，属于硬错误。
  let tierProvided = false;
  if (c.tier !== undefined) {
    if (!isNonEmptyString(c.tier)) {
      issues.push({ path: `${path}.tier`, code: 'bad-type', message: '必须是非空字符串' });
    } else if (normalizeTier(c.tier) === null) {
      issues.push({
        path: `${path}.tier`,
        code: 'unknown-tier',
        message: `阶级「${c.tier}」不可识别，可用：杂兵/精英/首领/领主/传奇`,
      });
    } else {
      tierProvided = true;
    }
  }

  if (!isNonEmptyString(c.skillId)) {
    // 分拣引擎会在校验通过后按 tier 补齐 skillId，因此 tier 有效时允许省略
    if (!tierProvided) {
      issues.push({
        path: `${path}.skillId`,
        code: 'missing-field',
        message: '必须是非空字符串；省略时必须提供 tier（杂兵/精英/首领/领主/传奇）',
      });
    }
  } else if (!opts.knownSkillIds.has(c.skillId)) {
    // 需求 2.6：未注册技能必须开战前报错，不得进场后静默无效果
    issues.push({
      path: `${path}.skillId`,
      code: 'unknown-skill',
      message: `技能「${c.skillId}」未在客户端注册`,
    });
  }

  // troopTypes 可选；给了就必须是客户端认识的族名，否则族亲光环会静默不生效
  if (c.troopTypes !== undefined) {
    if (!Array.isArray(c.troopTypes)) {
      issues.push({ path: `${path}.troopTypes`, code: 'bad-type', message: '必须是数组' });
    } else {
      const known = opts.knownTroopTypes ?? new Set<string>();
      c.troopTypes.forEach((type, i) => {
        if (!isNonEmptyString(type) || !known.has(type)) {
          issues.push({
            path: `${path}.troopTypes[${i}]`,
            code: 'unknown-troop-type',
            message: `种族「${String(type)}」不是客户端认识的类型`,
          });
        }
      });
    }
  }

  // traitIds 可选：省略时若有 tier 由分拣引擎按阶级+种族编配；显式给了就逐个校验
  if (c.traitIds !== undefined) {
    if (!Array.isArray(c.traitIds)) {
      issues.push({ path: `${path}.traitIds`, code: 'bad-type', message: '必须是数组（可为空）' });
    } else {
      const known = opts.knownTraitIds ?? new Set<string>();
      c.traitIds.forEach((trait, i) => {
        if (!isNonEmptyString(trait) || !known.has(trait)) {
          issues.push({
            path: `${path}.traitIds[${i}]`,
            code: 'unknown-trait',
            message: `特质「${String(trait)}」未在客户端注册`,
          });
        }
      });
    }
  }
}

function validateTeam(
  issues: ValidationIssue[],
  path: string,
  raw: unknown,
  opts: ValidateOptions,
  seenExternalIds: Set<string>,
): void {
  if (!Array.isArray(raw)) {
    issues.push({ path, code: 'bad-type', message: '必须是数组' });
    return;
  }
  if (raw.length < TEAM_SIZE_LIMITS.min || raw.length > TEAM_SIZE_LIMITS.max) {
    issues.push({
      path,
      code: 'team-size',
      message: `人数必须在 ${TEAM_SIZE_LIMITS.min}～${TEAM_SIZE_LIMITS.max} 之间，实际 ${raw.length}`,
    });
  }
  raw.forEach((entry, i) => {
    validateCombatant(issues, `${path}[${i}]`, entry, opts, seenExternalIds);
  });
}

/**
 * 校验一份来自宿主的原始对象是否是可执行的 BattleRequest。
 * 返回全部问题而不是首个错误，宿主一次就能修完。
 */
export function validateBattleRequest(raw: unknown, opts: ValidateOptions): ValidateResult {
  const issues: ValidationIssue[] = [];

  if (!isPlainObject(raw)) {
    return { ok: false, issues: [{ path: '', code: 'bad-type', message: 'request 必须是对象' }] };
  }

  if (raw.schemaVersion !== BATTLE_SCHEMA_VERSION) {
    issues.push({
      path: 'schemaVersion',
      code: 'schema-version',
      message: `仅支持 schemaVersion ${BATTLE_SCHEMA_VERSION}，收到 ${String(raw.schemaVersion)}`,
    });
  }
  if (raw.rulesetVersion !== RULESET_VERSION) {
    issues.push({
      path: 'rulesetVersion',
      code: 'ruleset-version',
      message: `客户端规则版本为 ${RULESET_VERSION}，收到 ${String(raw.rulesetVersion)}`,
    });
  }
  for (const key of ['battleId', 'requestId'] as const) {
    if (!isNonEmptyString(raw[key])) {
      issues.push({ path: key, code: 'missing-field', message: '必须是非空字符串' });
    }
  }
  if (!isFiniteInteger(raw.seed)) {
    issues.push({ path: 'seed', code: 'bad-type', message: 'seed 必须是整数，否则无法复现' });
  }

  if (raw.arenaRules !== undefined && typeof raw.arenaRules !== 'boolean') {
    issues.push({ path: 'arenaRules', code: 'bad-type', message: 'arenaRules must be boolean' });
  }

  for (const key of ['playerBanner', 'enemyBanner'] as const) {
    const banner = raw[key];
    if (banner === undefined) continue;
    if (!isPlainObject(banner) || !isPlainObject(banner.boosts)) {
      issues.push({ path: key, code: 'bad-type', message: 'Banner requires a boosts object' });
      continue;
    }
    for (const [color, amount] of Object.entries(banner.boosts)) {
      if (!VALID_COLORS.has(color) || !isFiniteInteger(amount) || amount < -1 || amount > 2) {
        issues.push({ path: `${key}.boosts.${color}`, code: 'stat-range', message: 'Banner boost requires a base color and an integer from -1 to 2' });
      }
    }
  }

  // externalId 必须在双方之间也唯一，否则结果回传会撞号
  const seenExternalIds = new Set<string>();
  validateTeam(issues, 'playerTeam', raw.playerTeam, opts, seenExternalIds);
  validateTeam(issues, 'enemyTeam', raw.enemyTeam, opts, seenExternalIds);

  // kingdom 可选（武器原语批 K-E）：战斗发生王国；给了就必须是非空字符串或显式 null
  //（竞技场口径）。类型错误按坏数据拒绝——静默忽略会让「战斗发生在X王国」类条件失真。
  if (raw.kingdom !== undefined && raw.kingdom !== null && !isNonEmptyString(raw.kingdom)) {
    issues.push({ path: 'kingdom', code: 'bad-type', message: '必须是非空字符串或 null' });
  }

  if (issues.length > 0) return { ok: false, issues };
  return { ok: true, request: raw as unknown as BattleRequest };
}

/** 把校验问题拼成单行可读文本，供错误 UI 与日志使用。 */
export function formatValidationIssues(issues: readonly ValidationIssue[]): string {
  return issues.map((i) => `${i.path || '<root>'}: ${i.message}`).join('; ');
}
