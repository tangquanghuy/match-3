import { describe, expect, it } from 'vitest';
// @ts-expect-error node types are not installed in this browser project
import { existsSync } from 'node:fs';
import { TROOPS } from '../../src/data/troops';
import { resolveTroopPortrait } from '../../src/data/troopPortrait';

describe('summon and transformation portrait wiring', () => {
  it('resolves every catalogue entry to its own configured image, never a guessed remote name', () => {
    for (const t of TROOPS) {
      const url = resolveTroopPortrait(t.name, { troopId: t.id });
      expect(url, `${t.id} ${t.name}`).toBe(t.artUrl ?? `/static/portraits/${t.portrait}.webp`);
      if (url.startsWith('/meta/')) expect(existsSync(`game-assets/public${url}`), url).toBe(true);
    }
  });
  it('uses spell identity for summons and preserves configured community artwork', () => {
    for (const t of TROOPS) {
      const url = resolveTroopPortrait(t.name, { skillId: String(t.spell.id) });
      expect(url, `${t.id} ${t.name}`).toBe(t.artUrl ?? `/static/portraits/${t.portrait}.webp`);
    }
  });
  it('keeps explicitly addressed transformation artwork independent of the old name', () => {
    const t = TROOPS.find(t => t.portrait && !t.artUrl)!;
    expect(resolveTroopPortrait('old display name', { troopId: t.id })).toBe(`/static/portraits/${t.portrait}.webp`);
  });
});
