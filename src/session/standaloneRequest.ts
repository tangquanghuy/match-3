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
  const result = validateBattleRequest(fixture, opts);
  if (!result.ok) {
    throw new Error(
      `独立模式战斗配置不合法（src/session/fixtures/standalone-battle.json）：${formatValidationIssues(result.issues)}`,
    );
  }
  return result.request;
}

/**
 * 按调试用队伍人数裁剪双方（3v3 / 4v4 开关）。
 *
 * 只裁不补：配置里人数不足时按实际人数走，不凭空造角色。宿主注入的 request 不应经过这里，
 * 人数由宿主决定。
 */
export function resizeRequestTeams(request: BattleRequest, size: number): BattleRequest {
  const take = Math.max(1, Math.floor(size));
  if (request.playerTeam.length <= take && request.enemyTeam.length <= take) return request;
  return {
    ...request,
    playerTeam: request.playerTeam.slice(0, take),
    enemyTeam: request.enemyTeam.slice(0, take),
  };
}
