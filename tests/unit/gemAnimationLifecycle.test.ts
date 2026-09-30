import { afterEach, describe, expect, it, vi } from 'vitest';
import { gsap } from 'gsap';
import { Texture } from 'pixi.js';
import { GemSprite } from '@render/GemSprite';
import { GemSpritePool } from '@render/GemSpritePool';
import { skullGem, specialGem } from '@engine/types';

vi.mock('@render/gemTextures', () => ({ textureFor: () => Texture.EMPTY }));
vi.mock('../../src/preferences/playerPreferences', () => ({ prefersReducedMotion: () => false }));
afterEach(() => { gsap.globalTimeline.clear(); gsap.ticker.sleep(); });

describe('status gem animation lifecycle', () => {
  it('destroying a status gem stops particle tweens before Pixi children are destroyed', () => {
    const sprite = new GemSprite(64);
    sprite.setType(1, specialGem('burningGem'));
    const tweens = gsap.globalTimeline.getChildren();
    expect(tweens.length).toBeGreaterThan(0);
    sprite.destroy({ children: true });
    expect(() => gsap.globalTimeline.render(2, false, true)).not.toThrow();
    for (const tween of tweens) expect(tween.parent).toBeNull();
    expect(sprite.destroyed).toBe(true);
  });

  it('releasing a status gem stops its off-board particles and reuse starts cleanly', () => {
    const pool = new GemSpritePool(64);
    const sprite = pool.acquire(1, specialGem('poisonGem'));
    expect(gsap.globalTimeline.getChildren().length).toBeGreaterThan(0);
    pool.release(sprite);
    expect(gsap.globalTimeline.getChildren()).toHaveLength(0);
    const next = pool.acquire(2, skullGem());
    expect(next).toBe(sprite);
    expect(next.scale.x).toBe(1);
    expect(next.scale.y).toBe(1);
    expect(next.children).toHaveLength(1);
    pool.release(next);
    const status = pool.acquire(3, specialGem('poisonGem'));
    expect(status.children).toHaveLength(2);
    expect(gsap.globalTimeline.getChildren().length).toBeGreaterThan(0);
    status.destroy({ children: true });
  });
});
