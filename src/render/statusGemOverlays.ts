/**
 * 状态搬运宝石的程序化叠层（GEMS-SEMANTICS-2 波A · 用户裁定免贴图）。
 *
 * 设计与性能口径（GEMS-SEMANTICS-2 §0 预算）：
 *   - 基图 = 归属色宝石贴图（gemTextures SPECIAL_URL 映射），本模块只在其上叠
 *     状态主题的 Graphics 矢量层；每次 setType 时一次性重绘，**不逐帧重绘 Graphics**。
 *   - 待机动画 = gsap 补间驱动叠层容器的 alpha/rotation/x/y/scale（时长 0.7~8s，
 *     相位不与呼吸系统冲突——呼吸动 GemSprite.scale，叠层动自己的子容器）。
 *   - 只对场上实际存在的状态宝石实例生效（数量少）；prefers-reduced-motion 时
 *     全部静态化（只画不补间）。
 *   - GemSprite 复用（对象池）时由 GemSprite.setType 负责销毁旧叠层。
 *
 * 各宝石方案逐条照应 GEMS-SEMANTICS-2 A/B 组「程序化视觉」节。
 */
import { Container, Graphics } from 'pixi.js';
import { gsap } from 'gsap';
import type { StatusGemKind } from '@engine/types';

/** 是否要求减弱动态效果（系统级无障碍设置；命中则叠层只静态绘制） */
function prefersReducedMotion(): boolean {
  return typeof window !== 'undefined'
    && typeof window.matchMedia === 'function'
    && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/** 单颗宝石的叠层实例：容器挂在 GemSprite 上，tweens 随 setType 销毁 */
export interface StatusGemOverlay {
  container: Container;
  tweens: gsap.core.Tween[];
}

const easeInOut = 'sine.inOut';

/**
 * 为状态宝石绘制叠层并启动待机动画。
 * @param parent 挂载点（GemSprite 自身，局部坐标以宝石中心为原点）
 * @param kind   状态宝石种类
 * @param size   格子边长（px）
 */
export function attachStatusGemOverlay(parent: Container, kind: StatusGemKind, size: number): StatusGemOverlay {
  const r = size * 0.5;
  const tweens: gsap.core.Tween[] = [];
  const reduced = prefersReducedMotion();

  /** 叠一个待机补间（reduced-motion 时跳过） */
  const sway = (target: gsap.TweenTarget, vars: gsap.TweenVars): void => {
    if (reduced) return;
    tweens.push(gsap.to(target, { ...vars }));
  };

  const g = () => new Graphics();

  let layers: Graphics[] = [];
  switch (kind) {
    case 'freezeGem': {
      // 六片冰晶放射 + 外圈霜环（蓝底白霜）；叠层整体 alpha 呼吸（霜光闪烁）
      const frost = g();
      // 暗衬环：在Busy蓝底贴图上先垫一圈深色，霜环才读得出来
      frost.circle(0, 0, 0.64 * r).stroke({ width: 4, color: 0x10203a, alpha: 0.55 });
      for (let i = 0; i < 6; i++) {
        const a = (Math.PI / 3) * i - Math.PI / 2;
        const cx = Math.cos(a);
        const cy = Math.sin(a);
        const tip = 0.5 * r;
        const px = -cy;
        const py = cx;
        frost.poly([
          cx * tip * 0.15 + px * 0.1 * r, cy * tip * 0.15 + py * 0.1 * r,
          cx * tip + px * 0.035 * r, cy * tip + py * 0.035 * r,
          cx * tip * 0.15 - px * 0.1 * r, cy * tip * 0.15 - py * 0.1 * r,
        ]).fill({ color: 0xf2fbff, alpha: 0.95 });
        frost.circle(cx * 0.64 * r, cy * 0.64 * r, 0.045 * r).fill({ color: 0xe8f6ff, alpha: 0.9 });
      }
      frost.circle(0, 0, 0.64 * r).stroke({ width: 2.5, color: 0xd6ecff, alpha: 0.85 });
      layers = [frost];
      sway(frost, { alpha: 0.55, duration: 0.8, ease: easeInOut, yoyo: true, repeat: -1, startAt: { alpha: 0.85 } });
      break;
    }
    case 'burningGem': {
      // 底部一圈火舌（橙底黄芯双层）+ 右上火星；火舌轻颤 + 黄芯明灭模拟摇曳
      const base = g();
      for (let i = 0; i < 4; i++) {
        const x = -0.45 * r + i * 0.3 * r;
        const h = (i % 2 === 0 ? 0.42 : 0.3) * r;
        base.moveTo(x - 0.1 * r, 0.3 * r)
          .quadraticCurveTo(x, 0.3 * r - h, x + 0.1 * r, 0.3 * r)
          .fill({ color: 0xff8c3a, alpha: 0.8 });
      }
      const core = g();
      for (let i = 0; i < 4; i++) {
        const x = -0.45 * r + i * 0.3 * r;
        const h = (i % 2 === 0 ? 0.26 : 0.18) * r;
        core.moveTo(x - 0.055 * r, 0.3 * r)
          .quadraticCurveTo(x, 0.3 * r - h, x + 0.055 * r, 0.3 * r)
          .fill({ color: 0xffd24a, alpha: 0.9 });
      }
      const spark = g();
      spark.circle(0.42 * r, -0.42 * r, 0.08 * r).fill({ color: 0xffd24a, alpha: 0.95 });
      layers = [base, core, spark];
      sway(base, { y: 0.02 * size, duration: 0.35, ease: easeInOut, yoyo: true, repeat: -1 });
      sway(core, { alpha: 0.35, duration: 0.6, ease: easeInOut, yoyo: true, repeat: -1 });
      break;
    }
    case 'curseGem': {
      // 暗紫符环 + 环上三骷髅点 + 中心倒十字；符环整体慢速自转（8s/圈）
      const ring = g();
      ring.circle(0, 0, 0.62 * r).stroke({ width: 2, color: 0x9a5cff, alpha: 0.85 });
      const marks = g();
      for (let i = 0; i < 3; i++) {
        const a = (Math.PI * 2 / 3) * i - Math.PI / 2;
        marks.circle(Math.cos(a) * 0.62 * r, Math.sin(a) * 0.62 * r, 0.06 * r)
          .fill({ color: 0xc77dff, alpha: 0.95 });
      }
      marks.moveTo(-0.1 * r, -0.16 * r).lineTo(0.1 * r, -0.16 * r)
        .moveTo(0, -0.16 * r).lineTo(0, 0.18 * r)
        .stroke({ width: 2, color: 0xb46cff, alpha: 0.7 });
      layers = [ring, marks];
      sway(marks, { rotation: Math.PI * 2, duration: 8, ease: 'none', repeat: -1 });
      break;
    }
    case 'terrorGem': {
      // 抽象魔眼：椭圆眼眶 + 粉瞳 + 高光（瞳孔左右游移）+ 顶部三道惊悚线
      const eye = g();
      eye.ellipse(0, 0.04 * r, 0.42 * r, 0.26 * r).stroke({ width: 2, color: 0xe0b6ff, alpha: 0.95 });
      const pupil = g();
      pupil.circle(0, 0.04 * r, 0.16 * r).fill({ color: 0xff4d8f, alpha: 0.95 });
      pupil.circle(-0.05 * r, -0.01 * r, 0.05 * r).fill({ color: 0xffffff, alpha: 0.9 });
      const lines = g();
      for (const dx of [-0.2, 0, 0.2]) {
        lines.moveTo(dx * r, -0.3 * r).lineTo(dx * r * 1.35, -0.52 * r)
          .stroke({ width: 2, color: 0xd9b6ff, alpha: 0.7 });
      }
      layers = [eye, pupil, lines];
      sway(pupil, { x: 0.1 * r, duration: 1.2, ease: easeInOut, yoyo: true, repeat: -1 });
      break;
    }
    case 'bleedGem': {
      // 两道交叉抓痕（三段递减线宽模拟端点渐细）+ 中心血滴轻坠回弹
      const scratches = g();
      for (const [w, inset] of [[3, 0], [2, 0.08], [1, 0.16]] as const) {
        scratches.moveTo((-0.5 + inset) * r, (-0.42 + inset * 0.6) * r)
          .lineTo((0.5 - inset) * r, (0.42 - inset * 0.6) * r)
          .moveTo((0.5 - inset) * r, (-0.42 + inset * 0.6) * r)
          .lineTo((-0.5 + inset) * r, (0.42 - inset * 0.6) * r)
          .stroke({ width: w, color: 0xff4d6e, alpha: 0.85 });
      }
      const drop = g();
      drop.circle(0, 0, 0.1 * r).fill({ color: 0xc22040, alpha: 0.95 });
      layers = [scratches, drop];
      sway(drop, { y: 0.04 * size, duration: 0.9, ease: easeInOut, yoyo: true, repeat: -1 });
      break;
    }
    case 'poisonGem': {
      // 三颗错位气泡（相位错开依次上浮）+ 一滴垂落粘液
      const bubbleSpecs: [number, number, number, number][] = [
        [0.1, -0.18, -0.2, 2.0],
        [0.07, 0.22, -0.05, 2.6],
        [0.05, -0.02, 0.28, 3.2],
      ];
      const bubbles: Graphics[] = [];
      for (const [rad, x, y] of bubbleSpecs) {
        const b = g();
        b.circle(x * r, y * r, rad * r).stroke({ width: 2, color: 0xb8ffd9, alpha: 0.7 });
        bubbles.push(b);
      }
      const drip = g();
      drip.circle(0.16 * r, 0.42 * r, 0.07 * r).fill({ color: 0x7dffa8, alpha: 0.85 });
      drip.moveTo(0.16 * r, 0.22 * r).lineTo(0.16 * r, 0.42 * r)
        .stroke({ width: 2, color: 0x7dffa8, alpha: 0.6 });
      layers = [...bubbles, drip];
      bubbles.forEach((bubble, i) => {
        sway(bubble, {
          y: -0.08 * size, alpha: 0.25, duration: (bubbleSpecs[i][3] ?? 2) / 2,
          delay: i * 0.3, ease: easeInOut, yoyo: true, repeat: -1,
        });
      });
      break;
    }
    case 'faerieFireGem': {
      // 蝶形光晕（四瓣十字花）+ 中心亮点 + 环绕光尘（公转）
      const glow = g();
      for (let i = 0; i < 4; i++) {
        const a = (Math.PI / 2) * i;
        glow.ellipse(Math.cos(a) * 0.3 * r, Math.sin(a) * 0.3 * r, 0.14 * r, 0.26 * r)
          .fill({ color: 0xd6ff8a, alpha: 0.55 });
      }
      const core = g();
      core.circle(0, 0, 0.09 * r).fill({ color: 0xfbffe0, alpha: 0.95 });
      const dust = g();
      dust.circle(0.5 * r, 0, 0.04 * r).fill({ color: 0xfbffe0, alpha: 0.8 });
      dust.circle(-0.44 * r, 0.12 * r, 0.04 * r).fill({ color: 0xfbffe0, alpha: 0.6 });
      layers = [glow, core, dust];
      sway(glow, { alpha: 0.4, duration: 0.75, ease: easeInOut, yoyo: true, repeat: -1, startAt: { alpha: 0.7 } });
      sway(dust, { rotation: Math.PI * 2, duration: 3, ease: 'none', repeat: -1 });
      break;
    }
    case 'enrageGem': {
      // 两道怒气斜杠（"//"）+ 下缘红色余焰；斜杠组小幅横抖
      const slashes = g();
      for (const dx of [-0.18, 0.14]) {
        slashes.moveTo(dx * r, -0.38 * r).lineTo((dx + 0.16) * r, -0.06 * r)
          .stroke({ width: 3, color: 0xff5c3a, alpha: 0.9 });
      }
      const ember = g();
      ember.arc(0, 0, 0.6 * r, Math.PI * 0.15, Math.PI * 0.85)
        .stroke({ width: 3, color: 0xff5c3a, alpha: 0.4 });
      layers = [slashes, ember];
      sway(slashes, { x: 0.03 * size, duration: 0.45, ease: easeInOut, yoyo: true, repeat: -1 });
      break;
    }
    case 'submergeGem': {
      // 三条横贯波浪线 + 右下上升气泡；波浪相位横移
      const waves = g();
      // 深色衬底波浪（错位半格）+ 亮波浪：保证在蓝色贴图上可读
      for (const y of [-0.26, 0, 0.26]) {
        waves.moveTo(-0.42 * r, y * r)
          .quadraticCurveTo(-0.21 * r, (y - 0.1) * r, 0, y * r)
          .quadraticCurveTo(0.21 * r, (y + 0.1) * r, 0.42 * r, y * r)
          .stroke({ width: 5, color: 0x0c2338, alpha: 0.5 });
        waves.moveTo(-0.42 * r, y * r)
          .quadraticCurveTo(-0.21 * r, (y - 0.1) * r, 0, y * r)
          .quadraticCurveTo(0.21 * r, (y + 0.1) * r, 0.42 * r, y * r)
          .stroke({ width: 2.5, color: 0xc9efff, alpha: 0.95 });
      }
      const bubbles = g();
      for (const [x, y, rad] of [[0.34, 0.36, 0.05], [0.44, 0.2, 0.035]] as const) {
        bubbles.circle(x * r, y * r, rad * r).fill({ color: 0xd9f4ff, alpha: 0.95 });
      }
      layers = [waves, bubbles];
      sway(waves, { x: 0.06 * size, duration: 0.9, ease: easeInOut, yoyo: true, repeat: -1 });
      break;
    }
    case 'entangleGem': {
      // 两圈交叉藤蔓弧 + 三片小叶；整体极缓慢缩放（生长-回缩）
      const vines = g();
      vines.arc(-0.12 * r, 0, 0.52 * r, -Math.PI * 0.7, Math.PI * 0.5)
        .stroke({ width: 2.5, color: 0x4bd66a, alpha: 0.85 });
      vines.arc(0.12 * r, 0, 0.52 * r, Math.PI * 0.3, Math.PI * 1.5)
        .stroke({ width: 2.5, color: 0x4bd66a, alpha: 0.85 });
      const leaves = g();
      for (const [x, y] of [[0.3, -0.3], [-0.34, 0.14], [0.05, 0.44]] as const) {
        leaves.ellipse(x * r, y * r, 0.12 * r, 0.055 * r).fill({ color: 0xa6f0b4, alpha: 0.8 });
      }
      layers = [vines, leaves];
      sway(vines.scale, { x: 1.04, y: 1.04, duration: 1.1, ease: easeInOut, yoyo: true, repeat: -1 });
      break;
    }
    case 'stunGem': {
      // 三颗四角星绕顶排布（星组公转）+ 轨道虚环
      const stars = g();
      for (let i = 0; i < 3; i++) {
        const a = (Math.PI * 2 / 3) * i;
        const cx = Math.cos(a) * 0.4 * r;
        const cy = Math.sin(a) * 0.4 * r;
        const rad = 0.09 * r;
        const waist = rad * 0.38;
        stars.poly([
          cx, cy - rad, cx + waist, cy - waist, cx + rad, cy, cx + waist, cy + waist,
          cx, cy + rad, cx - waist, cy + waist, cx - rad, cy, cx - waist, cy - waist,
        ]).fill({ color: 0xffe9a6, alpha: 0.95 });
      }
      const orbit = g();
      orbit.circle(0, 0, 0.4 * r).stroke({ width: 1.5, color: 0xffe9a6, alpha: 0.35 });
      layers = [stars, orbit];
      stars.position.set(0, -0.06 * r);
      sway(stars, { rotation: Math.PI * 2, duration: 2.5, ease: 'none', repeat: -1 });
      break;
    }
    case 'barrierGem': {
      // 半透明金黄穹顶弧 + 顶部小菱形徽记；穹顶呼吸
      const dome = g();
      // 深色轮廓衬底：金黄穹顶在黄色太阳贴图上靠暗缘读形
      dome.arc(0, 0.18 * r, 0.66 * r, Math.PI, Math.PI * 2).stroke({ width: 5, color: 0x3a2c08, alpha: 0.6 });
      dome.arc(0, 0.18 * r, 0.62 * r, Math.PI, Math.PI * 2).fill({ color: 0xfffbe8, alpha: 0.55 });
      dome.arc(0, 0.18 * r, 0.62 * r, Math.PI, Math.PI * 2).stroke({ width: 2.5, color: 0xffe06b, alpha: 1 });
      const mark = g();
      mark.poly([0, -0.56 * r, 0.07 * r, -0.46 * r, 0, -0.36 * r, -0.07 * r, -0.46 * r])
        .fill({ color: 0xffd24a, alpha: 0.95 });
      layers = [dome, mark];
      sway(dome, { alpha: 0.35, duration: 1, ease: easeInOut, yoyo: true, repeat: -1, startAt: { alpha: 0.6 } });
      break;
    }
    case 'deathMarkGem': {
      // 鲜红 × 叉（危险闪烁）+ 外圈红环（短线段拼成虚线感）
      const cross = g();
      cross.moveTo(-0.3 * r, -0.3 * r).lineTo(0.3 * r, 0.3 * r)
        .moveTo(0.3 * r, -0.3 * r).lineTo(-0.3 * r, 0.3 * r)
        .stroke({ width: 3, color: 0xff3348, alpha: 0.95 });
      const ring = g();
      for (let i = 0; i < 12; i++) {
        const a0 = (Math.PI * 2 / 12) * i;
        const a1 = a0 + (Math.PI * 2 / 12) * 0.55;
        ring.arc(0, 0, 0.66 * r, a0, a1).stroke({ width: 2, color: 0xff3348, alpha: 0.65 });
      }
      layers = [cross, ring];
      sway(cross, { alpha: 0.7, duration: 0.45, ease: easeInOut, yoyo: true, repeat: -1, startAt: { alpha: 1 } });
      break;
    }
  }

  const container = new Container();
  for (const layer of layers) container.addChild(layer);
  if (container.children.length > 0) parent.addChild(container);
  return { container, tweens };
}

/** 销毁叠层：杀补间、销毁容器（含全部 Graphics 子层） */
export function disposeStatusGemOverlay(overlay: StatusGemOverlay | null): void {
  if (!overlay) return;
  for (const tw of overlay.tweens) tw.kill();
  overlay.container.destroy({ children: true });
}
