// Lane L4b round-2 curated fixes (run only while holding the src lock). Each replacement must match exactly once.
import fs from 'node:fs';
const D = 'src/engine/skills/curated/';
const edits = [
  ['batch-05.ts', // L4b-6068-order: native CausePoison before Damage (R001)
    "      dmgAll(0),\n      inflict('poison', 'enemyAll'),\n      createGems(BaseColor.Green, 9),",
    "      // Native order (R001, L4b-6068-order): CausePoison AllEnemies, then Damage AllEnemies.\n      inflict('poison', 'enemyAll'),\n      dmgAll(0),\n      createGems(BaseColor.Green, 9),"],
  ['batch-08.ts', // L4b-6841-prefnotprev
    "      dmg('enemyRandomN', 2, 1, { n: 2 }),\n    ),\n  },",
    "      // Native Damage RandomEnemy + Damage RandomPrefNotPrevEnemy (L4b-6841): second hit prefers another enemy, reuses a lone one.\n      dmg('enemyRandom', 2, 1),\n      dmg('enemyRandomPrefNotPrev', 2, 1),\n    ),\n  },"],
  ['batch-14.ts', // L4b-6824-random-ally
    "      inflict('submerged', 'allyChosen'),\n      inflict('barrier', 'allyChosen'),",
    "      // Native CauseBarrier RandomAlly, then CauseSubmerged FromPrevious (L4b-6824): no ally choice.\n      inflict('barrier', 'allyRandom'),\n      inflict('submerged', 'lastTarget'),"],
  ['batch-36.ts', // L4b-7195-order
    "      inflict('marked', 'enemyFront'),\n      transform(BaseColor.Green, 'SKULL'),",
    "      // Native order (R001, L4b-7195-order): ConvertGems Green->Skull, then CauseHuntersMark FrontEnemy.\n      transform(BaseColor.Green, 'SKULL'),\n      inflict('marked', 'enemyFront'),"],
  ['batch-r11.ts', // L4b-7499-dragon
    "      transform(BaseColor.Brown, BaseColor.Yellow),\n      magic('allyAll', 1, 0, { ifCond: { kind: 'targetColor', color: BaseColor.Yellow } }),",
    "      // DragonYellow = Yellow dragonGem special (L4b-7499-dragon).\n      transformToSpecial(BaseColor.Brown, { kind: 'dragonGem', color: BaseColor.Yellow }),\n      magic('allyAll', 1, 0, { ifCond: { kind: 'targetColor', color: BaseColor.Yellow } }),"],
  ['batch-r13.ts', // L4b-7071-base
    "      createSkulls(0, 0, {\n        modifier: {\n          mod: { kind: 'multiplier', a: 2 },\n          sources: [\n            { kind: 'alliesOfColor', color: BaseColor.Brown },",
    "      // Native CreateGems Skull Amount 2 UseCounterForAmount = 2 + counter (L4b-7071-base).\n      createSkulls(2, 0, {\n        modifier: {\n          mod: { kind: 'multiplier', a: 2 },\n          sources: [\n            { kind: 'alliesOfColor', color: BaseColor.Brown },"],
  ['batch-r21.ts', // L4b-7068-potion-colour
    "    transformToSpecial(BaseColor.Green, 'manaPotionGem', { count: 5 }),",
    "    // PurpleManaPotion carries its colour (L4b-7068-potion-colour).\n    transformToSpecial(BaseColor.Green, { kind: 'manaPotionGem', color: BaseColor.Purple }, { count: 5 }),"],
  ['batch-r4.ts', // L4b-7276-singlegem
    "    build: skill(transformToSpecial(CHOSEN, 'uberDoomSkull')),",
    "    // Native ConvertGems FromTarget BoardTarget SingleGem Amount 1: only the chosen cell (L4b-7276-singlegem).\n    build: skill(transformToSpecial('CELL', 'uberDoomSkull')),"],
  ['batch-r8.ts', // L4b-7030-dragon
    "    build: skill(transform(BaseColor.Red, BaseColor.Yellow)),",
    "    // DragonYellow = Yellow dragonGem special (L4b-7030-dragon).\n    build: skill(transformToSpecial(BaseColor.Red, { kind: 'dragonGem', color: BaseColor.Yellow })),"],
  ['batch-r8.ts', // L4b-7270-dragon
    "      transform(BaseColor.Green, BaseColor.Brown),\n      createGems(BaseColor.Brown, 3),",
    "      transform(BaseColor.Green, BaseColor.Brown),\n      // DragonBrown = Brown dragonGem special (L4b-7270-dragon).\n      createSpecialGems({ kind: 'dragonGem', color: BaseColor.Brown }, 3),"],
  ['batch-r8.ts',
    "  transform, createGems, createSpecialGems,",
    "  transform, transformToSpecial, createGems, createSpecialGems,"],
];
for (const [f, a, b] of edits) {
  const p = D + f; let c = fs.readFileSync(p, 'utf8');
  const crlf = c.includes('\r\n');
  const A = crlf ? a.replace(/\n/g, '\r\n') : a, B = crlf ? b.replace(/\n/g, '\r\n') : b;
  const n = c.split(A).length - 1;
  if (n !== 1) { console.log(`SKIP ${f}: ${n} matches for ${a.slice(0, 60)}`); continue; }
  c = c.replace(A, B); fs.writeFileSync(p, c); console.log(`ok ${f}`);
}
