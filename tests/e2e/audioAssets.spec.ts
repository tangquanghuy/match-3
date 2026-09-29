import { test, expect } from '@playwright/test';

test('battle audio assets decode in Chromium Web Audio', async ({ page }) => {
  await page.goto('/skills-test.html');
  const decoded = await page.evaluate(async () => {
    const context = new AudioContext();
    const paths = [
      '/game-assets/bundled/audio/skills/summon_necromancy.flac',
      '/game-assets/bundled/audio/gems/gem_explode.wav',
      '/game-assets/bundled/audio/gems/chains/gem_chain_1.wav',
      '/game-assets/bundled/audio/gems/chains/gem_chain_2.wav',
      '/game-assets/bundled/audio/gems/chains/gem_chain_3.wav',
      '/game-assets/bundled/audio/gems/chains/gem_chain_4.wav',
      '/game-assets/bundled/audio/gems/chains/gem_chain_5.wav',
      '/game-assets/bundled/audio/combat/skull_hit.wav',
      '/game-assets/bundled/audio/skills/skill_cast_earth.wav',
      '/game-assets/bundled/audio/skills/skill_hit_water.wav',
      '/game-assets/bundled/audio/skills/skill_hit_red_single.wav',
      '/game-assets/bundled/audio/skills/skill_hit_purple_single.wav',
      '/game-assets/bundled/audio/skills/skill_hit_yellow_single.mp3',
      '/game-assets/bundled/audio/skills/skill_hit_green_single.wav',
      '/game-assets/bundled/audio/skills/poison_spell_short.wav',
      '/game-assets/bundled/audio/skills/healing_spell_rise.wav',
      '/game-assets/bundled/audio/skills/armor_iron_hit.wav',
      '/game-assets/bundled/audio/skills/frozen.wav',
      '/game-assets/bundled/audio/skills/burning_tree.wav',
    ];
    const durations: Record<string, number> = {};
    for (const path of paths) {
      const response = await fetch(path);
      const bytes = await response.arrayBuffer();
      const buffer = await context.decodeAudioData(bytes.slice(0));
      durations[path] = buffer.duration;
    }
    await context.close();
    return durations;
  });

  expect(decoded['/game-assets/bundled/audio/skills/summon_necromancy.flac']).toBeCloseTo(5.0, 2);
  expect(decoded['/game-assets/bundled/audio/combat/skull_hit.wav']).toBeCloseTo(0.46, 3);
  expect(decoded['/game-assets/bundled/audio/gems/chains/gem_chain_5.wav']).toBeGreaterThan(0);
  expect(decoded['/game-assets/bundled/audio/gems/chains/gem_chain_4.wav']).toBeGreaterThan(0);
  expect(decoded['/game-assets/bundled/audio/gems/chains/gem_chain_3.wav']).toBeGreaterThan(0);
  expect(decoded['/game-assets/bundled/audio/gems/chains/gem_chain_2.wav']).toBeGreaterThan(0);
  expect(decoded['/game-assets/bundled/audio/gems/chains/gem_chain_1.wav']).toBeGreaterThan(0);
  expect(decoded['/game-assets/bundled/audio/gems/gem_explode.wav']).toBeGreaterThan(0);
  expect(decoded['/game-assets/bundled/audio/skills/skill_cast_earth.wav']).toBeGreaterThan(0);
  expect(decoded['/game-assets/bundled/audio/skills/skill_hit_water.wav']).toBeCloseTo(1.6, 2);
  expect(decoded['/game-assets/bundled/audio/skills/skill_hit_red_single.wav']).toBeCloseTo(0.979, 2);
  expect(decoded['/game-assets/bundled/audio/skills/skill_hit_purple_single.wav']).toBeCloseTo(1.6, 2);
  expect(decoded['/game-assets/bundled/audio/skills/skill_hit_yellow_single.mp3']).toBeGreaterThan(1.7);
  expect(decoded['/game-assets/bundled/audio/skills/skill_hit_yellow_single.mp3']).toBeLessThanOrEqual(1.8);
  expect(decoded['/game-assets/bundled/audio/skills/skill_hit_green_single.wav']).toBeCloseTo(0.9, 2);
  expect(decoded['/game-assets/bundled/audio/skills/poison_spell_short.wav']).toBeCloseTo(0.76, 3);
  expect(decoded['/game-assets/bundled/audio/skills/healing_spell_rise.wav']).toBeCloseTo(2.87, 2);
  expect(decoded['/game-assets/bundled/audio/skills/armor_iron_hit.wav']).toBeCloseTo(1.07, 2);
  expect(decoded['/game-assets/bundled/audio/skills/frozen.wav']).toBeCloseTo(1.733, 2);
  expect(decoded['/game-assets/bundled/audio/skills/burning_tree.wav']).toBeCloseTo(0.9, 3);
  expect(decoded['/game-assets/bundled/audio/gems/gem_explode.wav']).toBeCloseTo(0.868, 2);
});
