import { Assets, Texture } from 'pixi.js';
import { BaseColor } from '@engine/types';
import type { GemType, SpecialGemKind } from '@engine/types';

// 通过 Vite 以 URL 形式引入资源：自动处理 base 路径与产物哈希（需求 21.3）
import redUrl from '../assets/gems/red.png';
import greenUrl from '../assets/gems/green.png';
import blueUrl from '../assets/gems/blue.png';
import yellowUrl from '../assets/gems/yellow.png';
import purpleUrl from '../assets/gems/purple.png';
import brownUrl from '../assets/gems/brown.png';
import skullUrl from '../assets/gems/skull.png';
// 特殊宝石（scripts/split_special_gems.mjs 从整图素材切割产出，256×256 @2x）
import doomSkullUrl from '../assets/gems/special/doomSkull.png';
import uberDoomSkullUrl from '../assets/gems/special/uberDoomSkull.png';
import bombUrl from '../assets/gems/special/bomb.png';
import webUrl from '../assets/gems/special/web.png';
import ghostUrl from '../assets/gems/special/ghost.png';
import wildcard2Url from '../assets/gems/special/wildcard2.png';
import wildcard4Url from '../assets/gems/special/wildcard4.png';
import wishUrl from '../assets/gems/special/wish.png';
import lightningColUrl from '../assets/gems/special/lightningCol.png';
import lightningRowUrl from '../assets/gems/special/lightningRow.png';
import hourglassUrl from '../assets/gems/special/hourglass.png';

const COLOR_URL: Record<BaseColor, string> = {
  [BaseColor.Red]: redUrl,
  [BaseColor.Green]: greenUrl,
  [BaseColor.Blue]: blueUrl,
  [BaseColor.Yellow]: yellowUrl,
  [BaseColor.Purple]: purpleUrl,
  [BaseColor.Brown]: brownUrl,
};

/**
 * 特殊宝石贴图（按 kind；通配按倍率分两张，见 WILDCARD_TIER_URL）。
 * 状态搬运宝石族（GEMS-SEMANTICS-2 波A，用户裁定免贴图）：基图直接复用归属色
 * 宝石贴图（deathMarkGem 无色 → 骷髅贴图打底），状态主题表现由 GemSprite 的
 * 程序化叠层绘制，引擎与贴图管线零特殊分支。
 */
const SPECIAL_URL: Record<Exclude<SpecialGemKind, 'wildcard'>, string> = {
  doomSkull: doomSkullUrl,
  uberDoomSkull: uberDoomSkullUrl,
  bomb: bombUrl,
  web: webUrl,
  lightningRow: lightningRowUrl,
  lightningCol: lightningColUrl,
  wish: wishUrl,
  hourglass: hourglassUrl,
  ghost: ghostUrl,
  burningGem: redUrl,
  freezeGem: blueUrl,
  curseGem: brownUrl,
  bleedGem: purpleUrl,
  poisonGem: greenUrl,
  deathMarkGem: skullUrl,
  terrorGem: purpleUrl,
  entangleGem: greenUrl,
  enrageGem: redUrl,
  submergeGem: blueUrl,
  faerieFireGem: greenUrl,
  stunGem: brownUrl,
  barrierGem: yellowUrl,
};

/** 通配宝石按 tier（法力倍率）区分贴图；未知 tier 回退 ×2 */
const WILDCARD_TIER_URL: Record<number, string> = {
  2: wildcard2Url,
  4: wildcard4Url,
};

const colorTex = new Map<BaseColor, Texture>();
const specialTex = new Map<string, Texture>();
let skullTex: Texture | null = null;
let loaded = false;
let loadPromise: Promise<void> | null = null;

/** 特殊宝石的贴图缓存键（通配带 tier） */
function specialKey(kind: SpecialGemKind, tier?: number): string {
  return kind === 'wildcard' ? `wildcard:${tier ?? 2}` : kind;
}

/**
 * 预加载全部宝石贴图（需求 21.4）。
 * 失败不抛出：GemSprite 会回退到程序化绘制，保证可玩；重复调用复用同一任务。
 */
export function loadGemTextures(): Promise<void> {
  if (loaded) return Promise.resolve();
  if (loadPromise) return loadPromise;
  loadPromise = (async () => {
    try {
      const colorEntries = Object.entries(COLOR_URL) as [BaseColor, string][];
      const specialEntries = Object.entries(SPECIAL_URL) as [Exclude<SpecialGemKind, 'wildcard'>, string][];
      const wildcardEntries = Object.entries(WILDCARD_TIER_URL) as [string, string][];
      await Promise.all([
        ...colorEntries.map(async ([color, url]) => {
          colorTex.set(color, await Assets.load(url));
        }),
        ...specialEntries.map(async ([kind, url]) => {
          specialTex.set(kind, await Assets.load(url));
        }),
        ...wildcardEntries.map(async ([tier, url]) => {
          specialTex.set(`wildcard:${tier}`, await Assets.load(url));
        }),
        (async () => {
          skullTex = await Assets.load(skullUrl);
        })(),
      ]);
      loaded = true;
    } catch (err) {
      console.warn('宝石贴图加载失败，回退到程序化绘制：', err);
      loaded = false;
    } finally {
      loadPromise = null;
    }
  })();
  return loadPromise;
}

export function gemTexturesReady(): boolean {
  return loaded;
}

/** 取某宝石类型对应贴图；无对应贴图（如加载失败）返回 null，由调用方回退 */
export function textureFor(type: GemType): Texture | null {
  if (type.kind === 'color') return colorTex.get(type.color) ?? null;
  if (type.kind === 'skull') return skullTex;
  if (type.kind === 'special') return specialTex.get(specialKey(type.spec.kind, type.spec.tier)) ?? null;
  return null;
}
