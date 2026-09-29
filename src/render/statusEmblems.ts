/**
 * 状态「中招」徽印素材表：规范键 → 图片 URL。
 * 素材由 scripts/art-gen（statusEmblems.mjs 清单）生成到 src/assets/fx/status-emblems/<key>.webp；
 * 缺图的状态回退到徽记图标（statusBadges），保证任何状态施加都有徽印可演。
 */
import { canonicalStatusKey } from './statusPresentation';
import { statusBadge } from './statusBadges';

const FILES = import.meta.glob('../assets/fx/status-emblems/*.webp', {
  eager: true, query: '?url', import: 'default',
}) as Record<string, string>;

const EMBLEMS: Readonly<Record<string, string>> = Object.fromEntries(
  Object.entries(FILES).map(([path, url]) => [path.slice(path.lastIndexOf('/') + 1, -'.webp'.length), url]),
);

/** 已有专属徽印的规范键（单测用来锁定覆盖面） */
export function statusEmblemKeys(): string[] {
  return Object.keys(EMBLEMS);
}

/** 状态徽印 URL：专属素材优先，其次徽记图标；都没有返回 null（不演徽印，只弹徽记）。 */
export function statusEmblemUrl(statusId: string): string | null {
  return EMBLEMS[canonicalStatusKey(statusId)] ?? statusBadge(statusId).icon;
}
