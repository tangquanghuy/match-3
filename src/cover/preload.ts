/**
 * 封面页资源预热：在登录/进游戏之前，把 game 入口的 JS/CSS 与首屏、战斗常用图下载进浏览器 HTTP 缓存。
 *
 * 清单 `/preload-manifest.json` 由构建插件生成（vite.config.ts · deployManifest）；
 * 向导素材优先加载；开发服务器或清单缺失时仍预载这些首屏素材。单项失败不阻塞进入游戏。
 */
import guideArt from '@assets/meta/tutorial/guide.webp';
import frameArt from '@assets/meta/tutorial/frame.webp';
import battleLoadingArt from '@assets/meta/tutorial/battle-loading.webp';

/** 独立于构建清单，封面挂载即下载；登录回调后继续复用 HTTP 缓存。 */
const PRIORITY_IMAGES = [frameArt, guideArt, battleLoadingArt];

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
  try {
    const res = await fetch(`${import.meta.env.BASE_URL}preload-manifest.json`, { cache: 'no-cache' });
    if (!res.ok || !(res.headers.get('content-type') ?? '').includes('json')) return [];
    const manifest = (await res.json()) as Manifest;
    // JS/CSS 排前面：进游戏第一步就要用
    return [...new Set([...(manifest.code ?? []), ...(manifest.images ?? [])])];
  } catch {
    return [];
  }
}

/** 完整读完响应体才算进了缓存；超时中止 */
async function warm(url: string): Promise<boolean> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ITEM_TIMEOUT_MS);
  try {
    const res = await fetch(url, { signal: controller.signal, credentials: 'same-origin' });
    if (!res.ok) return false;
    await res.arrayBuffer();
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
    // 不等待登录查询或清单返回，立即开始下载向导图片。
    const priority = PRIORITY_IMAGES.map((url) => warm(url));
    const urls = (await fetchManifest()).filter((url) => !PRIORITY_IMAGES.includes(url));
    const progress: PreloadProgress = { done: 0, total: urls.length + priority.length, failed: 0 };
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
