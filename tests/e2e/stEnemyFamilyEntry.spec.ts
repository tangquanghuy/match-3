import {test,expect} from '@playwright/test';
const savedKey='st.enemy-design-preview.v1';
// Fixed product inputs exercise the real form; source mechanics are checked by unit acceptance.
const cases=[
  {
    "id": 6220,
    "seed": 2,
    "colors": "Red,Brown",
    "rank": "精锐",
    "form": "人形",
    "role": "Mage"
  },
  {
    "id": 7131,
    "seed": 115,
    "colors": "Blue,Brown",
    "rank": "精锐",
    "form": "类人",
    "role": "Striker"
  },
  {
    "id": 6788,
    "seed": 332,
    "colors": "Yellow,Purple",
    "rank": "杂兵",
    "form": "人形",
    "role": "Striker"
  },
  {
    "id": 7160,
    "seed": 36,
    "colors": "Blue,Yellow",
    "rank": "杂兵",
    "form": "人形",
    "role": "Striker"
  },
  {
    "id": 7161,
    "seed": 4,
    "colors": "Red,Purple",
    "rank": "精锐",
    "form": "人形",
    "role": "Striker"
  },
  {
    "id": 7159,
    "seed": 111,
    "colors": "Green,Purple",
    "rank": "杂兵",
    "form": "怪物",
    "role": "Striker"
  },
  {
    "id": 7335,
    "seed": 15,
    "colors": "Red,Purple",
    "rank": "首领",
    "form": "人形",
    "role": "Striker"
  }
];
for(const row of cases)test(`family source ${row.id}: real form compiles, saves, reloads and joins formation`,async({page})=>{
 const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto('/sillytavern.html');
 const form=page.getByRole('region',{name:'按战术设计敌人'});
 await form.getByLabel('设计法力颜色',{exact:true}).selectOption(row.colors);
 await form.getByLabel('设计档位',{exact:true}).selectOption(row.rank);
 await form.getByLabel('设计形态',{exact:true}).selectOption(row.form);
 await form.getByLabel('设计职责',{exact:true}).selectOption(row.role);
 await form.getByLabel('设计种子',{exact:true}).fill(String(row.seed));
 for(const checkbox of await form.getByRole('checkbox').all())await checkbox.uncheck();
 await form.getByRole('button',{name:'编译战术设计',exact:true}).click();
 await expect(page.getByRole('region',{name:'战术设计结果'})).toBeVisible();
 await page.getByRole('button',{name:'保存完整敌人配置',exact:true}).click();
 const saved=await page.evaluate(key=>JSON.parse(localStorage.getItem(key)!),savedKey);
 expect(saved.selection.recipeId).toBe(`enemy:${row.id}`);
 expect(saved.blueprint.snapshot.role).toBe(row.role);expect(saved.design.effects).toEqual([]);
 await page.reload();
 expect(await page.evaluate(key=>JSON.parse(localStorage.getItem(key)!),savedKey)).toEqual(saved);
 await expect(form.getByLabel('设计种子',{exact:true})).toHaveValue(String(row.seed));
 await page.getByRole('button',{name:'加入本场编队',exact:true}).click();
 const formation=page.getByRole('region',{name:'本场敌人编队'});await expect(formation).toContainText('1 / 4');
 await formation.getByRole('button',{name:'保存当前编队',exact:true}).click();
 const team=await page.evaluate(()=>JSON.parse(localStorage.getItem('st.enemy-formation-preview.v1')!));
 expect(team.members).toHaveLength(1);expect(team.members[0].recipeId).toBe(`enemy:${row.id}`);
 expect(errors).toEqual([]);
});
