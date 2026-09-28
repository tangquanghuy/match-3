/**
 * 世界地图迷雾层（GoW 4.5：只看得见已开放与「下一批」王国，其余大陆藏在云雾里）。
 *
 * 实现：地图世界层里一张 1/4 分辨率的 canvas，先铺文生图云雾纹理（src/assets/meta/kingdom/map-fog.webp）
 * 与一层夜色压暗，再用 destination-out 的径向渐变在王国处「擦」出洞：
 *   - 已开放：大洞、完全清晰；
 *   - 已探明（未来 3 级内开放）：小洞、半透明，能看见剪影与门槛；
 *   - 迷雾中：不擦，节点也不渲染。
 * 新开放的王国（上次看地图之后才解锁的）洞口从 0 展开，做一次「驱散迷雾」的揭幕。
 */
import { kingdomArt } from '../shell/artAssets';

export interface FogHole {
  /** 地图百分比坐标 */
  x: number;
  y: number;
  kind: 'open' | 'scouted';
  /** true = 本次揭幕（洞口动画展开） */
  reveal?: boolean;
}

/** 画布分辨率相对地图世界的比例（地图 5440×2920 → 1360×730） */
const SCALE = 0.25;
/** 洞口半径（地图世界像素） */
const OPEN_R = 440;
const SCOUT_R = 280;
const REVEAL_MS = 1600;

let fogImage: Promise<HTMLImageElement | null> | null = null;
function loadFogImage(): Promise<HTMLImageElement | null> {
  if (fogImage) return fogImage;
  const url = kingdomArt('map-fog');
  fogImage = !url
    ? Promise.resolve(null)
    : new Promise((resolve) => {
        const img = new Image();
        img.onload = () => resolve(img);
        img.onerror = () => resolve(null);
        img.src = url;
      });
  return fogImage;
}

export class MapFog {
  private readonly ctx: CanvasRenderingContext2D | null;
  private holes: FogHole[] = [];
  private raf = 0;
  private disposed = false;

  constructor(private readonly canvas: HTMLCanvasElement, worldW: number, worldH: number) {
    canvas.width = Math.round(worldW * SCALE);
    canvas.height = Math.round(worldH * SCALE);
    this.ctx = canvas.getContext('2d');
  }

  /** 设置洞口并绘制；有 reveal 的洞口做展开动画。返回动画结束的 Promise。 */
  async render(holes: FogHole[], reduceMotion: boolean): Promise<void> {
    this.holes = holes;
    const img = await loadFogImage();
    if (this.disposed || !this.ctx) return;
    cancelAnimationFrame(this.raf);
    const animated = !reduceMotion && holes.some((h) => h.reveal);
    if (!animated) {
      this.paint(img, 1);
      return;
    }
    const start = performance.now();
    await new Promise<void>((done) => {
      const step = (now: number) => {
        if (this.disposed) return done();
        const p = Math.min(1, (now - start) / REVEAL_MS);
        // 先快后慢，像雾被风吹散
        this.paint(img, 1 - Math.pow(1 - p, 3));
        if (p < 1) this.raf = requestAnimationFrame(step);
        else done();
      };
      this.raf = requestAnimationFrame(step);
    });
  }

  private paint(img: HTMLImageElement | null, revealProgress: number): void {
    const ctx = this.ctx!;
    const { width: w, height: h } = this.canvas;
    ctx.globalCompositeOperation = 'source-over';
    ctx.clearRect(0, 0, w, h);
    if (img) {
      // 纹理不是无缝图：整张 cover 铺满（不平铺，避免接缝）
      const scale = Math.max(w / img.width, h / img.height);
      const dw = img.width * scale;
      const dh = img.height * scale;
      ctx.drawImage(img, (w - dw) / 2, (h - dh) / 2, dw, dh);
    } else {
      ctx.fillStyle = '#8f99a8';
      ctx.fillRect(0, 0, w, h);
    }
    // 夜色压暗 + 暖色边缘，让云雾与地图色调衔接
    ctx.fillStyle = 'rgba(18, 20, 34, .34)';
    ctx.fillRect(0, 0, w, h);
    // 远处更浓：以地图中心为圆心的径向加深（未探明的大陆边缘几乎不透光）
    const edge = ctx.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.2, w / 2, h / 2, Math.max(w, h) * 0.75);
    edge.addColorStop(0, 'rgba(10, 12, 22, 0)');
    edge.addColorStop(1, 'rgba(10, 12, 22, .45)');
    ctx.fillStyle = edge;
    ctx.fillRect(0, 0, w, h);

    ctx.globalCompositeOperation = 'destination-out';
    for (const hole of this.holes) {
      const cx = (hole.x / 100) * w;
      const cy = (hole.y / 100) * h;
      const baseR = (hole.kind === 'open' ? OPEN_R : SCOUT_R) * SCALE;
      const r = hole.reveal ? baseR * Math.max(0.001, revealProgress) : baseR;
      const clear = hole.kind === 'open' ? 1 : 0.72;
      const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
      g.addColorStop(0, `rgba(0,0,0,${clear})`);
      g.addColorStop(hole.kind === 'open' ? 0.55 : 0.4, `rgba(0,0,0,${clear})`);
      g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalCompositeOperation = 'source-over';
  }

  dispose(): void {
    this.disposed = true;
    cancelAnimationFrame(this.raf);
  }
}

const SEEN_KEY = 'gems.meta.fogSeenLevel';

/** 上次在地图上「看过」的冒险者等级（揭幕只播新开放的王国）；首次进入返回 null */
export function fogSeenLevel(): number | null {
  try {
    const raw = localStorage.getItem(SEEN_KEY);
    const n = raw == null ? NaN : Number(raw);
    return Number.isFinite(n) ? n : null;
  } catch {
    return null;
  }
}

export function markFogSeen(level: number): void {
  try {
    localStorage.setItem(SEEN_KEY, String(level));
  } catch {
    /* 隐私模式等：揭幕每次都不播，不影响功能 */
  }
}
