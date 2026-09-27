# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: backgroundMusic.spec.ts >> ambient shuffle keeps playing through all menu routes and honors independent controls
- Location: tests\e2e\backgroundMusic.spec.ts:8:1

# Error details

```
Error: expect(received).toBe(expected) // Object.is equality

Expected: true
Received: false

Call Log:
- Timeout 5000ms exceeded while waiting on the predicate
```

# Page snapshot

```yaml
- generic [ref=e3]:
  - banner [ref=e4]:
    - generic [ref=e5]:
      - img "玩家头像" [ref=e6]
      - generic [ref=e7]:
        - strong [ref=e8]: 影织者
        - generic [ref=e9]: 破晓之誓 Lv.12
    - generic [ref=e12]:
      - button "黄金 38,800" [ref=e13] [cursor=pointer]:
        - img [ref=e15]
        - generic [ref=e17]:
          - generic [ref=e18]: 黄金
          - text: 38,800
      - button "材料库" [ref=e19] [cursor=pointer]:
        - img [ref=e21]
      - button "设置" [ref=e23] [cursor=pointer]:
        - img [ref=e25]
  - generic [ref=e27]:
    - complementary "玩法入口" [ref=e28]:
      - button "王国任务" [ref=e29] [cursor=pointer]:
        - img [ref=e32]
        - generic [ref=e35]: 王国任务
      - button "战役" [ref=e36]:
        - generic [ref=e37]:
          - img [ref=e39]
          - img [ref=e42]
        - generic [ref=e46]: 战役
      - button "活动中心，本周暂无可领取或可兑换内容" [ref=e47] [cursor=pointer]:
        - img [ref=e50]
        - generic [ref=e53]: 活动中心
      - button "入侵" [ref=e54] [cursor=pointer]:
        - generic [ref=e55]:
          - img [ref=e57]
          - img [ref=e60]
        - generic [ref=e64]: 入侵
    - generic [ref=e65]:
      - generic [ref=e67]:
        - img "克里斯塔拉大陆奇幻世界地图"
        - generic [ref=e68]:
          - button "破碎尖塔，王国 3 级，有进贡可收" [ref=e69] [cursor=pointer]:
            - generic [ref=e70]:
              - generic "有进贡可收":
                - generic:
                  - img
                - text: "180"
            - generic:
              - generic: 破碎尖塔
              - generic "王国 3 级": "3"
          - button "阿达纳，王国 2 级" [ref=e71] [cursor=pointer]:
            - generic:
              - generic: 阿达纳
              - generic "王国 2 级": "2"
          - button "卡拉考斯，王国 2 级" [ref=e73] [cursor=pointer]:
            - generic:
              - generic: 卡拉考斯
              - generic "王国 2 级": "2"
          - button "蛛尔卡里，王国 1 级" [ref=e75] [cursor=pointer]:
            - generic:
              - generic: 蛛尔卡里
              - generic "王国 1 级": "1"
          - button "卜筮之原，王国 1 级" [ref=e77] [cursor=pointer]:
            - generic:
              - generic: 卜筮之原
              - generic "王国 1 级": "1"
          - button "鳞雾沼泽，王国 1 级" [ref=e79] [cursor=pointer]:
            - generic:
              - generic: 鳞雾沼泽
              - generic "王国 1 级": "1"
          - button "荆棘森林，未解锁，需冒险者 13 级" [ref=e81] [cursor=pointer]:
            - generic:
              - generic:
                - generic:
                  - img
                - text: 冒险者 Lv.13 解锁
              - generic: 荆棘森林
          - button "白盔国，未解锁，需冒险者 15 级" [ref=e83] [cursor=pointer]:
            - generic:
              - generic:
                - generic:
                  - img
                - text: 冒险者 Lv.15 解锁
              - generic: 白盔国
          - button "潘神之谷，未解锁，需冒险者 17 级" [ref=e85] [cursor=pointer]:
            - generic:
              - generic:
                - generic:
                  - img
                - text: 冒险者 Lv.17 解锁
              - generic: 潘神之谷
          - button "盖塔尔，未解锁，需冒险者 19 级" [ref=e87] [cursor=pointer]:
            - generic:
              - generic:
                - generic:
                  - img
                - text: 冒险者 Lv.19 解锁
              - generic: 盖塔尔
          - button "卡其尔，未解锁，需冒险者 21 级" [ref=e89] [cursor=pointer]:
            - generic:
              - generic:
                - generic:
                  - img
                - text: 冒险者 Lv.21 解锁
              - generic: 卡其尔
          - button "齐埃金，未解锁，需冒险者 23 级" [ref=e91] [cursor=pointer]:
            - generic:
              - generic:
                - generic:
                  - img
                - text: 冒险者 Lv.23 解锁
              - generic: 齐埃金
          - button "荣耀之地，未解锁，需冒险者 25 级" [ref=e93] [cursor=pointer]:
            - generic:
              - generic:
                - generic:
                  - img
                - text: 冒险者 Lv.25 解锁
              - generic: 荣耀之地
          - button "加尔凡尼亚，未解锁，需冒险者 27 级" [ref=e95] [cursor=pointer]:
            - generic:
              - generic:
                - generic:
                  - img
                - text: 冒险者 Lv.27 解锁
              - generic: 加尔凡尼亚
          - button "剑锋崖，未解锁，需冒险者 29 级" [ref=e97] [cursor=pointer]:
            - generic:
              - generic:
                - generic:
                  - img
                - text: 冒险者 Lv.29 解锁
              - generic: 剑锋崖
          - button "风暴峡湾，未解锁，需冒险者 31 级" [ref=e99] [cursor=pointer]:
            - generic:
              - generic:
                - generic:
                  - img
                - text: 冒险者 Lv.31 解锁
              - generic: 风暴峡湾
          - button "毛格瑞姆森林，未解锁，需冒险者 33 级" [ref=e101] [cursor=pointer]:
            - generic:
              - generic:
                - generic:
                  - img
                - text: 冒险者 Lv.33 解锁
              - generic: 毛格瑞姆森林
          - button "葛洛什奈克，未解锁，需冒险者 35 级" [ref=e103] [cursor=pointer]:
            - generic:
              - generic:
                - generic:
                  - img
                - text: 冒险者 Lv.35 解锁
              - generic: 葛洛什奈克
          - button "混沌，未解锁，需冒险者 37 级" [ref=e105] [cursor=pointer]:
            - generic:
              - generic:
                - generic:
                  - img
                - text: 冒险者 Lv.37 解锁
              - generic: 混沌
          - button "狂野平原，未解锁，需冒险者 39 级" [ref=e107] [cursor=pointer]:
            - generic:
              - generic:
                - generic:
                  - img
                - text: 冒险者 Lv.39 解锁
              - generic: 狂野平原
          - button "黑石，未解锁，需冒险者 41 级" [ref=e109] [cursor=pointer]:
            - generic:
              - generic:
                - generic:
                  - img
                - text: 冒险者 Lv.41 解锁
              - generic: 黑石
          - button "聚沙之地，未解锁，需冒险者 43 级" [ref=e111] [cursor=pointer]:
            - generic:
              - generic:
                - generic:
                  - img
                - text: 冒险者 Lv.43 解锁
              - generic: 聚沙之地
          - button "荒芜之地，未解锁，需冒险者 45 级" [ref=e113] [cursor=pointer]:
            - generic:
              - generic:
                - generic:
                  - img
                - text: 冒险者 Lv.45 解锁
              - generic: 荒芜之地
          - button "冰峰之巅，未解锁，需冒险者 47 级" [ref=e115] [cursor=pointer]:
            - generic:
              - generic:
                - generic:
                  - img
                - text: 冒险者 Lv.47 解锁
              - generic: 冰峰之巅
          - button "天启，未解锁，需冒险者 49 级" [ref=e117] [cursor=pointer]:
            - generic:
              - generic:
                - generic:
                  - img
                - text: 冒险者 Lv.49 解锁
              - generic: 天启
          - button "狮心帝国，未解锁，需冒险者 50 级" [ref=e119] [cursor=pointer]:
            - generic:
              - generic:
                - generic:
                  - img
                - text: 冒险者 Lv.50 解锁
              - generic: 狮心帝国
          - button "龙爪，未解锁，需冒险者 50 级" [ref=e121] [cursor=pointer]:
            - generic:
              - generic:
                - generic:
                  - img
                - text: 冒险者 Lv.50 解锁
              - generic: 龙爪
          - button "守护者，未解锁，需冒险者 50 级" [ref=e123] [cursor=pointer]:
            - generic:
              - generic:
                - generic:
                  - img
                - text: 冒险者 Lv.50 解锁
              - generic: 守护者
          - button "黑鹰，未解锁，需冒险者 50 级" [ref=e125] [cursor=pointer]:
            - generic:
              - generic:
                - generic:
                  - img
                - text: 冒险者 Lv.50 解锁
              - generic: 黑鹰
          - button "玉银林地，未解锁，需冒险者 50 级" [ref=e127] [cursor=pointer]:
            - generic:
              - generic:
                - generic:
                  - img
                - text: 冒险者 Lv.50 解锁
              - generic: 玉银林地
          - button "日冕，未解锁，需冒险者 50 级" [ref=e129] [cursor=pointer]:
            - generic:
              - generic:
                - generic:
                  - img
                - text: 冒险者 Lv.50 解锁
              - generic: 日冕
          - button "厄什卡亚，未解锁，需冒险者 50 级" [ref=e131] [cursor=pointer]:
            - generic:
              - generic:
                - generic:
                  - img
                - text: 冒险者 Lv.50 解锁
              - generic: 厄什卡亚
          - button "藏宝库，未解锁，需冒险者 50 级" [ref=e133] [cursor=pointer]:
            - generic:
              - generic:
                - generic:
                  - img
                - text: 冒险者 Lv.50 解锁
              - generic: 藏宝库
          - button "梅兰堤斯，未解锁，需冒险者 50 级" [ref=e135] [cursor=pointer]:
            - generic:
              - generic:
                - generic:
                  - img
                - text: 冒险者 Lv.50 解锁
              - generic: 梅兰堤斯
          - button "圣唐，未解锁，需冒险者 50 级" [ref=e137] [cursor=pointer]:
            - generic:
              - generic:
                - generic:
                  - img
                - text: 冒险者 Lv.50 解锁
              - generic: 圣唐
          - button "皓彩森林，未解锁，需冒险者 50 级" [ref=e139] [cursor=pointer]:
            - generic:
              - generic:
                - generic:
                  - img
                - text: 冒险者 Lv.50 解锁
              - generic: 皓彩森林
          - button "卓克祖，未解锁，需冒险者 50 级" [ref=e141] [cursor=pointer]:
            - generic:
              - generic:
                - generic:
                  - img
                - text: 冒险者 Lv.50 解锁
              - generic: 卓克祖
          - button "迈纳杰之罪，未解锁，需冒险者 50 级" [ref=e143] [cursor=pointer]:
            - generic:
              - generic:
                - generic:
                  - img
                - text: 冒险者 Lv.50 解锁
              - generic: 迈纳杰之罪
          - button "沃尔帕克，未解锁，需冒险者 50 级" [ref=e145] [cursor=pointer]:
            - generic:
              - generic:
                - generic:
                  - img
                - text: 冒险者 Lv.50 解锁
              - generic: 沃尔帕克
          - button "诺斯，未解锁，需冒险者 50 级" [ref=e147] [cursor=pointer]:
            - generic:
              - generic:
                - generic:
                  - img
                - text: 冒险者 Lv.50 解锁
              - generic: 诺斯
          - button "地狱悬崖，未解锁，需冒险者 50 级" [ref=e149] [cursor=pointer]:
            - generic:
              - generic:
                - generic:
                  - img
                - text: 冒险者 Lv.50 解锁
              - generic: 地狱悬崖
          - button "午夜城市，未解锁，需冒险者 50 级" [ref=e151] [cursor=pointer]:
            - generic:
              - generic:
                - generic:
                  - img
                - text: 冒险者 Lv.50 解锁
              - generic: 午夜城市
      - button "王国列表 · 42" [ref=e154] [cursor=pointer]:
        - img [ref=e156]
        - generic [ref=e158]: 王国列表 · 42
      - button "重置视野" [ref=e159] [cursor=pointer]:
        - img [ref=e160]:
          - generic [ref=e166]: "N"
    - complementary "养成入口" [ref=e167]:
      - button "武器库" [ref=e168] [cursor=pointer]:
        - img [ref=e171]
        - generic [ref=e174]: 武器库
      - button "神殿" [ref=e175] [cursor=pointer]:
        - img [ref=e178]
        - generic [ref=e181]: 神殿
      - button "馈赠" [ref=e182]:
        - generic [ref=e183]:
          - img [ref=e185]
          - img [ref=e188]
        - generic [ref=e192]: 馈赠
    - generic [ref=e193]:
      - button "每日首胜未领" [ref=e194] [cursor=pointer]:
        - img [ref=e196]
        - generic [ref=e198]: 每日首胜未领
      - button "收取进贡" [ref=e199] [cursor=pointer]:
        - img [ref=e201]
        - generic [ref=e203]: 收取进贡
      - button "竞技场 · 1000黄金" [ref=e204] [cursor=pointer]:
        - img [ref=e206]
        - generic [ref=e208]: 竞技场 · 1000黄金
      - button "寻宝 7" [ref=e209] [cursor=pointer]:
        - img [ref=e211]
        - generic [ref=e214]: 寻宝 7
  - contentinfo [ref=e215]:
    - navigation "主导航" [ref=e216]:
      - button "地图" [ref=e217] [cursor=pointer]:
        - img [ref=e219]
        - generic [ref=e221]: 地图
      - button "队伍" [ref=e222] [cursor=pointer]:
        - img [ref=e224]
        - generic [ref=e226]: 队伍
      - button "英雄" [ref=e227] [cursor=pointer]:
        - img [ref=e229]
        - generic [ref=e231]: 英雄
      - button "图鉴" [ref=e232] [cursor=pointer]:
        - img [ref=e234]
        - generic [ref=e236]: 图鉴
      - button "宝箱" [ref=e237] [cursor=pointer]:
        - img [ref=e239]
        - generic [ref=e241]: 宝箱
      - button "商店" [ref=e242] [cursor=pointer]:
        - img [ref=e244]
        - generic [ref=e246]: 商店
  - status
```

# Test source

```ts
  1   | import { expect, test } from '@playwright/test';
  2   | 
  3   | // Vite may have an HMR timestamp on the live singleton: import that exact URL.
  4   | test.beforeEach(async ({ page }) => {
  5   |   await page.addInitScript(() => performance.setResourceTimingBufferSize(5000));
  6   | });
  7   | 
  8   | test('ambient shuffle keeps playing through all menu routes and honors independent controls', async ({ page }) => {
  9   |   const errors: string[] = [];
  10  |   page.on('pageerror', error => errors.push(error.message));
  11  |   await page.goto('/game.html#map');
  12  |   await page.waitForSelector('#settings');
  13  |   const state = () => page.evaluate(async () => {
  14  |     const path = performance.getEntriesByType('resource').map(entry => entry.name)
  15  |       .find(name => name.includes('/src/audio/BackgroundMusic.ts')) ?? '/src/audio/BackgroundMusic.ts';
  16  |     const { backgroundMusic: music } = await import(path);
  17  |     const audio = music.current?.audio as HTMLAudioElement | undefined;
  18  |     return { scene: music.getScene(), voices: music.voices.length, src: audio?.src ?? '',
  19  |       time: audio?.currentTime ?? 0, paused: audio?.paused ?? true, volume: audio?.volume ?? 0,
  20  |       gain: music.current?.track.gain ?? 0, ready: audio?.readyState ?? 0 };
  21  |   });
  22  |   expect((await state()).voices).toBe(0);
  23  |   await page.mouse.click(5, 5);
  24  |   await expect.poll(async () => {
  25  |     const audio = await state();
  26  |     return !audio.paused && audio.time > 0.1 && audio.volume > 0 && audio.ready >= 2;
> 27  |   }).toBe(true);
      |      ^ Error: expect(received).toBe(expected) // Object.is equality
  28  |   const first = (await state()).src;
  29  |   // The next random track must differ, regardless of which of the five started first.
  30  |   await page.evaluate(async () => {
  31  |     const path = performance.getEntriesByType('resource').map(entry => entry.name)
  32  |       .find(name => name.includes('/src/audio/BackgroundMusic.ts')) ?? '/src/audio/BackgroundMusic.ts';
  33  |     const { backgroundMusic: music } = await import(path);
  34  |     music.current.audio.currentTime = music.current.audio.duration - 3.2;
  35  |   });
  36  |   await expect.poll(async () => {
  37  |     const audio = await state();
  38  |     return audio.voices === 1 && audio.src !== first && !audio.paused && audio.volume > 0;
  39  |   }, { timeout: 10000 }).toBe(true);
  40  |   const playing = await state();
  41  |   for (const delay of [80, 850]) {
  42  |     for (const route of ['team', 'events', 'hero', 'shop', 'map']) {
  43  |       await page.evaluate(route => { location.hash = `#${route}`; }, route);
  44  |       await page.waitForTimeout(delay);
  45  |       const audio = await state();
  46  |       expect(audio.scene).toBe('meta');
  47  |       expect(audio.src).toBe(playing.src);
  48  |       expect(audio.time).toBeGreaterThanOrEqual(playing.time);
  49  |       expect(audio.voices).toBe(1);
  50  |       expect(audio.paused).toBe(false);
  51  |     }
  52  |   }
  53  |   await page.evaluate(() => { location.hash = '#settings'; });
  54  |   await page.waitForSelector('#musicVolume');
  55  |   await page.locator('#musicVolume').fill('25');
  56  |   await page.locator('#musicEnabled').uncheck();
  57  |   await expect.poll(async () => {
  58  |     const audio = await state(); return [audio.scene, audio.paused, audio.volume];
  59  |   }).toEqual(['meta', true, 0]);
  60  |   await page.locator('#musicEnabled').check();
  61  |   await expect.poll(async () => (await state()).volume).toBeCloseTo(0.8 * 0.25 * playing.gain, 3);
  62  |   expect((await state()).src).toBe(playing.src);
  63  |   expect(errors).toEqual([]);
  64  | });
  65  | 
  66  | test('all eleven finalized files can be decoded by the browser', async ({ page }) => {
  67  |   await page.goto('/game.html');
  68  |   const result = await page.evaluate(async () => {
  69  |     const path = '/src/audio/MusicCatalog.ts';
  70  |     const { MUSIC_TRACKS } = await import(path);
  71  |     const tracks = Object.values(MUSIC_TRACKS).flat() as { url: string }[];
  72  |     const context = new AudioContext();
  73  |     const results: number[] = [];
  74  |     try {
  75  |       // Serial decoding keeps memory bounded on CI and mobile-sized machines.
  76  |       for (const track of tracks) {
  77  |         const response = await fetch(track.url);
  78  |         if (!response.ok) throw new Error(`Missing audio: ${track.url}`);
  79  |         const buffer = await context.decodeAudioData(await response.arrayBuffer());
  80  |         results.push(buffer.duration);
  81  |       }
  82  |     } finally { await context.close(); }
  83  |     return results;
  84  |   });
  85  |   expect(result).toHaveLength(11);
  86  |   expect(result.every(duration => duration > 50 && duration < 210)).toBe(true);
  87  | });
  88  | 
  89  | test('live battle keeps its theme, ducks narration/settings/result and restores the ambient scene', async ({ page }) => {
  90  |   await page.goto('/index.html');
  91  |   await page.waitForFunction(() => {
  92  |     const app = (window as unknown as { __app?: { startupPlaying: boolean } }).__app;
  93  |     return app && !app.startupPlaying && document.querySelector('.battle-settings-button');
  94  |   });
  95  |   await page.getByRole('button', { name: '战斗设置', exact: true }).click();
  96  |   await expect.poll(async () => page.evaluate(async () => {
  97  |     const path = performance.getEntriesByType('resource').map(entry => entry.name)
  98  |       .find(name => name.includes('/src/audio/BackgroundMusic.ts')) ?? '/src/audio/BackgroundMusic.ts';
  99  |     const { backgroundMusic: music } = await import(path);
  100 |     return music.ducks.has('settings') && music.current?.audio.currentTime > 0;
  101 |   })).toBe(true);
  102 |   const scene = await page.evaluate(async () => {
  103 |     const path = performance.getEntriesByType('resource').map(entry => entry.name)
  104 |       .find(name => name.includes('/src/audio/BackgroundMusic.ts')) ?? '/src/audio/BackgroundMusic.ts';
  105 |     const { backgroundMusic: music } = await import(path);
  106 |     music.setAmbientScene('meta');
  107 |     return music.getScene();
  108 |   });
  109 |   expect(['battle', 'elite', 'boss']).toContain(scene);
  110 |   // Exercise the real NarrationAudio onSpeaking -> music duck callback.
  111 |   await page.evaluate(async () => {
  112 |     const catalogPath = '/src/render/NarrationCatalog.ts';
  113 |     const catalog = await import(catalogPath);
  114 |     const app = (window as unknown as { __app: { audio: { playNarration(clip: unknown, interrupt: boolean): boolean } } }).__app;
  115 |     const clips = Object.values(catalog.NARRATION_CLIPS ?? {});
  116 |     const clip = clips[0];
  117 |     if (!clip) throw new Error('Narration fixture missing');
  118 |     app.audio.playNarration(clip, true);
  119 |   });
  120 |   await expect.poll(async () => page.evaluate(async () => {
  121 |     const path = performance.getEntriesByType('resource').map(entry => entry.name)
  122 |       .find(name => name.includes('/src/audio/BackgroundMusic.ts')) ?? '/src/audio/BackgroundMusic.ts';
  123 |     const { backgroundMusic: music } = await import(path);
  124 |     return music.ducks.has('narration');
  125 |   }), { timeout: 10000 }).toBe(true);
  126 |   await page.getByRole('button', { name: '放弃本局' }).click();
  127 |   await page.getByRole('button', { name: '确认放弃' }).click();
```