import type {TraitDefinition} from '../engine/traits';
import {COMBAT_DESCRIPTION_TERMS} from './abilityDescription';
import {BATTLE_GOLD_BASE_CAP} from '../engine/battleGold';
import {BATTLE_SOUL_BASE_CAP} from '../engine/battleSouls';

export interface TraitDescriptionDiagnostic {path:string;code:'unknown-field'|'unsupported-value';message:string}
export interface AdaptedTraitDescription {
 description:string;
 support:'full'|'partial'|'empty';
 effects:{field:string;text:string;support:'full'|'partial'}[];
 diagnostics:TraitDescriptionDiagnostic[];
}
type Obj=Record<string,unknown>;
const metadata=new Set(['code','name','description','troops']);
const isObj=(v:unknown):v is Obj=>!!v&&typeof v==='object'&&!Array.isArray(v);
const gainTriggers:Record<string,string>={regen:'我方回合开始时',onDamagedGain:'自身受到骷髅头伤害后',onSkullHitGain:'自身造成骷髅头伤害后',onAllyCastGain:'我方任一角色施法时（含自身）',onEnemyCastGain:'敌方角色施法时',onEnemyDeathGain:'敌方角色阵亡时',onAllyDeathGain:'我方角色阵亡时',onBigMatchGain:'我方配对 4 颗及以上宝石时',onExtraTurnGain:'我方获得额外回合时',onAllySummonGain:'我方部队被召唤并实际入场时'};
const auraTriggers:Record<string,string>={onEnemyDeathTypeAura:'敌方角色阵亡时',onAllyDeathTypeAura:'我方角色阵亡时',onAllyCastTypeAura:'我方任一角色施法时（含自身）',onDamagedTypeAura:'自身受到骷髅头伤害后',onBigMatchTypeAura:'我方配对 4 颗及以上宝石时',battleStartTypeAura:'战斗开始时',turnStartTypeAura:'我方回合开始时'};
const summonTriggers:Record<string,string>={summonOnDeath:'自身阵亡时',summonOnAllyDeath:'我方其他角色阵亡时',summonOnEnemyDeath:'敌方角色阵亡时',turnStartSummon:'我方回合开始时',summonOnDamaged:'自身受到骷髅头伤害后',summonOnAllyCast:'我方任一角色施法时（含自身）',onBigMatchSummon:'我方配对 4 颗及以上宝石时'};
const statusTriggers:Record<string,string>={onBigMatchStatus:'我方配对 4 颗及以上宝石时',onColorMatchStatus:'我方配对指定颜色宝石时',turnStartStatus:'我方回合开始时',battleStartStatus:'战斗开始时',onAllyCastStatus:'我方任一角色施法时（含自身）',onEnemyCastStatus:'敌方角色施法时'};
const scopes:Record<string,string>={self:'自身',randomAlly:'随机一名我方存活角色（可含自身）',allAllies:'我方全体存活角色',allies:'我方全体存活角色',allEnemies:'敌方全体存活角色',enemyAll:'敌方全体存活角色',enemies:'敌方全体存活角色',randomEnemy:'随机一名敌方存活角色',firstEnemy:'敌方首位存活角色',front:'敌方首位存活角色',lastEnemy:'敌方末位存活角色'};

/** Pure rendering of adapted runtime fields. Unknown fields remain explicit gaps, never source-text fallbacks. */
export function describeAdaptedTrait(trait:TraitDefinition):AdaptedTraitDescription {
 const diagnostics:TraitDescriptionDiagnostic[]=[];
 const effects:AdaptedTraitDescription['effects']=[];
 const issue=(path:string,code:TraitDescriptionDiagnostic['code']='unsupported-value')=>{diagnostics.push({path,code,message:code==='unknown-field'?'此特质字段尚未纳入机械说明':'此特质值尚未纳入机械说明'});return '【待核对】';};
 const obj=(v:unknown,path:string,keys:readonly string[]):Obj=>{
   if(!isObj(v)){issue(path);return {};}
   for(const key of Object.keys(v))if(v[key]!==undefined&&!keys.includes(key))issue(`${path}.${key}`,'unknown-field');
   return v;
 };
 const num=(v:unknown,p:string)=>typeof v==='number'&&Number.isFinite(v)?String(v):issue(p);
 const pct=(v:unknown,p:string)=>typeof v==='number'&&Number.isFinite(v)&&v>=0&&v<=1?`${Number((v*100).toPrecision(12))}%`:issue(p);
 const term=(kind:keyof typeof COMBAT_DESCRIPTION_TERMS,v:unknown,p:string):string=>typeof v==='string'?(COMBAT_DESCRIPTION_TERMS[kind] as Readonly<Record<string,string>>)[v]??issue(p):issue(p);
 const scope=(v:unknown,p:string):string=>typeof v==='string'?scopes[v]??issue(p):issue(p);
 const affinity=(v:unknown,p:string):string=>{
   if(v==='all')return '我方全体存活角色';
   if(typeof v==='string'&&/^affinity:\d+$/.test(v))return `我方族群 #${v.slice(9)} 的存活角色`;
   if(typeof v==='string'&&v in COMBAT_DESCRIPTION_TERMS.colors)return `我方关联${term('colors',v,p)}色的存活角色`;
   return issue(p);
 };
 const gain=(v:unknown,p:string,regen=false):string=>{
   const s=obj(v,p,['stat','amount','alsoStats']);
   const stats=[s.stat,...(Array.isArray(s.alsoStats)?s.alsoStats:[])];
   if(s.alsoStats!==undefined&&!Array.isArray(s.alsoStats))issue(`${p}.alsoStats`);
   const amount=num(s.amount,`${p}.amount`);
   // Turn-start regen heals only missing HP; other gain hooks use grantStat to grow both HP values.
   const hp=stats.includes('hp')?(regen?`恢复最多 ${amount} 点缺失生命（不增加最大生命）`:`当前与最大生命各增加 ${amount} 点`):'';
   const others=stats.flatMap((v,i)=>v==='hp'?[]:[term('stats',v,`${p}.stats.${i}`)]);
   return [hp,others.length?`获得 ${amount} 点${others.join('、')}`:''].filter(Boolean).join('，');
 };
 const gains=(v:unknown,p:string):string=>{
   const s=obj(v,p,['hp','armor','attack','magic','mana']);
   return Object.entries(s).map(([k,v])=>`${num(v,`${p}.${k}`)} 点${term('stats',k,`${p}.${k}`)}`).join('、')||issue(p);
 };
 // Describe native battle economy directly; PvP-only effects retain their mode restrictions.
 const pvpLimit='当前 ST 未提供 PvP 模式，此效果当前受限';
 const nonnegative=(v:unknown,p:string):string=>typeof v==='number'&&Number.isFinite(v)&&v>=0?String(v):issue(p);
 const economyCurrency=(v:unknown,p:string,allowGems=false):string=>v==='gold'?'金币':v==='souls'?'灵魂':allowGems&&v==='gems'?'钻石':issue(p);
 const economyCredit=(s:Obj,p:string,allowGems=false):string=>{
   const currency=economyCurrency(s.currency,`${p}.currency`,allowGems);
   const amount=nonnegative(s.amount,`${p}.amount`);
   let credit=`增加基础 ${amount} 点战斗${currency}`;
   if(s.currency==='gold')credit=`为持有者所属方的战斗金币池${credit}（左方与右方分别计账）；每次入账乘以该方开战快照倍率（1＋同方金币收益加成之和）并向下取整，余额上限为 floor(${BATTLE_GOLD_BASE_CAP}×该倍率)，实际增加量受剩余额度限制，支出后可再次获得`;
   else if(s.currency==='souls')credit=`为双方共享的战斗灵魂池${credit}；每次入账乘以开战快照倍率（1＋左方灵魂收益加成之和）并向下取整，池上限为 floor(${BATTLE_SOUL_BASE_CAP}×该倍率)，实际增加量受剩余额度限制；右方也向共享池入账，但右方灵魂收益特质不贡献倍率`;
   else if(s.currency==='gems'&&allowGems)credit=`为双方共享的战斗钻石池${credit}；不应用金币或灵魂收益倍率，此入账口无战斗内数量上限`;
   return `${credit}；基础量为 0 时不入账`;
 };
 const economyRatio=(v:unknown,p:string):string=>{
   const s=obj(v,p,['currency','ratio']);
   const currency=economyCurrency(s.currency,`${p}.currency`);
   const ratio=nonnegative(s.ratio,`${p}.ratio`);
   const percent=ratio==='【待核对】'?ratio:`${Number(((s.ratio as number)*100).toPrecision(12))}%`;
   const owner=s.currency==='souls'?'仅持有者在左方时计入双方共享战斗灵魂池的倍率；右方持有者不贡献灵魂倍率':'计入持有者所属方的战斗金币倍率（左方与右方分别计算）';
   const base=s.currency==='gold'?BATTLE_GOLD_BASE_CAP:s.currency==='souls'?BATTLE_SOUL_BASE_CAP:'【待核对】';
   return `战斗开始时快照战斗${currency}收益加成 +${percent}；${owner}；同一池的加成相加，总倍率为 1＋加成之和，每次战斗内入账乘以总倍率并向下取整，池余额上限为 floor(${base}×总倍率)；持有者随后阵亡或被击晕均不撤销快照，后续召唤不追加倍率；结算额外奖励不应用此倍率`;
 };
 const chance=(s:Obj,p:string):string=>s.chance===undefined?'':`以 ${pct(s.chance,`${p}.chance`)} 概率`;
 const big=(s:Obj,p:string):string=>`我方配对 ${num(s.minSize??4,`${p}.minSize`)} 颗及以上宝石时`;
 const colorTrigger=(s:Obj,p:string)=>`我方配对${s.color==='skull'?'骷髅头':`${term('colors',s.color,`${p}.color`)}色宝石`}时`;
 const statuses=(v:unknown,p:string):string=>{
   if(!Array.isArray(v)||!v.length)return issue(p);
   return v.map((v,i)=>{const s=obj(v,`${p}.${i}`,['id','magnitude']);return `${term('statuses',s.id,`${p}.${i}.id`)}${s.magnitude===undefined?'':`（强度 ${num(s.magnitude,`${p}.${i}.magnitude`)}）`}`;}).join('、');
 };
 const simpleStatus=(v:unknown,p:string):string=>{
   const s=obj(v,p,['id','statusId','turns','magnitude']);
   return `${term('statuses',s.id??s.statusId,`${p}.id`)}（${num(s.turns,`${p}.turns`)} 回合${s.magnitude===undefined?'':`，强度 ${num(s.magnitude,`${p}.magnitude`)}`}）`;
 };
 const specialName=(v:unknown,p:string)=>v==='doomSkull'?'增强骷髅头宝石':v==='uberDoomSkull'?'高阶骷髅头宝石':term('specials',v,p);
 const special=(s:Obj,p:string)=>`${s.color===undefined?'':term('colors',s.color,`${p}.color`)+'色'}${specialName(s.gem,`${p}.gem`)}${s.tier===undefined?'':`（等级 ${num(s.tier,`${p}.tier`)}）`}`;
 const storm=(value:unknown,p:string):string=>{
   const s=obj(value,p,['color','colors','turns','dropKind','troopId','referenceName','displayName']);
   // These trait hooks consume only colors[0]; spell storms have a separate dual-color rule.
   const colors=Array.isArray(s.colors)?s.colors.slice(0,1):[s.color].filter(v=>v!==undefined);
   const what=s.dropKind===undefined?colors.map((c,i)=>term('colors',c,`${p}.colors.${i}`)+'色宝石').join('、'):s.dropKind==='skull'?'骷髅头':s.dropKind==='doomSkull'?'末日骷髅头':s.dropKind==='uberDoomSkull'?'极度末日骷髅头':issue(`${p}.dropKind`);
   return `提高${what||issue(p)}的掉落倾向，持续 ${num(s.turns??8,`${p}.turns`)} 回合；替换现有风暴`;
 };
 for(const [field,value]of Object.entries(trait)){
   if(metadata.has(field)||value===undefined)continue;
   const path=`trait.${field}`;const before=diagnostics.length;let text='';
   if(field in gainTriggers){text=`${gainTriggers[field]}，自身${gain(value,path,field==='regen')}`;}
   else if(field in auraTriggers){const s=obj(value,path,['troopType','scope','gains']);text=`${auraTriggers[field]}，${affinity(s.scope??s.troopType,`${path}.scope`)}获得 ${gains(s.gains,`${path}.gains`)}`;}
   else if(field in summonTriggers){
     const s=obj(value,path,['chance','troopId','referenceName','displayName','minSize','storm','fullMana']);
     if(s.storm){text=`${summonTriggers[field]}，${chance(s,path)}${storm(s.storm,`${path}.storm`)}`;}else{
       const ref=typeof s.referenceName==='string'&&/^unit:\d+$/.test(s.referenceName)?`召唤体 ${s.referenceName.slice(5)}`:issue(`${path}.referenceName`);
       text=`${field==='onBigMatchSummon'?big(s,path):summonTriggers[field]}，${chance(s,path)}向我方空位召唤${ref}；沿用持有者等级与难度，${s.fullMana===true?'满法力入场，':''}满员时不召唤`;
     }
   }
   else if(field in statusTriggers){
     const s=obj(value,path,['scope','target','statuses','turns','chance','randomPositive','randomNegative','randomMissingStatusCount','minSize','independentChance','color']);
     let target=scope(s.scope??s.target,`${path}.target`);
     let what=statuses(s.statuses,`${path}.statuses`);
     if(s.randomPositive===true)what=`一个随机可获得的正面状态（候选：${what}）`;
     if(s.randomNegative===true)what=`一个随机可获得的负面状态（候选：${what}）`;
     if(s.randomMissingStatusCount!==undefined)what=`最多 ${num(s.randomMissingStatusCount,`${path}.randomMissingStatusCount`)} 个尚未具有的不同状态（候选：${what}）`;
     text=`${field==='onBigMatchStatus'?big(s,path):field==='onColorMatchStatus'?colorTrigger(s,path):statusTriggers[field]}，对${target}${s.independentChance===true?'逐个状态独立':''}${chance(s,path)}施加${what}，持续 ${num(s.turns??3,`${path}.turns`)} 回合`;
   }
   else switch(field){
     case 'skullDamageReduction':text=`受到的骷髅头伤害降低 ${pct(value,path)}；同类减伤取最强值`;break;
     case 'spellDamageReduction':text=`受到的法术伤害降低 ${pct(value,path)}；同类减伤取最强值`;break;
     case 'dodgeChance':text=`以 ${pct(value,path)} 概率闪避骷髅头伤害`;break;
     case 'reflectSkullRatio':text=`将受到的骷髅头伤害的 ${pct(value,path)} 反弹给攻击者`;break;
     case 'armorPierceChance':text=`造成骷髅头伤害时，以 ${pct(value,path)} 概率穿透护甲`;break;
     case 'skullDamageFromArmorRatio':text=`骷髅头伤害附加自身护甲的 ${pct(value,path)}`;break;
     case 'skullMultVsWounded':text=`攻击生命未满的目标时，骷髅头伤害倍率为 ${num(value,path)}`;break;
     case 'enemyMasteryMult':text=`敌方宝石灵力倍率变为 ${num(value,path)}（同类取最低倍率）`;break;
     case 'onSkullHitStealMana':text=`自身造成骷髅头伤害后，从受击目标窃取最多 ${num(value,path)} 点法力；受实际可扣法力和自身法力上限限制`;break;
     case 'battleStartManaRatio':text=`战斗开始时，自身法力至少补至法力上限的 ${pct(value,path)}（向下取整）`;break;
     case 'devourImmunity':case 'manaOpsImmunity':case 'untargetable':
       if(typeof value!=='boolean')text=issue(path);
       else text=value?{devourImmunity:'免疫吞噬',manaOpsImmunity:'免疫法力削减与窃取',untargetable:'不作为普通法术选择的目标；没有其他可选目标时仍可被选择'}[field]:'该效果未启用';break;
     case 'statusImmunities':
       text=Array.isArray(value)?`免疫${[...new Set(value.map((v,i)=>v==='*'?'全部状态':v==='negative'?'全部负面状态':v==='mana-burn'?'法力燃烧':term('statuses',v,`${path}.${i}`)))].join('、')}`:issue(path);break;
     case 'teamAura':{const s=obj(value,path,['scope','stat','amount']);text=`战斗开始时，${scope(s.scope,`${path}.scope`)}${s.stat==='random'?`随机四维属性合计变化 ${num(s.amount,`${path}.amount`)} 点`:`${term('stats',s.stat,`${path}.stat`)}变化 ${num(s.amount,`${path}.amount`)} 点`}`;break;}
     case 'typeAura':{const s=obj(value,path,['troopType','stat','amount']);text=`战斗开始时，${affinity(s.troopType,`${path}.troopType`)}的${term('stats',s.stat,`${path}.stat`)}增加 ${num(s.amount,`${path}.amount`)} 点`;break;}
     case 'perAllyColor':{const s=obj(value,path,['color','stat','amount']);text=`战斗开始时，每名关联${term('colors',s.color,`${path}.color`)}色的我方存活角色（含自身）使自身${term('stats',s.stat,`${path}.stat`)}增加 ${num(s.amount,`${path}.amount`)} 点`;break;}
     case 'perAllyTrait':{const s=obj(value,path,['trait','gains']);if(s.trait!=='banding')issue(`${path}.trait`);text=`战斗开始时，每名具有束带特质的我方存活角色（含自身，每名计一次）使自身获得 ${gains(s.gains,`${path}.gains`)}`;break;}
     case 'positionAura':{const s=obj(value,path,['position','scope','gains']);text=`自身首次处于${s.position==='front'?'首位':s.position==='last'?'末位':issue(`${path}.position`)}时，${scope(s.scope??'self',`${path}.scope`)}获得 ${gains(s.gains,`${path}.gains`)}`;break;}
     case 'allyStartMana':case 'battleStartManaAura':{const s=obj(value,path,['troopType','scope','ratio']);text=`战斗开始时，${affinity(s.scope??s.troopType,`${path}.scope`)}法力至少补至各自上限的 ${pct(s.ratio,`${path}.ratio`)}（向下取整）`;break;}
     case 'manaLink':{const s=obj(value,path,['color','amount']);text=`自身实际收到${s.color==='all'||s.color==='*'?'任意颜色':term('colors',s.color,`${path}.color`)+'色'}宝石配对产生的基础法力后，自身额外获得最多 ${num(s.amount,`${path}.amount`)} 点法力，受自身剩余法力容量限制`;break;}
     case 'onColorMatchGain':case 'onColorMatchGains':{
       const values=field==='onColorMatchGains'&&Array.isArray(value)?value:[value];
       text=values.map((v,i)=>{const p=field==='onColorMatchGains'?`${path}.${i}`:path;const s=obj(v,p,['color','stat','amount','alsoStats']);const {color,...spec}=s;return `${colorTrigger({color},p)}，自身${gain(spec,p)}`;}).join('；');break;}
     case 'onColorMatchTypeAura':{const s=obj(value,path,['color','scope','gains']);text=`${colorTrigger(s,path)}，${affinity(s.scope,`${path}.scope`)}获得 ${gains(s.gains,`${path}.gains`)}`;break;}
     case 'onEnemyColorMatchGain':{const s=obj(value,path,['color','stat','amount','alsoStats']);const {color,...spec}=s;text=`${colorTrigger({color},path).replace('我方','敌方')}，自身${gain(spec,path)}`;break;}
     case 'onBigMatchSizedGain':{const s=obj(value,path,['minSize','stat','amount']);const {minSize,...spec}=s;text=`${big({minSize},path)}，自身${gain(spec,path)}`;break;}
     case 'skullMultVsStatus':case 'skullMultVsStatusList':{
       const values=field.endsWith('List')&&Array.isArray(value)?value:[value];
       text=values.map((v,i)=>{const p=`${path}.${i}`;const s=obj(v,p,['status','mult']);return `目标具有${term('statuses',s.status,`${p}.status`)}时，骷髅头伤害倍率为 ${num(s.mult,`${p}.mult`)}`;}).join('；')+'；多个条件同时命中时取最高倍率';break;}
     case 'skullMultVsColor':case 'skullMultVsTroopType':{const s=obj(value,path,['color','troopType','mult']);const what=field==='skullMultVsColor'?`关联${term('colors',s.color,`${path}.color`)}色`:typeof s.troopType==='string'&&/^affinity:\d+$/.test(s.troopType)?`属于族群 #${s.troopType.slice(9)}`:issue(`${path}.troopType`);text=`目标${what}时，骷髅头伤害倍率为 ${num(s.mult,`${path}.mult`)}`;break;}
     case 'onDamagedStatus':text=`自身受到骷髅头伤害后，对自身施加${simpleStatus(value,path)}`;break;
     case 'onDamagedEnemyStatus':text=`自身受到骷髅头伤害后，对敌方首位存活角色施加${simpleStatus(value,path)}`;break;
     case 'onEnemyDeathStatus':text=`敌方角色阵亡时，对自身施加${simpleStatus(value,path)}`;break;
     case 'onEnemyDeathEnemyStatus':text=`敌方角色阵亡时，对敌方首位仍存活的角色施加${simpleStatus(value,path)}`;break;
     case 'inflictOnSkullHit':case 'inflictOnSkullHitList':case 'inflictOnSkullDamaged':case 'inflictOnSkullDamagedList':{
       const values=field.endsWith('List')&&Array.isArray(value)?value:[value];
       text=`${field.startsWith('inflictOnSkullHit')?'自身造成骷髅头伤害后，对受击目标':'自身受到骷髅头伤害后，对攻击者'}施加${values.map((v,i)=>simpleStatus(v,`${path}.${i}`)).join('、')}`;break;}
     case 'onAllyCastRandomStatus':{const s=obj(value,path,['scope']);text=`我方任一角色施法时（含自身），对${scope(s.scope,`${path}.scope`)}施加一个随机${s.scope==='randomAlly'?'正面':'负面'}状态`;break;}
     case 'onSelfDeathFillAllyMana':text=value===true?'自身阵亡时，随机一名法力未满的我方存活角色获得其法力上限一半的法力（向下取整，受上限限制）':value===false?'该效果未启用':issue(path);break;
     case 'turnStartCreateSpecialGem':case 'onBigMatchCreateGem':case 'onDamagedCreateGem':case 'onDeathCreateGem':case 'onAllyCastCreateGem':{
       const s=obj(value,path,['gem','tier','color','count','chance','minSize']);
       const when=field==='onBigMatchCreateGem'?big(s,path):field==='onDamagedCreateGem'?'自身受到骷髅头伤害后':field==='onDeathCreateGem'?'自身阵亡时':field==='onAllyCastCreateGem'?'我方任一角色施法时（含自身）':'我方回合开始时';
       text=`${when}，${chance(s,path)}将 ${num(s.count,`${path}.count`)} 颗随机现存宝石替换为${special(s,path)}`;break;
     }
     case 'turnStartCreateGem':case 'onBigMatchCreatePlainGem':{
       const s=obj(value,path,['color','count','chance','minSize']);text=`${field==='onBigMatchCreatePlainGem'?big(s,path):'我方回合开始时'}，${chance(s,path)}将 ${num(s.count??1,`${path}.count`)} 颗随机现存宝石替换为${s.color==='skull'?'普通骷髅头':term('colors',s.color,`${path}.color`)+'色普通宝石'}`;break;
     }
     case 'turnStartColorToSpecial':case 'battleStartConvertGems':case 'turnStartColorToSkull':{
       const s=obj(value,path,['color','gem','gemColor','count','chance','tier']);text=`${field==='battleStartConvertGems'?'战斗开始时':'我方回合开始时'}，${chance(s,path)}将最多 ${num(s.count??1,`${path}.count`)} 颗随机${s.color==='skull'?'普通骷髅头':term('colors',s.color,`${path}.color`)+'色宝石'}转换为${field==='turnStartColorToSkull'?'骷髅头':special({...s,color:s.gemColor},path)}`;break;
     }
     case 'battleStartStorm':case 'turnStartStorm':case 'onBigMatchStorm':case 'onAllySummonStorm':{
       const when=field==='battleStartStorm'?'战斗开始时':field==='turnStartStorm'?'我方回合开始时':field==='onBigMatchStorm'?'我方配对 4 颗及以上宝石时':'我方部队被召唤并实际入场时';
       const s=obj(value,path,['color','colors','turns','dropKind','troopId','referenceName','displayName','minSize']);const {minSize,...spec}=s;
       text=`${field==='onBigMatchStorm'?big({minSize},path):when}，${storm(spec,path)}`;break;
     }
     case 'onBigMatchExplodeGem':case 'turnStartExplodeGem':case 'battleStartDestroy':case 'onSkullHitExplodeGem':case 'onColorMatchExplodeGem':{
       const s=obj(value,path,['kind','color','tier','count','minSize']);
       const when=field==='onBigMatchExplodeGem'?big(s,path):field==='turnStartExplodeGem'?'我方回合开始时':field==='battleStartDestroy'?'战斗开始时':field==='onSkullHitExplodeGem'?'自身造成骷髅头伤害后':colorTrigger(s,path);
       const what=field==='onSkullHitExplodeGem'||field==='onColorMatchExplodeGem'||s.kind==='random'?'随机宝石':s.kind==='skull'?'骷髅头':s.kind===undefined||s.kind==='color'?`${term('colors',s.color,`${path}.color`)}色宝石`:special({...s,gem:s.kind,color:undefined},path);
       text=`${when}，爆破最多 ${num(s.count??1,`${path}.count`)} 颗${what}`;break;
     }
     case 'onColorMatchDamage':case 'onBigMatchDamage':case 'onAllyCastEnemyDamage':case 'onSkullDamagedEnemyDamage':{
       const s=obj(value,path,['amount','scope','color','minSize']);
       const when=field==='onColorMatchDamage'?colorTrigger(s,path):field==='onBigMatchDamage'?big(s,path):field==='onSkullDamagedEnemyDamage'?'自身受到骷髅头伤害后':'我方任一角色施法时（含自身）';
       text=`${when}，对${scope(s.scope??(field==='onSkullDamagedEnemyDamage'?'allEnemies':'randomEnemy'),`${path}.scope`)}造成 ${num(s.amount,`${path}.amount`)} 点法术伤害`;break;
     }
     case 'onColorMatchDrain':case 'turnStartStealLife':case 'turnStartStealMana':{
       const s=obj(value,path,['color','amount']);const life=field!=='turnStartStealMana';
       text=`${field==='onColorMatchDrain'?colorTrigger(s,path):'我方回合开始时'}，从敌方首位存活角色窃取最多 ${num(s.amount,`${path}.amount`)} 点${life?'生命，按实际失血增加自身当前与最大生命':'法力，受实际可扣法力和自身法力上限限制'}`;break;
     }
     case 'onBigMatchEnemyDrain':case 'onAllyCastEnemyDrain':{
       const s=obj(value,path,['stat','amount','scope','minSize']);text=`${field==='onBigMatchEnemyDrain'?big(s,path):'我方任一角色施法时（含自身）'}，使${scope(s.scope,`${path}.scope`)}的${s.stat==='random'?'随机一项四维属性':term('stats',s.stat,`${path}.stat`)}减少最多 ${num(s.amount,`${path}.amount`)} 点（自身不获得该数值）`;break;
     }
     case 'turnStartEnemyDrain':{const s=obj(value,path,['amount']);text=`我方回合开始时，使敌方首位存活角色的生命、护甲、攻击、魔力各减少最多 ${num(s.amount,`${path}.amount`)} 点`;break;}
     case 'onBigMatchConvert':{const s=obj(value,path,['from','to','amount','minSize']);if(s.from!=='hp'||s.to!=='magic')issue(path);text=`${big(s,path)}，自身损失最多 ${num(s.amount,`${path}.amount`)} 点当前生命并等量获得魔力；当前生命至少保留 1 点`;break;}
     case 'onBigMatchCleanse':case 'onColorMatchCleanse':{const s=obj(value,path,['minSize','color']);text=`${field==='onColorMatchCleanse'?colorTrigger(s,path):big(s,path)}，移除我方全体存活角色的负面状态`;break;}
     case 'onSelfDeathEnemyAllStatus':case 'onAllyDeathStatus':{
       const s=obj(value,path,['target','statuses','turns']);text=`${field==='onSelfDeathEnemyAllStatus'?'自身阵亡时':'我方其他角色阵亡时'}，对${field==='onSelfDeathEnemyAllStatus'?'敌方全体存活角色':scope(s.target,`${path}.target`)}施加${statuses(s.statuses,`${path}.statuses`)}，持续 ${num(s.turns,`${path}.turns`)} 回合`;break;
     }
     case 'onExtraTurnStatus':{const s=obj(value,path,['scope','id','turns']);text=`我方获得额外回合时，对${scope(s.scope,`${path}.scope`)}施加${term('statuses',s.id,`${path}.id`)}，持续 ${num(s.turns,`${path}.turns`)} 回合`;break;}
     case 'onBigMatchKill':{const s=obj(value,path,['chance','scope','minSize']);text=`${big(s,path)}，${chance(s,path)}猎杀${scope(s.scope,`${path}.scope`)}`;break;}
     case 'onSkullHitDevour':case 'onSkullDamagedDevour':case 'onEnemyDeathDevour':{
       const s=obj(value,path,['chance']);const when=field==='onSkullHitDevour'?'自身造成骷髅头伤害后':field==='onSkullDamagedDevour'?'自身受到骷髅头伤害后':'敌方角色阵亡时';
       text=`${when}，${chance(s,path)}吞噬${field==='onSkullHitDevour'?'本次受击目标':field==='onSkullDamagedDevour'?'本次攻击者':'随机一名敌方存活角色'}；吞噬免疫目标不生效`;break;
     }
     case 'onSkullMatchEconomy':case 'onBigMatchEconomy':case 'turnStartEconomy':case 'onDamagedEconomy':case 'onAllyCastEconomy':case 'onDeathEconomy':{
       const s=obj(value,path,field==='onBigMatchEconomy'?['currency','amount','minSize']:['currency','amount']);
       let when='';
       if(field==='onSkullMatchEconomy')when='持有者存活且未被击晕时，所属方每组骷髅头配对在伤害结算后触发一次，无须实际命中；炸毁骷髅头不触发';
       else if(field==='onBigMatchEconomy'){
         const minimum=s.minSize===undefined?4:s.minSize;
         const size=typeof minimum==='number'&&Number.isInteger(minimum)&&minimum>=0?String(Math.max(4,minimum)):issue(`${path}.minSize`);
         when=`持有者存活且未被击晕时，所属方每组配对 ${size} 颗及以上宝石（含骷髅头）各触发一次；数量按单组计算，不合计多组或整次连锁，与基础四五连奖励分别结算`;
       }
       else if(field==='turnStartEconomy')when='真实换手进入持有者所属方回合时，存活且未被击晕的持有者在回合开始、持续伤害结算前触发一次；开战首回合及额外回合延续不触发';
       else if(field==='onDamagedEconomy')when='自身收到骷髅头伤害事件（含伤害值为 0 的事件）后，仍存活且未被击晕时触发，同批事件中同一受击者只触发一次；仅扣护甲也可触发，闪避、屏障挡下、致死后未复活或仅法术伤害不触发';
       else if(field==='onAllyCastEconomy')when='所属方任一角色成功施法时（含自身），存活且未被击晕的持有者在技能效果执行前触发一次；敌方施法不触发';
       else when='自身阵亡且该特质未被击晕压制时，在行动末尾处理阵亡事件时触发；同一次行动每名死者至多结算一次，同一角色多条阵亡经济配置只采用首条';
       text=`${when}；${economyCredit(s,path,field==='onSkullMatchEconomy'||field==='onBigMatchEconomy'||field==='onDeathEconomy')}`;break;
     }
     case 'battleEconomyGain':text=economyRatio(value,path);break;
     case 'mode':text=value==='pvp'?`仅在 PvP 模式启用对应模式加成；${pvpLimit}`:issue(path);break;
     case 'pvpBonus':{
       const s=obj(value,path,['phase','gains']);
       const targets:Record<string,string>={attack:'持有者位于左方进攻队时，为所属方全体存活角色',defense:'持有者位于右方防守队时，为所属方全体存活角色',battle:'为持有者自身'};
       const target=typeof s.phase==='string'&&Object.hasOwn(targets,s.phase)?targets[s.phase]:issue(`${path}.phase`);
       const stats=obj(s.gains,`${path}.gains`,['hp','armor','attack','magic']);
       const changes=Object.entries(stats).filter(([key,v])=>['hp','armor','attack','magic'].includes(key)&&v!==undefined).map(([key,v])=>{
         const amount=nonnegative(v,`${path}.gains.${key}`);
         return key==='hp'?`当前与最大生命各增加 ${amount} 点`:`${term('stats',key,`${path}.gains.${key}`)}增加 ${amount} 点`;
       });
       text=`仅在 PvP 模式首次领取开局事件时，若持有者存活且未被击晕，${target}应用一次加成：${changes.join('、')||'无属性加成'}；不同持有者的加成可叠加，数值为 0 的属性不增加；${pvpLimit}`;break;
     }
     case 'pvpEconomyGain':{
       const s=obj(value,path,['currency','amount']);
       text=`仅在 PvP 模式首次正常判定战斗胜负时（投降不触发），左方仍存活且未被击晕的持有者为左方增加 ${nonnegative(s.amount,`${path}.amount`)} 点战斗${economyCurrency(s.currency,`${path}.currency`)}（灵魂进入共享池），左方胜败均触发；此为独立奖励，不应用战斗内收益倍率或采集上限；右方持有者不触发；${pvpLimit}`;break;
     }
     default:text=issue(path,'unknown-field');
   }
   effects.push({field,text,support:diagnostics.length===before?'full':'partial'});
 }
 const support=diagnostics.length?'partial':effects.length?'full':'empty';
 const description=effects.filter(e=>e.text!=='【待核对】').map(e=>e.text+'。').join('')+(diagnostics.length?'部分特质效果尚待核对。':'');
 return {description,support,effects,diagnostics};
}
