interface Observation {
  seed: number;
  observed?: boolean;
  errors: string[];
  status: string;
  eventTypes?: string[];
  eventCount?: number;
  presentation?: ReturnType<typeof planPresentation>;
  finalState?: ReturnType<typeof traitFixture>['state']['state'];
}
// @ts-expect-error node types are not installed in this browser project
import fs from 'node:fs';
import { it, expect } from 'vitest';
import { TRAIT_CASES, TRAIT_HOLDER_CASES, traitFixture, snapshot } from '../helpers/traitAcceptanceFixtures';
import { getTrait } from '../../src/engine/traits';
import { TROOPS } from '../../src/data/troops';
import { inspectBoardEventContract } from '../helpers/boardEventContract';
import { planPresentation } from '../helpers/presentationBudget';

it('executes every troop x trait mechanism, with individual natural-seed observation and event contracts', () => {
 const rows=TRAIT_HOLDER_CASES.map(c=>{
  const attempts: {seed:number;observed:boolean}[]=[];
  let chosen: (typeof c & Observation) | undefined;
  for(const seed of [42,1,2,3,4,5,7,9,13,17,23,31,47,61,79,97]){
   try{
    const f=traitFixture(c,seed),control=traitFixture(c,seed,true);
    const board=c.scenario==='startup'?f.startupBoard:f.state.board.clone();
    const events=f.run(),baseline=control.run();
    const observed=JSON.stringify({events,state:snapshot(f.state)})!==JSON.stringify({events:baseline,state:snapshot(control.state)});
    const errors=inspectBoardEventContract(board,events,f.state.board);
    chosen={...c,seed,observed,errors,eventTypes:[...new Set(events.map(e=>e.type))],eventCount:events.length,
     presentation:planPresentation(events),finalState:f.state.state,
     status:['mode-unwired','unmapped'].includes(c.scenario)?c.scenario:observed?'effect-observed':'not-observed'};
    attempts.push({seed,observed});
    if(observed||['mode-unwired','unmapped'].includes(c.scenario))break;
   }catch(e){chosen={...c,seed,observed:false,status:'fixture-error',errors:[String(e)]};break;}
  }
  if (!chosen) throw new Error('No trait fixture was executed');
      return {...chosen,attempts,name:getTrait(c.code)?.name,description:getTrait(c.code)?.description,users:[c.troopId]};
 });
 const report={generatedAt:new Date().toISOString(),scope:'Every troop holding every referenced mechanism gets its own key, natural-seed/control fixture and browser review item. Fixture stats/colors/types are targeted preconditions, not ordinary balance or co-trigger semantic approval.',
  summary:{troops:new Set(rows.map(r=>r.troopId)).size,traits:new Set(rows.map(r=>r.code)).size,mechanisms:TRAIT_CASES.length,contexts:rows.length,
   observed:rows.filter(r=>r.observed).length,unobserved:rows.filter(r=>r.status==='not-observed').length,
   modeUnwiredContexts:rows.filter(r=>r.status==='mode-unwired').length,
   modeUnwiredMechanisms:new Set(rows.filter(r=>r.status==='mode-unwired').map(r=>r.mechanismKey)).size,
   unmapped:rows.filter(r=>r.status==='unmapped').length,errors:rows.filter(r=>r.errors.length).length},rows};
 fs.mkdirSync('artifacts/troop-audit',{recursive:true});
 fs.writeFileSync('artifacts/troop-audit/trait-contexts.json',JSON.stringify(report,null,2));
 expect(new Set(rows.map(r=>r.key)).size).toBe(rows.length);
 expect(new Set(rows.map(r=>r.troopId)).size).toBe(TROOPS.filter(t=>t.traits.length).length);
 for(const troop of TROOPS)for(const trait of troop.traits){
  const expected=TRAIT_CASES.filter(c=>c.code===trait.code).map(c=>c.field).sort();
  expect(rows.filter(r=>r.troopId===troop.id&&r.code===trait.code).map(r=>r.field).sort()).toEqual(expected);
 }
 expect(rows.filter(r=>r.errors.length||r.status==='unmapped'||r.status==='not-observed')).toEqual([]);
},300000);
