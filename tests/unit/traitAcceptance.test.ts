// @ts-expect-error node types are not installed in this project
import fs from 'node:fs';
import { describe,it,expect } from 'vitest';
import { TRAIT_CASES,traitFixture,snapshot } from '../helpers/traitAcceptanceFixtures';
import { getTrait } from '../../src/engine/traits';
import { TROOPS } from '../../src/data/troops';
import { inspectBoardEventContract } from '../helpers/boardEventContract';
import { planPresentation } from '../helpers/presentationBudget';

describe('exhaustive referenced-trait trigger inventory',()=>{
  it('executes a targeted fixture and control for EVERY definition field, retains unobserved cases as gaps',()=>{
    const rows=TRAIT_CASES.map(c=>{
      const attempts=[];
      let chosen:any;
      // Searching real seeded outcomes avoids changing production RNG/chance semantics.
      for(const seed of [42,1,2,3,4,5,7,9,13,17,23,31,47,61,79,97]){
        try {
          const f=traitFixture(c,seed), control=traitFixture(c,seed,true);
          const presentationBoard=c.scenario==='startup'?f.startupBoard:f.state.board.clone();
          const events=f.run(),controlEvents=control.run();
          const boardErrors=inspectBoardEventContract(presentationBoard,events,f.state.board);
          const after=snapshot(f.state), baseline=snapshot(control.state);
          const observed=JSON.stringify({events,after})!==JSON.stringify({events:controlEvents,after:baseline});
          chosen={...c,seed,observed,eventTypes:[...new Set(events.map(e=>e.type))],eventCount:events.length,
            presentation:planPresentation(events),finalState:f.state.state,
            status: ['mode-unwired','unmapped'].includes(c.scenario)?c.scenario:observed?'effect-observed':'not-observed',
            errors:boardErrors};
          attempts.push({seed,observed});
          if(observed || ['mode-unwired','unmapped'].includes(c.scenario))break;
        }catch(e){ chosen={...c,seed,status:'fixture-error',errors:[String(e)]};break; }
      }
      return {...chosen,attempts,name:getTrait(c.code)?.name,description:getTrait(c.code)?.description,
        users:TROOPS.filter(t=>t.traits.some(x=>x.code===c.code)).map(t=>t.id)};
    });
    const report={generatedAt:new Date().toISOString(),scope:'All referenced traits and every declarative mechanism field; real engine trigger vs no-trait control. Observation is NOT semantic or visual approval.',
      summary:{traits:new Set(rows.map(r=>r.code)).size,cases:rows.length,observed:rows.filter(r=>r.observed).length,
        unobserved:rows.filter(r=>r.status==='not-observed').length,modeUnwired:rows.filter(r=>r.status==='mode-unwired').length,
        unmapped:rows.filter(r=>r.status==='unmapped').length,errors:rows.filter(r=>r.errors.length).length},rows};
    fs.mkdirSync('artifacts/troop-audit',{recursive:true});fs.writeFileSync('artifacts/troop-audit/trait-triggers.json',JSON.stringify(report,null,2));
    expect(new Set(rows.map(r=>r.code)).size).toBe(new Set(TROOPS.flatMap(t=>t.traits.map(x=>x.code))).size);
    expect(rows.filter(r=>r.errors.length)).toEqual([]);
    expect(rows.filter(r=>r.status==='unmapped')).toEqual([]);
  },180000);
});
