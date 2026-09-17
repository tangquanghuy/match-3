import { Assets, Texture } from 'pixi.js';
import { BaseColor, SPECIAL_MATCH_COLOR } from '@engine/types';
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
import wildcard3Url from '../assets/gems/special/wildcard3.png';
import wildcard4Url from '../assets/gems/special/wildcard4.png';
import wishUrl from '../assets/gems/special/wish.png';
import lightningColUrl from '../assets/gems/special/lightningCol.png';
import lightningRowUrl from '../assets/gems/special/lightningRow.png';
import hourglassUrl from '../assets/gems/special/hourglass.png';
// 状态宝石：独立生成美术，主体语义直接烘焙进宝石，不再复用六色底图。
import burningGemUrl from '../assets/gems/status/burningGem.png';
import freezeGemUrl from '../assets/gems/status/freezeGem.png';
import curseGemUrl from '../assets/gems/status/curseGem.png';
import bleedGemUrl from '../assets/gems/status/bleedGem.png';
import poisonGemUrl from '../assets/gems/status/poisonGem.png';
import deathMarkGemUrl from '../assets/gems/status/deathMarkGem.png';
import terrorGemUrl from '../assets/gems/status/terrorGem.png';
import entangleGemUrl from '../assets/gems/status/entangleGem.png';
import enrageGemUrl from '../assets/gems/status/enrageGem.png';
import submergeGemUrl from '../assets/gems/status/submergeGem.png';
import faerieFireGemUrl from '../assets/gems/status/faerieFireGem.png';
import stunGemUrl from '../assets/gems/status/stunGem.png';
import barrierGemUrl from '../assets/gems/status/barrierGem.png';
// 赃物宝石 8 级视觉链（tier 1-8）：纯物件，不使用宝石底座。
import copperCoinUrl from '../assets/gems/loot/copperCoin.png';
import silverCoinUrl from '../assets/gems/loot/silverCoin.png';
import goldCoinUrl from '../assets/gems/loot/goldCoin.png';
import moneyBagUrl from '../assets/gems/loot/moneyBag.png';
import brownChestUrl from '../assets/gems/loot/brownChest.png';
import greenChestUrl from '../assets/gems/loot/greenChest.png';
import redChestUrl from '../assets/gems/loot/redChest.png';
import vaultUrl from '../assets/gems/loot/vault.png';

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
 * 状态搬运宝石族使用独立 256×256 透明贴图；GemSprite 上的程序化层只补环境光尘。
 * 波B（GEMS-SEMANTICS-2 2026-09-17）17 颗裁定免贴图：不入本表，
 * textureFor 回退归属色贴图（见 SPECIAL_FALLBACK_COLOR）+ GemSprite 程序化叠层占位。
 */
const SPECIAL_URL: Partial<Record<SpecialGemKind, string>> = {
  doomSkull: doomSkullUrl,
  uberDoomSkull: uberDoomSkullUrl,
  bomb: bombUrl,
  web: webUrl,
  lightningRow: lightningRowUrl,
  lightningCol: lightningColUrl,
  wish: wishUrl,
  hourglass: hourglassUrl,
  ghost: ghostUrl,
  burningGem: burningGemUrl,
  freezeGem: freezeGemUrl,
  curseGem: curseGemUrl,
  bleedGem: bleedGemUrl,
  poisonGem: poisonGemUrl,
  deathMarkGem: deathMarkGemUrl,
  terrorGem: terrorGemUrl,
  entangleGem: entangleGemUrl,
  enrageGem: enrageGemUrl,
  submergeGem: submergeGemUrl,
  faerieFireGem: faerieFireGemUrl,
  stunGem: stunGemUrl,
  barrierGem: barrierGemUrl,
};

/** 通配宝石按 tier（法力倍率）区分贴图（官方 2/3/4 三档，DECISIONS 四项拍板②）；未知 tier 回退 ×2 */
const WILDCARD_TIER_URL: Record<number, string> = {
  2: wildcard2Url,
  3: wildcard3Url,
  4: wildcard4Url,
};

/** 赃物价值链；未传 tier 时保持旧版“钱袋”外观。 */
const BOOTY_TIER_URL: Record<number, string> = {
  1: copperCoinUrl,
  2: silverCoinUrl,
  3: goldCoinUrl,
  4: moneyBagUrl,
  5: brownChestUrl,
  6: greenChestUrl,
  7: redChestUrl,
  8: vaultUrl,
};

const colorTex = new Map<BaseColor, Texture>();
const specialTex = new Map<string, Texture>();
let skullTex: Texture | null = null;
let loaded = false;
let loadPromise: Promise<void> | null = null;

/** 特殊宝石的贴图缓存键（通配和赃物链带 tier；赃物用户裁定默认金币档） */
function specialKey(kind: SpecialGemKind, tier?: number): string {
  if (kind === 'wildcard') return `wildcard:${tier ?? 2}`;
  if (kind === 'bootyGem') return `bootyGem:${tier ?? 3}`;
  return kind;
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
      const specialEntries = Object.entries(SPECIAL_URL) as [SpecialGemKind, string][];
      const wildcardEntries = Object.entries(WILDCARD_TIER_URL) as [string, string][];
      const bootyEntries = Object.entries(BOOTY_TIER_URL) as [string, string][];
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
        ...bootyEntries.map(async ([tier, url]) => {
          specialTex.set(`bootyGem:${tier}`, await Assets.load(url));
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

/**
 * 波B 免贴图宝石的静态回退基图（无 spec.color、也不在 SPECIAL_MATCH_COLOR 单色表的 kind）。
 * 星族/无色族按 GEMS-SEMANTICS-2 各节"基图"行登记；'skull' = 骷髅贴图打底。
 */
const SPECIAL_FALLBACK_COLOR: Partial<Record<SpecialGemKind, BaseColor | 'skull'>> = {
  elementalStar: BaseColor.Brown,
  umbralStar: BaseColor.Purple,
  angelGem: BaseColor.Yellow,
  daemonicPortalGem: BaseColor.Purple,
  gargoyleGem: 'skull',
  stoneBlock: BaseColor.Brown,
  trapGem: 'skull',
  mimicGem: BaseColor.Brown,
};

/** 取某宝石类型对应贴图；无对应贴图（如加载失败）返回 null，由调用方回退 */
export function textureFor(type: GemType): Texture | null {
  if (type.kind === 'color') return colorTex.get(type.color) ?? null;
  if (type.kind === 'skull') return skullTex;
  if (type.kind === 'special') {
    const own = specialTex.get(specialKey(type.spec.kind, type.spec.tier));
    if (own) return own;
    // 波B 免贴图宝石：回退归属色贴图（六色族=spec.color；单色 kind=SPECIAL_MATCH_COLOR；
    // 无色/星族=静态回退表），程序化叠层由 GemSprite 叠在其上（GEMS-SEMANTICS-2 §0 预算）
    const fallback = type.spec.color
      ?? SPECIAL_MATCH_COLOR[type.spec.kind]
      ?? SPECIAL_FALLBACK_COLOR[type.spec.kind];
    if (fallback === 'skull') return skullTex;
    if (fallback) return colorTex.get(fallback) ?? null;
    return null;
  }
  return null;
}
