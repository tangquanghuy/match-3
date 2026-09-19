/**
 * fnv1a32（与 session/battleResult.digestString、systems/tribute 同算法的共享版）。
 * meta 域的确定性哈希锚点：活动主题（周种子）、入侵对手池（周+联赛）都由它派生。
 */
export function fnv1a32(input: string): number {
  let hash = 0x811c9dc7;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}
