/* 深渊远征 · 局内地图底图绘制（原型，第 4 版：分层深渊）
 *
 * 区域每局按种子切分，所以底图按种子现画，用的是一套和营地同画风的贴图（scripts/art-gen/expeditionAbyssAssets.mjs）：
 *   深渊外面的暮色雾 → 每块区域裁出它所在那一层的地面贴图（第一层雪林、第二层极光冰窟、第三层巨人冰冢）
 *   → 层与层的交界画成往下的台阶（深的一侧压暗、浅的一侧一道雪檐）→ 同一层走不通的边界画成冰裂缝
 *   → 通道画成雪地小径 → 每个地点按地名放一个地标贴图。
 * 迷雾、冰潮封锁、标记和地名是会变的状态，由页面的 SVG 层画，不在这里。
 * 用法：await ExpeditionTerrain.draw(canvas, map)；ExpeditionTerrain.propOf(n) 返回地标贴图的路径和大小，供 SVG 层对齐
 */
(function (root) {
  'use strict';
  const G = root.ExpeditionMapGen;
  const W = 1600, H = 900;
  const DIR = '../../game-assets/bundled/meta/expedition/abyss/';

  // 地名 → 地标贴图
  const KIND = {
    霜鸦松林: 'pines', 雾凇松坡: 'pines', 冻瀑崖: 'falls', 冰帘瀑: 'falls', 残阶古道: 'stairs', 断阶隘口: 'stairs',
    白桦冰塘: 'birch', 银桦林: 'birch', 寒狼穴: 'den', 狼嚎岩: 'den', 镜面冰湖: 'lake', 碎冰滩: 'lake',
    晶簇洞: 'crystal', 冰晶长廊: 'crystal', 极光泉: 'aurora', 霓光池: 'aurora', 镜柱厅: 'mirror', 回音冰殿: 'mirror',
    冰树庭: 'icetree', 霜萤冰林: 'icetree', 蓝冰拱门: 'arch', 冰穹隧道: 'arch',
    巨颅冰冢: 'skull', 沉眠巨像: 'colossus', 断剑冰原: 'sword', 符石环: 'ring', 霜巨人王陵: 'colossus',
    冰封王座: 'throne', 冰窖门厅: 'arch', 东冰藏: 'mirror', 机关冰廊: 'arch', 守卫冰室: 'mirror', 西冰藏: 'mirror',
  };
  const GROUND = { outer: 'w1-ground', mid: 'w2-ground', inner: 'w3-ground', core: 'w3-ground' };
  const DEPTH = { outer: 0, mid: 1, inner: 2, core: 3 };
  // 每层的整体色调：越深越偏紫、稍暗，但不压成黑色
  const TINT = { outer: null, mid: 'rgba(90,120,220,.06)', inner: 'rgba(110,80,200,.12)', core: 'rgba(120,70,190,.16)' };

  /* ---------- 贴图加载（缓存） ---------- */
  const cache = {};
  function img(name) {
    if (!cache[name]) cache[name] = new Promise((res) => { const im = new Image(); im.onload = () => res(im); im.onerror = () => res(null); im.src = DIR + name + '.webp'; });
    return cache[name];
  }
  // 贴图不是无缝的：拼成 2×2 的镜像图再平铺，接缝就看不出来
  const mirrored = {};
  function mirrorTile(im, scale) {
    const key = im.src + scale;
    if (mirrored[key]) return mirrored[key];
    const w = Math.round(im.width * scale), h = Math.round(im.height * scale);
    const c = document.createElement('canvas'); c.width = w * 2; c.height = h * 2;
    const x = c.getContext('2d');
    [[1, 1, 0, 0], [-1, 1, 2 * w, 0], [1, -1, 0, 2 * h], [-1, -1, 2 * w, 2 * h]].forEach(([sx, sy, tx, ty]) => {
      x.setTransform(sx, 0, 0, sy, tx, ty); x.drawImage(im, 0, 0, w, h);
    });
    return (mirrored[key] = c);
  }

  /* ---------- 小工具 ---------- */
  function pathPoly(ctx, P) { ctx.beginPath(); P.forEach((p, i) => (i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1]))); ctx.closePath(); }
  const area = (P) => Math.abs(P.reduce((s, a, i) => { const b = P[(i + 1) % P.length]; return s + a[0] * b[1] - b[0] * a[1]; }, 0)) / 2;
  function propOf(n) {
    const kind = n.t === 'boss' ? 'throne' : KIND[n.place] || 'pines';
    const s = n.t === 'boss' ? 168 : Math.round(Math.max(92, Math.min(124, Math.sqrt(n.area || 20000) * 0.62)));
    return { src: DIR + 'w-' + kind + '.webp', kind, size: s, cx: n.x, cy: n.y - Math.round(s * 0.2) };
  }

  /* ---------- 深渊外面 ---------- */
  function sky(ctx, rng) {
    const g = ctx.createRadialGradient(W / 2, H * 0.45, 120, W / 2, H / 2, 1000);
    g.addColorStop(0, '#6a78b8'); g.addColorStop(0.6, '#47538f'); g.addColorStop(1, '#2c3468');
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    for (let i = 0; i < 30; i++) {
      const x = rng.next() * W, y = rng.next() * H, r = 70 + rng.next() * 170;
      const m = ctx.createRadialGradient(x, y, 0, x, y, r); m.addColorStop(0, 'rgba(200,214,255,.16)'); m.addColorStop(1, 'rgba(200,214,255,0)');
      ctx.fillStyle = m; ctx.fillRect(x - r, y - r, 2 * r, 2 * r);
    }
    for (let i = 0; i < 70; i++) { // 雪尘
      ctx.beginPath(); ctx.arc(rng.next() * W, rng.next() * H, 0.6 + rng.next() * 1.4, 0, 7); ctx.fillStyle = `rgba(235,242,255,${0.25 + rng.next() * 0.4})`; ctx.fill();
    }
  }

  /* ---------- 每块区域的地面 ---------- */
  function grounds(ctx, map, tiles) {
    for (const n of map.nodes) {
      const tile = tiles[n.ring]; if (!tile) continue;
      ctx.save(); pathPoly(ctx, n.cell); ctx.clip();
      const pat = ctx.createPattern(tile, 'repeat');
      // 每层的贴图错开一个偏移，相邻两层不会对出同样的花纹
      const off = { outer: [0, 0], mid: [310, 170], inner: [520, 90], core: [140, 400] }[n.ring];
      pat.setTransform(new DOMMatrix([1, 0, 0, 1, -off[0], -off[1]]));
      ctx.fillStyle = pat; ctx.fillRect(0, 0, W, H);
      if (TINT[n.ring]) { ctx.fillStyle = TINT[n.ring]; ctx.fillRect(0, 0, W, H); }
      ctx.restore();
    }
  }

  /* ---------- 层间台阶、裂缝、小径 ---------- */
  // 两块区域的共享边界：通道和墙都带 seg
  function borders(map) {
    const out = [];
    map.edges.forEach((e) => e.seg && out.push({ u: e.u, v: e.v, seg: e.seg, open: true }));
    map.walls.forEach((w) => out.push({ u: w.u, v: w.v, seg: w.seg, open: false }));
    return out;
  }
  function terraces(ctx, map) {
    // 深的一侧沿边界压一道柔和的阴影，像往下走了一级
    for (const n of map.nodes) {
      const segs = borders(map).filter((b) => (b.u === n.id || b.v === n.id) && DEPTH[map.byId[b.u === n.id ? b.v : b.u].ring] < DEPTH[n.ring]);
      if (!segs.length) continue;
      ctx.save(); pathPoly(ctx, n.cell); ctx.clip();
      ctx.lineCap = 'round';
      // v4 审稿 C12：原来的阴影太淡，看不出"往下一层"，加深一档
      for (const [w, a] of [[60, 0.13], [32, 0.2], [13, 0.3]]) {
        ctx.strokeStyle = `rgba(40,46,120,${a})`; ctx.lineWidth = w;
        segs.forEach(({ seg: [p, q] }) => { ctx.beginPath(); ctx.moveTo(p[0], p[1]); ctx.lineTo(q[0], q[1]); ctx.stroke(); });
      }
      ctx.restore();
    }
    // 浅的一侧一道雪檐亮边
    ctx.save(); ctx.lineCap = 'round';
    borders(map).forEach((b) => {
      const du = DEPTH[map.byId[b.u].ring], dv = DEPTH[map.byId[b.v].ring];
      if (du === dv) return;
      const [p, q] = b.seg;
      // 崖边：先压一道深色的断面，再叠雪檐亮边
      ctx.strokeStyle = 'rgba(30,40,100,.45)'; ctx.lineWidth = 8;
      ctx.beginPath(); ctx.moveTo(p[0], p[1]); ctx.lineTo(q[0], q[1]); ctx.stroke();
      ctx.strokeStyle = 'rgba(250,252,255,.85)'; ctx.lineWidth = 3.2;
      ctx.beginPath(); ctx.moveTo(p[0], p[1]); ctx.lineTo(q[0], q[1]); ctx.stroke();
      ctx.strokeStyle = 'rgba(150,190,255,.35)'; ctx.lineWidth = 7;
      ctx.beginPath(); ctx.moveTo(p[0], p[1]); ctx.lineTo(q[0], q[1]); ctx.stroke();
    });
    ctx.restore();
  }
  function cracks(ctx, map, rng) {
    // 同一层走不通的边界：一道锯齿冰裂缝（深蓝缝 + 两侧亮边）；不同层走不通的边界，台阶已经表示了，再加深一点
    ctx.save(); ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    for (const w of map.walls) {
      const [a, b] = w.seg, L = Math.hypot(b[0] - a[0], b[1] - a[1]), k = Math.max(3, Math.round(L / 14));
      const nx = -(b[1] - a[1]) / (L || 1), ny = (b[0] - a[0]) / (L || 1);
      const pts = [];
      for (let i = 0; i <= k; i++) { const t = i / k, j = i === 0 || i === k ? 0 : (rng.next() - 0.5) * 9; pts.push([a[0] + (b[0] - a[0]) * t + nx * j, a[1] + (b[1] - a[1]) * t + ny * j]); }
      const line = (wd, c) => { ctx.strokeStyle = c; ctx.lineWidth = wd; ctx.beginPath(); pts.forEach((p, i) => (i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1]))); ctx.stroke(); };
      line(9, 'rgba(210,230,255,.55)');
      line(4.5, 'rgba(42,64,140,.78)');
      line(1.4, 'rgba(120,200,255,.7)');
    }
    ctx.restore();
  }
  function trails(ctx, map) {
    ctx.save(); ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    const curve = (e) => {
      const a = map.byId[e.u], b = map.byId[e.v], m = e.door;
      ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.quadraticCurveTo((a.x + m[0]) / 2 + (m[1] - a.y) * 0.12, (a.y + m[1]) / 2 - (m[0] - a.x) * 0.12, m[0], m[1]);
      ctx.quadraticCurveTo((b.x + m[0]) / 2 - (m[1] - b.y) * 0.12, (b.y + m[1]) / 2 + (m[0] - b.x) * 0.12, b.x, b.y);
    };
    map.edges.forEach((e) => { if (!e.door) return; curve(e); ctx.strokeStyle = 'rgba(70,90,160,.16)'; ctx.lineWidth = 14; ctx.stroke(); });
    map.edges.forEach((e) => { if (!e.door) return; curve(e); ctx.strokeStyle = 'rgba(255,255,255,.62)'; ctx.lineWidth = 8; ctx.stroke(); });
    ctx.setLineDash([2, 9]);
    map.edges.forEach((e) => { if (!e.door) return; curve(e); ctx.strokeStyle = 'rgba(120,140,200,.55)'; ctx.lineWidth = 3; ctx.stroke(); });
    ctx.setLineDash([]);
    // 跨层的通道口画三道冰阶
    map.edges.forEach((e) => {
      if (!e.door || DEPTH[map.byId[e.u].ring] === DEPTH[map.byId[e.v].ring]) return;
      const [p, q] = e.seg, L = Math.hypot(q[0] - p[0], q[1] - p[1]) || 1, tx = (q[0] - p[0]) / L, ty = (q[1] - p[1]) / L;
      const deep = DEPTH[map.byId[e.u].ring] > DEPTH[map.byId[e.v].ring] ? map.byId[e.u] : map.byId[e.v];
      let nx = -ty, ny = tx; if ((deep.x - e.door[0]) * nx + (deep.y - e.door[1]) * ny < 0) { nx = -nx; ny = -ny; }
      for (let i = 0; i < 3; i++) {
        const cx = e.door[0] + nx * (i * 6 - 2), cy = e.door[1] + ny * (i * 6 - 2), hw = 13 - i * 1.5;
        ctx.beginPath(); ctx.moveTo(cx - tx * hw, cy - ty * hw); ctx.lineTo(cx + tx * hw, cy + ty * hw);
        ctx.strokeStyle = 'rgba(60,80,150,.45)'; ctx.lineWidth = 4; ctx.stroke();
        ctx.strokeStyle = 'rgba(245,250,255,.9)'; ctx.lineWidth = 2; ctx.stroke();
      }
    });
    ctx.restore();
  }

  /* ---------- 高原边缘 ---------- */
  function rim(ctx, map) {
    const O = map.outline;
    ctx.save(); ctx.lineJoin = 'round';
    for (let k = 4; k >= 1; k--) { ctx.save(); ctx.translate(0, k * 6); pathPoly(ctx, O); ctx.fillStyle = `rgba(${70 + k * 12},${84 + k * 12},${150 + k * 10},${0.75 - k * 0.12})`; ctx.fill(); ctx.restore(); }
    ctx.shadowColor = 'rgba(20,24,70,.45)'; ctx.shadowBlur = 36; ctx.shadowOffsetY = 14;
    pathPoly(ctx, O); ctx.fillStyle = '#e8eefc'; ctx.fill();
    ctx.restore();
  }
  function rimLine(ctx, map) {
    ctx.save(); pathPoly(ctx, map.outline); ctx.strokeStyle = 'rgba(255,255,255,.9)'; ctx.lineWidth = 4; ctx.lineJoin = 'round'; ctx.stroke();
    ctx.strokeStyle = 'rgba(150,180,255,.4)'; ctx.lineWidth = 12; ctx.stroke(); ctx.restore();
  }

  /* ---------- 地标 ---------- */
  async function props(ctx, map) {
    const list = map.nodes.map((n) => ({ n, p: propOf(n) })).sort((a, b) => a.n.y - b.n.y); // 远的先画
    const ims = await Promise.all(list.map(({ p }) => img('w-' + p.kind)));
    list.forEach(({ p }, i) => {
      const im = ims[i]; if (!im) return;
      const s = p.size / Math.max(im.width, im.height), w = im.width * s, h = im.height * s;
      ctx.drawImage(im, p.cx - w / 2, p.cy - h / 2, w, h);
    });
  }

  let token = 0;
  async function draw(canvas, map, opts = {}) {
    const my = ++token;
    const [t1, t2, t3] = await Promise.all(['w1-ground', 'w2-ground', 'w3-ground'].map(img));
    if (my !== token) return; // 期间又换了种子
    const dpr = opts.dpr || Math.min(2, root.devicePixelRatio || 1);
    canvas.width = W * dpr; canvas.height = H * dpr;
    const ctx = canvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    if (!map.byId) map.byId = Object.fromEntries(map.nodes.map((n) => [n.id, n]));
    const rng = G.makeRng(map.seed, 'terrain', map.version);
    const tiles = { outer: t1 && mirrorTile(t1, 0.62), mid: t2 && mirrorTile(t2, 0.62), inner: t3 && mirrorTile(t3, 0.62) };
    tiles.core = tiles.inner;
    sky(ctx, rng);
    rim(ctx, map);
    grounds(ctx, map, tiles);
    terraces(ctx, map);
    cracks(ctx, map, rng);
    trails(ctx, map);
    rimLine(ctx, map);
    await props(ctx, map);
    if (my !== token) return;
    const v = ctx.createRadialGradient(W / 2, H / 2, 420, W / 2, H / 2, 1000); v.addColorStop(0, 'rgba(0,0,0,0)'); v.addColorStop(1, 'rgba(24,28,80,.32)');
    ctx.fillStyle = v; ctx.fillRect(0, 0, W, H);
  }

  root.ExpeditionTerrain = { draw, propOf, KIND, area };
})(typeof globalThis !== 'undefined' ? globalThis : this);
