/**
 * 状态「中招」徽印素材表：规范键 → 图片 URL。
 * 素材由 scripts/art-gen（statusEmblems.mjs 清单）生成到 game-assets/bundled/fx/status-emblems/<key>.webp；
 * 每个引擎状态都必须有专属徽印（单测锁定覆盖面）；缺图直接抛错，不回退到徽记小图标。
 */
import { canonicalStatusKey } from './statusPresentation';

const FILES = import.meta.glob('@assets/fx/status-emblems/*.webp', {
  eager: true, query: '?url', import: 'default',
}) as Record<string, string>;

const EMBLEMS: Readonly<Record<string, string>> = Object.fromEntries(
  Object.entries(FILES).map(([path, url]) => [path.slice(path.lastIndexOf('/') + 1, -'.webp'.length), url]),
);

/** 已有专属徽印的规范键（单测用来锁定覆盖面） */
export function statusEmblemKeys(): string[] {
  return Object.keys(EMBLEMS);
}

/** 全部徽印 URL（战斗资源预载清单用） */
export function statusEmblemUrls(): string[] {
  return Object.values(EMBLEMS);
}

/** 状态徽印 URL；该状态没有专属徽印素材时抛错 */
export function statusEmblemUrl(statusId: string): string {
  const url = EMBLEMS[canonicalStatusKey(statusId)];
  if (!url) throw new Error(`缺少状态徽印素材：${statusId}`);
  return url;
}
