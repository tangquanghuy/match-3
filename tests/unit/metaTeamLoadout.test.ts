import { describe, expect, it } from 'vitest';
import { newSave } from '../../src/meta/state/schema';
import { saveToRecords, recordsToSave } from '../../src/meta/state/records';
import { runCommand } from '../../src/meta/server/core';
import { defaultEnv } from '../../src/meta/server/env';
import { CLASSES } from '../../src/meta/data/classes';
import { STARTER_WEAPON_IDS } from '../../src/meta/data/weapons';
import { buildPlayerSnapshots } from '../../src/meta/systems/battleBridge';
import { captureMirrorRecord } from '../../src/meta/systems/invasionMirrors';
import { defenseRecord } from '../../src/meta/systems/invasionDefense';
import { setTeamPreset, validateTeam } from '../../src/meta/systems/teamRules';

const NOW = Date.UTC(2026, 9, 9);
const env = defaultEnv({ now: () => NOW, seed: () => 1234, allowDev: true });
const members = [{ kind: 'hero' as const }, ...[6000, 6097, 6457].map(troopId => ({ kind: 'troop' as const, troopId }))];
const makeSave = () => {
  const save = newSave({ now: NOW, starterTroopIds: [6000, 6097, 6457] });
  const otherClass = CLASSES.find(c => c.id !== save.hero.classId)!.id;
  save.hero.unlockedClasses.push(otherClass);
  const [firstWeapon, secondWeapon] = STARTER_WEAPON_IDS;
  expect(firstWeapon).toBeTruthy(); expect(secondWeapon).toBeTruthy();
  const first = { name: '队伍一', members, bannerKingdomId: null, heroClassId: save.hero.classId, heroWeaponId: firstWeapon! };
  const second = { ...first, name: '队伍二', heroClassId: otherClass, heroWeaponId: secondWeapon! };
  expect(setTeamPreset(save, 0, first).ok).toBe(true);
  expect(setTeamPreset(save, 1, second).ok).toBe(true);
  return { save, first, second };
};

function heroSnapshot(save: ReturnType<typeof makeSave>['save']) {
  const built = buildPlayerSnapshots(save);
  expect(built.ok).toBe(true);
  if (!built.ok) throw new Error(built.message);
  return built.playerTeam[0]!;
}

describe('队伍主角装备与入侵真人镜像', () => {
  it('切换预设自动换职业、武器，战斗快照跟随预设，重载仍保持', () => {
    let { save, first, second } = makeSave();
    let out = runCommand(save, { type: 'activateTeam', args: { index: 1 } }, env);
    expect(out.result).toBe(1);
    save = out.save;
    expect([save.hero.classId, save.hero.equippedWeapon]).toEqual([second.heroClassId, second.heroWeaponId]);
    expect(heroSnapshot(save).skillId).toBe(second.heroWeaponId);
    const reloaded = recordsToSave(saveToRecords(save), NOW);
    expect(reloaded.teams[1]).toMatchObject({ heroClassId: second.heroClassId, heroWeaponId: second.heroWeaponId });
    out = runCommand(reloaded, { type: 'activateTeam', args: { index: 0 } }, env);
    expect(out.result).toBe(0);
    expect([out.save.hero.classId, out.save.hero.equippedWeapon]).toEqual([first.heroClassId, first.heroWeaponId]);
    expect(heroSnapshot(out.save).skillId).toBe(first.heroWeaponId);
  });

  it('在英雄页手动换装只更新当前预设；编辑其他队伍不影响当前装备', () => {
    let { save, second } = makeSave();
    save = runCommand(save, { type: 'activateTeam', args: { index: 1 } }, env).save;
    const originalFirst = structuredClone(save.teams[0]);
    save = runCommand(save, { type: 'equipHeroWeapon', args: { weaponId: STARTER_WEAPON_IDS[2]! } }, env).save;
    expect(save.teams[1]?.heroWeaponId).toBe(STARTER_WEAPON_IDS[2]);
    expect(save.teams[0]).toEqual(originalFirst);
    save = runCommand(save, { type: 'saveTeam', args: { index: 0, team: { ...save.teams[0]!, heroClassId: second.heroClassId } } }, env).save;
    expect(save.hero.classId).toBe(second.heroClassId);
    expect(save.hero.equippedWeapon).toBe(STARTER_WEAPON_IDS[2]);
  });

  it('防守和进攻真人镜像记录真实职业武器；换装后已部署防守不变', () => {
    let { save, first, second } = makeSave();
    save.hero.level = 20;
    save = runCommand(save, { type: 'setInvasionDefense', args: { index: 0 } }, env).save;
    expect(save.invasion.defenseTeam).toMatchObject({ heroClassId: first.heroClassId, heroWeaponId: first.heroWeaponId });
    const before = defenseRecord(save, NOW)!;
    expect(before).toMatchObject({ heroClassId: first.heroClassId, heroWeaponId: first.heroWeaponId });
    expect(before.team[0]?.skillId).toBe(first.heroWeaponId);
    save = runCommand(save, { type: 'activateTeam', args: { index: 1 } }, env).save;
    const attacking = buildPlayerSnapshots(save);
    expect(attacking.ok).toBe(true);
    if (!attacking.ok) throw new Error(attacking.message);
    const attackRecord = captureMirrorRecord(save, attacking.team, attacking.playerTeam, null, NOW);
    expect(attackRecord).toMatchObject({ heroClassId: second.heroClassId, heroWeaponId: second.heroWeaponId });
    expect(attackRecord.team[0]?.skillId).toBe(second.heroWeaponId);
    const after = defenseRecord(recordsToSave(saveToRecords(save), NOW), NOW)!;
    expect(after.team).toEqual(before.team);
    expect(after.heroClassId).toBe(first.heroClassId);
    expect(after.heroWeaponId).toBe(first.heroWeaponId);
  });

  it('旧队伍首次激活冻结当前配置；非法职业、武器不保存不激活', () => {
    let { save } = makeSave();
    delete save.teams[1]!.heroClassId;
    delete save.teams[1]!.heroWeaponId;
    const current = { classId: save.hero.classId, weaponId: save.hero.equippedWeapon };
    save = runCommand(save, { type: 'activateTeam', args: { index: 1 } }, env).save;
    expect(save.teams[1]).toMatchObject({ heroClassId: current.classId, heroWeaponId: current.weaponId });
    const before = structuredClone(save.teams[1]);
    const invalid = { ...before, heroClassId: 'not-unlocked', heroWeaponId: 'not-owned' };
    const out = runCommand(save, { type: 'saveTeam', args: { index: 1, team: invalid } }, env);
    expect(out.result.ok).toBe(false);
    expect(out.save.teams[1]).toEqual(before);
    const malformed = { ...before, heroClassId: 77 as unknown as string };
    expect(validateTeam(save, malformed).issues).toContainEqual(expect.objectContaining({ code: 'BAD_HERO_LOADOUT' }));
    save.teams[0]!.heroWeaponId = 'not-owned';
    const failed = runCommand(save, { type: 'activateTeam', args: { index: 0 } }, env);
    expect(failed.result).toMatchObject({ ok: false });
    expect(failed.save.activeTeamIndex).toBe(1);
  });

  it('无主角队伍不会改动主角装备', () => {
    let { save } = makeSave();
    save.collection['6000']!.copies = 1;
    const heroBefore = structuredClone(save.hero);
    const noHero = { name: '纯部队', members: [
      { kind: 'troop' as const, troopId: 6000 }, { kind: 'troop' as const, troopId: 6000 },
      { kind: 'troop' as const, troopId: 6097 }, { kind: 'troop' as const, troopId: 6457 },
    ], bannerKingdomId: null };
    expect(setTeamPreset(save, 2, noHero).ok).toBe(true);
    save = runCommand(save, { type: 'activateTeam', args: { index: 2 } }, env).save;
    expect(save.hero).toEqual(heroBefore);
  });
});
