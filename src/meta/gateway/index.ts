/**
 * 网关出口与实例管理。屏层一律经 `metaGateway()` 取用，禁止自建 SaveStore。
 *
 * 后端选择（initMetaGateway 的默认值）：
 *  - 本地游客登录 → 独立浏览器存档，从新游戏开始，关闭开发者工具；
 *  - 构建时设了 `VITE_META_API`（如 `/api/meta`）→ 远端后端（Worker + D1，Discord 登录）；
 *  - 否则 → 本地后端（浏览器内权威核心 + localStorage，带开发者工具）。
 * 两者跑同一个权威核心（server/core.ts），屏层零差异。
 */
import { isLocalGuest, localGuestStorage } from '../../auth/localGuest';
import { CommandGateway } from './commandGateway';
import { HttpTransport, LocalTransport } from './transport';
import type { MetaGateway } from './types';

export * from './types';
export { CommandGateway, MockGateway } from './commandGateway';
export { HttpTransport, LocalTransport, MetaHttpError, memoryStorage, type MetaTransport } from './transport';
export { buildDemoSave } from '../server/demo';
export { DAY_MS, HOUR_MS, todayStartOf, weekStartOf } from './clock';

let current: MetaGateway | null = null;

/** 按构建环境选后端 */
export function defaultMetaGateway(): MetaGateway {
  const api = import.meta.env.VITE_META_API;
  if (isLocalGuest()) {
    return new CommandGateway(new LocalTransport(localGuestStorage(localStorage), {
      fresh: 'new', requireCharacter: true, allowDev: false,
    }));
  }
  return api ? new CommandGateway(new HttpTransport(api)) : new CommandGateway(new LocalTransport(undefined, { requireCharacter: true }));
}

/** 外壳启动时初始化一次；之后所有屏共享同一实例 */
export function initMetaGateway(gateway: MetaGateway = defaultMetaGateway()): MetaGateway {
  current = gateway;
  return gateway;
}

/**
 * 游戏时钟（展示用）：按服务器时刻校准过的「现在」。屏层判定日界/周界、画倒计时一律用它，
 * 不直接读 Date.now()——否则客户端时钟偏差会让界面与服务端结算对不上。
 */
export function gameNow(): number {
  return current ? current.now() : Date.now();
}

export function metaGateway(): MetaGateway {
  if (!current) throw new Error('Meta 网关未初始化：外壳应先调 initMetaGateway()');
  return current;
}
