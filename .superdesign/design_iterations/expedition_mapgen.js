/* 深渊远征 · 局内地图生成器（原型）
 *
 * 同一个种子永远生成同一张图。正式实现放在服务端（run 状态只存 seed + 版本号 + 动作序列），客户端只渲染。
 * 规则来源：docs/expedition/01-gameplay.md §3–§4、02-map-events.md、03-enemies.md §8；口径见 docs/expedition/12-map-generation.md。
 *
 * 管线（每一步只读前一步的产物，各自用独立的随机流，改一步不会让其他步的结果漂移）：
 *   1 骨架  buildSkeleton   定环、定节点数、定角度、半径和整张图的外形
 *   2 布局  layoutSites     站点放到屏幕坐标、互相推开；makeOutline 定高原外轮廓；buildRegions 做 Voronoi 区域切分
 *   3 连线  linkGraph       只在共享边界的区域之间开通道：外环成环；中环、内环带缺口；环间通道选最长的共享边界
 *   4 锚点  placeAnchors    入口、三个撤离点
 *   5 事件  placeEvents     罗盘对应的事件模板：单点 / 点 + 范围 / 改配额 / 口袋子区
 *   6 房间  fillRooms       群系专属节点和其余房间按配额、环位偏好、分散度填入
 *   7 巡逻  placePatrols    游荡敌人的巡逻段；placeDoors 把通道放到共享边界中点
 *   8 校验  validate        不通过就换下一个尝试号重来（确定性）
 *   9 装配  dressRooms      每个房间按 (seed, 节点) 生成具体内容：敌人、掉落、选项；namePlaces 给区域起地名
 */
(function (root) {
  'use strict';

  const VERSION = 4; // 4：分层深渊的地名 + 后台冰潮时间表；3：区域图——站点做 Voronoi 切分，只在共享边界的区域之间开通道（《黑色幸存者》式）；2：按种子的外形

  /* ---------------- 随机数 ---------------- */
  function hash32(str) {
    let h = 2166136261 >>> 0;
    for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
    h ^= h >>> 16; h = Math.imul(h, 2246822507); h ^= h >>> 13; h = Math.imul(h, 3266489909); h ^= h >>> 16;
    return h >>> 0;
  }
  function makeRng(...parts) {
    let a = hash32(parts.join('|'));
    const next = () => {
      a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
    const r = {
      next,
      int: (lo, hi) => lo + Math.floor(next() * (hi - lo + 1)),
      range: ([lo, hi]) => lo + Math.floor(next() * (hi - lo + 1)),
      pick: (arr) => arr[Math.floor(next() * arr.length)],
      chance: (p) => next() < p,
      jitter: (amp) => (next() * 2 - 1) * amp,
      shuffle(arr) { const a2 = arr.slice(); for (let i = a2.length - 1; i > 0; i--) { const j = Math.floor(next() * (i + 1)); [a2[i], a2[j]] = [a2[j], a2[i]]; } return a2; },
      weighted(entries) { // [[value, weight], ...]
        const total = entries.reduce((s, e) => s + e[1], 0);
        let x = next() * total;
        for (const [v, w] of entries) { if ((x -= w) < 0) return v; }
        return entries[entries.length - 1][0];
      },
    };
    return r;
  }

  /* ---------------- 配置表 ---------------- */
  // 节点数取 01 §4.1 区间的上半段，保证 §4.2 的房间配额放得下（见 12 §3）。
  const RUN_TYPES = {
    short: {
      name: '短途', steps: 24,
      rings: { outer: [7, 8], mid: [5, 6], inner: [2, 3] },
      midGaps: [1, 1], outerMid: [3, 4], midInner: [2, 2], bossLinks: 1,
      exits: [{ id: 'A', ring: 'outer', win: [3, 14] }, { id: 'B', ring: 'outer', win: [8, 20] }, { id: 'C', ring: 'mid', win: [13, 23] }],
      patrols: [1, 2], scale: 0.86, exitGap: 2, tideEvery: 4,
      quota: { lord: [1, 1], special: [1, 1], nest: [1, 1], camp: [0, 1], guard: [2, 3], chest: [0, 1], ore: [0, 1], shrine: [1, 1], supply: [1, 2], loot: [1, 2], merchant: [0, 1] },
    },
    standard: {
      name: '标准', steps: 36,
      rings: { outer: [9, 10], mid: [7, 8], inner: [3, 4] },
      midGaps: [1, 2], outerMid: [4, 6], midInner: [2, 3], bossLinks: 2,
      exits: [{ id: 'A', ring: 'outer', win: [4, 20] }, { id: 'B', ring: 'outer', win: [12, 28] }, { id: 'C', ring: 'mid', win: [20, 34] }],
      patrols: [2, 4], scale: 1, exitGap: 3, tideEvery: 6,
      quota: { lord: [2, 2], special: [1, 1], nest: [1, 2], camp: [1, 2], guard: [3, 5], chest: [1, 2], ore: [1, 2], shrine: [1, 2], supply: [2, 4], loot: [2, 3], merchant: [0, 1] },
    },
  };

  // 房间：环位偏好权重（外/中/内）、和入口的最小步距、同类之间的最小步距。填充顺序 = 数组顺序（先放约束多的）。
  const ROOMS = [
    { t: 'lord',     ring: { outer: 0, mid: 1, inner: 2 }, minFromEntry: 3, spread: 2, notAdjSame: true },
    { t: 'special',  ring: { outer: 0, mid: 2, inner: 1 }, minFromEntry: 2, spread: 2 },
    { t: 'nest',     ring: { outer: 1, mid: 3, inner: 1 }, minFromEntry: 2, spread: 2 },
    { t: 'camp',     ring: { outer: 1, mid: 3, inner: 0 }, minFromEntry: 3, spread: 3 },
    { t: 'chest',    ring: { outer: 0, mid: 1, inner: 3 }, minFromEntry: 2, spread: 2 },
    { t: 'guard',    ring: { outer: 2, mid: 2, inner: 1 }, minFromEntry: 1, spread: 1 },
    { t: 'shrine',   ring: { outer: 2, mid: 2, inner: 0 }, minFromEntry: 1, spread: 3 },
    { t: 'ore',      ring: { outer: 1, mid: 2, inner: 1 }, minFromEntry: 1, spread: 2 },
    { t: 'loot',     ring: { outer: 1, mid: 2, inner: 2 }, minFromEntry: 1, spread: 1 },
    { t: 'supply',   ring: { outer: 4, mid: 1, inner: 0 }, minFromEntry: 0, spread: 1 },
    { t: 'merchant', ring: { outer: 3, mid: 1, inner: 0 }, minFromEntry: 2, spread: 3 },
  ];
  const COMBAT = new Set(['guard', 'nest', 'lord', 'boss', 'special', 'vguard']);
  // 配额不够放时的削减顺序（越靠前越先砍到下限以下）。
  const TRIM_ORDER = ['merchant', 'loot', 'ore', 'shrine', 'supply', 'chest', 'guard', 'camp', 'nest'];

  // 群系：专属节点、领主、首领、敌人池（数值来自 src/data/troops.json 的基础值，词缀为 03 §4 示例）。
  const BIOMES = {
    winter: {
      name: '寒冬堡垒', special: 'coffin', specialName: '冰封棺', mark: '霜噬：对冻结目标骷髅伤害 ×1.3',
      rot: [0, Math.PI * 2],
      pool: {
        low: [
          { nm: '霜虫', p: 'Troop_K22_07', c: ['blue'], m: 8, st: [10, 10, 17, 0] },
          { nm: '寒冬骑士', p: 'Troop_K22_02', c: ['blue', 'green'], m: 10, st: [12, 16, 14, 7] },
          { nm: '寒霜弓箭手', p: 'Troop_K22_12', c: ['blue', 'red'], m: 10, st: [14, 9, 18, 10] },
          { nm: '寒霜巨人', p: 'Troop_K15_00', c: ['blue', 'brown'], m: 9, st: [14, 9, 18, 7] },
          { nm: '寒冰怨灵', p: 'Troop_K15_15', c: ['blue', 'brown'], m: 10, st: [12, 20, 11, 11] },
        ],
        high: [
          { nm: '雪怪', p: 'Troop_K22_03', c: ['blue', 'brown'], m: 11, st: [16, 9, 20, 11] },
          { nm: '雪之守护者', p: 'Troop_K22_08', c: ['green', 'brown'], m: 12, st: [16, 5, 24, 11] },
          { nm: '寒冬狼', p: 'Troop_K22_05', c: ['blue', 'purple'], m: 12, st: [15, 7, 26, 10], trait: '一只阵亡时召唤另一只补位' },
          { nm: '寒霜蜥蜴', p: 'Troop_K22_09', c: ['blue', 'yellow'], m: 11, st: [15, 9, 24, 10] },
          { nm: '冰尖塔萨满', p: 'Troop_K15_26', c: ['blue', 'yellow'], m: 12, st: [15, 18, 15, 6], trait: '开局冻结第一名敌人' },
          { nm: '蓝宝石巨人', p: 'Troop_K15_30', c: ['blue', 'brown'], m: 13, st: [15, 11, 28, 10], trait: '受伤后获得护甲' },
        ],
      },
      lords: [
        { nm: '丝卡蒂', p: 'Troop_K22_11', c: ['blue', 'yellow', 'purple'], m: 20, st: [17, 17, 34, 14], phases: 2, trait: '每 3 回合把一整列宝石变成冰霜宝石',
          guards: ['冰尖塔萨满', '寒霜蜥蜴', '寒冬狼'], drop: '首杀解锁铭文「冰封之列」' },
        { nm: '巨人守卫', p: 'Troop_K15_35', c: ['blue'], m: 13, st: [17, 24, 19, 7], phases: 2, trait: '第二阶段狂怒，匹配 4 颗以上眩晕首位',
          guards: ['寒霜巨人', '蓝宝石巨人', '寒霜弓箭手'], drop: '首杀解锁督军铭文' },
      ],
      // 寒冬堡垒下面的深渊叫"霜渊"，三环就是往下的三层：越往下越奇幻。地名按层抽，不重复；地名 → 地标贴图见 expedition_terrain.js 的 KIND
      layers: {
        outer: { nm: '雪檐林地', no: '第一层' }, mid: { nm: '极光冰窟', no: '第二层' }, inner: { nm: '巨人冰冢', no: '第三层' }, core: { nm: '冰封王座', no: '渊底' },
      },
      places: {
        outer: ['霜鸦松林', '雾凇松坡', '冻瀑崖', '冰帘瀑', '残阶古道', '断阶隘口', '白桦冰塘', '银桦林', '寒狼穴', '狼嚎岩', '镜面冰湖', '碎冰滩'],
        mid: ['晶簇洞', '冰晶长廊', '极光泉', '霓光池', '镜柱厅', '回音冰殿', '冰树庭', '霜萤冰林', '蓝冰拱门', '冰穹隧道'],
        inner: ['巨颅冰冢', '沉眠巨像', '断剑冰原', '符石环', '霜巨人王陵'],
        core: '冰封王座', pocket: ['冰窖门厅', '东冰藏', '机关冰廊', '守卫冰室', '西冰藏'],
      },
      tideName: '冰潮', // 后台计时的表现：每隔一段时间冰潮上涨，封住一批区域（12 §2.2）
      boss: { nm: '寒冬不朽', p: 'Troop_Boss_K22', c: ['blue', 'purple'], m: 18, st: [24, 22, 60, 16], phases: 3, trait: '最终阶段召唤冰霜风暴' },
    },
  };

  // 十个区域各自的深渊主题（12 §2.4）。原型只把寒冬堡垒做成了完整群系（BIOMES.winter），其余先定名字和分层，
  // 敌人池、地名全表和地貌贴图等确认后再补。tide 是"后台计时封区域"在这个区域的叫法，规则完全一样，只换表现。
  // key 用 src/meta/data/regionalPvp.ts 的 art 字段
  const THEMES = {
    spire:   { region: '中央尖塔', abyss: '界渊', tide: '界潮', seal: '被界壁合上', layers: ['金穹回廊', '倒悬塔林', '诸界碎庭', '万界之心'] },
    tower:   { region: '阿达尼亚', abyss: '铁渊', tide: '落闸', seal: '被铁闸关上', layers: ['齿轮工坊', '熔铸长厅', '沉睡机库', '黄铜心枢'] },
    forest:  { region: '南荒', abyss: '根渊', tide: '藤潮', seal: '被藤蔓缠死', layers: ['苔光林冠', '萤菇谷', '古树根窟', '母树王座'] },
    gothic:  { region: '盖赫龙', abyss: '影渊', tide: '夜潮', seal: '沉进了影子', layers: ['月光墓园', '镜影长廊', '沉钟教堂', '幽影王座'] },
    winter:  { region: '寒冬堡垒', abyss: '霜渊', tide: '冰潮', seal: '被冰封', layers: ['雪檐林地', '极光冰窟', '巨人冰冢', '冰封王座'] },
    desert:  { region: '古盖塔', abyss: '沙渊', tide: '流沙', seal: '被流沙埋住', layers: ['沉沙集市', '星象墓道', '冥河渡口', '黄金棺殿'] },
    bay:     { region: '星星湾', abyss: '海渊', tide: '涨潮', seal: '被海水淹没', layers: ['珊瑚浅滩', '水母星林', '沉船墓场', '潮汐王庭'] },
    expanse: { region: '迈纳杰大区', abyss: '焰原渊', tide: '野火', seal: '被野火烧断', layers: ['金草裂谷', '罗刹神庙', '万兽骨原', '烈阳祭坛'] },
    summer:  { region: '夏之岛', abyss: '花渊', tide: '梦雾', seal: '被梦雾吞没', layers: ['繁花台地', '妖精灯市', '月银树海', '仲夏王庭'] },
    broken:  { region: '破碎之地', abyss: '熔渊', tide: '熔潮', seal: '被熔岩漫过', layers: ['兽人战壕', '黑曜石峡', '龙骨熔湖', '龙母巢穴'] },
  };
  const themeOf = (region) => Object.values(THEMES).find((t) => t.region === region);

  // 怪物词缀（03 §4 首批，数值为示例）：[效果, 对策]
  const AFFIX = {
    先发: ['开局 30% 法力', '开局控制'], 冰封: ['骷髅命中 25% 冻结', '冻结免疫'], 坚甲: ['护甲 ×1.3', '无视护甲'],
    荆棘: ['反弹 25% 骷髅伤害', '技能伤害'], 连击: ['匹配 4 颗以上时攻击 +3', '抢先凑 4 连'], 再生: ['每回合回复 2 生命', '集中火力速杀'],
    屏障: ['开局获得屏障', '多段伤害'], 不屈: ['首次阵亡时以 30% 生命复活', '准备两次击杀'],
  };
  const AFFIX_KEYS = Object.keys(AFFIX);

  // 物品（图标名对应 game-assets/bundled/meta/expedition/anime/*.webp）
  const ITEMS = {
    sigil: [['sigil-silver', '星银刻印'], ['sigil-stone', '石纹刻印'], ['sigil-iron', '铁誓刻印']],
    craft: [['cur-dust', '刻尘'], ['cur-tier', '升阶石'], ['cur-reroll', '重铸石'], ['cur-quality', '升品石']],
    rare: [['cur-break', '破限石'], ['pass-2', '高一阶路引']],
    use: [['use-smoke', '烟雾弹'], ['use-potion', '药剂'], ['use-lockpick', '撬锁器']],
    mat: [['mat-soul', '灵质'], ['mat-purse', '钱袋'], ['mat-memory', '记忆碎片']],
  };
  // 不含"寒渊誓约"：那是原型里保险格的那件史诗刻印，地上不该再捡到同名的普通货
  const SIGIL_NAMES = ['霜纹之握', '北境星盘', '冰棱回响', '雪幕之誓', '凛风指环', '白夜徽记'];
  const SHRINE_POOL = [
    ['冰泉', '本趟每场战斗开始时，全队获得 3 点护甲'], ['星光', '本趟被冰潮推出区域时不掉生命'],
    // "缓潮"替换掉旧的"疾行"（旧文案带灯火和移动次数，两样都不该出现在界面上）；后台把下一次冰潮推后
    ['猎人', '本趟击败稀有怪时额外掉 1 件'], ['坚守', '首位队员生命 +20%'], ['缓潮', '下一次冰潮晚一些才涨'],
  ];

  // 事件模板（02）。footprint：core = 单点；range = 单点 + 相邻范围；quota = 只改配额；pocket = 挂一个口袋子区。
  const EVENTS = {
    blood: {
      name: '血祭', footprint: 'range', core: 'altar', rings: ['mid', 'inner'], minFromEntry: 2,
      // 献祭范围 = 祭坛 + 相邻节点；范围里至少要有 2 个战斗房间，名单才填得起来（02 §1.1）。
      rangeCombat: 2,
    },
    rival: {
      name: '劲敌', footprint: 'quota',
      quota: (q) => { q.nest = [q.nest[0] + 2, q.nest[1] + 2]; q.guard = [Math.max(1, q.guard[0] - 2), Math.max(1, q.guard[1] - 2)]; },
    },
    vault: {
      name: '金库', footprint: 'pocket', core: 'vdoor', rings: ['mid', 'inner'], minFromEntry: 3,
      pocket: ['vsafe', 'vtrap', 'vguard', 'vsafe'], // 门后 3–5 个节点，只能经门进出（02 §6.1）
    },
  };

  /* ---------------- 小工具 ---------------- */
  const TAU = Math.PI * 2;
  const angDiff = (a, b) => { let d = (a - b) % TAU; if (d < -Math.PI) d += TAU; if (d > Math.PI) d -= TAU; return Math.abs(d); };
  const ekey = (u, v) => (u < v ? u + '|' + v : v + '|' + u);

  function makeGraph() {
    const g = { nodes: [], byId: {}, edges: [], adj: {}, eset: new Set() };
    g.add = (n) => { g.nodes.push(n); g.byId[n.id] = n; g.adj[n.id] = []; return n; };
    g.link = (u, v, kind) => {
      if (u === v || g.eset.has(ekey(u, v))) return false;
      g.eset.add(ekey(u, v)); g.edges.push({ u, v, kind }); g.adj[u].push(v); g.adj[v].push(u); return true;
    };
    g.dist = (from) => {
      const d = { [from]: 0 }, q = [from];
      while (q.length) { const u = q.shift(); for (const v of g.adj[u]) if (!(v in d)) { d[v] = d[u] + 1; q.push(v); } }
      return d;
    };
    return g;
  }

  /* ---------------- 1 骨架 ---------------- */
  // 地面坐标原点在 (CX, CY)；屏幕坐标 = 地面坐标把 y 压扁到 K（俯视 2.5D）。
  // 三环是"深度"而不是正圆：每张图按种子抽一个外形——首领殿偏离中心、各环的环心朝首领殿偏移（越往里越深的漏斗），
  // 环的半径随角度做低频起伏，外加一点螺旋扭转。拓扑（谁连谁）只由角度顺序决定，外形变化不影响 01 §4.1 的规则。
  const CX = 800, CY = 486, K = 0.52; // K：把环压成横向椭圆，适配 16:9 屏幕（正俯视，没有透视）
  const RADII = { outer: 640, mid: 400, inner: 220 };
  const PULL = { outer: 0, mid: 0.35, inner: 0.7, core: 1 }; // 环心朝首领殿偏移的比例：越往里越靠近首领殿，形成偏心的漏斗
  // 岛心可用的屏幕区域：避开顶部步数条；底部两角是队伍栏（x < 400）和道具栏（x > 1140），岛心再抬高
  const SAFE = { x0: 120, x1: 1480, y0: 176, y1: 800, cornerL: 420, cornerR: 1130, cornerY: 730 };

  function makeShape(rng, rt) {
    const R = RADII.outer * rt.scale;
    // 首领殿多数偏向远处（屏幕上方），也会明显偏左或偏右
    const phi = -Math.PI / 2 + rng.jitter(Math.PI * 0.6);
    const off = R * (0.16 + rng.next() * 0.16);
    return {
      boss: [Math.cos(phi) * off, Math.sin(phi) * off],
      a2: 0.06 + rng.next() * 0.1, p2: rng.next() * TAU, // 二阶起伏：椭圆 → 腰形 / 肾形
      a3: rng.next() * 0.08, p3: rng.next() * TAU,       // 三阶起伏：三角、心形的轮廓
      twist: rng.jitter(0.12),                           // 螺旋：沿环一圈半径渐变
    };
  }
  function shapeAt(shape, ring, a, gr, rot) {
    const k = PULL[ring] ?? 0;
    const damp = ring === 'inner' ? 0.55 : ring === 'mid' ? 0.85 : 1;
    const rel = (((a - rot) % TAU) + TAU) % TAU;
    const w = 1 + damp * (shape.a2 * Math.cos(2 * (a - shape.p2)) + shape.a3 * Math.cos(3 * (a - shape.p3))) + shape.twist * (rel / TAU - 0.5);
    return [shape.boss[0] * k + Math.cos(a) * gr * w, shape.boss[1] * k + Math.sin(a) * gr * w];
  }

  function buildSkeleton(ctx) {
    const { rt, rng } = ctx;
    const g = makeGraph();
    const rot = rng.next() * TAU;
    const shape = makeShape(ctx.rngShape, rt);
    const rings = {};
    for (const ring of ['outer', 'mid', 'inner']) {
      const n = rng.range(rt.rings[ring]);
      const off = ring === 'mid' ? Math.PI / n : ring === 'inner' ? rng.next() * TAU : 0;
      rings[ring] = [];
      for (let i = 0; i < n; i++) {
        const step = TAU / n;
        const a = rot + off + i * step + rng.jitter(step * 0.2);
        const r = RADII[ring] * rt.scale * (1 + rng.jitter(0.06));
        const [gx, gy] = shapeAt(shape, ring, a, r, rot);
        rings[ring].push(g.add({ id: ring[0] + i, ring, idx: i, a, gr: r, gx, gy, t: null }));
      }
    }
    g.add({ id: 'boss', ring: 'core', idx: 0, a: 0, gr: 0, gx: shape.boss[0], gy: shape.boss[1], t: 'boss' });
    ctx.g = g; ctx.rings = rings; ctx.shape = shape; ctx.rot = rot;
  }

  /* ---------------- 2 布局 + 区域切分 ---------------- */
  // 区域图是正俯视：先把站点放到屏幕坐标，再按站点做 Voronoi 切分，裁到高原的外轮廓里。
  const SITE_GAP = 150, BOSS_GAP = 200;      // 站点之间的最小距离（像素），保证每个区域放得下名字和标记
  const MIN_AREA = 11000;                     // 区域最小面积（像素²）

  function clampSafe(n) {
    n.x = Math.min(SAFE.x1, Math.max(SAFE.x0, n.x));
    const corner = n.x < SAFE.cornerL || n.x > SAFE.cornerR;
    n.y = Math.min(corner ? SAFE.cornerY : SAFE.y1, Math.max(SAFE.y0, n.y));
  }
  function layoutSites(ctx) {
    const { g } = ctx;
    // 地面坐标 → 屏幕：y 压扁到 K，再按包围盒等比缩放、居中到安全区
    const xs = g.nodes.map((n) => n.gx), ys = g.nodes.map((n) => n.gy * K);
    const bx0 = Math.min(...xs), bx1 = Math.max(...xs), by0 = Math.min(...ys), by1 = Math.max(...ys);
    const fit = Math.min((SAFE.x1 - SAFE.x0) / (bx1 - bx0 || 1), (SAFE.y1 - SAFE.y0) / (by1 - by0 || 1), 1.1);
    const sx = (SAFE.x0 + SAFE.x1) / 2, sy = (SAFE.y0 + SAFE.y1) / 2;
    g.nodes.forEach((n) => { n.x = sx + (n.gx - (bx0 + bx1) / 2) * fit; n.y = sy + (n.gy * K - (by0 + by1) / 2) * fit; clampSafe(n); });
    ctx.fit = fit;
    // 站点两两推开（首领殿不动），每轮推完收回安全区
    for (let it = 0; it < 80; it++) {
      let moved = false;
      for (let i = 0; i < g.nodes.length; i++) for (let j = i + 1; j < g.nodes.length; j++) {
        const a = g.nodes[i], b = g.nodes[j];
        const need = a.t === 'boss' || b.t === 'boss' ? (SITE_GAP + BOSS_GAP) / 2 : SITE_GAP;
        const dx = b.x - a.x, dy = b.y - a.y, d = Math.hypot(dx, dy) || 1;
        if (d < need) {
          const push = (need - d) / 2, ux = dx / d, uy = dy / d;
          if (a.t !== 'boss') { a.x -= ux * push; a.y -= uy * push; }
          if (b.t !== 'boss') { b.x += ux * push; b.y += uy * push; }
          moved = true;
        }
      }
      g.nodes.forEach(clampSafe);
      if (!moved) break;
    }
    g.nodes.forEach((n) => { n.x = Math.round(n.x); n.y = Math.round(n.y); });
    ctx.outline = makeOutline(ctx);
  }

  // 高原外轮廓：站点集合的支撑函数外扩一圈，再平滑、加一点起伏；外面是深渊
  function makeOutline(ctx) {
    const { g } = ctx, rng = ctx.rngLayout, N = 64;
    const cx = g.nodes.reduce((s, n) => s + n.x, 0) / g.nodes.length, cy = g.nodes.reduce((s, n) => s + n.y, 0) / g.nodes.length;
    let r = [];
    for (let k = 0; k < N; k++) {
      const t = (k / N) * TAU, c = Math.cos(t), s = Math.sin(t);
      r.push(Math.max(...g.nodes.map((n) => (n.x - cx) * c + (n.y - cy) * s)) + 132 + rng.jitter(16));
    }
    for (let pass = 0; pass < 3; pass++) r = r.map((v, k) => (r[(k + N - 1) % N] + 2 * v + r[(k + 1) % N]) / 4);
    return r.map((v, k) => {
      const t = (k / N) * TAU;
      return [Math.round(Math.min(1592, Math.max(8, cx + Math.cos(t) * v))), Math.round(Math.min(896, Math.max(16, cy + Math.sin(t) * v)))];
    });
  }

  function clipHalf(poly, px, py, nx, ny) { // 保留 (p − P)·n ≤ 0 的一侧
    const out = [];
    for (let i = 0; i < poly.length; i++) {
      const a = poly[i], b = poly[(i + 1) % poly.length];
      const da = (a[0] - px) * nx + (a[1] - py) * ny, db = (b[0] - px) * nx + (b[1] - py) * ny;
      if (da <= 0) out.push(a);
      if ((da < 0 && db > 0) || (da > 0 && db < 0)) { const t = da / (da - db); out.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]); }
    }
    return out;
  }
  const polyArea = (P) => Math.abs(P.reduce((s, a, i) => { const b = P[(i + 1) % P.length]; return s + a[0] * b[1] - b[0] * a[1]; }, 0)) / 2;

  function buildRegions(ctx) {
    const { g } = ctx, nodes = g.nodes;
    for (const n of nodes) {
      let poly = ctx.outline.slice();
      for (const m of nodes) {
        if (m === n || !poly.length) continue;
        poly = clipHalf(poly, (n.x + m.x) / 2, (n.y + m.y) / 2, m.x - n.x, m.y - n.y);
      }
      n.cell = poly; n.area = polyArea(poly);
    }
    // 共享边界：两个端点到两个站点都等距的边
    ctx.nb = {};
    nodes.forEach((n) => (ctx.nb[n.id] = {}));
    for (const n of nodes) {
      const P = n.cell;
      for (let i = 0; i < P.length; i++) {
        const a = P[i], b = P[(i + 1) % P.length], L = Math.hypot(b[0] - a[0], b[1] - a[1]);
        if (L < 1) continue;
        const da = Math.hypot(a[0] - n.x, a[1] - n.y), db = Math.hypot(b[0] - n.x, b[1] - n.y);
        for (const m of nodes) {
          if (m === n) continue;
          if (Math.abs(Math.hypot(a[0] - m.x, a[1] - m.y) - da) < 0.75 && Math.abs(Math.hypot(b[0] - m.x, b[1] - m.y) - db) < 0.75) {
            const cur = ctx.nb[n.id][m.id];
            if (!cur || cur.len < L) ctx.nb[n.id][m.id] = { len: L, seg: [a, b] };
            break;
          }
        }
      }
    }
  }
  // 外环必须成环：相邻两个外环区域被里面的区域隔开时，把隔开它们的区域往首领殿方向挪，重新切分，最多 8 轮
  function repairRim(ctx) {
    const { g, rings } = ctx, boss = g.byId.boss, outer = rings.outer;
    for (let it = 0; it < 8; it++) {
      const bad = [];
      for (let i = 0; i < outer.length; i++) {
        const a = outer[i], b = outer[(i + 1) % outer.length];
        if ((ctx.nb[a.id][b.id]?.len || 0) >= MIN_DOOR) continue;
        g.nodes.forEach((n) => { if (n.ring !== 'outer' && n.t !== 'boss' && ctx.nb[a.id][n.id] && ctx.nb[b.id][n.id] && !bad.includes(n)) bad.push(n); });
      }
      if (!bad.length) return;
      bad.forEach((n) => {
        const dx = boss.x - n.x, dy = boss.y - n.y, d = Math.hypot(dx, dy) || 1, step = Math.min(36, d * 0.25);
        n.x = Math.round(n.x + (dx / d) * step); n.y = Math.round(n.y + (dy / d) * step);
      });
      buildRegions(ctx);
    }
  }
  // 区域切好后，把站点（标记和地名的位置）挪向区域的形心，让标记落在区域中间、彼此拉开。
  // 区域本身不变；形心落在区域外或安全区外时退回到更靠近原站点的位置
  const inPoly = (P, x, y) => { let c = false; for (let i = 0, j = P.length - 1; i < P.length; j = i++) { const [xi, yi] = P[i], [xj, yj] = P[j]; if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) c = !c; } return c; };
  const inSafe = (x, y) => { const corner = x < SAFE.cornerL || x > SAFE.cornerR; return x >= SAFE.x0 && x <= SAFE.x1 && y >= SAFE.y0 && y <= (corner ? SAFE.cornerY : SAFE.y1); };
  function centerSites(ctx) {
    ctx.g.nodes.forEach((n) => {
      const P = n.cell; let cx = 0, cy = 0, A = 0;
      for (let i = 0; i < P.length; i++) { const [x0, y0] = P[i], [x1, y1] = P[(i + 1) % P.length], f = x0 * y1 - x1 * y0; A += f; cx += (x0 + x1) * f; cy += (y0 + y1) * f; }
      if (!A) return;
      cx /= 3 * A; cy /= 3 * A;
      for (const t of [1, 0.75, 0.5, 0.25]) {
        const x = Math.round(n.x + (cx - n.x) * t), y = Math.round(n.y + (cy - n.y) * t);
        if (inPoly(P, x, y) && inSafe(x, y)) { n.x = x; n.y = y; return; }
      }
    });
  }
  // 通道画在共享边界的中点
  function placeDoors(ctx) {
    ctx.g.edges.forEach((e) => {
      const s = ctx.nb[e.u][e.v];
      e.len = s ? Math.round(s.len) : 0;
      e.door = s ? [Math.round((s.seg[0][0] + s.seg[1][0]) / 2), Math.round((s.seg[0][1] + s.seg[1][1]) / 2)] : null;
      e.seg = s ? s.seg.map((p) => p.map(Math.round)) : null;
    });
  }

  /* ---------------- 8 校验 ---------------- */
  function validate(ctx) {
    const { g, rt } = ctx;
    const errs = [];
    if (ctx.fail) errs.push(ctx.fail);
    const dE = g.dist(ctx.entry);
    if (Object.keys(dE).length !== g.nodes.length) errs.push('不连通');
    if (!(dE.boss <= Math.floor(rt.steps / 4))) errs.push('首领殿太远：' + dE.boss);
    // 撤离点：两两 ≥ N 步，且从入口出发能在窗口关闭前 2 步走到
    for (let i = 0; i < ctx.exits.length; i++) {
      const x = ctx.exits[i];
      if (!(dE[x.node] <= x.win[1] - 2)) errs.push('撤离点 ' + x.id + ' 来不及');
      const dx = g.dist(x.node);
      for (let j = i + 1; j < ctx.exits.length; j++) if (dx[ctx.exits[j].node] < rt.exitGap) errs.push('撤离点 ' + x.id + ctx.exits[j].id + ' 太近');
    }
    for (const [t, d] of ctx.shortfall || []) if (t === 'lord' || t === ctx.biome.special || (t === 'camp' && rt.steps >= 36)) errs.push('缺少房间 ' + t + ' ×' + d);
    const lords = g.nodes.filter((n) => n.t === 'lord');
    if (lords.length === 2 && g.adj[lords[0].id].includes(lords[1].id)) errs.push('领主相邻');
    for (const ev of ctx.events) if (ev.range) {
      const c = ev.range.filter((id) => COMBAT.has(g.byId[id].t)).length;
      if (c < EVENTS[ev.key].rangeCombat) errs.push('血祭范围战斗不足');
    }
    // 每条通道都落在一段足够长的共享边界上；每个区域够大
    g.edges.forEach((e) => { if (!e.door || e.len < MIN_DOOR) errs.push('通道无边界 ' + e.u + '-' + e.v); });
    g.nodes.forEach((n) => { if (!(n.area >= (n.t === 'boss' ? MIN_AREA * 1.6 : MIN_AREA))) errs.push('区域太小 ' + n.id); });
    // 地图上每个区域的"标记 + 地名"（撤离点再加一条撤离标签）不能互相压住。repairRim 挪过站点后可能挤到一起
    const exitIds = new Set(ctx.exits.map((x) => x.node)), boxes = [];
    g.nodes.forEach((n) => {
      boxes.push([n.id, n.x - 40, n.y - 30, n.x + 40, n.y + 30]);
      if (exitIds.has(n.id)) boxes.push([n.id, n.x - 88, n.y + 30, n.x + 88, n.y + 54]);
    });
    for (let i = 0; i < boxes.length; i++) for (let j = i + 1; j < boxes.length; j++) {
      const a = boxes[i], b = boxes[j];
      if (a[0] !== b[0] && a[1] < b[3] && b[1] < a[3] && a[2] < b[4] && b[2] < a[4]) { errs.push('标记重叠 ' + a[0] + '-' + b[0]); }
    }
    return errs;
  }

  /* ---------------- 3 连线（只在共享边界的区域之间开通道） ---------------- */
  // 和《黑色幸存者》的区域图一样：相邻的区域才能走过去。这里再进一步——相邻但没开通道的边界画成墙，
  // 所以"谁和谁相邻"由区域切分决定，"相邻里哪些能走"由下面的环规则决定。
  const MIN_DOOR = 44; // 共享边界短于这个长度（像素）不开通道，否则门画不下
  function spreadPick(list, k, rng) {
    const n = list.length, off = rng.next() * (n / k), out = [];
    for (let i = 0; i < k; i++) { const j = Math.floor(off + (i * n) / k) % n; if (!out.includes(list[j])) out.push(list[j]); }
    return out;
  }
  const shares = (ctx, u, v) => (ctx.nb[u][v]?.len || 0) >= MIN_DOOR;

  function linkGraph(ctx) {
    const { g, rings, rt, rng } = ctx;
    const ringEdges = (list, gaps, must) => {
      const n = list.length, cut = new Set();
      while (cut.size < gaps && cut.size < n - 1) {
        const c = rng.int(0, n - 1);
        if (!cut.has((c + 1) % n) && !cut.has((c + n - 1) % n)) cut.add(c);
      }
      for (let i = 0; i < n; i++) {
        if (cut.has(i) || n < 2 || (n === 2 && i === 1)) continue;
        const a = list[i].id, b = list[(i + 1) % n].id;
        if (shares(ctx, a, b)) g.link(a, b, 'ring');
        else if (must) ctx.fail = '外环断开 ' + a + '-' + b;
      }
    };
    ringEdges(rings.outer, 0, true); // 外环必须成环（01 §4.1）
    ringEdges(rings.mid, rng.range(rt.midGaps), false);
    ringEdges(rings.inner, rings.inner.length >= 3 ? 1 : 0, false);

    // 环间通道：在内侧环上均匀挑 k 个点，各连一个和它共享边界最长的外侧环区域
    const bestTo = (m, toRing) => toRing.filter((o) => shares(ctx, m.id, o.id)).sort((x, y) => ctx.nb[m.id][y.id].len - ctx.nb[m.id][x.id].len)[0];
    const radial = (from, toRing, k) => {
      // 均匀挑 k 个；挑中的点和外侧环不接壤时，顺延到环上的下一个点
      const picks = spreadPick(from, k, rng), used = new Set();
      for (const m0 of picks) {
        const i0 = from.indexOf(m0);
        for (let s = 0; s < from.length; s++) {
          const m = from[(i0 + s) % from.length], to = !used.has(m) && bestTo(m, toRing);
          if (to) { g.link(m.id, to.id, 'radial'); used.add(m); break; }
        }
      }
    };
    radial(rings.mid, rings.outer, rng.range(rt.outerMid));
    radial(rings.inner, rings.mid, Math.min(rings.inner.length, rng.range(rt.midInner)));
    // 中环、内环被缺口切成几段后，可能有一段和外面不通：给每个孤立段补一条向外的通道
    const ringsIn = ['mid', 'inner'];
    for (let guard = 0; guard < 8; guard++) {
      const seen = new Set([rings.outer[0].id]), q = [rings.outer[0].id];
      while (q.length) { const u = q.shift(); for (const v of g.adj[u]) if (!seen.has(v)) { seen.add(v); q.push(v); } }
      const lost = g.nodes.filter((n) => n.t !== 'boss' && !seen.has(n.id));
      if (!lost.length) break;
      let done = false;
      for (const ring of ringsIn) {
        for (const n of lost.filter((x) => x.ring === ring)) {
          const to = g.nodes.filter((o) => seen.has(o.id) && o.t !== 'boss' && shares(ctx, n.id, o.id)).sort((x, y) => ctx.nb[n.id][y.id].len - ctx.nb[n.id][x.id].len)[0];
          if (to) { g.link(n.id, to.id, 'radial'); done = true; break; }
        }
        if (done) break;
      }
      if (!done) break;
    }

    // 首领殿只从 1–2 个和它接壤的内环区域进入：挑方向相距最远的一组
    const boss = g.byId.boss;
    const inner = rings.inner.filter((n) => shares(ctx, n.id, 'boss'));
    if (!inner.length) { ctx.fail = '首领殿不接壤内环'; return; }
    const ang = (n) => Math.atan2(n.y - boss.y, n.x - boss.x);
    if (rt.bossLinks === 1 || inner.length < 2) g.link(rng.pick(inner).id, 'boss', 'gate');
    else {
      let best = [inner[0], inner[1]], bd = -1;
      for (let i = 0; i < inner.length; i++) for (let j = i + 1; j < inner.length; j++) {
        const d = angDiff(ang(inner[i]), ang(inner[j])); if (d > bd) { bd = d; best = [inner[i], inner[j]]; }
      }
      best.forEach((n) => g.link(n.id, 'boss', 'gate'));
    }
  }

  /* ---------------- 4 锚点 ---------------- */
  function placeAnchors(ctx) {
    const { g, rings, rt } = ctx;
    // 入口：外环上离首领殿最远、并且靠近镜头（屏幕下方）的点。首领殿偏到哪边，入口就落在对面。
    const boss = g.byId.boss;
    const far = (n) => Math.hypot(n.x - boss.x, n.y - boss.y) + (n.y - CY) * 0.6;
    const entry = rings.outer.reduce((b, n) => (far(n) > far(b) ? n : b), rings.outer[0]);
    entry.t = 'entry';
    ctx.entry = entry.id;
    const dE = g.dist(entry.id);
    ctx.dE = dE;
    const free = (n) => !n.t;
    const exits = {};
    // A：离入口约外环 1/3 圈（标准图 3 步、短途 2 步），开局不久就能撤。
    const wantA = Math.max(2, Math.round(rings.outer.length / 3));
    const candA = rings.outer.filter((n) => free(n) && dE[n.id] >= 2).sort((x, y) => Math.abs(dE[x.id] - wantA) - Math.abs(dE[y.id] - wantA) || x.idx - y.idx);
    const A = candA[0];
    A.t = 'exit'; exits.A = A.id;
    const dA = g.dist(A.id);
    // B：外环上同时远离入口和 A。
    const B = rings.outer.filter(free).sort((x, y) => Math.min(dE[y.id], dA[y.id]) - Math.min(dE[x.id], dA[x.id]) || x.idx - y.idx)[0];
    B.t = 'exit'; exits.B = B.id;
    const dB = g.dist(B.id);
    // C：中环上离 A、B 都 ≥ 3 步，越深越好。
    const C = rings.mid.filter(free).sort((x, y) => (Math.min(dA[y.id], dB[y.id]) * 2 + dE[y.id]) - (Math.min(dA[x.id], dB[x.id]) * 2 + dE[x.id]) || x.idx - y.idx)[0];
    C.t = 'exit'; exits.C = C.id;
    ctx.exits = rt.exits.map((e) => {
      const n = g.byId[exits[e.id]];
      const shift = ctx.rngExit.int(-1, 1) * 2; // 窗口按种子 ±2 步浮动
      n.exit = { id: e.id, win: [Math.max(1, e.win[0] + shift), Math.min(rt.steps - 1, e.win[1] + shift)] };
      return { id: e.id, node: n.id, win: n.exit.win };
    });
  }

  /* ---------------- 5 事件 ---------------- */
  function placeEvents(ctx) {
    const { g, rng, compasses } = ctx;
    ctx.quota = JSON.parse(JSON.stringify(ctx.rt.quota));
    ctx.events = [];
    for (const key of compasses) {
      const tpl = EVENTS[key];
      if (!tpl) continue;
      if (tpl.footprint === 'quota') { tpl.quota(ctx.quota); ctx.events.push({ key, name: tpl.name, nodes: [] }); continue; }
      const cand = g.nodes.filter((n) => !n.t && tpl.rings.includes(n.ring) && ctx.dE[n.id] >= tpl.minFromEntry);
      if (!cand.length) { ctx.fail = '事件放不下：' + tpl.name; return; }
      const freeNb = (n) => g.adj[n.id].filter((v) => !g.byId[v].t).length;
      cand.sort((x, y) => freeNb(y) - freeNb(x) || rng.next() - 0.5);
      const core = cand[0];
      core.t = tpl.core; core.event = key;
      const ev = { key, name: tpl.name, core: core.id, nodes: [core.id] };
      if (tpl.footprint === 'range') {
        // 先占住范围里的 2 个战斗房间（算进驻守配额），后面的填充不会把它们挤成补给箱。
        const nb = rng.shuffle(g.adj[core.id].filter((v) => !g.byId[v].t));
        const need = Math.min(tpl.rangeCombat, nb.length);
        for (let i = 0; i < need; i++) { g.byId[nb[i]].t = 'guard'; g.byId[nb[i]].eventRange = key; }
        ctx.quota.guard = [Math.max(0, ctx.quota.guard[0] - need), Math.max(0, ctx.quota.guard[1] - need)];
        ev.range = g.adj[core.id].slice();
      }
      if (tpl.footprint === 'pocket') {
        // 口袋子区：沿门所在方向往环缝里挂一串节点，只能经门进出。
        const r0 = core.gr;
        tpl.pocket.forEach((t, i) => {
          const side = i % 2 ? 1 : -1;
          // 沿"首领殿 → 门"方向（内环朝外、中环朝里）排开，左右交错；区域在下面重新切分
          const boss = g.byId.boss, dx = core.x - boss.x, dy = core.y - boss.y, d = Math.hypot(dx, dy) || 1, sg = core.ring === 'inner' ? 1 : -1;
          const n = g.add({ id: 'v' + i, ring: core.ring, idx: i, a: core.a, gr: r0, t, pocket: key,
            x: core.x + sg * (dx / d) * (120 + 60 * i) - (dy / d) * side * 60, y: core.y + sg * (dy / d) * (120 + 60 * i) + (dx / d) * side * 60 });
          clampSafe(n); n.x = Math.round(n.x); n.y = Math.round(n.y);
          g.link(i === 0 ? core.id : 'v' + (i - 1), n.id, 'pocket');
          ev.nodes.push(n.id);
        });
      }
      ctx.events.push(ev);
    }
    if (ctx.events.some((e) => e.key && EVENTS[e.key].footprint === 'pocket')) buildRegions(ctx);
  }

  /* ---------------- 6 房间 ---------------- */
  function fillRooms(ctx) {
    const { g, rng, biome } = ctx;
    const q = ctx.quota;
    const count = (t) => g.nodes.filter((n) => n.t === t).length;
    const distCache = {};
    const dist = (id) => (distCache[id] ||= g.dist(id));
    const score = (room, n) => {
      const w = room.ring[n.ring] || 0;
      if (!w || ctx.dE[n.id] < room.minFromEntry) return -1;
      const same = g.nodes.filter((m) => m.t === room.t);
      if (room.notAdjSame && same.some((m) => g.adj[n.id].includes(m.id))) return -1;
      const minSame = same.length ? Math.min(...same.map((m) => dist(m.id)[n.id] ?? 99)) : 9;
      if (same.length && minSame < room.spread) return -1;
      return w + Math.min(minSame, 5) * 0.4 + rng.next() * 0.8;
    };
    const place = (room) => {
      let best = null, bs = -1;
      for (const n of g.nodes) { if (n.t) continue; const s = score(room, n); if (s > bs) { bs = s; best = n; } }
      if (!best) return false;
      best.t = room.t; return true;
    };
    // 群系专属节点：换成该群系的专属类型
    const rooms = ROOMS.map((r) => (r.t === 'special' ? { ...r, t: biome.special } : r));
    q[biome.special] = q.special; delete q.special;
    const qOf = (t) => q[t] || [0, 0];
    // 第一轮：各类先放到下限（按约束从多到少的顺序）
    for (const room of rooms) while (count(room.t) < qOf(room.t)[0] && place(room));
    // 第二轮：剩下的空位按权重补到上限之内
    for (let guard = 0; guard < 60; guard++) {
      const freeLeft = g.nodes.some((n) => !n.t);
      if (!freeLeft) break;
      const open = rooms.filter((r) => count(r.t) < qOf(r.t)[1]);
      if (!open.length) break;
      const pickRoom = rng.weighted(open.map((r) => [r, r.t === 'supply' || r.t === 'loot' || r.t === 'guard' ? 3 : 1]));
      if (!place(pickRoom)) open.splice(open.indexOf(pickRoom), 1);
    }
    // 还有空位（配额都满或约束放不下）→ 补给箱
    g.nodes.forEach((n) => { if (!n.t) n.t = 'supply'; });
    // 记下配额缺口，供校验和文档统计
    ctx.shortfall = rooms.map((r) => [r.t, qOf(r.t)[0] - count(r.t)]).filter(([, d]) => d > 0);
  }

  /* ---------------- 7 巡逻 ---------------- */
  function placePatrols(ctx) {
    const { g, rings, rt, rng, biome } = ctx;
    const n = rng.range(rt.patrols);
    ctx.patrols = [];
    const used = new Set();
    for (let k = 0; k < n * 4 && ctx.patrols.length < n; k++) {
      const ring = rng.chance(0.6) ? rings.outer : rings.mid;
      const len = rng.int(3, 5);
      const start = rng.int(0, ring.length - 1);
      const seg = [];
      for (let i = 0; i < len; i++) {
        const node = ring[(start + i) % ring.length];
        if (seg.length && !g.adj[seg[seg.length - 1]].includes(node.id)) break;
        seg.push(node.id);
      }
      if (seg.length < 3 || seg.some((id) => used.has(id))) continue;
      const first = seg[0];
      if ((ctx.dE[first] ?? 0) <= 1) continue;
      seg.forEach((id) => used.add(id));
      const unit = rng.pick(biome.pool.high);
      ctx.patrols.push({ id: 'w' + ctx.patrols.length, route: seg.concat(seg.slice(1, -1).reverse()), pos: 0, enemy: unit.nm, p: unit.p });
    }
  }

  /* ---------------- 7.5 冰潮（后台计时） ---------------- */
  // 步数只在后台记，不给玩家看。玩家看到的是：每隔 tideEvery 步冰潮上涨一次，封住一批区域；
  // 下一次要封的区域提前标出来。冰潮从第一层往下涨，最后一次连渊底一起封住，这时还在图里就算失败。
  // 撤离点按开放窗口的结束时间对齐到某一次冰潮；其余区域按层分批，每封一个都检查剩下的区域仍然连通。
  function placeTide(ctx) {
    const { g, rt, rings } = ctx, rng = ctx.rngTide, every = rt.tideEvery, count = Math.round(rt.steps / every);
    const seal = {};
    // 撤离点按 A、B、C 依次在倒数第三、倒数第二、最后一次冰潮时封住（第 k 次冰潮在第 k × every 步），
    // 窗口结束改成那一次冰潮的前一步。开放时间不变
    ctx.exits.forEach((x, i) => {
      const k = count - (ctx.exits.length - 1 - i);
      seal[x.node] = k; x.win[1] = k * every - 1; g.byId[x.node].exit.win = x.win;
    });
    const alive = new Set(g.nodes.map((n) => n.id));
    const parts = () => {
      const left = new Set(alive), out = [];
      while (left.size) {
        const s = left.values().next().value, comp = new Set([s]), q = [s]; left.delete(s);
        while (q.length) { const u = q.shift(); for (const v of g.adj[u]) if (left.has(v)) { left.delete(v); comp.add(v); q.push(v); } }
        out.push(comp);
      }
      return out;
    };
    // 每一层在哪几次冰潮里被封：第一层 1..count-2，第二层 count-2..count-1，第三层和渊底在最后一次。
    // 每次的目标数 = 该层区域数平均分到它的几次冰潮里
    // v4 审稿 T16：每次封的数量只增不减（标准局约 2 / 2 / 3 / 3–4 / 4–5 / 剩下全部），每次至少 1 个。
    // 第一层先封，第二层从倒数第三次开始分三次封；数量按递增权重分配，层的先后由挑选顺序决定
    const tgt = Array(count + 1).fill(0);
    const outerFree = rings.outer.filter((n) => !(n.id in seal)), midFree = rings.mid.filter((n) => !(n.id in seal));
    const total = outerFree.length + midFree.length, wt = [0];
    for (let k = 1; k < count; k++) wt.push(2 + Math.floor((2.2 * (k - 1)) / Math.max(1, count - 2)));
    const wsum = wt.reduce((a, b) => a + b, 0);
    let acc = 0;
    for (let k = 1; k < count; k++) { const before = Math.round((total * acc) / wsum); acc += wt[k]; tgt[k] = Math.max(1, Math.round((total * acc) / wsum) - before); }
    for (let k = 1; k < count; k++) {
      // 1. 这一次到期的撤离点
      Object.entries(seal).forEach(([id, kk]) => { if (kk === k) alive.delete(id); });
      // 2. 按目标数封普通区域：第一层优先（上一次没封够的顺延），只封不会把剩下的区域切成更多块的
      const base = parts().length;
      // 冰潮成片推进：优先封紧挨着已封区域的（同层、同一片连着），这样不容易把剩下的区域切断，
      // 每次封的数量也更均匀
      let done = 0;
      while (done < tgt[k]) {
        const pool = outerFree.filter((n) => alive.has(n.id));
        // 第二层从倒数第三次开始封；第一层剩下的多半是通往撤离点的必经之路，封不了时由第二层顶上
        if (k >= Math.min(2, count - 3)) pool.push(...midFree.filter((n) => alive.has(n.id)));
        const touch = (n) => g.adj[n.id].filter((v) => !alive.has(v)).length;
        const cand = rng.shuffle(pool).sort((a, b) => (a.ring === 'outer' ? 0 : 1) - (b.ring === 'outer' ? 0 : 1) || touch(b) - touch(a));
        let ok = false;
        for (const n of cand) {
          alive.delete(n.id);
          if (parts().length <= base) { seal[n.id] = k; done++; ok = true; break; }
          alive.add(n.id);
        }
        if (!ok && done === 0) {
          // 一个都封不了（剩下的全是必经之路）：退而求其次，允许切出一小块（≤ 3 个、里面没有首领殿也没有之后还开的撤离点），
          // 这一小块会在下面第 3 步一起被吞掉。保证每次冰潮至少封一个，不会出现"涨了但什么都没封"
          let best = null;
          for (const n of cand) {
            alive.delete(n.id);
            const lost = parts().filter((c) => !c.has('boss') && ![...c].some((id) => ctx.exits.some((x) => x.node === id && seal[id] > k))).reduce((s, c) => s + c.size, 0);
            alive.add(n.id);
            if (lost <= 3 && (!best || lost < best[1])) best = [n, lost];
          }
          if (best) { alive.delete(best[0].id); seal[best[0].id] = k; done++; ok = true; }
        }
        if (!ok) break;
      }
      if (done < tgt[k] && k + 1 < count) tgt[k + 1] += tgt[k] - done;
      // 3. 被撤离点切出去、和首领殿不通、里面也没有之后还开着的撤离点的小块，一起被冰潮吞掉
      let extra = 0;
      for (const comp of parts()) {
        if (comp.has('boss')) continue;
        if ([...comp].some((id) => ctx.exits.some((x) => x.node === id && seal[id] > k))) continue;
        comp.forEach((id) => { seal[id] = k; alive.delete(id); extra++; });
      }
      // 一起吞掉的小块也算这一次封的，下一次相应少封几个（但仍至少 1 个）
      if (extra && k + 1 < count) tgt[k + 1] = Math.max(1, tgt[k + 1] - extra);
    }
    g.nodes.forEach((n) => { if (!(n.id in seal)) seal[n.id] = count; });
    ctx.tide = { every, count, seal };
  }

  /* ---------------- 9 装配 ---------------- */
  const RING_MULT = { outer: 1, mid: 1.3, inner: 1.7, core: 2 };
  const RARITY_ROLL = { // 怪物稀有度：普通 / 精良 / 稀有
    outer: [[0, 60], [1, 32], [2, 8]], mid: [[0, 35], [1, 43], [2, 22]], inner: [[0, 15], [1, 45], [2, 40]],
  };
  const RNAME = ['普通', '精良', '稀有'];

  function enemyUnit(rng, base, rarity, tier, ring) {
    const affixN = rarity;
    const af = rng.shuffle(AFFIX_KEYS).slice(0, affixN);
    const mult = (1 + (tier - 1) * 0.07) * [1, 1.15, 1.35][rarity] * (ring === 'inner' ? 1.1 : 1);
    const st = base.st.map((v, i) => (i === 3 ? v + rarity * 2 : Math.round(v * (i === 2 ? mult * 1.5 : mult))));
    return { nm: base.nm, p: base.p, c: base.c, m: base.m, st, rarity, rk: RNAME[rarity] + (affixN ? ' · ' + affixN + ' 词缀' : ''), af, trait: base.trait };
  }
  function lootRoll(rng, n, ringMult, minRare) {
    const out = [];
    for (let i = 0; i < n; i++) {
      const kind = rng.weighted([['sigil', 3], ['craft', 4], ['mat', 2], ['use', 1], ['rare', 0.4 * ringMult]]);
      const [icon, name] = rng.pick(ITEMS[kind]);
      let r = rng.weighted([[0, 40], [1, 34 * ringMult], [2, 18 * ringMult], [3, 6 * ringMult], [4, 2 * ringMult]]);
      if (i === 0 && minRare) r = Math.max(r, 2);
      const q = kind === 'craft' || kind === 'mat' ? rng.int(1, kind === 'craft' && icon === 'cur-dust' ? 12 : 3) : 0;
      out.push({ icon, r, name: kind === 'sigil' ? rng.pick(SIGIL_NAMES) : name, kind, q });
    }
    return out;
  }

  function dressRooms(ctx) {
    const { g, biome, seed, tier } = ctx;
    const pool = biome.pool;
    const byName = Object.fromEntries([...pool.low, ...pool.high].map((u) => [u.nm, u]));
    let lordIdx = 0;
    for (const n of g.nodes) {
      const rng = makeRng(seed, 'room', n.id, VERSION);
      const rm = RING_MULT[n.ring] || 1;
      const ring = n.ring === 'core' ? 'inner' : n.ring;
      const roll = () => rng.weighted(RARITY_ROLL[ring] || RARITY_ROLL.inner);
      switch (n.t) {
        case 'guard': case 'vguard': {
          const team = [];
          for (let i = 0; i < 4; i++) { const r = roll(); team.push(enemyUnit(rng, rng.pick(r ? pool.high : pool.low), r, tier, ring)); }
          team.sort((a, b) => b.rarity - a.rarity);
          // rw：胜利可得，[图标, 名称, 说明]；只是预告，真正发什么在原型的 encFight 里一次算定
          n.enc = { kind: '驻守敌人', team, rw: [['node-loot', '一堆战利品', '留在原地，打完走过去拿']], tip: '驻守敌人不会移动，不想打可以绕路。' };
          break;
        }
        case 'nest': {
          const team = [0, 1, 2, 3].map((i) => enemyUnit(rng, rng.pick(i < 2 ? pool.high : pool.low.concat(pool.high)), i < 2 ? 2 : 1, tier, ring));
          n.enc = { kind: '稀有怪巢', team, rw: [['cur-quality', '遗物', '三选一']], tip: '' };
          break;
        }
        case 'lord': {
          const L = biome.lords[lordIdx++ % biome.lords.length];
          const lead = { nm: L.nm, p: L.p, c: L.c, m: L.m, st: L.st.map((v, i) => (i === 2 ? v * 2 : Math.round(v * 1.3))), rarity: 3, rk: '领主', af: [rng.pick(AFFIX_KEYS)], trait: L.trait, lead: true };
          const team = [lead, ...L.guards.map((nm) => enemyUnit(rng, byName[nm], 2, tier, ring))];
          n.name = L.nm;
          n.enc = { kind: '领主', team, phases: L.phases, rw: [['sigil-silver', '传说以上刻印', '必掉'], ['mat-soul', L.drop.replace(/^首杀解锁/, ''), '首次击败']], tip: L.trait + '。' };
          break;
        }
        case 'boss': {
          const B = biome.boss;
          const lead = { nm: B.nm, p: B.p, c: B.c, m: B.m, st: B.st.map((v, i) => (i === 2 ? v * 2 : Math.round(v * 1.3))), rarity: 4, rk: '首领', af: ['先发', '冰封'], trait: B.trait, lead: true };
          const team = [lead, ...[0, 1, 2].map(() => enemyUnit(rng, rng.pick(pool.high), 2, tier, 'inner'))];
          n.name = B.nm;
          n.enc = { kind: '首领', team, phases: B.phases, rw: [['node-extract', '首领传送门', '打开后可撤离'], ['sigil-iron', '首领掉落', '必掉'], ['mat-soul', '首杀铭文', '首次击败']], tip: B.trait + '。' };
          break;
        }
        case 'coffin': {
          const team = [enemyUnit(rng, rng.pick(pool.high), 2, tier, ring), ...[0, 1, 2].map(() => enemyUnit(rng, rng.pick(pool.low), 1, tier, ring))];
          n.enc = { kind: '冰封棺', team, rw: [['node-chest', '棺中的战利品箱', '打赢直接拿走']], tip: '砸开冰层会惊醒里面的东西，必定开战。不砸也可以走，但冰潮漫进第二层时它会自己破冰出来游荡。' };
          n.loot = lootRoll(rng, 3, rm, true);
          break;
        }
        case 'loot': n.loot = lootRoll(rng, rng.int(2, 3), rm, false); break;
        case 'supply': n.loot = lootRoll(rng, rng.int(1, 2), 0.6, false).map((x) => (x.kind === 'sigil' ? { icon: 'use-potion', r: 1, name: '药剂', kind: 'use', q: 1 } : x)); break;
        case 'chest': case 'vsafe': n.loot = lootRoll(rng, rng.int(3, 4), rm, true); break;
        case 'ore': n.loot = [{ icon: 'mat-memory', r: 2, name: '六色的碎梦 · 碎片', kind: 'mat', q: rng.int(1, 2) }, { icon: 'cur-dust', r: 0, name: '刻尘', kind: 'craft', q: rng.int(4, 9) }]; break;
        case 'shrine': n.options = rng.shuffle(SHRINE_POOL).slice(0, 2); break;
        case 'merchant': n.loot = lootRoll(rng, 4, rm, false); break;
        default: break;
      }
    }
  }

  function namePlaces(ctx, rng) {
    const P = ctx.biome.places, pools = { outer: rng.shuffle(P.outer), mid: rng.shuffle(P.mid), inner: rng.shuffle(P.inner) };
    let pk = 0;
    for (const n of ctx.g.nodes) {
      if (n.t === 'boss') n.place = P.core;
      else if (n.pocket) n.place = P.pocket[pk++ % P.pocket.length];
      else n.place = pools[n.ring].shift() || n.id;
    }
  }

  /* ---------------- 入口 ---------------- */
  function generate(opts) {
    const seed = String(opts.seed ?? 'abyss');
    const rt = RUN_TYPES[opts.runType || 'standard'];
    const biome = BIOMES[opts.biome || 'winter'];
    const compasses = opts.compasses || ['blood', 'rival'];
    const tier = opts.tier || 6;
    let last = null;
    for (let attempt = 0; attempt < 40; attempt++) {
      const s = (stage) => makeRng(seed, VERSION, attempt, stage);
      const ctx = { seed, rt, biome, compasses, tier, attempt, rng: s('skeleton'), rngShape: s('shape'), rngExit: s('exit'), rngLayout: s('layout') };
      buildSkeleton(ctx);
      layoutSites(ctx);
      buildRegions(ctx);
      repairRim(ctx);
      ctx.rng = s('link'); linkGraph(ctx);
      if (ctx.fail) { last = { ctx, errors: [ctx.fail] }; if (opts.debug) opts.debug.push(opts.debugFull ? ctx.fail : ctx.fail.split(' ')[0]); continue; }
      placeAnchors(ctx);
      ctx.rng = s('event'); placeEvents(ctx);
      ctx.rng = s('rooms'); fillRooms(ctx);
      ctx.rng = s('patrol'); placePatrols(ctx);
      ctx.rngTide = s('tide'); placeTide(ctx);
      placeDoors(ctx); centerSites(ctx);
      const errors = validate(ctx);
      last = { ctx, errors };
      if (opts.debug) errors.forEach((e) => opts.debug.push(opts.debugFull ? e : e.split(' ')[0]));
      if (!errors.length) { dressRooms(ctx); namePlaces(ctx, s('names')); return pack(ctx, attempt, []); }
    }
    if (last.ctx.exits) { if (!last.ctx.tide && last.ctx.patrols) { last.ctx.rngTide = makeRng(seed, 'tide'); placeTide(last.ctx); } placeDoors(last.ctx); dressRooms(last.ctx); namePlaces(last.ctx, makeRng(seed, 'names')); }
    return pack(last.ctx, 40, last.errors);
  }

  function pack(ctx, attempts, errors) {
    const { g } = ctx;
    return {
      version: VERSION, seed: ctx.seed, attempts, errors, steps: ctx.rt.steps, runType: ctx.rt.name, biome: ctx.biome.name, mark: ctx.biome.mark,
      entry: ctx.entry, exits: ctx.exits, events: ctx.events, patrols: ctx.patrols, shortfall: ctx.shortfall,
      tide: ctx.tide, tideName: ctx.biome.tideName, layers: ctx.biome.layers,
      nodes: g.nodes.map(({ gx, gy, cell, ...n }) => ({ ...n, cell: (cell || []).map((p) => [Math.round(p[0]), Math.round(p[1])]) })),
      edges: g.edges, outline: ctx.outline,
      // 相邻但没有通道的边界 = 墙，渲染时画成实线
      walls: Object.entries(ctx.nb || {}).flatMap(([u, m]) => Object.entries(m).filter(([v, x]) => u < v && !g.eset.has(u < v ? u + '|' + v : v + '|' + u) && x.len >= 6).map(([v, x]) => ({ u, v, seg: x.seg.map((p) => p.map(Math.round)) }))),
      // center = 首领殿（深渊最深处）的屏幕坐标；不再是固定的屏幕中心
      center: [g.byId.boss.x, g.byId.boss.y],
    };
  }

  const api = { VERSION, generate, makeRng, RUN_TYPES, BIOMES, THEMES, themeOf, EVENTS, AFFIX };
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.ExpeditionMapGen = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
