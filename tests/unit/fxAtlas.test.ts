import { describe, expect, it } from 'vitest';
import atlases from '../../game-assets/bundled/fx/atlas/atlas.json';
import { AnimConfig } from '../../src/render/AnimationConfig';

type Rect = [number, number, number, number, number, number];
const ATLASES = atlases as unknown as Record<string, { width: number; height: number; frameW: number; frameH: number; frames: Rect[] }>;

describe('序列帧图集（scripts/build_fx_atlas.py 产物）', () => {
  it('每帧都落在图集内、且不超出原帧外框', () => {
    for (const [stem, atlas] of Object.entries(ATLASES)) {
      for (const [i, [x, y, w, h, ox, oy]] of atlas.frames.entries()) {
        const at = `${stem} 第 ${i} 帧`;
        expect(x + w, at).toBeLessThanOrEqual(atlas.width);
        expect(y + h, at).toBeLessThanOrEqual(atlas.height);
        expect(ox + w, at).toBeLessThanOrEqual(atlas.frameW);
        expect(oy + h, at).toBeLessThanOrEqual(atlas.frameH);
      }
    }
  });

  it('帧与帧在图集里互不重叠', () => {
    for (const [stem, atlas] of Object.entries(ATLASES)) {
      const rects = atlas.frames.filter(([, , w, h]) => w && h);
      for (let a = 0; a < rects.length; a++) {
        for (let b = a + 1; b < rects.length; b++) {
          const [ax, ay, aw, ah] = rects[a]!;
          const [bx, by, bw, bh] = rects[b]!;
          const overlap = ax < bx + bw && bx < ax + aw && ay < by + bh && by < ay + ah;
          expect(overlap, `${stem} 帧 ${a}/${b} 重叠`).toBe(false);
        }
      }
    }
  });

  it('命中爆点图集与 AnimConfig.slash 几何一致', () => {
    const slash = ATLASES['hit_108stairs_strip']!;
    expect(slash.frames).toHaveLength(AnimConfig.slash.frames);
    expect([slash.frameW, slash.frameH]).toEqual([AnimConfig.slash.frameW, AnimConfig.slash.frameH]);
  });

  it('每个 frameFX 配置都能找到帧数与外框一致的图集', () => {
    const geometries = new Set(Object.values(ATLASES).map((a) => `${a.frames.length}x${a.frameW}x${a.frameH}`));
    for (const [name, cfg] of Object.entries(AnimConfig.frameFX)) {
      expect(geometries.has(`${cfg.frames}x${cfg.frameW}x${cfg.frameH}`), name).toBe(true);
    }
  });
});
