import type {EffectSegment,SkillPrototype} from '../engine/skills/prototypes';
import type {TraitDefinition} from '../engine/traits';
import {isTargetCondition} from '../engine/skills/effects/secondary';

const chanceGatedTraitGems=new Set(['turnStartCreateSpecialGem','turnStartColorToSpecial','battleStartConvertGems','onBigMatchCreateGem']);
const object=(value:unknown):value is Record<string,unknown>=>!!value&&typeof value==='object'&&!Array.isArray(value);

/** The same static gates as runSegment. Dynamic boosts and devour remain conservative. */
export function stEffectIsProvablyUnreachable(segment:EffectSegment):boolean {
 if(segment.kind==='choose')return false; // Selected branches replace choose before execution.
 if(segment.kind!=='devour'&&typeof segment.chance==='number'&&segment.chance<=0&&!segment.chanceBoost)return true;
 return !!segment.ifCond&&isTargetCondition(segment.ifCond)&&!('target'in segment);
}

/** Known trait gem producers use an unboosted probability gate in the runtime. */
export function stTraitGemIsProvablyUnreachable(value:unknown,key:string):boolean {
 return chanceGatedTraitGems.has(key)&&object(value)&&typeof value.chance==='number'&&value.chance<=0;
}

/** Match named trait runtime gates; never treat arbitrary nested chance fields as gates. */
export function stTraitIsProvablyUnreachable(value:unknown,key:string):boolean {
 if(stTraitGemIsProvablyUnreachable(value,key))return true;
 // applyBigMatchTriggers rolls once at entry, or per status for independent randomEnemy.
 // Other independent scopes bypass both probability gates in the current runtime.
 return key==='onBigMatchStatus'&&object(value)&&typeof value.chance==='number'&&value.chance<=0
   &&(!value.independentChance||value.scope==='randomEnemy');
}

/** Ordinary in-battle resources use the native executor, pools and caps.
 * Availability does not require a skill to create and consume resources itself:
 * matches, allies, enemies, traits and derived forms can supply a later cast.
 * Persistent grants are owned by ST settlement, never by this preflight.
 */
export function prototypeEconomyIssues(_prototype:SkillPrototype):string[] {
 return [];
}

/** Native PvP end payouts are a separate, currently unsupported settlement path. */
export function traitEconomyIssues(trait:TraitDefinition,options:{mode?:'pvp'}={}):string[] {
 return options.mode==='pvp'&&trait.pvpEconomyGain?['竞技对战战后货币结算']:[];
}
