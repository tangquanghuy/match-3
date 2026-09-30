/**
 * 封面页资源预热：在登录/进游戏之前，把 game 入口的 JS/CSS 与首屏、战斗常用图下载进浏览器 HTTP 缓存。
 *
 * 清单 `/preload-manifest.json` 由构建插件生成（vite.config.ts · deployManifest）；
 * 建角立绘与向导素材优先加载；开发服务器无清单时仍预载首屏素材。生产清单或任一资源失败时保持入口关闭。
 */
import { DEFAULT_CHARACTER_PORTRAITS } from '../meta/state/character';
import guideArt from '@assets/meta/tutorial/guide.webp';
import frameArt from '@assets/meta/tutorial/frame.webp';
import battleLoadingArt from '@assets/meta/tutorial/battle-loading.webp';

/** 独立于构建清单，封面挂载即下载；登录回调后继续复用 HTTP 缓存。 */
const PRIORITY_IMAGES = [...Object.values(DEFAULT_CHARACTER_PORTRAITS), frameArt, guideArt, battleLoadingArt];

export interface PreloadProgress {
  done: number;
  total: number;
  failed: number;
}

interface Manifest {
  code?: string[];
  images?: string[];
}

const CONCURRENCY = 6;
const ITEM_TIMEOUT_MS = 20_000;

async function fetchManifest(): Promise<string[]> {
  const res = await fetch(`${import.meta.env.BASE_URL}preload-manifest.json`, {
    cache: 'no-cache', signal: AbortSignal.timeout(ITEM_TIMEOUT_MS),
  });
  if (!res.ok || !(res.headers.get('content-type') ?? '').includes('json')) {
    if (import.meta.env.DEV) return [];
    throw new Error('预加载清单读取失败');
  }
  const manifest = (await res.json()) as Manifest;
  if (!Array.isArray(manifest.code) || !manifest.code.length || !Array.isArray(manifest.images)
    || [...manifest.code, ...manifest.images].some(url => typeof url !== 'string' || !url.startsWith('/') || url.startsWith('//'))) {
    throw new Error('预加载清单格式错误');
  }
  return [...new Set([...manifest.code, ...manifest.images])];
}

// 持有已解码的首屏图片，进入时无需再次等待解码。
const decodedImages: HTMLImageElement[] = [];
async function decodePriority(url: string, signal: AbortSignal): Promise<void> {
  if (typeof Image === 'undefined' || !PRIORITY_IMAGES.includes(url)) return;
  const image = new Image();
  image.referrerPolicy = 'no-referrer';
  image.src = url;
  await new Promise<void>((resolve, reject) => {
    const aborted = (): void => reject(new Error('图片解码超时'));
    signal.addEventListener('abort', aborted, { once: true });
    if (signal.aborted) aborted();
    void image.decode().then(resolve, reject).finally(() => signal.removeEventListener('abort', aborted));
  });
  decodedImages.push(image);
}

/** 完整读完响应体才算进了缓存；超时中止 */
async function warm(url: string): Promise<boolean> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ITEM_TIMEOUT_MS);
  try {
    const res = await fetch(url, { signal: controller.signal, credentials: 'same-origin' });
    if (!res.ok) return false;
    await res.arrayBuffer();
    await decodePriority(url, controller.signal);
    return true;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

let running: Promise<PreloadProgress> | null = null;
const listeners = new Set<(p: PreloadProgress) => void>();
let latest: PreloadProgress = { done: 0, total: 0, failed: 0 };

/** 订阅进度（立即回调一次当前值）；返回取消订阅函数 */
export function onPreloadProgress(fn: (p: PreloadProgress) => void): () => void {
  listeners.add(fn);
  fn(latest);
  return () => listeners.delete(fn);
}

/** 启动预热（重复调用复用同一任务）；resolve 时全部项已完成或失败 */
export function startPreload(): Promise<PreloadProgress> {
  running ??= (async () => {
    // 不等待登录查询或清单返回，立即开始下载建角立绘与向导图片。
    const priority = PRIORITY_IMAGES.map((url) => warm(url));
    let manifestFailed = false;
    const urls = (await fetchManifest().catch(() => { manifestFailed = true; return []; }))
      .filter((url) => !PRIORITY_IMAGES.includes(url));
    const progress: PreloadProgress = { done: 0, total: urls.length + priority.length, failed: manifestFailed ? 1 : 0 };
    const emit = (): void => {
      latest = { ...progress };
      listeners.forEach((fn) => fn(latest));
    };
    emit();
    const tasks = [...priority.map((task) => () => task), ...urls.map((url) => () => warm(url))];
    let cursor = 0;
    const worker = async (): Promise<void> => {
      while (cursor < tasks.length) {
        const ok = await tasks[cursor++]!();
        if (!ok) progress.failed++;
        progress.done++;
        emit();
      }
    };
    await Promise.all(Array.from({ length: CONCURRENCY }, worker));
    return latest;
  })();
  return running;
}

/** 仅失败任务可重试；成功项由 HTTP 缓存复用。 */
export function retryPreload(): Promise<PreloadProgress> {
  if (latest.done >= latest.total && latest.failed > 0) {
    running = null;
    decodedImages.length = 0;
  }
  return startPreload();
}
