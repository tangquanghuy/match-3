import fs from 'node:fs';
const preserved = JSON.parse(fs.readFileSync(new URL('../../src/data/gowWeaponReviewedOverrides.json', import.meta.url), 'utf8')).entries;
/** Localized display repairs proven by independent stored English and native steps.
 * Do not mutate the source snapshot: apply only when rebuilding derived data. */
export function correctedWeaponDescription(spellId, description, englishDescription) {
  if (spellId === 7079) {
    // Official 9.4 Dust Tome note + later English/native spell: the Chinese snapshot lost the Magic clause.
    if (englishDescription !== 'Destroy a Gem and give 1 Magic to all Allies.')
      throw new Error('7079 English snapshot changed: review Dusty Tome correction');
    const old = '摧毁 1 颗宝石。';
    const next = '摧毁 1 颗宝石。给予所有盟友 1 点魔力值。';
    if (description !== old && description !== next)
      throw new Error('7079 Chinese snapshot changed: review Dusty Tome correction');
    return next;
  }
  if (spellId === 7074 || spellId === 7089) {
    const base = spellId === 7074 ? 3 : 5;
    const expected = `Deal [Magic + ${base}] damage to the first 2 Enemies.`;
    if (englishDescription !== expected)
      throw new Error(`${spellId} English snapshot changed: review first-two damage correction`);
    return `对前两名敌人造成 [魔法 + ${base}] 点伤害。`;
  }
  if (spellId === 9033) {
    const old = '爆破 [魔法 + 1] 颗绿色宝石。赋予所有哥布林盟友一个随机状态效果。';
    const next = `${old}再召唤一名哥布林部队。`;
    if (!englishDescription?.includes('Then summon a Goblin Troop.'))
      throw new Error('9033 English snapshot changed: review localized clause correction');
    if (description !== old && description !== next)
      throw new Error('9033 Chinese snapshot changed: review localized clause correction');
    return next;
  }
  return preserved[spellId]?.description ?? description;
}
