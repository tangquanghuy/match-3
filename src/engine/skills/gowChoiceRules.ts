/**
 * Native spell Target restrictions for player/AI choices (P-chooser-native-restrictions, lane-L4b
 * L4b-chosen-colour-exclusion). Source: the stored native spell `Target` of each spell
 * (data/raw/spells.gow.en.json via the audit ledger), grouped by value:
 *   - `Not<X>OrSkullGems` / `Not<X>Gems`: the chosen colour / gem can never be colour X
 *     ("Transform a selected Mana color to Green" never picks Green);
 *   - `<X>Gems`: only a gem of colour X can be chosen ("Choose a Purple Gem");
 *   - `ManaGemsOnly`: only a Mana (colour) gem can be chosen, never a Skull or special gem.
 * Engine side only: the AI colour/cell choosers honour the rule. The player palette / board pick
 * (src/render/App.ts) does not filter yet — follow-up UI work.
 *
 * Rules are attached to compiled prototypes through a WeakMap so the prototype data (and every
 * test that compares it with toEqual) is unchanged.
 */
import { BaseColor } from '../types';
import type { SkillPrototype } from './prototypes';

export interface ChoiceRule {
  /** chosen colour / chosen gem colour must not be this colour */
  notColor?: BaseColor;
  /** chosen gem must be of this colour */
  onlyColor?: BaseColor;
  /** chosen gem must be a plain Mana (colour) gem */
  manaGemsOnly?: boolean;
}

const C = BaseColor;
/** native spell Target -> spell ids (generated from the audit ledger, 2026-09-28) */
const NATIVE_TARGETS: Record<string, readonly number[]> = {
  ManaGemsOnly: [7040, 7118, 7144, 7146, 7154, 7163, 7171, 7181, 7223, 7303, 7329, 7331, 7360, 7437, 7478, 7514, 7517,
    7596, 7669, 7672, 7693, 7862, 8010, 8152, 8180, 8235, 8355, 8400, 8473, 8511, 8586, 8627, 8657, 8710, 8827, 8901,
    8966, 9219, 9314, 9368, 9372, 9657, 9669, 9771, 9861, 9956],
  NotBlueGems: [7404],
  NotBlueOrSkullGems: [7062, 7554, 7787],
  NotBrownGems: [7409],
  NotBrownOrSkullGems: [7399, 8234, 9573],
  NotGreenGems: [7405],
  NotGreenOrSkullGems: [7216, 7732, 8491, 8876],
  NotPurpleGems: [7408],
  NotPurpleOrSkullGems: [7180, 7641, 9666, 9831],
  NotRedGems: [7174, 7406],
  NotRedOrSkullGems: [7358, 7735, 8060],
  NotYellowGems: [7407],
  NotYellowOrSkullGems: [7005, 7013, 7574, 8464],
  PurpleGems: [7253],
};

const COLOR_BY_NAME: Record<string, BaseColor> = {
  Red: C.Red, Blue: C.Blue, Green: C.Green, Yellow: C.Yellow, Purple: C.Purple, Brown: C.Brown,
};

/** Parse a native spell Target into a choice rule; null when it does not restrict choices. */
export function parseNativeChoiceTarget(target: string): ChoiceRule | null {
  if (target === 'ManaGemsOnly') return { manaGemsOnly: true };
  const not = /^Not(Red|Blue|Green|Yellow|Purple|Brown)(?:OrSkull)?Gems$/.exec(target);
  if (not) return { notColor: COLOR_BY_NAME[not[1]], manaGemsOnly: true };
  const only = /^(Red|Blue|Green|Yellow|Purple|Brown)Gems$/.exec(target);
  if (only) return { onlyColor: COLOR_BY_NAME[only[1]], manaGemsOnly: true };
  return null;
}

export const GOW_CHOICE_RULES: Readonly<Record<number, ChoiceRule>> = Object.fromEntries(
  Object.entries(NATIVE_TARGETS).flatMap(([target, ids]) => ids.map((id) => [id, parseNativeChoiceTarget(target)!])),
);

const rules = new WeakMap<SkillPrototype, ChoiceRule>();

/** Attach the native choice restriction of spell `id` to its compiled prototype (identity preserved). */
export function applyGowChoiceRule(id: number, proto: SkillPrototype): SkillPrototype {
  const rule = GOW_CHOICE_RULES[id];
  if (rule) rules.set(proto, rule);
  return proto;
}

/** Native choice restriction of a compiled prototype, if any. */
export function choiceRuleOf(proto: SkillPrototype | undefined): ChoiceRule | undefined {
  return proto ? rules.get(proto) : undefined;
}

/** Whether a colour may be chosen under the rule. */
export function colorAllowed(rule: ChoiceRule | undefined, color: BaseColor): boolean {
  if (!rule) return true;
  if (rule.notColor !== undefined && color === rule.notColor) return false;
  if (rule.onlyColor !== undefined && color !== rule.onlyColor) return false;
  return true;
}
