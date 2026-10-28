import {test,expect} from '@playwright/test';
import type {Page} from '@playwright/test';
import type {EnemyFormation} from '../../src/sillytavern/enemyFormation';
const KEY='st.enemy-formation-preview.v1';
const region=(page:Page)=>page.getByRole('region',{name:'本场敌人编队',exact:true});
const slot=(page:Page,index:number)=>region(page).getByRole('listitem',{name:`位置 ${index}`,exact:true});
const add=(page:Page)=>page.getByRole('button',{name:'加入本场编队',exact:true}).click();
const save=(page:Page)=>region(page).getByRole('button',{name:'保存当前编队',exact:true}).click();
const read=(page:Page)=>page.evaluate(key=>JSON.parse(localStorage.getItem(key)!),KEY) as Promise<EnemyFormation>;
async function start(page:Page){await page.goto('/sillytavern.html');await page.getByRole('button',{name:'选择 Troop_K00_00',exact:true}).click();}
async function setNumber(page:Page,label:string,value:string){await page.getByRole('spinbutton',{name:label,exact:true}).fill(value);await page.getByRole('spinbutton',{name:label,exact:true}).press('Tab');}

test('formation saves four independent positions, reorders duplicates and restores the entire design',async({page})=>{
 await start(page);await add(page);await save(page);const original=(await read(page)).members[0];
 await setNumber(page,'敌人等级','37');await setNumber(page,'难度倍率','2');await add(page);
 await setNumber(page,'敌人等级','8');await add(page);await add(page);
 await expect(region(page).getByRole('listitem')).toHaveCount(4);
 await expect(page.getByRole('button',{name:'加入本场编队',exact:true})).toBeDisabled();
 await expect(slot(page,1).getByRole('button',{name:'上移',exact:true})).toBeDisabled();
 await expect(slot(page,4).getByRole('button',{name:'下移',exact:true})).toBeDisabled();
 await slot(page,2).getByRole('button',{name:'上移',exact:true}).click();await save(page);
 const saved=await read(page);expect(saved.members.map(m=>m.level)).toEqual([37,20,8,8]);
 expect(saved.members.map(m=>m.snapshot.externalId)).toEqual(['enemy-1','enemy-2','enemy-3','enemy-4']);
 expect(saved.members[1].snapshot).toEqual({...original.snapshot,externalId:'enemy-2',name:original.snapshot.name.replace(/enemy-1$/,'enemy-2')});
 expect(saved.members[1].difficulty).toBe(1);expect(saved.members[0].difficulty).toBe(2);
 await page.reload();await expect(region(page).getByRole('listitem')).toHaveCount(4);expect(await read(page)).toEqual(saved);
 await expect(region(page)).toContainText('已恢复保存的整场编队');
 await expect(slot(page,1)).toContainText('等级 37 · 难度 2');
 await expect(slot(page,1)).toContainText(saved.members[0].snapshot.spellDescription!);
});

test('formation draft survives editor filters, explicit empty save clears only the formation',async({page})=>{
 await start(page);await page.getByRole('button',{name:'保存完整敌人配置',exact:true}).click();await add(page);await save(page);
 const saved=await read(page);await add(page);await expect(region(page)).toContainText('有未保存的编队更改');
 await page.getByRole('button',{name:'清空筛选',exact:true}).click();await expect(region(page).getByRole('listitem')).toHaveCount(2);
 await page.reload();await expect(region(page).getByRole('listitem')).toHaveCount(1);expect(await read(page)).toEqual(saved);
 await slot(page,1).getByRole('button',{name:'移除',exact:true}).click();await save(page);await page.reload();
 await expect(region(page).getByRole('listitem')).toHaveCount(0);
 expect(await page.evaluate(key=>localStorage.getItem(key),KEY)).toBeNull();
 await expect(page.getByRole('region',{name:'敌人能力配置',exact:true})).toBeVisible();
 expect(await page.evaluate(()=>localStorage.getItem('st.enemy-preview.v1'))).toBeTruthy();
});

test('formation displays actual base totals, independent mana, colors and frozen environment on narrow screens',async({page})=>{
 await page.setViewportSize({width:390,height:844});await start(page);
 await setNumber(page,'敌人等级','7');await add(page);
 await setNumber(page,'敌人等级','32');await setNumber(page,'难度倍率','1.7');await add(page);await save(page);
 const saved=await read(page),members=saved.members;
 const stats={hp:0,armor:0,attack:0,magic:0};for(const m of members)for(const k of ['hp','armor','attack','magic']as const)stats[k]+=m.snapshot.stats[k];
 const overview=region(page).getByLabel('编队基础面板');
 await expect(overview).toContainText(`生命 ${stats.hp} · 护甲 ${stats.armor} · 攻击 ${stats.attack} · 魔力 ${stats.magic}`);
 await expect(overview).toContainText(`法力消耗合计 ${members.reduce((sum,m)=>sum+m.snapshot.manaCost,0)}（各位置分别充能）`);
 await expect(overview).toContainText('蓝：位置 1、2');
 await expect(overview).toContainText('环境召唤基准：等级 20 · 难度 1.35');
 await expect(overview).toContainText('开战效果触发前');await expect(overview).toContainText('仍需实战标定');
 for(let i=1;i<=2;i++){const image=slot(page,i).getByRole('img');await expect(image).toBeVisible();await expect.poll(()=>image.evaluate(el=>(el as HTMLImageElement).naturalWidth)).toBeGreaterThan(0);}
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true);
 await slot(page,1).getByRole('button',{name:'下移',exact:true}).click();await slot(page,2).getByRole('button',{name:'移除',exact:true}).click();await save(page);
 expect((await read(page)).members.map(m=>m.level)).toEqual([32]);
});

test('one damaged formation member rejects the whole formation while single enemy editing stays usable',async({page})=>{
 await start(page);await page.getByRole('button',{name:'保存完整敌人配置',exact:true}).click();await add(page);await add(page);await save(page);
 await page.evaluate(key=>{const saved=JSON.parse(localStorage.getItem(key)!);saved.members[1].snapshot.stats.hp+=1;localStorage.setItem(key,JSON.stringify(saved));},KEY);
 await page.reload();await expect(region(page).getByRole('alert')).toContainText('编队读取失败');
 await expect(region(page).getByRole('listitem')).toHaveCount(0);await expect(page.getByRole('region',{name:'敌人能力配置',exact:true})).toBeVisible();
 await add(page);await save(page);await page.reload();await expect(region(page).getByRole('listitem')).toHaveCount(1);await expect(region(page).getByRole('alert')).toHaveCount(0);
});

test('failed formation storage retains dirty draft and the last persisted formation',async({page})=>{
 await start(page);await page.getByRole('button',{name:'保存完整敌人配置',exact:true}).click();await add(page);await save(page);const original=await read(page);await add(page);
 await page.evaluate(key=>{const originalSet=Storage.prototype.setItem;Storage.prototype.setItem=function(k:string,v:string){if(k===key)throw new DOMException('存储空间已满','QuotaExceededError');return originalSet.call(this,k,v);};},KEY);
 await save(page);await expect(region(page).getByRole('alert')).toContainText('存储空间已满');await expect(region(page)).toContainText('有未保存的编队更改');
 expect(await read(page)).toEqual(original);await page.reload();await expect(region(page).getByRole('listitem')).toHaveCount(1);
});

test('economic formation retains the full native design after reload',async({page})=>{
 await page.goto('/sillytavern.html');
 const fixture=await page.evaluate(async()=>{
  const portraitsPath='/src/sillytavern/portraits.ts',troopsPath='/src/data/troops.ts';
  const {PORTRAITS}=await import(/* @vite-ignore */portraitsPath) as typeof import('../../src/sillytavern/portraits');
  const {TROOPS}=await import(/* @vite-ignore */troopsPath) as typeof import('../../src/data/troops');
  const troop=TROOPS.find(t=>t.spell.id===7037)!,portrait=PORTRAITS.find(p=>p.troopId===troop.id)!;
  return {assetId:portrait.assetId,rank:portrait.rank,role:portrait.role,form:portrait.form};
 });
 for(const [label,value]of [['稀有度',fixture.rank],['形态',fixture.form],['职责',fixture.role]])await page.getByRole('combobox',{name:label,exact:true}).selectOption(value);
 const artwork=page.getByRole('button',{name:`选择 ${fixture.assetId}`,exact:true});
 while(await artwork.count()===0)await page.getByRole('button',{name:'再显示 24 张',exact:true}).click();
 await artwork.click();await add(page);await save(page);
 const saved=await read(page);expect(saved.members[0].snapshot.skillId).toBe('st:7037');
 await expect(slot(page,1).getByRole('alert')).toHaveCount(0);
 await page.reload();await expect(slot(page,1).getByRole('alert')).toHaveCount(0);expect(await read(page)).toEqual(saved);
});


test('editing numeric controls then clicking an action uses the updated blueprint on the first click',async({page})=>{
 await start(page);
 await page.getByRole('spinbutton',{name:'敌人等级',exact:true}).fill('31');
 await add(page);await expect(region(page).getByRole('listitem')).toHaveCount(1);
 await expect(slot(page,1)).toContainText('等级 31 · 难度 1');
 await page.getByRole('spinbutton',{name:'难度倍率',exact:true}).fill('1.8');
 await page.getByRole('button',{name:'保存完整敌人配置',exact:true}).click();
 const single=await page.evaluate(()=>JSON.parse(localStorage.getItem('st.enemy-preview.v1')!));
 expect(single.level).toBe(31);expect(single.difficulty).toBe(1.8);
 await page.getByRole('spinbutton',{name:'敌人等级',exact:true}).fill('');
 await expect(page.getByRole('button',{name:'加入本场编队',exact:true})).toHaveCount(0);
 await page.getByRole('spinbutton',{name:'敌人等级',exact:true}).fill('42');
 await page.getByRole('spinbutton',{name:'难度倍率',exact:true}).fill('2.1');
 await add(page);await save(page);expect((await read(page)).members.map(m=>[m.level,m.difficulty])).toEqual([[31,1],[42,2.1]]);
});
