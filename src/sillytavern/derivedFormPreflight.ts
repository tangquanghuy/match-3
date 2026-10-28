import type {BattleRequest} from '../session/contract';
import type {ExtensionRegistry} from '../engine/registry';
import type {SummonTemplate} from '../engine/skills/effects/summon';
import type {EffectSegment} from '../engine/skills/prototypes';
import {getTrait} from '../engine/traits';
import {adaptedSummonPool,resolveAdaptedSummon} from './enemyBlueprint';
import {stEnvironmentScaling} from './environmentScaling';
import {prototypeEconomyIssues,traitEconomyIssues,stEffectIsProvablyUnreachable,stTraitIsProvablyUnreachable} from './economyAvailability';

type Side='player'|'enemy';
type Scaling={level:number;difficulty:number};
type Form={skillId?:string;spellName?:string;traitIds?:string[];battleScaling?:Scaling};
type State={form:Form;side:Side;scaling:Scaling;source:string};
type Rule={side:Side;ref:string;source:string};
const fallback:Scaling={level:20,difficulty:1};
const summonKeys=new Set(['summonOnDeath','summonOnAllyDeath','summonOnEnemyDeath','turnStartSummon','summonOnDamaged','summonOnAllyCast','onBigMatchSummon']);
const other=(side:Side):Side=>side==='player'?'enemy':'player';
const scaleKey=(s:Scaling)=>`${s.level}/${s.difficulty}`;
const object=(v:unknown):v is Record<string,unknown>=>!!v&&typeof v==='object'&&!Array.isArray(v);
const effectLabels:Readonly<Record<string,string>>={summon:'召唤',transformTroop:'变形',summonCopy:'复制召唤',status:'状态效果',randomStatus:'随机状态',oneOf:'随机分支'};
const metadata=new Set(['name','description','code','troops','displayName','spellName','spellDescription','traitNames']);

/**
 * Walk reachable forms before consuming a battle ticket. No RNG, roster mutation or stat caps.
 * Rules are re-applied when copies introduce a new scaling on a side; cycles terminate by
 * side + ability/traits + scaling. This validates template and economy availability, not behavioral coverage.
 */
export function validateStDerivedForms(request:BattleRequest,registry:ExtensionRegistry):void {
 const environmentScaling=stEnvironmentScaling(request);
 const queue:State[]=[];
 const seen=new Set<string>();
 const scales:Record<Side,Map<string,Scaling>>={player:new Map(),enemy:new Map()};
 const rules=new Map<string,Rule>();
 const copies=new Map<string,{from:Side;to:Side;source:string}>();
 const templates=new Map<string,SummonTemplate>();
 const states:Record<Side,State[]>={player:[],enemy:[]};
 function enqueue(form:Form,side:Side,scaling:Scaling,source:string):void {
   const key=JSON.stringify([side,form.skillId,form.traitIds??[],scaleKey(scaling)]);
   if(seen.has(key))return;
   seen.add(key);queue.push({form,side,scaling,source});
 }
 function resolve(ref:string,side:Side,scaling:Scaling,source:string):void {
   const key=`${ref}@${scaleKey(scaling)}`;
   let template=templates.get(key);
   if(!template){
     try {
       const result=resolveAdaptedSummon(ref,scaling);
       if(!result)throw new Error(`派生来源 ${ref} 尚未登记`);
       template=result;templates.set(key,template);
     }catch(error){throw new Error(`${source} → ${ref}（等级 ${scaling.level}，难度 ×${scaling.difficulty}）：${error instanceof Error?error.message:String(error)}。请在开战前调整配置。`);}
   }
   enqueue(template,side,scaling,`${source} · 派生候选「${template.name}」`);
 }
 function addRule(refs:readonly string[],side:Side,source:string):void {
   for(const ref of refs){
     const key=`${side}:${ref}`;
     if(rules.has(key))continue;
     const rule={side,ref,source};rules.set(key,rule);
     for(const scaling of scales[side].values())resolve(ref,side,scaling,source);
   }
 }
 function addCopy(from:Side,to:Side,source:string):void {
   if(from===to||copies.has(`${from}:${to}`))return;
   copies.set(`${from}:${to}`,{from,to,source});
   for(const state of states[from])enqueue(state.form,to,state.scaling,source);
 }
 function targetSides(target:unknown,owner:Side):Side[]{
   if(typeof target==='string'){
     if(target.startsWith('ally'))return [owner];
     if(target.startsWith('enemy'))return [other(owner)];
   }
   return ['player','enemy']; // last-target selectors depend on preceding segment state.
 }
 function environment(value:unknown,source:string):void {
   if(value==='daemonicPortalGem')for(const side of ['player','enemy'] as const)
     for(const ref of adaptedSummonPool('Daemon'))resolve(ref,side,environmentScaling[side],`${source} · 传送门召唤`);
   if(value==='lycanthropyGem')
     for(const side of ['player','enemy'] as const)addRule(adaptedSummonPool('Beast'),side,`${source} · 延迟变形`);
 }
 function visitSegment(segment:EffectSegment,state:State):void {
   // Match runSegment gates only on effects, never on trait/rule/parameter objects.
   // choose is expanded before execution; devour rolls per target with chanceMult.
   if(stEffectIsProvablyUnreachable(segment))return;
   if(segment.kind==='oneOf'||segment.kind==='choose'){
     const {options,...gates}=segment;
     // oneOf evaluates its own condition/boost; choose is expanded before these gates.
     if(segment.kind==='oneOf')visit(gates,state);
     for(const branch of options)for(const child of branch)visitSegment(child,state);
     return;
   }
   visit(segment,state);
 }
 function visit(value:unknown,state:State,key=''):void {
   if(metadata.has(key)||key==='statusImmunities'||key==='skullMultVsStatus'||key==='skullMultVsStatusList')return;
   if(stTraitIsProvablyUnreachable(value,key))return;
   if(Array.isArray(value)){for(const item of value)visit(item,state,key);return;}
   if(!object(value)){environment(value,state.source);return;}
   const source=`${state.source} · ${typeof value.kind==='string'?effectLabels[value.kind]??'派生效果':'派生效果'}`;
   if((value.kind==='status'&&['lycanthropy','wolf','wolf-form'].includes(String(value.statusId)))
     ||((key.endsWith('Status')||key.endsWith('statuses'))&&['lycanthropy','wolf','wolf-form'].includes(String(value.id??value.statusId))))
     for(const side of targetSides(value.target,state.side))addRule(adaptedSummonPool('Beast'),side,`${source} · 延迟变形`);
   // Big-match randomNegative/randomMissingStatusCount sample only the declared statuses above.
   // Cast-triggered random statuses instead use the runtime global negative pool (includes wolf).
   if(key==='onAllyCastRandomStatus'&&value.scope==='randomEnemy')addRule(adaptedSummonPool('Beast'),other(state.side),source);
   if(value.kind==='summon'&&object(value.params)&&object(value.params.source)){
     const src=value.params.source;
     if(typeof src.ref==='string')resolve(src.ref,state.side,state.scaling,source);
     else if(Array.isArray(src.randomOf)){for(const ref of src.randomOf)if(typeof ref==='string')resolve(ref,state.side,state.scaling,source);}
     else if(typeof src.randomOfKingdom==='string'||typeof src.randomOfKingdom==='number')
       for(const ref of adaptedSummonPool(src.randomOfKingdom))resolve(ref,state.side,state.scaling,source);
     if(object(src.template)){
       const template=src.template as unknown as SummonTemplate;
       enqueue(template,state.side,template.battleScaling??fallback,source);
     }
   }
   if(value.kind==='transformTroop'){
     if(typeof value.copyOf==='string'){
       for(const from of targetSides(value.copyOf,state.side))for(const to of targetSides(value.target,state.side))addCopy(from,to,source);
     }else{
       const refs=typeof value.ref==='string'?[value.ref]:Array.isArray(value.randomOf)?value.randomOf.filter((r):r is string=>typeof r==='string'):[];
       if(value.target==='allySelf')for(const ref of refs)resolve(ref,state.side,state.scaling,source);
       else for(const side of targetSides(value.target,state.side))addRule(refs,side,source);
     }
   }
   if(value.kind==='summonCopy')for(const from of targetSides(value.target,state.side))addCopy(from,state.side,source);
   // Enemy random-status pools include delayed Beast transformation.
   if(value.kind==='randomStatus'&&value.pool!=='positive'&&!value.allPositive&&targetSides(value.target,state.side).includes(other(state.side)))
     addRule(adaptedSummonPool('Beast'),other(state.side),`${source} · 随机状态变形`);
   if(summonKeys.has(key)&&!value.storm&&value.chance!==0&&typeof value.referenceName==='string')resolve(value.referenceName,state.side,state.scaling,source);
   for(const [childKey,child]of Object.entries(value))visit(child,state,childKey);
 }
 for(const side of ['player','enemy'] as const)for(const form of side==='player'?request.playerTeam:request.enemyTeam)
   enqueue(form,side,form.battleScaling??fallback,`${side==='player'?'我方':'敌方'}「${form.name}」`);
 function rejectEconomy(issues:readonly string[],source:string):void {
   if(issues.length)throw new Error(`${source}：该能力或派生候选含尚未适配的战斗经济效果（${issues.join('、')}），请调整配置。`);
 }
 function ruleGem(gem:unknown,source:string):void {
   visit(gem,{form:{},side:'player',scaling:fallback,source});
 }
 // Match the runtime rule gates; never remove candidates from the request or registry.
 for(const preset of request.rules?.board?.preset??[])ruleGem(preset.gem,'战场规则 · 开局宝石');
 const drops=request.rules?.board?.specialDrops;
 if(drops&&drops.chance>0){
   const total=drops.pool.reduce((sum,entry)=>sum+Math.max(0,entry.weight),0);
   // Gravity uses the final entry when every weight is zero.
   for(const entry of total>0?drops.pool.filter(entry=>entry.weight>0):drops.pool.slice(-1))ruleGem(entry.gem,'战场规则 · 自然掉落');
 }
 for(const entry of request.rules?.turnStart??[])for(const spec of entry.createGems??[])
   if(spec.chance===undefined||spec.chance>0)ruleGem(spec.gem,'战场规则 · 回合开始宝石');
 for(let cursor=0;cursor<queue.length;cursor++){
   const state=queue[cursor]!;states[state.side].push(state);
   if(!scales[state.side].has(scaleKey(state.scaling))){
     scales[state.side].set(scaleKey(state.scaling),state.scaling);
     for(const rule of rules.values())if(rule.side===state.side)resolve(rule.ref,state.side,state.scaling,rule.source);
   }
   for(const copy of copies.values())if(copy.from===state.side)enqueue(state.form,copy.to,state.scaling,copy.source);
   if(state.form.skillId){
     const prototype=registry.prototypes.get(state.form.skillId);
     if(!prototype?.segments.length)throw new Error(`${state.source}：派生主动 ${state.form.skillId} 尚未登记，请在开战前调整配置。`);
     const source=`${state.source} · 主动能力${state.form.spellName?`「${state.form.spellName}」`:''}`;
     rejectEconomy(prototypeEconomyIssues(prototype),source);
     for(const segment of prototype.segments)visitSegment(segment,{...state,source});
   }
   for(const id of state.form.traitIds??[]){
     const trait=getTrait(id);
     if(!trait)throw new Error(`${state.source}：派生特质 ${id} 尚未登记，请在开战前调整配置。`);
     const source=`${state.source} · 特质「${trait.name}」`;
     rejectEconomy(traitEconomyIssues(trait,{mode:request.mode}),source);
     visit(trait,{...state,source});
   }
 }
}
