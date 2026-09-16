/**
 * Meta 层统一出口（对内 barrel）。screens/shell/bridge 未来从这里取逻辑。
 * 引擎与会话层**禁止反向 import 本目录**（依赖方向：game → meta → session/engine）。
 */
export * from './types';
export * from './data/economy';
export * from './data/kingdoms';
export * from './state/schema';
export * from './state/save';
export * from './systems/wallet';
export * from './systems/troopProgress';
export * from './systems/teamRules';
export * from './systems/encounter';
export * from './systems/battleBridge';
export * from './systems/settlement';
