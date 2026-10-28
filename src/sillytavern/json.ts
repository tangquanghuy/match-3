// Canonical comparison for imported, persisted JSON; object key order is irrelevant.
export function stableJson(value:unknown):string {
 const normalize=(v:unknown):unknown=>Array.isArray(v)?v.map(normalize):v&&typeof v==='object'?Object.fromEntries(Object.entries(v).filter(([,child])=>child!==undefined).sort(([a],[b])=>a.localeCompare(b)).map(([key,child])=>[key,normalize(child)])):v;
 return JSON.stringify(normalize(value));
}
