/**
 * 网关出口与实例管理。屏层一律经 `metaGateway()` 取用，禁止自建 SaveStore。
 *
 * 将来切 D1：新增 `D1Gateway implements MetaGateway`（RPC 到 Worker，服务器跑
 * 同一套纯 systems），把 `new MockGateway()` 换成 `new D1Gateway(apiBase)` 即可，
 * 屏层零改动。
 */
import { MockGateway } from './mockGateway';
import type { MetaGateway } from './types';

export * from './types';
export { MockGateway, memoryStorage } from './mockGateway';
export { buildDemoSave } from './demo';
export { HOUR_MS, todayStartOf, weekStartOf } from './clock';

let current: MetaGateway | null = null;

/** 外壳启动时初始化一次；之后所有屏共享同一实例 */
export function initMetaGateway(gateway: MetaGateway = new MockGateway()): MetaGateway {
  current = gateway;
  return gateway;
}

export function metaGateway(): MetaGateway {
  if (!current) throw new Error('Meta 网关未初始化：外壳应先调 initMetaGateway()');
  return current;
}
