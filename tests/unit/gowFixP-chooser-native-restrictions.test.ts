// sa-P fix round A: P-chooser-native-restrictions (lane-L4b L4b-chosen-colour-exclusion).
// The AI colour / cell choosers honour the native spell Target (Not<X>OrSkullGems, Not<X>Gems, <X>Gems, ManaGemsOnly).
// Engine side only; the player palette in src/render/App.ts is unchanged.
import { describe, it, expect } from 'vitest';
import { BaseColor, colorGem, skullGem } from '@engine/types';
import { AiColorChooser } from '@engine/skills/colorChooser';
import { AiCellChooser } from '@engine/skills/cellChooser';
import { choiceRuleOf, GOW_CHOICE_RULES, parseNativeChoiceTarget } from '@engine/skills/gowChoiceRules';
import { setupCast, withCells, type BoardFn } from '../helpers/gowCast';

const SIX = [BaseColor.Red, BaseColor.Blue, BaseColor.Green, BaseColor.Yellow, BaseColor.Purple, BaseColor.Brown];
/** colour X dominates (rows 0-3 all X, no lines of three elsewhere matter for the choice) */
const dominated = (x: BaseColor): BoardFn => (r, c) => (r < 3 ? colorGem(x) : colorGem(SIX[(2 * r + c) % 6]));
function aiCast(key: string, board: BoardFn) {
  const f = setupCast({ key, board });
  f.engine.setColorChooser(new AiColorChooser());
  f.engine.setCellChooser(new AiCellChooser());
  return { f, events: f.cast() };
}
const transformedFrom = (ev: ReturnType<typeof aiCast>['events']) => ev.flatMap((e) => e.type === 'gem-transform' ? e.changes.map((c) => c.from) : []);

describe('P-chooser-native-restrictions: rule table', () => {
  it('parses native Target values', () => {
    expect(parseNativeChoiceTarget('NotGreenOrSkullGems')).toEqual({ notColor: BaseColor.Green, manaGemsOnly: true });
    expect(parseNativeChoiceTarget('NotRedGems')).toEqual({ notColor: BaseColor.Red, manaGemsOnly: true });
    expect(parseNativeChoiceTarget('PurpleGems')).toEqual({ onlyColor: BaseColor.Purple, manaGemsOnly: true });
    expect(parseNativeChoiceTarget('ManaGemsOnly')).toEqual({ manaGemsOnly: true });
    expect(parseNativeChoiceTarget('Enemy')).toBeNull();
  });
  it('covers the queued spells and attaches to the registered prototypes (troop and gw_ keys)', () => {
    for (const id of [7216, 7399, 7554, 8234, 7358, 8491, 9666, 7735, 8901]) expect(GOW_CHOICE_RULES[id]).toBeDefined();
    const f = setupCast({ key: 'troop:6124' });
    expect(choiceRuleOf(f.proto)).toEqual({ notColor: BaseColor.Green, manaGemsOnly: true });
    expect(choiceRuleOf(setupCast({ key: 'weapon:1067' }).proto)).toEqual({ notColor: BaseColor.Red, manaGemsOnly: true });
  });
});

describe('P-chooser-native-restrictions: AI colour chooser', () => {
  for (const [key, excluded] of [
    ['troop:6124', BaseColor.Green], ['troop:6216', BaseColor.Red], ['troop:6256', BaseColor.Brown], ['troop:6541', BaseColor.Red],
    ['troop:6824', BaseColor.Brown], ['troop:7705', BaseColor.Purple],
  ] as const) {
    it(`${key}: most common colour is ${excluded} (the target colour) -> AI picks another colour`, () => {
      const { events } = aiCast(key, dominated(excluded));
      const from = transformedFrom(events);
      expect(from.length).toBeGreaterThan(0);
      expect(from.some((t) => t.kind === 'color' && t.color === excluded)).toBe(false);
    });
  }
  for (const [key, source] of [['troop:6399', BaseColor.Blue], ['troop:6987', BaseColor.Green]] as const) {
    it(`${key}: "convert all ${source} to a chosen colour" -> AI never chooses ${source} itself`, () => {
      const { events } = aiCast(key, dominated(source));
      const changes = events.flatMap((e) => e.type === 'gem-transform' ? e.changes : []);
      expect(changes.length).toBeGreaterThan(0);
      expect(changes.every((c) => !(c.to.kind === 'color' && c.to.color === source))).toBe(true);
    });
  }
  it('unrestricted spell keeps the old choice (most common colour)', () => {
    const f = setupCast({ key: 'troop:6124', board: dominated(BaseColor.Green) });
    expect(new AiColorChooser().choose(f.state, 0)).toBe(BaseColor.Green);
  });
});

describe('P-chooser-native-restrictions: AI cell chooser', () => {
  it('troop:7276 spell 8901 (ManaGemsOnly): centre Skulls are skipped, a Mana gem becomes the Uber Doomskull', () => {
    const skulls = Object.fromEntries(['3,3', '3,4', '4,3', '4,4'].map((k) => [k, skullGem()]));
    const { events } = aiCast('troop:7276', withCells((r, c) => colorGem(SIX[(2 * r + c) % 6]), skulls));
    const from = transformedFrom(events);
    expect(from).toHaveLength(1);
    expect(from[0].kind).toBe('color');
  });
  it('troop:6139 spell 7253 (PurpleGems): the chosen gem is Purple even when the centre is not', () => {
    const f = setupCast({ key: 'troop:6139', board: (r, c) => colorGem(SIX[(2 * r + c) % 6]) });
    const cell = new AiCellChooser().choose(f.state, 0, f.engine['rng' as never], choiceRuleOf(f.proto));
    expect(cell).not.toBeNull();
    const gem = f.state.board.get(cell!);
    expect(gem?.type).toEqual(colorGem(BaseColor.Purple));
  });
});
