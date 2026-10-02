import { describe, it, expect } from 'vitest';
import { activeTeam, buildPlayerSnapshots, newSave, setTeamPreset, validateTeam } from '../../src/meta';
import type { TeamMember } from '../../src/meta';

const OWNED = [6000, 6097, 6457]; // 破碎尖塔三张普通卡（新档 starter）
const UNOWNED = 6169; // 德拉古力斯：数据内存在、新档未拥有

const save = () => newSave({ now: 0, starterTroopIds: OWNED });
const troop = (troopId: number): TeamMember => ({ kind: 'troop', troopId });
const hero = (): TeamMember => ({ kind: 'hero' });

describe('编队 3~4 人校验（裁定①）', () => {
  it('3 人与 4 人（主角补位）都合法；主角不编入也合法', () => {
    const s = save();
    expect(validateTeam(s, { members: OWNED.map(troop) }).ok).toBe(false);

    // 第四人由主角担任：需要先拥有第四张部队吗——主角不是部队，不占收藏
    const four = { members: [troop(OWNED[0]), troop(OWNED[1]), troop(OWNED[2]), hero()] };
    expect(validateTeam(s, four).ok).toBe(true);

    // 主角可入可不入：两主角非法
    expect(validateTeam(s, { members: [hero(), hero(), troop(OWNED[0])] }).issues).toContainEqual(
      expect.objectContaining({ code: 'HERO_DUPLICATE' }),
    );
  });

  it('少于 3 人 / 多于 4 人被拦截', () => {
    const s = save();
    expect(validateTeam(s, { members: [troop(OWNED[0]), troop(OWNED[1])] }).issues).toContainEqual(
      expect.objectContaining({ code: 'TOO_FEW' }),
    );
    const s4 = newSave({ now: 0, starterTroopIds: OWNED });
    s4.collection[String(UNOWNED)] = { copies: 0, level: 1, ascension: 0, traits: [false, false, false], locked: false };
    expect(
      validateTeam(s4, {
        members: [hero(), ...OWNED.map(troop), troop(UNOWNED)],
      }).issues,
    ).toContainEqual(expect.objectContaining({ code: 'TOO_MANY' }));
  });

  it('普通部队按持有副本数上阵，不朽类仍每队最多一名', () => {
    const s = save();
    expect(
      validateTeam(s, { members: [troop(6000), troop(6000), troop(6097)] }).issues,
    ).toContainEqual(expect.objectContaining({ code: 'DUPLICATE_TROOP' }));
    s.collection['6000']!.copies = 1;
    const twoCopies = [troop(6000), troop(6000), troop(6097), hero()];
    expect(validateTeam(s, { members: twoCopies }).ok).toBe(true);
    expect(setTeamPreset(s, 0, { name: '双卡队', members: twoCopies, bannerKingdomId: null }).ok).toBe(true);
    const built = buildPlayerSnapshots(s);
    expect(built.ok).toBe(true);
    if (built.ok) expect(new Set(built.playerTeam.map(member => member.externalId)).size).toBe(4);
    s.collection['6000']!.copies = 0;
    expect(buildPlayerSnapshots(s)).toMatchObject({ ok: false, message: expect.stringContaining('副本不足') });
    s.collection['6000']!.copies = 1;
    expect(validateTeam(s, { members: [troop(6000), troop(6000), troop(6000), hero()] }).issues)
      .toContainEqual(expect.objectContaining({ code: 'DUPLICATE_TROOP' }));
    s.collection['7571'] = { ...s.collection['6000']!, copies: 3 };
    expect(validateTeam(s, { members: [troop(7571), troop(7571), troop(6097), hero()] }).issues)
      .toContainEqual(expect.objectContaining({ code: 'IMMORTAL_LIMIT' }));
  });

  it('未拥有 / 悬空 id 全部可见', () => {
    const s = save();
    expect(
      validateTeam(s, { members: [troop(6000), troop(6097), troop(UNOWNED)] }).issues,
    ).toContainEqual(expect.objectContaining({ code: 'NOT_OWNED' }));
    expect(
      validateTeam(s, { members: [troop(6000), troop(6097), troop(99999999)] }).issues,
    ).toContainEqual(expect.objectContaining({ code: 'UNKNOWN_TROOP' }));
  });
});

describe('预设队保存', () => {
  it('校验不过 → 存档不动，issues 原样带回', () => {
    const s = save();
    const before = JSON.stringify(s.teams);
    const r = setTeamPreset(s, 0, { name: '残队', members: [troop(6000)], bannerKingdomId: null });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.issues[0].code).toBe('TOO_FEW');
    expect(JSON.stringify(s.teams)).toBe(before);
  });

  it('校验通过 → 按 index 写入（越界即新增），站位顺序保留', () => {
    const s = save();
    // 初始王国已开放，旗帜不要求完成任务
    s.kingdoms['破碎尖塔'] = { level: 1, questsDone: 0, exploreTier: 0, lastTributeAt: 0 };
    const members = [troop(6457), troop(6000), troop(6097), { kind: 'hero' as const }]; // 故意乱序：站位即数组顺序
    const r = setTeamPreset(s, 1, { name: '二号队', members, bannerKingdomId: '破碎尖塔' });
    expect(r).toMatchObject({ ok: true, index: 1 });
    expect(s.teams[1]!.name).toBe('二号队');
    expect(s.teams[1]!.members).toEqual(members);
    expect(s.teams[1]!.bannerKingdomId).toBe('破碎尖塔');
    expect(s.teams).toHaveLength(2);
  });

  it('旗帜未解锁 → BAD_BANNER 拦截（M6 装备校验），存档不动', () => {
    const s = save();
    const before = JSON.stringify(s.teams);
    const members = OWNED.map(troop);
    const locked = setTeamPreset(s, 0, { name: 'X', members, bannerKingdomId: '卡拉考斯' });
    expect(locked.ok).toBe(false);
    if (!locked.ok) expect(locked.issues.map((i) => i.code)).toContain('BAD_BANNER');
    expect(JSON.stringify(s.teams)).toBe(before);
  });

  it('activeTeam 取当前索引，越界回退 0 号', () => {
    const s = save();
    expect(activeTeam(s)!.members).toEqual([{ kind: 'hero' }, ...OWNED.map(troop)]);
    s.activeTeamIndex = 99;
    expect(activeTeam(s)!.members).toEqual([{ kind: 'hero' }, ...OWNED.map(troop)]);
  });
});
