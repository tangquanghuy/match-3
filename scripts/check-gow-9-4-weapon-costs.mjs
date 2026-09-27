/** Screen only explicitly stated mana-cost deltas in the archived official 9.4 Early Weapons section.
 * This is NOT whole-spell acceptance or a newer-version assertion.
 */
import fs from 'node:fs';
import {createHash} from 'node:crypto';
const sourcePath='artifacts/gow-skill-audit/gold-primary-sources/update-9-4-patch-notes.html';
const html=fs.readFileSync(sourcePath,'utf8');
const start=html.indexOf('<h4 class="wp-block-heading">Early Weapons</h4>');
const end=html.indexOf('We have adjusted some Gem Mastery unlock requirements',start);
if(start<0||end<0)throw new Error('Official 9.4 Early Weapons source boundary changed');
const section=html.slice(start,end);
const decode=s=>s.replace(/&#8217;|&#039;|&apos;/g,"'").replace(/&amp;/g,'&').replace(/<[^>]*>/g,'').trim().replace(/\s*\(Common\)$/,'').trim();
const firstWeapon=section.indexOf('<li>Knight&#8217;s Sword');
if(firstWeapon<0)throw new Error('Official 9.4 first weapon anchor changed');
const items=[...section.slice(firstWeapon).matchAll(/<li>\s*([^<>]+?)\s*<ul>([\s\S]*?)<\/ul>\s*<\/li>/g)];
const sourceRows=items.flatMap(([,label,body])=>{
 const changes=[...body.matchAll(/Mana [Cc]ost\s+(?:reduce|reduced|decreased|increased)\s+from\s+(\d+)\s+to\s+(\d+)/g)];
 if(!changes.length)return [];
 if(changes.length!==1)throw new Error(`Multiple cost notes for ${label}`);
 return [{name:decode(label),before:Number(changes[0][1]),after:Number(changes[0][2]),sourceLine:changes[0][0]}];
});
// Anchor the exact patch subset; a missing/extra note is review-required, not a silent pass.
if(sourceRows.length!==18)throw new Error(`Expected 18 explicit weapon-cost changes, found ${sourceRows.length}`);
const key=name=>name.toLowerCase().replace(/[^a-z0-9]/g,'');
const rows=JSON.parse(fs.readFileSync('src/data/weapons.json','utf8'));
const snapshots=JSON.parse(fs.readFileSync('artifacts/gowhead-weapons/weapons.json','utf8')).weapons;
const byName=new Map(rows.map(r=>[key(r.nameEn),r]));
const byId=new Map(snapshots.map(r=>[r.Id,r]));
const results=sourceRows.map(src=>{
 const officialNameAliases={
  'Flachion of Kings':'Falchion of Kings',
  'Khopresh of Misery':'Khopesh of Misery',
  'Lance of the Divine':'Lance of Divinity',
 };
 const normalized=officialNameAliases[src.name]??src.name; // explicit 9.4 names vs snapshot
 const row=byName.get(key(normalized));
 if(!row)throw new Error(`Unmapped official weapon: ${src.name}`);
 const snapshot=byId.get(row.id);
 if(!snapshot||row.spell.id!==snapshot.SpellId)throw new Error(`Snapshot ID mismatch: ${src.name}`);
 return {weaponId:row.id,spellId:row.spell.id,name:src.name,official94Cost:src.after,
  snapshotCost:snapshot.ManaCost,projectCost:row.manaCost,sourceLine:src.sourceLine,
  status:src.after===row.manaCost&&src.after===snapshot.ManaCost?'cost-matches-official-9.4-note':'version-or-source-conflict-pending-review'};
});
const report={sourcePath,sourceSha256:createHash('sha256').update(html).digest('hex'),
 note:'Official September 9, 2026 patch-note costs vs September 17 stored gowhead weapon snapshot; patch notes alone do not prove subsequent live client version, base damage, effect text or whole-skill correctness.',
 rows:results,conflicts:results.filter(r=>r.status!=='cost-matches-official-9.4-note')};
if(process.argv.includes('--check')&&report.conflicts.length)process.exitCode=1;
if(process.argv.includes('--write'))fs.writeFileSync('artifacts/gow-skill-audit/official-9-4-weapon-cost-screen.json',JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({screened:results.length,conflicts:report.conflicts},null,2));
