/**
 * 序列帧图集（scripts/build_fx_atlas.py 生成）：每帧裁到自身非透明包围盒后装箱，
 * 像素与原 strip 一致，解码内存比统一外框的横向 strip 少约三分之一。
 *
 * 播放方式：外框元素保持原帧尺寸 frameW×frameH（定位/缩放/旋转/滤镜照旧挂在外框上），
 * 内层元素按帧切换位置、尺寸与 background-position（WAAPI 离散关键帧，随战斗倍速/暂停一起走）。
 */
import manifest from '@assets/fx/atlas/atlas.json';

/** [图集 x, 图集 y, 宽, 高, 帧内偏移 x, 帧内偏移 y]；全透明帧宽高为 0 */
type FrameRect = [number, number, number, number, number, number];

interface AtlasMeta {
  width: number;
  height: number;
  frameW: number;
  frameH: number;
  frames: FrameRect[];
}

export interface FxAtlas extends AtlasMeta {
  url: string;
}

const URLS: Record<string, string> = Object.fromEntries(
  Object.entries(import.meta.glob('@assets/fx/atlas/*.webp', { eager: true, query: '?url', import: 'default' }) as Record<string, string>)
    .map(([path, url]) => [path.slice(path.lastIndexOf('/') + 1, -'.webp'.length), url]),
);

const META = manifest as unknown as Record<string, AtlasMeta>;

export function fxAtlas(stem: string): FxAtlas {
  const meta = META[stem];
  const url = URLS[stem];
  if (!meta || !url) throw new Error(`缺少序列帧图集：${stem}`);
  return { ...meta, url };
}

function frameStyle([x, y, w, h, ox, oy]: FrameRect): Record<string, string> {
  return { left: `${ox}px`, top: `${oy}px`, width: `${w}px`, height: `${h}px`, backgroundPosition: `${-x}px ${-y}px` };
}

const EMPTY = frameStyle([0, 0, 0, 0, 0, 0]);

/** 在外框里挂内层帧元素；返回内层与手动切帧函数（时间轴驱动的特效用） */
export function mountFxFrames(host: HTMLElement, atlas: FxAtlas): { layer: HTMLElement; setFrame: (index: number) => void } {
  const layer = document.createElement('div');
  layer.style.cssText = [
    'position:absolute', 'pointer-events:none',
    `background-image:url('${atlas.url}')`,
    `background-size:${atlas.width}px ${atlas.height}px`,
    'background-repeat:no-repeat',
  ].join(';');
  const setFrame = (index: number): void => {
    Object.assign(layer.style, frameStyle(atlas.frames[index]!));
  };
  setFrame(0);
  host.appendChild(layer);
  return { layer, setFrame };
}

/**
 * 逐帧播放（等价于原先 CSS `steps(frames)`：每帧停留 duration/frames，结束后停在空白帧）。
 * iterations = Infinity 时循环（状态持续层）。
 */
export function playFxFrames(
  layer: HTMLElement,
  atlas: FxAtlas,
  timing: { duration: number; delay?: number; iterations?: number },
): Animation {
  const n = atlas.frames.length;
  const keyframes: Keyframe[] = atlas.frames.map((rect, i) => ({ offset: i / n, easing: 'step-end', ...frameStyle(rect) }));
  keyframes.push({ offset: 1, ...EMPTY });
  return layer.animate(keyframes, {
    duration: timing.duration,
    delay: timing.delay ?? 0,
    iterations: timing.iterations ?? 1,
    fill: 'forwards',
  });
}
