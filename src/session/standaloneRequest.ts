/**
 * 独立调试模式的默认 BattleRequest（需求 2.5）。
 *
 * 队伍不再写死在 `App` 里，而是读 `fixtures/standalone-battle.json`——那份 JSON 的结构
 * 就是宿主将来通过 postMessage 下发的 `BattleRequest`。因此换队伍只需改配置文件，
 * 接入宿主时也只是把「读文件」换成「读消息」，中间的校验与映射完全复用。
 */
import fixture from './fixtures/standalone-battle.json';
import { validateBattleRequest, formatValidationIssues } from './validateRequest';
import type { ValidateOptions } from './validateRequest';
import type { BattleRequest } from './contract';

/** 未加工的配置对象，仅供调试查看；正式路径请走 loadStandaloneRequest()。 */
export const STANDALONE_FIXTURE: unknown = fixture;

/**
 * 读取并校验独立模式配置。
 *
 * 配置文件同样要过一遍宿主 request 的校验：手写 JSON 更容易写错技能 id 或颜色，
 * 与其带着坏数据进场，不如在这里直接失败并指出字段。
 */
export function loadStandaloneRequest(opts: ValidateOptions): BattleRequest {
  // structuredClone：分拣引擎会就地填充 skillId/traitIds，克隆避免污染模块级 fixture，
  // 保证同一页面多次 init 的配置视图一致。
  const result = validateBattleRequest(structuredClone(fixture), opts);
  if (!result.ok) {
    throw new Error(
      `独立模式战斗配置不合法（src/session/fixtures/standalone-battle.json）：${formatValidationIssues(result.issues)}`,
    );
  }
  return result.request;
}

/** 兼容旧调用，不再根据调试人数裁剪战斗队伍。 */
export function resizeRequestTeams(request: BattleRequest, _legacySize?: number): BattleRequest {
  // Legacy callers remain compatible; a stored debug size must never drop the fourth unit.
  return request;
}
