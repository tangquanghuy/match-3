import { describe, expect, it } from 'vitest';
import { COMMUNITY_KINGDOM, COMMUNITY_TROOPS } from '../../src/data/communityTroops';
import { allKingdoms } from '../../src/meta/data/kingdoms';
import { SettingsScreen } from '../../src/meta/screens/settingsScreen';
import type { ShellCtx } from '../../src/meta/shell/screen';
import { newSave } from '../../src/meta/state/schema';
import { restoreRealCollection, unlockKingdomTroops } from '../../src/meta/systems/collectionModifier';

describe('设置页收集修改器：社区王国', () => {
  it('下拉选项包含时空裂隙，而地图王国列表保持不变', () => {
    const save = newSave({ now: 0, starterTroopIds: [6000] });
    // 修改器属开发者工具：只有带 dev 的本地后端才渲染
    const gateway = { backend: 'local', dev: {} } as unknown as ShellCtx['gateway'];
    const html = new SettingsScreen().html({ save: () => save, gateway } as ShellCtx);
    const options = html.match(/<select id="collectionKingdom"[^>]*>(.*?)<\/select>/s)?.[1];

    expect(options).toContain(`<option value="${COMMUNITY_KINGDOM}">${COMMUNITY_KINGDOM}</option>`);
    expect(allKingdoms()).not.toContain(COMMUNITY_KINGDOM);
  });

  it('解锁时空裂隙全部部队后仍可还原真实收集', () => {
    const save = newSave({ now: 0, starterTroopIds: [6000] });
    const unlocked = unlockKingdomTroops(save, COMMUNITY_KINGDOM);

    expect(unlocked.ok).toBe(true);
    expect(unlocked.ok && unlocked.added).toBe(COMMUNITY_TROOPS.length);
    for (const troop of COMMUNITY_TROOPS) {
      expect(save.collection[String(troop.id)]).toBeDefined();
    }
    expect(Object.keys(save.collectionTruth!)).toEqual(['6000']);

    restoreRealCollection(save);
    expect(Object.keys(save.collection)).toEqual(['6000']);
    expect(save.collectionTruth).toBeNull();
  });
});
