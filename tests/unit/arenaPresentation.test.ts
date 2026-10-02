import { describe, expect, it } from 'vitest';
import { TROOPS } from '../../src/data/troops';
import { troopStatsAtLevel } from '../../src/data/leveling';
import { arenaDraftLevel } from '../../src/meta/data/economy';
import { arenaStatsMarkup, arenaSpellMarkup, arenaTroopDetailMarkup, arenaPortraitStatsMarkup, arenaUnitSheetData } from '../../src/meta/screens/arenaPresentation';
import { renderSpell } from '../../src/meta/shell/spellText';

const representatives = [0, 1, 2, 3].map(rarity => TROOPS.find(t => t.rarityIdx === rarity)!);

describe('arena detail presentation', () => {
  it.each(representatives)('$name shows all four tournament stats with codex icons', troop => {
    const stats = troopStatsAtLevel(troop, arenaDraftLevel(troop.rarityIdx));
    const html = arenaStatsMarkup(troop);
    for (const key of ['attack', 'armor', 'health', 'magic'] as const) {
      expect(html).toContain(`data-stat="${key}"`);
      expect(html).toContain(`<b>${stats[key]}</b>`);
    }
    expect(html.match(/class="arena-attribute /g)).toHaveLength(4);
    expect(html).not.toContain('draft-stats');
  });

  it.each(representatives)('$name uses the same complete skill and Lv.15 values for candidates and roster', troop => {
    const stats = troopStatsAtLevel(troop, arenaDraftLevel(troop.rarityIdx));
    const detail = arenaTroopDetailMarkup(troop);
    for (const key of ['attack', 'armor', 'health', 'magic'] as const) {
      expect(detail).toMatch(new RegExp(`data-stat="${key}"[\\s\\S]*?<b>${stats[key]}</b>`));
    }
    expect(detail).toContain(arenaSpellMarkup(troop));
    expect(detail).toContain(renderSpell(troop.spell.description, stats.magic, { interactive: false }).html);
    expect(detail).toContain('Lv.15 · 无特质 · 无外部加成');
    expect(detail).toContain(`法力消耗 ${troop.manaCost}`);
  });

  it('escapes names and kingdoms in detail markup', () => {
    const troop = { ...representatives[0]!, name: '<script>x</script>', kingdom: '<b>place</b>' };
    const html = arenaTroopDetailMarkup(troop);
    expect(html).not.toContain('<script>');
    expect(html).toContain('&lt;script&gt;x&lt;/script&gt;');
    expect(html).toContain('&lt;b&gt;place&lt;/b&gt;');
  });
});

describe('arena portrait and battle codex adapter', () => {
  it.each(representatives)('$name exposes all five corner stats with tournament values', troop => {
    const html = arenaPortraitStatsMarkup(troop);
    expect(html.match(/data-stat=/g)).toHaveLength(5);
    expect(html).toContain(`data-stat="mana" aria-label="法力消耗 ${troop.manaCost}"`);
    const data = arenaUnitSheetData(troop);
    const stats = troopStatsAtLevel(troop, 15);
    expect(data.shown).toMatchObject({ attack: stats.attack, armor: stats.armor, hp: stats.health, magic: stats.magic, mana: 0, manaCost: troop.manaCost });
    expect(data.traitSlots.every(trait => !trait.unlocked)).toBe(true);
    expect(data.skillDescription).toBe(troop.spell.description);
    expect(data.ally).toBe(false);
  });
});
