/** Recover native spells from both API fields. Some merged rows keep a troop's
 * outer Id while their `data` holds a SPELL with a different Id: trust payload.Id,
 * never the merged entity wrapper. Preserve field provenance and reject conflicts. */
export function indexNativeSpells(rows) {
  const result = new Map();
  for (const row of rows) for (const field of ['RawData', 'data']) {
    if (typeof row[field] !== 'string') continue;
    let raw; try { raw = JSON.parse(row[field]); } catch { continue; }
    if (!Number.isInteger(raw.Id) || !Array.isArray(raw.SpellSteps)) continue;
    const prev=result.get(raw.Id);
    if(prev && JSON.stringify(prev.raw)!==JSON.stringify(raw)) throw new Error(`Conflicting native spell ${raw.Id}`);
    if(!prev)result.set(raw.Id,{raw,field,wrapperId:row.Id??row.id});
  }
  return result;
}
