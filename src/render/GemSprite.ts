import { Container, Graphics, Sprite } from 'pixi.js';
import { BaseColor } from '@engine/types';
import type { GemType } from '@engine/types';
import { textureFor } from './gemTextures';

/** 六色占位配色（带高光的水晶感，后续可替换为贴图，需求 21.4） */
const COLOR_HEX: Record<BaseColor, number> = {
  [BaseColor.Red]: 0xff4d5e,
  [BaseColor.Green]: 0x4bd66a,
  [BaseColor.Blue]: 0x4aa8ff,
  [BaseColor.Yellow]: 0xffd24a,
  [BaseColor.Purple]: 0xb46cff,
  [BaseColor.Brown]: 0xc8864b,
};

const COLOR_HI: Record<BaseColor, number> = {
  [BaseColor.Red]: 0xff9aa6,
  [BaseColor.Green]: 0xa6f0b4,
  [BaseColor.Blue]: 0xa6d4ff,
  [BaseColor.Yellow]: 0xffe9a6,
  [BaseColor.Purple]: 0xd9b6ff,
  [BaseColor.Brown]: 0xe6bd94,
};

export function colorOf(type: GemType): number {
  if (type.kind === 'color') {
    const hex = COLOR_HEX[type.color];
    return hex !== undefined ? hex : 0x8a8f9c; // 防御：颜色缺失时退灰，绝不返回纯白
  }
  if (type.kind === 'skull') return 0xdfe3ea;
  return 0x8a8f9c;
}

/**
 * 宝石精灵（需求 9, 19.3）。
 * 用程序化绘制做占位美术：圆角菱形/水晶 + 高光，骷髅用圆形 + 简单面孔。
 * 资源失败时也能保证可玩（不依赖外部贴图）。
 */
export class GemSprite extends Container {
  gemId = -1;
  private gfx: Graphics;
  private spr: Sprite;
  private size: number;

  constructor(size: number) {
    super();
    this.size = size;
    this.gfx = new Graphics();
    this.addChild(this.gfx);
    // 贴图精灵：居中锚点，按格子尺寸缩放；无贴图时隐藏，退回 Graphics
    this.spr = new Sprite();
    this.spr.anchor.set(0.5);
    this.spr.visible = false;
    this.addChild(this.spr);
  }

  /** 根据宝石类型重绘 */
  setType(gemId: number, type: GemType): void {
    this.gemId = gemId;
    const tex = textureFor(type);
    if (tex) {
      // 有贴图：用贴图渲染，清空程序化绘制
      this.gfx.clear();
      this.spr.texture = tex;
      // 贴图占格子约 0.96，留一点缝隙
      const target = this.size * 0.96;
      const maxDim = Math.max(tex.width, tex.height) || target;
      this.spr.scale.set(target / maxDim);
      this.spr.visible = true;
      return;
    }
    // 无贴图：回退程序化绘制
    this.spr.visible = false;
    this.draw(type);
  }

  private draw(type: GemType): void {
    const g = this.gfx;
    g.clear();
    const s = this.size;
    const r = s * 0.5;

    if (type.kind === 'skull') {
      // 骷髅：灰白圆 + 两个眼窝 + 鼻。外加一圈淡暗描边，
      // 让它在暗色凹槽背景上有清晰轮廓（深色宝石易陷进背景）。
      g.circle(0, 0, r * 0.86).stroke({ width: 3, color: 0x0c0c14, alpha: 0.5 });
      g.circle(0, 0, r * 0.82).fill(0xe4e7ee);
      g.circle(0, 0, r * 0.82).stroke({ width: 2, color: 0x9aa0ad });
      g.circle(-r * 0.3, -r * 0.12, r * 0.2).fill(0x3a3f4b);
      g.circle(r * 0.3, -r * 0.12, r * 0.2).fill(0x3a3f4b);
      g.poly([0, r * 0.05, -r * 0.12, r * 0.32, r * 0.12, r * 0.32]).fill(0x3a3f4b);
      return;
    }

    const base = colorOf(type);
    const hi = type.kind === 'color' ? COLOR_HI[type.color] : 0xffffff;

    // 菱形水晶造型
    const k = r * 0.92;
    g.poly([0, -k, k, 0, 0, k, -k, 0]).fill(base);
    g.poly([0, -k, k, 0, 0, k, -k, 0]).stroke({ width: 2, color: 0x1a1a28, alpha: 0.45 });

    // 高光三角（左上）：压低 alpha，弱化塑料反光
    g.poly([0, -k * 0.78, k * 0.5, -k * 0.18, 0, -k * 0.04, -k * 0.42, -k * 0.2])
      .fill({ color: hi, alpha: 0.38 });
    // 中心点高光：缩小并压暗，仅作一点通透感
    g.circle(-k * 0.12, -k * 0.12, k * 0.1).fill({ color: 0xffffff, alpha: 0.28 });
  }
}
