import { test, expect } from '@playwright/test';
import { rollInvasionFrenzy } from '../../src/meta/data/invasionFrenzy';

for (const width of [1600,390,320]) {
  test(`${width}px 随机血怒边框、倍率、刷新持久化与减少动态效果`, async ({page}) => {
    await page.setViewportSize({width,height:width===320?568:900});
    await page.goto('/game.html#invasion');
    await expect(page.locator('[data-inv-refresh]')).toBeVisible();
    const state=await page.evaluate(()=>JSON.parse(localStorage.getItem('gems.meta.save')!));
    const slot=width<900?0:1;
    for (const multiplier of [1,1.5,2]) {
      let counter=0;
      for (;counter<10000;counter++) {
        const r=rollInvasionFrenzy(state.invasion.weekStart,state.invasion.league,counter);
        if(multiplier===1?r===null:r?.slot===slot && r.multiplier===multiplier)break;
      }
      expect(counter).toBeLessThan(10000);
      await page.evaluate(counter=>{
        const s=JSON.parse(localStorage.getItem('gems.meta.save')!);s.invasion.refreshCount=counter;
        localStorage.setItem('gems.meta.save',JSON.stringify(s));
      },counter);
      await page.reload();
      await expect(page.locator('.inv-rival')).toHaveCount(3);
      if(multiplier===1) { await expect(page.locator('.inv-rival.frenzy')).toHaveCount(0); continue; }
      const card=page.locator('.inv-rival.frenzy');
      await expect(card).toHaveCount(1);
      await expect(card.locator('.inv-frenzy-badge')).toContainText(`VP ×${multiplier}`);
      await expect(card.locator('.inv-rival-expected b')).toHaveText(`+${[10,20,30][slot]! * multiplier} VP`);
      await expect(card.locator('.inv-def')).toHaveCount(4);
      const before=await card.locator('[data-invade]').getAttribute('data-invade');
      await page.reload(); await expect(card.locator('[data-invade]')).toHaveAttribute('data-invade',before!);
      expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
      await card.locator('.inv-attack').scrollIntoViewIfNeeded();
      await expect(card.locator('.inv-attack')).toBeInViewport();
      await page.emulateMedia({reducedMotion:'reduce'});
      expect(await card.locator('.inv-rival-defense').evaluate(el=>getComputedStyle(el,'::before').animationName)).toBe('none');
      expect(await card.locator('.inv-rival-defense').evaluate(el=>getComputedStyle(el,'::after').animationName)).toBe('none');
      await page.screenshot({path:`artifacts/ux-phase-b/shots/gow-frenzy-${multiplier}-${width}.png`,fullPage:true});
      await page.emulateMedia({reducedMotion:'no-preference'});
      expect(await card.locator('.inv-rival-defense').evaluate(el=>getComputedStyle(el,'::before').animationName)).toBe('inv-frenzy-breathe');
    }
    const before=await page.evaluate(()=>JSON.parse(localStorage.getItem('gems.meta.save')!));
    await page.locator('[data-inv-refresh]').click();
    const after=await page.evaluate(()=>JSON.parse(localStorage.getItem('gems.meta.save')!));
    expect(after.invasion.refreshCount).toBe(before.invasion.refreshCount+1);
    expect(after.currencies).toEqual(before.currencies);
    expect(after.invasion.progressionVp).toBe(before.invasion.progressionVp);
  });
}
