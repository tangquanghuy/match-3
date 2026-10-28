import {describe,it,expect} from 'vitest';
import {TROOPS,getTroopById} from '../../src/data/troops';
import {troopStatsAtLevel} from '../../src/data/leveling';
import {BaseColor} from '../../src/engine/types';
import {BATTLE_SCHEMA_VERSION,RULESET_VERSION} from '../../src/session/contract';
import type {BattleRequest} from '../../src/session/contract';
import {compileEnemyBlueprint} from '../../src/sillytavern/enemyBlueprint';
import type {EnemyBlueprint} from '../../src/sillytavern/enemyBlueprint';
import {FORMATION_VERSION,buildEnemyFormation,restoreEnemyFormation,summarizeEnemyFormation} from '../../src/sillytavern/enemyFormation';
import type {EnemyFormation} from '../../src/sillytavern/enemyFormation';
import {PORTRAITS,savePortrait,colorKey} from '../../src/sillytavern/portraits';
import type {PortraitEntry} from '../../src/sillytavern/portraits';
import {stEnvironmentScaling} from '../../src/sillytavern/environmentScaling';
import {prepareStBattle} from '../../src/sillytavern/battleRuntime';
import {combatantPower,teamPower} from '../../src/meta/systems/combatPower';
import {EnemyBudgetError} from '../../src/sillytavern/enemyBudget';
import type {EnemyBudgetPolicy} from '../../src/sillytavern/enemyBudget';

function blueprint(p:PortraitEntry=PORTRAITS[0]!,level=20,difficulty=1,recipeTroopId=p.troopId):EnemyBlueprint {
 return compileEnemyBlueprint({portrait:savePortrait({manaColors:p.manaColors,rank:p.rank,form:p.form,role:p.role},p),recipeTroopId,externalId:`original-${p.troopId}`,level,difficulty});
}
function objects(value:unknown):Set<object>{
 const found=new Set<object>();
 const visit=(v:unknown):void=>{if(v&&typeof v==='object'&&!found.has(v)){found.add(v);Object.values(v).forEach(visit);}};
 visit(value);return found;
}
const jsonClone=<T>(value:T):T=>JSON.parse(JSON.stringify(value)) as T;

 describe('ST ordered complete enemy formations',()=>{
 it.each([1,2,3,4])('compiles %i members with canonical position identities and preserves complete designs',count=>{
  const input=Array.from({length:count},(_,i)=>blueprint(PORTRAITS[i]!,7+i*11,1+i*.2));const before=jsonClone(input);
  const formation=buildEnemyFormation(input);
  expect(formation.version).toBe(FORMATION_VERSION);expect(formation.rulesetVersion).toBe(RULESET_VERSION);
  expect(formation.members).toHaveLength(count);
  formation.members.forEach((member,index)=>{
   const original=input[index]!;
   expect(member).toEqual(compileEnemyBlueprint({portrait:original.portrait,recipeTroopId:Number(original.recipeId.slice(6)),externalId:`enemy-${index+1}`,level:original.level,difficulty:original.difficulty}));
  });
  expect(input).toEqual(before);
 });
 it('retains a separately selected compatible portrait and recipe instead of replacing the recipe with the portrait source',()=>{
  const pair=PORTRAITS.flatMap(p=>{const recipe=PORTRAITS.find(q=>q.troopId!==p.troopId&&q.rank===p.rank&&q.role===p.role&&colorKey(q.manaColors)===colorKey(p.manaColors));return recipe?[{p,recipe}]:[];})[0]!;
  expect(pair).toBeDefined();
  const original=blueprint(pair.p,31,1.4,pair.recipe.troopId);const [member]=buildEnemyFormation([original]).members;
  expect(member!.portrait).toEqual(original.portrait);expect(member!.portrait.troopId).not.toBe(Number(member!.recipeId.slice(6)));
  expect(member!.recipeId).toBe(original.recipeId);expect(member!.recipeSignature).toBe(original.recipeSignature);expect(member!.abilityId).toBe(original.abilityId);
  expect(member!.level).toBe(31);expect(member!.difficulty).toBe(1.4);expect(member!.snapshot.portraitUrl).toBe(original.snapshot.portraitUrl);
 });
 it('allows repeated sources and fully isolates every member from the source and its siblings',()=>{
  const source=blueprint();const formation=buildEnemyFormation([source,source,source,source]);const original=jsonClone(source);
  expect(new Set(formation.members.map(m=>m.sourceId)).size).toBe(1);
  const groups=[objects(source),...formation.members.map(objects)];
  for(let i=0;i<groups.length;i++)for(let j=i+1;j<groups.length;j++)expect([...groups[i]!].some(v=>groups[j]!.has(v))).toBe(false);
  const siblings=jsonClone(formation.members.slice(1));formation.members[0]!.snapshot.stats.hp++;
  formation.members[0]!.snapshot.manaColors.push(BaseColor.Brown);formation.members[0]!.portrait.query.manaColors!.push('Brown');
  formation.members[0]!.context.affinities.push('changed');formation.members[0]!.omittedMechanisms.push('changed');
  expect(source).toEqual(original);expect(formation.members.slice(1)).toEqual(siblings);
 });
 it('keeps input order and reassigns positions after reordering existing formation members',()=>{
  const a=blueprint(PORTRAITS[0]!);const b=blueprint(PORTRAITS[1]!);const first=buildEnemyFormation([a,b]);
  const reversed=buildEnemyFormation([...first.members].reverse());
  expect(reversed.members.map(m=>m.recipeId)).toEqual([b.recipeId,a.recipeId]);
  expect(reversed.members.map(m=>m.snapshot.externalId)).toEqual(['enemy-1','enemy-2']);
  expect(reversed.members[0]!.snapshot.name).toContain('enemy-1');expect(first.members[0]!.recipeId).toBe(a.recipeId);
 });
 it.each([0,5])('rejects a formation of %i members',count=>{
  const member=blueprint();expect(()=>buildEnemyFormation(Array(count).fill(member))).toThrow('1 至 4');
 });
 it('rejects malformed or sparse member arrays rather than skipping holes',()=>{
  const member=blueprint();
  for(const input of [null,{},[member,null],new Array(2)])expect(()=>buildEnemyFormation(input as EnemyBlueprint[])).toThrow();
 });
 it.each([1,2,3,4])('restores a JSON-persisted canonical %i-member formation as a detached clone',count=>{
  const formation=buildEnemyFormation(Array.from({length:count},(_,i)=>blueprint(PORTRAITS[i]!)));const saved=jsonClone(formation);
  const restored=restoreEnemyFormation(saved);expect(restored).toEqual(formation);
  const refs=objects(saved);expect([...objects(restored)].some(v=>refs.has(v))).toBe(false);
  restored.members[0]!.snapshot.stats.hp++;restored.members[0]!.snapshot.manaColors.push(BaseColor.Brown);
  expect(saved).toEqual(formation);
 });
 it.each([null,[],{}, {version:0,rulesetVersion:RULESET_VERSION,members:[]}, {version:FORMATION_VERSION,rulesetVersion:'old',members:[]}])('rejects malformed formation metadata: %j',value=>{
  expect(()=>restoreEnemyFormation(value)).toThrow();
 });
 it('rejects missing, empty and oversized persisted member lists',()=>{
  const member=buildEnemyFormation([blueprint()]).members[0]!;
  for(const members of [undefined,[],Array(5).fill(member)])expect(()=>restoreEnemyFormation({version:FORMATION_VERSION,rulesetVersion:RULESET_VERSION,members})).toThrow('1 至 4');
 });
 it.each([0,1,2,3])('atomically rejects corruption at position %i without editing the supplied formation',position=>{
  const saved=jsonClone(buildEnemyFormation(Array(4).fill(blueprint())));saved.members[position]!.snapshot.stats.hp++;
  const before=jsonClone(saved);expect(()=>restoreEnemyFormation(saved)).toThrow('变更');expect(saved).toEqual(before);
 });
 const corruptions:[string,(member:EnemyBlueprint)=>void][]=[
  ['version',m=>{m.version=0 as typeof m.version;}],['ruleset',m=>{m.rulesetVersion='old';}],
  ['portrait',m=>{m.portrait.contentHash='changed';}],['recipe',m=>{m.recipeSignature='changed';}],
  ['level',m=>{m.level=101;}],['difficulty',m=>{m.difficulty=.09;}],
  ['ability',m=>{m.snapshot.skillId='st:7037';}],['traits',m=>{m.snapshot.traitIds!.push('st:goldenhoard');}],
  ['budget',m=>{m.budget.manaCost++;}],['context',m=>{m.context.affinities.push('changed');}],
  ['audit',m=>{m.descriptionAudit.support='changed' as typeof m.descriptionAudit.support;}],
  ['omissions',m=>{m.omittedMechanisms.push('changed');}],
 ];
 it.each(corruptions)('rejects edited complete member field %s',(_name,corrupt)=>{
  const saved=buildEnemyFormation([blueprint()]);corrupt(saved.members[0]!);expect(()=>restoreEnemyFormation(saved)).toThrow();
 });
 it('rejects canonical blueprints saved in the wrong positions rather than silently normalizing the backup',()=>{
  const saved=buildEnemyFormation([blueprint(),blueprint(PORTRAITS[1]!)]);saved.members.reverse();const before=jsonClone(saved);
  expect(()=>restoreEnemyFormation(saved)).toThrow('站位');expect(saved).toEqual(before);
  const wrongId:EnemyFormation={version:FORMATION_VERSION,rulesetVersion:RULESET_VERSION,members:[blueprint()]};
  expect(()=>restoreEnemyFormation(wrongId)).toThrow('站位');
 });
 it('compares every canonical formation field while ignoring JSON object key order',()=>{
  const saved=buildEnemyFormation([blueprint()]);
  expect(()=>restoreEnemyFormation({...saved,extra:true})).toThrow('配置');
  const incomplete=jsonClone(saved);delete (incomplete.members[0] as Partial<EnemyBlueprint>).budget;
  expect(()=>restoreEnemyFormation(incomplete)).toThrow();
  expect(restoreEnemyFormation({members:saved.members,rulesetVersion:saved.rulesetVersion,version:saved.version})).toEqual(saved);
 });
});

describe('ST enemy formation base panel summary',()=>{
 it('sums real leveled base stats and mana costs without adding passive bonuses or an invented power score',()=>{
  const formation=buildEnemyFormation([blueprint(PORTRAITS[0]!,1,.8),blueprint(PORTRAITS[1]!,31,1.4),blueprint(PORTRAITS[0]!,77,1.1)]);
  const summary=summarizeEnemyFormation(formation);const expected={hp:0,armor:0,attack:0,magic:0};let manaCost=0;
  for(const member of formation.members){
   const troop=getTroopById(Number(member.recipeId.slice(6)))!;const base=troopStatsAtLevel(troop,member.level);
   expected.hp+=Math.max(1,Math.round(base.health*member.difficulty));expected.armor+=Math.round(base.armor*member.difficulty);
   expected.attack+=Math.round(base.attack*member.difficulty);expected.magic+=Math.round(base.magic*member.difficulty);manaCost+=troop.manaCost;
  }
  expect(summary.stats).toEqual(expected);expect(summary.manaCost).toBe(manaCost);expect(summary.memberCount).toBe(3);
  expect(Object.keys(summary).sort()).toEqual(['budget','colors','environment','manaCost','memberCount','stats']);
 });
 it('sorts colors by the project color order and reports each matching position once, starting at one',()=>{
  const red=PORTRAITS.find(p=>p.manaColors.includes('Red')&&p.manaColors.includes('Brown'))!;
  const blue=PORTRAITS.find(p=>p.manaColors.includes('Blue')&&!p.manaColors.includes('Red'))!;
  expect(red).toBeDefined();expect(blue).toBeDefined();const formation=buildEnemyFormation([blueprint(red),blueprint(blue),blueprint(red)]);
  const summary=summarizeEnemyFormation(formation);
  // Independent explicit order, including repeated sources and multi-color units.
  const expected=['Red','Blue','Green','Yellow','Purple','Brown'].map(color=>({color,positions:formation.members.flatMap((m,i)=>m.snapshot.manaColors.some(c=>c===color)?[i+1]:[])})).filter(c=>c.positions.length);
  expect(summary.colors).toEqual(expected);expect(summary.colors.find(c=>c.color==='Red')!.positions).toEqual([1,3]);
  expect(summary.colors.find(c=>c.color==='Brown')!.positions).toContain(3);
 });
 it('uses the shared stable mean scaling, rounding only the mean level upwards',()=>{
  const formation=buildEnemyFormation([blueprint(PORTRAITS[0]!,1,1.1),blueprint(PORTRAITS[1]!,94,1.8),blueprint(PORTRAITS[2]!,20,1)]);
  const summary=summarizeEnemyFormation(formation);expect(summary.environment.level).toBe(39);expect(summary.environment.difficulty).toBeCloseTo(1.3);
  expect(summary.environment).toEqual(stEnvironmentScaling({playerTeam:[],enemyTeam:formation.members.map(m=>m.snapshot)}).enemy);
  const reordered=buildEnemyFormation([...formation.members].reverse());expect(summarizeEnemyFormation(reordered).environment).toEqual(summary.environment);
  expect(summarizeEnemyFormation(restoreEnemyFormation(jsonClone(formation)))).toEqual(summary);
 });
 it('isolates summary arrays, positions, stats and environment from saved members and later summaries',()=>{
  const formation=buildEnemyFormation([blueprint(),blueprint()]);const before=jsonClone(formation);const summary=summarizeEnemyFormation(formation);const expected=jsonClone(summary);
  summary.colors[0]!.positions.push(99);summary.colors.push({color:'changed',positions:[99]});summary.stats.hp=0;summary.environment.level=100;
  expect(formation).toEqual(before);expect(summarizeEnemyFormation(formation)).toEqual(expected);
 });
});

describe('ST formation persistence keeps the full economic design',()=>{
 it.each(['active','soulverdict','goldenhoard'])('stores the actual restricted %s recipe but still fails formal battle preparation',kind=>{
  const troop=TROOPS.find(t=>(kind==='active'?t.spell.id===7037:t.traits.some(tr=>tr.code===kind))&&PORTRAITS.some(p=>p.troopId===t.id))!;
  expect(troop).toBeDefined();const portrait=PORTRAITS.find(p=>p.troopId===troop.id)!;const original=blueprint(portrait);
  const formation=restoreEnemyFormation(jsonClone(buildEnemyFormation([original,original])));
  expect(formation.members).toHaveLength(2);expect(summarizeEnemyFormation(formation).memberCount).toBe(2);
  for(const member of formation.members){
   expect(member.snapshot.skillId).toBe(original.snapshot.skillId);expect(member.snapshot.traitIds).toEqual(original.snapshot.traitIds);
   expect(member.omittedMechanisms).toEqual(original.omittedMechanisms);expect(member.budget).toEqual(original.budget);
  }
  if(kind==='active')expect(formation.members[0]!.snapshot.skillId).toBe('st:7037');
  else expect(formation.members[0]!.snapshot.traitIds).toContain(`st:${kind}`);
  const request:BattleRequest={schemaVersion:BATTLE_SCHEMA_VERSION,rulesetVersion:RULESET_VERSION,battleId:'restricted-design',requestId:'restricted-design-request',seed:42,
   playerTeam:[{externalId:'hero',name:'主角',stats:{hp:100,armor:0,attack:10,magic:7},manaColors:[BaseColor.Blue],manaCost:3,skillId:'gw_KnightsSword'}],enemyTeam:formation.members.map(m=>m.snapshot)};
  const before=jsonClone(formation);expect(()=>prepareStBattle(request)).not.toThrow();expect(formation).toEqual(before);
 });
});


describe('ST formation explicit native reference power budgets',()=>{
 it('keeps legacy formation JSON unchanged and measures final snapshots without a policy',()=>{
  const formation=buildEnemyFormation([blueprint(PORTRAITS[0]!,7,1.3),blueprint(PORTRAITS[1]!,49,1.6)]);
  expect(Object.keys(formation).sort()).toEqual(['members','rulesetVersion','version']);
  expect(restoreEnemyFormation(jsonClone(formation))).toEqual(formation);
  const report=summarizeEnemyFormation(formation).budget;
  expect(report.status).toBe('measured');expect(report.policy).toBeNull();expect(report.calibration).toBe('uncalibrated');
  expect(report.members.map(member=>member.power)).toEqual(formation.members.map(member=>combatantPower(member.snapshot)));
  expect(report.totalPower).toBe(teamPower(formation.members.map(member=>member.snapshot)));
 });
 it('accepts exact member and team limits, persists an isolated policy and preserves every native panel and trait',()=>{
  const members=[blueprint(PORTRAITS[0]!,7,1.3),blueprint(PORTRAITS[1]!,49,1.6)],before=jsonClone(members);
  const powers=members.map(member=>combatantPower(member.snapshot));
  const policy:EnemyBudgetPolicy={version:1,id:'formation-boundary',maxMemberPower:Math.max(...powers),maxTeamPower:powers.reduce((a,b)=>a+b,0),maxMembers:2};
  const formation=buildEnemyFormation(members,policy),restored=restoreEnemyFormation(jsonClone(formation));
  expect(restored).toEqual(formation);expect(restored.budgetPolicy).toEqual(policy);
  expect(summarizeEnemyFormation(restored).budget.status).toBe('within-budget');
  formation.members.forEach((member,index)=>{expect(member.snapshot.stats).toEqual(before[index]!.snapshot.stats);expect(member.snapshot.traitIds).toEqual(before[index]!.snapshot.traitIds);});
  expect(members).toEqual(before);policy.maxTeamPower=0;
  expect(formation.budgetPolicy!.maxTeamPower).toBeGreaterThan(0);
  restored.budgetPolicy!.maxTeamPower=0;expect(formation.budgetPolicy!.maxTeamPower).toBeGreaterThan(0);
 });
 it('retains the policy across adding, removing and reordering complete members',()=>{
  const a=blueprint(PORTRAITS[0]!),b=blueprint(PORTRAITS[1]!);
  const policy:EnemyBudgetPolicy={version:1,id:'formation-edits',maxTeamPower:combatantPower(a.snapshot)+combatantPower(b.snapshot),maxMembers:2};
  const first=buildEnemyFormation([a],policy);
  const added=buildEnemyFormation([...first.members,b],first.budgetPolicy);
  const reordered=buildEnemyFormation([...added.members].reverse(),added.budgetPolicy);
  const removed=restoreEnemyFormation(jsonClone(buildEnemyFormation(reordered.members.slice(1),reordered.budgetPolicy)));
  expect([first,added,reordered,removed].map(formation=>formation.budgetPolicy)).toEqual(Array(4).fill(policy));
  expect(reordered.members.map(member=>member.recipeId)).toEqual([b.recipeId,a.recipeId]);
  expect(removed.members[0]!.snapshot.externalId).toBe('enemy-1');
  expect(()=>buildEnemyFormation([...added.members,a],added.budgetPolicy)).toThrow(EnemyBudgetError);
 });
 it.each(['member','team'] as const)('rejects %s power overflow at construction and restore without changing the prior formation',kind=>{
  const source=blueprint(PORTRAITS[0]!,49,1.6),power=combatantPower(source.snapshot);
  const policy:EnemyBudgetPolicy={version:1,id:'overflow',...(kind==='member'?{maxMemberPower:power-1}:{maxTeamPower:power-1})};
  const before=jsonClone(source);expect(()=>buildEnemyFormation([source],policy)).toThrow(EnemyBudgetError);expect(source).toEqual(before);
  const saved={...buildEnemyFormation([source]),budgetPolicy:policy},original=jsonClone(saved);
  try{restoreEnemyFormation(saved);throw new Error('expected budget rejection');}catch(error){
   expect(error).toBeInstanceOf(EnemyBudgetError);
   const issue=(error as EnemyBudgetError).evaluation.issues[0]!;
   expect(issue.actual).toBe(power);expect(issue.limit).toBe(power-1);expect(issue.path).toBe(kind==='member'?'enemyTeam[0]':'enemyTeam');
  }
  expect(saved).toEqual(original);
 });
 it.each([{version:1,id:'invalid',maxTeamPower:-1},{version:1,id:'invalid',maxTeamPower:1.5},{version:1,id:'invalid',maxTeamPower:1000,extra:true}])('rejects malformed persisted budget policies: %j',policy=>{
  const saved={...buildEnemyFormation([blueprint()]),budgetPolicy:policy};expect(()=>restoreEnemyFormation(saved)).toThrow('预算');
 });
});
