import { REGIONS, REGION_REVISION, isRegionId, type RegionId } from '../data/regionalPvp';
import type { CombatantSnapshot } from '../../session/contract';
import type { InvasionMirror } from '../systems/invasion';
import type { CurrencyDelta } from '../types';
export type RegionBattleKind = 'duel' | 'citadel' | 'monolith';
export type RegionTier = 0 | 1 | 2;
export type MonolithId = 'vigor' | 'ward' | 'wisdom';
export interface RegionOpponent {
  id: string; name: string; tier: RegionTier; team: CombatantSnapshot[];
  mirror?: InvasionMirror; strategy: string; gold: number; vp: number;
}
export interface RegionalBattleContext {
  region?: RegionId; week: number; revision: number; kind: RegionBattleKind; tier: RegionTier;
  opponent: RegionOpponent; frenzy: boolean; monolith?: MonolithId; step: number;
  reward: CurrencyDelta; vp: number; burning: number;
}
export interface RegionalProgress {
  refresh:number; vp:number; wins:number;
  citadel:{stage:number;cycles:number;best:number}; opponents:RegionOpponent[];
}
export interface RegionalState {
  week:number; revision:number; vp:number; wins:number; duelWins:number; guardianWins:number;
  claimed:number[]; burningSouls:number; energy:number; day:number; sigils:number;
  regions:Record<RegionId,RegionalProgress>;
  monoliths:Record<MonolithId,{level:number;expires:number}>;
  recent:string[];
  history:{id:string;region?:RegionId;name:string;kind:RegionBattleKind;victory:boolean;vp:number;at:number}[];
}
export function freshRegionalProgress():RegionalProgress {return {refresh:0,vp:0,wins:0,citadel:{stage:0,cycles:0,best:0},opponents:[]};}
export function freshRegionalState():RegionalState {
 return {week:0,revision:REGION_REVISION,vp:0,wins:0,duelWins:0,guardianWins:0,claimed:[],burningSouls:0,energy:6,day:0,sigils:6,
 regions:Object.fromEntries(REGIONS.map(r=>[r.id,freshRegionalProgress()])) as Record<RegionId,RegionalProgress>,
 monoliths:{vigor:{level:0,expires:0},ward:{level:0,expires:0},wisdom:{level:0,expires:0}},recent:[],history:[]};
}
/** Additive save migration. Old saves gain no retroactive debt or level changes. */
export function hydrateRegionalState(raw: unknown): RegionalState {
  const out = freshRegionalState();
  if (!raw || typeof raw !== 'object') return out;
  const r = raw as Record<string, unknown>;
  const int = (v: unknown, d = 0, max = Number.MAX_SAFE_INTEGER): number => typeof v === 'number' && Number.isFinite(v) ? Math.max(0, Math.min(max, Math.floor(v))) : d;
  for (const k of ['week','vp','wins','duelWins','guardianWins','burningSouls','day'] as const) out[k] = int(r[k]);
  out.energy = int(r.energy, 6, 10); out.sigils = int(r.sigils, 6, 6);
  out.claimed = Array.isArray(r.claimed) ? [...new Set(r.claimed.filter((n): n is number => Number.isInteger(n) && Number(n) >= 0 && Number(n) < 5))] : [];
  const hydrateProgress=(raw:unknown):RegionalProgress=>{
    const p=freshRegionalProgress();if(!raw||typeof raw!=='object')return p;
    const v=raw as Record<string,unknown>;
    p.refresh=int(v.refresh);p.vp=int(v.vp);p.wins=int(v.wins);
    if(v.citadel&&typeof v.citadel==='object') {const c=v.citadel as Record<string,unknown>;p.citadel={stage:int(c.stage,0,4),cycles:int(c.cycles,0,100),best:int(c.best,0,100)};}
    if(r.revision===REGION_REVISION&&Array.isArray(v.opponents))p.opponents=v.opponents.filter((o):o is RegionOpponent=>!!o&&typeof o.id==='string'&&typeof o.name==='string'&&[0,1,2].includes(o.tier)&&Array.isArray(o.team)&&o.team.length===4).slice(0,3);
    return p;
  };
  if(r.regions&&typeof r.regions==='object') {
    for(const region of REGIONS)out.regions[region.id]=hydrateProgress((r.regions as Record<string,unknown>)[region.id]);
  } else {
    // Revision 1 had only Winter's Reach. Preserve progress but discard old candidate IDs.
    out.regions.WintersReach=hydrateProgress(r);
    out.guardianWins=out.regions.WintersReach.citadel.cycles;
  }
  if (r.monoliths && typeof r.monoliths === 'object') for (const k of ['vigor','ward','wisdom'] as const) {
    const b = (r.monoliths as Record<string, Record<string, unknown>>)[k];
    if (b && typeof b === 'object') out.monoliths[k] = { level: int(b.level, 0, 5), expires: int(b.expires) };
  }
  if (Array.isArray(r.history)) out.history = r.history.filter((v): v is RegionalState['history'][number] => !!v && typeof v.id === 'string' && typeof v.name === 'string' && ['duel','citadel','monolith'].includes(v.kind) && typeof v.victory === 'boolean' && Number.isFinite(v.at) && Number.isFinite(v.vp)).slice(0,30).map(v=>({...v,region:isRegionId(v.region)?v.region:'WintersReach'}));
  if (Array.isArray(r.recent)) out.recent = r.recent.filter((v): v is string => typeof v === 'string').slice(-12);
  return out;
}
