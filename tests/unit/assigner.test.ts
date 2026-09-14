/**
 * 分拣引擎测试（AIRP 阶级/种族 → 特质/技能自动编配）。
 *
 * 关键约束：
 *   - 显式 skillId/traitIds 永远优先；分拣只填空缺（traitIds 省略才编配，空数组=不要特质）
 *   - 确定性：同一 externalId 永远编出同一套
 *   - 池与注册库同步：池里任何 code 必须已实现/已注册（防池漂移）
 */
import { describe, it, expect } from 'vitest';
import {
  normalizeTier,
  assignSnapshot,
  assignBattleRequest,
  skillDisplayOf,
  TIER_SKILL_POOL,
  TIER_TRAIT_POOL,
} from '@session/assigner';
import { validateBattleRequest } from '@session/validateRequest';
import { implementedTraitIds } from '@engine/traits';
import { skillLibraryIds } from '@engine/skills/library';
import { BaseColor } from '@engine/types';
import type { CombatantSnapshot } from '@session/contract';

function snapshot(over: Partial<CombatantSnapshot> = {}): CombatantSnapshot {
  return {
    externalId: 'e1',
    name: '敌人',
    stats: { hp: 40, attack: 4, armor: 0, magic: 6 },
    manaColors: [BaseColor.Red],
    manaCost: 12,
    ...over,
  };
}

const VALIDATE_OPTS = {
  knownSkillIds: new Set(skillLibraryIds()),
  knownTraitIds: new Set(implementedTraitIds()),
};

describe('normalizeTier 阶级归一化', () => {
  it('中文别名与英文键都收', () => {
    expect(normalizeTier('杂兵')).toBe('minion');
    expect(normalizeTier('精英')).toBe('elite');
    expect(normalizeTier('首领')).toBe('boss');
    expect(normalizeTier('领主')).toBe('lord');
    expect(normalizeTier('传奇')).toBe('legendary');
    expect(normalizeTier('Legendary')).toBe('legendary');
  });

  it('未提供返回 undefined，不认识返回 null', () => {
    expect(normalizeTier(undefined)).toBeUndefined();
    expect(normalizeTier('神仙')).toBeNull();
  });
});

describe('assignSnapshot 编配', () => {
  it('只给 tier：skillId 与 traitIds 都自动补齐，且数量按阶级递增', () => {
    const minion = snapshot({ externalId: 'a', tier: '杂兵' });
    assignSnapshot(minion);
    expect(minion.skillId).toBeDefined();
    expect(minion.traitIds!.length).toBe(1);

    const legendary = snapshot({ externalId: 'b', tier: '传奇' });
    assignSnapshot(legendary);
    expect(legendary.traitIds!.length).toBe(3);
  });

  it('确定性：同一 externalId 多次编配结果一致', () => {
    const a = snapshot({ externalId: 'enemy-77', tier: '精英' });
    const b = snapshot({ externalId: 'enemy-77', tier: '精英' });
    assignSnapshot(a);
    assignSnapshot(b);
    expect(a.skillId).toBe(b.skillId);
    expect(a.traitIds).toEqual(b.traitIds);
  });

  it('显式 skillId / traitIds 优先，分拣不覆盖', () => {
    const s = snapshot({ tier: '传奇', skillId: '7004', traitIds: ['armored'] });
    assignSnapshot(s);
    expect(s.skillId).toBe('7004');
    expect(s.traitIds).toEqual(['armored']);
  });

  it('traitIds 空数组 = 宿主明确不要特质，保持为空', () => {
    const s = snapshot({ tier: 'boss', traitIds: [] });
    assignSnapshot(s);
    expect(s.traitIds).toEqual([]);
  });

  it('种族标志性特质：Knight 编入 knightbond 并排最前', () => {
    const s = snapshot({ tier: 'boss', troopTypes: ['Knight'] });
    assignSnapshot(s);
    expect(s.traitIds!.includes('knightbond')).toBe(true);
    expect(s.traitIds![0]).toBe('knightbond');
  });

  it('tier 不可识别时不做任何事（交给校验层报错）', () => {
    const s = snapshot({ tier: '神仙' });
    assignSnapshot(s);
    expect(s.skillId).toBeUndefined();
    expect(s.traitIds).toBeUndefined();
  });
});

describe('池与注册库同步（防漂移）', () => {
  it('特质池里所有 code 都已实现', () => {
    const implemented = new Set(implementedTraitIds());
    for (const [tier, { codes }] of Object.entries(TIER_TRAIT_POOL)) {
      for (const code of codes) {
        expect(implemented.has(code), `${tier} 池中的 ${code} 未实现`).toBe(true);
      }
    }
  });

  it('技能池里所有 skillId 都已注册', () => {
    const registered = new Set(skillLibraryIds());
    for (const [, pool] of Object.entries(TIER_SKILL_POOL)) {
      for (const entry of pool) {
        expect(registered.has(entry.skillId), `${entry.skillId} 未注册`).toBe(true);
      }
    }
  });
});

describe('validateRequest 与分拣的契约', () => {
  it('tier 有效且省略 skillId/traitIds：校验通过', () => {
    const request = {
      schemaVersion: 1,
      battleId: 'b1',
      requestId: 'r1',
      rulesetVersion: '1.0.0',
      seed: 1,
      playerTeam: [snapshot({ externalId: 'p1', tier: '首领' })],
      enemyTeam: [snapshot({ externalId: 'e1', tier: 'minion' })],
    };
    const result = validateBattleRequest(request, VALIDATE_OPTS);
    expect(result.ok).toBe(true);
  });

  it('skillId 与 tier 都缺：missing-field 且提示 tier 用法', () => {
    const request = {
      schemaVersion: 1,
      battleId: 'b1',
      requestId: 'r1',
      rulesetVersion: '1.0.0',
      seed: 1,
      playerTeam: [snapshot({ externalId: 'p1' })],
      enemyTeam: [snapshot({ externalId: 'e1', tier: 'minion' })],
    };
    const result = validateBattleRequest(request, VALIDATE_OPTS);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      const issue = result.issues.find((i) => i.path.endsWith('.skillId'));
      expect(issue?.code).toBe('missing-field');
      expect(issue?.message).toContain('tier');
    }
  });

  it('未知阶级：unknown-tier', () => {
    const request = {
      schemaVersion: 1,
      battleId: 'b1',
      requestId: 'r1',
      rulesetVersion: '1.0.0',
      seed: 1,
      playerTeam: [snapshot({ externalId: 'p1', tier: '神仙' })],
      enemyTeam: [snapshot({ externalId: 'e1', tier: 'minion' })],
    };
    const result = validateBattleRequest(request, VALIDATE_OPTS);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.issues.some((i) => i.code === 'unknown-tier')).toBe(true);
    }
  });
});

describe('assignBattleRequest 与技能展示', () => {
  it('双方所有快照都被分拣', () => {
    const request = {
      playerTeam: [snapshot({ externalId: 'p1', tier: '精英' })],
      enemyTeam: [snapshot({ externalId: 'e1', tier: '杂兵' }), snapshot({ externalId: 'e2', tier: '领主' })],
    };
    assignBattleRequest(request);
    for (const s of [...request.playerTeam, ...request.enemyTeam]) {
      expect(s.skillId).toBeDefined();
      expect(s.traitIds!.length).toBeGreaterThan(0);
    }
  });

  it('skillDisplayOf：池内技能有展示文本，池外返回 null', () => {
    expect(skillDisplayOf('7004')?.name).toBe('狙击');
    expect(skillDisplayOf('99999')).toBeNull();
  });
});
