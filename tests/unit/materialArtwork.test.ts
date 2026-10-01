import { describe, expect, it } from 'vitest';
// @ts-expect-error Node fixture (project tsconfig does not include Node declarations)
import { readFileSync, statSync } from 'node:fs';
import { ARCANE_STONE_KEYS, STONE_COLORS } from '../../src/meta/data/materials';
import { stoneArt, stoneMarkupForKey } from '../../src/meta/shell/materialArt';

const assetPath = (key: string) => `game-assets/bundled/materials/stone-${key.replaceAll(':', '-')}.webp`;

describe('generated arcane material artwork', () => {
  it.each(ARCANE_STONE_KEYS)('%s has compressed raster art instead of an inline SVG', key => {
    const url = stoneArt('arcane', key.slice(7));
    expect(url).toContain(`stone-${key.replaceAll(':', '-')}.webp`);
    const markup = stoneMarkupForKey(key);
    expect(markup).toContain('<img');
    expect(markup).toContain(url);
    expect(markup).not.toContain('<svg');
    const file = readFileSync(assetPath(key));
    expect(file.toString('ascii', 0, 4)).toBe('RIFF');
    expect(file.toString('ascii', 8, 12)).toBe('WEBP');
    expect(file.byteLength).toBeLessThan(20 * 1024);
  });

  it('all 21 combinations use distinct artwork; reversed colors share the canonical image', () => {
    const urls = ARCANE_STONE_KEYS.map(key => stoneArt('arcane', key.slice(7)));
    expect(new Set(urls).size).toBe(21);
    for (const key of ARCANE_STONE_KEYS) {
      const [, a, b] = key.split(':');
      expect(stoneArt('arcane', `${b}:${a}`)).toBe(stoneArt('arcane', `${a}:${b}`));
    }
    expect(ARCANE_STONE_KEYS.reduce((sum, key) => sum + statSync(assetPath(key)).size, 0)).toBeLessThan(320 * 1024);
  });

  it('lower tiers keep their established assets and single-color aliases stay valid', () => {
    for (const { key } of STONE_COLORS) {
      expect(stoneArt('arcane', key)).toBe(stoneArt('arcane', `${key}:${key}`));
      for (const tier of ['minor', 'major', 'runic']) {
        expect(stoneArt(tier, key)).toContain(`stone-${tier}-${key}.png`);
      }
    }
    expect(stoneArt('celestial')).toContain('stone-celestial.png');
    expect(stoneArt('arcane', 'unknown:blue')).toBe('');
    expect(stoneArt('arcane', 'blue:red:green')).toBe('');
  });

  it('exploration art is compressed for the login preload budget', () => {
    expect(statSync('game-assets/bundled/meta/explore/relic-landscape.webp').size).toBeLessThan(350 * 1024);
    expect(statSync('game-assets/bundled/meta/explore/difficulty-sigil.webp').size).toBeLessThan(40 * 1024);
  });
});
