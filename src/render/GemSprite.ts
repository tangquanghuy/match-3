import { Container, Graphics, Sprite, Text } from 'pixi.js';
import { BaseColor } from '@engine/types';
import type { GemType, SpecialGemKind, SpecialGemSpec } from '@engine/types';
import { isStatusGemKind, isWaveBGemKind } from '@engine/types';
import { textureFor } from './gemTextures';
import { attachStatusGemOverlay, disposeStatusGemOverlay } from './statusGemOverlays';
import type { StatusGemOverlay } from './statusGemOverlays';

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
  // 状态搬运族（GEMS-SEMANTICS-2 波A）：主色 = 归属基色（贴图缺失回退程序化绘制时用）
  burningGem: 0xff4d5e,
  freezeGem: 0x4aa8ff,
  curseGem: 0xc8864b,
  bleedGem: 0xb46cff,
  poisonGem: 0x4bd66a,
  deathMarkGem: 0xdfe3ea,
  terrorGem: 0xb46cff,
  entangleGem: 0x4bd66a,
  enrageGem: 0xff4d5e,
  submergeGem: 0x4aa8ff,
  faerieFireGem: 0x4bd66a,
  stunGem: 0xc8864b,
  barrierGem: 0xffd24a,
  // 赃物宝石（窗口 E 经济批）：黄底（贴图）+ 钱袋金币程序化叠层
  bootyGem: 0xffd24a,
  // 波B 17 颗（GEMS-SEMANTICS-2 2026-09-17，免贴图）：主色仅作贴图缺失时的兜底基调——
  // 六色族实际主色随 spec.color（colorOf 优先读实例色），星族/无色族按各自设计行登记
  dragonGem: 0xf2f2ff,
  giantGem: 0xffd24a,
  spiritGem: 0xb7e5ff,
  manaPotionGem: 0xf2f2ff,
  candyGem: 0xffd24a,
  elementalStar: 0xc8864b,
  umbralStar: 0xc77dff,
  angelGem: 0xffe9a6,
  daemonicPortalGem: 0xff8a5c,
  gargoyleGem: 0x8a8f9c,
  stoneBlock: 0xa8adb8,
  lycanthropyGem: 0xb46cff,
  decayGem: 0x9c8462,
  volcanoGem: 0xff4d5e,
  trapGem: 0x8a8f9c,
  enchantedGem: 0xb46cff,
  mimicGem: 0xc8864b,
};

export function colorOf(type: GemType): number {
  if (type.kind === 'color') {
    const hex = COLOR_HEX[type.color];
    return hex !== undefined ? hex : 0x8a8f9c; // 防御：颜色缺失时退灰，绝不返回纯白
  }
  if (type.kind === 'skull') return 0xdfe3ea;
  if (type.kind === 'special') {
    // 六色族（波B）实际主色随实例归属色；其余 kind 走静态表
    if (type.spec.color) return COLOR_HEX[type.spec.color] ?? 0x8a8f9c;
    return SPECIAL_HEX[type.spec.kind] ?? 0x8a8f9c;
  }
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
  /** 状态搬运宝石的程序化叠层（GEMS-SEMANTICS-2 波A）；setType 时销毁重建 */
  private statusOverlay: StatusGemOverlay | null = null;
  /** 波B 免贴图宝石的静态叠层（GEMS-SEMANTICS-2 波B）；setType 时销毁重建 */
  private waveBOverlay: Graphics | null = null;
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
    // 旧状态叠层先销毁（对象池复用时残留的补间/图层不能带到新宝石上）
    disposeStatusGemOverlay(this.statusOverlay);
    this.statusOverlay = null;
    if (this.waveBOverlay) {
      this.waveBOverlay.destroy();
      this.waveBOverlay = null;
    }

    const tex = textureFor(type);
    // 状态搬运宝石：独立贴图之上只叠轻量环境粒子。
    const statusKind = type.kind === 'special' && isStatusGemKind(type.spec.kind)
      ? type.spec.kind
      : null;
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
    } else {
      // 无贴图：回退程序化绘制
      this.spr.visible = false;
      this.draw(type);
    }
    if (statusKind) {
      this.statusOverlay = attachStatusGemOverlay(this, statusKind, this.size);
    }
    // 波B 免贴图宝石：归属色贴图（textureFor 回退）之上叠一层静态语义标记
    //（单层 Graphics、setType 绘制一次；无逐帧重绘/滤镜，GEMS-SEMANTICS-2 §0 预算）
    if (type.kind === 'special' && isWaveBGemKind(type.spec.kind)) {
      this.waveBOverlay = drawWaveBOverlay(type.spec, this.size);
      this.addChild(this.waveBOverlay);
    }
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
      // 状态搬运族（GEMS-SEMANTICS-2 波A）：贴图缺失时的兜底 = 归属色菱形 + 描边。
      // 正常路径走 SPECIAL_URL 独立贴图 + 轻量 statusGemOverlays 粒子，这里只保证可玩。
      case 'burningGem':
      case 'freezeGem':
      case 'curseGem':
      case 'bleedGem':
      case 'poisonGem':
      case 'deathMarkGem':
      case 'terrorGem':
      case 'entangleGem':
      case 'enrageGem':
      case 'submergeGem':
      case 'faerieFireGem':
      case 'stunGem':
      case 'barrierGem': {
        this.drawStatusGemFallback(kind, r);
        break;
      }
      // 波B 17 颗（免贴图）：正常路径 textureFor 已回退归属色贴图 + drawWaveBOverlay 叠层；
      // 此分支只服务贴图整体加载失败的极端回退，保证可玩。
      case 'dragonGem':
      case 'giantGem':
      case 'spiritGem':
      case 'manaPotionGem':
      case 'candyGem':
      case 'elementalStar':
      case 'umbralStar':
      case 'angelGem':
      case 'daemonicPortalGem':
      case 'gargoyleGem':
      case 'stoneBlock':
      case 'lycanthropyGem':
      case 'decayGem':
      case 'volcanoGem':
      case 'trapGem':
      case 'enchantedGem':
      case 'mimicGem': {
        this.drawStatusGemFallback(kind, r);
        break;
      }
    }
  }

  /** 状态宝石兜底剪影：归属色菱形（SPECIAL_HEX 已登记），正常路径不走到 */
  private drawStatusGemFallback(kind: SpecialGemKind, r: number): void {
    const g = this.gfx;
    const k = r * 0.92;
    const hex = SPECIAL_HEX[kind] ?? 0x8a8f9c;
    g.poly([0, -k, k, 0, 0, k, -k, 0]).fill(hex);
    g.poly([0, -k, k, 0, 0, k, -k, 0]).stroke({ width: 2, color: 0x1a1a28, alpha: 0.45 });
  }
}

/** 星形多边形顶点（n 角，外/内半径交替；rot 为起始角） */
function starPoints(cx: number, cy: number, outer: number, inner: number, n: number, rot: number): number[] {
  const pts: number[] = [];
  for (let i = 0; i < n * 2; i++) {
    const rad = i % 2 === 0 ? outer : inner;
    const a = rot + (Math.PI * i) / n;
    pts.push(cx + Math.cos(a) * rad, cy + Math.sin(a) * rad);
  }
  return pts;
}

/**
 * 波B 宝石的静态语义叠层（GEMS-SEMANTICS-2 §0 预算：单层 Graphics、setType 绘制一次，
 * 无逐帧重绘/无滤镜；待机动画复用 App 既有呼吸系统）。形状即语义的极简占位：
 * 龙=下行双箭纹 / 巨人=金环 / 灵力=鬼眼 / 药水=瓶 / 糖果=包装角 / 星=星形 /
 * 天使=光环 / 传送门=漩涡椭圆 / 石像鬼=眼色 / 石块=凿痕 / 狼化=爪痕 / 腐朽=裂纹 /
 * 火山=喷口 / 陷阱=尖刺 / 附魔=符环 / 宝箱怪=箱口。
 */
function drawWaveBOverlay(spec: SpecialGemSpec, size: number): Graphics {
  const g = new Graphics();
  const r = size * 0.5;
  const ink = { width: 2, color: 0x1a1a28, alpha: 0.6 };
  switch (spec.kind) {
    case 'dragonGem': {
      // 下行双箭纹：列向清除的方向语义
      for (const y of [-r * 0.18, r * 0.14]) {
        g.moveTo(-r * 0.26, y - r * 0.16).lineTo(0, y + r * 0.02).lineTo(r * 0.26, y - r * 0.16)
          .stroke({ width: 2.5, color: 0x1a1a28, alpha: 0.65 });
      }
      break;
    }
    case 'giantGem': {
      // 粗金环（官方"法力版末日骷髅"的体型感）
      g.circle(0, 0, r * 0.8).stroke({ width: 3, color: 0xffd24a, alpha: 0.9 });
      break;
    }
    case 'spiritGem': {
      // 两只椭圆鬼眼（白）
      g.ellipse(-r * 0.2, -r * 0.08, r * 0.12, r * 0.16).fill({ color: 0xffffff, alpha: 0.9 });
      g.ellipse(r * 0.2, -r * 0.08, r * 0.12, r * 0.16).fill({ color: 0xffffff, alpha: 0.9 });
      break;
    }
    case 'manaPotionGem': {
      // 药瓶轮廓：瓶身圆 + 瓶颈
      g.circle(0, r * 0.1, r * 0.3).stroke({ width: 2, color: 0xffffff, alpha: 0.85 });
      g.rect(-r * 0.1, -r * 0.38, r * 0.2, r * 0.2).stroke({ width: 2, color: 0xffffff, alpha: 0.85 });
      break;
    }
    case 'candyGem': {
      // 糖果包装左右角
      g.poly([-r * 0.72, 0, -r * 0.42, -r * 0.16, -r * 0.42, r * 0.16]).fill({ color: 0xffffff, alpha: 0.75 });
      g.poly([r * 0.72, 0, r * 0.42, -r * 0.16, r * 0.42, r * 0.16]).fill({ color: 0xffffff, alpha: 0.75 });
      break;
    }
    case 'elementalStar': {
      // 四色四角星 + 白核（棕蓝绿红四支角）
      const rays: [number, number][] = [[0, 0xc8864b], [Math.PI / 2, 0x4aa8ff], [Math.PI, 0x4bd66a], [-Math.PI / 2, 0xff4d5e]];
      for (const [rot, color] of rays) {
        g.poly(starPoints(0, 0, r * 0.62, r * 0.14, 4, rot - Math.PI / 2)).fill({ color, alpha: 0.85 });
      }
      g.circle(0, 0, r * 0.12).fill({ color: 0xffffff, alpha: 0.9 });
      break;
    }
    case 'umbralStar': {
      // 暗色五角星 + 紫描边
      g.poly(starPoints(0, 0, r * 0.58, r * 0.24, 5, -Math.PI / 2))
        .fill({ color: 0x2d1b4e, alpha: 0.9 })
        .stroke({ width: 2, color: 0xc77dff, alpha: 0.9 });
      break;
    }
    case 'angelGem': {
      // 顶部光环
      g.ellipse(0, -r * 0.42, r * 0.3, r * 0.1).stroke({ width: 2.5, color: 0xffd24a, alpha: 0.95 });
      break;
    }
    case 'daemonicPortalGem': {
      // 三层同心漩涡椭圆
      g.ellipse(0, 0, r * 0.62, r * 0.42).stroke({ width: 2, color: 0xff6a3a, alpha: 0.85 });
      g.ellipse(0, 0, r * 0.42, r * 0.28).stroke({ width: 2, color: 0xc77dff, alpha: 0.8 });
      g.ellipse(0, 0, r * 0.22, r * 0.14).stroke({ width: 2, color: 0x4a2d5e, alpha: 0.9 });
      break;
    }
    case 'gargoyleGem': {
      // 眼睛即语义：善=蓝眼 / 恶=红眼（tier 通道，wildcard 先例）
      const eye = spec.tier === 2 ? 0xff4d4d : 0x57c8ff;
      g.circle(-r * 0.18, -r * 0.1, r * 0.09).fill({ color: eye, alpha: 0.95 });
      g.circle(r * 0.18, -r * 0.1, r * 0.09).fill({ color: eye, alpha: 0.95 });
      break;
    }
    case 'stoneBlock': {
      // 两道凿痕（惰性物，无动画）
      g.moveTo(-r * 0.3, -r * 0.2).lineTo(r * 0.05, r * 0.05).stroke(ink);
      g.moveTo(-r * 0.05, -r * 0.3).lineTo(r * 0.3, -r * 0.05).stroke(ink);
      break;
    }
    case 'lycanthropyGem': {
      // 两道爪痕
      g.moveTo(-r * 0.28, -r * 0.34).lineTo(-r * 0.1, r * 0.3).stroke({ width: 2.5, color: 0xff4d6e, alpha: 0.85 });
      g.moveTo(r * 0.1, -r * 0.34).lineTo(r * 0.28, r * 0.3).stroke({ width: 2.5, color: 0xff4d6e, alpha: 0.85 });
      break;
    }
    case 'decayGem': {
      // 三条干裂纹（从中心放射）
      for (const [dx, dy] of [[-1, -0.4], [0.2, 1], [1, 0.1]] as const) {
        g.moveTo(0, 0).lineTo(dx * r * 0.5, dy * r * 0.5).stroke(ink);
      }
      break;
    }
    case 'volcanoGem': {
      // 火山口向上喷发三角
      g.poly([-r * 0.3, r * 0.2, r * 0.3, r * 0.2, 0, -r * 0.45])
        .fill({ color: 0xff8c3a, alpha: 0.85 });
      break;
    }
    case 'trapGem': {
      // 尖刺 ×
      g.moveTo(-r * 0.3, -r * 0.3).lineTo(r * 0.3, r * 0.3)
        .moveTo(r * 0.3, -r * 0.3).lineTo(-r * 0.3, r * 0.3)
        .stroke({ width: 2.5, color: 0xff3348, alpha: 0.9 });
      break;
    }
    case 'enchantedGem': {
      // 符文环 + 四刻度
      g.circle(0, 0, r * 0.44).stroke({ width: 2, color: 0xffffff, alpha: 0.8 });
      for (let i = 0; i < 4; i++) {
        const a = (Math.PI / 2) * i;
        g.moveTo(Math.cos(a) * r * 0.34, Math.sin(a) * r * 0.34)
          .lineTo(Math.cos(a) * r * 0.54, Math.sin(a) * r * 0.54)
          .stroke({ width: 2, color: 0xffffff, alpha: 0.8 });
      }
      break;
    }
    case 'mimicGem': {
      // 宝箱口：横线 + 金币点
      g.moveTo(-r * 0.34, r * 0.08).lineTo(r * 0.34, r * 0.08).stroke(ink);
      g.circle(0, r * 0.08, r * 0.09).fill({ color: 0xffd24a, alpha: 0.95 });
      break;
    }
    default:
      break;
  }
  return g;
}
