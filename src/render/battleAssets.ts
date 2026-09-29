/**
 * 战斗资源预载：进战斗前把本场可能用到的全部素材下载并解码完，战斗中不再有任何懒加载。
 *
 *  - 宝石贴图（Pixi）、全部序列帧特效 / 状态徽印 / 状态图标 / 回合 HUD、双方立绘：下载 + 解码；
 *  - 全部战斗音效：下载 + 解码进 audioBank；
 *  - 全部解说：下载编码字节进 audioBank；
 *  - 本场战斗曲池与结算曲：完整下载进 HTTP 缓存（BGM 由 <audio> 流式播放，结算曲由 ResultMusic 解码）。
 *
 * 单项网络失败会重试；重试后仍失败则整体 reject，由加载页报错并让玩家重试，绝不带着缺失的资源开战。
 * 已完成的项在本页面会话内记住，后续战斗只补缺。
 */
import type { BattleRequest } from '@session/index';
import { MUSIC_TRACKS, musicForBattle, type MusicTrack } from '../audio/MusicCatalog';
import victoryUrl from '@assets/audio/result/victory.mp3?url';
import defeatUrl from '@assets/audio/result/defeat.mp3?url';
import { BATTLE_SFX_URLS } from './AudioManager';
import { loadDecodedAudio, loadEncodedAudio } from './audioBank';
import { gemTextureUrls, loadGemTextures } from './gemTextures';
import { NARRATION_CLIPS } from './NarrationCatalog';

const glob = (files: Record<string, string>): string[] => Object.values(files);

/** 序列帧 strip、状态叠层与状态徽印（fx/ 与 fx/status-emblems/） */
const FX_IMAGES = glob(import.meta.glob('@assets/fx/**/*.webp', { eager: true, query: '?url', import: 'default' }) as Record<string, string>);
const STATUS_ICONS = glob(import.meta.glob('@assets/status-icons/*.png', { eager: true, query: '?url', import: 'default' }) as Record<string, string>);
const UI_IMAGES = glob(import.meta.glob('@assets/ui/*.png', { eager: true, query: '?url', import: 'default' }) as Record<string, string>);

const CONCURRENCY = 6;
const ATTEMPTS = 3;
const ITEM_TIMEOUT_MS = 30_000;

export type BattleAssetKind = 'texture' | 'image' | 'sound' | 'voice' | 'music';

export const BATTLE_ASSET_LABEL: Record<BattleAssetKind, string> = {
  texture: '宝石贴图',
  image: '立绘与特效',
  sound: '战斗音效',
  voice: '战斗解说',
  music: '战斗音乐',
};

export interface BattleAssetProgress {
  done: number;
  total: number;
  kind: BattleAssetKind;
}

export class BattleAssetError extends Error {
  constructor(readonly failed: string[]) {
    super(`有 ${failed.length} 项战斗资源加载失败`);
    this.name = 'BattleAssetError';
  }
}

interface Task { kind: BattleAssetKind; key: string; run: () => Promise<void> }

/** 已完成的项（按 key）；解码后的图片保留引用，避免被回收后再次解码 */
const completed = new Set<string>();
const images = new Map<string, HTMLImageElement>();

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

function withTimeout<T>(promise: Promise<T>, label: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => reject(new Error(`超时：${label}`)), ITEM_TIMEOUT_MS);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

async function loadImage(url: string): Promise<void> {
  const img = new Image();
  img.decoding = 'async';
  img.src = url;
  await img.decode();
  if (!img.naturalWidth) throw new Error(`图片为空：${url}`);
  images.set(url, img);
}

async function warmHttp(url: string): Promise<void> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}：${url}`);
  await res.arrayBuffer();
}

function battleMusic(request: BattleRequest): string[] {
  const pool = MUSIC_TRACKS[musicForBattle(request)];
  const tracks = typeof pool === 'string' ? [pool] : (pool ?? []).map((t: MusicTrack) => t.url);
  return [...tracks, victoryUrl, defeatUrl];
}

function tasksFor(request: BattleRequest): Task[] {
  const portraits = [...request.playerTeam, ...request.enemyTeam]
    .map((u) => u.portraitUrl)
    .filter((u): u is string => !!u);
  const imageUrls = [...new Set([...portraits, ...FX_IMAGES, ...STATUS_ICONS, ...UI_IMAGES, ...gemTextureUrls()])];
  const tasks: Task[] = [
    { kind: 'texture', key: 'texture:gems', run: () => loadGemTextures() },
    ...imageUrls.map((url): Task => ({ kind: 'image', key: `image:${url}`, run: () => loadImage(url) })),
    ...BATTLE_SFX_URLS.map((url): Task => ({ kind: 'sound', key: `sound:${url}`, run: () => loadDecodedAudio(url) })),
    ...[...new Set(NARRATION_CLIPS.map((c) => c.url))].map((url): Task => ({ kind: 'voice', key: `voice:${url}`, run: () => loadEncodedAudio(url) })),
    ...[...new Set(battleMusic(request))].map((url): Task => ({ kind: 'music', key: `music:${url}`, run: () => warmHttp(url) })),
  ];
  return tasks.filter((t) => !completed.has(t.key));
}

async function runWithRetry(task: Task): Promise<boolean> {
  for (let attempt = 1; attempt <= ATTEMPTS; attempt++) {
    try {
      await withTimeout(task.run(), task.key);
      completed.add(task.key);
      return true;
    } catch (error) {
      if (attempt === ATTEMPTS) {
        console.error('战斗资源加载失败', task.key, error);
        return false;
      }
      await sleep(400 * attempt);
    }
  }
  return false;
}

/**
 * 预载本场战斗全部资源；全部成功才 resolve。
 * 调试慢网：localStorage `gems.debug.slowLoad = <毫秒>` 为每项追加延迟。
 */
export async function preloadBattleAssets(
  request: BattleRequest,
  onProgress?: (progress: BattleAssetProgress) => void,
): Promise<void> {
  const tasks = tasksFor(request);
  const delay = slowDelay();
  const failed: string[] = [];
  let cursor = 0;
  let done = 0;
  const worker = async (): Promise<void> => {
    while (cursor < tasks.length) {
      const task = tasks[cursor++]!;
      if (delay) await sleep(delay);
      if (!(await runWithRetry(task))) failed.push(task.key);
      done++;
      onProgress?.({ done, total: tasks.length, kind: task.kind });
    }
  };
  await Promise.all(Array.from({ length: CONCURRENCY }, worker));
  if (failed.length) throw new BattleAssetError(failed);
}

function slowDelay(): number {
  try {
    const ms = Number(localStorage.getItem('gems.debug.slowLoad'));
    return Number.isFinite(ms) && ms > 0 ? Math.min(ms, 10_000) : 0;
  } catch {
    return 0;
  }
}
