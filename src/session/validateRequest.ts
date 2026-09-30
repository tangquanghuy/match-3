/**
 * BattleRequest 校验（需求 2.4、2.6；设计 §4）。
 *
 * 原则是「开战前失败」：宁可拒绝整份 request 并说清哪一条不合法，
 * 也不要带着不存在的技能进场、在战斗中静默扣法力却没有效果。
 */
import { ALL_BASE_COLORS } from '@engine/types';
import { MAX_ACTIVE_TEAM_SIZE } from '@engine/teamRoster';
import { normalizeTier } from './assigner';
import { RULE_COLORED_GEM_KINDS, RULE_GEM_KINDS } from '@engine/battleRules';
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

  // kingdomId optional (P-E-faction-kingdom): raw native KingdomId, integer when given
  if (c.kingdomId !== undefined && !Number.isInteger(c.kingdomId)) {
    issues.push({ path: `${path}.kingdomId`, code: 'bad-type', message: '必须是整数' });
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

  if (raw.rules !== undefined) validateRules(issues, raw.rules, raw.playerTeam, raw.enemyTeam);

  if (issues.length > 0) return { ok: false, issues };
  return { ok: true, request: raw as unknown as BattleRequest };
}

function externalIdsOf(team: unknown): Set<string> {
  const out = new Set<string>();
  if (!Array.isArray(team)) return out;
  for (const s of team) if (isPlainObject(s) && typeof s.externalId === 'string') out.add(s.externalId);
  return out;
}

const isNum = (v: unknown, min: number, max: number): boolean =>
  typeof v === 'number' && Number.isFinite(v) && v >= min && v <= max;
const isInt = (v: unknown, min: number, max: number): boolean => isFiniteInteger(v) && (v as number) >= min && (v as number) <= max;

function validateRuleGem(issues: ValidationIssue[], path: string, gem: unknown): void {
  if (!isPlainObject(gem) || typeof gem.kind !== 'string' || !RULE_GEM_KINDS.has(gem.kind)) {
    issues.push({ path, code: 'bad-type', message: '未知的特殊宝石 kind' });
    return;
  }
  if (gem.tier !== undefined && !isInt(gem.tier, 1, 8)) issues.push({ path: `${path}.tier`, code: 'stat-range', message: 'tier 须为 1~8 的整数' });
  if (gem.color !== undefined && (typeof gem.color !== 'string' || !VALID_COLORS.has(gem.color))) {
    issues.push({ path: `${path}.color`, code: 'bad-type', message: 'color 须为基色' });
  }
  if (RULE_COLORED_GEM_KINDS.has(gem.kind) && gem.color === undefined) {
    issues.push({ path: `${path}.color`, code: 'missing-field', message: '六色族宝石必须指定 color' });
  }
}

/** 战斗规则校验（活动深化批）：结构、数值范围、目标 id 归属 */
function validateRules(issues: ValidationIssue[], rules: unknown, playerTeam: unknown, enemyTeam: unknown): void {
  if (!isPlainObject(rules)) { issues.push({ path: 'rules', code: 'bad-type', message: 'rules 必须是对象' }); return; }
  const players = externalIdsOf(playerTeam);
  const enemies = externalIdsOf(enemyTeam);
  const board = rules.board;
  if (board !== undefined) {
    if (!isPlainObject(board)) issues.push({ path: 'rules.board', code: 'bad-type', message: 'board 必须是对象' });
    else {
      if (board.skullChance !== undefined && !isNum(board.skullChance, 0, 0.5)) issues.push({ path: 'rules.board.skullChance', code: 'stat-range', message: '须为 0~0.5' });
      if (board.colorWeights !== undefined) {
        if (!isPlainObject(board.colorWeights)) issues.push({ path: 'rules.board.colorWeights', code: 'bad-type', message: '须为对象' });
        else for (const [c, w] of Object.entries(board.colorWeights)) {
          if (!VALID_COLORS.has(c) || !isNum(w, 0, 5)) issues.push({ path: `rules.board.colorWeights.${c}`, code: 'stat-range', message: '基色权重须为 0~5' });
        }
      }
      const drops = board.specialDrops;
      if (drops !== undefined) {
        if (!isPlainObject(drops) || !isNum(drops.chance, 0, 0.25) || !Array.isArray(drops.pool) || drops.pool.length === 0) {
          issues.push({ path: 'rules.board.specialDrops', code: 'bad-type', message: 'specialDrops 需 chance 0~0.25 与非空 pool' });
        } else drops.pool.forEach((p, i) => {
          if (!isPlainObject(p) || !isNum(p.weight, 0, 100)) issues.push({ path: `rules.board.specialDrops.pool.${i}`, code: 'stat-range', message: 'weight 须为 0~100' });
          else validateRuleGem(issues, `rules.board.specialDrops.pool.${i}.gem`, p.gem);
        });
      }
      if (board.preset !== undefined) {
        if (!Array.isArray(board.preset)) issues.push({ path: 'rules.board.preset', code: 'bad-type', message: 'preset 须为数组' });
        else {
          let total = 0;
          board.preset.forEach((p, i) => {
            if (!isPlainObject(p) || !isInt(p.count, 1, 12)) { issues.push({ path: `rules.board.preset.${i}`, code: 'stat-range', message: 'count 须为 1~12' }); return; }
            total += p.count as number;
            validateRuleGem(issues, `rules.board.preset.${i}.gem`, p.gem);
            if (p.onColor !== undefined && (typeof p.onColor !== 'string' || !VALID_COLORS.has(p.onColor))) issues.push({ path: `rules.board.preset.${i}.onColor`, code: 'bad-type', message: 'onColor 须为基色' });
          });
          if (total > 16) issues.push({ path: 'rules.board.preset', code: 'stat-range', message: '预置宝石合计不超过 16 颗' });
        }
      }
    }
  }
  const limit = rules.turnLimit;
  if (limit !== undefined && (!isPlainObject(limit) || !isInt(limit.turns, 1, 40) || (limit.onExpire !== 'playerWins' && limit.onExpire !== 'enemyWins'))) {
    issues.push({ path: 'rules.turnLimit', code: 'bad-type', message: 'turnLimit 需 turns 1~40 与 onExpire playerWins|enemyWins' });
  }
  const objective = rules.objective;
  if (objective !== undefined) {
    if (!isPlainObject(objective) || !Array.isArray(objective.killTargets) || objective.killTargets.length === 0
      || objective.killTargets.some((id) => typeof id !== 'string' || !enemies.has(id))) {
      issues.push({ path: 'rules.objective.killTargets', code: 'bad-type', message: 'killTargets 须为非空的敌方 externalId 列表' });
    }
  }
  if (rules.turnStart !== undefined) {
    if (!Array.isArray(rules.turnStart)) { issues.push({ path: 'rules.turnStart', code: 'bad-type', message: 'turnStart 须为数组' }); return; }
    rules.turnStart.forEach((t, i) => {
      const path = `rules.turnStart.${i}`;
      if (!isPlainObject(t) || (t.side !== 'player' && t.side !== 'enemy')) { issues.push({ path, code: 'bad-type', message: 'side 须为 player|enemy' }); return; }
      if (t.every !== undefined && !isInt(t.every, 1, 10)) issues.push({ path: `${path}.every`, code: 'stat-range', message: 'every 须为 1~10' });
      const own = t.side === 'player' ? players : enemies;
      if (t.mana !== undefined) {
        const m = t.mana;
        if (!isPlainObject(m) || !isInt(m.amount, -30, 30)) issues.push({ path: `${path}.mana`, code: 'stat-range', message: 'mana.amount 须为 -30~30 的整数' });
        else {
          if (m.targets !== undefined && (!Array.isArray(m.targets) || m.targets.some((id) => typeof id !== 'string' || !own.has(id)))) {
            issues.push({ path: `${path}.mana.targets`, code: 'bad-type', message: 'targets 须为本方 externalId' });
          }
          if (m.colors !== undefined && (!Array.isArray(m.colors) || m.colors.some((c) => typeof c !== 'string' || !VALID_COLORS.has(c)))) {
            issues.push({ path: `${path}.mana.colors`, code: 'bad-type', message: 'colors 须为基色列表' });
          }
        }
      }
      if (t.createGems !== undefined) {
        if (!Array.isArray(t.createGems)) issues.push({ path: `${path}.createGems`, code: 'bad-type', message: '须为数组' });
        else t.createGems.forEach((g, j) => {
          if (!isPlainObject(g) || !isInt(g.count, 1, 6) || (g.chance !== undefined && !isNum(g.chance, 0, 1))) {
            issues.push({ path: `${path}.createGems.${j}`, code: 'stat-range', message: 'count 1~6，chance 0~1' });
          } else validateRuleGem(issues, `${path}.createGems.${j}.gem`, g.gem);
        });
      }
    });
  }
}

/** 把校验问题拼成单行可读文本，供错误 UI 与日志使用。 */
export function formatValidationIssues(issues: readonly ValidationIssue[]): string {
  return issues.map((i) => `${i.path || '<root>'}: ${i.message}`).join('; ');
}
