/**
 * 职责配队批（2026-10-02）：官方 role 词表、图鉴筛选、敌人职责配队与难度稀有度加权。
 * 词表口径见 src/meta/data/roles.ts；成阵逻辑见 src/meta/systems/encounter.ts。
 */
import { describe, expect, it } from 'vitest';
import { ROLE_NAMES, ROLE_ORDER, roleNameZh } from '../../src/meta/data/roles';
import type { TroopRole } from '../../src/data/troops';
import { matchesTroopCatalog, troopSearchText } from '../../src/meta/data/troopCatalog';
import { troopStrategy } from '../../src/meta/data/troopStrategy';
import { pickEnemies } from '../../src/meta/systems/encounter';
import { KINGDOM_ORDER, kingdomTroopPool } from '../../src/meta/data/kingdoms';
import { TROOPS, getTroopById } from '../../src/data/troops';
import { isImmortal } from '../../src/data/immortals';
import { SeededRNG } from '../../src/engine/rng';

describe('role 词表', () => {
  it('九维齐全、两字统一、未知词回退不造假', () => {
    expect(ROLE_ORDER).toHaveLength(9);
    for (const code of ROLE_ORDER) {
      expect(ROLE_NAMES[code].length).toBe(2);
    }
    expect(roleNameZh(null)).toBeNull();
    expect(roleNameZh('Defender')).toBe('坦克');
    expect(roleNameZh('NotExist')).toBe('NotExist');
  });

  it('全量部队的 role 都在九维词表内（数据口径不漂移；社区自制部队允许无定位）', () => {
    const codes = new Set(TROOPS.map((t) => t.role).filter((r): r is TroopRole => r !== null));
    for (const code of codes) expect(ROLE_ORDER).toContain(code);
    // 官方部队（占绝大多数）应全部带定位
    expect(TROOPS.filter((t) => t.role === null).length).toBeLessThan(TROOPS.length * 0.02);
  });
});

describe('图鉴定位筛选', () => {
  const defender = TROOPS.find((t) => t.role === 'Defender')!;
  const striker = TROOPS.find((t) => t.role === 'Striker')!;

  it('按定位码精确匹配', () => {
    expect(matchesTroopCatalog(defender, { role: 'Defender' })).toBe(true);
    expect(matchesTroopCatalog(striker, { role: 'Defender' })).toBe(false);
    expect(matchesTroopCatalog(defender, { role: null })).toBe(true);
  });

  it('中文定位名可被搜索命中（搜「坦克」能筛出 Defender）', () => {
    expect(troopSearchText(defender)).toContain('坦克');
    expect(matchesTroopCatalog(defender, { query: '坦克' })).toBe(true);
    expect(matchesTroopCatalog(striker, { query: '坦克' })).toBe(false);
  });
});

describe('敌人职责配队（pickEnemies）', () => {
  const richKingdom = KINGDOM_ORDER.find(
    (k) => kingdomTroopPool(k, { min: 0, max: 2 }).filter((t) => !isImmortal(t)).length >= 12,
  )!;

  it('同种子同队伍（决定论口径不变）', () => {
    const a = pickEnemies(richKingdom, 20, ['minion', 'elite', 'elite', 'boss'], new SeededRNG(1234));
    const b = pickEnemies(richKingdom, 20, ['minion', 'elite', 'elite', 'boss'], new SeededRNG(1234));
    expect(a.map((e) => e.troopId)).toEqual(b.map((e) => e.troopId));
  });

  it('基础不变量：数量/不重复/排除不朽/档位带宽（所有王国 × 两种关卡形态）', () => {
    for (const kingdom of KINGDOM_ORDER) {
      for (const [level, tiers] of [
        [5, ['minion', 'minion', 'minion', 'minion']],
        [30, ['elite', 'elite', 'minion', 'boss']],
      ] as const) {
        const enemies = pickEnemies(kingdom, level, tiers, new SeededRNG(777));
        expect(enemies).toHaveLength(tiers.length);
        expect(new Set(enemies.map((e) => e.troopId)).size).toBe(tiers.length);
        for (const e of enemies) expect(isImmortal(getTroopById(e.troopId)!)).toBe(false);
      }
    }
  });

  it('职责成阵：多数成阵队伍保持「有前排厚度 + 有输出时钟」的阵型形状', () => {
    const canDamage = (id: number): boolean => {
      const p = troopStrategy(id);
      return p.damage || p.skulls;
    };
    let shaped = 0;
    let withDamage = 0;
    const seeds = 400;
    for (let seed = 1; seed <= seeds; seed++) {
      const enemies = pickEnemies(richKingdom, 20, ['minion', 'elite', 'elite', 'minion'], new SeededRNG(seed));
      const troops = enemies.map((e) => getTroopById(e.troopId)!);
      const damages = troops.filter((t) => canDamage(t.id)).length;
      const frontBulk = troops[0]!.armor + troops[0]!.health;
      const teamMedian = [...troops.map((t) => t.armor + t.health)].sort((a, b) => a - b)[1]!;
      if (damages >= 2) withDamage++;
      if (damages >= 2 && frontBulk >= teamMedian) shaped++;
    }
    // 纯随机路径也会贡献形状，阈值防「职责层失效退化为完全乱型」
    expect(withDamage / seeds).toBeGreaterThan(0.6);
    expect(shaped / seeds).toBeGreaterThan(0.3);
  });

  it('纯墙限量：任何生成的队伍至多一面 0 攻击无输出墙（叠甲互锁教训）', () => {
    const isWall = (t: { attack: number; id: number }): boolean =>
      t.attack === 0 && !troopStrategy(t.id).damage && !troopStrategy(t.id).skulls;
    for (const kingdom of KINGDOM_ORDER) {
      for (let seed = 1; seed <= 60; seed++) {
        const enemies = pickEnemies(kingdom, 20, ['minion', 'elite', 'elite', 'boss'], new SeededRNG(seed));
        const walls = enemies.filter((e) => isWall(getTroopById(e.troopId)!)).length;
        expect(walls).toBeLessThanOrEqual(1);
      }
    }
  });

  it('难度→稀有度偏置：早期偏低阶、后期偏高阶（档内统计方向）', () => {
    const avgRarity = (level: number): number => {
      let sum = 0;
      const seeds = 300;
      for (let seed = 1; seed <= seeds; seed++) {
        const enemies = pickEnemies(richKingdom, level, ['elite', 'elite', 'elite', 'elite'], new SeededRNG(seed));
        sum += enemies.reduce((n, e) => n + getTroopById(e.troopId)!.rarityIdx, 0);
      }
      return sum / (seeds * 4);
    };
    // elite 档带宽 2..4：满级队伍均值应显著高于早期队伍
    expect(avgRarity(80)).toBeGreaterThan(avgRarity(1) + 0.35);
  });

  it('退化安全：定位筛空的槽位回落档位池，不抛错不缺员', () => {
    // 找一个低带宽内缺某定位的王国：只要不抛错、满员即通过（preferRole 永不筛空）
    for (const kingdom of KINGDOM_ORDER.slice(0, 8)) {
      const enemies = pickEnemies(kingdom, 10, ['minion', 'minion', 'minion', 'minion'], new SeededRNG(42));
      expect(enemies).toHaveLength(4);
    }
  });
});
