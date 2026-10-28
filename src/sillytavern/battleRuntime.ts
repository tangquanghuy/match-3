import {stEnvironmentScaling} from './environmentScaling';
import {PlayerSide} from '../engine/types';
import {validateStDerivedForms} from './derivedFormPreflight';
import {ExtensionRegistry} from '../engine/registry';
import {setSummonTemplateResolver,implementedTraitIds,dynamicTraitCodes} from '../engine/traits';
import type {TurnEngine} from '../engine/TurnEngine';
import {validateBattleRequest,formatValidationIssues} from '../session/validateRequest';
import type {BattleRequest} from '../session/contract';
import {registerAdaptedCatalog,registerStSkillLibrary,resolveAdaptedSummon,adaptedSummonPool,ADAPTED_AFFINITIES} from './enemyBlueprint';

function registeredStSnapshot(request:BattleRequest):ExtensionRegistry {
 const registry=new ExtensionRegistry();registerStSkillLibrary(registry.prototypes);registerAdaptedCatalog(registry);
 const allowedTypes=new Set(ADAPTED_AFFINITIES);
 const checked=validateBattleRequest(request,{knownSkillIds:new Set(registry.prototypes.keys()),knownTraitIds:new Set([...implementedTraitIds(),...dynamicTraitCodes()]),knownTroopTypes:allowedTypes});
 if(!checked.ok)throw new Error(formatValidationIssues(checked.issues));
 return registry;
}
/** Read persisted snapshots without applying today's battle availability policy. */
export function validateStBattleSnapshot(request:BattleRequest):void {registeredStSnapshot(request);}

export function prepareStBattle(request:BattleRequest):{registry:ExtensionRegistry;configureEngine:(engine:TurnEngine)=>void}{
 const registry=registeredStSnapshot(request);
 validateStDerivedForms(request,registry);
 const environmentScaling=stEnvironmentScaling(request);
 const deathResolver:Parameters<typeof setSummonTemplateResolver>[0]=(spec,owner)=>resolveAdaptedSummon(spec.referenceName,owner?.battleScaling);
 // Legacy callers also need death resolution before constructing the engine.
 // Pass configureEngine as TurnEngine's initialization callback for all opening effects.
 setSummonTemplateResolver(deathResolver);
 return {registry,configureEngine(engine){
   engine.enableEconomyAudit();
   engine.setSummonResolver((ref,source)=>resolveAdaptedSummon(ref,source?.battleScaling));
   engine.setSummonKingdomResolver(adaptedSummonPool);
   engine.setDaemonPool(adaptedSummonPool('Daemon'));
   engine.setEnvironmentSummonResolver((ref,side)=>resolveAdaptedSummon(ref,environmentScaling[side===PlayerSide.Left?'player':'enemy']));
   engine.setBeastPool(adaptedSummonPool('Beast'));
   setSummonTemplateResolver(deathResolver);
 }};
}
