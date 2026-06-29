/**
 * 种子化伪随机数生成器（需求 3.4, 17.3）。
 * 逻辑层所有随机性必须经由此类，禁止直接使用 Math.random，
 * 以保证确定性：相同种子产出相同序列。
 *
 * 采用 mulberry32 算法：快速、无依赖、32 位状态、分布良好，足够游戏使用。
 */
export class SeededRNG {
  private state: number;

  constructor(seed: number) {
    // 归一化为 32 位无符号整数；保证非零初始状态
    this.state = (seed >>> 0) || 0x9e3779b9;
  }

  /** 返回 [0, 1) 的浮点数 */
  next(): number {
    this.state = (this.state + 0x6d2b79f5) | 0;
    let t = this.state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  /** 返回 [0, maxExclusive) 的整数 */
  nextInt(maxExclusive: number): number {
    return Math.floor(this.next() * maxExclusive);
  }

  /** 从数组中随机取一个元素 */
  pick<T>(arr: readonly T[]): T {
    return arr[this.nextInt(arr.length)];
  }

  /** 导出当前内部状态（用于存档/调试） */
  getState(): number {
    return this.state >>> 0;
  }

  /** 恢复内部状态 */
  setState(state: number): void {
    this.state = state >>> 0;
  }
}
