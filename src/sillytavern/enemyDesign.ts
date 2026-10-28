import {assertEnemyBudget,evaluateEnemyBudget,validateEnemyBudgetPolicy} from './enemyBudget';
import type {EnemyBudgetPolicy,EnemyBudgetEvaluation} from './enemyBudget';
import {TROOPS} from '../data/troops';
import type {TroopData} from '../data/troops';
import type {SkillPrototype,EffectSegment} from '../engine/skills/prototypes';
import type {TraitDefinition} from '../engine/traits';
import {resolvePassives} from '../engine/traits';
import {BoardModel} from '../engine/BoardModel';
import {SPECIAL_MATCH_COLOR,colorGem,isSameMatchType,matchJoinKey,specialGem} from '../engine/types';
import type {BaseColor,SpecialGemKind} from '../engine/types';
import type {ClearGemParams,CreateGemSpec,GemParams} from '../engine/skills/effects/gems';
import {NEGATIVE_STATUS_IDS,POSITIVE_STATUS_IDS} from '../engine/statusCategories';
import {ExtensionRegistry} from '../engine/registry';
import {BATTLE_SCHEMA_VERSION,RULESET_VERSION} from '../session/contract';
import {adaptedPrototype,adaptedTrait,compileEnemyBlueprint,registerAdaptedCatalog} from './enemyBlueprint';
import type {EnemyBlueprint} from './enemyBlueprint';
import {COLORS,COLOR_NAMES,RANKS,FORMS,ROLE_ORDER,ROLE_NAMES,PORTRAITS,colorKey,findPortraits,savePortrait} from './portraits';
import {prototypeEconomyIssues,traitEconomyIssues,stEffectIsProvablyUnreachable,stTraitIsProvablyUnreachable} from './economyAvailability';
import {validateStDerivedForms} from './derivedFormPreflight';
import {stableJson} from './json';
import {inspectEnemyMechanisms} from './enemyMechanismRules';
import {ENEMY_ASSEMBLY_POLICY_VERSION,profileEnemyAssembly,enemyGenerationIssues,enemyTeamGenerationIssues,enemyProfileWeight,enemyRoleAffinity,enemySelectionRng,pickEnemyWeighted,primaryTaskPreserved} from './enemyAssemblyPolicy';
import type {EnemyAssemblyProfile,EnemyGeneration,EnemyGenerationPool} from './enemyAssemblyPolicy';

export const ENEMY_DESIGN_VERSION=1;
const effectDefinitions=[
 ['damage','伤害','对敌方造成直接伤害'],['trueDamage','真实伤害','对敌方造成绕过护甲的伤害'],
 ['execute','处决','直接消灭敌方目标'],['armor','护甲','为自身或盟友增加护甲'],
 ['barrier','屏障','为自身或盟友施加屏障'],['damageReduction','减伤','实际特质提供骷髅或法术减伤'],
 ['heal','治疗','恢复生命；单纯提升生命上限不计治疗'],['cleanse','净化','清除己方负面状态'],
 ['allyBuff','盟友增益','为自身以外的盟友提供属性或正面状态'],['mana','供魔','直接法力、法力链接或摧毁/爆破收集法力；棋盘收集不保证颜色或数量'],
 ['gemCreate','造石','创造宝石，颜色和种类以实际配方为准'],['gemConvert','转色','转换宝石'],
 ['gemExplode','爆破','爆破宝石'],['control','控制','向敌人施加沉默、冰冻、缠绕或击晕'],
 ['debuff','削弱','降低敌方属性或施加明确负面状态'],['summon','召唤','召唤单位或复制召唤'],
 ['transform','变形','实际单位变形或狼化'],['devour','吞噬','吞噬敌方单位'],
 ['extraTurn','额外回合','实际主动效果授予额外回合'],['dispel','驱散','清除敌方正面状态'],
] as const;
export type EnemyDesignEffect=typeof effectDefinitions[number][0];
const roleRules={
 Defender:{groups:[['armor','barrier','damageReduction']],description:'坦克：实际护甲增益、屏障或减伤；仅高生命或源职责标签不算。'},
 Striker:{groups:[['damage']],description:'输出：实际对敌方直接伤害。'},
 Generator:{groups:[['mana','colorGem']],description:'供魔：直接法力、法力链接、明确创造/转换六色宝石，或按棋盘条件摧毁/爆破收集法力；不保证收集颜色或数量，移除与单纯骷髅造石不算。'},
 Support:{groups:[['allyBuff','allyHeal','allyCleanse']],description:'辅助：实际作用于自身以外盟友的增益、治疗或净化。'},
 Mage:{groups:[['magicDamage']],description:'法师：直接敌方伤害含正魔力缩放系数。'},
 Warlock:{groups:[['debuff','control','dispel']],description:'术士：实际敌方削弱、控制或驱散。'},
 Assassin:{groups:[['trueDamage','execute','backStrike']],description:'刺客：真实伤害、处决或明确后排/最弱目标伤害；普通单体伤害不算。'},
 Warrior:{groups:[['damage','skullOffense'],['attackBuff','skullOffense']],description:'战士：实际伤害并有攻击增益，或明确骷髅进攻机制。'},
 Warmaster:{groups:[['teamAttack']],description:'统帅：实际为自身以外盟友增加攻击；单独召唤不算。'},
} as const;
const primaryRoleDescriptions:Record<string,string>={"Defender": "坦克：承伤和保护职责，优先护甲、屏障、减伤与续航。", "Striker": "输出：以直接伤害和杀伤为主要任务。", "Generator": "供魔：以法力和棋盘资源供给为主要任务，可以同时造成伤害。", "Support": "辅助：以团队增益、治疗、净化或保护为主要任务。", "Mage": "法师：原生法术战法职责；魔力缩放本身不决定职责。", "Warlock": "术士：以削弱、控制和驱散干扰敌方。", "Assassin": "刺客：以定点杀伤、后排威胁和特殊击杀为主要任务。", "Warrior": "战士：结合近战、骷髅进攻与自身攻防。", "Warmaster": "统帅：以团队进攻、骷髅资源、指挥增益或召唤组织攻势。"};
const diagnosticDefinitions={
 invalid_input:'语义输入需要是对象',unknown_field:'字段不在语义协议中；内部标识由编译器管理',
 invalid_enum:'值不在共享词表中',invalid_value:'字段数值或结构超出协议范围',
 no_exact_match:'阶级、形态和职责相交后没有真实立绘',required_effect_unavailable:'没有实际配方同时满足全部必需效果',
 role_signature_mismatch:'实际效果不满足职责签名',mechanism_unavailable:'实际配方包含当前不可用机制',
 compilation_failed:'现有蓝图编译或派生预检未通过',preferred_effect_unmet:'可选效果未满足',
 power_budget_exceeded:'实际配方超过显式战力预算',
 complexity_uncalibrated:'档位复杂度预算尚未标定；保留原配方并报告测量值',
 mechanism_omitted:'既有适配器省略了源机制；实际效果签名仅依据保留效果',
 invalid_save:'保存的语义设计、实际绑定或测量字段发生变化，请重新编译',
} as const;
export type EnemyDesignDiagnosticCode=keyof typeof diagnosticDefinitions;
export interface EnemyDesignDiagnostic {
 code:EnemyDesignDiagnosticCode;path:string;message:string;details?:unknown;
}
export class EnemyDesignError extends Error {
 readonly diagnostics:EnemyDesignDiagnostic[];
 constructor(diagnostics:EnemyDesignDiagnostic[]){super(diagnostics.map(d=>d.message).join('；'));this.name='EnemyDesignError';this.diagnostics=diagnostics;}
}
const fieldDefinitions={
 name:{description:'剧情姓名或称呼，仅用于显示'},race:{description:'剧情种族，仅用于显示，不替换技能族群'},
 manaColors:{description:'实例充能配色的六色非空无重复集合，与立绘独立；classified 不按源配色限制候选'},rank:{description:'五档定位，与等级独立'},
 form:{description:'只按实际图片主体形态严格匹配'},role:{description:'主职责固定分池；实际能力独立记录，不由伤害或魔力倍率反推职责'},
 level:{description:'等级',min:1,max:100,integer:true},difficulty:{description:'显式面板倍率',min:0.1,max:10},
 effects:{description:'效果意图数组；可为空，仅按职责筛选；required 必须全部满足，preferred 仅排序偏好',itemFields:['effect','requirement']},
 assembly:{description:'classified 按共享机制规则选择完整主动与独立特质；native 还原原生整套配置。缺省为 classified；旧存档按原规则恢复'},
 storyWeight:{description:'可选叙事展示权重，不改变技能、选图、面板或成本',min:0},
} as const;
/** JSON-only protocol: prompt, form labels, validation and role rules read this object. */
export const ENEMY_DESIGN_VOCABULARY={
 version:ENEMY_DESIGN_VERSION,fields:fieldDefinitions,
 manaColors:COLORS.map(key=>({key,label:COLOR_NAMES[key]!,description:'法力颜色；不隐含世界观元素'})),
 ranks:RANKS.map(key=>({key,label:key,description:'资源定位；数值由等级与显式 difficulty 决定'})),
 forms:FORMS.map(key=>({key,label:key,description:'按实际图片主体匹配，不更换形态'})),
 roles:ROLE_ORDER.map(key=>({key,label:ROLE_NAMES[key],description:primaryRoleDescriptions[key],groups:roleRules[key].groups})),
 effects:effectDefinitions.map(([key,label,description])=>({key,label,description})),
 requirements:[{key:'required',label:'必需',description:'全部满足；分支独有效果不计作确定能力'},
 {key:'preferred',label:'偏好',description:'仅对候选排序；未满足时返回诊断'}],
 diagnostics:diagnosticDefinitions,
 complexity:{calibration:'uncalibrated',activeCount:1,description:'测量全部嵌套效果、分支、条件和特质机制；五档上限仍待标定，不新增经验阈值'},
} as const;
export interface EnemyDesignInput {
 name?:string;race?:string;
 manaColors:string[];rank:string;form:string;role:string;level:number;difficulty:number;
 effects:{effect:string;requirement:'required'|'preferred'}[];storyWeight?:number;assembly?:'native'|'classified';
}
export const DEFAULT_ENEMY_DESIGN_INPUT:EnemyDesignInput={manaColors:['Red'],rank:'杂兵',form:'人形',role:'Striker',level:20,difficulty:1,effects:[],assembly:'classified',storyWeight:1};
export interface EnemyDesignSignature {
 roles:string[];effects:string[];
 evidence:{effect:string;source:string;path:string;detail:string}[];
 explanation:string[];
}
export interface EnemyDesignComplexity {
 activeCount:number;traitCount:number;effectSegments:number;branchCount:number;conditionalCount:number;traitMechanisms:number;
 calibration:'uncalibrated';notes:string[];
}
export interface CompiledEnemyDesign {
 version:typeof ENEMY_DESIGN_VERSION;rulesetVersion:string;integrity:string;design:EnemyDesignInput;seed:number;externalId:string;budget?:EnemyBudgetEvaluation;
 blueprint:EnemyBlueprint;signature:EnemyDesignSignature;generation?:EnemyGeneration;
 selection:{portraitAssetId:string;recipeId:string;abilityId:string;traitIds:string[]};
 complexity:EnemyDesignComplexity;diagnostics:EnemyDesignDiagnostic[];
}
const object=(v:unknown):v is Record<string,unknown>=>!!v&&typeof v==='object'&&!Array.isArray(v);
function diagnostic(code:EnemyDesignDiagnosticCode,path:string,details?:unknown):EnemyDesignDiagnostic {
 const root=path.split(/[.[]/)[0]!;
 const label=root in fieldDefinitions?fieldDefinitions[root as keyof typeof fieldDefinitions].description:root;
 const context:string[]=[];
 const effectLabel=(value:unknown)=>ENEMY_DESIGN_VOCABULARY.effects.find(e=>e.key===value)?.label??String(value);
 if(object(details)){
  if(Array.isArray(details.missing))context.push(`缺少必需效果：${details.missing.map(effectLabel).join('、')}`);
  if(typeof details.effect==='string')context.push(`效果：${effectLabel(details.effect)}`);
  if(code==='role_signature_mismatch'){
   const role=ENEMY_DESIGN_VOCABULARY.roles.find(r=>r.key===details.requested);
   if(role)context.push(role.description);
  }
  if(Array.isArray(details.allowed))context.push(`允许值：${details.allowed.join('、')}`);
  if(typeof details.reason==='string')context.push(details.reason);
  if(object(details.budget)&&Array.isArray(details.budget.issues))for(const issue of details.budget.issues)if(object(issue)&&typeof issue.message==='string')context.push(issue.message);
  if(Array.isArray(details.reasons))context.push(...details.reasons.filter((reason):reason is string=>typeof reason==='string'));
  if(code==='no_exact_match'&&object(details.query)){
   context.push(`请求：${stableJson(details.query)}`);
   if(Array.isArray(details.availableForms))context.push(`其余维度相同的可用形态：${details.availableForms.join('、')||'无'}`);
  }
 }
 return {code,path,message:[`${path}（${label}）：${ENEMY_DESIGN_VOCABULARY.diagnostics[code]}`,...new Set(context)].join('；'), ...(details===undefined?{}:{details})};
}
function fail(code:EnemyDesignDiagnosticCode,path:string,details?:unknown):never{throw new EnemyDesignError([diagnostic(code,path,details)]);}
function checkFields(value:Record<string,unknown>,allowed:readonly string[],path:string,issues:EnemyDesignDiagnostic[]):void{
 for(const key of Object.keys(value))if(!allowed.includes(key))issues.push(diagnostic('unknown_field',path?`${path}.${key}`:key));
}
function validateInput(input:unknown):EnemyDesignInput {
 if(!object(input))return fail('invalid_input','design');
 const issues:EnemyDesignDiagnostic[]=[];
 checkFields(input,Object.keys(ENEMY_DESIGN_VOCABULARY.fields),'',issues);
 for(const field of ['name','race'] as const){
  const value=input[field];
  if(value!==undefined&&(typeof value!=='string'||!value.trim()||value.length>80))issues.push(diagnostic('invalid_value',field,{reason:'需要 1～80 字符的非空文字'}));
 }
 for(const [field,entries]of [['rank',ENEMY_DESIGN_VOCABULARY.ranks],['form',ENEMY_DESIGN_VOCABULARY.forms],['role',ENEMY_DESIGN_VOCABULARY.roles]] as const){
  if(!entries.some(e=>e.key===input[field]))issues.push(diagnostic('invalid_enum',field,{value:input[field],allowed:entries.map(e=>e.key)}));
 }
 if(input.assembly!==undefined&&!['native','classified'].includes(String(input.assembly)))issues.push(diagnostic('invalid_enum','assembly',{allowed:['native','classified']}));
 const colors=input.manaColors;
 if(!Array.isArray(colors)||!colors.length||colors.some(c=>!ENEMY_DESIGN_VOCABULARY.manaColors.some(e=>e.key===c))||new Set(colors).size!==colors.length)
  issues.push(diagnostic('invalid_value','manaColors',{allowed:ENEMY_DESIGN_VOCABULARY.manaColors.map(e=>e.key)}));
 for(const field of ['level','difficulty','storyWeight'] as const){
  if(field==='storyWeight'&&input[field]===undefined)continue;
  const spec=ENEMY_DESIGN_VOCABULARY.fields[field],value=input[field];
  if(typeof value!=='number'||!Number.isFinite(value)||value<spec.min||('max'in spec&&value>spec.max)||('integer'in spec&&spec.integer&&!Number.isInteger(value)))issues.push(diagnostic('invalid_value',field,spec));
 }
 if(!Array.isArray(input.effects))issues.push(diagnostic('invalid_value','effects'));
 else{
  const seen=new Set<string>();
  input.effects.forEach((item,index)=>{
   const path=`effects[${index}]`;
   if(!object(item)){issues.push(diagnostic('invalid_value',path));return;}
   checkFields(item,ENEMY_DESIGN_VOCABULARY.fields.effects.itemFields,path,issues);
   if(!ENEMY_DESIGN_VOCABULARY.effects.some(e=>e.key===item.effect))issues.push(diagnostic('invalid_enum',`${path}.effect`,{value:item.effect,allowed:ENEMY_DESIGN_VOCABULARY.effects.map(e=>e.key)}));
   if(!ENEMY_DESIGN_VOCABULARY.requirements.some(e=>e.key===item.requirement))issues.push(diagnostic('invalid_enum',`${path}.requirement`,{allowed:ENEMY_DESIGN_VOCABULARY.requirements.map(e=>e.key)}));
   if(typeof item.effect==='string'){if(seen.has(item.effect))issues.push(diagnostic('invalid_value',path,{reason:'同一效果意图重复'}));seen.add(item.effect);}
  });
 }
 if(issues.length)throw new EnemyDesignError(issues);
 return structuredClone(input) as unknown as EnemyDesignInput;
}
export {validateInput as parseEnemyDesignInput};

export function enemyDesignPrompt():string {
 return ['提交一个语义敌人 JSON。内部 troopID/portraitID/recipeID 和族群关系不属于输入。',
 '立绘按阶级、形态和职责选择，不受法力颜色约束。classified 机械配方按阶级与主职责选取，实例充能配色独立绑定；技能内部固定颜色保留。优先同职责立绘，缺图时借用同阶级同形态的其他职责立绘。没有真实图或机械候选时分别返回诊断。必需效果严格匹配实际适配后的主动/特质，不根据源标签推测效果。',
 'assembly 设为 classified：由程序按共享分类规则选择完整原生主动和独立特质，处理稀有度、槽位与上下文约束；无需逐敌人编写。native 用于还原原生整套配置。',
 'effects 可为空数组，表示只按职责组装，不额外限定效果。随机与条件机制仍完整保留。',
 '效果表示配方具有此机制，不承诺每次触发成功；目标、概率、条件与分支保存在实际蓝图中。仅可选偏好允许未满足。',
 '剧情权重只用于叙事展示。复杂度逐项测量，五档预算尚未标定。',
 JSON.stringify(ENEMY_DESIGN_VOCABULARY,null,2),'可成功的语义示例：',JSON.stringify({...DEFAULT_ENEMY_DESIGN_INPUT,assembly:'classified'},null,2)].join('\n');
}

const metadata=new Set(['code','name','description','troops']);
const negativeStatuses=NEGATIVE_STATUS_IDS;
const controlStatuses=new Set(['silence','frozen','entangle','stun']);
const positiveStatuses=POSITIVE_STATUS_IDS;
const summonTraits=new Set(['summonOnDeath','summonOnAllyDeath','summonOnEnemyDeath','turnStartSummon','summonOnDamaged','summonOnAllyCast','onBigMatchSummon']);
const gainTraits=new Set(['regen','onDamagedGain','onSkullHitGain','onAllyCastGain','onEnemyCastGain','onEnemyDeathGain','onAllyDeathGain','onBigMatchGain','onExtraTurnGain','onAllySummonGain','onColorMatchGain']);
const auraTraits=new Set(['teamAura','typeAura','onEnemyDeathTypeAura','onAllyDeathTypeAura','onAllyCastTypeAura','onDamagedTypeAura','onBigMatchTypeAura','onColorMatchTypeAura','onEnemyCastTypeAura','battleStartTypeAura','turnStartTypeAura']);
type Evidence=EnemyDesignSignature['evidence'][number];
interface Signals {features:Set<string>;evidence:Evidence[]}
const signals=():Signals=>({features:new Set(),evidence:[]});
function add(s:Signals,effect:string,source:string,path:string,detail:string):void{s.features.add(effect);s.evidence.push({effect,source,path,detail});}
function merge(to:Signals,from:Signals):void {for(const f of from.features)to.features.add(f);to.evidence.push(...from.evidence);}
function positive(value:unknown):boolean{return typeof value==='number'&&value>0;}
function statPositive(node:Record<string,unknown>):boolean {
 if(node.full===true||node.double===true||positive(node.fraction)||node.halve===true)return true;
 if(object(node.scaling)&&(positive(node.scaling.base)||positive(node.scaling.mult)))return true;
 return !!node.modifier||!!node.rangeSpec;
}
function segmentSignals(segment:EffectSegment,path:string,priorTarget=''):Signals {
 const s=signals();if(stEffectIsProvablyUnreachable(segment))return s;
 if(segment.kind==='oneOf'||segment.kind==='choose'){
  const branches=segment.options.map((branch,index)=>sequenceSignals(branch,`${path}.options[${index}]`));
  // A branch-exclusive capability never satisfies a required intention or a role signature.
  for(const feature of branches[0]?.features??[])if(branches.every(b=>b.features.has(feature)))s.features.add(feature);
  for(const b of branches)s.evidence.push(...b.evidence.map(e=>({...e,detail:`分支证据：${e.detail}`})));
  return s;
 }
 const node=segment as unknown as Record<string,unknown>;
 const target=typeof node.target==='string'&&node.target.startsWith('last')?priorTarget:String(node.target??'');
 const enemy=target.startsWith('enemy'),ally=target.startsWith('ally'),otherAlly=ally&&target!=='allySelf';
 const put=(effect:string,detail:string)=>add(s,effect,'active',path,detail);
 if(segment.kind==='damage'&&enemy&&(statPositive(node)||segment.execute||segment.manaBurn||segment.modifiers?.length)){
  put('damage',`${target}：直接伤害`);
  if(segment.trueDamage)put('trueDamage',`${target}：绕过护甲`);
  if(segment.execute)put('execute',`${target}：处决`);
  const magicCoefficients=segment.rangeSpec?[segment.rangeSpec.min.mult,segment.rangeSpec.max.mult]:[segment.scaling.mult];
  if(magicCoefficients.some(positive))put('magicDamage',`${target}：伤害含魔力系数 ${magicCoefficients.join('～')}`);
  if(['enemyLast','enemyLastN','enemySecondLast','enemyWeakest','enemyWeakestN'].includes(target))put('backStrike',`${target}：明确后排或最弱目标`);
  if(segment.drain)put('heal','实际伤害治疗施法者');
 }
 if(segment.kind==='buff'&&ally&&statPositive(node)){
  if(segment.stat==='armor')put('armor',`${target}：增加护甲`);
  if(segment.stat==='attack'){put('attackBuff',`${target}：增加攻击`);if(otherAlly)put('teamAttack',`${target}：盟友攻击增益`);}
  if(segment.stat==='mana')put('mana',`${target}：获得法力`);
  if(segment.stat==='hp'&&segment.lifeMode!=='gain'){put('heal',`${target}：恢复生命`);if(otherAlly)put('allyHeal',`${target}：盟友治疗`);}
  if(otherAlly&&segment.stat!=='mana')put('allyBuff',`${target}：属性增益 ${segment.stat}`);
 }
 if(segment.kind==='randomStat'&&otherAlly&&statPositive(node))put('allyBuff',`${target}：随机属性增益，保留原生分配方式`);
 if(segment.kind==='randomStatus'){
  const positivePool=segment.allPositive||segment.pool==='positive'||ally;
  if(otherAlly&&positivePool)put('allyBuff',`${target}：原生正面状态池，保留随机选择及概率`);
  if(enemy&&!positivePool)put('debuff',`${target}：原生负面状态池，不保证特定状态`);
  if(ally&&segment.allPositive)put('barrier',`${target}：全体正面状态包含屏障`);
 }
 if(segment.kind==='cleanse'&&ally){put('cleanse',`${target}：净化`);if(otherAlly)put('allyCleanse',`${target}：盟友净化`);}
 if(segment.kind==='dispel'&&enemy)put('dispel',`${target}：驱散`);
 if(segment.kind==='reduce'&&enemy&&(statPositive(node)||segment.drainAll))put('debuff',`${target}：降低 ${segment.stat}`);
 if(segment.kind==='status'){
  if(ally&&segment.statusId==='barrier')put('barrier',`${target}：屏障`);
  if(otherAlly&&positiveStatuses.has(segment.statusId))put('allyBuff',`${target}：${segment.statusId}`);
  if(enemy&&negativeStatuses.has(segment.statusId))put('debuff',`${target}：${segment.statusId}`);
  if(enemy&&controlStatuses.has(segment.statusId))put('control',`${target}：${segment.statusId}`);
  if(['lycanthropy','wolf','wolf-form'].includes(segment.statusId))put('transform',`${target}：延迟狼化`);
 }
 if(segment.kind==='gem'){
  const params=segment.params as unknown as Record<string,unknown>;
  if(params.op==='create'&&statPositive({scaling:params.count,rangeSpec:params.countRange,modifier:params.modifier}))put('gemCreate','创造宝石，保留实际种类和数量');
  if(params.op==='transform')put('gemConvert','宝石转换，保留实际源色与目标色');
  if(gemProducesSkulls(segment.params))put('skullOffense','主动创造或转换出骷髅系宝石；保留原生数量、选色、条件与概率，不保证匹配或即时伤害');
  if(params.op==='clear'&&params.mode==='explode')put('gemExplode','爆破宝石');
  if(segment.params.op==='clear'&&clearCanCollectMana(segment.params))put('mana',
   segment.params.mode==='explode'?'条件供魔：爆破范围内有色宝石按颜色折半取整，area 不额外溅射；不保证颜色或数量':
    '条件供魔：摧毁目标中的有色宝石按原生规则收集法力；不保证颜色或数量');
  // Native dynamic color sources also produce six-color gems; retain their runtime target/input conditions.
   // Skull/special-only creation does not prove colored production.
  if((params.op==='create'&&s.features.has('gemCreate')||params.op==='transform'&&!params.toSpecial)&&containsBaseColor(params.op==='create'?params.gem:params.to))put('colorGem','生成六色宝石，动态颜色按原生目标和输入解析');
 }
 if(segment.kind==='summon'||segment.kind==='summonCopy')put('summon','实际召唤机制');
 if(segment.kind==='transformTroop')put('transform','实际单位变形');
 if(segment.kind==='devour'&&enemy)put('devour',`${target}：吞噬，保留原概率`);
 if(segment.kind==='extraTurn')put('extraTurn','实际额外回合效果');
 return s;
}
const manaColorSources=new Set(['CHOSEN','CASTER','ENEMY','TRACKED_ENEMY','LAST_TARGET','ENEMY_MOST_USED','ALLY_MOST_USED','CHOSEN_TARGET']);
function containsBaseColor(value:unknown):boolean {
 if(typeof value==='string')return (COLORS as readonly string[]).includes(value)||manaColorSources.has(value);
 if(Array.isArray(value))return value.some(containsBaseColor);
 return object(value)&&Object.values(value).some(containsBaseColor);
}
const skullSpecial=(kind:SpecialGemKind):boolean=>kind==='doomSkull'||kind==='uberDoomSkull';
function createsSkulls(gem:CreateGemSpec):boolean {
 switch(gem.kind){
  case 'skull':return true;
  case 'special':return skullSpecial(gem.spec.kind);
  case 'mixSpecial':return gem.specs.some(spec=>skullSpecial(spec.kind));
  case 'mixAny':return gem.entries.every(entry=>typeof entry!=='string'||entry==='SKULL'||containsBaseColor(entry))&&
   gem.entries.some(entry=>typeof entry==='string'?entry==='SKULL':skullSpecial(entry.kind));
  case 'color':case 'mix':return false; // SKULL is not a valid resolveColor endpoint for these native forms.
 }
}
function gemProducesSkulls(params:GemParams):boolean {
 if(params.op==='create'){
  const canCreate=params.countRange?Math.floor(Math.max(params.countRange.min,params.countRange.max))>0:
   statPositive({scaling:params.count,modifier:params.modifier});
  return canCreate&&createsSkulls(params.gem);
 }
 if(params.op==='transform'){
  if(params.count&&!statPositive({scaling:params.count,modifier:params.countModifier}))return false;
  if(params.toSpecial)return skullSpecial(typeof params.toSpecial==='string'?params.toSpecial:params.toSpecial.kind);
  return params.to==='SKULL'&&(params.from!=='SKULL'||params.fromSpecial!==undefined);
 }
 return false;
}
// Only intrinsic color mana and explicit explode footprints are evidence here;
// an unrelated cascade or an unclassified special trigger is not a mana promise.
const coloredSpecialFamilies=new Set<SpecialGemKind>(['dragonGem','giantGem','spiritGem','manaPotionGem','candyGem']);
function specialManaColor(kind:SpecialGemKind):boolean {
 return SPECIAL_MATCH_COLOR[kind]!==undefined||coloredSpecialFamilies.has(kind);
}
function clearCanCollectMana(params:ClearGemParams):boolean {
 if(params.mode==='remove')return false;
 const target=params.target,splash=params.mode==='explode';
 switch(target.kind){
  case 'color':return containsBaseColor(target.color);
  case 'skulls':return splash; // Skull anchors can splash onto colors; destroy alone proves no color collection.
  case 'special':return splash||specialManaColor(target.gem);
  case 'allColors':case 'allGems':case 'chosenLine':case 'chosenCross':case 'lastDestroyedLine':return true;
  case 'cell':return target.cell==='CELL'||BoardModel.inBounds(target.cell);
  case 'area':return target.center===undefined||typeof target.center==='string'||BoardModel.inBounds(target.center);
  case 'lines':return (target.rows??[]).some(row=>Number.isInteger(row)&&row>=0&&row<BoardModel.ROWS)||
   (target.cols??[]).some(col=>Number.isInteger(col)&&col>=0&&col<BoardModel.COLS);
  case 'randomLines':return statPositive({scaling:target.count,modifier:params.modifier});
  case 'randomGems':{
   // The range overrides both scaling and modifier in the native resolver.
   if(target.countRange?Math.floor(Math.max(target.countRange.min,target.countRange.max))<=0:
    !statPositive({scaling:target.count,modifier:params.modifier}))return false;
   // colors takes precedence over color; all dynamic endpoints still need runtime input.
   const colors=target.colors??(target.color===undefined?undefined:[target.color]);
   if(colors&&(!colors.length||!colors.every(containsBaseColor)))return false;
   if(target.special!==undefined){
    if(target.include==='color')return false; // Native kind filter excludes every special.
    const kinds=coloredSpecialFamilies.has(target.special)?
     COLORS.map(color=>specialGem(target.special!,undefined,color as BaseColor)):[specialGem(target.special)];
    const possible=kinds.some(gem=>{
     if(target.include==='skull'&&matchJoinKey(gem)!=='skull'||target.include==='nonSkull'&&matchJoinKey(gem)==='skull')return false;
     return !colors||colors.some(color=>manaColorSources.has(color)?
      COLORS.some(base=>isSameMatchType(gem,colorGem(base as BaseColor))):isSameMatchType(gem,colorGem(color as BaseColor)));
    });
    return possible&&(splash||specialManaColor(target.special));
   }
   if(target.include==='skull')return !colors&&splash;
   return true;
  }
 }
}
function sequenceSignals(segments:readonly EffectSegment[],path:string):Signals {
 const s=signals();let priorTarget='';
 segments.forEach((segment,index)=>{
  if(stEffectIsProvablyUnreachable(segment))return;
  merge(s,segmentSignals(segment,`${path}[${index}]`,priorTarget));
  if('target'in segment&&typeof segment.target==='string'&&!segment.target.startsWith('last'))priorTarget=segment.target;
 });return s;
}
function traitSignals(trait:TraitDefinition):Signals {
 const s=signals(),source=trait.code;
 const finitePositive=(value:unknown):value is number=>typeof value==='number'&&Number.isFinite(value)&&value>0;
 const matchPossible=(spec:Record<string,unknown>):boolean=>spec.minSize===undefined||
  typeof spec.minSize==='number'&&Number.isFinite(spec.minSize)&&spec.minSize<=BoardModel.ROWS*BoardModel.COLS;
 const matchColor=(color:unknown):boolean=>color==='skull'||COLORS.includes(color as BaseColor);
 for(const [key,value]of Object.entries(trait)){
  if(metadata.has(key)||stTraitIsProvablyUnreachable(value,key)||value===false||value===undefined)continue;
  const path=`traits.${trait.code}.${key}`,put=(effect:string,detail:string)=>add(s,effect,source,path,detail);
  // Trait spell hits use fixed amounts, not the holder's Magic or skull Attack.
  if(object(value)&&finitePositive(value.amount)){
   let target='';
   if(key==='onBigMatchDamage'&&matchPossible(value)&&typeof value.scope==='string'&&['randomEnemy','enemyAll','lastEnemy'].includes(value.scope))target=value.scope;
   if(key==='onColorMatchDamage'&&matchColor(value.color)&&
    (value.scope===undefined||typeof value.scope==='string'&&['randomEnemy','allEnemies'].includes(value.scope)))target=value.scope===undefined?'randomEnemy':value.scope as string;
   if(key==='onSkullDamagedEnemyDamage')target='enemyAll';
   if(key==='onAllyCastEnemyDamage'&&typeof value.scope==='string'&&['randomEnemy','enemyAll'].includes(value.scope))target=value.scope;
   if(target){
    put('damage',`${key}：条件触发，对 ${target} 造成 ${value.amount} 点普通伤害`);
    if(target==='lastEnemy')put('backStrike',`${key}：明确末位存活敌人`);
   }
   if(key==='turnStartStealLife'||key==='onColorMatchDrain'&&matchColor(value.color)||key==='onBigMatchDrainLife'&&matchPossible(value)){
    put('damage',`${key}：条件触发，对首位存活敌人窃取 ${value.amount} 点生命`);
    put('trueDamage',`${key}：窃命伤害绕过护甲；按实际失血增长自身生命及上限`);
   }
  }
  if(['onBigMatchKill','onSkullHitKill','onEnemyDeathKill'].includes(key)&&object(value)&&
   value.scope==='lastEnemy'&&finitePositive(value.chance)&&(key!=='onBigMatchKill'||matchPossible(value))){
   put('damage',`${key}：条件触发，对末位存活敌人概率处决，概率 ${value.chance}`);
   put('execute',`${key}：原生概率处决；保留触发条件与致死免疫判定`);
   put('backStrike',`${key}：明确末位存活敌人`);
  }
  if(['skullDamageReduction','spellDamageReduction'].includes(key)&&positive(value))put('damageReduction',`${key}：${value}`);
  if(key==='manaLink'&&object(value)&&positive(value.amount))put('mana','匹配法力链接');
  if(key==='onSelfDeathFillAllyMana'&&value===true)put('mana','实际阵亡触发盟友供魔');
  if(gainTraits.has(key)&&object(value)&&positive(value.amount)){
   const stats=[value.stat,...(Array.isArray(value.alsoStats)?value.alsoStats:[])];
   if(stats.includes('armor'))put('armor',`${key}：护甲增益`);
   if(stats.includes('attack'))put('attackBuff',`${key}：攻击增益`);
   // Only native regeneration restores missing HP; ordinary hp gains increase the maximum.
   if(key==='regen'&&stats.includes('hp'))put('heal',`${key}：回合开始恢复生命`);
  }
  if(key==='onColorMatchGains'&&Array.isArray(value)){
   for(const gain of value)if(object(gain)&&positive(gain.amount)){
    if(gain.stat==='armor')put('armor',`${key}：匹配 ${gain.color} 获得护甲`);
    if(gain.stat==='attack')put('attackBuff',`${key}：匹配 ${gain.color} 获得攻击`);
   }
  }
  if(['onSkullHitDevour','onSkullDamagedDevour','onEnemyDeathDevour'].includes(key)&&object(value)&&positive(value.chance))put('devour',`${key}：条件触发吞噬，概率 ${value.chance}`);
  if(auraTraits.has(key)&&object(value)&&value.scope!=='enemies'){
   const gains=object(value.gains)?value.gains:{};
   if(positive(value.amount)||Object.values(gains).some(positive))put('allyBuff',`${key}：实际盟友光环或触发增益`);
   if(value.stat==='attack'&&positive(value.amount)||positive(gains.attack))put('teamAttack',`${key}：盟友攻击增益`);
  }
  if(['onDamagedStatus','turnStartStatus','battleStartStatus','onBigMatchStatus','onColorMatchStatus','onAllyCastStatus','onEnemyCastStatus','onEnemyDeathStatus'].includes(key)&&object(value)&&value.chance!==0){
   const scope=String(value.target??value.scope??'self');
   const hostile=['randomEnemy','allEnemies','enemyAll','enemies','firstEnemy','front','lastEnemy'].includes(scope);
   const friendly=['self','randomAlly','allAllies','allies'].includes(scope);
   // Random pools do not prove any one specific status in the pool.
   const statuses=value.randomPositive||value.randomNegative||value.randomMissingStatusCount?[]:
    Array.isArray(value.statuses)?value.statuses.map(status=>object(status)?String(status.id??''):''):[String(value.statusId??value.id??'')];
   for(const id of statuses){
    if(friendly&&id==='barrier')put('barrier',`${key}：${scope} 屏障`);
    if(friendly&&scope!=='self'&&positiveStatuses.has(id))put('allyBuff',`${key}：${scope} ${id}`);
    if(hostile&&negativeStatuses.has(id))put('debuff',`${key}：敌方 ${id}`);
    if(hostile&&controlStatuses.has(id))put('control',`${key}：敌方 ${id}`);
   }
   if(friendly&&scope!=='self'&&value.randomPositive)put('allyBuff',`${key}：盟友随机正面状态`);
  }
  if(['onBigMatchCleanse','onColorMatchCleanse'].includes(key)&&object(value)){put('cleanse',`${key}：实际净化`);put('allyCleanse',`${key}：实际盟友净化`);}
  if(['inflictOnSkullHit','onDamagedEnemyStatus','inflictOnSkullDamaged','turnStartEnemyStatus'].includes(key)&&object(value)){
   const id=String(value.id??value.statusId??'');
   if(negativeStatuses.has(id))put('debuff',`${key}：敌方 ${id}`);
   if(controlStatuses.has(id))put('control',`${key}：敌方 ${id}`);
  }
  if(summonTraits.has(key)&&object(value)&&value.chance!==0&&!value.storm)put('summon',`${key}：实际召唤触发`);
  if(['turnStartExplodeGem','onSkullHitExplodeGem','onColorMatchExplodeGem','onBigMatchExplodeGem'].includes(key)&&object(value)&&positive(value.count))put('gemExplode',`${key}：实际爆破触发`);
  if(['turnStartCreateGem','onDeathCreateGem','onDamagedCreateGem','onBigMatchCreateGem'].includes(key)&&object(value)&&positive(value.count)){
   put('gemCreate',`${key}：实际造石触发`);if(containsBaseColor(value))put('colorGem',`${key}：明确六色造石`);
  }
  if(['skullDamageFromArmorRatio','skullMultVsWounded','skullMultVsPoisoned'].includes(key)&&positive(value))put('skullOffense',`${key}：明确骷髅进攻`);
  if(key==='skullMultVsStatus'||key==='skullMultVsStatusList'){
   const entries=key==='skullMultVsStatus'?[value]:Array.isArray(value)?value:[];
   for(const entry of entries)if(object(entry)&&typeof entry.status==='string'
    &&(negativeStatuses.has(entry.status)||positiveStatuses.has(entry.status))
    &&typeof entry.mult==='number'&&Number.isFinite(entry.mult)&&entry.mult>1){
    put('skullOffense',`${key}：目标已有 ${entry.status} 时骷髅伤害 ×${entry.mult}；不施加该状态，不保证条件成立或即时伤害`);
   }
  }
 }
 return s;
}
/** Remove shadowed trait fields using the existing native passive compiler.
 * The working copy is only semantic evidence: executable modules stay intact.
 * Iterating backwards retains the first contributor when identical fields tie.
 * Direct executor fields stay intact; only aggregate-backed fields are pruned.
 * Rechecking the full aggregate preserves native first/longest/strongest/union
 * rules without maintaining a second list of stacking rules in the assembler.
 */
function effectiveSignatureTraits(traits:readonly TraitDefinition[]):TraitDefinition[] {
 const effective=traits.map(trait=>({...trait}));
 if(effective.length<2)return effective;
 const ids=effective.map((_,index)=>String(index));
 const compiled=()=>stableJson(resolvePassives(ids,id=>effective[Number(id)]));
 const original=compiled(),neutral=stableJson(resolvePassives([]));
 for(let index=effective.length-1;index>=0;index--){
  for(const key of Object.keys(effective[index]!).filter(key=>!metadata.has(key)).reverse()){
   const before=effective[index]!;
   // Some triggers read trait definitions directly in the native executor.
   // Only aggregate-backed fields can be proven shadowed by resolvePassives.
   const isolated:TraitDefinition={code:before.code,name:before.name,description:before.description,[key]:before[key as keyof TraitDefinition]};
   if(stableJson(resolvePassives(['isolated'],()=>isolated))===neutral)continue;
   effective[index]={...before,[key]:undefined};
   if(compiled()!==original)effective[index]=before;
  }
 }
 return effective;
}
/** Conservative capability classification of the ordered, effective composition. */
export function inspectEnemyDesignSignature(prototype:SkillPrototype,traits:readonly TraitDefinition[]):EnemyDesignSignature {
 const found=sequenceSignals(prototype.segments,'active.segments');for(const trait of effectiveSignatureTraits(traits))merge(found,traitSignals(trait));
 const roles=ENEMY_DESIGN_VOCABULARY.roles.filter(role=>role.groups.every(group=>group.some(feature=>found.features.has(feature))));
 return {roles:roles.map(r=>r.key),effects:ENEMY_DESIGN_VOCABULARY.effects.filter(e=>found.features.has(e.key)).map(e=>e.key),
  evidence:found.evidence,explanation:roles.map(r=>roleRules[r.key].description)};
}
export function measureEnemyDesignComplexity(prototype:SkillPrototype,traits:readonly TraitDefinition[]):EnemyDesignComplexity {
 let effectSegments=0,branchCount=0,conditionalCount=0;
 function visit(value:unknown):void {
  if(Array.isArray(value)){value.forEach(visit);return;}if(!object(value))return;
  for(const [key,child]of Object.entries(value)){
   if(['ifCond','ifTargetDied','chance','chanceBoost','condMult','condBonus','raceDouble'].includes(key))conditionalCount++;
   if(!metadata.has(key))visit(child);
  }
 }
 function segments(items:readonly EffectSegment[]):void{
  for(const segment of items){effectSegments++;if(segment.kind==='oneOf'||segment.kind==='choose'){branchCount+=segment.options.length;for(const branch of segment.options)segments(branch);}}
 }
 segments(prototype.segments);visit(prototype);traits.forEach(visit);
 return {activeCount:1,traitCount:traits.length,effectSegments,branchCount,conditionalCount,
  traitMechanisms:traits.reduce((sum,trait)=>sum+Object.keys(trait).filter(k=>!metadata.has(k)).length,0),
  calibration:'uncalibrated',notes:[ENEMY_DESIGN_VOCABULARY.complexity.description,'保留全部嵌套效果与原生叠加规则；测量计数不代表已标定的战力评分。']};
}
function stableIndex(seed:number,namespace:string,length:number):number {
 const text=`${seed}:${namespace}`;let hash=2166136261;for(let i=0;i<text.length;i++)hash=Math.imul(hash^text.charCodeAt(i),16777619);return (hash>>>0)%length;
}
interface TraitComponent {code:string;rarity:number;features:Set<string>}
let traitComponents:TraitComponent[]|undefined;
function classifiedTraitComponents():TraitComponent[] {
 if(traitComponents)return traitComponents;
 const rarityByCode=new Map<string,number>();
 for(const troop of TROOPS)for(const trait of troop.traits)rarityByCode.set(trait.code,Math.min(rarityByCode.get(trait.code)??Infinity,troop.rarityIdx));
 traitComponents=[];
 for(const [code,rarity]of [...rarityByCode].sort(([a],[b])=>a.localeCompare(b))){
  try{
   const trait=adaptedTrait(code);if(!trait||traitEconomyIssues(trait).length)continue;
   if(inspectEnemyMechanisms({segments:[]},[trait]).unknown.length)continue;
   traitComponents.push({code,rarity,features:traitSignals(trait).features});
  }catch{/* Unavailable modules remain visible as gaps in the automatic catalog report. */}
 }
 return traitComponents;
}
/** Exact semantic set-cover over classified trait patterns, bounded by actual native slots. */
function assembleTraitChoices(troop:TroopData,prototype:SkillPrototype,design:EnemyDesignInput,seed:number):string[][] {
 const native=troop.traits.flatMap(tr=>adaptedTrait(tr.code)?[tr.code]:[]);
 const role=roleRules[design.role as keyof typeof roleRules];
 const groups:readonly (readonly string[])[]=[...design.effects.map(effect=>[effect.effect]),...role.groups];
 const maskOf=(features:Set<string>)=>groups.reduce((mask,group,index)=>group.some(feature=>features.has(feature))?mask|2**index:mask,0);
 const activeMask=maskOf(sequenceSignals(prototype.segments,'active.segments').features);
 const patterns=new Map<number,string[]>();
 for(const component of classifiedTraitComponents()){
  if(component.rarity>troop.rarityIdx)continue;
  const mask=maskOf(component.features);if(!mask)continue;
  patterns.set(mask,[...(patterns.get(mask)??[]),component.code]);
 }
 const options=[...patterns].map(([mask,codes])=>({mask,code:codes[stableIndex(seed,'trait-pattern:'+troop.rarityIdx+':'+mask,codes.length)]!}));
 // One representative per semantic state and minimal slot count suffices for reachability.
 // Other fields are preserved verbatim and checked on the assembled result below.
 let states=new Map<number,string[]>([[activeMask,[]]]);
 for(let slot=0;slot<troop.traits.length;slot++){
  const next=new Map(states);
  for(const [mask,codes]of states)for(const option of options){
   if(codes.includes(option.code))continue;
   const combined=mask|option.mask;if(combined===mask)continue;
   const picked=[...codes,option.code],existing=next.get(combined);
   if(!existing||picked.length<existing.length)next.set(combined,picked);
  }
  if(next.size===states.size)break;
  states=next;
 }
 const choices=[native];
 for(const codes of states.values()){
  choices.push(codes);
  choices.push([...codes,...native.filter(code=>!codes.includes(code))].slice(0,troop.traits.length));
 }
 const seen=new Set<string>();return choices.filter(codes=>{const key=stableJson(codes);if(seen.has(key))return false;seen.add(key);return true;});
}
function primaryTaskFeatures(prototype:SkillPrototype,traits:TraitDefinition[]):string[] {
 const found=sequenceSignals(prototype.segments,'active.segments');
 for(const trait of effectiveSignatureTraits(traits))merge(found,traitSignals(trait));
 return [...found.features];
}
/** Independent trait draws are grouped by capability so repeated source codes do not amplify a family. */
function weightedTraitChoices(troop:TroopData,prototype:SkillPrototype,design:EnemyDesignInput,seed:number):string[][] {
 const native=troop.traits.flatMap(tr=>adaptedTrait(tr.code)?[tr.code]:[]);
 const base=primaryTaskFeatures(prototype,native.map(code=>adaptedTrait(code)!));
 const groups=new Map<string,ReturnType<typeof classifiedTraitComponents>>();
 for(const component of classifiedTraitComponents()){
  if(component.rarity>troop.rarityIdx)continue;
  const key=[...component.features].sort().join('|');
  groups.set(key,[...(groups.get(key)??[]),component]);
 }
 const choices=[native,[]];
 for(let variant=0;variant<5;variant++){
  const rng=enemySelectionRng(seed,`traits:${troop.id}:${variant}`),codes:string[]=[];
  for(let slot=0;slot<native.length;slot++){
   const available=[...groups.values()].map(g=>g.filter(c=>!codes.includes(c.code))).filter(g=>g.length);
   if(!available.length)break;
   const group=pickEnemyWeighted(available,g=>enemyRoleAffinity(design.role,[...g[0]!.features]),rng);
   codes.push(pickEnemyWeighted(group,()=>1,rng).code);
  }
  choices.push(codes);
 }
 // Legacy explicit intentions may add reachable combinations, but never change the source primary role.
 if(design.effects.length)choices.push(...assembleTraitChoices(troop,prototype,design,seed));
 const seen=new Set<string>();
 return choices.filter(codes=>{
  const key=stableJson(codes);if(seen.has(key))return false;seen.add(key);
  const actual=primaryTaskFeatures(prototype,codes.map(code=>adaptedTrait(code)!));
  return stableJson(codes)===stableJson(native)||primaryTaskPreserved(design.role,base,actual);
 });
}
interface Candidate {troop:TroopData;signature:EnemyDesignSignature;traits:TraitDefinition[];prototype:SkillPrototype;blueprint:EnemyBlueprint;profile?:EnemyAssemblyProfile}
export interface EnemyDesignCompileOptions {seed:number;externalId:string;budgetPolicy?:EnemyBudgetPolicy;statVariationSeed?:number;generationPool?:EnemyGenerationPool}
interface GenerationContext {teamColors?:string[];previous?:EnemyAssemblyProfile[]}
function chooseWeightedCandidate(candidates:Candidate[],design:EnemyDesignInput,seed:number,context:GenerationContext):{candidate:Candidate;groupWeight:number;recipeWeight:number} {
 const rng=enemySelectionRng(seed,'weighted-recipe');
 const groups=new Map<string,Map<number,Candidate[]>>();
 for(const candidate of candidates){
  const key=candidate.profile!.groupKey,spells=groups.get(key)??new Map<number,Candidate[]>();
  spells.set(candidate.troop.spell.id,[...(spells.get(candidate.troop.spell.id)??[]),candidate]);groups.set(key,spells);
 }
 const weight=(c:Candidate)=>enemyProfileWeight(c.profile!,design.rank,context.teamColors)*(1+design.effects.filter(e=>e.requirement==='preferred'&&c.signature.effects.includes(e.effect)).length);
 // Average per unique active: neither duplicate sources nor more trait variants inflate its weight.
 const recipeWeight=(variants:Candidate[])=>variants.reduce((n,c)=>n+weight(c),0)/variants.length;
 const groupWeight=(spells:Map<number,Candidate[]>)=>[...spells.values()].reduce((n,c)=>n+recipeWeight(c),0)/spells.size;
 const group=pickEnemyWeighted([...groups.values()],groupWeight,rng);
 const variants=pickEnemyWeighted([...group.values()],recipeWeight,rng);
 return {candidate:pickEnemyWeighted(variants,weight,rng),groupWeight:groupWeight(group),recipeWeight:recipeWeight(variants)};
}
/** All real candidates remain in the search. Rejections carry source-specific reasons, never denominator edits. */
export function compileEnemyDesign(input:unknown,options:EnemyDesignCompileOptions):CompiledEnemyDesign {
 return compileEnemyDesignInternal(input,options,false,{});
}
function compileEnemyDesignInternal(input:unknown,options:EnemyDesignCompileOptions,legacy:boolean,context:GenerationContext,legacyArtwork=false,generationVersion:1|2=ENEMY_ASSEMBLY_POLICY_VERSION):CompiledEnemyDesign {
 const design=validateInput(!legacy&&object(input)?{...input,effects:input.effects===undefined?[]:input.effects,assembly:input.assembly??'classified'}:input);
 if(!object(options)||!Number.isSafeInteger(options.seed))return fail('invalid_value','seed',{reason:'需要安全整数种子'});
 const pool=options.generationPool??'ordinary';
 if(pool!=='ordinary'&&pool!=='special')return fail('invalid_value','generationPool');
 if(options.statVariationSeed!==undefined&&!Number.isSafeInteger(options.statVariationSeed))return fail('invalid_value','statVariationSeed',{reason:'需要安全整数种子'});
 if(typeof options.externalId!=='string'||!options.externalId.trim())return fail('invalid_value','externalId');
 const budgetPolicy=options.budgetPolicy===undefined?undefined:validateEnemyBudgetPolicy(options.budgetPolicy);
 const independentMana=!legacy&&generationVersion===2&&design.assembly==='classified';
 const castingColors=independentMana?colorKey(design.manaColors).split(','):design.manaColors;
 const query={...(legacyArtwork?{manaColors:design.manaColors}:{}),rank:design.rank,form:design.form,role:design.role};
 let portraits=findPortraits(query).sort((a,b)=>a.assetId.localeCompare(b.assetId));
 // Mechanical role stays fixed; artwork may use the same rank and shape when no matching visual role exists.
 if(!portraits.length&&independentMana)portraits=findPortraits({rank:design.rank,form:design.form}).sort((a,b)=>a.assetId.localeCompare(b.assetId));
 if(!portraits.length){
  const otherDimensions={...(legacyArtwork?{manaColors:design.manaColors}:{}),rank:query.rank,role:query.role};
  const availableForms=[...new Set(findPortraits(otherDimensions).map(p=>p.form))];
  return fail('no_exact_match','form',{query,availableForms});
 }
 // Artwork and mechanics use separate seed namespaces; recipe morphology never changes the selected artwork.
 const entry=portraits[stableIndex(options.seed,'portrait',portraits.length)]!;
 const portrait=savePortrait({...query,...(entry.role!==design.role?{role:entry.role}:{})},entry);
 // Source artwork roles describe that artwork, not every capability of its full mechanical recipe.
 const indexed=new Set(PORTRAITS.filter(p=>p.rank===design.rank&&(!legacyArtwork||colorKey(p.manaColors)===colorKey(design.manaColors))).map(p=>p.troopId));
 const required=design.effects.filter(e=>e.requirement==='required').map(e=>e.effect);
 const preferred=design.effects.filter(e=>e.requirement==='preferred').map(e=>e.effect);
 const candidates:Candidate[]=[],rejected:{recipeId:string;diagnostics:EnemyDesignDiagnostic[]}[]=[];
 let registry:ExtensionRegistry|undefined;
 for(const troop of TROOPS.filter(t=>indexed.has(t.id)&&(independentMana||colorKey(t.manaColors)===colorKey(design.manaColors))&&(legacy||t.role===design.role)).sort((a,b)=>a.id-b.id)){
  let selections:(string[]|undefined)[]=[undefined];
  if(design.assembly==='classified'){
   try{selections=(legacy?assembleTraitChoices:weightedTraitChoices)(troop,adaptedPrototype(troop.spell.id),design,options.seed);}
   catch(error){rejected.push({recipeId:`enemy:${troop.id}`,diagnostics:[diagnostic('mechanism_unavailable','assembly',{reason:error instanceof Error?error.message:String(error)})]});continue;}
  }
  for(const selectedTraits of selections){
  const issues:EnemyDesignDiagnostic[]=[];
  let stage:'adaptation'|'compile'|'availability'='adaptation';
  try{
   const prototype=adaptedPrototype(troop.spell.id);
   const traits=(selectedTraits??troop.traits.map(tr=>tr.code)).flatMap(code=>{const adapted=adaptedTrait(code);return adapted?[adapted]:[];});
   if(selectedTraits){const rules=inspectEnemyMechanisms(prototype,traits);if(rules.unknown.length)issues.push(diagnostic('mechanism_unavailable','assembly',{reasons:rules.unknown}));}
   const signature=inspectEnemyDesignSignature(prototype,traits);
   const missing=required.filter(effect=>!signature.effects.includes(effect));
   if(missing.length)issues.push(diagnostic('required_effect_unavailable','effects',{missing,actual:signature.effects}));
   if(legacy&&!signature.roles.includes(design.role))issues.push(diagnostic('role_signature_mismatch','role',{requested:design.role,actual:signature.roles,evidence:signature.evidence}));
   const profile=legacy?undefined:profileEnemyAssembly(independentMana?{...troop,manaColors:castingColors as TroopData['manaColors']}:troop,prototype,traits,signature.effects,generationVersion);
   if(profile){
    const policyIssues=[...enemyGenerationIssues(profile,design.rank,pool,generationVersion),...enemyTeamGenerationIssues([...(context.previous??[]),profile],generationVersion)];
    if(policyIssues.length)issues.push(diagnostic('mechanism_unavailable','assembly',{reasons:policyIssues}));
    signature.roles=[design.role];signature.explanation=[primaryRoleDescriptions[design.role]!];
   }
   const economics=[...prototypeEconomyIssues(prototype),...traits.flatMap(tr=>traitEconomyIssues(tr))];
   if(economics.length)issues.push(diagnostic('mechanism_unavailable','effects',{reasons:economics}));
   if(!prototype.segments.length)issues.push(diagnostic('mechanism_unavailable','effects',{reason:'主动原型为空'}));
   if(!issues.length){
    stage='compile';
    const blueprint=compileEnemyBlueprint({portrait,...(design.name!==undefined||design.race!==undefined?{presentation:{...(design.name!==undefined?{name:design.name}:{}),...(design.race!==undefined?{race:design.race}:{})}}:{}),recipeTroopId:troop.id,...(selectedTraits?{assembly:{...(independentMana?{version:2 as const,manaColors:[...castingColors]}:{version:1 as const}),activeTroopId:troop.id,traitCodes:selectedTraits}}:{}),externalId:options.externalId,level:design.level,difficulty:design.difficulty,...(options.statVariationSeed!==undefined?{statVariationSeed:options.statVariationSeed}:{})});
    // Reuse the existing reachable-form/economy policy, including nested branches and delayed transformations.
    stage='availability';
    if(!registry){registry=new ExtensionRegistry();registerAdaptedCatalog(registry);}
    validateStDerivedForms({schemaVersion:BATTLE_SCHEMA_VERSION,rulesetVersion:RULESET_VERSION,battleId:'semantic-design',requestId:'semantic-design',seed:options.seed,playerTeam:[],enemyTeam:[blueprint.snapshot]},registry);
    const budget=evaluateEnemyBudget([blueprint.snapshot],budgetPolicy);
    if(budget.issues.length)issues.push(diagnostic('power_budget_exceeded','budgetPolicy',{budget}));
    else candidates.push({troop,signature,traits,prototype,blueprint,...(profile?{profile}:{})});
   }
  }catch(error){issues.push(diagnostic(stage==='compile'?'compilation_failed':'mechanism_unavailable','effects',{reason:error instanceof Error?error.message:String(error)}));}
  if(issues.length)rejected.push({recipeId:`enemy:${troop.id}`,diagnostics:issues});
  }
 }
 if(!candidates.length){
  const codes=[...new Set(rejected.flatMap(r=>r.diagnostics.map(d=>d.code)))];
  throw new EnemyDesignError((codes.length?codes:['mechanism_unavailable'] as const).map(code=>diagnostic(code,code==='role_signature_mismatch'?'role':code==='power_budget_exceeded'?'budgetPolicy':'effects',{query,required,requested:design.role,rejected,reasons:[...new Set(rejected.flatMap(r=>r.diagnostics.filter(d=>d.code===code).map(d=>d.message)))]})));
 }
 const score=(candidate:Candidate)=>preferred.filter(effect=>candidate.signature.effects.includes(effect)).length*10+(design.assembly==='classified'?candidate.traits.length:0);
 const best=Math.max(...candidates.map(score)),preferredCandidates=candidates.filter(c=>score(c)===best);
 const weighted=legacy?undefined:chooseWeightedCandidate(candidates,design,options.seed,context);
 const picked=weighted?.candidate??preferredCandidates[stableIndex(options.seed,'recipe',preferredCandidates.length)]!;
 const {blueprint,signature,prototype,traits}=picked;
 const diagnostics:EnemyDesignDiagnostic[]=[diagnostic('complexity_uncalibrated','rank')];
 for(const effect of preferred.filter(effect=>!signature.effects.includes(effect)))diagnostics.push(diagnostic('preferred_effect_unmet','effects',{effect}));
 if(blueprint.omittedMechanisms.length)diagnostics.push(diagnostic('mechanism_omitted','effects',{omitted:blueprint.omittedMechanisms}));
 const result:Omit<CompiledEnemyDesign,'integrity'>={version:ENEMY_DESIGN_VERSION,rulesetVersion:RULESET_VERSION,design,seed:options.seed,externalId:options.externalId,blueprint,signature,
  ...(!legacy?{generation:{version:generationVersion,pool,primaryRole:design.role,profile:picked.profile!,context,groupKey:picked.profile!.groupKey,groupWeight:weighted!.groupWeight,recipeWeight:weighted!.recipeWeight}}:{}),
  selection:{portraitAssetId:blueprint.portrait.assetId,recipeId:blueprint.recipeId,abilityId:blueprint.abilityId,traitIds:[...(blueprint.snapshot.traitIds??[])]},
  complexity:measureEnemyDesignComplexity(prototype,traits),diagnostics,...(budgetPolicy?{budget:assertEnemyBudget([blueprint.snapshot],budgetPolicy)}:{})};
 return {...result,integrity:contentFingerprint(result)};
}
// Consistency fingerprint, not an authenticity or anti-cheat boundary. Includes narrative-only fields and the seed.
function contentFingerprint(value:unknown):string {
 const text=stableJson(value);let a=2166136261,b=5381;
 for(let i=0;i<text.length;i++){a=Math.imul(a^text.charCodeAt(i),16777619);b=Math.imul(b,33)^text.charCodeAt(i);}
 return `enemy-design:v1:${(a>>>0).toString(16).padStart(8,'0')}${(b>>>0).toString(16).padStart(8,'0')}`;
}
/** Recompile from semantic inputs and compare every field, including extra keys and nested audit data. */
export function restoreEnemyDesign(value:unknown):CompiledEnemyDesign {
 if(!object(value)||value.version!==ENEMY_DESIGN_VERSION||value.rulesetVersion!==RULESET_VERSION)return fail('invalid_save','version');
 let canonical:CompiledEnemyDesign;
 try{canonical=compileEnemyDesignInternal(value.design,{...(object(value.generation)?{generationPool:value.generation.pool as EnemyGenerationPool}:{}),seed:value.seed as number,externalId:value.externalId as string,...(object(value.blueprint)&&value.blueprint.statVariationSeed!==undefined?{statVariationSeed:value.blueprint.statVariationSeed as number}:{}),...(value.budget?{budgetPolicy:(value.budget as EnemyBudgetEvaluation).policy??undefined}:{})},!value.generation,object(value.generation)&&object(value.generation.context)?value.generation.context as GenerationContext:{},object(value.blueprint)&&object(value.blueprint.portrait)&&object(value.blueprint.portrait.query)&&value.blueprint.portrait.query.manaColors!==undefined,object(value.generation)&&value.generation.version===2?2:1);}
 catch(error){return fail('invalid_save','design',{reason:error instanceof Error?error.message:String(error)});}
 if(stableJson(value)!==stableJson(canonical))return fail('invalid_save','design',{reason:'全字段与当前语义编译结果不一致'});
 return canonical;
}


/** Validate and assemble the entire semantic encounter before host preparation creates any battle. */
export function compileEnemyEncounterDesigns(input:unknown,seed:number):CompiledEnemyDesign[] {
 if(!Array.isArray(input)||input.length<1||input.length>4)throw new Error('敌方阵容需要 1 至 4 名成员');
 if(!Number.isSafeInteger(seed))throw new Error('遭遇种子需要填写整数');
 return compileEnemyEncounterPlan(input,{seed}).members;
}

export interface CompiledEnemyEncounterPlan {members:CompiledEnemyDesign[];budget:EnemyBudgetEvaluation}
/** Check the selected complete roster. A failed team budget reports actual values without changing designs or scaling. */
export function compileEnemyEncounterPlan(input:unknown,options:{seed:number;budgetPolicy?:EnemyBudgetPolicy}):CompiledEnemyEncounterPlan {
 if(!Array.isArray(input)||input.length<1||input.length>4)throw new Error('敌方阵容需要 1 至 4 名成员');
 if(!object(options)||!Number.isSafeInteger(options.seed))throw new Error('遭遇种子需要填写整数');
 const policy=options.budgetPolicy===undefined?undefined:validateEnemyBudgetPolicy(options.budgetPolicy);
 const members:CompiledEnemyDesign[]=[];
 const teamColors=[...new Set(input.flatMap(d=>object(d)&&Array.isArray(d.manaColors)?d.manaColors.filter((c):c is string=>typeof c==='string'):[]))];
 for(const [index,design] of input.entries())members.push(compileEnemyDesignInternal(design,{seed:stableIndex(options.seed,'encounter:'+index,0x100000000),externalId:'enemy-'+(index+1),statVariationSeed:stableIndex(options.seed,'stat-variation:'+index,0x100000000),...(policy?{budgetPolicy:policy}:{})},false,{teamColors,previous:members.map(m=>m.generation!.profile)}));
 const budget=assertEnemyBudget(members.map(member=>member.blueprint.snapshot),policy);
 return {members,budget};
}
