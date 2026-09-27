import { describe, it, expect } from 'vitest';
// @ts-expect-error node types are not installed in this browser project
import { readFileSync, readdirSync } from 'node:fs';
// @ts-expect-error node types are not installed in this browser project
import { createHash } from 'node:crypto';

import manifest from '../../src/assets/audio/narrator/manifest.json';

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
    expect(manifest).toHaveLength(87);
    for (const m of manifest) {
      const bytes = readFileSync(new URL(m.file, root));
      expect(createHash('sha256').update(bytes).digest('hex'), m.file).toBe(m.sha256);
      expect(bytes.length).toBe(m.bytes);
      expect(m.file.startsWith(m.enabled ? 'src/assets/audio/narrator/' : 'assets/audio/narrator/archive/')).toBe(true);
    }
    const bundled = readdirSync(new URL('src/assets/audio/narrator', root)).filter((f: string) => f.endsWith('.mp3'));
    expect(bundled.sort()).toEqual(manifest.filter(m => m.enabled).map(m => m.id + '.mp3').sort());
  });
});
