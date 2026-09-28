# GoW 技能改动留档

自动生成（`node scripts/gow-changelog.mjs render`），源数据 [CHANGES.jsonl](CHANGES.jsonl)，共 190 条改动，涉及 385 个技能 ID。

## 按时间

| 时间 | 执行者 | 问题 | 类型 | 技能 ID | 实体 | 文件 | 改前 → 改后 | 影响面 |
|---|---|---|---|---|---|---|---|---|
| 2026-09-27T18:58 | sa-L5 | L5-001 | primitive | 9015, 8403, 8245, 7561, 8404 | troop:7375 Virago；weapon:1368 Lockstone；troop:6840 KnightCaptain；troop:6406 Waverider；weapon:1369 Keystone | `status.ts` | Assembler emits {kind:'status',statusId:'barrier',turns:3}; tickStatuses decrements every non-poison status at the owner's turn start, so an unused Barrier disappears after 3 owner turn-starts (real TurnEngine.passTurn flow). → status.ts NON_EXPIRING_STATUS_IDS += barrier (R002); all CauseBarrier/gem/trait sources via tickStatuses | src/engine/skills/effects/status.ts tickStatuses step 2 (only poison is exempt from decrement); assembler default turns:3 for CauseBarrier. Affects every CauseBarrier skill, barrier gem and trait source, not just this lane. |
| 2026-09-27T18:58 | sa-L5 | L5-002 | primitive | 9015, 8404 | troop:7375 Virago；weapon:1369 Keystone | `status.ts` | Assembler emits turns:3; TurnEngine removes Enchanted on cast (correct) but tickStatuses also expires it after 3 owner turn-starts even if no spell was cast (at most 3 x +2 mana instead of unlimited until cast). → status.ts NON_EXPIRING_STATUS_IDS += enchanted (R002); removed on cast/dispel/Curse | status.ts ENCHANTED doc says 'turns 仅兜底' but the fallback is a real expiry; CLAN-GEM-SOURCE-CHECK.md records turns=3 only as a proxy. |
| 2026-09-27T18:58 | sa-L5 | L5-003 | primitive | 8404 | weapon:1369 Keystone | `status.ts`<br>`builders.ts`<br>`spell-rules.md` | cleanseEffect clears target.statuses entirely. Self-target: status-cleanse [0,['barrier']] removes the Barrier just gained; ally with barrier+burning ends with only enchanted. → status.ts cleanseEffect keeps POSITIVE_STATUS_IDS (R002); builders.ts doc + spell-rules.md updated; 47 native Cleanse/cleanse prototypes share the primitive | src/engine/skills/effects/status.ts cleanseEffect; scripts/spell-rules.md line ~166 also documents cleanse as 'remove all statuses' so the rule doc needs the same correction. Reverse-search every kind:'cleanse' prototype. |
| 2026-09-27T18:58 | sa-L5 | L5-006 | assembler | 7338 | weapon:1142 Dragonator8000 | `gowWeaponReviewedOverrides.json` | Registered prototype has only three status segments (burning/frozen/silence, each an independent enemyRandomN n=1). The Damage step is missing (no skill-damage event, 0 spell damage), and prefer-not-previous targeting (engine mode enemyRandomPrefNotPrev exists) is not used, so the same enemy can be picked repeatedly. → batch-w01 7338 = Burn@enemyRandom, Freeze/Silence/Damage M+3 @enemyRandomPrefNotPrev; gowWeaponReviewedOverrides.json entry added | Prototype for spell 7338 (numeric key and gw_Dragonator8000). Amount:2 on the three Cause* steps has no documented meaning; engine uses turns 3 (see L5-005). |
| 2026-09-27T18:58 | sa-L5 | L5-007 | assembler | 8668, 8084 | weapon:1436 TrickAndTreat | `status.ts` | Enemy gets curse, poison, burning, bleed, silence, frozen, stun, entangle, web, disease, death-mark, charm: Faerie Fire, Terror, Hunter's Mark (marked) and Lycanthropy (wolf) are missing; Charm (not in the official list) is added. Self gets barrier, enchanted, enraged, rage, reflect, submerged, blessed: Enrage is granted twice under alias ids 'enraged' and 'rage'. → batch-w03 8668 negative list per official guide (+faerie-fire/marked/terror/lycanthropy, -charm); status.ts allPositive grants Enrage once (drops rage alias); overrides JSON updated; weaponNativeStepRepair 8668/8084 expectations | Negative list is spelled out in the 8668 prototype; the positive set comes from POSITIVE_STATUS_IDS in status.ts (primitive) which contains both alias ids. Scope caveat: statuses added after the snapshot date may not belong to the in-game set; fix window should confirm the snapshot-era list. |
| 2026-09-27T18:58 | sa-L5 | L5-008 | assembler | 8752 | troop:7182 TheGemini |  | Prototype follows the English order (drain first, then curse, then 3-stack bleed). A Barrier on a weakest enemy absorbs the steal, then Curse lands. Weakest = lowest current HP, ties by team index. → resolved by rulings/R001: batch-r9 8752 reordered Curse -> Bleed x3 -> StealLife |  |
| 2026-09-27T18:58 | sa-L5 | L5-009 | assembler | 7392 | troop:6249 Penitent |  | Registered as {kind:'reduce', target:'allySelf', stat:'hp', base 3}: Life is reduced directly; caster Armor 5 and Barrier both untouched (hp 1000 -> 997). → batch-35 7392 self Take 3 damage = dmg allySelf (Barrier/Armor first) |  |
| 2026-09-27T18:58 | sa-L5 | L5-010 | assembler | 7444 | weapon:1147 CryptKeeper | `prototypes.ts` | Prototype target is enemyChosenAndBelow, and at runtime only the chosen enemy is damaged: chosen 11 loses 8, enemies 12 and 13 lose 0 (both sides, both aliases). The x3 Death Mark boost counts correctly (1 mark +3, 3 marks +9). → batch-w01 7444 target enemyBelowTarget; prototypes.ts column-slice modes resolve multi-victim damage; overrides JSON entry added | BelowTarget should map to the existing enemyBelowTarget mode. Separately check why enemyChosenAndBelow damage resolved to the chosen target only; that may be a primitive issue affecting other enemyChosenAndBelow skills. |
| 2026-09-27T19:16 | sa-L76 |  | assembler | 7743 | troop:6549 Piper | `src/engine/skills/curated/batch-r15.ts` | Registered prototype runs damage first, then reduce(armor, gainStat magic): hp loss = Magic + 2 (old Magic). Armor steal amount (min(armor,3)) and Magic gain are correct. → src/engine/skills/curated/batch-r15.ts 7743: steal before trueDmg (R001) |  |
| 2026-09-27T19:16 | sa-L76 |  | assembler | 10061 | troop:7833 Ipanema | `src/engine/skills/curated/batch-r28.ts` | Prototype order is damage -> reposition -> execute; chanceBoost source targetStat(armor) is read after the [Magic+4] damage stripped armor (100->86) -> 18%; roll 0.19 does not slay. Base 10%, cap 30%, [Magic+4] damage and pull-to-back are correct. → src/engine/skills/curated/batch-r28.ts 10061: execute(chosenStat armor) before damage and pull-back (R001) |  |
| 2026-09-27T19:16 | sa-L76 |  | primitive | 7752 | weapon:1194 Fleshripper | `src/engine/skills/effects/secondary.ts` | Runtime modifier ratio a=3 b=1 on lastReduce: floor(50/3)=16 -> 30. Values agree for armor < 50 and diverge from 50 upward (e.g. 50,53,56,...). → R003: src/engine/skills/effects/secondary.ts modifierBonus percentage (34%) |  |
| 2026-09-27T19:16 | sa-L76 |  | primitive | 1194 | weapon:1199 EarthsFury |  | runtime floor(50/3)=16 -> +18 Attack → R003 (same as weapon:1194) |  |
| 2026-09-27T19:16 | sa-L76 |  | primitive | 1194 | weapon:1201 TrickstersShot |  | runtime +18 Magic → R003 (same as weapon:1194) |  |
| 2026-09-27T19:16 | sa-L76 |  | primitive | 1194 | weapon:1204 GoldenSun |  | runtime 17 gold → R003 (same as weapon:1194) |  |
| 2026-09-27T19:16 | sa-L76 |  | primitive | 1194 | weapon:1200 YasminesPride |  | runtime +17 → R003 (same as weapon:1194) |  |
| 2026-09-27T19:16 | sa-L76 | L7-6352-a | primitive | 7504 | troop:6352 HighPaladin | `src/engine/skills/prototypes.ts` | Only the single highest-Life enemy is damaged. Prototype target enemyHealthiestN n=2 has no explicit range; the omitted-range list in src/engine/skills/prototypes.ts (damage case, ~line 700) lists 'enemyStrongestN' (not a TargetMode) instead of 'enemyHealthiestN', so range falls back to 'single' and damageEffect hits only targets[0]. → src/engine/skills/prototypes.ts omitted-range list: enemyStrongestN -> enemyHealthiestN | Every damage segment with target enemyHealthiestN and no explicit range Candidates from ledger (not individually re-run): troop:6566, troop:6599, troop:7835, weapon:1159. |
| 2026-09-27T19:16 | sa-L76 | L7-7344 | assembler | 8969 | troop:7344 CommanderDawnheart | `src/engine/skills/curated/batch-10.ts` | Prototype damage enemyRandomN n=4 without randomWaves: resolves min(4, living) distinct enemies and hits each once; with 2 living enemies only 2 hits land (engine already supports randomWaves for this native shape, e.g. batch-03 spell with n:6 randomWaves:6). → src/engine/skills/curated/batch-10.ts 8969: enemyRandom + 3 x enemyRandomPrefNotPrev segments (native PrefNotPrev semantics, not randomWaves) |  |
| 2026-09-27T19:16 | sa-L76 | L7-6211 | assembler | 7353 | troop:6211 SettiteWarrior | `src/engine/skills/curated/batch-r15.ts` | Prototype modifier source targetStat(armor) reads castTracking.lastTarget, which the scatter segment itself overwrites with its first enemy target before evaluating the modifier -> pool = first enemy's armor (0 in fixture). → src/engine/skills/curated/batch-r15.ts 7353: modifier source chosenStat armor |  |
| 2026-09-27T19:16 | sa-L76 | L7-7517 | assembler | 9281 | troop:7517 Amphib-o-Bot | `src/engine/skills/curated/batch-r19.ts` | Prototype carried split:2 (misread of the official zh localisation artefact '- {2}'), sharing one roll between the pulled enemy and the next front enemy. → src/engine/skills/curated/batch-r19.ts 9281: split removed |  |
| 2026-09-27T19:37 | sa-L76 | L7-7045 | assembler | 8570 | troop:7045 EarthDreamer | `src/engine/skills/curated/batch-33.ts` | Attack segment had no modifier (only the Life segment was boosted). → src/engine/skills/curated/batch-33.ts 8570 shared modifier M8570 on both segments |  |
| 2026-09-27T19:37 | sa-L76 | L7-7201 | assembler | 8788 | troop:7201 Leio | `src/engine/skills/curated/batch-15.ts` | Damage segment had no modifier. → src/engine/skills/curated/batch-15.ts 8788 modifier on damage segment |  |
| 2026-09-27T19:37 | sa-L76 | L7-7615 | assembler | 9522 | troop:7615 Gingeraxia | `src/engine/skills/curated/batch-17.ts` | Heal segment had no modifier. → src/engine/skills/curated/batch-17.ts 9522 shared modifier M9522 |  |
| 2026-09-27T19:37 | sa-L76 | L7-6193 | assembler | 7334 | troop:6193 Runesmith | `src/engine/skills/curated/batch-05.ts` | Attack segment had no modifier. → src/engine/skills/curated/batch-05.ts 7334 modifier on attack segment |  |
| 2026-09-27T19:40 | sa-L5 | L5-012 | assembler | 7185 | weapon:1072 SpidersKiss | `gowWeaponReviewedOverrides.json` | Prototype had only the Entangle segment (no damage). → batch-w01 7185 + trueDmg enemyFront 2/1; gowWeaponReviewedOverrides.json entry added |  |
| 2026-09-27T19:40 | sa-L5 | L5-013 | assembler | 7371, 7359, 8393, 7740, 7978, 7361, 7364 | troop:6229 SandCobra；troop:6217 Creeper；troop:6924 HeartOfRage；troop:6546 Senita；troop:6646 SkulkFang；troop:6219 Moa；troop:6222 Khopeshi |  | Prototypes followed the Chinese/English order. Observable for 7371: Stun first disables immunity traits so Disease/Poison bypassed immunity. → batch-r5 7371, batch-34 7359, batch-33 8393/7740 reordered; batch-01 7978 (Poison WeakestEnemy -> Damage FromPrevious) and 7361 (Stun -> Damage), batch-r18 7364 (Stun -> TroopOrderFront) |  |
| 2026-09-27T20:04 | sa-L4b | L4b-6751-zh | data | 6751 | troop:6751 TheMarajiQueen | `gowSnapshotOverrides.json`<br>`build_troops.mjs` | src/data/troops.json spell 8129 description: '诅咒所有敌人。将所有绿色宝石转换成骷髅头。' (plain Skulls). Runtime prototype itself is correct (toSpecial doomSkull). → gowSnapshotOverrides.json troop 6751 + batch-36 desc + pool-36; build_troops.mjs |  |
| 2026-09-27T20:04 | sa-L4b | L4b-7138-onecolour | primitive | 7162 | troop:7138 WuHao | `gems.ts`<br>`tests/unit/gowLaneL4bB05Repro.test.ts` | gems.ts pickCreateGemType calls resolveColor('LAST_TARGET') per gem, and resolveColor rolls char.colors[rng] each call, so a Red+Purple ally yields a Red/Purple mix (seed 42: 2 colours). The conversion pool is also filtered only by the first probe colour. Same pattern likely affects CHOSEN_TARGET / ENEMY / TRACKED_ENEMY colour specs on create (e.g. troop:7162 only verified with a single-colour ally). → gems.ts resolveCreateSpec: CHOSEN_TARGET/ENEMY/TRACKED_ENEMY/LAST_TARGET/MOST_USED placeholders resolved once per cast; repro tests/unit/gowLaneL4bB05Repro.test.ts (36 cases); accepted troop:7162 requeued |  |
| 2026-09-27T20:04 | sa-L4b | L4b-7138-zh | data | 7138 | troop:7138 WuHao | `gowSnapshotOverrides.json`<br>`build_troops.mjs` | src/data/troops.json spell 8687 description contains typo '发力颜色' instead of '法力颜色' → gowSnapshotOverrides.json troop 7138 + batch-r20 desc; build_troops.mjs |  |
| 2026-09-27T20:04 | sa-L4b | L4b-7200-rage-alias | primitive | 6548 | troop:7200 TheWildKing | `secondary.ts` | Prototype applies statusId 'rage'. isEnraged/CombatResolver accept the alias (RAGE_STATUS_IDS), but secondary.ts allyStatusCount/enemyStatusCount compare s.id === statusId exactly, and many curated skills count statusId 'enraged' (batch-r10/r11/r12/r15/r18/r22). After 8787 the count is 0 instead of 3. → secondary.ts sameStatus(): allyStatusCount/enemyStatusCount/targetStatus/anyEnemyStatus/anyAllyStatus/selfStatus/lastTargetStatus accept rage<->enraged; accepted troop:6548 requeued |  |
| 2026-09-27T20:04 | sa-L4b | L4b-6068-order | assembler | 7138 | troop:6068 Webspinner |  | Prototype runs damage(enemyAll) before status poison(enemyAll): skill-damage events precede status-apply. Observable differences are limited (an enemy killed by the hit never receives Poison / its status-apply event), final HP/status outcome otherwise identical. English clause order matches the runtime, native order does not. → batch-05 7138: poison then damage (R001); B02 binding/lethal tests updated, it.fails flipped |  |
| 2026-09-27T20:04 | sa-L4b | L4b-7030-dragon | assembler | 8557 | troop:7030 Veneratus |  | batch-r8 8557 = transform(Red, Yellow): plain Yellow gems → batch-r8 8557 transformToSpecial Red -> dragonGem Yellow |  |
| 2026-09-27T20:04 | sa-L4b | L4b-7276-singlegem | assembler | 8901, 6111, 7092, 7169, 7480, 1067 | troop:7276 DoomedGargoyle |  | batch-r4 8901 = transformToSpecial(CHOSEN,...): converts ALL gems of a chosen colour → batch-r4 8901 transformToSpecial('CELL', uberDoomSkull); related family (6111/7092/7169/7480/weapon:1067) still to review |  |
| 2026-09-27T20:04 | sa-L4b | L4b-7195-order | assembler | 8782 | troop:7195 TrkNala |  | batch-36 8782 = inflict(marked, enemyFront) then transform → batch-36 8782 transform before inflict marked |  |
| 2026-09-27T20:04 | sa-L4b | L4b-6824-random-ally | assembler+data | 8234, 6824 | troop:6824 Crysturtle | `gowSnapshotOverrides.json` | batch-14 8234 uses allyChosen (submerged then barrier): needs a chosen ally, cast is refused without one; order reversed; zh says 一名盟友 → batch-14 8234 barrier allyRandom + submerged lastTarget; zh via gowSnapshotOverrides.json troop 6824 + pool-14 |  |
| 2026-09-27T20:04 | sa-L4b | L4b-6841-prefnotprev | assembler | 8246 | troop:6841 SirQuentinHadley |  | enemyRandomN n 2: distinct targets only, a lone enemy is hit once (same class as lane-L7 L7-7344; engine has enemyRandomPrefNotPrev) → batch-08 8246 dmg enemyRandom + dmg enemyRandomPrefNotPrev |  |
| 2026-09-27T20:04 | sa-L4b | L4b-7068-potion-colour | assembler | 8596 | troop:7068 FountainOfStars |  | prototype toSpecial 'manaPotionGem' without colour → batch-r21 8596 manaPotionGem color Purple |  |
| 2026-09-27T20:04 | sa-L4b | L4b-7270-dragon | assembler | 8889 | troop:7270 Morganite |  | prototype creates 3 plain Brown gems → batch-r8 8889 createSpecialGems dragonGem Brown x3 |  |
| 2026-09-27T20:04 | sa-L4b | L4b-7071-base | assembler | 8599 | troop:7071 LivingQuartz |  | prototype count base 0 (only 2 per Brown troop) → batch-r13 8599 createSkulls base 2 |  |
| 2026-09-27T20:04 | sa-L4b | L4b-7499-dragon | assembler | 9244 | troop:7499 Venerabilax |  | prototype transform Brown -> plain Yellow (same family as L4b-7030-dragon, L4b-7270-dragon) → batch-r11 9244 transformToSpecial Brown -> dragonGem Yellow |  |
| 2026-09-27T20:52 | sa-L5 | R004 (L5-004,L5-005,L5-014,L4b-6340) | primitive | 7561, 8403, 7338, 8668, 8752, 7392, 7444, 7371, 7359, 7185, 7333, 7361, 7364, 8393, 7740 | troop:6406 Waverider；weapon:1368 Lockstone；weapon:1142 Dragonator8000；weapon:1436 TrickAndTreat；troop:7182 TheGemini；troop:6249 Penitent；weapon:1147 CryptKeeper；troop:6229 SandCobra；troop:6217 Creeper；weapon:1072 SpidersKiss；troop:6192 Borealis；troop:6219 Moa；troop:6222 Khopeshi；troop:6924 HeartOfRage；troop:6546 Senita | `src/engine/skills/effects/status.ts`<br>`src/engine/TurnEngine.ts`<br>`src/engine/CombatResolver.ts`<br>`scripts/spell-rules.md`<br>`.kiro/specs/combat-mechanics/GOW-STATUS-RESEARCH.md`<br>`.kiro/specs/battle-skill-system/requirements.md`<br>`tests/unit/statusDurationsR004.test.ts` | every non-poison/barrier/enchanted status counted turns down and expired after 3 owner turn-starts; each negative rolled its own 10% cumulative cleanse (Cursed: 5% base); Submerged was in the natural-cleanse set; Enraged/Reflect/Blessed/Submerged also expired on the 3-turn timer; Blessed/Submerged not removed on cast or skull hit → negatives have no turn cap: one shared cumulative self-cleanse per owner turn (10%, +10%/turn, +5% while Cursed, cap 100%), success removes all recoverable negatives; gaining any negative (new or re-applied, incl. Poison) resets to 10% (Bleed: only a stack after the 4th resets); Poison never self-cleanses; Death Mark roll unchanged. Enraged ends on dealing skull damage, Barrier/Reflect on taking damage, Enchanted on cast, Submerged/Blessed when the holder casts or deals skull damage as front troop; none has a timer | every status source: all Cause* spell steps, status gems (enrage/submerge/stun gem turns now ignored), trait-applied statuses, random status pools; RNG draw count per turn start changes (one recovery roll per character instead of one per status) |
| 2026-09-27T20:52 | sa-L5 | R004-tests | test | 7143, 7548, 8403, 7561 | troop:6073 TheSilentOne；troop:6393 DragonTurtle；weapon:1368 Lockstone；troop:6406 Waverider | `tests/unit/castTurnLifecycle.test.ts`<br>`tests/unit/gowCommonStatusRules.test.ts`<br>`tests/unit/passTurn.test.ts`<br>`tests/unit/positiveStatus.test.ts`<br>`tests/unit/statusEffect.test.ts`<br>`tests/unit/statusFaerieFire.test.ts`<br>`tests/unit/statusGems.test.ts`<br>`tests/unit/webStatus.test.ts`<br>`tests/unit/gowWorker02Completion.test.ts`<br>`tests/unit/gowLaneL5B01.test.ts` | core tests asserted the 3-turn countdown (req 9.5), per-status recovery, Cursed 5% base, web chance in magnitude; worker02 6073/6393 asserted a caster's own Blessed blocks the self status of its cast; L5B01 asserted Silence 3->2 and Submerged 3-tick expiry → assertions rewritten to R004: no countdown, shared recoveryChance, Cursed 10% start +5%; worker02 6073 self Silence now lands on caster id 0 and 6393 self Submerge lands (caster Blessed ends on cast); L5B01 FIXED L5-004/L5-005 cases; signoff sha256 refreshed (round2-worker-02 x7, lane-L5 b01) | test evidence only |
| 2026-09-27T21:02 | sa-L2 | L2-1620-random-bleed | assembler | 9523, 9524, 9525 | weapon:1620 FloweringThorn；weapon:1621 SeedStriker；weapon:1622 HeavensBarb | `src/engine/skills/curated/batch-w04.ts`<br>`src/data/gowWeaponReviewedOverrides.json`<br>`tests/unit/gowLaneL2B02Repro.test.ts` | InflictEffectOnRandomTroops AllEnemies steps were folded into one status enemyAll with stacks=N: 9523 put 9 Bleed layers on every enemy (4 applications), 9524/9525 gave every enemy 2x Faerie Fire/Entangle (+8 Bleed); 9524 damage ran last, 9525 bleed first → One status segment per native step: enemyRandomN n=Amount (distinct random living enemies, all survivors when fewer); 9523 = 2,2,2,2,1 Bleed (9 applications, 5 on a lone enemy, cap 4); 9524 = damage then faerie-fire n2, entangle n2 (native order); 9525 = faerie n2, entangle n2, bleed n3,n3,n2, damage; override entries added so regeneration keeps them | Only these three weapon spells; other InflictEffectOnRandomTroops rows (UseCounterForAmount per-destroyed/per-count families) unchanged |
| 2026-09-27T21:03 | sa-L2 | L2-6958-order | assembler | 8458 | troop:6958 KoboldKnight | `src/engine/skills/curated/batch-r4.ts`<br>`tests/unit/gowLaneL2B02Repro.test.ts` | Damage enemyFirstN n2 ran before Stun: a spellblock (50% spell reduction) front enemy took 6 instead of 12 → R001 native order: Stun first 2 enemies, then [Magic+2] damage (stun suppresses traits), then oneOf extra turn / 12 armor | troop:6958 only |
| 2026-09-27T21:17 | sa-L3 | L3-001 | assembler | 8632, 8633, 8634, 8635 | troop:7097 NaturebornWolf；troop:7098 FirebornEagle；troop:7099 WaterbornOwl；troop:7100 StonebornLion | `src/engine/skills/curated/batch-r14.ts`<br>`tests/unit/gowLaneL3B01Repro.test.ts` | Prototype Damage(enemyChosen) then Cause* (entangle/burning/frozen/stun); an enemy killed by the hit never received the status → batch-r14 8632-8635: inflict(status, enemyChosen) before dmg (native CauseX FromTarget -> Damage, R001); ifTargetDied still keyed on the damage segment |  |
| 2026-09-27T21:17 | sa-L3 | L3-002 | assembler | 7431 | troop:6285 Frostling | `src/engine/skills/curated/batch-r5.ts` | Freeze/Web a random enemy; mana halve (floor(manaCost/2)) if 13+ Blue → batch-r5 7431: Freeze enemyChosen + Web lastTarget (native Target Enemy); fixed +4 Mana if 13+ Blue (GenerateMana StatusAmount 4) |  |
| 2026-09-27T21:17 | sa-L3 | L3-003 | assembler | 8795 | troop:7208 EternalSentinel | `src/engine/skills/curated/batch-r14.ts` | createSpecialGems gargoyleGem without tier (always Good) → batch-r14 8795: createSpecialGems2 gargoyleGem tier 1/tier 2 per-gem mix (native CreateGems2Colors GoodGargoyle/BadGargoyle) |  |
| 2026-09-27T21:17 | sa-L3 | L3-004 | primitive | --keys | troop:7313 RelicKnight | `src/engine/skills/effects/buff.ts` | buffOne('mana') ignored Silence: spell mana grants filled silenced troops → buffOne('mana') returns 0 for positive gains when !canGainMana (Silence), same gate as ManaDistributor/Enchanted | Every spell/steal mana gain via buffEffect/applyBuffGain (GenerateMana/Half/Quarter/Full, StealMana refill, mana fraction/halve); only changes outcomes for silenced recipients |
| 2026-09-27T21:17 | sa-L3 | L3-007 | assembler | 8598, 9513, 9534, 9784, 9957 | troop:7070 SkyScorpion；troop:7613 BlightedHusk；troop:7625 Mantichoras；troop:7778 BloodSpore；troop:7882 Manasa | `src/engine/skills/curated/batch-r5.ts`<br>`src/engine/skills/curated/batch-p39.ts`<br>`src/engine/skills/curated/batch-r9.ts`<br>`src/engine/skills/curated/batch-37.ts`<br>`src/engine/skills/curated/batch-r3.ts` | Native DecreaseMana (drain) assembled as steal(mana->mana): caster refilled with the drained mana → reduce(..., 'mana', N, 0) (drain only, no refill); other clauses of 9534/9784 unchanged and still unreviewed |  |
| 2026-09-27T21:17 | sa-L3 | L3-008 | assembler | 7265, 8598, 8654, 9051, 9067 | troop:6151 Psion；troop:7070 SkyScorpion；troop:7111 Oneiros；troop:7401 LeapingSpider；troop:7418 VoidManticore | `src/engine/skills/curated/batch-r1.ts`<br>`src/engine/skills/curated/batch-r5.ts`<br>`src/engine/skills/curated/batch-r4.ts` | reduce()/steal() default mult=1: fixed native DecreaseMana Amount N drained N + Magic → reduce(..., 'mana', N, 0): fixed N (no SpellPowerMultiplier in native); lane-L3/mana-audit.mjs SUSPECT-MULT now 0 |  |
| 2026-09-27T21:17 | sa-L3 | L3-009 | primitive | 8598 | troop:7070 SkyScorpion | `src/engine/TurnEngine.ts` | oncePerBattle refused any cast whose skillId appeared anywhere in actionLog (enemy or other ally casting the same spell disabled it) → castSkill refuses only if this troop (same side + characterId) already cast that skillId (native DisableMySpell Target Self) | All skillOnce/oncePerBattle prototypes (DisableMySpell) |
| 2026-09-27T21:17 | sa-L3 | L3-010 | assembler | 7668 | troop:6481 ChampionOfAnu | `src/engine/skills/curated/batch-r4.ts` | drainAll before stun/silence: a Mana Shield target kept its mana → batch-r4 7668: stun -> silence -> drainMana -> damage (native order, R001) |  |
| 2026-09-27T21:17 | sa-L3 | L3-011 | assembler | 7395 | troop:6252 DRACOS-1337 | `src/engine/skills/curated/batch-06.ts` | silence before stun → batch-06 7395: stun -> silence -> drain -> 30% execute (native order, R001) |  |
| 2026-09-27T21:17 | sa-L3 | L3-012 | primitive | 9816 | troop:7796 Jellymaid | `src/engine/skills/targeting.ts`<br>`src/engine/skills/curated/batch-r15.ts` | No ally prefer-not-previous mode; 9816 second triple re-rolled allyRandom (same ally possible) → New TargetMode allyRandomPrefNotPrev (prefer living ally != lastTarget, reuse if alone); batch-r15 9816 second Cleanse uses it | New mode only; 16 other pending native RandomPrefNotPrevAlly spells (e.g. 7666, 7786, 7945, 8024, 8390, 8650, 9199, 8970, 9528-9531, 9641, 9776, 9874, weapon 7654) still assembled without it |
| 2026-09-27T21:37 | sa-L1 | L1-7260-target | assembler | 8894 | troop:7260 DeathlockDreilak | `src/engine/skills/curated/batch-r13.ts` | curse + death-mark on allyChosen; enemyBelowTarget anchored on the chosen ally's slot → curse + death-mark on enemyChosen (native Target Enemy, FromTarget); damage to enemies below the chosen enemy |  |
| 2026-09-27T21:37 | sa-L1 | L1-7260-target | data | 8894 | troop:7260 DeathlockDreilak | `src/data/gowSnapshotOverrides.json`<br>`scripts/curated-pools/pool-39.json`<br>`src/data/troops.json` | zh description 使一名盟友陷入诅咒和死亡标记状态 → zh description 使一名敌人陷入诅咒和死亡标记状态 (override + batch desc + pool; build_troops.mjs) |  |
| 2026-09-27T21:37 | sa-L1 | L1-6453-order | assembler | 7631 | troop:6453 Umberwolf | `src/engine/skills/curated/batch-r7.ts` | damage first-2 -> Hunter's Mark -> Death Mark -> transform (a lethal hit let enemyFirstN re-select the third enemy for both marks) → Death Mark -> Hunter's Mark -> damage -> transform Nosferatu (native order, R001) |  |
| 2026-09-27T21:37 | sa-L1 | L1-6378-pool | assembler | 7533 | troop:6378 Cocoon | `src/engine/skills/curated/batch-r4.ts` | summon pool = 11 spider troops (SpiderQueen, SpiderKnight, TheSpiderThrone...; no Webspinner) → pool = native Summoning 6136/6110/6395/6512/6068 (SpiderSwarm, GiantSpider, Spinnerette, TombSpider, Webspinner) |  |
| 2026-09-27T21:37 | sa-L1 | L1-6534-order | assembler | 7728 | troop:6534 Viper | `src/engine/skills/curated/batch-34.ts` | damage -> charm -> poison → charm -> damage -> poison (native order, R001); Charm itself still source-dispute L1-charm-instant |  |
| 2026-09-27T21:37 | sa-L1 | L1-1351-pool | assembler | 8357, 7947, 8389 | weapon:1351 ChaliceOfEyes；weapon:1222 JarOfEyes；troop:7606 OcularenEgg | `src/engine/skills/curated/batch-w02.ts`<br>`src/engine/skills/curated/batch-08.ts`<br>`src/data/gowWeaponReviewedOverrides.json` | kingdom 3039 summon pool = 4 Ocularen troops → pool = all 6 raw KingdomId 3039 troops (+Xerodar 6609, WatchMother 6606); weapon rows preserved in gowWeaponReviewedOverrides.json |  |
| 2026-09-27T21:37 | sa-L1 | L1-6469-order | assembler | 7647 | troop:6469 Tzathoth | `src/engine/skills/curated/batch-r22.ts` | damage -> web -> 20% devour → 20% devour -> web -> damage on the same target (native Consume first, R001) |  |
| 2026-09-27T21:37 | sa-L1 | L1-consume-first | assembler | 7210, 7293, 8890, 8891 | troop:6118 Kerberos；weapon:1129 BlackManacles；troop:7271 VrawkDaemon；troop:7272 SeaScavenger | `src/engine/skills/curated/batch-r22.ts`<br>`src/engine/skills/curated/batch-w01.ts`<br>`src/engine/skills/curated/batch-r19.ts` | damage before devour; 8890/8891 used a plain 20% execute (no stat gain) → devour first then damage on lastTarget (native Consume first, R001); 8890/8891 real devour (gains Attack/Armor/Life) |  |
| 2026-09-27T21:37 | sa-L1 | L1-devour-double-roll | primitive | --keys | troop:6118 Kerberos；troop:6469 Tzathoth；troop:7271 VrawkDaemon；troop:7272 SeaScavenger；weapon:1129 BlackManacles | `src/engine/skills/prototypes.ts` | runSegment gated devour segments on chance and devourEffect rolled again: p^2 (40% -> 16%); failed gate dropped target tracking; chanceBoost only in the gate → runSegment skips the generic chance gate for kind devour; devourEffect gets chance, chanceMult and chanceBoost (one roll per target) | every devour segment with chance < 1 or chanceBoost (troop:6118, 6161, 6275, 6410, 6469, 6601, 7271, 7272, weapon:1129 and chance-boosted devours such as 9364/9492); RNG stream shortens by one roll per such cast |
| 2026-09-27T22:33 | sa-L3 | L3-015 | assembler | 8580, 8638, 9847, 7952, 7963, 7973, 8053, 8077, 8078 | troop:7052 Swanmay；troop:7103 WaterWeird；troop:7806 SetauriSkulk；weapon:1226 DoomedBlade；weapon:1229 DoomedClub；weapon:1233 DoomedCrossbow；weapon:1248 DoomedGlaive；weapon:1257 DoomedAxe；weapon:1258 DoomedScythe | `src/engine/skills/curated/batch-r20.ts`<br>`src/engine/skills/curated/batch-18.ts`<br>`src/engine/skills/curated/batch-w02.ts`<br>`src/data/gowWeaponReviewedOverrides.json` | Native GenerateMana UseCounterForAmount without Amount assembled as base N + N x count → mana(..., 0, 0, modifier N x count): counter only; weapon overrides JSON entries added for the 6 Doomed weapons | none (7632 and weapon 7806 same pattern, left open) |
| 2026-09-27T22:33 | sa-L3 | L3-016 | assembler | 7952, 7963, 7973, 8053, 8077, 8078 | weapon:1226 DoomedBlade；weapon:1229 DoomedClub；weapon:1233 DoomedCrossbow；weapon:1248 DoomedGlaive；weapon:1257 DoomedAxe；weapon:1258 DoomedScythe | `src/engine/skills/curated/batch-w02.ts`<br>`src/data/gowWeaponReviewedOverrides.json` | if the Enemy has a Doom, create 5 more -> createSkulls(5): plain Skulls → createSpecialGems doomSkull x5 with ifCond targetHasDoom (native Color1 Doomskull) | none |
| 2026-09-27T22:33 | sa-L3 | L3-017 | assembler | 7032 | troop:6032 Satyr | `src/engine/skills/curated/batch-r15.ts` | damage(enemyLast Magic+4) then steal 2 Armor -> Magic → steal Armor->Magic first, then damage with the raised Magic (native order, R001; English 'then deal') | none |
| 2026-09-27T22:33 | sa-L3 | L3-018 | assembler | 7035 | troop:6035 BladeDancer | `src/engine/skills/curated/batch-r1.ts` | steal('enemyRandom','mana','mana',4): moved 4 Mana → steal('enemyRandom','magic','magic',4): native StealMagic 4 | none |
| 2026-09-27T22:45 | sa-L2 | L2-random-status-pools | primitive | --keys | troop:7326 Beltane | `src/engine/skills/effects/status.ts`<br>`src/data/traits.json`<br>`scripts/build_traits.mjs`<br>`tests/unit/traitMisc.test.ts`<br>`tests/unit/primitivesWave3.test.ts`<br>`tests/unit/traitCombatMechs.test.ts`<br>`tests/unit/gowLaneL2B03Repro.test.ts` | Random negative pool = 12 ids incl. Charm (not an official status) and without Faerie Fire/Hunter's Mark/Lycanthropy/Terror; default random positive pool = barrier/rage/submerged only; RandomPositiveStatusEffect (pool positive) drew from POSITIVE_STATUS_IDS which lists Enrage twice (enraged + rage alias) -> Enrage 2/7 → Pools follow official-status-effects.html: negative 15 ids (poison, burning, bleed, silence, frozen, stun, entangle, web, disease, curse, death-mark, faerie-fire, marked, lycanthropy, terror), positive 6 ids (barrier, blessed, enchanted, enraged, reflect, submerged), equal odds; pool positive uses the 6-id pool; experiment trait pool (traits.json + build_traits.mjs) mirrors the negative pool | Every randomStatus segment without allPositive (about 98 ledger rows: RandomStatusEffect / RandomPositiveStatusEffect / RandomNegative families), trait castRandomStatus goodtarot/badtarot, experiment onBigMatchStatus. allPositive (8668/8084) and gargoyle gem pools unchanged. Only accepted row touched: none (weapon:1436 uses allPositive). |
| 2026-09-27T22:45 | sa-L2 | L2-6416-branch-weights | assembler | 7574 | troop:6416 Diviner | `src/engine/skills/curated/batch-r18.ts`<br>`tests/unit/gowLaneL2B03Repro.test.ts` | Randomize A+(B-C-D-E-F) folded into oneOf of 3 distinct options (Enchant / Magic / Cleanse, 1/3 each) → oneOf of the 5 native options in order Cleanse, Enchant, Magic, Cleanse, Enchant (Cleanse 2/5, Enchant 2/5, Magic 1/5) | troop:6416 only; other rows whose native branch count differs from oneOf length listed in lane-L2/tools/branchweights-2026-09-28.txt for later review |
| 2026-09-27T22:45 | sa-L2 | L2-singlegem-cell | assembler | 8722, 9197 | troop:7169 Limpet-bot；troop:7480 RuneChanter | `src/engine/skills/curated/batch-37.ts`<br>`src/engine/skills/curated/batch-r15.ts`<br>`tests/unit/gowLaneL2B03Repro.test.ts` | ConvertGems BoardTarget SingleGem (spell Target Board) modelled as transformToSpecial ANY count 1: a random gem became the Bomb / Yellow Lightning Gem → transformToSpecial CELL: the player-chosen gem (CellChooser) is converted (same as 8901/9638) | Only 8722 and 9197; the other two SingleGem ConvertGems rows (8901, 9638) already used CELL |
| 2026-09-27T23:00 | coord | R005-test-sync | test | 7504 | troop:6352 HighPaladin | `tests/unit/gowLaneL7B01.test.ts`<br>`tests/unit/gowLaneL7B05.test.ts`<br>`tests/unit/gowLaneL1B02Repro.test.ts` | L7 tests asserted strongest = Life only; L1 repro cases were plain failing it() → L7 tests assert R005 Life+Armor ranking; L1 charm/6160 repros marked it.fails; evidence sha256 refreshed in lane signoffs and reviews.json | no runtime change |
| 2026-09-27T23:00 | sa-L5 | R005 (L7-6352-b, L4b-strongest-metric) | primitive |  |  | `src/engine/skills/targeting.ts` | Strongest/Weakest targets ranked by current Life only → ranked by current Life + Armor (targeting.ts line ~148 c.hp + c.armor); logged by coord after sa-L5 run was interrupted | every Strongest*/Weakest*/Two* target mode (~70 native steps) |
| 2026-09-28T00:08 | sa-P | P-counter-per-step | primitive | 7252, 7454, 7470, 7489, 7644, 7747, 7765, 7930, 7975, 7983, 8103, 8113, 8139, 8203, 8204, 8218, 8219, 8228, 8238, 8251, 8560, 8562, 8563, 8624, 8626, 8674, 8713, 8751, 8785, 8820, 8987, 9064, 9184, 9512, 9522, 9547, 9591, 9597, 9673, 9733, 9739, 9774, 9852, 9882, 7568 | troop:7198 NaturebornHunter；troop:6320 Tesla | `src/engine/skills/effects/secondary.ts`<br>`src/engine/skills/curated/batch-community.ts` | modifierBonus summed all sources then applied one ratio floor → R007-1: ratio modifiers floor each source (native Count* step) separately then sum; multiplier unchanged; ModifierSpec.pooled keeps combined floor (community Lianka/YeLuo only) | 46 multi-source ratio prototypes (incl. gw_Runeforger); troop:6320 7470 accepted value changes (armor 50 case 25->24) |
| 2026-09-28T00:08 | sa-F1 | F1-doomed-random-skill | assembler | 10003, 10005, 10006, 10008 | weapon:1706 DoomedLocket；weapon:1708 DoomedLavalliere；weapon:1709 DoomedPendant；weapon:1711 DoomedMhuineal | `src/engine/skills/curated/batch-w04.ts`<br>`src/data/gowWeaponReviewedOverrides.json`<br>`scripts/curated-pools/pool-w01.json` | randomStat allyRandom base 1 mult 0 (Magic ignored), points split across skills; zh said 1 point to a random ally → native IncreaseRandom@FromTarget 1 +Mx1: chosen ally, [Magic + 1] to one random Skill (oneSkill), tempering +3/level kept; zh [魔法 + 1] |  |
| 2026-09-28T00:14 | sa-P | P-random-stat-pool | primitive | 7236, 7310, 7319, 7323, 7340, 7482, 7560, 7596, 8165, 8166, 8499, 8500, 8549, 8684, 8686, 8859, 8967, 9241, 9485, 9514, 9640, 9849, 9861, 9909, 7240, 7244, 8440 | troop:6775 CorruptMagus；troop:7817 GreenHag | `src/engine/skills/effects/debuff.ts` | DecreaseRandom/StealRandom rolled attack/armor/magic (3-stat pool) → R007-2: 4-Skill pool attack/armor/hp/magic equal odds; Life reduced directly (no armor/barrier); StealRandom Life grows caster Life+max Life (IncreaseHealth) | all reduce stat='random' segments (~30 prototypes incl. gw_EyeOfXathenos, gw_StaffOfMadness, gw_ScarabOfNefertani); rng draws nextInt(4) instead of nextInt(3) |
| 2026-09-28T00:16 | sa-F1 | F1-6931-dispel | assembler | 8438 | troop:6931 DaemonGnome | `src/engine/skills/curated/batch-r7.ts` | execute damage on a random enemy (no Dispel; a Barrier absorbed the kill) → native Dispel@RandomEnemy (all positive statuses) then LethalDamage@FromPrevious, run away |  |
| 2026-09-28T00:16 | sa-F1 | F1-1377-target | assembler | 8440 | weapon:1377 ScarabOfNefertani | `src/engine/skills/curated/batch-w03.ts`<br>`src/data/gowWeaponReviewedOverrides.json` | DecreaseRandom on lastTarget as first segment (no target, step did nothing) → DecreaseRandom@FromTarget = chosen enemy, [Magic + 1] |  |
| 2026-09-28T00:16 | sa-F1 | F1-remove-order | assembler | 7349, 7596, 7146, 7478 | troop:6207 SpiritFox；troop:6423 CatSith；troop:6076 GoblinKing；troop:6328 Krystenax | `src/engine/skills/curated/batch-25.ts`<br>`src/engine/skills/curated/batch-r12.ts`<br>`src/engine/skills/curated/batch-30.ts`<br>`src/engine/skills/curated/batch-r18.ts` | gems removed first, effect counted destroyedGems after a mid-spell cascade → native order (R001): count board gems of the colour, apply effect, then RemoveColor |  |
| 2026-09-28T00:17 | sa-F3 | F3-q02 | assembler | 9936 | weapon:1696 TauraeusCleaver | `src/engine/skills/curated/batch-w04.ts`<br>`src/data/gowWeaponReviewedOverrides.json` | splash damage 1 flat (Magic dropped); stray x5 multiplier on Armor buff → splash [Magic + 3]; Attack/Life/Armor +5 each with Immortal Tauraeus; zh desc repaired |  |
| 2026-09-28T00:17 | sa-F3 | F3-q03 | assembler | 7720 | troop:6527 Arcanus | `src/engine/skills/curated/batch-r18.ts` | damage then dispel → dispel positives on chosen enemy, then damage (native order) |  |
| 2026-09-28T00:17 | sa-F3 | F3-q04 | assembler | 7780 | troop:6576 FestivalCow | `src/engine/skills/curated/batch-r2.ts` | gave 2 Mana; no self-dispel before sacrifice (Barrier blocked it) → gives 2 Magic; dispels own positive statuses, then sacrifice |  |
| 2026-09-28T00:17 | sa-F3 | F3-q05 | assembler | 7317 | weapon:1140 CreepingDeath | `src/engine/skills/curated/batch-w01.ts`<br>`src/data/gowWeaponReviewedOverrides.json` | no damage; Death Mark strongest then weakest → damage all [Magic + 1], then Death Mark weakest, then strongest |  |
| 2026-09-28T00:17 | sa-F3 | F3-q06 | assembler | 8097 | troop:6727 Grimcorn | `src/engine/skills/curated/batch-34.ts` | Curse only if already Cursed → always Curse after the (doubled-if-Cursed) hit |  |
| 2026-09-28T00:17 | sa-F3 | F3-q07 | assembler | 7646 | troop:6468 DwarvenHunter | `src/engine/skills/curated/batch-r24.ts` | damage on lastTarget: no events when dispels skipped → damage on chosen enemy after dispels |  |
| 2026-09-28T00:17 | sa-F3 | F3-q08 | assembler | 9942 | troop:7867 TheWebbedPrince | `src/engine/skills/curated/batch-r7.ts` | single execute-only segment: no damage at all → slay roll 15% +3%/Web gem, then [Magic + 4] damage |  |
| 2026-09-28T00:17 | sa-F3 | F3-q18 | assembler | 7022 | troop:6022 MistStalker | `src/engine/skills/curated/batch-11.ts` | Poison re-targeted weakest (after kill hit another enemy, kill bonus lost) → Poison the damaged target only; kill gives 3 Magic |  |
| 2026-09-28T00:17 | sa-F3 | F3-q19 | assembler | 9661 | troop:7700 Gormungandr | `src/engine/skills/curated/batch-r19.ts` | Bless/Enchant on kill read lastTarget after enemyAll armor step (never fired) → Bless/Enchant on castEnemyDied |  |
| 2026-09-28T00:17 | sa-F3 | F3-q20 | assembler | 7297 | troop:6165 WinterImp | `src/engine/skills/curated/batch-19.ts` | Freeze only if first scatter victim died → Freeze all enemies if any enemy died |  |
| 2026-09-28T00:17 | sa-F3 | F3-q21 | assembler | 7791 | troop:6587 UrskaDragoon | `src/engine/skills/curated/batch-r7.ts` | Rage given to enemy; separate +10 hit gated on post-hit damage → +10 in the same hit if target damaged before it; Enrage self on kill |  |
| 2026-09-28T00:17 | sa-F3 | F3-q22 | assembler | 9986 | troop:7902 TheWeepingDuchess | `src/engine/skills/curated/batch-r22.ts` | 3 distinct random enemies (enemyRandomN); Terror on anyTrackedDied → 3 x RandomPrefNotPrev hits; Terror when any enemy died |  |
| 2026-09-28T00:17 | sa-F3 | F3-q23 | assembler | 7368 | troop:6226 Amira | `src/engine/skills/curated/batch-12.ts` | damage then steal Magic → steal 2 Magic then true damage (uses stolen Magic) |  |
| 2026-09-28T00:17 | sa-F3 | F3-q24 | assembler | 9616 | troop:7681 Skulker | `src/engine/skills/curated/batch-17.ts` | damage, steal, slay roll → steal, slay roll, damage (native order) |  |
| 2026-09-28T00:17 | sa-F3 | F3-q25 | assembler | 7396 | troop:6253 SatyrMusician | `src/engine/skills/curated/batch-r15.ts` | damage, steal, silence → steal, damage, silence (native order) |  |
| 2026-09-28T00:17 | sa-F3 | F3-q26 | assembler | 7287 | weapon:1126 DustAndSand | `src/engine/skills/curated/batch-w01.ts`<br>`src/data/gowWeaponReviewedOverrides.json` | pull front then armor reduction → armor reduction then pull front |  |
| 2026-09-28T00:17 | sa-F3 | F3-q27 | assembler | 7307 | weapon:1137 ServeAndProtect | `src/engine/skills/curated/batch-w01.ts`<br>`src/data/gowWeaponReviewedOverrides.json` | armor, move front, barrier → armor, barrier others, move front |  |
| 2026-09-28T00:17 | sa-F3 | F3-q28 | assembler | 7139 | troop:6069 Orion | `src/engine/skills/curated/batch-p37.ts` | damage, mark, magic → damage, magic, mark |  |
| 2026-09-28T00:17 | sa-F3 | F3-q29 | assembler | 7050 | troop:6050 RexWarrior | `src/engine/skills/curated/batch-11.ts` | cleanse self then damage → damage, cleanse self, +4 Attack on kill (castEnemyDied) |  |
| 2026-09-28T00:17 | sa-F3 | F3-q30 | assembler | 10063 | weapon:1720 ThalassasWavemaker | `src/engine/skills/curated/batch-w05.ts`<br>`src/data/gowWeaponReviewedOverrides.json` | 2 random hits then both knocked back → hit random, knock back, hit RandomPrefNotPrev, knock back |  |
| 2026-09-28T00:17 | sa-F3 | F3-q32 | assembler | 7558 | troop:6403 Merlion | `src/engine/skills/curated/batch-r15.ts` | both hits then Silence chosen + a re-rolled random enemy → hit chosen, Silence it, hit RandomPrefNotPrev, Silence that one |  |
| 2026-09-28T00:17 | sa-F3 | F3-q33 | assembler | 8112 | troop:6742 Scarabi | `src/engine/skills/curated/batch-03.ts` | Stun/Poison re-rolled random enemies → per hit: damage, Stun and Poison the same enemy |  |
| 2026-09-28T00:17 | sa-F3 | F3-q34 | assembler | 9851 | troop:7810 ToxicPuffer | `src/engine/skills/curated/batch-r9.ts` | Poison re-rolled 3 random enemies → per hit: damage then Poison the same enemy (3 hits, PrefNotPrev) |  |
| 2026-09-28T00:17 | sa-F3 | F3-q35 | assembler | 7295 | weapon:1131 LionAndTiger | `src/engine/skills/curated/batch-w01.ts`<br>`src/data/gowWeaponReviewedOverrides.json` | pull front, damage, stun → damage, stun, pull front (native order) |  |
| 2026-09-28T00:17 | sa-F3 | F3-q37 | assembler | 9282 | troop:7525 AldricTheFrostbound | `src/engine/skills/curated/batch-r19.ts` | Life steal then Curse/Freeze → Curse, Freeze, then Life steal |  |
| 2026-09-28T00:17 | sa-F3 | F3-q38 | assembler | 9879 | troop:7835 Onouris | `src/engine/skills/curated/batch-29.ts` | damage then Bleed on re-evaluated strongest → Bleed x4 on two strongest, then damage |  |
| 2026-09-28T00:18 | sa-F2 | F2-6607-steal-mult | assembler | 7931 | troop:6607 OcularenLeech | `src/engine/skills/curated/batch-03.ts` | steal enemyFront attack base 1 mult 0 → steal base 1 mult 1 ([Magic + 1], native StealAttack SpellPowerMultiplier 1) |  |
| 2026-09-28T00:18 | sa-F2 | F2-6991-explode-mult | data | 8497 | troop:6991 Ironhawk | `src/engine/skills/curated/batch-15.ts`<br>`src/data/gowSnapshotOverrides.json`<br>`scripts/curated-pools/pool-15.json` | explode 1 random gem (mult 0); zh 并炸毁一个宝石 → explode [(Magic / 2) + 1] random gems (mult 0.5); zh 然后爆破 [(魔法 / 2) + 1] 颗宝石 |  |
| 2026-09-28T00:18 | sa-F2 | F2-7830-heal-mult | data | 9874 | troop:7830 TidalDancer | `src/engine/skills/curated/batch-r2.ts`<br>`src/data/gowSnapshotOverrides.json`<br>`scripts/curated-pools/pool-25.json` | 2 random allies +1 Life (mult 0); zh 1 点生命值 → 2 random allies +[Magic + 1] Life (mult 1); zh [魔法 + 1] 点生命值 |  |
| 2026-09-28T00:18 | sa-F2 | F2-1028-missing-magic | data | 7094 | weapon:1028 TomeOfWizardry | `src/engine/skills/curated/batch-w01.ts`<br>`src/data/gowWeaponReviewedOverrides.json`<br>`scripts/curated-pools/pool-w01.json` | explode a chosen gem only; zh 爆破一颗宝石。 → explode a chosen gem, then all allies +2 Magic (native IncreaseSpellPower@AllAllies 2); zh 爆破一颗宝石，并给予所有盟友 2 点魔力值。 |  |
| 2026-09-28T00:19 | sa-F2 | F2-6265-dispel-last | assembler | 7408 | troop:6265 Sacrifice | `src/engine/skills/curated/batch-p39.ts` | sacrifice last ally directly (Barrier blocked the kill) → dispel positive statuses on last ally, then sacrifice (native Dispel@LastAlly before Damage 10000) |  |
| 2026-09-28T00:19 | sa-F2 | F2-6398-random-dispel | assembler | 7553 | troop:6398 AncientGolem | `src/engine/skills/curated/batch-r18.ts` | per-status dispel on a fresh random enemy each, conditional on holding it → one random enemy dispelled (all positive statuses) and hit by the true damage |  |
| 2026-09-28T00:19 | sa-F2 | F2-6457-dispel-self | assembler | 7635 | troop:6457 FireBomb | `src/engine/skills/curated/batch-r7.ts` | sacrifice self directly (own Barrier blocked it) → dispel own positive statuses, then sacrifice (native Dispel@Self before Damage@Self 10000) |  |
| 2026-09-28T00:19 | sa-F2 | F2-6529-dispel-kill | assembler | 7723 | troop:6529 ZuulGoth | `src/engine/skills/curated/batch-20.ts` | execute chosen enemy without dispel → dispel chosen enemy positive statuses, then execute (native Dispel@FromTarget before LethalDamage) |  |
| 2026-09-28T00:19 | sa-F2 | F2-7728-no-damage | assembler | 9723 | troop:7728 Raquel | `src/engine/skills/curated/batch-r21.ts` | conditional dispelPositives + trueDmg lastTarget: no damage when the enemy had no positive status → unconditional per-status dispel + trueDmg on the chosen enemy |  |
| 2026-09-28T00:19 | sa-F2 | F2-6355-native-order | assembler | 7507 | troop:6355 DarkPriestess | `src/engine/skills/curated/batch-r17.ts` | cleanse; reduce hp 2+M; attack +reduced; barrier; create 8 skulls → native order: cleanse; create 8 skulls; attack +[Magic+2]; damage 1; true damage [Magic+2]; barrier |  |
| 2026-09-28T00:19 | sa-F2 | F2-6754-no-explode | assembler | 8133 | troop:6754 HarpyMage | `src/engine/skills/curated/batch-r18.ts` | skill(storm, explode LAST_TARGET colour) exploded nothing → targetedSkill(allyChosen, storm, explode [Magic+1] gems of the chosen ally's colour) |  |
| 2026-09-28T00:19 | sa-F2 | F2-7338-cross-skulls | data | 8961 | troop:7338 Deathgaunt | `src/engine/skills/curated/batch-r9.ts`<br>`src/data/gowSnapshotOverrides.json`<br>`scripts/curated-pools/pool-16.json` | oneOf row/col (destroyed nothing), boost x6 per any destroyed gem; zh 一行或一列 → destroy chosen row and column (cross), boost x6 per Skull destroyed; zh 一行和一列 |  |
| 2026-09-28T00:19 | sa-F2 | F2-7321-no-events | assembler | 8933 | troop:7321 DrownedCaptain | `src/engine/skills/curated/batch-r15.ts` | skill(explode LAST_TARGET colour, reposition lastTarget) had no spell events → targetedSkill(enemyChosen, explode 5 of the chosen enemy's colour, knock it to the back) |  |
| 2026-09-28T00:24 | sa-F3 | F3-t6550 | assembler | 7744 | troop:6550 Caprinicus | `src/engine/skills/curated/batch-r18.ts` | damage then steal 4 Attack into Magic → steal 4 Attack into Magic, then damage (native order) |  |
| 2026-09-28T00:24 | sa-F3 | F3-t1210 | assembler | 7805 | weapon:1210 Blood-Drinker | `src/engine/skills/curated/batch-w02.ts`<br>`src/data/gowWeaponReviewedOverrides.json` | steal half Attack had a sourceless 2:1 modifier: stole 0; after damage → steal half of target Attack (fraction 0.5), then damage |  |
| 2026-09-28T00:24 | sa-F3 | F3-t7724 | assembler | 9716 | troop:7724 TheSandstoneSentinel | `src/engine/skills/curated/batch-r19.ts` | all Skills = Attack/Armor/Magic only; kill triple never fired (lastTarget = self) → Attack/Armor/Life/Magic +10, +20 more each on kill (castEnemyDied) |  |
| 2026-09-28T00:24 | sa-F3 | F3-t7215 | assembler | 8802 | troop:7215 Petrahulk | `src/engine/skills/curated/batch-r8.ts` | Life boosted x8 per board gem of any kind (+472) → Life boosted x8 per Gargoyle gem (good + bad) |  |
| 2026-09-28T00:25 | sa-F2 | F2-7145-miss-branch | assembler | 8694 | troop:7145 ConsortOfDarkness | `src/engine/skills/curated/batch-r22.ts` | missed slay: lastTarget + lastTargetSurvived stat loss never fired (no spell events); skulls ifTargetDied → unconditional native steps on chosen enemy: -10 Armor, -10 Attack, -10 Magic, 10 true damage; 12 Skulls if an enemy died this cast |  |
| 2026-09-28T00:25 | sa-F2 | F2-6826-kill-skulls | assembler | 8228 | troop:6826 Umenath | `src/engine/skills/curated/batch-r17.ts` | createSkulls ifTargetDied after the self attack buff (checked the caster) -> never created → createSkulls ifCond castEnemyDied |  |
| 2026-09-28T00:25 | sa-F2 | F2-7383-kill-gems | assembler | 9025 | troop:7383 Grimfeather | `src/engine/skills/curated/batch-23.ts` | createGems Purple ifTargetDied on retargeted reduce targets -> never created → createGems Purple 10 ifCond castEnemyDied (If an Enemy dies) |  |
| 2026-09-28T00:25 | sa-F1 | F1-6047-dispel | assembler | 7047 | troop:6047 BlackBeast | `src/engine/skills/curated/batch-r22.ts` | devour chosen ally directly (a Barrier blocked the devour) → native Dispel@FromTarget (positive statuses) before Consume, heal to full, 6 skulls |  |
| 2026-09-28T00:25 | sa-F1 | F1-7674-target | assembler | 9602 | troop:7674 GoblinPickpocket | `src/engine/skills/curated/batch-r12.ts` | no chosen target declared: LAST_TARGET colour unresolved, no gems destroyed → targetedSkill enemyChosen: destroy 4 + gold[10:1] gems of the chosen enemy's colour, +10 gold, extra turn |  |
| 2026-09-28T00:27 | sa-F1 | F1-6387-rebirth | assembler | 7542 | troop:6387 Sunbird | `src/engine/skills/curated/batch-r26.ts` | selfRevive with no self-kill step: Sunbird never died or revived → native Damage@Self 1 + 10000 then selfRevive(full) (summon of a fresh Sunbird blocked by P-F1-summon-after-caster-death) |  |
| 2026-09-28T00:27 | sa-P | P-prefnotprev-semantics | primitive | 7208, 7518, 7945, 8288, 8294, 8410, 8656, 8854, 8881, 9280, 9367, 9370, 9372, 9377, 9483, 9659, 9719, 9721, 9880, 9933, 9935, 9937, 7666, 7786, 8024, 8390, 8650, 9199, 8970, 9528, 9529, 9530, 9531, 9641, 9776, 9874, 7654, 8160 | weapon:1142 Dragonator8000；troop:6479 DivineIshbaala；troop:6582 SifuYuan；troop:6627 TheDeepKing；troop:6678 Qilin；troop:6923 StarryMage；troop:7107 TheMagician；troop:7482 TawaritePriestess；troop:7552 TwoOfSwords；troop:7628 TenOfWands；troop:7629 TenOfCups；troop:7630 TenOfRunes；troop:7631 TenOfSwords；troop:7738 DarkAcrobat；troop:7770 SaviorStatue；troop:7830 TidalDancer；weapon:1179 FestivalStaff；troop:6770 Aquaticus | `src/engine/skills/targeting.ts`<br>`src/engine/skills/effects/damage.ts`<br>`src/engine/skills/prototypes.ts`<br>`src/engine/skills/builders.ts`<br>`src/engine/skills/curated/batch-r18.ts`<br>`src/engine/skills/curated/batch-07.ts`<br>`src/engine/skills/curated/batch-r10.ts`<br>`src/engine/skills/curated/batch-r20.ts`<br>`src/engine/skills/curated/batch-r19.ts`<br>`src/engine/skills/curated/batch-r4.ts`<br>`src/engine/skills/curated/batch-38.ts`<br>`src/engine/skills/curated/batch-r2.ts`<br>`src/engine/skills/curated/batch-w01.ts`<br>`src/engine/skills/curated/batch-r9.ts` | random damage waves / enemyRandomN splash centres preferred not-yet-hit enemies (C3); native RandomAlly+RandomPrefNotPrevAlly assembled as allyRandomN (distinct) or allyRandom → R007-3: waves/splash centres avoid only the previous pick (randomPrefer 'notHit' kept for 8160 plain RandomEnemy x3); new TargetMode allyRandomPrefNotPrevN (each pick avoids only the previous, repeats allowed) for 15 ally chains; 7945 second Submerged allyRandomPrefNotPrev; 9641 damage randomWaves 2; enemyRandomPrefNotPrev (weapon:1142) unchanged, already R007-3 | 22 random-wave/splash prototypes, 16 RandomPrefNotPrevAlly spells; lone-ally casts now apply each native step (2-3 applications) |
| 2026-09-28T00:28 | sa-F2 | F2-6467-life-armor | assembler | 7645 | troop:6467 Mammoth | `src/engine/skills/curated/batch-r18.ts` | remove Blue then normal damage boosted by destroyed gems → native: armor loss + true Life damage (both [Magic+1] boosted by Blue gems on board 3:1), then remove Blue |  |
| 2026-09-28T00:28 | sa-F2 | F2-R001-order | assembler | 7576 | troop:6418 YaoGuai | `src/engine/skills/curated/batch-26.ts` | damage, then steal 4 Magic → steal 4 Magic first (native StealMagic before Damage), then damage, then convert |  |
| 2026-09-28T00:28 | sa-F2 | F2-R001-order | assembler | 7052 | troop:6052 Zombie | `src/engine/skills/curated/batch-05.ts` | remove skulls, heal boosted by destroyed gems → heal boosted by skulls on board at cast start, then remove skulls |  |
| 2026-09-28T00:28 | sa-F2 | F2-R001-order | assembler | 7693 | troop:6504 ClockworkSphinx | `src/engine/skills/curated/batch-13.ts` | destroy chosen colour, armor boosted by destroyed gems → armor boosted by chosen-colour gems on board, then destroy them |  |
| 2026-09-28T00:28 | sa-F2 | F2-6623-column-order | data | 7941 | troop:6623 SilentSentinel | `src/engine/skills/curated/batch-r18.ts`<br>`src/data/gowSnapshotOverrides.json` | explode a random column, then gain Life; zh 爆破一行 → gain Life, then explode the chosen column (native BoardTarget Column); zh 爆破一列 |  |
| 2026-09-28T00:28 | sa-F2 | F2-R001-order | assembler | 7055 | troop:6055 FleshGolem | `src/engine/skills/curated/batch-05.ts` | explode row, then gain Life → gain Life, then explode row, then -1 Magic |  |
| 2026-09-28T00:28 | sa-F2 | F2-R001-order | assembler | 7357 | troop:6215 Northrender | `src/engine/skills/curated/batch-02.ts` | create 8 Blue, then gain Attack → gain Attack, then create 8 Blue |  |
| 2026-09-28T00:28 | sa-F2 | F2-R001-order | assembler | 7761 | troop:6559 DwarvenZombie | `src/engine/skills/curated/batch-20.ts` | convert Green, then armor loss boosted by converted gems → armor loss boosted by Green gems on board, then convert |  |
| 2026-09-28T00:28 | sa-F2 | F2-R001-order | assembler | 7025 | troop:6025 Dryad | `src/engine/skills/curated/batch-04.ts` | barrier, then create 8 Green → create 8 Green, then barrier |  |
| 2026-09-28T00:28 | sa-F2 | F2-R001-order | assembler | 8924 | troop:7312 TheBaneOfMercy | `src/engine/skills/curated/batch-p37.ts` | convert Yellow, then Attack boosted by converted gems → Attack boosted by Yellow gems on board, then convert, then curse |  |
| 2026-09-28T00:28 | sa-F2 | F2-R001-order | assembler | 7232 | troop:6130 Orc | `src/engine/skills/curated/batch-33.ts` | convert Green, then Attack boosted by converted gems → Attack boosted by Green gems on board, then convert, then enrage |  |
| 2026-09-28T00:28 | sa-F3 | F3-t7101 | assembler | 8636 | troop:7101 ValiantPyrea | `src/engine/skills/curated/batch-r20.ts` | +2 Magic flat plus 2 per Elemental Star → 2 Magic per Elemental Star only (native UseCounter, no Amount) |  |
| 2026-09-28T00:28 | sa-F3 | F3-t1272 | assembler | 8130 | weapon:1272 LastHarbor | `src/engine/skills/curated/batch-w02.ts`<br>`src/data/gowWeaponReviewedOverrides.json` | boosted x3 per any Skull → boosted x3 per Doomskull |  |
| 2026-09-28T00:28 | sa-F3 | F3-t6061 | assembler | 7061 | troop:6061 Berserker | `src/engine/skills/curated/batch-r5.ts` | damage split over 2 front enemies; +[Magic+4] Attack → damage the chosen enemy; +4 Attack |  |
| 2026-09-28T00:33 | sa-F1 | P-F1-oneof-chosen-target | assembler | 7348, 7438, 8250, 8407, 8472, 8941, 7194 | troop:6206 Wraith；troop:6292 NightHag；troop:6845 Dementicore；troop:6929 Destruct-o-Bot；troop:6969 S.O.L.A.R；troop:7329 TheSilkenQueen；weapon:1081 VileFlask | `src/engine/skills/curated/batch-r7.ts`<br>`src/engine/skills/curated/batch-r15.ts`<br>`src/engine/skills/curated/batch-r4.ts`<br>`src/engine/skills/curated/batch-37.ts`<br>`src/engine/skills/curated/batch-r9.ts`<br>`src/engine/skills/curated/batch-w01.ts`<br>`src/data/gowWeaponReviewedOverrides.json` | chosen target only inside oneOf: no target requested, spell did nothing; 8407 triple = 3 + 3xMagic; 7194 armor removal only in the poison branch → targetedSkill enemyChosen (native Target Enemy); 8407 triple = 3 x [Magic + 3] (MultiplyIfIHaveMech); 7194 armor removal before either branch |  |
| 2026-09-28T00:33 | sa-F1 | F1-7825-count | assembler | 9869 | troop:7825 DarkSpirit | `src/engine/skills/curated/batch-r19.ts` | one curse per gem destroyed in the blasts (perDestroyed any) → native CountGems Poison: one random curse per Poison Gem exploded |  |
| 2026-09-28T00:33 | sa-F2 | F2-R001-order | assembler | 7024 | troop:6024 GladeWarden | `src/engine/skills/curated/batch-04.ts` | remove Green, then damage boosted by destroyed gems → damage boosted by Green gems on board, then remove Green |  |
| 2026-09-28T00:33 | sa-F2 | F2-R001-order | assembler | 7360 | troop:6218 AstralSpirit | `src/engine/skills/curated/batch-19.ts` | remove chosen colour, then true damage → true damage boosted by chosen-colour gems on board, then remove them |  |
| 2026-09-28T00:33 | sa-F2 | F2-R001-order | assembler | 8468 | troop:6965 FlameMaiden | `src/engine/skills/curated/batch-14.ts` | remove Blue, then damage → damage boosted by Blue gems on board, then remove Blue |  |
| 2026-09-28T00:33 | sa-F2 | F2-R001-order | assembler | 8586 | troop:7058 AstralMother | `src/engine/skills/curated/batch-r1.ts` | remove chosen colour, then true scatter damage → true scatter damage boosted by chosen-colour gems on board, then remove them |  |
| 2026-09-28T00:33 | sa-F2 | F2-1159-boost-source | data | 7577 | weapon:1159 BaatJaamDao | `src/engine/skills/curated/batch-w01.ts`<br>`src/data/gowWeaponReviewedOverrides.json` | remove Purple, then damage whose 4:1 boost had no source (never counted) → damage boosted by Purple gems on board 4:1, then remove Purple |  |
| 2026-09-28T00:33 | sa-F2 | F2-R001-order | data | 8807 | weapon:1479 AegisOfHellcrag | `src/engine/skills/curated/batch-w03.ts`<br>`src/data/gowWeaponReviewedOverrides.json` | remove Brown, then damage → damage boosted by Brown gems on board, then remove Brown |  |
| 2026-09-28T00:33 | sa-F2 | F2-R001-order | assembler | 7065 | troop:6064 Ghoul | `src/engine/skills/curated/batch-r15.ts` | damage, stat loss, destroy 6 → damage, destroy 6, then -1 Attack/Armor/Magic (native order) |  |
| 2026-09-28T00:33 | sa-F2 | F2-R001-order | assembler | 7054 | troop:6054 VampireLord | `src/engine/skills/curated/batch-19.ts` | remove Red, then true damage, then +4 Life → true damage boosted by Red gems on board, remove Red, +4 Life |  |
| 2026-09-28T00:33 | sa-F2 | F2-1120-column-skulls | data | 7272 | weapon:1120 SkullCleaver | `src/engine/skills/curated/batch-w01.ts`<br>`src/data/gowWeaponReviewedOverrides.json` | boost counted every Skull on the board; random target could be the front enemy → boost counts Skulls in the chosen column (native CountGems BoardTarget Column); front enemy anchored so RandomPrefNotPrevEnemy avoids it |  |
| 2026-09-28T00:35 | sa-P | P-steal-to-life | primitive | 8597, 9139, 9223 | troop:7069 TheBurrowWarden；troop:7437 SatyrTrickster；troop:7490 CrystalIntellect | `src/engine/skills/effects/debuff.ts`<br>`src/engine/skills/prototypes.ts`<br>`src/engine/skills/builders.ts`<br>`src/engine/skills/curated/batch-09.ts`<br>`src/engine/skills/curated/batch-r16.ts` | 8597: reduce capped Magic+1+2xGreen by front Attack, Life gain only healed (max Life unchanged); 9139/9223: steal [Magic+1] + ratio 100:1 targetStat (stole the whole stat), heal-only gain → reduce options modifierAfterCap (counter = min(stat, base) + modifier; gain = counter) and gainLifeMode 'gain' (native IncreaseHealth: Life+max Life). 8597 uses both; 9139/9223 steal min(stat, Magic+1) with Life+max gain | only reduce segments with gainStat hp (3 prototypes); default steal behaviour unchanged |
| 2026-09-28T00:36 | sa-F2 | F2-R001-order | assembler | 7768 | troop:6566 KingBloodhammer | `src/engine/skills/curated/batch-07.ts` | convert Blue to Doomskulls, then damage boosted by converted gems → damage boosted by Blue gems on board, then convert |  |
| 2026-09-28T00:36 | sa-F2 | F2-R001-order | assembler | 7932 | troop:6608 Ocularen | `src/engine/skills/curated/batch-07.ts` | convert Brown, then damage → damage boosted by Brown gems on board, then convert |  |
| 2026-09-28T00:36 | sa-F2 | F2-R001-order | assembler | 7933 | troop:6609 Xerodar | `src/engine/skills/curated/batch-07.ts` | convert Yellow to Skulls, then damage → damage boosted by Yellow gems on board, then convert |  |
| 2026-09-28T00:36 | sa-F2 | F2-R001-order | assembler | 8032 | troop:6686 WoodRhynax | `src/engine/skills/curated/batch-21.ts` | convert Red, then splash damage → splash damage boosted by Red gems on board, then convert |  |
| 2026-09-28T00:36 | sa-F2 | F2-R001-order | assembler | 8150 | troop:6765 Shimmerscale | `src/engine/skills/curated/batch-21.ts` | convert Brown, then damage → damage boosted by Brown gems on board, then convert |  |
| 2026-09-28T00:36 | sa-F2 | F2-R001-order | assembler | 9363 | troop:7567 GhostKingGrimhorn | `src/engine/skills/curated/batch-17.ts` | convert Yellow to Doomskulls, then true damage → true damage boosted by Yellow gems on board, then convert |  |
| 2026-09-28T00:36 | sa-F2 | F2-R001-order | assembler | 7053 | troop:6053 Banshee | `src/engine/skills/curated/batch-r18.ts` | convert Blue, then damage, souls → damage boosted by Blue gems on board, convert, souls |  |
| 2026-09-28T00:36 | sa-F2 | F2-R001-order | assembler | 7443 | troop:6297 Pharos-Ra | `src/engine/skills/curated/batch-r18.ts` | convert Yellow, then damage, souls → damage, convert, souls (native order) |  |
| 2026-09-28T00:36 | sa-F2 | F2-R001-order | assembler | 7599 | troop:6426 Glitterclaw | `src/engine/skills/curated/batch-r7.ts` | convert Blue, then damage, faerie fire → damage boosted by Blue gems on board, convert, faerie fire |  |
| 2026-09-28T00:36 | sa-F2 | F2-R001-order | assembler | 7149 | troop:6079 ShadowDragon | `src/engine/skills/curated/batch-29.ts` | poison all, convert Yellow, then true damage → true damage boosted by Yellow gems on board, convert, poison all |  |
| 2026-09-28T00:36 | sa-F2 | F2-R001-order | assembler | 7383 | troop:6240 ThornKnight | `src/engine/skills/curated/batch-12.ts` | remove Red, damage, entangle → damage boosted by Red gems on board, entangle, remove Red |  |
| 2026-09-28T00:36 | sa-F2 | F2-R001-order | assembler | 7434 | troop:6288 DarkTroll | `src/engine/skills/curated/batch-r22.ts` | create (double) Purple, create 3 Purple, souls → create (double) Purple, souls, create 3 Purple |  |
| 2026-09-28T00:38 | sa-F1 | F1-onkill-order | assembler | 7156, 7245, 8979, 8248 | troop:6086 Raven；weapon:1108 Crescendo；troop:7351 MouthOfZorn；troop:6843 MotherOfDarkness | `src/engine/skills/curated/batch-r17.ts`<br>`src/engine/skills/curated/batch-w01.ts`<br>`src/data/gowWeaponReviewedOverrides.json`<br>`src/engine/skills/curated/batch-r19.ts`<br>`src/engine/skills/curated/batch-r22.ts` | 7156/7245 extra turn after a self buff re-pointed lastTarget (never fired); 8979 damage then 35% execute; 8248 enemyNextDown empty once the chosen enemy died → 7156 native order extra turn then mana; 7245 extra turn on castEnemyDied; 8979 native 35% Devour (if Death Marked) before damage; 8248 one hit segment on chosen + next down |  |
| 2026-09-28T00:39 | sa-F2 | F2-1058-boost-source | data | 7124 | weapon:1058 GardsWall | `src/engine/skills/curated/batch-w01.ts`<br>`src/data/gowWeaponReviewedOverrides.json` | Life gain before removing Green; 1:1 boost had no source → remove Green, then Life [Magic+1] + 1 per Green removed, then Barrier (native order) |  |
| 2026-09-28T00:39 | sa-F2 | F2-R001-order | assembler | 9372 | troop:7576 ImmortalCaprichor | `src/engine/skills/curated/batch-r11.ts` | four splash waves, then explode 5 chosen-colour gems → explode 5 chosen-colour gems, then the four splash waves |  |
| 2026-09-28T00:39 | sa-F2 | F2-R001-order | assembler | 9721 | troop:7727 ImmortalLeio | `src/engine/skills/curated/batch-r11.ts` | five true-damage waves, then destroy X shape → destroy X shape, then the five waves |  |
| 2026-09-28T00:39 | sa-F2 | F2-R001-order | assembler | 7037 | troop:6037 Wight | `src/engine/skills/curated/batch-r18.ts` | steal Life, then create 5 Purple → create 5 Purple, then steal Life, souls |  |
| 2026-09-28T00:39 | sa-F2 | F2-R001-order | assembler | 8035 | troop:6689 SnowPanther | `src/engine/skills/curated/batch-26.ts` | freeze, then create Blue boosted by Frozen enemies (counted its own freeze) → create Blue boosted by enemies Frozen before the cast, then freeze |  |
| 2026-09-28T00:39 | sa-F2 | F2-R001-order | assembler | 8208 | troop:6805 Spell-Paw | `src/engine/skills/curated/batch-08.ts` | armor, then barrier on the strongest ally → barrier on the strongest ally, then armor on it (FromPrevious) |  |
| 2026-09-28T00:39 | sa-F2 | F2-1313-order-life | data | 8299 | weapon:1313 TheEighthSin | `src/engine/skills/curated/batch-w02.ts`<br>`src/data/gowWeaponReviewedOverrides.json` | enemy front, self front, 6 skulls, +8 if caster Life beats lastTarget (= caster itself, never) → self front, 14 or 6 skulls by Life vs the chosen enemy, then enemy front (native order) |  |
| 2026-09-28T00:39 | sa-F2 | F2-R001-order | assembler | 8528 | troop:7021 Shoggorath | `src/engine/skills/curated/batch-r11.ts` | true damage, then silence first/last → silence first/last, then true damage, then explode |  |
| 2026-09-28T00:39 | sa-F2 | F2-R001-order | assembler | 8755 | troop:7185 BurningOcularen | `src/engine/skills/curated/batch-15.ts` | burn, convert Red, damage → burn, damage boosted by Red gems on board, convert Red to Skulls |  |
| 2026-09-28T00:39 | sa-F2 | F2-R001-order | assembler | 8783 | troop:7196 HeraldOfBlight | `src/engine/skills/curated/batch-p37.ts` | destroy row, curse, disease, damage → curse, disease, destroy row, damage (native order) |  |
| 2026-09-28T00:39 | sa-F2 | F2-6203-no-cleanse | assembler | 7345 | troop:6203 NagaQueen | `src/engine/skills/curated/batch-12.ts` | convert, Life to all allies, cleanse all allies → convert, Life to all allies (cleanse removed: not in English/native) |  |
| 2026-09-28T00:41 | sa-P | P-chooser-native-restrictions | primitive | 7216, 7399, 7554, 8234, 7358, 8491, 9666, 7735, 8901 | troop:6124 GreenSeer；troop:6256 Apothecary；troop:6399 Asha；troop:6824 Crysturtle；troop:6216 Hellcat；troop:6987 DeepDwarf；troop:7705 Scrollweaver；troop:6541 LordEmber；troop:7276 DoomedGargoyle | `src/engine/skills/gowChoiceRules.ts`<br>`src/engine/skills/colorChooser.ts`<br>`src/engine/skills/cellChooser.ts`<br>`src/engine/TurnEngine.ts`<br>`src/engine/skills/curated/index.ts`<br>`src/engine/skills/library.ts` | AiColorChooser/AiCellChooser ignored native spell Target (could pick the target colour, a Skull or a special gem) → gowChoiceRules.ts maps native Target (Not<X>OrSkullGems, Not<X>Gems, <X>Gems, ManaGemsOnly) for 75 spell ids onto compiled prototypes (WeakMap, prototype data unchanged); TurnEngine passes the rule; AI choosers skip disallowed colours / non-Mana or wrong-colour cells. Player palette in src/render/App.ts NOT restricted (UI follow-up) | AI casts of 75 spells with chosen colour/gem; FixedColor/CellChooser (player, tests, golden) unchanged |
| 2026-09-28T00:42 | sa-F1 | F1-steal-before-damage | assembler | 7310, 7240, 7244, 7626, 7211, 7312, 7354, 7633, 8302, 7773 | troop:6171 Ghiralee；weapon:1104 EyeOfXathenos；weapon:1107 StaffOfMadness；weapon:1177 SoulOfXathenos；troop:6119 Elf-Eater；troop:6173 Gob-Chomper；troop:6212 DragonCruncher；troop:6455 MonsterMuncher；troop:6879 Bone-Biter；troop:6569 SirMordayne | `src/engine/skills/curated/batch-r12.ts`<br>`src/engine/skills/curated/batch-w01.ts`<br>`src/data/gowWeaponReviewedOverrides.json`<br>`src/engine/skills/curated/batch-r22.ts`<br>`src/engine/skills/curated/batch-r20.ts`<br>`src/engine/skills/curated/batch-r18.ts` | damage first, then steal / devour (a kill skipped the steal; devour after the hit; 8302 execute instead of devour) → native order (R001): steal / 50% race Devour first, then life / damage; 8302 uses devour |  |
| 2026-09-28T00:46 | sa-F1 | F1-items-54-60 | assembler | 8243, 8625, 7624, 7236 | troop:6838 BrokerOfGreed；troop:7090 FirebornWarrior；weapon:1175 Dawnstone；troop:6134 DarkSong | `src/engine/skills/curated/batch-r28.ts`<br>`src/engine/skills/curated/batch-r1.ts`<br>`src/engine/skills/curated/batch-w01.ts`<br>`src/data/gowWeaponReviewedOverrides.json`<br>`src/engine/skills/curated/batch-r12.ts` | 8243 all other allies, points spread; 8625 uniform 2-4 burns before armor, boosted by team size; 7624 life/mana before cleanse; 7236 one 6-mana steal for Orc or Daemon → 8243 chosen ally, one random Skill; 8625 armor (Red gems + Red allies) then 2 + 50% + 25% burns; 7624 native cleanse-first order; 7236 separate Daemon/Orc steals |  |
| 2026-09-28T00:48 | sa-P | P-create-interleave | primitive | 7280, 9119, 7009, 7063, 7936, 8169, 8422, 8632, 8633, 8634, 8635, 9138, 9163 | troop:6160 TheGreatMaw；troop:7425 MantisMage；troop:6009 Acolyte；troop:6063 Serpent；troop:6612 GraveSeer；troop:6779 Moonsinger；troop:6941 Arcturion；troop:7097 NaturebornWolf；troop:7098 FirebornEagle；troop:7099 WaterbornOwl；troop:7100 StonebornLion；troop:7446 Stellarix；troop:7453 FireLion | `src/engine/TurnEngine.ts` | every gem segment called resolveBoardChange at once: a create/transform/jumble settled gravity+cascades before the next native step (7280 Brown creation landed after the first cascade) → during castSkill, pure board rewrites (no gems removed) defer the settle to the end of the spell; destroy/explode still settle immediately (and absorb any pending rewrite) | every spell with a create/convert/jumble step followed by other steps: cascade and its rng draws move after the remaining steps; 12 golden-signed keys changed (ordering / rng only) |
| 2026-09-28T00:51 | sa-F1 | F1-items-62-75 | assembler | 9534, 7323, 8414, 7260, 7339, 7369, 7526, 7473, 8895, 9844, 7233, 7441 | troop:7625 Mantichoras；troop:6182 HeraldOfChaos；troop:6926 Smashedmouth；troop:6146 Thrall；troop:6197 War；troop:6227 EmperorKhorvash；troop:6374 BabaYaga；troop:6323 ElvenBard；troop:7278 KrisKrinkle；troop:7803 Sironia；troop:6131 Summoner；troop:6295 Villager | `src/engine/skills/curated/batch-r9.ts`<br>`src/engine/skills/curated/batch-r12.ts`<br>`src/engine/skills/curated/batch-19.ts`<br>`src/engine/skills/curated/batch-25.ts`<br>`src/engine/skills/curated/batch-06.ts`<br>`src/engine/skills/curated/batch-13.ts`<br>`src/engine/skills/curated/batch-r18.ts`<br>`src/engine/skills/curated/batch-r19.ts`<br>`src/engine/skills/curated/batch-r7.ts`<br>`src/data/gowSnapshotOverrides.json` | steps grouped or reordered vs native (drain on a re-rolled enemy set, drain after knock-back, 13-Red check after destroying, submerge before the already-submerged check, summon after the heal, ...); 7323 damage unboosted; 8895 split points, zh without maps → native step order per R001; 7323 damage + Blue-in-row x2; 8895 one random Skill per ally, zh lists 2 Treasure Maps |  |
| 2026-09-28T02:28 | sa-R4 | L7-R1-7113-enemy-colour | assembler | 8656 | troop:7113 IcespireShaman | `src/engine/skills/curated/batch-r1.ts` | boost counted Blue allies + all enemies (teamSize); zh desc said random allies → boost x3 per Blue ally + Blue enemy (CountArmyColor AllEnemies); zh desc targets random enemies |  |
| 2026-09-28T02:28 | sa-R4 | L7-R1-weapon-colour-race | assembler | 8644, 8767 | weapon:1431 ThornsBlade；weapon:1466 Bloodkeeper | `src/engine/skills/curated/batch-w03.ts` | boost counted race allies only (Green/Purple colour count dropped) → boost x3 per Green (8644) / Purple (8767) ally plus per Elemental / Undead ally, counted separately |  |
| 2026-09-28T02:32 | sa-R4 | L7-R1-weapon-colour-race | assembler | 9303, 9306, 9352, 9355, 9507, 9578, 9630, 9633, 9636, 9915, 10048, 7248 | weapon:1581 LickOfFire；weapon:1584 SharpReef；weapon:1588 Bloodblight；weapon:1591 TheBeatenPath；weapon:1615 HolyPath；weapon:1630 BurningClaw；weapon:1640 TitanicCleaver；weapon:1643 FrozenFractal；weapon:1648 Haresplitter；weapon:1691 ClawOfTheNorth；weapon:1716 FeralDagger；weapon:1111 ShatteredBlade | `src/engine/skills/curated/batch-w04.ts`<br>`src/engine/skills/curated/batch-w01.ts` | boost counted only one of the two named sources (race only: 9303/9306/9352/9355; colour only: 9507/9578/9630/9633/9636/9915/10048; Divine only: 7248) → both native Count steps (CountArmyColor + CountArmyType, or 2x CountArmyType for 7248) summed per ally |  |
| 2026-09-28T02:41 | sa-R4 | L7-R1-teamsize-source | assembler | 9635, 9688, 8624, 9875, 8626 | weapon:1645 CoralBow；weapon:1650 HolyBreeze；troop:7089 NaturebornWarden；troop:7831 Balearic；troop:7091 WaterbornPriestess | `src/engine/skills/curated/batch-w04.ts`<br>`src/engine/skills/curated/batch-r1.ts`<br>`src/engine/skills/curated/batch-r16.ts`<br>`src/engine/skills/curated/batch-33.ts` | boost counted every ally (teamSize) instead of the native Count source → native source: Merlantis allies (9635, CountArmyKingdom 3036), Divine allies (9688), Green/Blue allies (8624/9875/8626, CountArmyColor Data 1/0) alongside the gem count |  |
| 2026-09-28T02:44 | sa-R4 | L7-R1-6904-nextdown | assembler | 8365 | troop:6904 LordBelanor | `src/engine/skills/curated/batch-r21.ts` | hit chosen enemy and every enemy below it (enemyChosenAndBelow) → hit chosen enemy and only the one directly below (native Damage@NextDownFromTarget; enemyChosenAndNextDown, range all) |  |
| 2026-09-28T02:52 | sa-R4 | L7-R1-attack-armor-life-pooled | assembler | 7252, 9882, 8238, 7975, 7454, 7864 | troop:6138 Tauros；troop:7838 Creteus；troop:6833 Ferocity；troop:6644 Earthcaller；troop:6304 Minogor；weapon:1217 FireRubyStaff | `src/engine/skills/curated/batch-12.ts`<br>`src/engine/skills/curated/batch-25.ts`<br>`src/engine/skills/curated/batch-r15.ts`<br>`src/engine/skills/curated/batch-r18.ts`<br>`src/engine/skills/curated/batch-r7.ts`<br>`src/engine/skills/curated/batch-w02.ts` | CountAttackArmorLife split into 3 sources floored separately (R007 per-step path); 8238 second hit unboosted-pooling + plain random (could repeat target); 7864 counted Attack only → single native step: Attack+Life+Armor summed then floored once (pooled); 8238 second hit RandomPrefNotPrevEnemy; 7864 counts all three |  |
| 2026-09-28T02:52 | sa-R4 | L7-R1-1571-native-gems | assembler | 9262 | weapon:1571 EmeraldCenser | `src/engine/skills/curated/batch-w04.ts` | boost x3 per Purple ally (English text) → boost x3 per Purple gem (native step 0 CountGems Purple, R001) plus per Mystic ally |  |
| 2026-09-28T02:57 | sa-R4 | L7-R1-board-special-counts | assembler | 8815, 8674, 8563, 8630, 8639 | troop:7221 Obsidiaxas；troop:7130 ThornScout；troop:7039 Indrajit；troop:7095 Kalika；troop:7104 NatureWeird | `src/engine/skills/curated/batch-r8.ts`<br>`src/engine/skills/curated/batch-33.ts`<br>`src/engine/skills/curated/batch-r1.ts` | 8815/8630/8639 counted every colour gem (boardGems without colour); 8674 counted Web instead of Entangle gems; 8563/8630 rolled or targeted 4 random hits as one distinct-N pick → 8815 Stone Blocks + Gargoyle gems; 8630/8639 Elemental Stars; 8674 Entangle gems; 8563/8630 randomWaves 4 (RandomEnemy + 3 x RandomPrefNotPrev, per-hit roll) |  |

## 按技能 ID

| 技能 ID | 改动次数 | 问题 |
|---|---:|---|
| --keys | 3 | L3-004、L1-devour-double-roll、L2-random-status-pools |
| (shared) | 1 | R005 (L7-6352-b, L4b-strongest-metric) |
| 1067 | 1 | L4b-7276-singlegem |
| 1194 | 4 | 、、、 |
| 6111 | 1 | L4b-7276-singlegem |
| 6548 | 1 | L4b-7200-rage-alias |
| 6751 | 1 | L4b-6751-zh |
| 6824 | 1 | L4b-6824-random-ally |
| 7009 | 1 | P-create-interleave |
| 7022 | 1 | F3-q18 |
| 7024 | 1 | F2-R001-order |
| 7025 | 1 | F2-R001-order |
| 7032 | 1 | L3-017 |
| 7035 | 1 | L3-018 |
| 7037 | 1 | F2-R001-order |
| 7047 | 1 | F1-6047-dispel |
| 7050 | 1 | F3-q29 |
| 7052 | 1 | F2-R001-order |
| 7053 | 1 | F2-R001-order |
| 7054 | 1 | F2-R001-order |
| 7055 | 1 | F2-R001-order |
| 7061 | 1 | F3-t6061 |
| 7063 | 1 | P-create-interleave |
| 7065 | 1 | F2-R001-order |
| 7092 | 1 | L4b-7276-singlegem |
| 7094 | 1 | F2-1028-missing-magic |
| 7124 | 1 | F2-1058-boost-source |
| 7138 | 2 | L4b-7138-zh、L4b-6068-order |
| 7139 | 1 | F3-q28 |
| 7143 | 1 | R004-tests |
| 7146 | 1 | F1-remove-order |
| 7149 | 1 | F2-R001-order |
| 7156 | 1 | F1-onkill-order |
| 7162 | 1 | L4b-7138-onecolour |
| 7169 | 1 | L4b-7276-singlegem |
| 7185 | 2 | L5-012、R004 (L5-004,L5-005,L5-014,L4b-6340) |
| 7194 | 1 | P-F1-oneof-chosen-target |
| 7208 | 1 | P-prefnotprev-semantics |
| 7210 | 1 | L1-consume-first |
| 7211 | 1 | F1-steal-before-damage |
| 7216 | 1 | P-chooser-native-restrictions |
| 7232 | 1 | F2-R001-order |
| 7233 | 1 | F1-items-62-75 |
| 7236 | 2 | P-random-stat-pool、F1-items-54-60 |
| 7240 | 2 | P-random-stat-pool、F1-steal-before-damage |
| 7244 | 2 | P-random-stat-pool、F1-steal-before-damage |
| 7245 | 1 | F1-onkill-order |
| 7248 | 1 | L7-R1-weapon-colour-race |
| 7252 | 2 | P-counter-per-step、L7-R1-attack-armor-life-pooled |
| 7260 | 1 | F1-items-62-75 |
| 7265 | 1 | L3-008 |
| 7272 | 1 | F2-1120-column-skulls |
| 7280 | 1 | P-create-interleave |
| 7287 | 1 | F3-q26 |
| 7293 | 1 | L1-consume-first |
| 7295 | 1 | F3-q35 |
| 7297 | 1 | F3-q20 |
| 7307 | 1 | F3-q27 |
| 7310 | 2 | P-random-stat-pool、F1-steal-before-damage |
| 7312 | 1 | F1-steal-before-damage |
| 7317 | 1 | F3-q05 |
| 7319 | 1 | P-random-stat-pool |
| 7323 | 2 | P-random-stat-pool、F1-items-62-75 |
| 7333 | 1 | R004 (L5-004,L5-005,L5-014,L4b-6340) |
| 7334 | 1 | L7-6193 |
| 7338 | 2 | L5-006、R004 (L5-004,L5-005,L5-014,L4b-6340) |
| 7339 | 1 | F1-items-62-75 |
| 7340 | 1 | P-random-stat-pool |
| 7345 | 1 | F2-6203-no-cleanse |
| 7348 | 1 | P-F1-oneof-chosen-target |
| 7349 | 1 | F1-remove-order |
| 7353 | 1 | L7-6211 |
| 7354 | 1 | F1-steal-before-damage |
| 7357 | 1 | F2-R001-order |
| 7358 | 1 | P-chooser-native-restrictions |
| 7359 | 2 | L5-013、R004 (L5-004,L5-005,L5-014,L4b-6340) |
| 7360 | 1 | F2-R001-order |
| 7361 | 2 | L5-013、R004 (L5-004,L5-005,L5-014,L4b-6340) |
| 7364 | 2 | L5-013、R004 (L5-004,L5-005,L5-014,L4b-6340) |
| 7368 | 1 | F3-q23 |
| 7369 | 1 | F1-items-62-75 |
| 7371 | 2 | L5-013、R004 (L5-004,L5-005,L5-014,L4b-6340) |
| 7383 | 1 | F2-R001-order |
| 7392 | 2 | L5-009、R004 (L5-004,L5-005,L5-014,L4b-6340) |
| 7395 | 1 | L3-011 |
| 7396 | 1 | F3-q25 |
| 7399 | 1 | P-chooser-native-restrictions |
| 7408 | 1 | F2-6265-dispel-last |
| 7431 | 1 | L3-002 |
| 7434 | 1 | F2-R001-order |
| 7438 | 1 | P-F1-oneof-chosen-target |
| 7441 | 1 | F1-items-62-75 |
| 7443 | 1 | F2-R001-order |
| 7444 | 2 | L5-010、R004 (L5-004,L5-005,L5-014,L4b-6340) |
| 7454 | 2 | P-counter-per-step、L7-R1-attack-armor-life-pooled |
| 7470 | 1 | P-counter-per-step |
| 7473 | 1 | F1-items-62-75 |
| 7478 | 1 | F1-remove-order |
| 7480 | 1 | L4b-7276-singlegem |
| 7482 | 1 | P-random-stat-pool |
| 7489 | 1 | P-counter-per-step |
| 7504 | 2 | L7-6352-a、R005-test-sync |
| 7507 | 1 | F2-6355-native-order |
| 7518 | 1 | P-prefnotprev-semantics |
| 7526 | 1 | F1-items-62-75 |
| 7533 | 1 | L1-6378-pool |
| 7542 | 1 | F1-6387-rebirth |
| 7548 | 1 | R004-tests |
| 7553 | 1 | F2-6398-random-dispel |
| 7554 | 1 | P-chooser-native-restrictions |
| 7558 | 1 | F3-q32 |
| 7560 | 1 | P-random-stat-pool |
| 7561 | 3 | L5-001、R004 (L5-004,L5-005,L5-014,L4b-6340)、R004-tests |
| 7568 | 1 | P-counter-per-step |
| 7574 | 1 | L2-6416-branch-weights |
| 7576 | 1 | F2-R001-order |
| 7577 | 1 | F2-1159-boost-source |
| 7596 | 2 | P-random-stat-pool、F1-remove-order |
| 7599 | 1 | F2-R001-order |
| 7624 | 1 | F1-items-54-60 |
| 7626 | 1 | F1-steal-before-damage |
| 7631 | 1 | L1-6453-order |
| 7633 | 1 | F1-steal-before-damage |
| 7635 | 1 | F2-6457-dispel-self |
| 7644 | 1 | P-counter-per-step |
| 7645 | 1 | F2-6467-life-armor |
| 7646 | 1 | F3-q07 |
| 7647 | 1 | L1-6469-order |
| 7654 | 1 | P-prefnotprev-semantics |
| 7666 | 1 | P-prefnotprev-semantics |
| 7668 | 1 | L3-010 |
| 7693 | 1 | F2-R001-order |
| 7720 | 1 | F3-q03 |
| 7723 | 1 | F2-6529-dispel-kill |
| 7728 | 1 | L1-6534-order |
| 7735 | 1 | P-chooser-native-restrictions |
| 7740 | 2 | L5-013、R004 (L5-004,L5-005,L5-014,L4b-6340) |
| 7743 | 1 |  |
| 7744 | 1 | F3-t6550 |
| 7747 | 1 | P-counter-per-step |
| 7752 | 1 |  |
| 7761 | 1 | F2-R001-order |
| 7765 | 1 | P-counter-per-step |
| 7768 | 1 | F2-R001-order |
| 7773 | 1 | F1-steal-before-damage |
| 7780 | 1 | F3-q04 |
| 7786 | 1 | P-prefnotprev-semantics |
| 7791 | 1 | F3-q21 |
| 7805 | 1 | F3-t1210 |
| 7864 | 1 | L7-R1-attack-armor-life-pooled |
| 7930 | 1 | P-counter-per-step |
| 7931 | 1 | F2-6607-steal-mult |
| 7932 | 1 | F2-R001-order |
| 7933 | 1 | F2-R001-order |
| 7936 | 1 | P-create-interleave |
| 7941 | 1 | F2-6623-column-order |
| 7945 | 1 | P-prefnotprev-semantics |
| 7947 | 1 | L1-1351-pool |
| 7952 | 2 | L3-015、L3-016 |
| 7963 | 2 | L3-015、L3-016 |
| 7973 | 2 | L3-015、L3-016 |
| 7975 | 2 | P-counter-per-step、L7-R1-attack-armor-life-pooled |
| 7978 | 1 | L5-013 |
| 7983 | 1 | P-counter-per-step |
| 8024 | 1 | P-prefnotprev-semantics |
| 8032 | 1 | F2-R001-order |
| 8035 | 1 | F2-R001-order |
| 8053 | 2 | L3-015、L3-016 |
| 8077 | 2 | L3-015、L3-016 |
| 8078 | 2 | L3-015、L3-016 |
| 8084 | 1 | L5-007 |
| 8097 | 1 | F3-q06 |
| 8103 | 1 | P-counter-per-step |
| 8112 | 1 | F3-q33 |
| 8113 | 1 | P-counter-per-step |
| 8130 | 1 | F3-t1272 |
| 8133 | 1 | F2-6754-no-explode |
| 8139 | 1 | P-counter-per-step |
| 8150 | 1 | F2-R001-order |
| 8160 | 1 | P-prefnotprev-semantics |
| 8165 | 1 | P-random-stat-pool |
| 8166 | 1 | P-random-stat-pool |
| 8169 | 1 | P-create-interleave |
| 8203 | 1 | P-counter-per-step |
| 8204 | 1 | P-counter-per-step |
| 8208 | 1 | F2-R001-order |
| 8218 | 1 | P-counter-per-step |
| 8219 | 1 | P-counter-per-step |
| 8228 | 2 | P-counter-per-step、F2-6826-kill-skulls |
| 8234 | 2 | L4b-6824-random-ally、P-chooser-native-restrictions |
| 8238 | 2 | P-counter-per-step、L7-R1-attack-armor-life-pooled |
| 8243 | 1 | F1-items-54-60 |
| 8245 | 1 | L5-001 |
| 8246 | 1 | L4b-6841-prefnotprev |
| 8248 | 1 | F1-onkill-order |
| 8250 | 1 | P-F1-oneof-chosen-target |
| 8251 | 1 | P-counter-per-step |
| 8288 | 1 | P-prefnotprev-semantics |
| 8294 | 1 | P-prefnotprev-semantics |
| 8299 | 1 | F2-1313-order-life |
| 8302 | 1 | F1-steal-before-damage |
| 8357 | 1 | L1-1351-pool |
| 8365 | 1 | L7-R1-6904-nextdown |
| 8389 | 1 | L1-1351-pool |
| 8390 | 1 | P-prefnotprev-semantics |
| 8393 | 2 | L5-013、R004 (L5-004,L5-005,L5-014,L4b-6340) |
| 8403 | 3 | L5-001、R004 (L5-004,L5-005,L5-014,L4b-6340)、R004-tests |
| 8404 | 3 | L5-001、L5-002、L5-003 |
| 8407 | 1 | P-F1-oneof-chosen-target |
| 8410 | 1 | P-prefnotprev-semantics |
| 8414 | 1 | F1-items-62-75 |
| 8422 | 1 | P-create-interleave |
| 8438 | 1 | F1-6931-dispel |
| 8440 | 2 | P-random-stat-pool、F1-1377-target |
| 8458 | 1 | L2-6958-order |
| 8468 | 1 | F2-R001-order |
| 8472 | 1 | P-F1-oneof-chosen-target |
| 8491 | 1 | P-chooser-native-restrictions |
| 8497 | 1 | F2-6991-explode-mult |
| 8499 | 1 | P-random-stat-pool |
| 8500 | 1 | P-random-stat-pool |
| 8528 | 1 | F2-R001-order |
| 8549 | 1 | P-random-stat-pool |
| 8557 | 1 | L4b-7030-dragon |
| 8560 | 1 | P-counter-per-step |
| 8562 | 1 | P-counter-per-step |
| 8563 | 2 | P-counter-per-step、L7-R1-board-special-counts |
| 8570 | 1 | L7-7045 |
| 8580 | 1 | L3-015 |
| 8586 | 1 | F2-R001-order |
| 8596 | 1 | L4b-7068-potion-colour |
| 8597 | 1 | P-steal-to-life |
| 8598 | 3 | L3-007、L3-008、L3-009 |
| 8599 | 1 | L4b-7071-base |
| 8624 | 2 | P-counter-per-step、L7-R1-teamsize-source |
| 8625 | 1 | F1-items-54-60 |
| 8626 | 2 | P-counter-per-step、L7-R1-teamsize-source |
| 8630 | 1 | L7-R1-board-special-counts |
| 8632 | 2 | L3-001、P-create-interleave |
| 8633 | 2 | L3-001、P-create-interleave |
| 8634 | 2 | L3-001、P-create-interleave |
| 8635 | 2 | L3-001、P-create-interleave |
| 8636 | 1 | F3-t7101 |
| 8638 | 1 | L3-015 |
| 8639 | 1 | L7-R1-board-special-counts |
| 8644 | 1 | L7-R1-weapon-colour-race |
| 8650 | 1 | P-prefnotprev-semantics |
| 8654 | 1 | L3-008 |
| 8656 | 2 | P-prefnotprev-semantics、L7-R1-7113-enemy-colour |
| 8668 | 2 | L5-007、R004 (L5-004,L5-005,L5-014,L4b-6340) |
| 8674 | 2 | P-counter-per-step、L7-R1-board-special-counts |
| 8684 | 1 | P-random-stat-pool |
| 8686 | 1 | P-random-stat-pool |
| 8694 | 1 | F2-7145-miss-branch |
| 8713 | 1 | P-counter-per-step |
| 8722 | 1 | L2-singlegem-cell |
| 8751 | 1 | P-counter-per-step |
| 8752 | 2 | L5-008、R004 (L5-004,L5-005,L5-014,L4b-6340) |
| 8755 | 1 | F2-R001-order |
| 8767 | 1 | L7-R1-weapon-colour-race |
| 8782 | 1 | L4b-7195-order |
| 8783 | 1 | F2-R001-order |
| 8785 | 1 | P-counter-per-step |
| 8788 | 1 | L7-7201 |
| 8795 | 1 | L3-003 |
| 8802 | 1 | F3-t7215 |
| 8807 | 1 | F2-R001-order |
| 8815 | 1 | L7-R1-board-special-counts |
| 8820 | 1 | P-counter-per-step |
| 8854 | 1 | P-prefnotprev-semantics |
| 8859 | 1 | P-random-stat-pool |
| 8881 | 1 | P-prefnotprev-semantics |
| 8889 | 1 | L4b-7270-dragon |
| 8890 | 1 | L1-consume-first |
| 8891 | 1 | L1-consume-first |
| 8894 | 2 | L1-7260-target、L1-7260-target |
| 8895 | 1 | F1-items-62-75 |
| 8901 | 2 | L4b-7276-singlegem、P-chooser-native-restrictions |
| 8924 | 1 | F2-R001-order |
| 8933 | 1 | F2-7321-no-events |
| 8941 | 1 | P-F1-oneof-chosen-target |
| 8961 | 1 | F2-7338-cross-skulls |
| 8967 | 1 | P-random-stat-pool |
| 8969 | 1 | L7-7344 |
| 8970 | 1 | P-prefnotprev-semantics |
| 8979 | 1 | F1-onkill-order |
| 8987 | 1 | P-counter-per-step |
| 9015 | 2 | L5-001、L5-002 |
| 9025 | 1 | F2-7383-kill-gems |
| 9051 | 1 | L3-008 |
| 9064 | 1 | P-counter-per-step |
| 9067 | 1 | L3-008 |
| 9119 | 1 | P-create-interleave |
| 9138 | 1 | P-create-interleave |
| 9139 | 1 | P-steal-to-life |
| 9163 | 1 | P-create-interleave |
| 9184 | 1 | P-counter-per-step |
| 9197 | 1 | L2-singlegem-cell |
| 9199 | 1 | P-prefnotprev-semantics |
| 9223 | 1 | P-steal-to-life |
| 9241 | 1 | P-random-stat-pool |
| 9244 | 1 | L4b-7499-dragon |
| 9262 | 1 | L7-R1-1571-native-gems |
| 9280 | 1 | P-prefnotprev-semantics |
| 9281 | 1 | L7-7517 |
| 9282 | 1 | F3-q37 |
| 9303 | 1 | L7-R1-weapon-colour-race |
| 9306 | 1 | L7-R1-weapon-colour-race |
| 9352 | 1 | L7-R1-weapon-colour-race |
| 9355 | 1 | L7-R1-weapon-colour-race |
| 9363 | 1 | F2-R001-order |
| 9367 | 1 | P-prefnotprev-semantics |
| 9370 | 1 | P-prefnotprev-semantics |
| 9372 | 2 | P-prefnotprev-semantics、F2-R001-order |
| 9377 | 1 | P-prefnotprev-semantics |
| 9483 | 1 | P-prefnotprev-semantics |
| 9485 | 1 | P-random-stat-pool |
| 9507 | 1 | L7-R1-weapon-colour-race |
| 9512 | 1 | P-counter-per-step |
| 9513 | 1 | L3-007 |
| 9514 | 1 | P-random-stat-pool |
| 9522 | 2 | L7-7615、P-counter-per-step |
| 9523 | 1 | L2-1620-random-bleed |
| 9524 | 1 | L2-1620-random-bleed |
| 9525 | 1 | L2-1620-random-bleed |
| 9528 | 1 | P-prefnotprev-semantics |
| 9529 | 1 | P-prefnotprev-semantics |
| 9530 | 1 | P-prefnotprev-semantics |
| 9531 | 1 | P-prefnotprev-semantics |
| 9534 | 2 | L3-007、F1-items-62-75 |
| 9547 | 1 | P-counter-per-step |
| 9578 | 1 | L7-R1-weapon-colour-race |
| 9591 | 1 | P-counter-per-step |
| 9597 | 1 | P-counter-per-step |
| 9602 | 1 | F1-7674-target |
| 9616 | 1 | F3-q24 |
| 9630 | 1 | L7-R1-weapon-colour-race |
| 9633 | 1 | L7-R1-weapon-colour-race |
| 9635 | 1 | L7-R1-teamsize-source |
| 9636 | 1 | L7-R1-weapon-colour-race |
| 9640 | 1 | P-random-stat-pool |
| 9641 | 1 | P-prefnotprev-semantics |
| 9659 | 1 | P-prefnotprev-semantics |
| 9661 | 1 | F3-q19 |
| 9666 | 1 | P-chooser-native-restrictions |
| 9673 | 1 | P-counter-per-step |
| 9688 | 1 | L7-R1-teamsize-source |
| 9716 | 1 | F3-t7724 |
| 9719 | 1 | P-prefnotprev-semantics |
| 9721 | 2 | P-prefnotprev-semantics、F2-R001-order |
| 9723 | 1 | F2-7728-no-damage |
| 9733 | 1 | P-counter-per-step |
| 9739 | 1 | P-counter-per-step |
| 9774 | 1 | P-counter-per-step |
| 9776 | 1 | P-prefnotprev-semantics |
| 9784 | 1 | L3-007 |
| 9816 | 1 | L3-012 |
| 9844 | 1 | F1-items-62-75 |
| 9847 | 1 | L3-015 |
| 9849 | 1 | P-random-stat-pool |
| 9851 | 1 | F3-q34 |
| 9852 | 1 | P-counter-per-step |
| 9861 | 1 | P-random-stat-pool |
| 9869 | 1 | F1-7825-count |
| 9874 | 2 | F2-7830-heal-mult、P-prefnotprev-semantics |
| 9875 | 1 | L7-R1-teamsize-source |
| 9879 | 1 | F3-q38 |
| 9880 | 1 | P-prefnotprev-semantics |
| 9882 | 2 | P-counter-per-step、L7-R1-attack-armor-life-pooled |
| 9909 | 1 | P-random-stat-pool |
| 9915 | 1 | L7-R1-weapon-colour-race |
| 9933 | 1 | P-prefnotprev-semantics |
| 9935 | 1 | P-prefnotprev-semantics |
| 9936 | 1 | F3-q02 |
| 9937 | 1 | P-prefnotprev-semantics |
| 9942 | 1 | F3-q08 |
| 9957 | 1 | L3-007 |
| 9986 | 1 | F3-q22 |
| 10003 | 1 | F1-doomed-random-skill |
| 10005 | 1 | F1-doomed-random-skill |
| 10006 | 1 | F1-doomed-random-skill |
| 10008 | 1 | F1-doomed-random-skill |
| 10048 | 1 | L7-R1-weapon-colour-race |
| 10061 | 1 |  |
| 10063 | 1 | F3-q30 |
