/**
 * 已实现特质白名单（TRAIT_LIBRARY = traits.json 编译产物，与 App 校验同源）。
 * troops.json 引用 785 种 code、引擎实现其中 361 种：所有 meta 快照组装
 * （部队/主角）都过滤到本集合——引擎虽会安全忽略未知 code，但严格会话校验
 * 会拒绝，且过滤掉未实现 code 才不会放行「假特质」。
 */
import { TRAIT_LIBRARY } from '../../engine/traits';

export const KNOWN_TRAIT_CODES: ReadonlySet<string> = new Set(
  TRAIT_LIBRARY.map((t) => t.code),
);
