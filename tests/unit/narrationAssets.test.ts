import { describe, it, expect } from 'vitest';
// @ts-expect-error node types are not installed in this browser project
import { readFileSync, readdirSync } from 'node:fs';
// @ts-expect-error node types are not installed in this browser project
import { createHash } from 'node:crypto';

import manifest from '../../game-assets/bundled/audio/narrator/manifest.json';
import subtitles from '../../game-assets/bundled/audio/narrator/subtitles.zh-CN.json';
import { NARRATION_CLIPS } from '../../src/render/NarrationCatalog';

const root = new URL('../../', import.meta.url);
describe('finalized narrator assets', () => {
  it('selects exactly the five approved untrimmed midnight replacements', () => {
    const clips = manifest.filter(m => m.enabled && ['heavy.ally', 'spell_heavy.ally', 'aoe_heavy.ally'].includes(m.pool));
    expect(clips).toHaveLength(5);
    expect(clips.map(m => m.sourceFilename.match(/2026-09-26-00-(\d\d)-/)?.[1]).sort()).toEqual(['06','07','16','18','19']);
    expect(clips.filter(m => m.pool === 'heavy.ally')).toHaveLength(3);
    expect(clips.every(m => !/trimmed|2026-09-26-00-10/.test(m.sourceFilename))).toBe(true);
  });
  it('retains original hashes and puts only enabled recordings in runtime assets', () => {
    expect(manifest).toHaveLength(90);
    for (const m of manifest) {
      const bytes = readFileSync(new URL(m.file, root));
      expect(createHash('sha256').update(bytes).digest('hex'), m.file).toBe(m.sha256);
      expect(bytes.length).toBe(m.bytes);
      expect(m.file.startsWith(m.enabled ? 'game-assets/bundled/audio/narrator/' : 'game-assets/source/audio/narrator/archive/')).toBe(true);
    }
    const bundled = readdirSync(new URL('game-assets/bundled/audio/narrator', root)).filter((f: string) => f.endsWith('.mp3'));
    expect(bundled.sort()).toEqual(manifest.filter(m => m.enabled).map(m => m.id + '.mp3').sort());
  });
});


describe('approved encouragement and translated catalog', () => {
  it('imports precisely the three approved September 28 takes', () => {
    const clips = manifest.filter(m => m.enabled && m.pool === 'encourage.ally');
    expect(clips).toHaveLength(3);
    expect(clips.map(m => m.sourceFilename.match(/2026-09-28-20-(\d\d)-/)?.[1])).toEqual(['04', '05', '06']);
  });
  it('every runtime recording has its own English transcript and Chinese subtitle, archives excluded', () => {
    expect(Object.keys(subtitles).sort()).toEqual(NARRATION_CLIPS.map(c => c.id).sort());
    for (const clip of NARRATION_CLIPS) {
      expect(clip.subtitleZh, clip.id).toMatch(/[\u4e00-\u9fff]/);
      expect(clip.transcriptEn, clip.id).toMatch(/[a-zA-Z]/);
      expect(clip.subtitleZh!.length).toBeLessThan(90);
    }
    expect(NARRATION_CLIPS.find(c => c.id === 'encourage_ally_202609282004_01')?.transcriptEn)
      .toBe('Continue the onslaught! Destroy. Them. All.');
  });
});
