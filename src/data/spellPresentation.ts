/** Keep canonical spell names intact; only the presentation gains a line break. */
export const HUIJIU_SPELL_NAME = '一霎惊澜雨逢客，半生冷月剑辞乡';

export function isCoupletSpell(name: string): boolean {
  return name === HUIJIU_SPELL_NAME;
}

export function spellTitleText(name: string): string {
  return isCoupletSpell(name) ? name.replace('，', '，\n') : name;
}
