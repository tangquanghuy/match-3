/**
 * 武器数据审计（窗口 K · 子包 K-A 的机器关卡）。
 *
 * 数据源：artifacts/gowhead-weapons/raw/*.json（gowhead 718 把武器快照）
 * 经 scripts/build_weapons.mjs 生成 src/data/weapons.json，本套件是它的回归护栏：
 *   A. 数据完整性 —— 718 条不缺不重（id/referenceName 唯一）、必填字段齐全
 *   B. 值域       —— rarity/rarityIdx 一致、manaColors ⊆ 6 色、数值区间、weaponType 白名单、
 *                    王国中文名全部命中 troops.json 的王国集合（映射缺口不允许自造译名）
 *   C. 法术与缩放 —— spell.description 非空；描述含括号公式时 meta.parsed=true 且 scalings 非空
 *                    （内联解析器与 src/engine/skills/scaling.ts 等价性的数据侧锚点）
 *   D. 淬炼词缀   —— affixes 结构合法（name/description 非空 + 稀有度白名单）
 *   E. 快照断言   —— 5 把已知武器（骑士之剑/雅思敏的弓/野性匕首/暗影使者/在劫难逃的匕首）
 *                    锁定中文名/费用/公式解析值，期望值从 raw dump 人工核对后写死
 *   F. 名称覆盖   —— 中文名覆盖率与英文回退清单锁定（1720/1721 两把新武器官方未翻译）
 *
 * 人工核对只需复核本套件测不了的部分：法术文本的官方语义（归 K-B 组装批）。
 */
import { describe, it, expect } from 'vitest';
import { BaseColor } from '@engine/types';
import weaponsJson from '../../src/data/weapons.json';
import troopsJson from '../../src/data/troops.json';

interface ScalingSpec {
  base: number;
  mult: number;
}

interface SecondaryModifier {
  kind: 'multiplier' | 'ratio';
  a: number;
  b?: number;
}

interface WeaponAffix {
  name: string;
  description: string;
  rarity: string;
}

/** src/data/weapons.json 单条记录（与 build_weapons.mjs 的产出 schema 一一对应） */
interface WeaponRow {
  id: number;
  name: string;
  nameEn: string;
  referenceName: string;
  rarity: string;
  rarityIdx: number;
  kingdom: string | null;
  weaponType: string;
  attack: number;
  armor: number;
  health: number;
  magic: number;
  manaColors: string[];
  manaCost: number;
  spell: {
    id: number;
    name: string;
    description: string;
    meta: {
      scalings: ScalingSpec[];
      raw: string;
      parsed: boolean;
      modifier?: SecondaryModifier;
    };
  };
  affixes: WeaponAffix[];
  masteryRequirement: number | null;
  releaseDate: number | null;
  immortal: boolean;
  imageFile: string;
}

const WEAPONS = weaponsJson as unknown as WeaponRow[];
const TROOP_KINGDOMS = new Set(
  (troopsJson as unknown as { kingdom: string | null }[])
    .map((t) => t.kingdom)
    .filter((k): k is string => k !== null),
);

/** 武器稀有度 7 档（比兵种少 Legendary、多 Doomed），下标 = RarityIdx */
const RARITIES = ['Common', 'Uncommon', 'Rare', 'UltraRare', 'Epic', 'Mythic', 'Doomed'] as const;

/** gowhead 武器的 14 个武器类型（TroopType 字段承载） */
const WEAPON_TYPES = new Set([
  'Sword', 'Bow', 'Axe', 'Polearm', 'Staff', 'Hammer', 'Dagger', 'Missile',
  'Tome', 'Mace', 'Scythe', 'Shield', 'Artifact', 'Jewellery',
]);

const BASE_COLORS = new Set(Object.values(BaseColor));

/** 词缀稀有度走兵种稀有度词表（淬炼按稀有度晋升级解锁，无 Doomed 档） */
const AFFIX_RARITIES = new Set(['Rare', 'UltraRare', 'Epic', 'Legendary', 'Mythic']);

const CJK_RE = /[\u4e00-\u9fff]/;
const BRACKET_RE = /\[[^\]]*\]/;

const BY_ID = new Map(WEAPONS.map((w) => [w.id, w]));

describe('A · 数据完整性（718 条不缺不重）', () => {
  it('总数 718（gowhead 全量快照）', () => {
    expect(WEAPONS.length).toBe(718);
  });

  it('id 与 referenceName 各自唯一（不缺不重）', () => {
    const ids = new Set<number>();
    const refs = new Set<string>();
    const problems: string[] = [];
    for (const w of WEAPONS) {
      if (ids.has(w.id)) problems.push(`id 重复: ${w.id}`);
      if (refs.has(w.referenceName)) problems.push(`referenceName 重复: ${w.referenceName}`);
      ids.add(w.id);
      refs.add(w.referenceName);
    }
    expect(problems, problems.slice(0, 5).join(' | ')).toEqual([]);
    expect(ids.size).toBe(718);
    expect(refs.size).toBe(718);
  });

  it('必填字段齐全（name/nameEn/referenceName/kingdom/imageFile）', () => {
    const problems: string[] = [];
    for (const w of WEAPONS) {
      const tag = `${w.id}(${w.referenceName})`;
      if (!w.name) problems.push(`${tag} 缺 name`);
      if (!w.nameEn) problems.push(`${tag} 缺 nameEn`);
      if (!w.referenceName) problems.push(`${tag} 缺 referenceName`);
      if (!w.kingdom) problems.push(`${tag} 缺 kingdom（快照 718 把全部有归属）`);
      if (w.imageFile !== `${w.id}_${w.referenceName}.webp`) {
        problems.push(`${tag} imageFile「${w.imageFile}」不符合 {Id}_{ReferenceName}.webp 约定`);
      }
      if (typeof w.immortal !== 'boolean') problems.push(`${tag} immortal 非布尔`);
    }
    expect(problems, `前 ${Math.min(5, problems.length)} 条 → ${problems.slice(0, 5).join(' | ')}`).toEqual([]);
  });

  it('spell.id 全库唯一且为正数（K-B 组装批的注册键）', () => {
    const spellIds = new Set<number>();
    for (const w of WEAPONS) {
      expect(w.spell.id, `${w.id} spell.id 非法`).toBeGreaterThan(0);
      expect(spellIds.has(w.spell.id), `spell.id 重复: ${w.spell.id}`).toBe(false);
      spellIds.add(w.spell.id);
    }
    expect(spellIds.size).toBe(718);
  });
});

describe('B · 值域与引用', () => {
  it('rarity ∈ 7 档且与 rarityIdx 查表一致', () => {
    const problems: string[] = [];
    for (const w of WEAPONS) {
      if (!(RARITIES as readonly string[]).includes(w.rarity)) {
        problems.push(`${w.id} rarity「${w.rarity}」非法`);
      }
      if (!Number.isInteger(w.rarityIdx) || w.rarityIdx < 0 || w.rarityIdx > 6) {
        problems.push(`${w.id} rarityIdx=${w.rarityIdx} 超出 [0,6]`);
      } else if (RARITIES[w.rarityIdx] !== w.rarity) {
        problems.push(`${w.id} rarityIdx=${w.rarityIdx} 但 rarity=${w.rarity}（应为 ${RARITIES[w.rarityIdx]}）`);
      }
    }
    expect(problems, `前 ${Math.min(5, problems.length)} 条 → ${problems.slice(0, 5).join(' | ')}`).toEqual([]);
  });

  it('weaponType ∈ 14 类白名单', () => {
    const illegal = WEAPONS.filter((w) => !WEAPON_TYPES.has(w.weaponType));
    expect(illegal.map((w) => `${w.id}:${w.weaponType}`)).toEqual([]);
  });

  it('manaColors 非空、⊆ 6 基色、无重复', () => {
    const problems: string[] = [];
    for (const w of WEAPONS) {
      if (w.manaColors.length === 0) problems.push(`${w.id} manaColors 为空`);
      if (w.manaColors.length > 6) problems.push(`${w.id} manaColors 超过 6 色`);
      for (const c of w.manaColors) {
        if (!BASE_COLORS.has(c as BaseColor)) problems.push(`${w.id} manaColors 含非法色「${c}」`);
      }
      if (new Set(w.manaColors).size !== w.manaColors.length) {
        problems.push(`${w.id} manaColors 有重复`);
      }
    }
    expect(problems, `前 ${Math.min(5, problems.length)} 条 → ${problems.slice(0, 5).join(' | ')}`).toEqual([]);
  });

  it('数值区间合理（装备加成/法力费用/精通需求）', () => {
    const problems: string[] = [];
    const range = (v: number, lo: number, hi: number, tag: string, field: string) => {
      if (!(v >= lo && v <= hi)) problems.push(`${tag} ${field}=${v} 超出 [${lo},${hi}]`);
    };
    for (const w of WEAPONS) {
      const tag = `${w.id}(${w.referenceName})`;
      range(w.manaCost, 1, 30, tag, 'manaCost');
      range(w.attack, 0, 30, tag, 'attack');
      range(w.armor, 0, 30, tag, 'armor');
      range(w.health, 0, 30, tag, 'health');
      range(w.magic, 0, 30, tag, 'magic');
      if (w.masteryRequirement === null || w.masteryRequirement < 0) {
        problems.push(`${tag} masteryRequirement=${w.masteryRequirement} 非法`);
      }
      if (w.releaseDate !== null && !(w.releaseDate > 0)) {
        problems.push(`${tag} releaseDate=${w.releaseDate} 非法（unix 秒或 null）`);
      }
    }
    expect(problems, `前 ${Math.min(5, problems.length)} 条 → ${problems.slice(0, 5).join(' | ')}`).toEqual([]);
  });

  it('王国中文名全部命中 troops.json 的王国集合（映射缺口零容忍）', () => {
    const missing = WEAPONS.filter((w) => w.kingdom === null || !TROOP_KINGDOMS.has(w.kingdom));
    expect(missing.map((w) => `${w.id}:${w.kingdom ?? 'null'}`)).toEqual([]);
  });

  it('王国全部是中文名（英文只能出现在映射缺口清单里，当前应为空）', () => {
    const nonCJK = WEAPONS.filter((w) => w.kingdom === null || !CJK_RE.test(w.kingdom));
    expect(nonCJK.map((w) => `${w.id}:${w.kingdom ?? 'null'}`)).toEqual([]);
  });
});

describe('C · 法术文本与缩放预解析', () => {
  it('每条 spell.description 非空且 meta.raw 与之逐字相等', () => {
    const problems: string[] = [];
    for (const w of WEAPONS) {
      if (!w.spell.description) problems.push(`${w.id} spell.description 为空`);
      if (w.spell.meta.raw !== w.spell.description) {
        problems.push(`${w.id} meta.raw 与 description 不一致`);
      }
      if (!w.spell.name) problems.push(`${w.id} spell.name 为空`);
    }
    expect(problems, `前 ${Math.min(5, problems.length)} 条 → ${problems.slice(0, 5).join(' | ')}`).toEqual([]);
  });

  it('描述含括号公式 ⇒ meta.parsed=true 且 scalings/modifier 至少其一非空（无漏网 token）', () => {
    const problems: string[] = [];
    let withFormula = 0;
    for (const w of WEAPONS) {
      const { description, meta } = w.spell;
      if (BRACKET_RE.test(description)) {
        withFormula++;
        if (!meta.parsed) problems.push(`${w.id} 含括号公式但 parsed=false`);
        // 大多数公式是 [魔法±N] 缩放；21 条的括号仅为二级修饰 [xN]（如「创造 9 颗冻结宝石。[x10]」），
        // 此时 scalings 为空但必须有 modifier 兜底
        if (meta.scalings.length === 0 && meta.modifier === undefined) {
          problems.push(`${w.id} 含括号公式但 scalings/modifier 双空`);
        }
      } else if (meta.parsed && meta.scalings.length === 0 && meta.modifier === undefined) {
        problems.push(`${w.id} parsed=true 但无任何解析产物`);
      }
    }
    expect(withFormula).toBe(666); // 与构建报告口径一致：666 含公式 / 52 纯文本
    expect(problems, `前 ${Math.min(5, problems.length)} 条 → ${problems.slice(0, 5).join(' | ')}`).toEqual([]);
  });

  it('scalings/modifier 结构合法（数值有限、modifier kind 白名单）', () => {
    const problems: string[] = [];
    for (const w of WEAPONS) {
      for (const s of w.spell.meta.scalings) {
        if (!Number.isFinite(s.base) || !Number.isFinite(s.mult)) {
          problems.push(`${w.id} scalings 含非有限数值 ${JSON.stringify(s)}`);
        }
      }
      const mod = w.spell.meta.modifier;
      if (mod !== undefined) {
        if (mod.kind !== 'multiplier' && mod.kind !== 'ratio') {
          problems.push(`${w.id} modifier.kind「${String(mod.kind)}」非法`);
        }
        if (!Number.isFinite(mod.a)) problems.push(`${w.id} modifier.a 非有限数值`);
        if (mod.kind === 'ratio' && !Number.isFinite(mod.b)) {
          problems.push(`${w.id} ratio modifier 缺 b`);
        }
      }
    }
    expect(problems, `前 ${Math.min(5, problems.length)} 条 → ${problems.slice(0, 5).join(' | ')}`).toEqual([]);
  });
});

describe('D · 淬炼词缀结构', () => {
  it('每条 affix 的 name/description 非空且 rarity ∈ 词缀稀有度词表', () => {
    const problems: string[] = [];
    let count = 0;
    for (const w of WEAPONS) {
      for (const a of w.affixes) {
        count++;
        const tag = `${w.id}(${w.referenceName})`;
        if (!a.name) problems.push(`${tag} affix 缺 name`);
        if (!a.description) problems.push(`${tag} affix「${a.name}」缺 description`);
        if (!AFFIX_RARITIES.has(a.rarity)) problems.push(`${tag} affix「${a.name}」rarity「${a.rarity}」非法`);
      }
    }
    expect(count).toBeGreaterThanOrEqual(2799); // 覆盖率不回退护栏（2026-09-17 快照 = 2799）
    expect(problems, `前 ${Math.min(5, problems.length)} 条 → ${problems.slice(0, 5).join(' | ')}`).toEqual([]);
  });
});

describe('E · 已知武器快照断言（期望值从 raw dump 人工核对后写死）', () => {
  it('骑士之剑 1000（Common 起点：[(魔法/2)+3] 半魔法缩放）', () => {
    const w = BY_ID.get(1000);
    expect(w).toBeDefined();
    expect(w).toMatchObject({
      id: 1000,
      name: '骑士之剑',
      nameEn: "Knight's Sword",
      referenceName: 'KnightsSword',
      rarity: 'Common',
      rarityIdx: 0,
      kingdom: '狮心帝国',
      weaponType: 'Sword',
      attack: 3,
      armor: 4,
      health: 4,
      magic: 1,
      manaColors: ['Blue'],
      manaCost: 3,
      masteryRequirement: 2,
      releaseDate: null,
      immortal: false,
      imageFile: '1000_KnightsSword.webp',
    });
    expect(w!.spell).toMatchObject({
      id: 7066,
      name: '骑士之剑',
      description: '对第 1 名敌人造成 [(魔法 / 2) + 3] 点伤害。',
      meta: {
        scalings: [{ base: 3, mult: 0.5 }],
        parsed: true,
      },
    });
    expect(w!.spell.meta.modifier).toBeUndefined();
    expect(w!.affixes).toEqual([]);
  });

  it('雅思敏的弓 1054（Epic：[魔法+5] 整魔法缩放 + 4 条淬炼词缀）', () => {
    const w = BY_ID.get(1054);
    expect(w).toBeDefined();
    expect(w).toMatchObject({
      id: 1054,
      name: '雅思敏的弓',
      nameEn: "Yasmine's Bow",
      referenceName: 'YasminesBow',
      rarity: 'Epic',
      rarityIdx: 4,
      kingdom: '荆棘森林',
      weaponType: 'Bow',
      attack: 5,
      armor: 0,
      health: 4,
      magic: 1,
      manaColors: ['Green'],
      manaCost: 13,
      masteryRequirement: 19,
      imageFile: '1054_YasminesBow.webp',
    });
    expect(w!.spell).toMatchObject({
      id: 7120,
      name: '雅思敏的弓',
      description: '对 1 个敌人造成 [魔法 + 5] 点伤害。创造 6 颗绿色宝石。',
      meta: { scalings: [{ base: 5, mult: 1 }], parsed: true },
    });
    expect(w!.affixes).toEqual([
      { name: '缠绕', description: '缠绕第一名敌人', rarity: 'Rare' },
      { name: '生命力', description: '获得 4 点生命值', rarity: 'UltraRare' },
      { name: '叶', description: '创造叶风暴', rarity: 'Epic' },
      { name: '精灵之手', description: '给予所有绿色盟友 2 点法力值', rarity: 'Legendary' },
    ]);
  });

  it('野性匕首 1716（Epic：[x3] 二级倍率修饰 + 双色法力）', () => {
    const w = BY_ID.get(1716);
    expect(w).toBeDefined();
    expect(w).toMatchObject({
      id: 1716,
      name: '野性匕首',
      nameEn: 'Feral Dagger',
      referenceName: 'FeralDagger',
      rarity: 'Epic',
      rarityIdx: 4,
      kingdom: '潘神之谷',
      weaponType: 'Dagger',
      attack: 5,
      armor: 4,
      health: 0,
      magic: 1,
      manaColors: ['Green', 'Yellow'],
      manaCost: 14,
      masteryRequirement: 1000,
      imageFile: '1716_FeralDagger.webp',
    });
    expect(w!.spell).toMatchObject({
      id: 10048,
      name: '野性匕首',
      description: '对敌人造成[魔法 + 4]点伤害，黄色盟友和野人盟友可提升伤害。 [x3]',
      meta: {
        scalings: [{ base: 4, mult: 1 }],
        parsed: true,
        modifier: { kind: 'multiplier', a: 3 },
      },
    });
  });

  it('暗影使者 1036（UltraRare：[3:1] 二级比率修饰）', () => {
    const w = BY_ID.get(1036);
    expect(w).toBeDefined();
    expect(w).toMatchObject({
      id: 1036,
      name: '暗影使者',
      nameEn: 'Shadowbringer',
      referenceName: 'Shadowbringer',
      rarity: 'UltraRare',
      rarityIdx: 3,
      kingdom: '鳞雾沼泽',
      weaponType: 'Dagger',
      manaColors: ['Blue'],
      manaCost: 11,
      masteryRequirement: 12,
    });
    expect(w!.spell).toMatchObject({
      id: 7102,
      name: '暗影使者',
      description: '对最后一名敌人造成 [魔法 + 3] 点伤害，并移除所有紫色宝石以增强伤害效果。 [3:1]',
      meta: {
        scalings: [{ base: 3, mult: 1 }],
        parsed: true,
        modifier: { kind: 'ratio', a: 3, b: 1 },
      },
    });
    expect(w!.affixes.map((a) => a.rarity)).toEqual(['Rare', 'UltraRare', 'Epic']);
  });

  it('在劫难逃的匕首 1456（Doomed 末日档：RarityIdx=6 + 5 条词缀含 Mythic）', () => {
    const w = BY_ID.get(1456);
    expect(w).toBeDefined();
    expect(w).toMatchObject({
      id: 1456,
      name: '在劫难逃的匕首',
      nameEn: 'Doomed Dagger',
      referenceName: 'DoomedDagger',
      rarity: 'Doomed',
      rarityIdx: 6,
      kingdom: '荣耀之地',
      weaponType: 'Dagger',
      attack: 5,
      armor: 4,
      health: 0,
      magic: 1,
      manaColors: ['Red'],
      manaCost: 18,
      masteryRequirement: 1000,
      imageFile: '1456_DoomedDagger.webp',
    });
    expect(w!.spell).toMatchObject({
      id: 8728,
      name: '在劫难逃的匕首',
      meta: {
        scalings: [{ base: 4, mult: 1 }],
        parsed: true,
        modifier: { kind: 'ratio', a: 1, b: 1 },
      },
    });
    expect(w!.affixes).toHaveLength(5);
    expect(w!.affixes.map((a) => a.rarity)).toEqual(['Rare', 'UltraRare', 'Epic', 'Legendary', 'Mythic']);
    expect(w!.affixes[4]).toEqual({ name: '劫数之火', description: '耗尽红色盟友 2 点法力值', rarity: 'Mythic' });
  });
});

describe('F · 名称中英覆盖', () => {
  it('nameEn 全量非空；中文名 716/718，英文回退仅限官方未翻译的 2 把新武器', () => {
    const nonCJK = WEAPONS.filter((w) => !CJK_RE.test(w.name));
    expect(nonCJK.map((w) => ({ id: w.id, name: w.name, nameEn: w.nameEn }))).toEqual([
      { id: 1720, name: "Thalassa's Wavemaker", nameEn: "Thalassa's Wavemaker" },
      { id: 1721, name: "Girthrok's Stonecleaver", nameEn: "Girthrok's Stonecleaver" },
    ]);
  });
});
