import {adaptedTraitDescription} from './enemyBlueprint';
import {renderTraitDescription} from './traitDescriptionView';
import { PORTRAITS, COLOR_NAMES, FORMS, RANKS, ROLE_ORDER, ROLE_NAMES, findPortraits, savePortrait, restorePortrait } from './portraits';
import type { PortraitQuery, PortraitEntry } from './portraits';
import {getTroopById} from '../data/troops';
import type { TroopRole } from '../data/troops';
import {compileEnemyBlueprint,restoreEnemyBlueprint,adaptedTrait,adaptedPrototype,skillNameForTroop} from './enemyBlueprint';
import type {EnemyBlueprint} from './enemyBlueprint';
import {buildDerivedFormPreview,renderDerivedFormPreview} from './derivedFormPreview';
import {prototypeEconomyIssues,traitEconomyIssues} from './economyAvailability';
import {buildEnemyFormation,restoreEnemyFormation,summarizeEnemyFormation} from './enemyFormation';
import type {EnemyFormation} from './enemyFormation';
import {measureEnemyPower,validateEnemyBudgetPolicy} from './enemyBudget';
import type {EnemyBudgetPolicy} from './enemyBudget';
import {compileEnemyDesign,restoreEnemyDesign,enemyDesignPrompt,ENEMY_DESIGN_VOCABULARY} from './enemyDesign';
import type {CompiledEnemyDesign} from './enemyDesign';
import {createEnemyDesignForm} from './enemyDesignView';
import {stableJson} from './json';
import './preview.css';

const STORAGE='st.portrait-preview.v1';
const BLUEPRINT_STORAGE='st.enemy-preview.v1';
const FORMATION_STORAGE='st.enemy-formation-preview.v1';
const EMPTY_FORMATION_BUDGET_STORAGE='st.enemy-formation-empty-budget-preview.v1';
const DESIGN_STORAGE='st.enemy-design-preview.v1';
const mount=document.querySelector<HTMLElement>('#st-preview')!;
let query:PortraitQuery={};
let selected:PortraitEntry|undefined;
let limit=24;
let notice='';
let isError=false;
let recipeTroopId:number|undefined;
let assembly:EnemyBlueprint['assembly'];
let externalId='enemy-1';
let level=20;
let difficulty=1;
let statVariationSeed:number|undefined;
let formation:EnemyFormation|undefined;
let formationDirty=false;
let formationNotice='';
let formationError=false;
let formationBudgetPolicy:EnemyBudgetPolicy|undefined;
let formationBudgetDraft='';
let semanticDesign:CompiledEnemyDesign|undefined;
let designRestoreNotice='';
try {
  const raw=localStorage.getItem(FORMATION_STORAGE);
  if(raw){formation=restoreEnemyFormation(JSON.parse(raw));formationBudgetPolicy=formation.budgetPolicy;formationBudgetDraft=String(formationBudgetPolicy?.maxTeamPower??'');formationNotice='已恢复保存的整场编队';}
  else {const policy=localStorage.getItem(EMPTY_FORMATION_BUDGET_STORAGE);if(policy){formationBudgetPolicy=validateEnemyBudgetPolicy(JSON.parse(policy));formationBudgetDraft=String(formationBudgetPolicy.maxTeamPower??'');formationNotice='已恢复空编队的预算设置';}}
} catch(error){formationNotice=`编队读取失败：${error instanceof Error?error.message:'配置格式错误'}。可重新组队并保存。`;formationError=true;}
try {
  const full=localStorage.getItem(BLUEPRINT_STORAGE);
  const raw=localStorage.getItem(STORAGE);
  if(full){
    const restored=restoreEnemyBlueprint(JSON.parse(full));
    selected=restorePortrait(restored.portrait).entry;query=structuredClone(restored.portrait.query);
    externalId=restored.snapshot.externalId;recipeTroopId=Number(restored.recipeId.slice(6));assembly=restored.assembly?structuredClone(restored.assembly):undefined;level=restored.level;difficulty=restored.difficulty;statVariationSeed=restored.statVariationSeed;
    notice='已恢复完整敌人配置：技能、特质、数值及立绘保持一致';
  } else if(raw) { const restored=restorePortrait(JSON.parse(raw)); query=structuredClone(restored.selection.query); selected=restored.entry; notice='已恢复保存的肖像配置'; }
} catch(error) { notice=error instanceof Error?error.message:'读取保存配置失败'; isError=true; }
// A saved semantic result belongs to its exact blueprint. Manual edits never
// silently regain the old design on reload.
try {
  const raw=localStorage.getItem(DESIGN_STORAGE);
  if(raw){
    const restored=restoreEnemyDesign(JSON.parse(raw));
    const full=localStorage.getItem(BLUEPRINT_STORAGE);
    if(full&&stableJson(restored.blueprint)===stableJson(restoreEnemyBlueprint(JSON.parse(full))))semanticDesign=restored;
    else designRestoreNotice='已保存的战术设计与当前敌人不同，可单独恢复';
  }
} catch(error){designRestoreNotice=`战术设计读取失败：${error instanceof Error?error.message:'格式错误'}`;}
function applyDesign(result:CompiledEnemyDesign):void {
  const blueprint=result.blueprint;
  selected=restorePortrait(blueprint.portrait).entry;query=structuredClone(blueprint.portrait.query);
  externalId=blueprint.snapshot.externalId;recipeTroopId=Number(blueprint.recipeId.slice(6));assembly=blueprint.assembly?structuredClone(blueprint.assembly):undefined;level=blueprint.level;difficulty=blueprint.difficulty;statVariationSeed=blueprint.statVariationSeed;
  semanticDesign=result;notice='战术设计已生成，请核对实际能力后保存或加入编队';isError=false;
}
function designDraft(result:CompiledEnemyDesign){
  const {effects,...fields}=result.design;
  delete fields.storyWeight;
  return {draft:{...fields,assembly:fields.assembly??'native',requiredEffects:effects.filter(e=>e.requirement==='required').map(e=>e.effect),...(result.budget?.policy?.maxMemberPower!==undefined?{maxMemberPower:result.budget.policy.maxMemberPower}:{})},seed:result.seed};
}
const renderDesignForm=createEnemyDesignForm({
  initial:semanticDesign?designDraft(semanticDesign):undefined,refresh:()=>render(),
  effects:ENEMY_DESIGN_VOCABULARY.effects.map(effect=>({id:effect.key,label:effect.label})),
  prompt:enemyDesignPrompt(),restoredNotice:designRestoreNotice,
  hasSaved:()=>localStorage.getItem(DESIGN_STORAGE)!==null,
  compile:(draft,seed)=>{
    const {requiredEffects,maxMemberPower,...fields}=draft;
    const budgetPolicy=maxMemberPower===undefined?undefined:validateEnemyBudgetPolicy({version:1,id:'preview-member',maxMemberPower});
    const result=compileEnemyDesign({...fields,assembly:fields.assembly??'classified',effects:requiredEffects.map(effect=>({effect,requirement:'required'}))},{seed,externalId,...(budgetPolicy?{budgetPolicy}:{})});
    applyDesign(result);
  },
  restore:()=>{
    const raw=localStorage.getItem(DESIGN_STORAGE);
    if(!raw)throw new Error('尚未保存战术设计');
    const restored=restoreEnemyDesign(JSON.parse(raw));applyDesign(restored);return designDraft(restored);
  },
});
function portraitQuery(source:PortraitQuery):PortraitQuery {
  return {rank:source.rank,form:source.form,role:source.role};
}
function node<K extends keyof HTMLElementTagNameMap>(tag:K,text?:string):HTMLElementTagNameMap[K] {
  const el=document.createElement(tag); if(text!==undefined)el.textContent=text; return el;
}
function button(text:string,action:()=>void):HTMLButtonElement { const b=node('button',text); b.type='button'; b.onclick=action;return b; }
const dims=[
  {key:'rank',label:'稀有度',values:[...RANKS],labelOf:(v:string)=>v},
  {key:'form',label:'形态',values:[...FORMS],labelOf:(v:string)=>v},
  {key:'role',label:'职责',values:[...ROLE_ORDER],labelOf:(v:string)=>ROLE_NAMES[v as TroopRole]},
] as const;
function render():void {
  mount.replaceChildren();
  const header=node('header');header.append(node('p','SillyTavern · 三消战斗'),node('h1','敌人组装预览'),node('p','选择分类和职责，自动生成完整战法；核对技能后加入编队。'));
  mount.append(header,renderDesignForm());
  const filters=node('section');filters.className='filters';filters.setAttribute('aria-label','立绘筛选');
  for(const dim of dims){
    const label=node('label',dim.label);const select=node('select');select.setAttribute('aria-label',dim.label);
    select.append(new Option('全部',''));
    const current=query[dim.key]??'';
    for(const value of dim.values){
      const next={...portraitQuery(query),[dim.key]:value};
      const count=findPortraits(next).length;
      const option=new Option(`${dim.labelOf(value)}（${count}）`,value);option.disabled=count===0;select.append(option);
    }
    select.value=current;
    select.onchange=()=>{ query={...portraitQuery(query),[dim.key]:select.value||undefined};selected=undefined;recipeTroopId=undefined;assembly=undefined;statVariationSeed=undefined;semanticDesign=undefined;limit=24;notice='筛选已更新，请重新选择外形与能力配置';isError=false;render(); };
    label.append(select);filters.append(label);
  }
  filters.append(button('清空筛选',()=>{query={};selected=undefined;recipeTroopId=undefined;assembly=undefined;statVariationSeed=undefined;semanticDesign=undefined;limit=24;notice='已清空筛选与当前组装选择';isError=false;render();}));mount.append(filters);
  const matches=findPortraits(portraitQuery(query));
  const summary=node('p',`候选 ${matches.length} 张 · 已展示 ${Math.min(limit,matches.length)} 张`);summary.setAttribute('role','status');mount.append(summary);
  if(notice){const message=node('p',notice);message.className=isError?'notice error':'notice';message.setAttribute('role',isError?'alert':'status');mount.append(message);}
  if(!matches.length){
    const empty=node('section');empty.className='notice';empty.append(node('h2','当前稀有度、形态与职责组合没有立绘'),node('p','放宽其中一个条件后重新选择。其余筛选条件会保持原值，直到你修改它们。'));
    for(const dim of dims){if(query[dim.key])empty.append(button(`清除${dim.label}`,()=>{query={...portraitQuery(query),[dim.key]:undefined};selected=undefined;recipeTroopId=undefined;assembly=undefined;statVariationSeed=undefined;semanticDesign=undefined;render();}));}mount.append(empty);
  }
  if(selected){
    const panel=node('section');panel.className='selection';panel.append(node('h2',`已选 ${selected.assetId}`),node('p',`${selected.rank} · ${selected.form} · ${ROLE_NAMES[selected.role as TroopRole]}`));
    const save=button('保存肖像配置',()=>{
      try { const selection=savePortrait(query,selected!);localStorage.setItem(STORAGE,JSON.stringify(selection));notice='肖像配置已保存，刷新后保持一致';isError=false; }
      catch(error){notice=error instanceof Error?error.message:'保存失败';isError=true;}render();
    });save.disabled=!(query.rank&&query.form&&query.role);panel.append(save);
    renderBlueprint(panel,selected);mount.append(panel);
  }
  renderFormation();
  const grid=node('section');grid.className='portrait-grid';grid.setAttribute('aria-label','候选立绘');
  for(const entry of matches.slice(0,limit)){
    const card=node('button');card.className='portrait-card';card.type='button';card.setAttribute('aria-label',`选择 ${entry.assetId}`);card.setAttribute('aria-pressed',String(selected?.assetId===entry.assetId));
    const image=node('img');image.src=`${import.meta.env.BASE_URL}static/portraits/${entry.assetId}.webp`;image.alt=`${entry.form} · ${ROLE_NAMES[entry.role as TroopRole]}`;image.loading='lazy';image.width=240;image.height=300;
    card.append(image,node('strong',entry.assetId),node('span',`${entry.rank} · ${entry.form} · ${ROLE_NAMES[entry.role as TroopRole]}`));
    card.onclick=()=>{
      const previous=PORTRAITS.find(p=>p.troopId===recipeTroopId);
      const compatible=previous&&previous.rank===entry.rank;
      const clearedAssembly=!compatible&&!!assembly;
      if(!compatible){recipeTroopId=entry.troopId;assembly=undefined;}
      if(selected?.assetId!==entry.assetId)semanticDesign=undefined;
      query=portraitQuery(entry);selected=entry;notice=clearedAssembly?'立绘稀有度已变化，已清理组装模块并恢复所选底板的原生配置':assembly?'已更换外形，保留底板、主动及特质模块':'';isError=false;render();
    };grid.append(card);
  }
  mount.append(grid);
  if(matches.length>limit)mount.append(button('再显示 24 张',()=>{limit+=24;render();}));
}
function renderBlueprint(panel:HTMLElement,portrait:PortraitEntry):void {
  const controls=node('div');controls.className='blueprint-controls';
  const recipes=PORTRAITS.filter(p=>p.rank===portrait.rank&&(p.role===portrait.role||p.troopId===recipeTroopId));
  recipeTroopId??=portrait.troopId;
  const recipeLabel=node('label','能力配方');const recipe=node('select');recipe.setAttribute('aria-label','能力配方');
  for(const candidate of recipes){const t=getTroopById(candidate.troopId)!;recipe.append(new Option(`${skillNameForTroop(t.id)??t.spell.name} · ${t.manaCost} 法力 · #${t.id}`,String(t.id)));}
  recipe.value=String(recipeTroopId);recipe.onchange=()=>{recipeTroopId=Number(recipe.value);assembly=undefined;semanticDesign=undefined;notice='已切换底板并恢复其原生主动与特质';isError=false;render();};recipeLabel.append(recipe);controls.append(recipeLabel);
  for(const field of [{label:'敌人等级',value:level,min:1,max:100,step:1,set:(v:number)=>{level=v;}},{label:'难度倍率',value:difficulty,min:.1,max:10,step:.1,set:(v:number)=>{difficulty=v;}}]){
    const label=node('label',field.label);const input=node('input');input.type='number';input.min=String(field.min);input.max=String(field.max);input.step=String(field.step);input.value=String(field.value);input.setAttribute('aria-label',field.label);
    input.oninput=()=>{field.set(Number(input.value));refreshBlueprint();};label.append(input);controls.append(label);
  }
  panel.append(controls,node('p',assembly?'当前保留分类组装的主动与特质；切换能力配方会恢复所选底板的原生配置。':'切换能力配方会采用所选底板的原生主动与特质。'));
  const output=node('div');output.className='blueprint-output';panel.append(output);
  function refreshBlueprint():void {
    output.replaceChildren();
    const currentRecipeId=recipeTroopId??portrait.troopId;
    let blueprint:EnemyBlueprint;
    try{blueprint=compileEnemyBlueprint({portrait:savePortrait(query,portrait),recipeTroopId:currentRecipeId,...(assembly?{assembly}:{}),externalId,level,difficulty,...(statVariationSeed!==undefined?{statVariationSeed}:{})});}
    catch(error){const alert=node('p',error instanceof Error?error.message:'组装失败');alert.setAttribute('role','alert');output.append(alert);return;}
    const activeDesign=semanticDesign&&stableJson(semanticDesign.blueprint)===stableJson(blueprint)?semanticDesign:undefined;
    if(activeDesign){
      const result=node('section');result.setAttribute('aria-label','战术设计结果');result.className='blueprint-detail';
      result.append(node('h3','实际战术效果'),node('p',activeDesign.signature.effects.map(effect=>ENEMY_DESIGN_VOCABULARY.effects.find(e=>e.key===effect)?.label??effect).join('、')),node('p',`职责：${ROLE_NAMES[activeDesign.design.role as TroopRole]??activeDesign.design.role}`));
      result.append(node('p',`主动 ${activeDesign.complexity.activeCount} · 特质 ${activeDesign.complexity.traitCount} · 效果段 ${activeDesign.complexity.effectSegments} · 分支 ${activeDesign.complexity.branchCount}`));
      for(const diagnostic of activeDesign.diagnostics)result.append(node('p',diagnostic.message));
      output.append(result);
    }
    const detail=node('section');detail.setAttribute('aria-label','敌人能力配置');detail.className='blueprint-detail';
    detail.append(node('h3',blueprint.snapshot.spellName),node('p',blueprint.snapshot.spellDescription||'能力文字待复核'));
    if(blueprint.descriptionAudit.support!=='full')detail.append(node('p',`能力说明仍有 ${blueprint.descriptionAudit.diagnostics.length} 项待核对，尚未计入完整验收`));
    if(blueprint.traitDescriptionAudit.some(a=>a.support!=='full'))detail.append(node('p','部分特质效果尚待核对，详情见对应特质说明，尚未计入完整验收'));
    const economyIssues=prototypeEconomyIssues(adaptedPrototype(getTroopById(blueprint.assembly?.activeTroopId??currentRecipeId)!.spell.id));
    for(const code of blueprint.snapshot.traitIds??[]){const trait=adaptedTrait(code.slice(3));if(trait)economyIssues.push(...traitEconomyIssues(trait));}
    if(economyIssues.length){const restriction=node('p',`暂未开放出战：${[...new Set(economyIssues)].join('、')}尚未接入酒馆模式。可以保存设计，收藏和学习进度保留。`);restriction.setAttribute('role','alert');detail.append(restriction);}
    const power=node('p',`${blueprint.assembly?'组装参考战力':'同源原生参考战力'} ${measureEnemyPower(blueprint.snapshot).power}（尚未平衡标定）${activeDesign?.budget?.policy?.maxMemberPower!==undefined?` · 单体上限 ${activeDesign.budget.policy.maxMemberPower}`:''}`);power.setAttribute('aria-label','敌人参考战力');detail.append(power);
    const stats=blueprint.snapshot.stats;
    detail.append(node('p',`生命 ${stats.hp} · 攻击 ${stats.attack} · 护甲 ${stats.armor} · 魔力 ${stats.magic} · 法力消耗 ${blueprint.budget.manaCost}`));
    detail.append(node('p',`主动能力 ${blueprint.budget.activeCount} · 被动特质 ${blueprint.budget.traitCount}`));
    for(const code of blueprint.snapshot.traitIds??[]){const trait=adaptedTrait(code.slice(3))!;const audit=adaptedTraitDescription(code.slice(3))!;detail.append(renderTraitDescription(trait,audit));}
    if(blueprint.omittedMechanisms.length)detail.append(node('p',`本配置省略：${blueprint.omittedMechanisms.join('、')}`));
    output.append(detail,renderDerivedFormPreview(buildDerivedFormPreview(blueprint)),button('保存完整敌人配置',()=>{
      try{
        // Roll back both local values if the second write fails (for example, storage quota).
        const previousBlueprint=localStorage.getItem(BLUEPRINT_STORAGE),previousDesign=localStorage.getItem(DESIGN_STORAGE);
        try{
          localStorage.setItem(BLUEPRINT_STORAGE,JSON.stringify(blueprint));
          if(activeDesign)localStorage.setItem(DESIGN_STORAGE,JSON.stringify(activeDesign));else localStorage.removeItem(DESIGN_STORAGE);
        }catch(error){
          try{if(previousBlueprint===null)localStorage.removeItem(BLUEPRINT_STORAGE);else localStorage.setItem(BLUEPRINT_STORAGE,previousBlueprint);if(previousDesign===null)localStorage.removeItem(DESIGN_STORAGE);else localStorage.setItem(DESIGN_STORAGE,previousDesign);}catch{/* Preserve the original storage error if rollback also fails. */}
          throw error;
        }
        notice='完整敌人配置已保存，刷新后恢复同一份技能与数值';isError=false;}
      catch(error){notice=error instanceof Error?error.message:'保存失败';isError=true;}render();
    }));
    const append=button('加入本场编队',()=>{
      try {
        const next=buildEnemyFormation([...(formation?.members??[]),blueprint],readFormationBudget());
        formation=next;formationBudgetPolicy=next.budgetPolicy;formationDirty=true;
        formationNotice='已加入编队，保存后可在刷新时恢复';formationError=false;
      } catch(error){formationNotice=error instanceof Error?error.message:'加入失败';formationError=true;}
      render();
    });append.disabled=(formation?.members.length??0)>=4;output.append(append);
  }
  refreshBlueprint();
}
function readFormationBudget():EnemyBudgetPolicy|undefined {
  const policy={...(formationBudgetPolicy??{version:1 as const,id:'preview-formation'})};
  if(formationBudgetDraft.trim()==='')delete policy.maxTeamPower;else policy.maxTeamPower=Number(formationBudgetDraft);
  return policy.maxTeamPower===undefined&&policy.maxMemberPower===undefined&&policy.maxMembers===undefined?undefined:validateEnemyBudgetPolicy(policy);
}
function updateFormation(members:EnemyBlueprint[],message:string):void {
  try {
    const policy=readFormationBudget();
    const next=members.length?buildEnemyFormation(members,policy):undefined;
    formation=next;formationBudgetPolicy=next?.budgetPolicy??policy;formationDirty=true;formationError=false;formationNotice=message;
  } catch(error){formationNotice=error instanceof Error?error.message:'编队更新失败';formationError=true;}
  render();
}
function renderFormation():void {
  const panel=node('section');panel.className='formation';panel.setAttribute('aria-label','本场敌人编队');
  const members=formation?.members??[];
  const budgetControls=node('div');budgetControls.className='blueprint-controls';
  const budgetLabel=node('label','整队参考战力上限（可选）');const budgetInput=node('input');budgetInput.type='text';budgetInput.inputMode='numeric';budgetInput.value=formationBudgetDraft;budgetInput.setAttribute('aria-label','整队参考战力上限');
  budgetInput.oninput=()=>{formationBudgetDraft=budgetInput.value;formationDirty=true;state.textContent='有未保存的编队更改';};budgetLabel.append(budgetInput);
  budgetControls.append(budgetLabel,button('应用编队预算',()=>updateFormation(members,'编队预算已应用，请保存当前编队')));

  panel.append(node('h2',`本场敌人编队（${members.length} / 4）`),node('p','按位置从上到下排列。每个位置保存独立的能力、立绘、等级和难度；筛选与单个敌人的编辑不会改变编队。'));panel.append(budgetControls);
  if(formationNotice){const message=node('p',formationNotice);message.className=formationError?'notice error':'notice';message.setAttribute('role',formationError?'alert':'status');panel.append(message);}
  const state=node('p',formationDirty?'有未保存的编队更改':'编队没有未保存的更改');state.setAttribute('role','status');panel.append(state);
  if(!formation)panel.append(node('p','先选好一个敌人，再点击“加入本场编队”。同一敌人可占多个位置。'));
  if(formation){
    const summary=summarizeEnemyFormation(formation);
    const overview=node('div');overview.className='formation-summary';overview.setAttribute('aria-label','编队基础面板');
    overview.append(node('p',`整队${members.some(member=>member.assembly)?'组装':'原生'}参考战力 ${summary.budget.totalPower}（尚未平衡标定）${summary.budget.policy?.maxTeamPower!==undefined?` · 整队上限 ${summary.budget.policy.maxTeamPower}`:' · 未设置整队上限'}`),node('p',`基础面板合计：生命 ${summary.stats.hp} · 护甲 ${summary.stats.armor} · 攻击 ${summary.stats.attack} · 魔力 ${summary.stats.magic}`),
      node('p','以上为开战效果触发前的基础面板。特质联动、技能循环和武器关系仍需实战标定。'),
      node('p',`法力消耗合计 ${summary.manaCost}（各位置分别充能）`),
      node('p',`共享法力颜色：${summary.colors.map(c=>`${COLOR_NAMES[c.color]??c.color}：位置 ${c.positions.join('、')}`).join('；')}`),
      node('p',`环境召唤基准：等级 ${summary.environment.level} · 难度 ${summary.environment.difficulty}（开局平均等级向上取整，难度取均值）`));
    panel.append(overview);
  }
  const list=node('ol');list.className='formation-list';
  members.forEach((member,index)=>{
    const item=node('li');item.className='formation-member';item.setAttribute('aria-label',`位置 ${index+1}`);
    const image=node('img');image.src=member.snapshot.portraitUrl??'';image.alt=`位置 ${index+1} · ${member.portrait.assetId}`;image.width=160;image.height=200;
    const detail=node('div');detail.className='formation-member-detail';
    const stats=member.snapshot.stats;
    detail.append(node('h3',`位置 ${index+1} · ${member.portrait.assetId}`),node('p',`${member.portrait.query.rank} · ${ROLE_NAMES[member.portrait.query.role as TroopRole]} · 等级 ${member.level} · 难度 ${member.difficulty}`),
      node('p',`生命 ${stats.hp} · 护甲 ${stats.armor} · 攻击 ${stats.attack} · 魔力 ${stats.magic} · 法力消耗 ${member.budget.manaCost}`),
      node('p',`${member.assembly?'组装参考战力':'同源原生参考战力'} ${measureEnemyPower(member.snapshot).power}（尚未平衡标定）`),
      node('p',`法力颜色：${member.snapshot.manaColors.map(c=>COLOR_NAMES[c]??c).join(' / ')}`),
      node('p',`${member.snapshot.spellName}：${member.snapshot.spellDescription??''}`));
    if(member.descriptionAudit.support!=='full'||member.traitDescriptionAudit.some(a=>a.support!=='full'))detail.append(node('p','部分能力或特质说明尚待核对，未计入完整验收'));
    for(const code of member.snapshot.traitIds??[]){const trait=adaptedTrait(code.slice(3)),audit=adaptedTraitDescription(code.slice(3));if(trait&&audit)detail.append(renderTraitDescription(trait,audit));}
    if(member.omittedMechanisms.length)detail.append(node('p',`本配置省略：${member.omittedMechanisms.join('、')}`));
    const ownIssues=[...prototypeEconomyIssues(adaptedPrototype(getTroopById(member.assembly?.activeTroopId??Number(member.recipeId.slice(6)))!.spell.id)),...(member.snapshot.traitIds??[]).flatMap(code=>{const trait=adaptedTrait(code.slice(3));return trait?traitEconomyIssues(trait):[];})];
    if(ownIssues.length){const warning=node('p','此位置自身含待适配经济效果，暂未开放出战。');warning.setAttribute('role','alert');detail.append(warning);}
    const actions=node('div');actions.className='formation-actions';
    const move=(offset:number)=>{const next=[...members];[next[index],next[index+offset]]=[next[index+offset],next[index]];updateFormation(next,'已调整站位，请保存当前编队');};
    const up=button('上移',()=>move(-1));up.disabled=index===0;
    const down=button('下移',()=>move(1));down.disabled=index===members.length-1;
    actions.append(up,down,button('移除',()=>{const next=members.filter((_,i)=>i!==index);updateFormation(next,'已移除成员，请保存当前编队');}));
    detail.append(actions);item.append(image,detail);list.append(item);
  });panel.append(list);
  panel.append(node('p','保存保留完整设计；实际开战会检查双方、派生形态与战场规则的完整适配情况。'),button('保存当前编队',()=>{
    try {
      const policy=readFormationBudget();
      const next=formation?buildEnemyFormation(formation.members,policy):undefined;
      // Empty rosters keep their optional policy without changing the 1–4 member formation format.
      const previous=localStorage.getItem(FORMATION_STORAGE),previousEmptyBudget=localStorage.getItem(EMPTY_FORMATION_BUDGET_STORAGE);
      try {
        if(next)localStorage.setItem(FORMATION_STORAGE,JSON.stringify(next));else localStorage.removeItem(FORMATION_STORAGE);
        if(!next&&policy)localStorage.setItem(EMPTY_FORMATION_BUDGET_STORAGE,JSON.stringify(policy));else localStorage.removeItem(EMPTY_FORMATION_BUDGET_STORAGE);
      } catch(error){
        try{if(previous===null)localStorage.removeItem(FORMATION_STORAGE);else localStorage.setItem(FORMATION_STORAGE,previous);if(previousEmptyBudget===null)localStorage.removeItem(EMPTY_FORMATION_BUDGET_STORAGE);else localStorage.setItem(EMPTY_FORMATION_BUDGET_STORAGE,previousEmptyBudget);}catch{/* Preserve the original storage error if rollback also fails. */}
        throw error;
      }
      formation=next;formationBudgetPolicy=next?.budgetPolicy??policy;
      formationDirty=false;formationError=false;formationNotice=formation?'整场编队已保存，刷新后保持位置与完整配置':'已清空编队，请添加成员后保存再挑战';
    } catch(error){formationNotice=error instanceof Error?error.message:'编队保存失败';formationError=true;}render();
  }));mount.append(panel);
}
render();
