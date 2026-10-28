import data from './data/portraits.json';
import { ROLE_NAMES, ROLE_ORDER } from '../meta/data/roles';
export { ROLE_NAMES, ROLE_ORDER };
export const COLORS = ['Red', 'Blue', 'Green', 'Yellow', 'Purple', 'Brown'] as const;
export const COLOR_NAMES: Record<string, string> = { Red:'红', Blue:'蓝', Green:'绿', Yellow:'黄', Purple:'紫', Brown:'棕' };
export const FORMS = ['人形','野兽','类人','怪物','异形体'] as const;
export const RANKS = ['杂兵','精锐','首领','领主','传奇'] as const;
export interface PortraitEntry { assetId:string; troopId:number; manaColors:string[]; rank:string; form:string; role:string; portraitUrl:string; review:string; contentHash:string }
export interface PortraitQuery { manaColors?:string[]; rank?:string; form?:string; role?:string }
export interface PortraitSelection { version:1; query:PortraitQuery; assetId:string; troopId:number; contentHash:string }
export const PORTRAITS: readonly PortraitEntry[] = data.entries;
export function colorKey(colors:readonly string[]):string {
  if (!Array.isArray(colors) || !colors.length || new Set(colors).size !== colors.length || colors.some(c => !COLORS.includes(c as typeof COLORS[number]))) throw new Error('请选择无重复的有效法力颜色');
  return COLORS.filter(c => colors.includes(c)).join(',');
}
export function validateQuery(q:PortraitQuery):void {
  if (q.manaColors!==undefined) colorKey(q.manaColors);
  if (q.rank && !(RANKS as readonly string[]).includes(q.rank)) throw new Error('稀有度已失效');
  if (q.form && !(FORMS as readonly string[]).includes(q.form)) throw new Error('形态已失效');
  if (q.role && !(ROLE_ORDER as readonly string[]).includes(q.role)) throw new Error('职责已失效');
}
export function findPortraits(q:PortraitQuery, entries:readonly PortraitEntry[]=PORTRAITS):PortraitEntry[] {
  validateQuery(q);
  // Explicit colors are retained only for restoring historical selections. New artwork queries omit them.
  const colors=q.manaColors!==undefined ? colorKey(q.manaColors):undefined;
  const matches=entries.filter(e => (!colors || colorKey(e.manaColors)===colors) && (!q.rank || q.rank===e.rank) && (!q.form || q.form===e.form) && (!q.role || q.role===e.role));
  const seen=new Set<string>();
  return matches.filter(e => { if(seen.has(e.contentHash)) return false; seen.add(e.contentHash); return true; });
}
export function savePortrait(q:PortraitQuery, entry:PortraitEntry):PortraitSelection {
  if(!q.rank || !q.form || !q.role) throw new Error('请先选齐阶级、形态和职责');
  if(!findPortraits(q).some(e=>e.assetId===entry.assetId && e.troopId===entry.troopId)) throw new Error('肖像与条件不匹配');
  return {version:1,query:structuredClone(q),assetId:entry.assetId,troopId:entry.troopId,contentHash:entry.contentHash};
}
export function restorePortrait(value:unknown):{selection:PortraitSelection;entry:PortraitEntry} {
  if(!value || typeof value!=='object') throw new Error('保存的肖像配置格式有误');
  const s=value as PortraitSelection;
  if(s.version!==1 || !s.query || typeof s.query!=='object') throw new Error('肖像配置版本有误');
  const e=PORTRAITS.find(e=>e.assetId===s.assetId && e.troopId===s.troopId && e.contentHash===s.contentHash);
  if(!e) throw new Error('保存的图片或标注已变更，请重新选择');
  const selection=savePortrait(s.query,e);
  return {selection,entry:e};
}
