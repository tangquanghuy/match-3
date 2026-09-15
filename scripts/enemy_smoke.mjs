#!/usr/bin/env node
/**
 * 敌人千场烟雾（窗口 G · TASK-THEATER 阶段 2.1）。
 *
 * 纯引擎、无浏览器：经 vite 的 ssrLoadModule 在 Node 里加载 src/engine/**（逻辑层无 DOM 依赖），
 * 双方用「随机库内技能 + 随机已实现特质 + 随机种族」编队，固定种子跑完整场。
 * AI：双方同一策略——优先施放满法力角色的技能（引擎 AI 选择器自动选色/选目标/选格），
 * 否则 chooseEnemySwap 找最优交换，找不到就空过。
 *
 * 断言：不抛异常、终局可达（行动数上限内）、game-over 至多一次、事件流可序列化。
 * 用法：node scripts/enemy_smoke.mjs [--games 1000] [--seed0 0] [--actions-cap 300] [--quiet]
 * 产物：artifacts/theater/smoke/report.json + failures.txt（崩溃/超限清单）。
 */
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const OUT = path.join(ROOT, 'artifacts', 'theater', 'smoke');

const argv = process.argv.slice(2);
const argValue = (name, fb) => {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 && argv[i + 1] !== undefined && !argv[i + 1].startsWith('--') ? argv[i + 1] : fb;
};
const GAMES = Number(argValue('games', 1000));
const SEED0 = Number(argValue('seed0', 0));
const ACTIONS_CAP = Number(argValue('actions-cap', 300));
const QUIET = argv.includes('--quiet');

const COLORS = ['Red', 'Blue', 'Green', 'Yellow', 'Purple', 'Brown'];
const RACES = [
  'Beast', 'Fey', 'Elemental', 'Dragon', 'Human', 'Daemon', 'Divine', 'Monster',
  'Knight', 'Construct', 'Wildfolk', 'Rogue', 'Elf', 'Wargare', 'Giant', 'Undead',
  'Centaur', 'Goblin', 'Raksha', 'Mystic', 'Stryx', 'Naga', 'Merfolk', 'Urska',
  'Dwarf', 'Tauros', 'Orc', 'Mech', 'Gnome', 'Immortal',
];

async function main() {
  // 引擎模块经 vite 加载（与 dev 同一套别名/TS 管线；不落盘构建产物）
  const vite = await createServer({
    root: ROOT,
    server: { middlewareMode: true },
    appType: 'custom',
    logLevel: 'error',
    optimizeDeps: { noDiscovery: true },
  });
  const E = await vite.ssrLoadModule('/src/engine/index.ts');
  const AI = await vite.ssrLoadModule('/src/engine/ai.ts');
  const LIB = await vite.ssrLoadModule('/src/engine/skills/library.ts');
  const DATA = await vite.ssrLoadModule('/src/data/troops.ts');

  const registry = new E.ExtensionRegistry();
  LIB.registerSkillLibrary(registry.prototypes);
  const skillIds = [...registry.prototypes.keys()].filter((k) => !String(k).startsWith('__debug'));
  const traitCodes = E.TRAIT_LIBRARY.map((t) => t.code);
  if (skillIds.length === 0 || traitCodes.length === 0) {
    throw new Error('技能库/特质库为空，内容侧数据异常');
  }
  console.log(`[smoke] 引擎就绪：技能 ${skillIds.length} 条，特质 ${traitCodes.length} code`);

  let nextId = 1;
  const idGen = () => nextId++;

  /** 用 SeededRNG 从库里随机编一个角色（每场重置 idGen，保证同 seed 可复现） */
  function makeTeam(rng, side) {
    const team = [];
    for (let i = 0; i < 4; i++) {
      const skillId = skillIds[Math.floor(rng.next() * skillIds.length)];
      const traitCount = Math.floor(rng.next() * 4); // 0~3 个
      const traitIds = [];
      for (let k = 0; k < traitCount; k++) {
        traitIds.push(traitCodes[Math.floor(rng.next() * traitCodes.length)]);
      }
      team.push({
        id: idGen(),
        name: `${side}${i}`,
        maxHp: 60 + Math.floor(rng.next() * 60),
        hp: 0,
        attack: 8 + Math.floor(rng.next() * 14),
        armor: Math.floor(rng.next() * 8),
        magic: Math.floor(rng.next() * 5),
        colors: [COLORS[Math.floor(rng.next() * 6)], COLORS[Math.floor(rng.next() * 6)]],
        manaCost: 4 + Math.floor(rng.next() * 6),
        mana: 0,
        skillId,
        statuses: [],
        defeated: false,
        traitIds: [...new Set(traitIds)],
        troopTypes: [RACES[Math.floor(rng.next() * RACES.length)]],
      });
      team[team.length - 1].hp = team[team.length - 1].maxHp;
    }
    return team;
  }

  const results = [];
  let crash = 0;
  let unbounded = 0;
  let multiGameOver = 0;
  let finished = 0;

  for (let g = 0; g < GAMES; g++) {
    const seed = SEED0 + g;
    const rec = { seed, ok: false, actions: 0, gameOverEvents: 0, error: null };
    try {
      // 每场全新的 rng/idGen/引擎（引擎在构造期吃开局风暴特质等，不可复用）
      nextId = 1;
      const rng = new E.SeededRNG(seed);
      const playerTeam = makeTeam(rng, 'L');
      const enemyTeam = makeTeam(rng, 'R');
      const board = new E.BoardGenerator(rng, idGen, 0.16).generate();
      const state = E.createGameState(
        board,
        { player: E.PlayerSide.Left, characters: playerTeam },
        { player: E.PlayerSide.Right, characters: enemyTeam },
      );
      const engine = new E.TurnEngine(state, rng, idGen, registry);
      engine.setSummonResolver((ref) => DATA.troopToSummonTemplate(ref));
      E.setSummonTemplateResolver((spec) => DATA.troopToSummonTemplate(spec.referenceName));
      engine.skullChance = 0.16;

      let gameOverEvents = 0;
      let actions = 0;
      while (state.state !== E.MatchState.GameOver && actions < ACTIONS_CAP) {
        const side = state.activePlayer;
        const team = state.teams[side];
        // 1) 有满法力角色就施放（AI 选择器已默认装配）
        const caster = team.characters.find(
          (c) => !c.defeated && E.ManaDistributor.isSkillCastable(c.mana, c.manaCost),
        );
        let events;
        if (caster) {
          events = engine.resolveAction({ type: 'cast', characterId: caster.id });
        } else {
          // 2) 最优交换；3) 无交换空过
          const swap = AI.chooseEnemySwap(state.board, rng);
          events = swap ? engine.resolveSwap(swap.a, swap.b) : engine.passTurn();
        }
        if (events.length === 0) {
          // 全被拒绝（罕见死锁）：强制空过避免原地打转
          events = engine.passTurn();
          if (events.length === 0) break;
        }
        gameOverEvents += events.filter((e) => e.type === 'game-over').length;
        JSON.stringify(events); // 事件流必须可序列化（回传契约的隐含要求）
        actions += 1;
      }
      rec.actions = actions;
      rec.gameOverEvents = gameOverEvents;
      if (state.state !== E.MatchState.GameOver) {
        rec.error = `unbounded: ${ACTIONS_CAP} 行动内未终局`;
        unbounded += 1;
      } else if (gameOverEvents !== 1) {
        rec.error = `game-over 事件数=${gameOverEvents}（应为 1）`;
        multiGameOver += 1;
      } else {
        rec.ok = true;
        finished += 1;
      }
    } catch (e) {
      rec.error = String(e && e.stack || e).split('\n').slice(0, 4).join(' | ');
      crash += 1;
    }
    results.push(rec);
    if (!QUIET && (g + 1) % 100 === 0) {
      console.log(`[smoke] ${g + 1}/${GAMES} 场 · 崩溃 ${crash} · 超限 ${unbounded} · 异常终局 ${multiGameOver}`);
    }
  }

  await vite.close().catch(() => {});

  await mkdir(OUT, { recursive: true });
  const failures = results.filter((r) => !r.ok);
  const summary = {
    games: GAMES,
    seed0: SEED0,
    actionsCap: ACTIONS_CAP,
    librarySize: skillIds.length,
    traitCodes: traitCodes.length,
    finished,
    crash,
    unbounded,
    multiGameOver,
    generatedAt: new Date().toISOString(),
  };
  await writeFile(path.join(OUT, 'report.json'), JSON.stringify({ summary, failures }, null, 1), 'utf8');
  await writeFile(
    path.join(OUT, 'failures.txt'),
    failures.length === 0 ? '（零失败）\n' : failures.map((r) => `seed=${r.seed} ${r.error}`).join('\n') + '\n',
    'utf8',
  );

  console.log('[smoke] 完成：', JSON.stringify(summary));
  if (failures.length > 0) {
    console.log(`[smoke] 失败 ${failures.length} 场，清单见 artifacts/theater/smoke/failures.txt`);
    process.exitCode = 2;
  }
}

main().catch((e) => {
  console.error('[smoke] 失败：', e);
  process.exitCode = 1;
});
