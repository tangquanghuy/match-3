import { describe, expect, it } from 'vitest';
import { createSave, emptyRoot, validateSave } from '../../src/sillytavern/save';
import type { PartyPreparationSave } from '../../src/sillytavern/save';
import { partyAbilityChoices, companionMemberRef, equipmentRef, HERO_MEMBER_REF } from '../../src/sillytavern/partyPreparation';

const friend = companionMemberRef('伙伴/~A');
function fixture() {
  const save = createSave(emptyRoot(), { hostId: 'host', characterId: 'hero', chatId: 'one' }, 'save', 1);
  save.partyPreparation = {
    memberRefs: [friend, HERO_MEMBER_REF],
    baseAbilities: { [friend]: partyAbilityChoices()[0]!.abilityId },
    weaponBindings: { [equipmentRef(HERO_MEMBER_REF, '剑/~A')]: 'gw_KnightsSword' },
  };
  return save;
}

describe('party dialog save configuration', () => {
  it('preserves old saves without optional preparation and does not migrate them implicitly', () => {
    const old = createSave(emptyRoot(), { hostId: 'host', characterId: 'hero', chatId: 'old' }, 'old', 1);
    const before = structuredClone(old);
    expect(validateSave(old)).toEqual(before);
    expect(old).not.toHaveProperty('partyPreparation');
  });
  it('round trips ordered canonical pointers, real base recipes and weapon IDs', () => {
    const save = fixture();
    expect(validateSave(JSON.parse(JSON.stringify(save)))).toEqual(save);
    expect(save.partyPreparation!.memberRefs[0]).toBe(friend);
  });
  it.each([
    null, [], {}, { memberRefs: [HERO_MEMBER_REF] },
    { memberRefs: [HERO_MEMBER_REF], baseAbilities: {}, weaponBindings: {}, ignored: true },
    { memberRefs: [], baseAbilities: {}, weaponBindings: {} },
    { memberRefs: [friend], baseAbilities: {}, weaponBindings: {} },
    { memberRefs: [HERO_MEMBER_REF, HERO_MEMBER_REF], baseAbilities: {}, weaponBindings: {} },
    { memberRefs: [HERO_MEMBER_REF, friend, companionMemberRef('B'), companionMemberRef('C'), companionMemberRef('D')], baseAbilities: {}, weaponBindings: {} },
    { memberRefs: [HERO_MEMBER_REF, '/羁绊列表/A/B'], baseAbilities: {}, weaponBindings: {} },
    { memberRefs: [HERO_MEMBER_REF, '/羁绊列表/A~9'], baseAbilities: {}, weaponBindings: {} },
    { memberRefs: [HERO_MEMBER_REF, '/羁绊列表/'], baseAbilities: {}, weaponBindings: {} },
    { memberRefs: [HERO_MEMBER_REF], baseAbilities: [], weaponBindings: {} },
    { memberRefs: [HERO_MEMBER_REF], baseAbilities: {}, weaponBindings: null },
    { memberRefs: [HERO_MEMBER_REF], baseAbilities: { [friend]: 'active:v1:invented' }, weaponBindings: {} },
    { memberRefs: [HERO_MEMBER_REF], baseAbilities: { [friend]: 42 }, weaponBindings: {} },
    { memberRefs: [HERO_MEMBER_REF], baseAbilities: {}, weaponBindings: { [HERO_MEMBER_REF]: 'gw_KnightsSword' } },
    { memberRefs: [HERO_MEMBER_REF], baseAbilities: {}, weaponBindings: { [equipmentRef(HERO_MEMBER_REF, '剑')]: 'gw_invented' } },
  ])('rejects malformed configuration %#', config => {
    const save = fixture(); save.partyPreparation = config as PartyPreparationSave;
    expect(() => validateSave(save)).toThrow();
  });
  it('rejects a base active on the protagonist whose skill belongs to the weapon', () => {
    const save = fixture(); save.partyPreparation!.baseAbilities[HERO_MEMBER_REF] = partyAbilityChoices()[0]!.abilityId;
    expect(() => validateSave(save)).toThrow('base ability');
  });
  it('keeps learned equipment in the existing equippedAbilities field', () => {
    const save = fixture(); const ability = partyAbilityChoices()[0]!.abilityId;
    save.learnedAbilityIds = [ability]; save.equippedAbilities[friend] = ability;
    expect(validateSave(save).equippedAbilities).toEqual({ [friend]: ability });
    save.learnedAbilityIds = [];
    expect(() => validateSave(save)).toThrow('已装配能力尚未学会');
  });
});
