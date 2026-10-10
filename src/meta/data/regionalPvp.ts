import { BaseColor } from '../../engine/types';
import type { MonolithId } from '../state/regional';
export const REGION_ID = 'WintersReach';
export const REGION_NAME = '寒冬堡垒';
export const REGION_UNLOCK_LEVEL = 50;
export const REGION_REVISION = 2;
export type { RegionId } from '../../data/pvpRegions';
import type { RegionId } from '../../data/pvpRegions';
export type RegionRestriction = { kind:'none' } | { kind:'color'; color:BaseColor; name:string } | { kind:'type'; type:string; name:string } | { kind:'kingdom'; kingdom:string };
export interface RegionDefinition {
  id:RegionId; name:string; subtitle:string; ring:'central'|'inner'|'outer';
  homes:readonly number[]; rules:readonly RegionRestriction[];
  gems:readonly {name:string;gem:{kind:import('../../engine/types').SpecialGemKind;color:BaseColor}}[];
  art:string; accent:string;
}
const color=(value:BaseColor,name:string):RegionRestriction=>({kind:'color',color:value,name});
const type=(value:string,name:string):RegionRestriction=>({kind:'type',type:value,name});
const kingdom=(value:string):RegionRestriction=>({kind:'kingdom',kingdom:value});
const gem=(kind:import('../../engine/types').SpecialGemKind,color:BaseColor,name:string)=>({name,gem:{kind,color}});
/** Region keys agree with the skill engine. Restrictions are this project's weekly rotation. */
export const REGIONS: readonly RegionDefinition[] = [
 {id:'CentralSpire',name:'中央尖塔',subtitle:'诸界交汇 · 自由配队',ring:'central',homes:[7571,7623,7861],rules:[{kind:'none'}],gems:[],art:'spire',accent:'#d6b774'},
 {id:'Aidania',name:'阿达尼亚',subtitle:'钢铁之境 · 颜色战区',ring:'inner',homes:[7580,7726],rules:[color(BaseColor.Brown,'棕'),color(BaseColor.Yellow,'黄')],gems:[gem('barrierGem',BaseColor.Yellow,'屏障宝石')],art:'tower',accent:'#c2ad7e'},
 {id:'Southwild',name:'南荒',subtitle:'古林深处 · 颜色战区',ring:'inner',homes:[7574,7689,7792],rules:[color(BaseColor.Green,'绿'),color(BaseColor.Red,'红')],gems:[gem('entangleGem',BaseColor.Green,'缠绕宝石')],art:'forest',accent:'#8cab82'},
 {id:'Geheron',name:'盖赫龙',subtitle:'幽影王庭 · 颜色战区',ring:'inner',homes:[7577,7605,7801],rules:[color(BaseColor.Purple,'紫'),color(BaseColor.Blue,'蓝')],gems:[gem('spiritGem',BaseColor.Purple,'幽魂宝石')],art:'gothic',accent:'#b495c8'},
 {id:'WintersReach',name:'寒冬堡垒',subtitle:'极夜边疆 · 种族与王国',ring:'outer',homes:[7581,7651,7860],rules:[type('Elemental','元素'),kingdom('冰峰之巅'),type('Giant','巨人'),kingdom('厄什卡亚')],gems:[gem('freezeGem',BaseColor.Blue,'冰霜宝石'),gem('spiritGem',BaseColor.Purple,'幽魂宝石')],art:'winter',accent:'#a6c9d9'},
 {id:'AncientKhet',name:'古盖塔',subtitle:'沙海遗城 · 种族与王国',ring:'outer',homes:[7572,7607,7901],rules:[type('Undead','亡灵'),kingdom('盖塔尔'),type('Daemon','恶魔'),kingdom('聚沙之地')],gems:[gem('curseGem',BaseColor.Brown,'诅咒宝石')],art:'desert',accent:'#deb478'},
 {id:'BayOfStars',name:'星星湾',subtitle:'星潮海岸 · 种族与王国',ring:'outer',homes:[7575,7650,7727,7932],rules:[type('Merfolk','海族'),kingdom('梅兰堤斯'),type('Elemental','元素'),kingdom('黑鹰')],gems:[gem('submergeGem',BaseColor.Blue,'沉没宝石')],art:'bay',accent:'#85c7d0'},
 {id:'MarajiExpanse',name:'迈纳杰大区',subtitle:'烈日疆土 · 种族与王国',ring:'outer',homes:[7576,7604,7900],rules:[type('Raksha','罗刹'),kingdom('迈纳杰之罪'),type('Beast','野兽'),kingdom('狂野平原')],gems:[gem('enrageGem',BaseColor.Red,'狂怒宝石')],art:'expanse',accent:'#d8a17b'},
 {id:'SummerIsle',name:'夏之岛',subtitle:'繁花群岛 · 种族与王国',ring:'outer',homes:[7573,7579,7791],rules:[type('Fey','妖仙'),kingdom('皓彩森林'),type('Elf','精灵'),kingdom('玉银林地')],gems:[gem('faerieFireGem',BaseColor.Purple,'妖火宝石')],art:'summer',accent:'#ccbf92'},
 {id:'BrokenLands',name:'破碎之地',subtitle:'熔火边境 · 种族与王国',ring:'outer',homes:[7578,7688,7800,7933],rules:[type('Orc','兽人'),kingdom('破碎尖塔'),type('Dragon','龙族'),kingdom('葛洛什奈克')],gems:[gem('burningGem',BaseColor.Red,'燃烧宝石')],art:'broken',accent:'#cd957b'},
];
export function regionDefinition(id:string):RegionDefinition|undefined {return REGIONS.find(r=>r.id===id);}
export function isRegionId(id:unknown):id is RegionId {return typeof id==='string'&&!!regionDefinition(id);}
export const REGION_TIERS = [
  { name: '精锐', hp: 3, armor: 2, attack: 1.25, magic: 1.2, gold: 1800, vp: 30 },
  { name: '强敌', hp: 4, armor: 3, attack: 1.4, magic: 1.35, gold: 2400, vp: 45 },
  { name: '霸主', hp: 5, armor: 4, attack: 1.6, magic: 1.5, gold: 3000, vp: 60 },
] as const;
/** 普通区域对战独立调档；城塞沿用 REGION_TIERS，避免连带降低守军与守护者难度。
 * 倍率作用于已养成的快照，低档不再额外放大；血怒仍在此基础上统一 +50%。
 */
export const REGION_DUEL_SCALING = [
  { hp: 1, armor: 1, attack: 1, magic: 1 },
  { hp: 2, armor: 1.5, attack: 1.2, magic: 1.15 },
  { hp: 5, armor: 4, attack: 1.6, magic: 1.5 },
] as const;
/** Applied to the final enemy snapshot for every regional battle mode. */
export const REGION_ENEMY_STAT_FACTOR = 0.7;
export const MONOLITHS: readonly { id: MonolithId; name: string; stat: 'hp' | 'armor' | 'magic'; description: string; icon: string }[] = [
  { id:'vigor', name:'生命之碑', stat:'hp', description:'生命每阶 +10%', icon:'heart' },
  { id:'ward', name:'庇护之碑', stat:'armor', description:'护甲每阶 +10%', icon:'shield' },
  { id:'wisdom', name:'秘法之碑', stat:'magic', description:'魔力每阶 +10%', icon:'orb' },
];
export const MONOLITH_LEVELS = [20,40,80,150,300] as const;
export const REGION_REWARDS = [
  { vp:150, gold:40000, gems:300, souls:6000, burning:5, cycles:0 },
  { vp:400, gold:60000, gems:300, souls:8000, burning:8, cycles:0 },
  { vp:800, gold:100000, gems:300, souls:10000, burning:12, cycles:1 },
  { vp:1400, gold:150000, gems:200, souls:12000, burning:15, cycles:2 },
  { vp:2200, gold:200000, gems:100, souls:16000, burning:20, cycles:3 },
] as const;
/** Shared permanent currency; project adaptation, not official per-Immortal souls. */
export function burningSoulCost(from: number, to: number): number {
  let n=0;
  for(let level=from+1;level<=to;level++) n += level <= 10 ? 1 : level <= 20 ? 3 : 6;
  return n;
}
