import { Container, Graphics, Text, TextStyle } from 'pixi.js';
import { gsap } from 'gsap';
import { AnimConfig } from './AnimationConfig';

/**
 * 特效层（需求 19.3, 19.5）：粒子爆裂、连击飘字。
 * 程序化生成，零额外资源。粒子数量受上限约束（需求 24.4）。
 */
export class FXLayer extends Container {
  private maxParticles = 240;
  private activeParticles = 0;

  constructor(_cellSize = 64) {
    super();
  }

  /** 消除点缀：少量同色细碎，快速淡出。克制、不抢戏（需求 19.3） */
  burst(x: number, y: number, color: number, intensity = 1): void {
    const count = Math.min(
      Math.round(5 * intensity),
      this.maxParticles - this.activeParticles,
    );
    for (let i = 0; i < count; i++) {
      const p = new Graphics();
      const radius = 2 + Math.random() * 2;
      p.circle(0, 0, radius).fill({ color, alpha: 0.85 });
      p.x = x;
      p.y = y;
      this.addChild(p);
      this.activeParticles++;

      const angle = Math.random() * Math.PI * 2;
      const dist = (14 + Math.random() * 20) * intensity;
      gsap.to(p, {
        x: x + Math.cos(angle) * dist,
        y: y + Math.sin(angle) * dist,
        alpha: 0,
        duration: 0.3 + Math.random() * 0.15,
        ease: 'power2.out',
        onComplete: () => {
          p.destroy();
          this.activeParticles--;
        },
      });
    }
  }

  /** 连击飘字（需求 19.5） */
  comboText(x: number, y: number, chain: number): void {
    const style = new TextStyle({
      fill: 0xffffff,
      fontSize: 28 + chain * 4,
      fontWeight: 'bold',
      stroke: { color: 0x000000, width: 4 },
    });
    const t = new Text({ text: `连击 x${chain}`, style });
    t.anchor.set(0.5);
    t.x = x;
    t.y = y;
    this.addChild(t);
    gsap.fromTo(
      t,
      { alpha: 0, y: y + 10 },
      {
        alpha: 1,
        y: y - 30,
        duration: 0.5,
        ease: 'back.out(2)',
        onComplete: () => {
          gsap.to(t, {
            alpha: 0,
            y: y - 60,
            duration: 0.4,
            delay: 0.2,
            onComplete: () => t.destroy(),
          });
        },
      },
    );
  }
}

/** 屏幕震动（需求 19.5, 19.7）：作用于传入的容器 */
export function screenShake(target: Container, chain: number): void {
  const cfg = AnimConfig.shake;
  const amp = Math.min(cfg.baseAmplitude + chain * cfg.perChain, cfg.maxAmplitude);
  const ox = target.x;
  const oy = target.y;
  const tl = gsap.timeline();
  const steps = 6;
  for (let i = 0; i < steps; i++) {
    tl.to(target, {
      x: ox + (Math.random() - 0.5) * amp * 2,
      y: oy + (Math.random() - 0.5) * amp * 2,
      duration: cfg.duration / steps,
      ease: 'none',
    });
  }
  tl.to(target, { x: ox, y: oy, duration: cfg.duration / steps, ease: 'power2.out' });
}

/**
 * 命中整屏震动（攻击撞击专用）：作用于 DOM 容器（wrapper），
 * 让棋盘与角色卡一起晃动，比仅震棋盘更有打击实感。含位移 + 轻微旋转踢动。
 * 通过 Web Animations API 叠加在 wrapper 现有的缩放(transform)之上，互不破坏。
 */
export function impactShake(el: HTMLElement, baseTransform = ''): void {
  const cfg = AnimConfig.impactShake;
  const a = cfg.amplitude;
  const r = cfg.rotation;
  const pre = baseTransform ? baseTransform + ' ' : '';
  // 衰减式抖动序列：首帧最猛，逐步收敛归位
  const frames = [
    { x: 0, y: 0, rot: 0 },
    { x: -a, y: a * 0.5, rot: -r },
    { x: a * 0.85, y: -a * 0.6, rot: r },
    { x: -a * 0.55, y: a * 0.35, rot: -r * 0.5 },
    { x: a * 0.35, y: -a * 0.25, rot: r * 0.35 },
    { x: 0, y: 0, rot: 0 },
  ];
  el.animate(
    frames.map((f) => ({
      transform: `${pre}translate(${f.x}px, ${f.y}px) rotate(${f.rot}deg)`,
    })),
    { duration: cfg.duration, easing: 'ease-out' },
  );
}
