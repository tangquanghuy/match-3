/**
 * 权威核心的运行环境：时钟 + 熵 + 权限。
 *
 * 本地后端用浏览器时钟与 crypto；Worker 用服务器时钟与 crypto.getRandomValues。
 * 测试注入固定时钟/种子序列，保证可复算。
 */
export interface ServerEnv {
  /** 权威时刻（epoch ms） */
  now(): number;
  /** 32 位无符号种子（抽卡/出敌/竞技场/寻宝） */
  seed(): number;
  /** 是否允许 dev.* 命令（导入存档、演示档、收藏修改器、战斗调试） */
  allowDev: boolean;
}

/** crypto 熵源（浏览器与 Workers 都有 Web Crypto） */
export function cryptoSeed(): number {
  const buf = new Uint32Array(1);
  crypto.getRandomValues(buf);
  return buf[0]! >>> 0;
}

export function defaultEnv(options: Partial<ServerEnv> = {}): ServerEnv {
  return {
    now: options.now ?? (() => Date.now()),
    seed: options.seed ?? cryptoSeed,
    allowDev: options.allowDev ?? false,
  };
}
