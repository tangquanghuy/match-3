/**
 * 开箱演出贴图补间播放器（canvas）。
 *
 * 贴图来自文生图（scripts/art-gen/summonFx.mjs）：黑底白光 / 黑底彩光。加载时按亮度转成 alpha
 * （黑 = 透明），白光贴图同时按稀有度着色，并把最亮处推向白色保留炽白核心——一张图多档复用。
 * 动画只做位置 / 尺寸 / 旋转 / 透明度补间，加色混合（lighter）叠加；复杂效果靠贴图本身，不靠 CSS。
 */

export type FxTex = 'rays' | 'ring' | 'flare' | 'veil' | 'gather' | 'stardust' | 'plumes';

const TEX_SRC: Record<FxTex, string> = {
  rays: '/meta/assets/fx/summon/fx-rays.webp',
  ring: '/meta/assets/fx/summon/fx-ring.webp',
  flare: '/meta/assets/fx/summon/fx-flare.webp',
  veil: '/meta/assets/fx/summon/fx-veil.webp',
  gather: '/meta/assets/fx/summon/fx-gather.webp',
  stardust: '/meta/assets/fx/summon/fx-stardust.webp',
  plumes: '/meta/assets/fx/summon/fx-plumes.webp',
};

const imageCache = new Map<string, Promise<HTMLImageElement>>();

export function loadImage(src: string): Promise<HTMLImageElement> {
  let p = imageCache.get(src);
  if (!p) {
    p = new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = reject;
      img.src = src;
    });
    imageCache.set(src, p);
  }
  return p;
}

function hexRgb(hex: string): [number, number, number] {
  const h = hex.replace('#', '');
  const v = parseInt(h.length === 3 ? h.split('').map((c) => c + c).join('') : h, 16);
  return [(v >> 16) & 255, (v >> 8) & 255, v & 255];
}

const processed = new Map<string, HTMLCanvasElement>();

/**
 * 贴图预处理（结果缓存）：
 * - mode 'additive'：黑底贴图，alpha = 亮度；
 * - mode 'alpha'：已带透明通道的序列帧，保留原 alpha。
 * 给了 tint 就按亮度着色（越亮越接近白），否则保留原色。
 */
export function prepareTexture(img: HTMLImageElement, key: string, mode: 'additive' | 'alpha', tint?: string): HTMLCanvasElement {
  const cacheKey = `${key}|${mode}|${tint ?? ''}`;
  const hit = processed.get(cacheKey);
  if (hit) return hit;
  const c = document.createElement('canvas');
  c.width = img.naturalWidth;
  c.height = img.naturalHeight;
  const g = c.getContext('2d', { willReadFrequently: true })!;
  g.drawImage(img, 0, 0);
  const data = g.getImageData(0, 0, c.width, c.height);
  const d = data.data;
  const [tr, tg, tb] = tint ? hexRgb(tint) : [0, 0, 0];
  for (let i = 0; i < d.length; i += 4) {
    const r = d[i]!, gg = d[i + 1]!, b = d[i + 2]!;
    const m = Math.max(r, gg, b);
    const a = mode === 'additive' ? m : d[i + 3]!;
    if (a < 3 || m < 3) { d[i + 3] = 0; continue; }
    if (tint) {
      const hot = Math.pow(m / 255, 3.2) * 0.9;
      d[i] = tr + (255 - tr) * hot;
      d[i + 1] = tg + (255 - tg) * hot;
      d[i + 2] = tb + (255 - tb) * hot;
    } else if (mode === 'additive') {
      d[i] = (r * 255) / m;
      d[i + 1] = (gg * 255) / m;
      d[i + 2] = (b * 255) / m;
    }
    d[i + 3] = a;
  }
  g.putImageData(data, 0, 0);
  processed.set(cacheKey, c);
  return c;
}

export type Ease = 'linear' | 'out' | 'in' | 'inOut';

const EASE: Record<Ease, (t: number) => number> = {
  linear: (t) => t,
  out: (t) => 1 - Math.pow(1 - t, 3),
  in: (t) => t * t * t,
  inOut: (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2),
};

export interface Sprite {
  /** 画到哪一层 canvas（构造时注册） */
  layer: string;
  /** 贴图；缺省时画程序化径向辉光（闪白 / 蓄力光）。 */
  tex?: FxTex;
  /** 白光贴图着色；彩色贴图不传 */
  tint?: string;
  /** 程序化辉光的颜色（tex 缺省时生效） */
  glow?: string;
  /** 层内局部 CSS 像素 */
  x: number;
  y: number;
  delay?: number;
  dur: number;
  /** 直径（CSS 像素）起止 */
  size: [number, number];
  /** 旋转（弧度）起止 */
  rot?: [number, number];
  /** 透明度关键帧，均匀分布在 dur 上 */
  alpha: number[];
  ease?: Ease;
  /** 循环播放（slam 常驻光环），需 clear 结束 */
  loop?: boolean;
  /** 水平压扁比（光环透视用），缺省 1 */
  squash?: number;
}

interface Live {
  s: Sprite;
  t0: number;
  src: CanvasImageSource | null;
}

function sampleAlpha(keys: number[], t: number): number {
  if (keys.length === 1) return keys[0]!;
  const f = t * (keys.length - 1);
  const i = Math.min(keys.length - 2, Math.floor(f));
  const k = f - i;
  return keys[i]! + (keys[i + 1]! - keys[i]!) * k;
}

export class SpriteFx {
  private live: Live[] = [];
  private raf = 0;
  private ready = new Map<FxTex, HTMLImageElement>();

  constructor(private readonly layers: Record<string, HTMLCanvasElement>) {}

  preload(): void {
    (Object.keys(TEX_SRC) as FxTex[]).forEach((tex) => {
      loadImage(TEX_SRC[tex]).then((img) => this.ready.set(tex, img)).catch(() => undefined);
    });
  }

  add(s: Sprite): void {
    let src: CanvasImageSource | null = null;
    if (s.tex) {
      const img = this.ready.get(s.tex);
      if (!img) return; // 贴图未就绪就跳过这一片，不阻塞演出
      src = prepareTexture(img, s.tex, 'additive', s.tint);
    }
    this.live.push({ s, t0: performance.now() + (s.delay ?? 0), src });
    if (!this.raf) this.raf = requestAnimationFrame(this.tick);
  }

  clear(layer?: string): void {
    this.live = layer ? this.live.filter((l) => l.s.layer !== layer) : [];
    const targets = layer ? [this.layers[layer]] : Object.values(this.layers);
    targets.forEach((c) => c?.getContext('2d')?.clearRect(0, 0, c.width, c.height));
    if (!this.live.length && this.raf) {
      cancelAnimationFrame(this.raf);
      this.raf = 0;
    }
  }

  private tick = (now: number): void => {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const ctxs = new Map<string, CanvasRenderingContext2D>();
    for (const [name, canvas] of Object.entries(this.layers)) {
      const w = Math.round(canvas.clientWidth * dpr);
      const h = Math.round(canvas.clientHeight * dpr);
      if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w;
        canvas.height = h;
      }
      const g = canvas.getContext('2d');
      if (!g) continue;
      g.clearRect(0, 0, canvas.width, canvas.height);
      g.globalCompositeOperation = 'lighter';
      ctxs.set(name, g);
    }
    this.live = this.live.filter((l) => {
      const elapsed = now - l.t0;
      if (elapsed < 0) return true;
      let t = elapsed / l.s.dur;
      if (t >= 1) {
        if (!l.s.loop) return false;
        t %= 1;
      }
      const g = ctxs.get(l.s.layer);
      if (g) this.draw(g, l, t, dpr);
      return true;
    });
    this.raf = this.live.length ? requestAnimationFrame(this.tick) : 0;
    if (!this.raf) ctxs.forEach((g, name) => { const c = this.layers[name]!; g.clearRect(0, 0, c.width, c.height); });
  };

  private draw(g: CanvasRenderingContext2D, l: Live, t: number, dpr: number): void {
    const s = l.s;
    const e = EASE[s.ease ?? 'out'](t);
    const a = Math.max(0, Math.min(1, sampleAlpha(s.alpha, t)));
    if (a <= 0.003) return;
    const size = (s.size[0] + (s.size[1] - s.size[0]) * e) * dpr;
    const rot = s.rot ? s.rot[0] + (s.rot[1] - s.rot[0]) * (s.loop ? t : e) : 0;
    g.save();
    g.globalAlpha = a;
    g.translate(s.x * dpr, s.y * dpr);
    if (rot) g.rotate(rot);
    if (l.src) {
      const src = l.src as HTMLCanvasElement;
      const w = size;
      const h = size * (src.height / src.width) * (s.squash ?? 1);
      g.drawImage(l.src, -w / 2, -h / 2, w, h);
    } else {
      const r = size / 2;
      const grad = g.createRadialGradient(0, 0, 0, 0, 0, r);
      grad.addColorStop(0, s.glow ?? '#ffffff');
      grad.addColorStop(0.35, `${s.glow ?? '#ffffff'}99`);
      grad.addColorStop(1, `${s.glow ?? '#ffffff'}00`);
      g.fillStyle = grad;
      g.beginPath();
      g.arc(0, 0, r, 0, Math.PI * 2);
      g.fill();
    }
    g.restore();
  }
}
