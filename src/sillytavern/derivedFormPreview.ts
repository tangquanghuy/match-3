import {adaptedPrototype, adaptedTrait, adaptedSummonPool, resolveAdaptedSummon} from './enemyBlueprint';
import type {SkillPrototype, EffectSegment} from '../engine/skills/prototypes';
import type {SummonTemplate} from '../engine/skills/effects/summon';
import type {TraitDefinition} from '../engine/traits';
import type {KingdomRef} from '../engine/types';
import {PORTRAITS, COLOR_NAMES, ROLE_NAMES} from './portraits';
import type {TroopRole} from '../data/troops';
import {describeAdaptedAbility} from './abilityDescription';
import {stEffectIsProvablyUnreachable} from './economyAvailability';

/** Structural boundary: the runtime resolver also accepts a Character; previews pass explicit scaling. */
export interface DerivedPreviewBlueprint {
  level:number;
  difficulty:number;
  snapshot:{skillId?:string; spellName?:string; traitIds?:string[]};
}
export interface DerivedPreviewServices {
  prototype:(id:number)=>SkillPrototype;
  trait:(code:string)=>TraitDefinition|undefined;
  resolveSummon:(ref:string, scaling:{level:number; difficulty:number})=>SummonTemplate|null;
  summonPool:(kind:'Beast'|'Daemon'|KingdomRef)=>string[];
  hasPortrait:(ref:string)=>boolean;
}
export interface DerivedFormCandidate {
  ref:string;
  weight:number;
  template:SummonTemplate|null;
  hasPortrait:boolean;
  error?:string;
}
export interface DerivedFormPreview {
  id:string;
  kind:'summon'|'transformTroop'|'summonCopy'|'trait';
  title:string;
  source:string;
  description:string;
  rule:string;
  random:boolean;
  example:boolean;
  fullMana:boolean;
  candidates:DerivedFormCandidate[];
}
const portraitIds=new Set(PORTRAITS.map(p=>p.troopId));
const defaults:DerivedPreviewServices={
  prototype:adaptedPrototype, trait:adaptedTrait, resolveSummon:resolveAdaptedSummon,
  summonPool:adaptedSummonPool,
  hasPortrait:ref=>/^unit:\d+$/.test(ref)&&portraitIds.has(Number(ref.slice(5))),
};
const triggers:Record<string,string>={
  summonOnDeath:'自身阵亡时', summonOnAllyDeath:'盟友（含自身）阵亡时', summonOnEnemyDeath:'敌人阵亡时',
  turnStartSummon:'回合开始时', summonOnDamaged:'自身受到骷髅伤害时', summonOnAllyCast:'同队角色施放主动时',
  onBigMatchSummon:'配对大连时',
};
function targetName(target:string):string {
  const names:Record<string,string>={
    allySelf:'施法者自身', enemyChosen:'选定的一名敌人', enemyRandom:'随机一名敌人', enemyFront:'敌方首位',
    enemyRandomN:'随机多名敌人', enemyLast:'敌方末位', enemyAll:'所有敌人', enemyWeakest:'最虚弱的敌人', enemyHealthiest:'最健康的敌人',
    allyChosen:'选定的一名盟友', allyChosenOther:'选定的其他盟友', allyRandom:'随机一名盟友',
    allyFront:'己方首位', allyLast:'己方末位', allyAll:'所有盟友', allyOthers:'其他盟友',
    lastTarget:'最近一段的主目标', lastTargets:'最近一段的全部目标', lastTargetOrChosen:'最近主目标（缺省为选定目标）',
  };
  return names[target]??'按主动说明选定的目标';
}

/** Read actual adapted segments/trait payloads. This never rolls RNG or constructs a battle result. */
export function buildDerivedFormPreview(blueprint:DerivedPreviewBlueprint, overrides:Partial<DerivedPreviewServices>={}):DerivedFormPreview[] {
  const services={...defaults,...overrides};
  const scaling={level:blueprint.level,difficulty:blueprint.difficulty};
  const scaled=`等级 ${scaling.level} · 难度 ×${scaling.difficulty}`;
  const result:DerivedFormPreview[]=[];
  const candidates=(refs:readonly string[]):DerivedFormCandidate[]=>{
    // Sort a copy by stable reference, retaining repeated entries as explicit draw weights.
    const weights=new Map<string,number>();
    for(const ref of refs)weights.set(ref,(weights.get(ref)??0)+1);
    return [...weights].sort(([a],[b])=>a.localeCompare(b,'en',{numeric:true})).map(([ref,weight])=>{
      try{return {ref,weight,template:services.resolveSummon(ref,{...scaling}),hasPortrait:services.hasPortrait(ref)};}
      catch(error){return {ref,weight,template:null,hasPortrait:services.hasPortrait(ref),error:error instanceof Error?error.message:'模板解析失败'};}
    });
  };
  const delayed=(id:string,source:string,description:string,target:string|undefined,gem=false,randomStatus=false):void=>{
    const example=target!=='allySelf';
    const trigger=gem
      ?'狼化宝石被匹配或摧毁时，对操作一方的随机敌人施加狼化状态；仅移除宝石不触发。双方均可能受影响。'
      :randomStatus?'随机负面状态池可能抽中狼化；先成功施加狼化状态，再等待回合判定。':'先成功施加狼化状态，再等待回合判定。';
    const rule=`${trigger}持有者正常回合开始时，先进行状态解除检查；检查后仍有狼化状态，才以 15% 几率变为随机 Beast。额外回合不重复判定，也不是施加状态时立即变形。`
      +(example?`实际变形按目标自身的等级与难度缩放；下方是按本体${scaled}生成的同档示例，目标属性在战斗中确定。`:`自身变形沿用本体${scaled}。`)
      +'候选来源为实际适配的 Beast（野兽）兵种池；查看候选不会固定战斗结果。变形后生命回满、法力归零并清除原状态。';
    result.push({id:`${id}.lycanthropy`,kind:'transformTroop',title:'狼化延迟变形',
      source:`${source} · 变形目标：${gem?'双方均可能受影响（匹配或摧毁宝石一方的随机敌人）':target?targetName(target):'由战斗触发规则确定'} · Beast（野兽）随机候选池`,
      description,rule,random:true,example,fullMana:false,candidates:candidates(services.summonPool('Beast'))});
  };
  // Preview execution sites, rather than preflight's conservative dependency closure.
  // A counter or condition mentioning a gem neither creates it nor applies its status.
  const isWolf=(id:unknown):boolean=>['lycanthropy','wolf','wolf-form'].includes(String(id));
  const visitDelayedSegment=(segment:EffectSegment,id:string,source:string,description:string):void=>{
    if(segment.kind==='status'&&isWolf(segment.statusId)){
      const target=segment.target==='enemyRandomN'&&typeof segment.n==='number'?`随机 ${segment.n} 名敌人`:targetName(segment.target);
      delayed(id,`${source} · 施加狼化状态 · ${target}`,description,segment.target);
    }else if(segment.kind==='randomStatus'&&segment.pool!=='positive'&&!segment.allPositive&&!segment.target.startsWith('ally')){
      delayed(id,`${source} · 随机负面状态可能狼化`,description,segment.target,false,true);
    }else if(segment.kind==='gem'){
      const params=segment.params;
      let action='';
      if(params.op==='create'){
        const gem=params.gem;
        const produces=gem.kind==='special'?gem.spec.kind==='lycanthropyGem'
          :gem.kind==='mixSpecial'?gem.specs.some(spec=>spec.kind==='lycanthropyGem')
          :gem.kind==='mixAny'&&gem.entries.some(entry=>typeof entry==='object'&&entry.kind==='lycanthropyGem');
        if(produces)action='创造狼化宝石';
      }else if(params.op==='transform'){
        const special=params.toSpecial;
        if((typeof special==='string'?special:special?.kind)==='lycanthropyGem')action='转换为狼化宝石';
      }else if(params.mode!=='remove'){
        const target=params.target;
        if((target.kind==='special'&&target.gem==='lycanthropyGem')||(target.kind==='randomGems'&&target.special==='lycanthropyGem'))
          action='摧毁现有狼化宝石';
      }
      if(action)delayed(id,`${source} · ${action}`,description,undefined,true);
    }
  };
  const scopes:Record<string,string>={self:'allySelf',randomAlly:'allyRandom',allAllies:'allyAll',randomEnemy:'enemyRandom',allEnemies:'enemyAll',firstEnemy:'enemyFront'};
  const statusTriggers:Record<string,{label:string;target?:string}>={
    onDamagedStatus:{label:'自身受到骷髅伤害后',target:'allySelf'},
    onDamagedEnemyStatus:{label:'自身受到骷髅伤害后',target:'enemyFront'},
    onEnemyDeathStatus:{label:'敌人阵亡时',target:'allySelf'},
    onEnemyDeathEnemyStatus:{label:'敌人阵亡时',target:'enemyFront'},
    onBigMatchStatus:{label:'我方配对大连时'}, onColorMatchStatus:{label:'我方配对指定颜色时'},
    onExtraTurnStatus:{label:'我方获得额外回合时'}, onSelfSummonStatus:{label:'自身召唤成功时',target:'enemyRandom'},
    onAllyDeathStatus:{label:'盟友阵亡时'}, onEnemyDeathRandomStatus:{label:'敌人阵亡时',target:'enemyRandom'},
    onEnemyDeathEnemyAllStatus:{label:'敌人阵亡时',target:'enemyAll'}, onSelfDeathEnemyAllStatus:{label:'自身阵亡时',target:'enemyAll'},
    turnStartStatus:{label:'我方回合开始时'}, battleStartStatus:{label:'战斗开始时'},
    onAllyCastStatus:{label:'我方角色施法时'}, onEnemyCastStatus:{label:'敌方角色施法时'},
    onAllyCastRandomStatus:{label:'我方角色施法时'},
  };
  const gemTriggers:Record<string,string>={
    turnStartCreateSpecialGem:'我方回合开始时创造狼化宝石', turnStartColorToSpecial:'我方回合开始时转换为狼化宝石',
    battleStartConvertGems:'战斗开始时转换为狼化宝石', onDamagedCreateGem:'自身受到骷髅伤害后创造狼化宝石',
    onDeathCreateGem:'自身阵亡时创造狼化宝石', onBigMatchCreateGem:'我方配对大连时创造狼化宝石',
    onAllyCastCreateGem:'我方角色施法时创造狼化宝石',
  };
  const visitDelayedTrait=(trait:TraitDefinition,code:string):void=>{
    for(const [field,value]of Object.entries(trait)){
      if(!value||typeof value!=='object'||Array.isArray(value))continue;
      const spec=value as Record<string,unknown>;
      if(typeof spec.chance==='number'&&spec.chance<=0)continue;
      const id=`trait.${code}.${field}`;const label=`特质「${trait.name}」`;
      if(gemTriggers[field]&&spec.gem==='lycanthropyGem'&&typeof spec.count==='number'&&spec.count>0){
        delayed(id,`${label} · ${gemTriggers[field]}`,trait.description,undefined,true);
        continue;
      }
      const trigger=statusTriggers[field];if(!trigger||spec.randomPositive)continue;
      const rawTarget=typeof spec.target==='string'?spec.target:typeof spec.scope==='string'?spec.scope:undefined;
      const target=rawTarget?(scopes[rawTarget]??rawTarget):trigger.target;
      const pool=Array.isArray(spec.statuses)?spec.statuses:[{id:spec.id??spec.statusId}];
      const random=(spec.randomNegative===true||(typeof spec.randomMissingStatusCount==='number'&&spec.randomMissingStatusCount>0)||field==='onAllyCastRandomStatus')&&spec.scope==='randomEnemy';
      // A random pool is one execution site; its entries are possibilities, not extra applications.
      if(field==='onAllyCastRandomStatus'?!random:!pool.some(status=>status&&typeof status==='object'&&isWolf(status.id)))continue;
      const when=field==='onBigMatchStatus'?`我方配对 ${spec.minSize??4} 颗及以上宝石时`:trigger.label;
      delayed(id,`${label} · ${when} · ${random?'随机负面状态可能狼化':'施加狼化状态'}`,trait.description,target,false,random);
    }
  };
  const visit=(segments:readonly EffectSegment[],path:string,label:string):void=>{
    segments.forEach((segment,index)=>{
      // Share preflight's static gates before expanding branches; boosts and devour stay conservative.
      if(stEffectIsProvablyUnreachable(segment))return;
      const id=`${path}.${index}`;
      const source=`${label} · 第 ${index+1} 段`;
      if(segment.kind==='oneOf'||segment.kind==='choose'){
        segment.options.forEach((branch,i)=>visit(branch,`${id}.options.${i}`,`${source} · ${segment.kind==='oneOf'?'随机分支':'选择分支'} ${i+1}`));
        return;
      }
      const description=describeAdaptedAbility({segments:[segment]}).description;
      visitDelayedSegment(segment,id,source,description);
      if(segment.kind!=='summon'&&segment.kind!=='transformTroop'&&segment.kind!=='summonCopy')return;
      const form:DerivedFormPreview={id,kind:segment.kind,title:segment.kind==='summon'?'主动召唤':segment.kind==='summonCopy'?'复制召唤':segment.target==='allySelf'?'自身变形':'目标变形',source,
        description,rule:'',random:false,example:false,fullMana:false,candidates:[]};
      if(segment.kind==='summonCopy'||(segment.kind==='transformTroop'&&segment.copyOf)){
        const target=segment.kind==='summonCopy'?segment.target:segment.copyOf!;
        form.source+=` · 复制来源：${targetName(target)}`;
        form.fullMana=segment.kind==='transformTroop'&&!!segment.fullMana;
        form.rule=`取战斗中${targetName(target)}当时的实际快照，包括图片、属性、主动、特质及其缩放；来源由战斗状态决定，当前不预设完整结果。复制体生命回满，${form.fullMana?'法力回满':'法力归零'}，不继承状态。`;
      }else{
        let refs:string[]=[];
        if(segment.kind==='summon'){
          const src=segment.params.source;
          if('ref' in src){refs=[src.ref];form.source+=` · 固定来源 ${src.ref}`;}
          else if('randomOf' in src){refs=[...src.randomOf];form.random=true;form.source+=' · 随机候选池';}
          else if('randomOfKingdom' in src){refs=services.summonPool(src.randomOfKingdom);form.random=true;form.source+=` · 区域随机池 ${src.randomOfKingdom}`;}
          else if('template' in src){
            form.candidates=[{ref:'内嵌模板',weight:1,template:structuredClone(src.template),hasPortrait:!!src.template.portraitUrl}];
          }
          const count=segment.params.countRange;
          form.rule=`召唤沿用本体${scaled}。${count?`召唤数量 ${count.min}–${count.max}。`:''}候选仅供查看，实际入场结果由战斗中的条件、随机判定及编队空位决定。`;
          if('template' in src)form.rule='使用主动内嵌的实际模板；属性及缩放以模板为准。实际入场受战斗条件及编队空位影响。';
        }else if(segment.kind==='transformTroop'){
          refs=segment.ref?[segment.ref]:[...(segment.randomOf??[])];form.random=!segment.ref&&!!segment.randomOf;
          form.source+=` · 变形目标：${targetName(segment.target)} · ${segment.ref?`固定来源 ${segment.ref}`:'随机候选池'}`;
          form.example=segment.target!=='allySelf';form.fullMana=!!segment.fullMana;
          form.rule=form.example
            ?`实际变形按目标自身的等级与难度缩放；下方是按本体${scaled}生成的同档示例，目标属性在战斗中确定。`
            :`自身变形沿用本体${scaled}。`;
          form.rule+=`变形后生命回满，${form.fullMana?'法力回满':'法力归零'}。`;
        }
        if(refs.length)form.candidates=candidates(refs);
      }
      result.push(form);
    });
  };
  const skillId=blueprint.snapshot.skillId;
  if(skillId&&/^st:\d+$/.test(skillId))visit(services.prototype(Number(skillId.slice(3))).segments,'active',`主动「${blueprint.snapshot.spellName??'当前能力'}」`);
  for(const code of blueprint.snapshot.traitIds??[]){
    const trait=services.trait(code.replace(/^st:/,''));if(!trait)continue;
    visitDelayedTrait(trait,code);
    for(const [key,trigger] of Object.entries(triggers)){
      const value=(trait as unknown as Record<string,unknown>)[key];
      if(!value||typeof value!=='object')continue;
      const spec=value as {referenceName?:string;chance?:number;storm?:unknown;minSize?:number;fullMana?:boolean};
      // Storm variants have a virtual troop id but do not produce a character.
      if(spec.storm||!spec.referenceName)continue;
      const condition=key==='onBigMatchSummon'?`配对 ${spec.minSize??4} 颗及以上宝石时`:trigger;
      result.push({id:`trait.${code}.${key}`,kind:'trait',title:'特质召唤',source:`特质「${trait.name}」 · ${condition} · ${spec.chance===undefined?'按特质规则':`${Number((spec.chance*100).toFixed(4))}% 概率`} · 来源 ${spec.referenceName}`,
        description:trait.description,rule:`召唤沿用持有者（本体）${scaled}。触发、概率及实际入场以战斗为准。${spec.fullMana?'召唤体以满法力入场。':''}`,
        random:false,example:false,fullMana:!!spec.fullMana,candidates:candidates([spec.referenceName])});
    }
  }
  return result;
}

function node<K extends keyof HTMLElementTagNameMap>(tag:K,text?:string):HTMLElementTagNameMap[K] {
  const element=document.createElement(tag);if(text!==undefined)element.textContent=text;return element;
}
/** A selector retains every candidate while keeping long pools readable on narrow screens. */
export function renderDerivedFormPreview(forms:readonly DerivedFormPreview[]):HTMLElement {
  const section=node('section');section.className='blueprint-detail';section.setAttribute('aria-label','召唤与变形预览');
  section.append(node('h3','召唤与变形预览'));
  if(!forms.length){section.append(node('p','当前配方没有召唤或角色变形。'));return section;}
  section.append(node('p','查看主动或特质可能产生的派生体。随机候选的查看与选择仅用于预览，不会固定战斗结果。'));
  forms.forEach((form,index)=>{
    const article=node('article');article.setAttribute('aria-label',`${form.title} ${index+1}`);
    article.style.cssText='border:1px solid #4b5b68;border-radius:8px;padding:16px;margin:16px 0;min-width:0';
    article.append(node('h4',form.title),node('p',`来源：${form.source}`),node('p',form.rule));
    const explanation=node('details');explanation.append(node('summary','查看完整触发与目标说明'),node('p',form.description));article.append(explanation);
    if(!form.candidates.length){
      article.append(node('p',form.kind==='summonCopy'||form.source.includes('复制来源')?'战斗中确定复制来源后显示实际形态。':'候选池为空或尚无可解析来源；本次不预设派生体。'));
      section.append(article);return;
    }
    const body=node('div');
    const show=(selectedIndex:number):void=>{
      const candidate=form.candidates[selectedIndex];const template=candidate.template;body.replaceChildren();
      body.append(node('p',`${form.random?'随机候选':'派生体'} ${selectedIndex+1} / ${form.candidates.length} · 来源引用 ${candidate.ref}${candidate.weight>1?` · 抽取权重 ${candidate.weight}`:''}${form.example?' · 同档示例':''}`));
      if(!template){body.append(node('p',`该来源的实际模板尚未就绪：${candidate.error??candidate.ref}`));return;}
      const imageBox=node('div');imageBox.style.cssText='display:flex;flex-wrap:wrap;align-items:start;gap:16px';
      if(template.portraitUrl){
        const image=node('img');image.src=template.portraitUrl;image.alt=candidate.hasPortrait?`${template.name}的实际立绘`:`${template.name}的缺图占位`;
        image.width=180;image.height=225;image.style.cssText='object-fit:contain;max-width:100%;background:#18232d;border-radius:8px';
        image.dataset.portraitState=candidate.hasPortrait?'available':'missing';
        image.onerror=()=>{image.remove();imageBox.prepend(node('p',`图片加载失败：${candidate.ref}；请检查本地资源。`));};imageBox.append(image);
      }
      const info=node('div');info.style.cssText='flex:1 1 200px;min-width:0';info.append(node('h5',template.name));
      if(!candidate.hasPortrait)info.append(node('p',`缺少本地立绘资源（${candidate.ref}）；通用占位图不代表派生体实际图片。`));
      else if(!template.portraitUrl)info.append(node('p',`实际图片地址尚未就绪（${candidate.ref}）。`));
      const s=template.battleScaling;
      info.append(node('p',s?`模板等级 ${s.level} · 难度 ×${s.difficulty}${form.example?'（同档示例）':''}`:'缩放以实际模板为准'));
      info.append(node('p',`生命 ${template.maxHp} · 攻击 ${template.attack} · 护甲 ${template.armor} · 魔力 ${template.magic}`),
        node('p',`法力颜色 ${template.colors.map(color=>COLOR_NAMES[color]??color).join(' / ')} · 法力消耗 ${template.manaCost}${template.role?` · 职责 ${ROLE_NAMES[template.role as TroopRole]??template.role}`:''}`),
        node('p',`主动：${template.spellName??'名称待核对'}`),node('p',template.spellDescription??'主动说明待核对'));
      if(template.traitIds?.length)info.append(node('p',`特质：${template.traitIds.map(code=>template.traitNames?.[code]??code).join('、')}`));
      imageBox.append(info);body.append(imageBox);
    };
    if(form.candidates.length>1){
      const label=node('label',`查看候选（全部 ${form.candidates.length} 个）`);label.style.cssText='display:flex;flex-direction:column;gap:8px;margin:12px 0;min-width:0';
      const select=node('select');select.setAttribute('aria-label',`${form.title} ${index+1} 候选`);select.style.cssText='width:100%;min-width:0';
      form.candidates.forEach((candidate,i)=>select.append(new Option(`${i+1}. ${candidate.template?.name??'待解析'} · ${candidate.ref}${candidate.hasPortrait?'':' · 缺图'}${candidate.weight>1?` · 权重 ${candidate.weight}`:''}`,String(i))));
      select.onchange=()=>show(Number(select.value));label.append(select);article.append(label);
    }
    article.append(body);show(0);section.append(article);
  });
  return section;
}