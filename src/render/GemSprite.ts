import { Container, Sprite } from 'pixi.js';
import { BaseColor } from '@engine/types';
import type { GemType, SpecialGemKind } from '@engine/types';
import { isStatusGemKind } from '@engine/types';
import { textureFor } from './gemTextures';
import { attachStatusGemOverlay, disposeStatusGemOverlay } from './statusGemOverlays';
import type { StatusGemOverlay } from './statusGemOverlays';

/** 六色主色（粒子/光效着色用，见 colorOf） */
const COLOR_HEX: Record<BaseColor, number> = {
  [BaseColor.Red]: 0xff4d5e,
  [BaseColor.Green]: 0x4bd66a,
  [BaseColor.Blue]: 0x4aa8ff,
  [BaseColor.Yellow]: 0xffd24a,
  [BaseColor.Purple]: 0xb46cff,
  [BaseColor.Brown]: 0xc8864b,
};

/** 特殊宝石主色（粒子/光效着色用，命名语义见 GEMS-SEMANTICS.md） */
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
  bootyGem: 0xffd24a,
  // 六色族实际主色随 spec.color（colorOf 优先读实例色）
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
    if (type.spec.color) return COLOR_HEX[type.spec.color] ?? 0x8a8f9c;
    return SPECIAL_HEX[type.spec.kind] ?? 0x8a8f9c;
  }
  return 0x8a8f9c;
}

/**
 * 宝石精灵（需求 9, 19.3）：只用贴图渲染。
 * 贴图由 battleAssets 在进战斗前全部加载完毕；缺贴图是数据/资源错误，textureFor 直接抛出。
 */
export class GemSprite extends Container {
  gemId = -1;
  private spr: Sprite;
  /** 状态搬运宝石的环境粒子叠层（GEMS-SEMANTICS-2 波A）；setType 时销毁重建 */
  private statusOverlay: StatusGemOverlay | null = null;
  private size: number;

  constructor(size: number) {
    super();
    this.size = size;
    this.spr = new Sprite();
    this.spr.anchor.set(0.5);
    this.addChild(this.spr);
  }

  /** 根据宝石类型换贴图 */
  setType(gemId: number, type: GemType): void {
    this.gemId = gemId;
    // 旧状态叠层先销毁（对象池复用时残留的补间/图层不能带到新宝石上）
    disposeStatusGemOverlay(this.statusOverlay);
    this.statusOverlay = null;

    const tex = textureFor(type);
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

    if (type.kind === 'special' && isStatusGemKind(type.spec.kind)) {
      this.statusOverlay = attachStatusGemOverlay(this, type.spec.kind, this.size);
    }
  }
}
