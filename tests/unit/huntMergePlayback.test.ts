import { describe, expect, it } from 'vitest';
import { EventStreamPlayer } from '@render/EventStreamPlayer';
import { AnimConfig } from '@render/AnimationConfig';
import { huntType } from '@engine/HuntBoard';
import type { CellPos, Gem, GemType } from '@engine/types';
import type { GameEvent } from '@engine/events';

const merge: GameEvent = { type:'gem-merge', chainCount:1, groups:[{
  target:{pos:{row:7,col:1},gemId:2,gemType:huntType(1)},
  consumed:[{pos:{row:7,col:0},gemId:1},{pos:{row:7,col:2},gemId:3}],
}]};
const center = (p:CellPos) => ({x:(p.col+.5)*64,y:(p.row+.5)*64});
function sprite(id:number, p:CellPos, type=huntType(0)) {
  const s = {id,...center(p),type,alpha:1,scale:{x:1,y:1,set(n:number){this.x=this.y=n;}},position:{set(x:number,y:number){s.x=x;s.y=y;}}};
  return s;
}
function fixture(events:GameEvent[]=[merge]) {
  const sprites = new Map([1,2,3].map(id=>[id,sprite(id,{row:7,col:id-1})]));
  const cues:number[]=[];
  const board = {cellSize:64,gridPixels:512,cellCenter:center,
    getSprite:(id:number)=>sprites.get(id),
    removeGem:(id:number)=>sprites.delete(id),
    setGemType:(id:number,type:GemType)=>{sprites.get(id)!.type=type;},
    addGem:(gem:Gem,p:CellPos)=>{const s=sprite(gem.id,p,gem.type);sprites.set(gem.id,s);return s;},
  };
  const player = new EventStreamPlayer(board as never,{burst:()=>{}} as never,{} as never,{play:()=>{},playChain:(n:number)=>cues.push(n)} as never);
  player.setPaused(true);
  const promise=player.play(events);
  const timeline=(player as unknown as {timeline:gsap.core.Timeline}).timeline;
  return {player,promise,timeline,sprites,cues};
}

describe('hunt merge on the shared battle timeline',()=>{
  it('gathers pieces before upgrading the survivor and playing its reveal',()=>{
    const x=fixture();
    try {
      x.timeline.totalTime(AnimConfig.merge.gather/2,false);
      expect(x.sprites.size).toBe(3);
      expect(x.sprites.get(1)!.x).toBeGreaterThan(32);
      expect(x.sprites.get(1)!.x).toBeLessThan(96);
      expect(x.sprites.get(2)!.type).toEqual(huntType(0));
      x.timeline.totalTime(AnimConfig.merge.gather+.01,false);
      expect([...x.sprites.keys()]).toEqual([2]);
      expect(x.sprites.get(2)!.type).toEqual(huntType(1));
      expect(x.sprites.get(2)!.scale.x).toBeGreaterThan(1);
      x.timeline.totalTime(x.timeline.duration(),false);
      expect(x.sprites.get(2)!.scale.x).toBeCloseTo(1);
      expect(x.cues).toEqual([1]);
    } finally {x.player.cancel();}
  });
  it('waits for merge before falling, then resolves a later merge against newly spawned sprites',async()=>{
    const events:GameEvent[]=[merge,
      {type:'gravity',chainCount:1,moves:[{gemId:2,from:{row:7,col:1},to:{row:7,col:0}}]},
      {type:'refill',chainCount:1,spawns:[{gemId:4,gemType:huntType(1),to:{row:7,col:1}},{gemId:5,gemType:huntType(1),to:{row:7,col:2}}]},
      {type:'gem-merge',chainCount:2,groups:[{target:{gemId:4,pos:{row:7,col:1},gemType:huntType(2)},consumed:[{gemId:2,pos:{row:7,col:0}},{gemId:5,pos:{row:7,col:2}}]}]},
    ];
    const x=fixture(events);
    try {
      x.timeline.totalTime(AnimConfig.merge.gather/2,false);
      expect(x.sprites.has(4)).toBe(false);expect(x.sprites.get(2)!.x).toBe(96);
      x.player.skip();await x.promise;
      expect([...x.sprites.keys()]).toEqual([4]);
      expect(x.sprites.get(4)!.type).toEqual(huntType(2));
      expect(x.sprites.get(4)!.x).toBe(96);
      expect(x.cues).toEqual([1,2]);
    } finally {x.player.cancel();}
  });
  it('cancellation resolves the pending move without running queued upgrades',async()=>{
    const x=fixture();
    x.timeline.totalTime(.05,false);
    x.player.cancel();await x.promise;
    expect(x.sprites.size).toBe(3);
    expect(x.sprites.get(2)!.type).toEqual(huntType(0));
  });
});
