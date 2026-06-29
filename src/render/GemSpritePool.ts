import { gsap } from 'gsap';
import { GemSprite } from './GemSprite';
import type { GemType } from '@engine/types';

/**
 * 宝石精灵对象池（需求 24.3）。
 * 消除时回收而非销毁，避免连锁高峰反复创建/销毁导致卡顿。
 */
export class GemSpritePool {
  private free: GemSprite[] = [];
  private size: number;

  constructor(size: number) {
    this.size = size;
  }

  acquire(gemId: number, type: GemType): GemSprite {
    const sprite = this.free.pop() ?? new GemSprite(this.size);
    // 清除该精灵上一切残留补间（消除时的缩放/透明度动画可能尚未结束），
    // 否则复用后旧补间会把新宝石的 scale/alpha 拖回 0，表现为"空缺格"。
    GemSpritePool.killTweens(sprite);
    sprite.visible = true;
    sprite.alpha = 1;
    sprite.scale.set(1);
    sprite.rotation = 0;
    sprite.setType(gemId, type);
    return sprite;
  }

  release(sprite: GemSprite): void {
    // 回收前同样杀掉残留补间，保证下次取用时是干净状态。
    GemSpritePool.killTweens(sprite);
    sprite.visible = false;
    if (sprite.parent) sprite.parent.removeChild(sprite);
    this.free.push(sprite);
  }

  /** 杀掉精灵自身及其 scale 上的所有 GSAP 补间 */
  private static killTweens(sprite: GemSprite): void {
    gsap.killTweensOf(sprite);
    gsap.killTweensOf(sprite.scale);
  }
}
