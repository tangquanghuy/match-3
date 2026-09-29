import { Assets, Texture } from 'pixi.js';
import { BaseColor, SPECIAL_MATCH_COLOR } from '@engine/types';
import type { GemType, SpecialGemKind, SpecialGemSpec } from '@engine/types';

// 通过 Vite 以 URL 形式引入资源：自动处理 base 路径与产物哈希（需求 21.3）
import redUrl from '@assets/gems/red.png';
import greenUrl from '@assets/gems/green.png';
import blueUrl from '@assets/gems/blue.png';
import yellowUrl from '@assets/gems/yellow.png';
import purpleUrl from '@assets/gems/purple.png';
import brownUrl from '@assets/gems/brown.png';
import skullUrl from '@assets/gems/skull.png';
// 特殊宝石（scripts/split_special_gems.mjs 从整图素材切割产出，256×256 @2x）
import doomSkullUrl from '@assets/gems/special/doomSkull.png';
import uberDoomSkullUrl from '@assets/gems/special/uberDoomSkull.png';
import bombUrl from '@assets/gems/special/bomb.png';
import webUrl from '@assets/gems/special/web.png';
import ghostUrl from '@assets/gems/special/ghost.png';
import wildcard2Url from '@assets/gems/special/wildcard2.png';
import wildcard3Url from '@assets/gems/special/wildcard3.png';
import wildcard4Url from '@assets/gems/special/wildcard4.png';
import wishUrl from '@assets/gems/special/wish.png';
import lightningColUrl from '@assets/gems/special/lightningCol.png';
import lightningRowUrl from '@assets/gems/special/lightningRow.png';
import hourglassUrl from '@assets/gems/special/hourglass.png';
// 波B 真贴图（GEMS-SEMANTICS-2 2026-09-17，美术交付抠图规格化 256×256 透明 PNG）。
// 六色族经 spec.color 取分色贴图（见 SIX_COLOR_URL）；石像鬼走 tier 通道（善/恶）。
import dragonGemBlueUrl from '@assets/gems/special/dragonGemBlue.png';
import dragonGemBrownUrl from '@assets/gems/special/dragonGemBrown.png';
import dragonGemGreenUrl from '@assets/gems/special/dragonGemGreen.png';
import dragonGemPurpleUrl from '@assets/gems/special/dragonGemPurple.png';
import dragonGemRedUrl from '@assets/gems/special/dragonGemRed.png';
import dragonGemYellowUrl from '@assets/gems/special/dragonGemYellow.png';
import giantGemBlueUrl from '@assets/gems/special/giantGemBlue.png';
import giantGemBrownUrl from '@assets/gems/special/giantGemBrown.png';
import giantGemGreenUrl from '@assets/gems/special/giantGemGreen.png';
import giantGemPurpleUrl from '@assets/gems/special/giantGemPurple.png';
import giantGemRedUrl from '@assets/gems/special/giantGemRed.png';
import giantGemYellowUrl from '@assets/gems/special/giantGemYellow.png';
// 灵力宝石：颜色必须由生产端指定；无色贴图仅供旧数据兼容渲染，不代表造石缺省色
import spiritGemUrl from '@assets/gems/special/spiritGem.png';
import spiritGemBlueUrl from '@assets/gems/special/spiritGemBlue.png';
import spiritGemBrownUrl from '@assets/gems/special/spiritGemBrown.png';
import spiritGemGreenUrl from '@assets/gems/special/spiritGemGreen.png';
import spiritGemPurpleUrl from '@assets/gems/special/spiritGemPurple.png';
import spiritGemRedUrl from '@assets/gems/special/spiritGemRed.png';
import spiritGemYellowUrl from '@assets/gems/special/spiritGemYellow.png';
import manaPotionGemBlueUrl from '@assets/gems/special/manaPotionGemBlue.png';
import manaPotionGemBrownUrl from '@assets/gems/special/manaPotionGemBrown.png';
import manaPotionGemGreenUrl from '@assets/gems/special/manaPotionGemGreen.png';
import manaPotionGemPurpleUrl from '@assets/gems/special/manaPotionGemPurple.png';
import manaPotionGemRedUrl from '@assets/gems/special/manaPotionGemRed.png';
import manaPotionGemYellowUrl from '@assets/gems/special/manaPotionGemYellow.png';
import candyGemBlueUrl from '@assets/gems/special/candyGemBlue.png';
import candyGemBrownUrl from '@assets/gems/special/candyGemBrown.png';
import candyGemGreenUrl from '@assets/gems/special/candyGemGreen.png';
import candyGemPurpleUrl from '@assets/gems/special/candyGemPurple.png';
import candyGemRedUrl from '@assets/gems/special/candyGemRed.png';
import candyGemYellowUrl from '@assets/gems/special/candyGemYellow.png';
import elementalStarUrl from '@assets/gems/special/elementalStar.png';
import umbralStarUrl from '@assets/gems/special/umbralStar.png';
import angelGemUrl from '@assets/gems/special/angelGem.png';
import daemonicPortalGemUrl from '@assets/gems/special/daemonicPortalGem.png';
import gargoyleGemGoodUrl from '@assets/gems/special/gargoyleGemGood.png';
import gargoyleGemEvilUrl from '@assets/gems/special/gargoyleGemEvil.png';
import stoneBlockUrl from '@assets/gems/special/stoneBlock.png';
import lycanthropyGemUrl from '@assets/gems/special/lycanthropyGem.png';
import decayGemUrl from '@assets/gems/special/decayGem.png';
import volcanoGemUrl from '@assets/gems/special/volcanoGem.png';
import trapGemUrl from '@assets/gems/special/trapGem.png';
import enchantedGemUrl from '@assets/gems/special/enchantedGem.png';
import mimicGemUrl from '@assets/gems/special/mimicGem.png';
// 状态宝石：独立生成美术，主体语义直接烘焙进宝石，不再复用六色底图。
import burningGemUrl from '@assets/gems/status/burningGem.png';
import freezeGemUrl from '@assets/gems/status/freezeGem.png';
import curseGemUrl from '@assets/gems/status/curseGem.png';
import bleedGemUrl from '@assets/gems/status/bleedGem.png';
import poisonGemUrl from '@assets/gems/status/poisonGem.png';
import deathMarkGemUrl from '@assets/gems/status/deathMarkGem.png';
import terrorGemUrl from '@assets/gems/status/terrorGem.png';
import entangleGemUrl from '@assets/gems/status/entangleGem.png';
import enrageGemUrl from '@assets/gems/status/enrageGem.png';
import submergeGemUrl from '@assets/gems/status/submergeGem.png';
import faerieFireGemUrl from '@assets/gems/status/faerieFireGem.png';
import stunGemUrl from '@assets/gems/status/stunGem.png';
import barrierGemUrl from '@assets/gems/status/barrierGem.png';
// 赃物宝石 8 级视觉链（tier 1-8）：纯物件，不使用宝石底座。
import copperCoinUrl from '@assets/gems/loot/copperCoin.png';
import silverCoinUrl from '@assets/gems/loot/silverCoin.png';
import goldCoinUrl from '@assets/gems/loot/goldCoin.png';
import moneyBagUrl from '@assets/gems/loot/moneyBag.png';
import brownChestUrl from '@assets/gems/loot/brownChest.png';
import greenChestUrl from '@assets/gems/loot/greenChest.png';
import redChestUrl from '@assets/gems/loot/redChest.png';
import vaultUrl from '@assets/gems/loot/vault.png';

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
 * 波B（GEMS-SEMANTICS-2 2026-09-17）真美术已交付：单色/星族/无色族直接入本表；
 * 六色族经 spec.color 取分色贴图（SIX_COLOR_URL，键 `${kind}:${color}`）；
 * 石像鬼按 tier 善/恶（GARGOYLE_TIER_URL）。textureFor 的归属色回退仅作加载失败兜底。
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
  // 波B 单色/星族/无色族真贴图
  spiritGem: spiritGemUrl, // 旧数据无归属色时的兼容贴图，非宝石创建默认色
  elementalStar: elementalStarUrl,
  umbralStar: umbralStarUrl,
  angelGem: angelGemUrl,
  daemonicPortalGem: daemonicPortalGemUrl,
  stoneBlock: stoneBlockUrl,
  lycanthropyGem: lycanthropyGemUrl,
  decayGem: decayGemUrl,
  volcanoGem: volcanoGemUrl,
  trapGem: trapGemUrl,
  enchantedGem: enchantedGemUrl,
  mimicGem: mimicGemUrl,
};

/**
 * 波B 六色族分色贴图（dragonGem/giantGem/spiritGem/manaPotionGem/candyGem），
 * 键 `${kind}:${color}`（见 specialKey）；spiritGem 另有供旧数据展示的无 color 兼容项（上表）。
 */
const SIX_COLOR_URL: Record<
  'dragonGem' | 'giantGem' | 'spiritGem' | 'manaPotionGem' | 'candyGem',
  Record<BaseColor, string>
> = {
  dragonGem: {
    [BaseColor.Red]: dragonGemRedUrl,
    [BaseColor.Green]: dragonGemGreenUrl,
    [BaseColor.Blue]: dragonGemBlueUrl,
    [BaseColor.Yellow]: dragonGemYellowUrl,
    [BaseColor.Purple]: dragonGemPurpleUrl,
    [BaseColor.Brown]: dragonGemBrownUrl,
  },
  giantGem: {
    [BaseColor.Red]: giantGemRedUrl,
    [BaseColor.Green]: giantGemGreenUrl,
    [BaseColor.Blue]: giantGemBlueUrl,
    [BaseColor.Yellow]: giantGemYellowUrl,
    [BaseColor.Purple]: giantGemPurpleUrl,
    [BaseColor.Brown]: giantGemBrownUrl,
  },
  spiritGem: {
    [BaseColor.Red]: spiritGemRedUrl,
    [BaseColor.Green]: spiritGemGreenUrl,
    [BaseColor.Blue]: spiritGemBlueUrl,
    [BaseColor.Yellow]: spiritGemYellowUrl,
    [BaseColor.Purple]: spiritGemPurpleUrl,
    [BaseColor.Brown]: spiritGemBrownUrl,
  },
  manaPotionGem: {
    [BaseColor.Red]: manaPotionGemRedUrl,
    [BaseColor.Green]: manaPotionGemGreenUrl,
    [BaseColor.Blue]: manaPotionGemBlueUrl,
    [BaseColor.Yellow]: manaPotionGemYellowUrl,
    [BaseColor.Purple]: manaPotionGemPurpleUrl,
    [BaseColor.Brown]: manaPotionGemBrownUrl,
  },
  candyGem: {
    [BaseColor.Red]: candyGemRedUrl,
    [BaseColor.Green]: candyGemGreenUrl,
    [BaseColor.Blue]: candyGemBlueUrl,
    [BaseColor.Yellow]: candyGemYellowUrl,
    [BaseColor.Purple]: candyGemPurpleUrl,
    [BaseColor.Brown]: candyGemBrownUrl,
  },
};

/** 石像鬼宝石 tier 通道贴图（wildcard 先例）：1=善 / 2=恶；未知 tier 回退善 */
const GARGOYLE_TIER_URL: Record<number, string> = {
  1: gargoyleGemGoodUrl,
  2: gargoyleGemEvilUrl,
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

/** 特殊宝石的贴图缓存键（通配/赃物/石像鬼带 tier；六色族带 spec.color） */
function specialKey(spec: SpecialGemSpec): string {
  if (spec.kind === 'wildcard') return `wildcard:${spec.tier ?? 2}`;
  if (spec.kind === 'bootyGem') return `bootyGem:${spec.tier ?? 3}`;
  if (spec.kind === 'gargoyleGem') return `gargoyleGem:${spec.tier === 2 ? 2 : 1}`;
  if (spec.color) return `${spec.kind}:${spec.color}`;
  return spec.kind;
}

/** 该特殊宝石是否拥有独立真贴图（波B 真美术已就位；GemSprite 据此跳过程序化占位叠层） */
export function hasOwnSpecialTexture(spec: SpecialGemSpec): boolean {
  return specialTex.has(specialKey(spec));
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
      const gargoyleEntries = Object.entries(GARGOYLE_TIER_URL) as [string, string][];
      const sixColorEntries: [string, string][] = [];
      for (const [kind, byColor] of Object.entries(SIX_COLOR_URL)) {
        for (const [color, url] of Object.entries(byColor)) {
          sixColorEntries.push([`${kind}:${color}`, url]);
        }
      }
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
        ...gargoyleEntries.map(async ([tier, url]) => {
          specialTex.set(`gargoyleGem:${tier}`, await Assets.load(url));
        }),
        ...sixColorEntries.map(async ([key, url]) => {
          specialTex.set(key, await Assets.load(url));
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
 * 波B 宝石真贴图缺失时（加载失败兜底）的静态回退基图（无 spec.color、也不在
 * SPECIAL_MATCH_COLOR 单色表的 kind）。星族/无色族按 GEMS-SEMANTICS-2 各节"基图"行登记；
 * 'skull' = 骷髅贴图打底。
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
    const own = specialTex.get(specialKey(type.spec));
    if (own) return own;
    // 真贴图缺失（如加载失败）时回退归属色贴图（六色族=spec.color；单色 kind=SPECIAL_MATCH_COLOR；
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
