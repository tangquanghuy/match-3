// sa-P round 5: P-E-faction-kingdom. Faction troops carry their parent kingdom's zh name (Character.kingdom) but their
// own raw native KingdomId; native AllyKingdom / CountArmyKingdom / MultiplyForKingdom steps use the raw id.
// troops.json now carries kingdomId (build_troops.mjs, from data/raw/troops.gow.en.json) and curated kingdom filters
// whose native step names a kingdom id use the numeric form (KingdomRef number -> Character.kingdomId).
import { describe, it, expect } from 'vitest';
import { castSpell, registry, summaryLine, DEFAULT_ENEMIES } from '../helpers/gowCast';
import { getTroopByRef, troopToCharacter, troopToSummonTemplate, troopRefsOfKingdom } from '../../src/data/troops';
import { snapshotToCharacter } from '../../src/session/combatantMapping';
import { matchesKingdom } from '@engine/types';
import { skill, summonRandomOfKingdom } from '@engine/skills/builders';

const SHENTANG = { kingdom: '圣唐', kingdomId: 3030 };
const SHENTANG_FACTION = { kingdom: '圣唐', kingdomId: 3070 }; // raw 3070 faction troop, zh parent name
const clean = { hp: 500, maxHp: 500, armor: 0, statuses: [] };

describe('P-E-faction-kingdom', () => {
  it('troop data carries the raw KingdomId (faction troops keep their own id)', () => {
    const ooze = getTroopByRef('BlackOoze')!; // Dripping Caverns 3058, zh 葛洛什奈克 (Grosh-Nak 3018)
    expect(ooze.kingdom).toBe(getTroopByRef('Hematrax')!.kingdom);
    expect(ooze.kingdomId).toBe(3058);
    expect(getTroopByRef('Hematrax')!.kingdomId).toBe(3018);
    expect(troopToCharacter(ooze, 1).kingdomId).toBe(3058);
    expect(troopToSummonTemplate('BlackOoze')!.kingdomId).toBe(3058);
    expect(troopRefsOfKingdom(3058).sort()).toEqual(['BlackOoze', 'Cloakmantle', 'OchreJelly', 'RockSquid', 'Shoggorath']);
    expect(troopRefsOfKingdom('葛洛什奈克')).toContain('BlackOoze'); // zh-name form unchanged
  });

  it('host snapshots pass kingdomId through', () => {
    const c = snapshotToCharacter({ externalId: 'x', templateId: '7569', name: 'n', stats: { hp: 1, attack: 1, armor: 0, magic: 1 },
      manaColors: ['Red'], manaCost: 10, kingdom: '葛洛什奈克', kingdomId: 3058 } as never, 1);
    expect(c.kingdomId).toBe(3058);
  });

  it('matchesKingdom: number = raw id, string = zh name (legacy / community troops)', () => {
    expect(matchesKingdom(SHENTANG_FACTION, 3030)).toBe(false);
    expect(matchesKingdom(SHENTANG, 3030)).toBe(true);
    expect(matchesKingdom(SHENTANG_FACTION, '圣唐')).toBe(true);
    expect(matchesKingdom({ kingdom: '圣唐' }, 3030)).toBe(false);
  });

  it('weapon:1364 (8399 RandomPositiveStatusEffect@AllyKingdom 3030): a 3070 faction ally gets nothing', () => {
    const cast = (ally: object) => castSpell({ key: 'weapon:1364', caster: { statuses: [] }, allies: [{ ...clean, ...ally }], enemies: [clean, clean], seed: 3 });
    expect(cast(SHENTANG_FACTION).f.allies[0].statuses).toHaveLength(0);
    expect(cast(SHENTANG).f.allies[0].statuses.length).toBeGreaterThan(0);
  });

  it('weapon:1715 (10047 CountArmyKingdom 3015): a Thorn-forest faction ally (3043) is not counted', () => {
    const line = (ally: object) => summaryLine(castSpell({ key: 'weapon:1715', allies: [{ ...clean, ...ally }], seed: 3 }).summary);
    const none = line({ name: 'X' });
    expect(line({ kingdom: '荆棘森林', kingdomId: 3043 })).toBe(none);
    expect(line({ kingdom: '荆棘森林', kingdomId: 3015 })).not.toBe(none);
  });

  it('weapon:1343 (MultiplyForKingdom 3009): a Silverglade-faction target (3066) is not doubled', () => {
    const lost = (e11: object) => {
      const enemies = DEFAULT_ENEMIES.map((e, i) => (i === 1 ? { ...e, ...e11 } : e));
      const r = castSpell({ key: 'weapon:1343', target: 11, enemies, seed: 1 });
      return 900 - r.f.enemies.find(e => e.id === 11)!.hp;
    };
    const plain = lost({});
    expect(lost({ kingdom: '玉银林地', kingdomId: 3066 })).toBe(plain);
    expect(lost({ kingdom: '玉银林地', kingdomId: 3009 })).toBeGreaterThan(plain);
  });

  it('randomOfKingdom with a raw id summons from that roster only', () => {
    registry.prototypes.set('tmp_P_E_kingdom', skill(summonRandomOfKingdom(3058)));
    const r = castSpell({ skill: 'tmp_P_E_kingdom', cost: 5, allies: [], seed: 7 });
    registry.prototypes.delete('tmp_P_E_kingdom');
    const summoned = r.f.state.teams[r.f.side].characters.filter(c => c.id !== r.f.caster.id);
    expect(summoned).toHaveLength(1);
    expect(summoned[0].kingdomId).toBe(3058);
  });
});
