# GoW 技能改动留档

自动生成（`node scripts/gow-changelog.mjs render`），源数据 [CHANGES.jsonl](CHANGES.jsonl)，共 71 条改动，涉及 103 个技能 ID。

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
| 7032 | 1 | L3-017 |
| 7035 | 1 | L3-018 |
| 7092 | 1 | L4b-7276-singlegem |
| 7138 | 2 | L4b-7138-zh、L4b-6068-order |
| 7143 | 1 | R004-tests |
| 7162 | 1 | L4b-7138-onecolour |
| 7169 | 1 | L4b-7276-singlegem |
| 7185 | 2 | L5-012、R004 (L5-004,L5-005,L5-014,L4b-6340) |
| 7210 | 1 | L1-consume-first |
| 7265 | 1 | L3-008 |
| 7293 | 1 | L1-consume-first |
| 7333 | 1 | R004 (L5-004,L5-005,L5-014,L4b-6340) |
| 7334 | 1 | L7-6193 |
| 7338 | 2 | L5-006、R004 (L5-004,L5-005,L5-014,L4b-6340) |
| 7353 | 1 | L7-6211 |
| 7359 | 2 | L5-013、R004 (L5-004,L5-005,L5-014,L4b-6340) |
| 7361 | 2 | L5-013、R004 (L5-004,L5-005,L5-014,L4b-6340) |
| 7364 | 2 | L5-013、R004 (L5-004,L5-005,L5-014,L4b-6340) |
| 7371 | 2 | L5-013、R004 (L5-004,L5-005,L5-014,L4b-6340) |
| 7392 | 2 | L5-009、R004 (L5-004,L5-005,L5-014,L4b-6340) |
| 7395 | 1 | L3-011 |
| 7431 | 1 | L3-002 |
| 7444 | 2 | L5-010、R004 (L5-004,L5-005,L5-014,L4b-6340) |
| 7480 | 1 | L4b-7276-singlegem |
| 7504 | 2 | L7-6352-a、R005-test-sync |
| 7533 | 1 | L1-6378-pool |
| 7548 | 1 | R004-tests |
| 7561 | 3 | L5-001、R004 (L5-004,L5-005,L5-014,L4b-6340)、R004-tests |
| 7574 | 1 | L2-6416-branch-weights |
| 7631 | 1 | L1-6453-order |
| 7647 | 1 | L1-6469-order |
| 7668 | 1 | L3-010 |
| 7728 | 1 | L1-6534-order |
| 7740 | 2 | L5-013、R004 (L5-004,L5-005,L5-014,L4b-6340) |
| 7743 | 1 |  |
| 7752 | 1 |  |
| 7947 | 1 | L1-1351-pool |
| 7952 | 2 | L3-015、L3-016 |
| 7963 | 2 | L3-015、L3-016 |
| 7973 | 2 | L3-015、L3-016 |
| 7978 | 1 | L5-013 |
| 8053 | 2 | L3-015、L3-016 |
| 8077 | 2 | L3-015、L3-016 |
| 8078 | 2 | L3-015、L3-016 |
| 8084 | 1 | L5-007 |
| 8234 | 1 | L4b-6824-random-ally |
| 8245 | 1 | L5-001 |
| 8246 | 1 | L4b-6841-prefnotprev |
| 8357 | 1 | L1-1351-pool |
| 8389 | 1 | L1-1351-pool |
| 8393 | 2 | L5-013、R004 (L5-004,L5-005,L5-014,L4b-6340) |
| 8403 | 3 | L5-001、R004 (L5-004,L5-005,L5-014,L4b-6340)、R004-tests |
| 8404 | 3 | L5-001、L5-002、L5-003 |
| 8458 | 1 | L2-6958-order |
| 8557 | 1 | L4b-7030-dragon |
| 8570 | 1 | L7-7045 |
| 8580 | 1 | L3-015 |
| 8596 | 1 | L4b-7068-potion-colour |
| 8598 | 3 | L3-007、L3-008、L3-009 |
| 8599 | 1 | L4b-7071-base |
| 8632 | 1 | L3-001 |
| 8633 | 1 | L3-001 |
| 8634 | 1 | L3-001 |
| 8635 | 1 | L3-001 |
| 8638 | 1 | L3-015 |
| 8654 | 1 | L3-008 |
| 8668 | 2 | L5-007、R004 (L5-004,L5-005,L5-014,L4b-6340) |
| 8722 | 1 | L2-singlegem-cell |
| 8752 | 2 | L5-008、R004 (L5-004,L5-005,L5-014,L4b-6340) |
| 8782 | 1 | L4b-7195-order |
| 8788 | 1 | L7-7201 |
| 8795 | 1 | L3-003 |
| 8889 | 1 | L4b-7270-dragon |
| 8890 | 1 | L1-consume-first |
| 8891 | 1 | L1-consume-first |
| 8894 | 2 | L1-7260-target、L1-7260-target |
| 8901 | 1 | L4b-7276-singlegem |
| 8969 | 1 | L7-7344 |
| 9015 | 2 | L5-001、L5-002 |
| 9051 | 1 | L3-008 |
| 9067 | 1 | L3-008 |
| 9197 | 1 | L2-singlegem-cell |
| 9244 | 1 | L4b-7499-dragon |
| 9281 | 1 | L7-7517 |
| 9513 | 1 | L3-007 |
| 9522 | 1 | L7-7615 |
| 9523 | 1 | L2-1620-random-bleed |
| 9524 | 1 | L2-1620-random-bleed |
| 9525 | 1 | L2-1620-random-bleed |
| 9534 | 1 | L3-007 |
| 9784 | 1 | L3-007 |
| 9816 | 1 | L3-012 |
| 9847 | 1 | L3-015 |
| 9957 | 1 | L3-007 |
| 10061 | 1 |  |
