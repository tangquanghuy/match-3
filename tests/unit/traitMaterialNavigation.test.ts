import { describe, expect, it } from 'vitest';
import { newSave } from '../../src/meta/state/schema';
import { BagScreen } from '../../src/meta/screens/bagScreen';
import { traitStoneBagFocus, traitStoneBagRoute } from '../../src/meta/screens/traitMaterialNavigation';
import type { ShellCtx } from '../../src/meta/shell/screen';

const saveFor = (id: number, traits: [boolean, boolean, boolean]) => {
  const save = newSave({ now: 0, starterTroopIds: [] });
  save.collection[String(id)] = { copies: 1, level: 1, ascension: 0, traits, locked: false };
  return save;
};
const bagHtml = (save: ReturnType<typeof saveFor>, route: string) => new BagScreen().html({ save: () => save } as ShellCtx, route);

describe('trait material bag deep link', () => {
  it('uses the next locked trait and highlights all of its arcane stones, focusing a shortage', () => {
    const save = saveFor(6169, [true, true, false]);
    save.materials.traitstones['arcane:blue:green'] = 12;
    expect(traitStoneBagFocus(save, 6169)).toEqual({
      filter: 'arcane', keys: ['arcane:blue:green', 'arcane:blue:red'], focus: 'arcane:blue:red',
    });
    expect(traitStoneBagRoute(save, 6169)).toBe('#bag/stones/arcane/for/6169');
    const html = bagHtml(save, 'stones/arcane/for/6169');
    for (const key of ['arcane:blue:green', 'arcane:blue:red']) {
      expect(html).toMatch(new RegExp(`class="bag-item[^"\n]*trait-required"[^>]*data-bag-item="${key}"`));
    }
    expect(html).toMatch(/class="bag-item[^"\n]*selected[^"\n]*trait-required"[^>]*data-bag-item="arcane:blue:red"/);
    save.materials.traitstones['arcane:blue:red'] = 12;
    expect(traitStoneBagFocus(save, 6169)?.focus).toBe('arcane:blue:green');
  });

  it('automatically opens the last page and keeps the focus context while paging', () => {
    const save = saveFor(6008, [true, true, false]);
    expect(traitStoneBagFocus(save, 6008)?.focus).toBe('arcane:brown:brown');
    const html = bagHtml(save, 'stones/arcane/for/6008');
    expect(html).toContain('2 / 2');
    expect(html).toContain('data-bag-item="arcane:brown:brown"');
    expect(html).toContain('href="#bag/stones/arcane/for/6008/1"');
    const previous = bagHtml(save, 'stones/arcane/for/6008/1');
    expect(previous).toContain('1 / 2');
    expect(previous).not.toContain('data-bag-item="arcane:brown:brown"');
    expect(previous).toContain('href="#bag/stones/arcane/for/6008/2"');
  });

  it('does not target a missing or fully traited troop, and uses basic stones for early traits', () => {
    const save = saveFor(6169, [false, false, false]);
    expect(traitStoneBagFocus(save, 6169)?.filter).toBe('basic');
    expect(traitStoneBagRoute(save, 6169)).toBe('#bag/stones/basic/for/6169');
    save.collection['6169'].traits = [true, true, true];
    expect(traitStoneBagFocus(save, 6169)).toBeNull();
    expect(bagHtml(save, 'stones/arcane/for/6169')).not.toContain('trait-required');
    expect(traitStoneBagFocus(save, 6008)).toBeNull();
  });
});
