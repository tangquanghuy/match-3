/**
 * 窗口 Q 的隔离验收工作树同步器。
 *
 * 背景（并发事故规避）：阶段 B 六窗口共用同一工作树，其它窗口的在途改动会让
 * game.html 整体起不来（实测 2026-09-19：eventsScreen 仍 import 已被 N 改名的
 * EVENT_ROTATION → 整个外壳启动失败）。视觉验收必须能独立复现，
 * 因此把 Q 名下的文件同步到一个 detached worktree（D:\Code\m3-q，节点 HEAD 基线），
 * 在那里跑 dev server 与探针，主工作树保持唯一权威副本。
 *
 * 用法：node scripts/q_sync_worktree.mjs [目标工作树路径]
 */
import { copyFileSync, existsSync, mkdirSync } from 'node:fs';
import path from 'node:path';

const dest = process.argv[2] ?? 'D:/Code/m3-q';

/** Q 名下（独占 + 已登记台账的共享文件）需要同步的清单 */
const FILES = [
  'src/meta/screens/mapScreen.ts',
  'src/meta/screens/mapData.ts',
  'src/meta/screens/settingsScreen.ts',
  'src/meta/screens/questScreen.ts',
  'src/meta/systems/tribute.ts',
  'src/meta/systems/kingdomOps.ts',
  'src/meta/shell/screen.ts',
  'src/meta/shell/gameMain.ts',
  // 注意：state/save.ts + schema.ts 是 N→M 顺序的共享文件，Q 的导入校验改动在
  // N 落地后再接；验收工作树一律用 HEAD 版本，避免把他窗在途半成品带进来。
  'artifacts/ux-audit-scripts/q1-map-verify.mjs',
  'artifacts/ux-audit-scripts/q2-settings-verify.mjs',
  'artifacts/ux-audit-scripts/q3-quest-verify.mjs',
];

let n = 0;
for (const rel of FILES) {
  if (!existsSync(rel)) continue;
  const target = path.join(dest, rel);
  mkdirSync(path.dirname(target), { recursive: true });
  copyFileSync(rel, target);
  n += 1;
}
console.log(`已同步 ${n} 个文件 → ${dest}`);
