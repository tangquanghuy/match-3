import { Container, Graphics, Sprite, Text } from 'pixi.js';
import { BaseColor } from '@engine/types';
import type { GemType, SpecialGemKind } from '@engine/types';
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

/** 特殊宝石占位主色（美术素材到位前的程序化绘制基调，命名语义见 GEMS-SEMANTICS.md） */
const SPECIAL_HEX: Record<SpecialGemKind, number> = {
  doomSkull: 0x6b4a9e,
  uberDoomSkull: 0x4a2d5e,
  bomb: 0x2a2a33,
  web: 0xb46cff,
  lightningRow: 0x4aa8ff,
  lightningCol: 0xffd24a,
  wildcard: 0xf2f2ff,
  wish: 0xffd24a,
  hourglass: 0xffc94a,
  ghost: 0x9ec8ef,
};

export function colorOf(type: GemType): number {
  if (type.kind === 'color') {
    const hex = COLOR_HEX[type.color];
    return hex !== undefined ? hex : 0x8a8f9c; // 防御：颜色缺失时退灰，绝不返回纯白
  }
  if (type.kind === 'skull') return 0xdfe3ea;
  if (type.kind === 'special') return SPECIAL_HEX[type.spec.kind] ?? 0x8a8f9c;
  return 0x8a8f9c;
}

/**
 * 宝石精灵（需求 9, 19.3）。
 * 用程序化绘制做占位美术：圆角菱形/水晶 + 高光，骷髅用圆形 + 简单面孔，
 * 特殊宝石按各自语义绘制剪影（末日骷髅/炸弹/织网/闪电行列/通配/许愿/沙漏）。
 * 资源失败时也能保证可玩（不依赖外部贴图）；美术素材到位后由 gemTextures 提供贴图即替换。
 */
export class GemSprite extends Container {
  gemId = -1;
  private gfx: Graphics;
  private spr: Sprite;
  /** 通配宝石的倍率数字（×2/×4），仅 wildcard 显示（惰性创建，避免精灵池开销） */
  private multiplierLabel: Text | null = null;
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
    if (this.multiplierLabel) this.multiplierLabel.visible = false;
    const tex = textureFor(type);
    if (tex) {
      // 有贴图：用贴图渲染，清空程序化绘制
      this.gfx.clear();
      this.spr.texture = tex;
      // 贴图占格子约 0.96，留一点缝隙
      let visualScale = 0.96;
      if (type.kind === 'skull') visualScale = 1.0;
      if (type.kind === 'special') {
        // 末日族在美术上更大更狰狞，贴图铺满格子；其余特殊宝石与颜色宝石一致
        if (type.spec.kind === 'doomSkull' || type.spec.kind === 'uberDoomSkull') visualScale = 1.0;
      }
      if (type.kind === 'color') {
        if (type.color === BaseColor.Yellow) visualScale = 0.85;
        else if (type.color === BaseColor.Purple) visualScale = 0.99;
        else if (type.color === BaseColor.Brown) visualScale = 0.975;
      }
      const target = this.size * visualScale;
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
      this.drawSkull(r, 0xe4e7ee, 0x9aa0ad, 0x3a3f4b, r * 0.86);
      return;
    }
    if (type.kind === 'special') {
      this.drawSpecial(type.spec.kind, type.spec.tier, r);
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

  /** 骷髅头占位。末日骷髅复用同构，换紫黑配色并放大（参数化，素材到位后一并替换） */
  private drawSkull(
    r: number,
    face: number,
    edge: number,
    socket: number,
    radius: number,
  ): void {
    const g = this.gfx;
    // 外圈淡暗描边，让它在暗色凹槽背景上有清晰轮廓（深色宝石易陷进背景）
    g.circle(0, 0, radius + r * 0.04).stroke({ width: 3, color: 0x0c0c14, alpha: 0.5 });
    g.circle(0, 0, radius).fill(face);
    g.circle(0, 0, radius).stroke({ width: 2, color: edge });
    g.circle(-r * 0.3, -r * 0.12, r * 0.2).fill(socket);
    g.circle(r * 0.3, -r * 0.12, r * 0.2).fill(socket);
    g.poly([0, r * 0.05, -r * 0.12, r * 0.32, r * 0.12, r * 0.32]).fill(socket);
    // 牙缝线（普通骷髅省略也能看，末日骷髅更狰狞）
    g.moveTo(-r * 0.22, r * 0.52).lineTo(r * 0.22, r * 0.52)
      .stroke({ width: 2, color: edge, alpha: 0.7 });
  }

  /** 特殊宝石占位剪影（方向/形状即语义，见 GEMS-SEMANTICS.md 美术需求单） */
  private drawSpecial(kind: SpecialGemKind, tier: number | undefined, r: number): void {
    const g = this.gfx;
    switch (kind) {
      case 'doomSkull': {
        // 紫黑色骷髅，眼窝透紫光，比普通骷髅大一号
        this.drawSkull(r, 0x33244d, 0x1c1230, 0xc77dff, r * 0.94);
        break;
      }
      case 'bomb': {
        // 黑色圆炸弹 + 引信火花
        g.circle(0, r * 0.06, r * 0.72).stroke({ width: 3, color: 0x0c0c14, alpha: 0.5 });
        g.circle(0, r * 0.06, r * 0.68).fill(0x1f1f28);
        g.circle(0, r * 0.06, r * 0.68).stroke({ width: 2, color: 0x000000, alpha: 0.6 });
        g.circle(-r * 0.22, -r * 0.14, r * 0.16).fill({ color: 0xffffff, alpha: 0.22 });
        // 引信（顶到右上）+ 火花
        g.moveTo(0, -r * 0.58).quadraticCurveTo(r * 0.3, -r * 0.86, r * 0.42, -r * 0.68)
          .stroke({ width: 3, color: 0x8a6b4a });
        g.circle(r * 0.42, -r * 0.68, r * 0.1).fill(0xff8c4a);
        g.circle(r * 0.42, -r * 0.68, r * 0.05).fill(0xffd24a);
        break;
      }
      case 'web': {
        // 紫色蛛网：半透明圆底 + 8 根辐条 + 两圈环
        g.circle(0, 0, r * 0.86).fill({ color: 0xb46cff, alpha: 0.22 });
        g.circle(0, 0, r * 0.86).stroke({ width: 2, color: 0xb46cff, alpha: 0.9 });
        for (let i = 0; i < 8; i++) {
          const a = (Math.PI / 4) * i;
          g.moveTo(0, 0)
            .lineTo(Math.cos(a) * r * 0.86, Math.sin(a) * r * 0.86)
            .stroke({ width: 1.5, color: 0xd9b6ff, alpha: 0.8 });
        }
        g.circle(0, 0, r * 0.34).stroke({ width: 1.5, color: 0xd9b6ff, alpha: 0.8 });
        g.circle(0, 0, r * 0.62).stroke({ width: 1.5, color: 0xd9b6ff, alpha: 0.8 });
        break;
      }
      case 'lightningCol': {
        // 竖向锯齿闪电：方向即语义（清空整列）
        g.poly([
          r * 0.14, -r * 0.8,
          -r * 0.3, r * 0.02,
          -r * 0.02, r * 0.02,
          -r * 0.14, r * 0.8,
          r * 0.3, -r * 0.02,
          r * 0.02, -r * 0.02,
        ]).fill(0xffd24a);
        g.poly([
          r * 0.14, -r * 0.8,
          -r * 0.3, r * 0.02,
          -r * 0.02, r * 0.02,
          -r * 0.14, r * 0.8,
          r * 0.3, -r * 0.02,
          r * 0.02, -r * 0.02,
        ]).stroke({ width: 2, color: 0x1a1a28, alpha: 0.55 });
        break;
      }
      case 'lightningRow': {
        // 横向锯齿闪电：方向即语义（清空整行）
        g.poly([
          -r * 0.8, r * 0.14,
          r * 0.02, -r * 0.3,
          r * 0.02, -r * 0.02,
          r * 0.8, -r * 0.14,
          -r * 0.02, r * 0.3,
          -r * 0.02, r * 0.02,
        ]).fill(0x4aa8ff);
        g.poly([
          -r * 0.8, r * 0.14,
          r * 0.02, -r * 0.3,
          r * 0.02, -r * 0.02,
          r * 0.8, -r * 0.14,
          -r * 0.02, r * 0.3,
          -r * 0.02, r * 0.02,
        ]).stroke({ width: 2, color: 0x1a1a28, alpha: 0.55 });
        break;
      }
      case 'wildcard': {
        // 棱镜：白钻 + 彩色内环 + 中央倍率数字
        const k = r * 0.92;
        g.poly([0, -k, k, 0, 0, k, -k, 0]).fill(0xf2f2ff);
        g.poly([0, -k, k, 0, 0, k, -k, 0]).stroke({ width: 2, color: 0x1a1a28, alpha: 0.45 });
        const t2 = k * 0.72;
        g.poly([0, -t2, t2, 0, 0, t2, -t2, 0]).stroke({ width: 2.5, color: 0xff4d5e, alpha: 0.85 });
        const t3 = k * 0.5;
        g.poly([0, -t3, t3, 0, 0, t3, -t3, 0]).stroke({ width: 2.5, color: 0xffd24a, alpha: 0.9 });
        const t4 = k * 0.3;
        g.poly([0, -t4, t4, 0, 0, t4, -t4, 0]).stroke({ width: 2.5, color: 0x4aa8ff, alpha: 0.9 });
        if (!this.multiplierLabel) {
          this.multiplierLabel = new Text({
            text: '',
            style: {
              fontFamily: 'Arial',
              fontSize: this.size * 0.34,
              fontWeight: '900',
              fill: 0x1a1a28,
              stroke: { color: 0xffffff, width: 2 },
            },
          });
          this.multiplierLabel.anchor.set(0.5);
          this.addChild(this.multiplierLabel);
        }
        this.multiplierLabel.text = `×${tier ?? 2}`;
        this.multiplierLabel.visible = true;
        break;
      }
      case 'wish': {
        // 金色神灯/星光漩涡：金圆 + 内旋弧 + 高光星
        g.circle(0, 0, r * 0.8).fill(0xffd24a);
        g.circle(0, 0, r * 0.8).stroke({ width: 2.5, color: 0xb8860b });
        g.arc(0, 0, r * 0.52, Math.PI * 0.2, Math.PI * 1.1).stroke({ width: 2.5, color: 0xb8860b, alpha: 0.8 });
        g.arc(0, 0, r * 0.3, Math.PI * 1.2, Math.PI * 2.05).stroke({ width: 2, color: 0xb8860b, alpha: 0.7 });
        g.poly([r * 0.3, -r * 0.34, r * 0.38, -r * 0.14, r * 0.56, -r * 0.1, r * 0.4, 0.02, r * 0.44, r * 0.22, r * 0.3, r * 0.1, r * 0.16, r * 0.22, r * 0.22, 0, r * 0.08, -r * 0.12, r * 0.24, -r * 0.14])
          .fill({ color: 0xffffff, alpha: 0.85 });
        break;
      }
      case 'hourglass': {
        // 金黄沙漏：上下三角 + 框架 + 沙粒
        g.rect(-r * 0.5, -r * 0.68, r, r * 0.1).fill(0xb8860b);
        g.rect(-r * 0.5, r * 0.58, r, r * 0.1).fill(0xb8860b);
        g.poly([-r * 0.42, -r * 0.58, r * 0.42, -r * 0.58, 0, 0]).fill(0xffc94a);
        g.poly([0, 0, -r * 0.42, r * 0.58, r * 0.42, r * 0.58]).fill(0xffc94a);
        g.poly([-r * 0.42, -r * 0.58, r * 0.42, -r * 0.58, 0, 0]).stroke({ width: 2, color: 0xb8860b, alpha: 0.7 });
        g.poly([0, 0, -r * 0.42, r * 0.58, r * 0.42, r * 0.58]).stroke({ width: 2, color: 0xb8860b, alpha: 0.7 });
        g.circle(0, -r * 0.38, r * 0.07).fill(0xb8860b);
        g.circle(0, r * 0.42, r * 0.1).fill(0xb8860b);
        break;
      }
    }
  }
}
