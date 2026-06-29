import { Assets, Texture } from 'pixi.js';
import { BaseColor } from '@engine/types';
import type { GemType } from '@engine/types';

// 通过 Vite 以 URL 形式引入资源：自动处理 base 路径与产物哈希（需求 21.3）
import redUrl from '../assets/gems/red.png';
import greenUrl from '../assets/gems/green.png';
import blueUrl from '../assets/gems/blue.png';
import yellowUrl from '../assets/gems/yellow.png';
import purpleUrl from '../assets/gems/purple.png';
import brownUrl from '../assets/gems/brown.png';
import skullUrl from '../assets/gems/skull.png';

const COLOR_URL: Record<BaseColor, string> = {
  [BaseColor.Red]: redUrl,
  [BaseColor.Green]: greenUrl,
  [BaseColor.Blue]: blueUrl,
  [BaseColor.Yellow]: yellowUrl,
  [BaseColor.Purple]: purpleUrl,
  [BaseColor.Brown]: brownUrl,
};

const colorTex = new Map<BaseColor, Texture>();
let skullTex: Texture | null = null;
let loaded = false;

/**
 * 预加载全部宝石贴图（需求 21.4）。
 * 失败不抛出：GemSprite 会回退到程序化绘制，保证可玩。
 */
export async function loadGemTextures(): Promise<void> {
  try {
    const entries = Object.entries(COLOR_URL) as [BaseColor, string][];
    await Promise.all([
      ...entries.map(async ([color, url]) => {
        colorTex.set(color, await Assets.load(url));
      }),
      (async () => {
        skullTex = await Assets.load(skullUrl);
      })(),
    ]);
    loaded = true;
  } catch (err) {
    console.warn('宝石贴图加载失败，回退到程序化绘制：', err);
    loaded = false;
  }
}

export function gemTexturesReady(): boolean {
  return loaded;
}

/** 取某宝石类型对应贴图；无对应贴图（如 special）返回 null，由调用方回退 */
export function textureFor(type: GemType): Texture | null {
  if (type.kind === 'color') return colorTex.get(type.color) ?? null;
  if (type.kind === 'skull') return skullTex;
  return null;
}
