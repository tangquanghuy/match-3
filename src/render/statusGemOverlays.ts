/**
 * 状态宝石贴图上方的轻量环境粒子。
 *
 * 主体造型已由独立美术贴图承担；这里不再重画徽章，只给每种状态补少量
 * 边缘光尘。Graphics 创建后不逐帧重绘，GSAP 仅改变 transform/alpha。
 */
import { Container, Graphics } from 'pixi.js';
import { gsap } from 'gsap';
import type { StatusGemKind } from '@engine/types';

export interface StatusGemOverlay {
  container: Container;
  tweens: gsap.core.Tween[];
}

interface ParticleTheme {
  color: number;
  accent: number;
  motion: 'rise' | 'orbit' | 'shimmer';
  shape: 'mote' | 'bubble' | 'spark';
}

const THEMES: Record<StatusGemKind, ParticleTheme> = {
  burningGem: { color: 0xff742b, accent: 0xffdc73, motion: 'rise', shape: 'mote' },
  freezeGem: { color: 0xa9e9ff, accent: 0xffffff, motion: 'shimmer', shape: 'spark' },
  curseGem: { color: 0xb85cff, accent: 0xe7b8ff, motion: 'orbit', shape: 'spark' },
  bleedGem: { color: 0xff3156, accent: 0xff9bad, motion: 'rise', shape: 'mote' },
  poisonGem: { color: 0x78ff51, accent: 0xd2ff9d, motion: 'rise', shape: 'bubble' },
  deathMarkGem: { color: 0xff2445, accent: 0xff8fa2, motion: 'shimmer', shape: 'spark' },
  terrorGem: { color: 0xe05dff, accent: 0xffb3f5, motion: 'orbit', shape: 'mote' },
  entangleGem: { color: 0x73dd5c, accent: 0xc8f89b, motion: 'shimmer', shape: 'mote' },
  enrageGem: { color: 0xff3b20, accent: 0xffc85a, motion: 'rise', shape: 'mote' },
  submergeGem: { color: 0x7fddff, accent: 0xe0f8ff, motion: 'rise', shape: 'bubble' },
  faerieFireGem: { color: 0xc9ff82, accent: 0xffffff, motion: 'orbit', shape: 'spark' },
  stunGem: { color: 0xffc741, accent: 0xfff3b0, motion: 'orbit', shape: 'spark' },
  barrierGem: { color: 0xffdc68, accent: 0xffffff, motion: 'shimmer', shape: 'spark' },
};

function prefersReducedMotion(): boolean {
  return typeof window !== 'undefined'
    && typeof window.matchMedia === 'function'
    && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

function drawSpark(target: Graphics, x: number, y: number, radius: number, color: number): void {
  target.poly([
    x, y - radius,
    x + radius * 0.24, y - radius * 0.24,
    x + radius, y,
    x + radius * 0.24, y + radius * 0.24,
    x, y + radius,
    x - radius * 0.24, y + radius * 0.24,
    x - radius, y,
    x - radius * 0.24, y - radius * 0.24,
  ]).fill({ color, alpha: 0.78 });
}

/**
 * 保持 GemSprite 的既有挂载接口；只增加不会遮盖贴图主体的边缘粒子。
 */
export function attachStatusGemOverlay(
  parent: Container,
  kind: StatusGemKind,
  size: number,
): StatusGemOverlay {
  const container = new Container();
  const particles = new Graphics();
  const glint = new Graphics();
  const tweens: gsap.core.Tween[] = [];
  const theme = THEMES[kind];
  const r = size * 0.5;

  const points = [
    { x: -0.48, y: -0.3, radius: 0.045 },
    { x: 0.47, y: -0.1, radius: 0.035 },
    { x: 0.33, y: 0.45, radius: 0.027 },
  ];

  for (const [index, point] of points.entries()) {
    const x = point.x * r;
    const y = point.y * r;
    const radius = point.radius * r;
    const color = index === 0 ? theme.accent : theme.color;
    if (theme.shape === 'spark') {
      drawSpark(particles, x, y, radius * 1.7, color);
    } else if (theme.shape === 'bubble') {
      particles.circle(x, y, radius * 1.35)
        .stroke({ width: Math.max(1, size * 0.012), color, alpha: 0.62 });
      particles.circle(x - radius * 0.32, y - radius * 0.32, radius * 0.2)
        .fill({ color: theme.accent, alpha: 0.7 });
    } else {
      particles.circle(x, y, radius).fill({ color, alpha: 0.72 });
    }
  }

  // 左上切面的一次微光，不画完整外框，避免重新变成 UI 徽章。
  glint.arc(-r * 0.04, r * 0.03, r * 0.61, Math.PI * 1.1, Math.PI * 1.42)
    .stroke({ width: Math.max(1, size * 0.014), color: theme.accent, alpha: 0.22 });

  container.addChild(particles, glint);
  parent.addChild(container);

  if (!prefersReducedMotion()) {
    if (theme.motion === 'rise') {
      tweens.push(gsap.to(particles, {
        y: -r * 0.1,
        alpha: 0.38,
        duration: 1.35,
        ease: 'sine.inOut',
        yoyo: true,
        repeat: -1,
      }));
    } else if (theme.motion === 'orbit') {
      tweens.push(gsap.to(particles, {
        rotation: Math.PI * 2,
        duration: 7,
        ease: 'none',
        repeat: -1,
      }));
    } else {
      tweens.push(gsap.to(particles, {
        alpha: 0.35,
        duration: 1.05,
        ease: 'sine.inOut',
        yoyo: true,
        repeat: -1,
      }));
    }
    tweens.push(gsap.to(glint, {
      alpha: 0.08,
      duration: 1.3,
      ease: 'sine.inOut',
      yoyo: true,
      repeat: -1,
    }));
  }

  return { container, tweens };
}

export function disposeStatusGemOverlay(overlay: StatusGemOverlay | null): void {
  if (!overlay) return;
  for (const tween of overlay.tweens) tween.kill();
  overlay.container.destroy({ children: true });
}
