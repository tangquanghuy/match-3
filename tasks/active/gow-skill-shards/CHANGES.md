# GoW 技能改动留档

自动生成（`node scripts/gow-changelog.mjs render`），源数据 [CHANGES.jsonl](CHANGES.jsonl)，共 649 条改动，涉及 1107 个技能 ID。

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
| 2026-09-28T02:30 | sa-R3 | R3-B01-1141 | assembler | 7318 | weapon:1141 StaffOfSt.Astra | `src/engine/skills/curated/batch-w01.ts` | Life [Magic] to caster only → Life [Magic] to all allies (IncreaseHealth@AllAllies) |  |
| 2026-09-28T02:30 | sa-R3 | R3-B01-1374 | assembler | 8436 | weapon:1374 Duskbringer | `src/engine/skills/curated/batch-w03.ts`<br>`src/data/gowWeaponReviewedOverrides.json` | x2 boost counted Purple allies only → x2 boost counts Purple allies and Purple enemies |  |
| 2026-09-28T02:30 | sa-R3 | R3-B01-1256 | assembler | 8076 | weapon:1256 ThreeSisters | `src/engine/skills/curated/batch-w02.ts`<br>`src/data/gowWeaponReviewedOverrides.json` | x4 boost counted Blue allies only → x4 boost counts Blue allies and Blue enemies |  |
| 2026-09-28T02:30 | sa-R3 | R3-B01-6296 | assembler | 7442 | troop:6296 GaardsAvatar | `src/engine/skills/curated/batch-19.ts` | Burn Undead then Silence Daemon → Silence Daemon then Burn Undead (native order) |  |
| 2026-09-28T02:30 | sa-R1 | L4a-R1-8215-fromprevious | data | 8215 | troop:6812 Tutankhatmun | `src/engine/skills/curated/batch-r4.ts` | Death Mark re-picked enemyHealthiest (tie could hit a different enemy than the Curse) → Death Mark on lastTarget (native CauseDeathMark@FromPrevious); destroy colour follows the same enemy |  |
| 2026-09-28T02:30 | sa-R1 | L4a-R1-7928-allnegative | data | 7928 | weapon:1220 EssenceOfEvil | `src/engine/skills/curated/batch-w02.ts` | 12 statuses in ad-hoc order incl. Charm, Curse 10th, missing faerie-fire/marked/lycanthropy/terror → Curse, Stun first (native order R001), then official 15 negatives (RANDOM_NEGATIVE_STATUS_POOL), no Charm (R008) |  |
| 2026-09-28T02:30 | sa-R1 | L4a-R1-9542-order | data | 9542 | troop:7638 ZombieGoat | `src/engine/skills/curated/batch-r9.ts` | Disease then Stun → Stun then Disease (native order R001; not observable, aligned anyway) |  |
| 2026-09-28T02:31 | sa-R2 | R009-giant | data | 8844, 8845, 8846, 8847, 8848, 8849 | troop:7245 Sapphirax；troop:7246 Emeraldrin；troop:7247 Rubirath；troop:7248 Topasarth；troop:7249 Amethialas；troop:7250 Garnetaerlin | `src/engine/skills/curated/batch-r8.ts` | ConvertGems 5 C>GiantC compiled as same-colour transform (no-op); extraTurn after conversion → transformToSpecial(C, giantGem color C, count 5); extra-turn chance rolled before conversion (native CountGems step 0 precedes ConvertGems) |  |
| 2026-09-28T02:31 | sa-R2 | R009-dragon | data | 9132, 9133, 9134, 9135, 9136, 9137 | troop:7440 Comethalas；troop:7441 Nebuladryx；troop:7442 Meteoridan；troop:7443 Solarithus；troop:7444 Lunarelleon；troop:7445 Eklipsos | `src/engine/skills/curated/batch-r8.ts` | ConvertGems 5 C>DragonC compiled as same-colour transform (no-op); extraTurn after conversion → transformToSpecial(C, dragonGem color C, count 5); extra-turn chance rolled before conversion |  |
| 2026-09-28T02:31 | sa-R2 | R009-giant-dragon-L4b | data | 8830, 8832, 8887, 9008 | troop:7234 TheSapphireGiant；troop:7236 TheEmeraldGiant；troop:7268 SetauriGladius；troop:7368 CobaltDrake | `src/engine/skills/curated/batch-r8.ts` | Giant/Dragon targets compiled as plain colour gems (Red>Blue, Brown>Green, create 8 Red, Brown>Blue) → giantGem Blue / giantGem Green / createSpecialGems dragonGem Red 8 / dragonGem Blue (R009) |  |
| 2026-09-28T02:32 | sa-R4 | L7-R1-weapon-colour-race | assembler | 9303, 9306, 9352, 9355, 9507, 9578, 9630, 9633, 9636, 9915, 10048, 7248 | weapon:1581 LickOfFire；weapon:1584 SharpReef；weapon:1588 Bloodblight；weapon:1591 TheBeatenPath；weapon:1615 HolyPath；weapon:1630 BurningClaw；weapon:1640 TitanicCleaver；weapon:1643 FrozenFractal；weapon:1648 Haresplitter；weapon:1691 ClawOfTheNorth；weapon:1716 FeralDagger；weapon:1111 ShatteredBlade | `src/engine/skills/curated/batch-w04.ts`<br>`src/engine/skills/curated/batch-w01.ts` | boost counted only one of the two named sources (race only: 9303/9306/9352/9355; colour only: 9507/9578/9630/9633/9636/9915/10048; Divine only: 7248) → both native Count steps (CountArmyColor + CountArmyType, or 2x CountArmyType for 7248) summed per ally |  |
| 2026-09-28T02:32 | sa-P | L1-charm-instant | test | 7728, 7023, 7316 | troop:6534 Viper；troop:6023 Lamia；troop:6177 ImpOfLove | `tests/unit/gowFixL1-charm-instant.test.ts`<br>`tests/unit/gowLaneL1B02Repro.test.ts` | L1B02Repro it.fails: charm expected to be instant (no lasting status) → R008: charm is a persistent auto-recovering negative status (R004 shared cumulative chance, reset on new negative, blocked by Blessed); repro asserts the lasting status; no runtime change | 16 native Charm skills (R008 list) |
| 2026-09-28T02:32 | sa-P | P-F1-oneof-chosen-target | primitive | 7460, 7348, 7438, 8250, 8407, 8472, 8941, 7194 | troop:6310 GogAndGud；troop:6206 Wraith；troop:6292 NightHag；troop:6845 Dementicore；troop:6929 Destruct-o-Bot；troop:6969 S.O.L.A.R；troop:7329 TheSilkenQueen；weapon:1081 VileFlask | `src/engine/skills/targetChooser.ts`<br>`tests/unit/gowFixP-F1-oneof-chosen-target.test.ts` | prototypeChosenTargetMode scanned root segments only; enemyChosen/allyChosen used only inside oneOf never requested -> spell 7460 had no effect → scan recurses into oneOf branches (root order first, then branch order); 7460 now requests enemy target | every oneOf prototype whose chosen target is branch-only (registry scan: 7460; the 7 sa-F1 rows already had inputTarget) |
| 2026-09-28T02:32 | sa-P | P-F1-summon-after-caster-death | primitive | 7542 | troop:6387 Sunbird | `src/engine/skills/effects/summon.ts`<br>`src/engine/skills/curated/batch-r26.ts`<br>`tests/unit/gowFixP-F1-summon-after-caster-death.test.ts` | summon/summonCopy resolved side via findSide(caster); after the caster died in the same cast the summon was skipped; 7542 used self-kill + selfRevive(full) → summon/summonCopy fall back to ctx.casterSide captured at cast start; 7542 = native Damage@Self 1, Damage@Self 10000, SummoningNoError Sunbird 6387 (fresh troop, death hooks fire) | summon/summonCopy segments after the caster died mid-cast |
| 2026-09-28T02:35 | sa-R3 | R3-B02-7327 | data | 8939 | troop:7327 SilkenFang | `src/engine/skills/curated/batch-r2.ts` | +10 bonus required ally named 丝绸女王 (no such troop; never fired) → +10 bonus when TheSilkenQueen (丝绸女皇, troop:7329) is on the team |  |
| 2026-09-28T02:35 | sa-R3 | R3-B02-7007 | assembler | 8535 | troop:7007 UlfsMascot | `src/engine/skills/curated/batch-r2.ts` | damage then conditional Bleed x2 → conditional Bleed x2 then damage (native order) |  |
| 2026-09-28T02:35 | sa-R3 | R3-B02-1657 | assembler | 9722 | weapon:1657 LeiosClaws | `src/engine/skills/curated/batch-w04.ts` | scatter damage then conditional Bleed x2 → conditional Bleed x2 on all enemies then scatter damage (native order) |  |
| 2026-09-28T02:36 | sa-R1 | L4a-R1-8646-counters | data | 8646 | weapon:1433 OceasTome | `src/engine/skills/curated/batch-w03.ts` | base 4 + 4 x (Blue allies + team size) → 4 x (Blue allies + Elemental allies), no base (native CountArmyColor 400 + CountArmyType 400) |  |
| 2026-09-28T02:36 | sa-R1 | L4a-R1-7568-random-gem | data | 7568 | weapon:1158 Runeforger | `src/engine/skills/curated/batch-w01.ts`<br>`scripts/curated-pools/pool-w01.json` | 1 + (Brown allies + Brown enemies) random Brown gems; zh said Brown gems → (Brown allies + Brown enemies) random gems of any type, no base (native ExplodeGems); zh desc fixed |  |
| 2026-09-28T02:36 | sa-R1 | L4a-R1-8467-target-count | data | 8467 | troop:6964 StormKnight | `src/engine/skills/curated/batch-r22.ts` | columns and Attack scaled by all Blue enemies → fixed 1 column / +5 Attack when the target uses Blue (CountArmyColor@FromTarget); step order still open (P-R1-chosen-target-color-cond) |  |
| 2026-09-28T02:36 | sa-R1 | L4a-R1-9958-count-order | data | 9958 | troop:7883 RagingBull | `src/engine/skills/curated/batch-r13.ts` | row explosion before the buffs; skull kills shrank the Red-enemy count → buffs before the explosion so the count matches native step-0 CountArmyColor |  |
| 2026-09-28T02:36 | sa-R2 | L4b-1625-1674-any | data | 9573, 9831 | weapon:1625 LibramOfDecay；weapon:1674 SanguineDevotion | `src/engine/skills/curated/batch-w04.ts` | transformToSpecial('ANY', decayGem\|bleedGem): whole board incl. skulls converted → transformToSpecial(CHOSEN, ...): only the chosen colour (native ConvertGems 100 FromTarget>Decay\|Bleed) |  |
| 2026-09-28T02:36 | sa-R2 | L4b-6842-prev | data | 8247 | troop:6842 Malcandessa | `src/engine/skills/curated/batch-14.ts` | Poison re-picked enemyWeakest (tie could split Web/Poison) → Poison on lastTarget (native CausePoison@FromPrevious) |  |
| 2026-09-28T02:37 | sa-R2 | L4b-1548-steps | data | 9161 | weapon:1548 TheDecayingOrbit | `src/engine/skills/curated/batch-w04.ts` | Red>Doomskull only (Red>Cursed and Purple>Doomskull steps merged wrongly) → Red>curseGem then Purple>doomSkull, then jumble |  |
| 2026-09-28T02:39 | sa-R3 | R3-B03-1474 | assembler | 8776 | weapon:1474 DesdemonasBolt | `src/engine/skills/curated/batch-w03.ts` | 1 Bleed with Desdaemona → 2 Bleed stacks with Desdaemona (two native steps) |  |
| 2026-09-28T02:39 | sa-R3 | R3-B03-6519 | assembler | 7712 | troop:6519 Undine | `src/engine/skills/curated/batch-r4.ts` | damage chosen enemy and all enemies below → damage chosen enemy and the next one below (NextDownFromTarget) |  |
| 2026-09-28T02:39 | sa-R3 | R3-B03-1247 | assembler | 8052 | weapon:1247 FiendFire | `src/engine/skills/curated/batch-w02.ts` | Curse all enemies only (Burn missing) → Curse then Burn all enemies |  |
| 2026-09-28T02:39 | sa-R3 | R3-B03-6912 | assembler | 8373 | troop:6912 PrinceBarislav | `src/engine/skills/curated/batch-r7.ts` | Enrage self if the caster is a Daemon (targetRace on allySelf; never fired) → Enrage self if the damaged enemy is a Daemon (lastTargetRace) |  |
| 2026-09-28T02:40 | sa-R2 | L4b-1487-1488 | data | 8872, 8873 | weapon:1487 RingOfCrystalIce；weapon:1488 RingOfCrystalFire | `src/engine/skills/curated/batch-w03.ts` | giant count 1 + enemies of colour; status only on lastTarget (one enemy) → giant count = enemies of colour (native CreateGems Giant<C> counter only); status on every enemy of that colour |  |
| 2026-09-28T02:41 | sa-R4 | L7-R1-teamsize-source | assembler | 9635, 9688, 8624, 9875, 8626 | weapon:1645 CoralBow；weapon:1650 HolyBreeze；troop:7089 NaturebornWarden；troop:7831 Balearic；troop:7091 WaterbornPriestess | `src/engine/skills/curated/batch-w04.ts`<br>`src/engine/skills/curated/batch-r1.ts`<br>`src/engine/skills/curated/batch-r16.ts`<br>`src/engine/skills/curated/batch-33.ts` | boost counted every ally (teamSize) instead of the native Count source → native source: Merlantis allies (9635, CountArmyKingdom 3036), Divine allies (9688), Green/Blue allies (8624/9875/8626, CountArmyColor Data 1/0) alongside the gem count |  |
| 2026-09-28T02:41 | sa-R1 | L4a-R1-9193-random-explode | data | 9193 | troop:7476 BrassDrake | `src/engine/skills/curated/batch-r17.ts` | exploded the chosen cell when Dragon Commander present → explodes one random gem (native ExplodeGems x CountArmyTroop) |  |
| 2026-09-28T02:41 | sa-R1 | L4a-R1-immortal-order | data | 9380, 9387, 9486, 9983, 9809 | weapon:1600 LucifasBlade；weapon:1607 TitaniussArcblade；weapon:1610 AbaddonsShard；weapon:1704 ZephaarsBoneblade；weapon:1666 KhaomanisStaff | `src/engine/skills/curated/batch-w04.ts`<br>`src/data/gowWeaponReviewedOverrides.json` | damage first, Immortal-conditional gem step after → native order (R001): conditional explode/destroy first, then the count (Barrier/Bomb/Daemon/Skull/Yellow) and damage |  |
| 2026-09-28T02:42 | sa-R3 | R3-B04-6934 | assembler | 8415 | troop:6934 WarDrok | `src/engine/skills/curated/batch-r4.ts` | boost by caster Attack [3:1] → boost by the first enemy Attack (CountAttack@FrontEnemy 34) |  |
| 2026-09-28T02:42 | sa-R3 | R3-B04-6290 | assembler | 7436 | troop:6290 UrskaWanderer | `src/engine/skills/curated/batch-r7.ts` | boost by summed Attack of all enemies [2:1] (L10 45) → boost by the target enemy Attack [2:1] (L10 19) |  |
| 2026-09-28T02:42 | sa-R3 | R3-B04-1221 | assembler | 7929 | weapon:1221 ShieldOfUrskaya | `src/engine/skills/curated/batch-w02.ts` | Armor boost by chosen ally Attack [2:1] (L10 19) → Armor boost by summed Attack of all enemies [2:1] (L10 45) |  |
| 2026-09-28T02:43 | sa-R2 | L4b-1646-prefnotprev | data | 9647 | weapon:1646 AngRaksEdge | `src/engine/skills/curated/batch-w04.ts` | Bleed on enemyRandomN 4 (distinct, fewer when <4 alive) → RandomEnemy + 3 x enemyRandomPrefNotPrev (R007-3) |  |
| 2026-09-28T02:43 | sa-R2 | L4b-1682-order | data | 9842 | weapon:1682 MaratusGrimoire | `src/engine/skills/curated/batch-w04.ts` | damage then Red>Web → Red>Web (if Maratus) then damage (native order, R001) |  |
| 2026-09-28T02:43 | sa-R2 | R009-7267-color | data | 8886 | troop:7267 HeraldOfKrystenax | `src/engine/skills/curated/batch-r14.ts` | dragonGem without colour → dragonGem color Green (DragonGreen) |  |
| 2026-09-28T02:43 | sa-R1 | L4a-R1-8841-random-explode | data | 8841 | troop:7255 HoundOfLiang | `src/engine/skills/curated/batch-r2.ts` | exploded the chosen cell → explodes one random gem (native ExplodeGems 1) |  |
| 2026-09-28T02:43 | sa-R1 | L4a-R1-7797-order | data | 7797 | troop:6593 FallenValdis | `src/engine/skills/curated/batch-r21.ts` | Doomskull explosion before Silence → Silence Divine enemies, then explode Doomskulls (native order); count timing open (P-R1-count-at-native-step) |  |
| 2026-09-28T02:44 | sa-R4 | L7-R1-6904-nextdown | assembler | 8365 | troop:6904 LordBelanor | `src/engine/skills/curated/batch-r21.ts` | hit chosen enemy and every enemy below it (enemyChosenAndBelow) → hit chosen enemy and only the one directly below (native Damage@NextDownFromTarget; enemyChosenAndNextDown, range all) |  |
| 2026-09-28T02:45 | sa-R3 | R3-B05-1528 | assembler | 8972 | weapon:1528 AngelsFury | `src/engine/skills/curated/batch-w03.ts` | x5 boost by Barriered allies only → x5 boost by Angel gems and Barriered allies |  |
| 2026-09-28T02:46 | sa-R2 | L4b-1441-cursed-gems | data | 8697 | weapon:1441 DarkHammer | `src/engine/skills/curated/batch-w03.ts` | damage boosted by Cursed enemies; Drenza gems created after damage → Drenza Cursed Gems first, damage boosted by board Cursed Gems x4 (native CountGems 400 Cursed) |  |
| 2026-09-28T02:46 | sa-R2 | L4b-1608-1611-order | data | 9388, 9488 | weapon:1608 GlayciasLattice；weapon:1611 ScopriosClaw | `src/engine/skills/curated/batch-w04.ts` | 1608 cleanse before Freeze gems (and stray sourceless x10 modifier); 1611 Scoprio skulls after base skulls → native order: 1608 create 9(+5) Freeze then cleanse; 1611 Scoprio 2 skulls then 4+2/poisoned |  |
| 2026-09-28T02:47 | sa-P | P-F2-dead-target-colour | primitive | 9476 | troop:7597 TheBaneOfValor | `src/engine/skills/effects/context.ts`<br>`src/engine/skills/prototypes.ts`<br>`src/engine/skills/effects/gems.ts`<br>`tests/unit/gowFixP-F2-dead-target-colour.test.ts` | LAST_TARGET / CHOSEN_TARGET colour looked up the live roster; a target killed earlier in the cast resolved to nothing (9476 kill branch converted no gem) → castTracking.colorsAtCastStart snapshot; LAST_TARGET / CHOSEN_TARGET fall back to it when the unit left the roster (9476 K: 1 gem of the dead enemy's colour -> Daemonic Portal) | all LAST_TARGET / CHOSEN_TARGET colour specs after a kill in the same cast |
| 2026-09-28T02:47 | sa-P | P-F1-remove-gems | primitive | 8473, 7349, 7596, 7146, 7478 | troop:6970 Argos；troop:6207 SpiritFox；troop:6423 CatSith；troop:6076 GoblinKing；troop:6328 Krystenax | `src/engine/skills/gowRemoveRules.ts`<br>`src/engine/skills/curated/index.ts`<br>`src/engine/skills/library.ts`<br>`src/engine/skills/effects/gems.ts`<br>`src/engine/skills/effects/context.ts`<br>`src/engine/events.ts`<br>`src/engine/TurnEngine.ts`<br>`src/data/gowWeaponReviewedOverrides.json`<br>`tests/unit/gowFixP-F1-remove-gems.test.ts`<br>`tests/unit/gowLaneL3B02.test.ts` | native RemoveColor / RemoveGems compiled as clear mode destroy: removed gems gave mana, removed Skulls dealt skull damage → new clear mode remove (no mana, no skull damage, no special-gem chain/resources; still counted in castTracking.destroyed, gravity + cascades as usual); applied at registration to the 85 spells whose only native gem-clearing steps are Remove* (gowRemoveRules.ts); weapon reviewed overrides 7124/7230/7577/8347/8807/9111 synced | 85 spell ids in NATIVE_REMOVE_SPELL_IDS; special-gem trigger under Remove proposed in rulings/R010 |
| 2026-09-28T02:48 | sa-R3 | R3-B06-1649 | assembler | 9687 | weapon:1649 SerpentsThorn | `src/engine/skills/curated/batch-w04.ts` | x3 boost by Cursed enemies → x3 boost by Curse gems on the board (CountGems Cursed) |  |
| 2026-09-28T02:48 | sa-R3 | R3-B06-7128 | assembler | 8672 | troop:7128 AnimusOfEnvy | `src/engine/skills/curated/batch-p39.ts` | Entangle/Disease when my Attack/Armor is not higher (ties fired; default scene inflicted both) → Entangle/Disease only when the target's Attack/Armor is strictly higher (targetStatBeatsCaster) |  |
| 2026-09-28T02:49 | sa-R1 | L4a-R1-8663-deaths-order | data | 8663 | troop:7120 BileBlackheart | `src/engine/skills/curated/batch-r17.ts` | explosion before buffs; its own kills boosted the buffs → buffs first (native CountEnemyDeaths at step 0) |  |
| 2026-09-28T02:49 | sa-R1 | L4a-R1-7477-armor-boost | data | 7477 | troop:6327 TheSilvermaiden | `src/engine/skills/curated/batch-20.ts` | only Life boosted by Yellow gems destroyed → Armor and Life both boosted (native UseCounterForAmount on both) |  |
| 2026-09-28T02:49 | sa-R1 | L4a-R1-7601-targets | data | 7601 | weapon:1174 TitaniasFan | `src/engine/skills/curated/batch-w01.ts`<br>`scripts/curated-pools/pool-w01.json` | cleanse all allies, heal only self, boost without source; zh wrong → cleanse + heal all other allies, boost = Blue gems 34% (board, before the removal); zh fixed; remove-vs-destroy open (P-F1-remove-gems) |  |
| 2026-09-28T02:49 | sa-R1 | L4a-R1-8637-row-green | data | 8637 | troop:7102 Hawthorn | `src/engine/skills/curated/batch-r9.ts` | boosted by all Green gems on the board → boosted by Green gems in the destroyed row (native CountGems BoardTarget Row) + Green allies |  |
| 2026-09-28T02:49 | sa-R1 | L4a-R1-9639-block-gargoyle | data | 9639 | troop:7684 AlabasterKnight | `src/engine/skills/curated/batch-r8.ts` | Armor boosted by any destroyed gem x6, Attack unboosted → Attack and Armor boosted x6 by Stone Blocks + Gargoyle gems in the destroyed row |  |
| 2026-09-28T02:51 | sa-R3 | R3-B07-6368 | assembler | 7520 | troop:6368 Urskatyr | `src/engine/skills/curated/batch-33.ts` | Red gem [3:1] boost on Attack only → Red gem [3:1] boost on both Life and Attack (both steps UseCounterForAmount) |  |
| 2026-09-28T02:51 | sa-R3 | R3-B07-1279 | assembler | 8155 | weapon:1279 OrcKingsClub | `src/engine/skills/curated/batch-w02.ts` | Stun all enemies → Stun the target and its adjacent enemies (splashed troops only) |  |
| 2026-09-28T02:52 | sa-R4 | L7-R1-attack-armor-life-pooled | assembler | 7252, 9882, 8238, 7975, 7454, 7864 | troop:6138 Tauros；troop:7838 Creteus；troop:6833 Ferocity；troop:6644 Earthcaller；troop:6304 Minogor；weapon:1217 FireRubyStaff | `src/engine/skills/curated/batch-12.ts`<br>`src/engine/skills/curated/batch-25.ts`<br>`src/engine/skills/curated/batch-r15.ts`<br>`src/engine/skills/curated/batch-r18.ts`<br>`src/engine/skills/curated/batch-r7.ts`<br>`src/engine/skills/curated/batch-w02.ts` | CountAttackArmorLife split into 3 sources floored separately (R007 per-step path); 8238 second hit unboosted-pooling + plain random (could repeat target); 7864 counted Attack only → single native step: Attack+Life+Armor summed then floored once (pooled); 8238 second hit RandomPrefNotPrevEnemy; 7864 counts all three |  |
| 2026-09-28T02:52 | sa-R4 | L7-R1-1571-native-gems | assembler | 9262 | weapon:1571 EmeraldCenser | `src/engine/skills/curated/batch-w04.ts` | boost x3 per Purple ally (English text) → boost x3 per Purple gem (native step 0 CountGems Purple, R001) plus per Mystic ally |  |
| 2026-09-28T02:53 | sa-R2 | L4b-7634-attack | data | 9538 | troop:7634 WoodRot | `src/engine/skills/curated/batch-r14.ts` | Attack [Magic+1] unboosted (only Armor boosted) → Attack and Armor both + converted gems (both native steps UseCounterForAmount) |  |
| 2026-09-28T02:54 | sa-R1 | L4a-R1-8420-cross | data | 8420 | troop:6939 Orrery | `src/engine/skills/curated/batch-14.ts` | row then column as two segments (board refilled between: 16 cells) → destroyChosenCross: one RowAndColumn step, 15 cells |  |
| 2026-09-28T02:54 | sa-R1 | L4a-R1-7769-column-count | data | 7769 | weapon:1202 TitansBane | `src/engine/skills/curated/batch-w02.ts` | boosted by all Skulls on the board after the destroy → boosted x2 by Skulls + Brown gems in the destroyed column |  |
| 2026-09-28T02:54 | sa-R1 | L4a-R1-8812-no-base | data | 8812 | troop:7218 DarkGolem | `src/engine/skills/curated/batch-r22.ts` | second explosion 1 + skulls destroyed → one per Skull destroyed, no base |  |
| 2026-09-28T02:54 | sa-R1 | L4a-R1-8562-attack-boost | data | 8562 | troop:7038 HellclawWarrior | `src/engine/skills/curated/batch-p37.ts` | only Life boosted → Attack and Life boosted by Red + Purple gems; Hellstorm still Red (P-R1-dual-storm) |  |
| 2026-09-28T02:54 | sa-R1 | L4a-R1-9659-prefnotprev | data | 9659 | troop:7690 VelesStormborn | `src/engine/skills/curated/batch-r19.ts` | 3 distinct random enemies → RandomEnemy + 2 x RandomPrefNotPrevEnemy (R007-3) |  |
| 2026-09-28T02:54 | sa-R3 | R3-B08-7143 | assembler | 8692 | troop:7143 Saga | `src/engine/skills/curated/batch-33.ts` | x3 boost by Blue gems on the board (L10 44) → x3 boost by Blue enemies (CountArmyColor@AllEnemies Blue) and Frozen enemies (L10 14) |  |
| 2026-09-28T02:54 | sa-R3 | R3-B08-6985 | assembler | 8495 | troop:6985 SnowyOwlbear | `src/engine/skills/curated/batch-r15.ts` | -10 target Attack whenever my Attack is not higher (ties fired) → -10 target Attack only when the target's Attack is strictly higher |  |
| 2026-09-28T02:54 | sa-P | P-counter-per-step | primitive | 8228, 7252, 7454, 7644, 7975, 8203, 8238, 8751, 9184, 9882 | troop:6826 Umenath；troop:6138 Tauros；troop:6304 Minogor；troop:6466 ChiefStronghorn；troop:6644 Earthcaller；troop:6800 Bullserker；troop:6833 Ferocity；troop:7181 Tauraeus；troop:7467 KingStormgard；troop:7838 Creteus | `src/engine/skills/effects/secondary.ts`<br>`src/engine/skills/curated/batch-r17.ts`<br>`src/engine/skills/curated/batch-12.ts`<br>`src/engine/skills/curated/batch-r7.ts`<br>`src/engine/skills/curated/batch-r18.ts`<br>`src/engine/skills/curated/batch-r1.ts`<br>`src/engine/skills/curated/batch-r15.ts`<br>`src/engine/skills/curated/batch-p40.ts`<br>`src/engine/skills/curated/batch-25.ts`<br>`tests/unit/gowFixP-F2-counter-groups.test.ts` | native CountAttackArmorLife (one Count step) curated as 3-4 separate stat sources; since R007-1 each source floored separately (8228 L10 E11 482) → ModifierSpec.sourceGroups (one floor per group = native step); 8228 = [attack+armor+life] + [magic] (E11 481); the 9 other CountAttackArmorLife rows (7252 7454 7644 7975 8203 8238 8751 9184 9882) pooled: true (single floor) | 10 CountAttackArmorLife prototypes; golden diff 0 new lines |
| 2026-09-28T02:56 | sa-R3 | R3-B09-1505 | assembler | 8946 | weapon:1505 Venomshot | `src/engine/skills/curated/batch-w03.ts` | x3 boost by Poisoned enemies only → x3 boost by Webbed and Poisoned enemies |  |
| 2026-09-28T02:57 | sa-R4 | L7-R1-board-special-counts | assembler | 8815, 8674, 8563, 8630, 8639 | troop:7221 Obsidiaxas；troop:7130 ThornScout；troop:7039 Indrajit；troop:7095 Kalika；troop:7104 NatureWeird | `src/engine/skills/curated/batch-r8.ts`<br>`src/engine/skills/curated/batch-33.ts`<br>`src/engine/skills/curated/batch-r1.ts` | 8815/8630/8639 counted every colour gem (boardGems without colour); 8674 counted Web instead of Entangle gems; 8563/8630 rolled or targeted 4 random hits as one distinct-N pick → 8815 Stone Blocks + Gargoyle gems; 8630/8639 Elemental Stars; 8674 Entangle gems; 8563/8630 randomWaves 4 (RandomEnemy + 3 x RandomPrefNotPrev, per-hit roll) |  |
| 2026-09-28T02:58 | sa-R2 | L4b-6152-attack | data | 7266 | troop:6152 AnointedOne | `src/engine/skills/curated/batch-05.ts` | Attack unboosted → Attack and Life both + floor(converted x 34%) |  |
| 2026-09-28T02:58 | sa-R2 | L4b-7277-7094 | data | 8902, 8629 | troop:7277 QueenAsh；troop:7094 KingHeliodor | `src/engine/skills/curated/batch-r19.ts`<br>`src/engine/skills/curated/batch-r7.ts` | second source teamSize (all allies); 7277 enemyLastN 2 both main targets; 7094 missing 3 Elemental Stars → Brown allies (CountArmyColor Data 5); 7277 single enemySecondLast main; 7094 creates 3 Elemental Stars |  |
| 2026-09-28T02:58 | sa-R2 | L4b-7108-purple-enemies | data | 8651 | troop:7108 MoonPhoenix | `src/engine/skills/curated/batch-p37.ts` | boost by Purple allies (desc 紫色盟友) → boost by Purple enemies (CountArmyColor@AllEnemies Data 4); desc 紫色敌人 |  |
| 2026-09-28T02:58 | sa-R1 | L4a-R1-7014-order | data | 7014 | troop:6014 NightTerror | `src/engine/skills/curated/batch-r4.ts` | Web gems destroyed first, damage boosted by any destroyed gem → damage first boosted x2 by Web gems on the board, then destroy Web gems (native order) |  |
| 2026-09-28T02:58 | sa-R1 | L4a-R1-7230-7964-count | data | 7230, 7964 | weapon:1102 BearTotem；weapon:1230 AxeOfTheSpire | `src/engine/skills/curated/batch-w01.ts`<br>`src/engine/skills/curated/batch-w02.ts`<br>`src/data/gowWeaponReviewedOverrides.json` | [3:1] boost had no source (no bonus) → boost = Green / Brown gems on the board at 34% before the removal; remove-vs-destroy open (P-F1-remove-gems) |  |
| 2026-09-28T02:59 | sa-R3 | R3-B10-7650 | assembler | 9563 | troop:7650 ImmortalSelene | `src/engine/skills/curated/batch-r11.ts` | 3 distinct random enemies → RandomEnemy then 2 x RandomPrefNotPrev (repeats allowed, never the immediately previous target; R007-3) |  |
| 2026-09-28T02:59 | sa-R3 | R3-B10-7688 | assembler | 9646 | troop:7688 ImmortalAngRak | `src/engine/skills/curated/batch-r11.ts` | 4 distinct random enemies → RandomEnemy then 3 x RandomPrefNotPrev (repeats allowed, never the immediately previous target; R007-3) |  |
| 2026-09-28T03:01 | sa-R1 | L4a-R1-8297-life-boost | data | 8297 | troop:6873 Ironjaw | `src/engine/skills/curated/batch-14.ts` | only Armor boosted by Skulls destroyed → Life and Armor both boosted (native UseCounterForAmount on both) |  |
| 2026-09-28T03:01 | sa-R1 | L4a-R1-7133-no-base | data | 7133 | troop:6002 Ettin | `src/engine/skills/curated/batch-19.ts` | 4 Skulls + 4 per Purple destroyed → 4 per Purple destroyed, no base |  |
| 2026-09-28T03:01 | sa-R1 | L4a-R1-cross-8039-9952 | data | 8039, 9952 | troop:6693 CourtJester；troop:7877 DRIDR-8000 | `src/engine/skills/curated/batch-r9.ts`<br>`src/engine/skills/curated/batch-r7.ts` | row then column as two segments (16 cells); 8039 counted every destroyed gem → destroyChosenCross (15 cells); 8039 counts Skulls only |  |
| 2026-09-28T03:01 | sa-R4 | L7-R1-random-chain-waves | assembler | 7418, 8540, 9190, 9944, 9882, 9165, 8055, 9013, 9589, 9859, 8073 | troop:6272 ShipCannon；troop:7027 TuskRaider；troop:7473 Pandallista；troop:7869 DuskWitch；troop:7838 Creteus；troop:7455 FireJuggler；troop:6699 TINA-9000；troop:7373 MantaRaider；troop:7661 DagoNath；troop:7815 MotherMalice；weapon:1253 PlunderAndPeril | `src/engine/skills/curated/batch-01.ts`<br>`src/engine/skills/curated/batch-09.ts`<br>`src/engine/skills/curated/batch-10.ts`<br>`src/engine/skills/curated/batch-11.ts`<br>`src/engine/skills/curated/batch-25.ts`<br>`src/engine/skills/curated/batch-38.ts`<br>`src/engine/skills/curated/batch-r22.ts`<br>`src/engine/skills/curated/batch-r7.ts`<br>`src/engine/skills/curated/batch-r9.ts`<br>`src/engine/skills/curated/batch-w02.ts` | RandomEnemy + RandomPrefNotPrevEnemy chains resolved as N distinct random enemies (fewer hits when fewer enemies alive) → randomWaves N: N separate hits, each avoiding only the previous victim (R007-3), per-hit roll for ranged damage |  |
| 2026-09-28T03:02 | sa-P | P-F3-lasttarget-damaged | primitive | 7791 | troop:6587 UrskaDragoon | `src/engine/skills/effects/secondary.ts`<br>`src/engine/skills/curated/batch-r7.ts`<br>`tests/unit/gowFixP-F3-chosen-target-conditions.test.ts` | no global 'FromTarget is damaged after the hit' condition; 7791 missed the native CountSet@FromTarget [AddForDamaged] -> Enrage@Self step → new global condition chosenTargetDamaged (chosen target alive and hp < maxHp); 7791 appends inflict rage@Self ifCond chosenTargetDamaged | new condition kind only |
| 2026-09-28T03:02 | sa-P | P-F3-prehit-target-compare | primitive | 7670 | troop:6483 SolZara | `src/engine/skills/effects/secondary.ts`<br>`src/engine/skills/curated/batch-r22.ts`<br>`tests/unit/gowFixP-F3-chosen-target-conditions.test.ts` | targetStatBeatsCaster reads castTracking.lastTarget (unset before the first targeted segment) -> souls followed the damage and compared post-hit Life → new global condition chosenTargetStatBeatsCaster (chosen target's current stat vs caster); 7670 native order: souls 10 (+20 if chosen enemy Life > caster Life) then damage x3 on the same pre-hit comparison | new condition kind only |
| 2026-09-28T03:02 | sa-P | P-F2-precount-explode | primitive | 7553 | troop:6398 AncientGolem | `src/engine/skills/effects/secondary.ts`<br>`src/engine/skills/curated/batch-r18.ts`<br>`tests/unit/gowFixP-F2-precount-explode.test.ts` | explode first (skull/mana settle before the spell damage), damage boosted by destroyedGems Blue → new modifier source chosenCellBlockGems (native CountGems Block3x3 around the chosen cell, read before the explosion); 7553 native order: dispel, true damage, explode last | new modifier source kind only |
| 2026-09-28T03:03 | sa-R2 | L4b-7210-doomskull | data | 8797 | troop:7210 Xenith | `src/engine/skills/curated/batch-r16.ts` | createSkulls (plain Skulls) → createSpecialGems doomSkull (native CreateGems Doomskull); evil-only count queued P-R2-gargoyle-tier |  |
| 2026-09-28T03:03 | sa-R3 | R3-B11-1143 | assembler | 7380 | weapon:1143 SerpentineDagger | `src/engine/skills/curated/batch-w01.ts` | slay 10% + 10 per Poisoned enemy counted after the new Poison (>= 20% always) → slay 10%, or 20% if the target was Poisoned at cast start |  |
| 2026-09-28T03:03 | sa-R3 | R3-B11-1156 | assembler | 7563 | weapon:1156 Thingamabob | `src/engine/skills/curated/batch-w01.ts` | splash: neighbours took 50% → two native Damage steps: target and adjacent enemies each take the full [Magic + 4] x7 |  |
| 2026-09-28T03:03 | sa-R3 | R3-B11-6831 | assembler | 8236, 8241 | troop:6831 Treachery；troop:6836 Defiance | `src/engine/skills/curated/batch-r4.ts` | second hit enemyRandom (could repeat the chosen enemy) → second hit RandomPrefNotPrev (avoids the chosen enemy while another lives) |  |
| 2026-09-28T03:05 | sa-R3 | R3-B12-6999 | assembler | 8502, 9222 | troop:6999 Pyrohydra；troop:7489 FellHydra | `src/engine/skills/curated/batch-r9.ts`<br>`src/engine/skills/curated/batch-p38.ts` | Burn/Disease 1-3 distinct random enemies (nRange) → three rolls RandomEnemy + 2 x RandomPrefNotPrev (native steps; repeats allowed, never back-to-back) |  |
| 2026-09-28T03:05 | sa-R3 | R3-B12-7262 | assembler | 8881, 9280 | troop:7262 Aquaria；troop:7516 Bieska | `src/engine/skills/curated/batch-10.ts`<br>`src/engine/skills/curated/batch-33.ts` | splash on 3 distinct random centres → splash centres RandomEnemy + 2 x RandomPrefNotPrev (R007-3) |  |
| 2026-09-28T03:05 | sa-R4 | L7-R1-lethal-order-doomskull | assembler | 8660, 8662, 8083 | troop:7117 Nightarrow；troop:7119 Deathblade；weapon:1262 Deathdealer | `src/engine/skills/curated/batch-22.ts`<br>`src/engine/skills/curated/batch-w02.ts` | 8660/8662 damage then slay roll; 8083 slay chance boosted per Skull (boardSkulls) → 8660/8662 native order: LethalDamageConditional then (True)Damage (R001); 8083 boosted per Doomskull (native CountGems Doomskull) |  |
| 2026-09-28T03:06 | sa-R1 | L4a-R1-no-base-7804-8423 | data | 7804, 8423 | weapon:1209 SkyHero；troop:6942 BoneboundDredge | `src/engine/skills/curated/batch-w02.ts`<br>`src/engine/skills/curated/batch-p39.ts` | base 4 Red / 2 Doomskulls plus the per-gem amount → per-gem amount only (native CreateGems without Amount) |  |
| 2026-09-28T03:06 | sa-R1 | L4a-R1-7159-cross | data | 7159 | troop:6089 Elwyn | `src/engine/skills/curated/batch-19.ts` | row then column (16 cells) → destroyChosenCross (15 cells) |  |
| 2026-09-28T03:06 | sa-R1 | L4a-R1-7388-chosen-row | data | 7388 | troop:6245 ArmoredBoar | `src/engine/skills/curated/batch-r22.ts` | random row → chosen row (Board-target spell, BoardTarget Row) |  |
| 2026-09-28T05:39 | sa-R6 | L2-6583-storm-pool | data | 7787 | troop:6583 Stormsinger | `src/engine/skills/curated/batch-p37.ts` | random storm oneOf 6 options incl. Brown (1/6 each) → native Randomize A+(B-C-D-E-F): Blue/Green/Red/Yellow/Purple storm, 1/5 each, no Brown |  |
| 2026-09-28T05:39 | sa-R6 | L2-1563-create-base | data | 9211, 9212, 9213, 9214, 9215, 9216 | weapon:1563 DoomedCorseque；weapon:1564 DoomedFauchard；weapon:1565 DoomedImpaler；weapon:1566 DoomedSpear；weapon:1567 DoomedVoulge；weapon:1568 DoomedSpade | `src/engine/skills/curated/batch-w04.ts`<br>`src/data/gowWeaponReviewedOverrides.json` | CreateGems count = 2 + 2 x (allies + enemies of the colour) → native CountArmyColor AllAllies 200 + AllEnemies 200 only: 2 x (allies + enemies of the colour), no base 2 |  |
| 2026-09-28T05:40 | sa-R5 | L1-7793-prefnotprev | assembler | 9812 | troop:7793 Kumiko | `src/engine/skills/curated/batch-r22.ts` | charm enemyRandomN n=2 distinct + drain 8 lastTargets → Charm enemyRandom, drain 8 lastTarget, Charm enemyRandomPrefNotPrev, drain 8 lastTarget (R007-3; lone enemy drained 16) |  |
| 2026-09-28T05:40 | sa-R5 | L1-6305-repeat | assembler | 7455 | troop:6305 Incubus | `src/engine/skills/curated/batch-34.ts` | charm enemyRandomN n=2 distinct → two independent charm enemyRandom steps (may repeat) |  |
| 2026-09-28T05:40 | sa-R5 | L1-7515-summon-dist | assembler | 9279 | troop:7515 SuccubusQueen | `src/engine/skills/curated/batch-p38.ts` | summonRandom [Succubus,Incubus] countRange 1-3 uniform → summon Incubus; Succubus 50%; Incubus 25% (native Summoning 6305/6180@50/6305@25) |  |
| 2026-09-28T05:40 | sa-R5 | L1-6498-summon-dist | assembler | 7685 | troop:6498 CedricSparklesack | `src/engine/skills/curated/batch-p39.ts` | summonRef Bombot countRange 1-3 uniform → Bombot + 2 x Bombot 50% (native SummoningNoError 6251, 6251@50, 6251@50: 25/50/25%) |  |
| 2026-09-28T05:40 | sa-R5 | L1-1310-brown | data | 8283 | weapon:1310 Honeydipper | `src/engine/skills/curated/batch-w02.ts`<br>`src/data/gowWeaponReviewedOverrides.json`<br>`scripts/curated-pools/pool-w01.json` | 30% extra turn / 30% half mana chances boosted 1:1 by Brown gems; zh clause 几率因棕色宝石数而增强 → flat independent 30% chances per English + native; zh clause dropped |  |
| 2026-09-28T05:41 | sa-R7 | R7-doomed-count-order | assembler | 7952, 7963, 7973, 8053, 8077, 8078 | weapon:1226 DoomedBlade；weapon:1229 DoomedClub；weapon:1233 DoomedCrossbow；weapon:1248 DoomedGlaive；weapon:1257 DoomedAxe；weapon:1258 DoomedScythe | `src/engine/skills/curated/batch-w02.ts`<br>`src/data/gowWeaponReviewedOverrides.json` | damage, convert, create, then Gain 3 Mana per <colour> enemy counted after the damage (a counted enemy killed by the hit no longer counted) → native CountArmyColor is step 0: the self-mana segment runs first (R001; self mana gain independent of the damage), so killed enemies still count |  |
| 2026-09-28T05:41 | sa-R7 | R7-doomed-support-counters | assembler | 7982, 8047, 8050, 8079, 8080, 8081 | weapon:1236 DoomedCauldron；weapon:1242 DoomedRunestones；weapon:1245 DoomedStatue；weapon:1259 DoomedMask；weapon:1260 DoomedPotions；weapon:1261 DoomedHelm | `src/engine/skills/curated/batch-w02.ts`<br>`src/data/gowWeaponReviewedOverrides.json` | Magic = 2 + 4 x <colour> enemies; other allies Mana 5 (+4 once if any Doom enemy); order hp, mana, magic → native: Magic = 2 x <colour> enemies (CountArmyColor 200 + counter, no base); Mana = 5 + 4 x Doom enemies (CountArmyType doom 400); order hp, magic, mana |  |
| 2026-09-28T05:41 | sa-R7 | R7-6925-two-hits | assembler | 8413 | troop:6925 Rogueling | `src/engine/skills/curated/batch-14.ts` | enemyRandomN n:2 (a lone enemy is hit once) → native Damage@RandomEnemy + Damage@RandomPrefNotPrevEnemy: two hits, a lone enemy is hit twice (R007-3) |  |
| 2026-09-28T05:41 | sa-R7 | R7-7646-target-colour | assembler | 9550 | troop:7646 ShadowWraith | `src/engine/skills/curated/batch-r7.ts` | half mana if any enemy uses Purple (anyEnemyColor) → half mana if the random enemy that was hit uses Purple (lastTargetColor; native CountArmyColor@RandomEnemy -> Damage@FromPrevious) |  |
| 2026-09-28T05:44 | sa-P | R011 | primitive | 9661, 9594, 8469 | troop:7700 Gormungandr；troop:7666 WaterbornTemplar；troop:6966 SpringEmissary | `src/engine/skills/effects/status.ts`<br>`tests/unit/gowFixR011.test.ts` | applyStatus: a Blessed unit rejected every status except blessed/curse (positives too: Barrier, Enchanted, Reflect, Enraged, Submerged) → Blessed blocks only negative statuses (R004 resetting-negative set + negative cleanse set, curse family excluded: curse still cancels blessed); positives apply normally | every skill/trait/gem giving a positive status to a Blessed unit; bless-then-positive spells 9661 (troop:7700), 9594 (troop:7666), 8469 (troop:6966) |
| 2026-09-28T05:48 | sa-R5 | L1-R2-consume-first | assembler | 7326, 7480, 7559, 7637, 7781 | troop:6185 BunniNog；troop:6330 Chupacabra；troop:6404 Lamprey；troop:6459 Mosasaurus；troop:6577 GelatinousCube | `src/engine/skills/curated/batch-r22.ts` | Damage then conditional Devour (6577: one 50% roll for web-or-entangle, on lastTarget) → native ConsumeConditional first (R001), then Damage on the chosen enemy; 6577 two independent 50% rolls (Web, Entangle) |  |
| 2026-09-28T05:48 | sa-R5 | L1-7050-order | assembler | 8575 | troop:7050 IceOrca | `src/engine/skills/curated/batch-r20.ts` | damage, freeze, then 20% execute if frozen (always qualified) → 20% Devour@LastEnemy only if already Frozen, then Damage@LastEnemy, Freeze@LastEnemy |  |
| 2026-09-28T05:48 | sa-R5 | L1-6832-prefnotprev | assembler | 8237 | troop:6832 Persistence | `src/engine/skills/curated/batch-r22.ts` | second hit enemyRandom (may repeat the chosen enemy) → second hit enemyRandomPrefNotPrev (native RandomPrefNotPrevEnemy, R007-3) |  |
| 2026-09-28T05:48 | sa-R7 | R7-1631-counter-only-drain | assembler | 9579 | weapon:1631 DarkEngraver | `src/engine/skills/curated/batch-w04.ts`<br>`src/data/gowWeaponReviewedOverrides.json` | drain 3 + 3 x Undead allies → native DecreaseMana UseCounterForAmount, no Amount: drain 3 x Undead allies only (L3-015 pattern) |  |
| 2026-09-28T05:48 | sa-R7 | R7-1667-drain-order | assembler | 9811 | weapon:1667 MonsterasHammer | `src/engine/skills/curated/batch-w04.ts` | splash damage, then drain all Mana if Immortal Monstera → native order (R001): DecreaseMana@FromTarget [Immortal Monstera] then SplashHighDamage |  |
| 2026-09-28T05:51 | sa-R5 | L1-7654-devour | assembler | 9569 | troop:7654 BaneOfAmbition | `src/engine/skills/curated/batch-r19.ts` | 13+ skulls: plain execute (no stat gain) → 13+ skulls: Devour (native ConsumeConditional 100% AddFor10Skulls), then TrueDamage on the surviving target |  |
| 2026-09-28T05:51 | sa-R5 | L1-7680-pool | assembler | 9615 | troop:7680 DrakeEggs | `src/engine/skills/curated/batch-24.ts` | summonRandom 5 Drake-named troops (DrakeRider, Drake, UndeadDrake, CobaltDrake, BrassDrake) → summonRandom raw kingdom 3064 Wyrmrun (DrakeEggs, TheGreatWyrm, TerraWyrm, NetherWyrm, HornedWyrm) |  |
| 2026-09-28T05:53 | sa-R6 | L2-1361-daemon-barrier | data | 8396 | weapon:1361 EtherealShield | `src/engine/skills/curated/batch-w02.ts`<br>`src/data/gowWeaponReviewedOverrides.json` | armor [M+1] and one random Barrier only when NO Daemon enemy (inverted condition); zh '没有一名恶魔敌人则' → native: IncreaseArmor Self [M+1] always; InflictEffectOnRandomTroops AllAllies barrier x (Daemon enemies) via perCount enemiesOfRace; zh '获得…护甲值，每有一名恶魔敌人则赋予一名随机盟友屏障' |  |
| 2026-09-28T05:53 | sa-R6 | L2-6814-branch-weights | data | 8218 | troop:6814 FrostfireWitch | `src/engine/skills/curated/batch-r4.ts` | oneOf Freeze\|Burn 1/2 each → native Randomize ABC+(D-E-F) Freeze\|Burn\|Freeze: Freeze 2/3, Burn 1/3 |  |
| 2026-09-28T05:53 | sa-R6 | L2-7209-gargoyle-branches | data | 8796 | troop:7209 TheTower | `src/engine/skills/curated/batch-r14.ts` | always a Good gargoyle (no tier); Brown counted after the new gem is placed → native ABC-DEF: Good OR Evil gargoyle 1/2 each; extra-turn chance (7% x Brown) read before the creation (count precedes CreateGems natively) |  |
| 2026-09-28T05:53 | sa-R6 | L2-7217-cell | data | 8804 | troop:7217 StoneMefyt | `src/engine/skills/curated/batch-r28.ts` | gargoyle at a random cell; Green counted in the 8 neighbours after creation; all poisons on one random enemy (enemyRandom pool) → gargoyle (Good/Evil 1/2) on the chosen cell (SingleGem, Target Board); Green counted in the 3x3 incl. the replaced centre before creation (chosenCellBlockGems); each poison on a random living enemy (AllEnemies pool) |  |
| 2026-09-28T05:55 | sa-P | R012 | primitive | 8414, 7563, 9385, 9862, 7790, 8590, 9258, 9371, 9162, 8248 | troop:6926 Smashedmouth；weapon:1156 Thingamabob；weapon:1605 SagittariansBow；troop:7818 TwistedHag；troop:6586 Umbraxis；troop:7062 Leanansidhe；troop:7512 FirebornLynx；troop:7575 ImmortalAquaria；weapon:1550 NightShear；troop:6843 MotherOfDarkness | `src/engine/skills/targeting.ts`<br>`src/engine/skills/prototypes.ts`<br>`src/engine/skills/effects/context.ts`<br>`src/engine/skills/effects/summon.ts`<br>`tests/unit/gowFixR012.test.ts` | BelowTarget/AboveTarget/NextDown/ChosenAndBelow/ChosenAndNextDown/Adjacent anchored on the chosen unit's current formation index and returned [] once an earlier step of the same cast killed it → castTracking.formationAtCastStart (ids per team at cast start); when the anchor left the roster, above/below = units before/after its cast-start slot (NextDown = first surviving below); Adjacent = its cast-start neighbours that are still alive (no shifting further); anchor alive: unchanged. troop:6843 8248 single-segment ChosenAndNextDown kept (equivalent) | every prototype using enemyBelowTarget/enemyAboveTarget/allyBelowTarget/enemyNextDown/enemyChosenAndNextDown/enemyChosenAndBelow/enemyChosenAndAdjacent (33 entities; 9 change in K) |
| 2026-09-28T05:56 | sa-R7 | R7-6269-chosen-daemon | assembler | 7415 | troop:6269 Desdaemona | `src/engine/skills/curated/batch-r7.ts` | extra turn if any enemy is a Daemon (enemyRacePresent), judged after the hit → native CountArmyType@FromTarget daemon (step 0): extra turn if the chosen enemy is a Daemon, judged before the hit (chosenTargetRace; a killed Daemon still counts) |  |
| 2026-09-28T05:56 | sa-R7 | R7-7691-count150-floor | assembler | 9660 | troop:7691 BlackmaneMontu | `src/engine/skills/curated/batch-r9.ts` | damage + 1.5 x target Attack (fractional, 17 -> 25.5 -> rounded 26) → R003: CountAttack 150 = floor(attack x 150 / 100) (17 -> 25), ratio 2:3 |  |
| 2026-09-28T05:56 | sa-R7 | R7-6259-chosen-ally | assembler | 7402 | troop:6259 QueenYsabelle | `src/engine/skills/curated/batch-r28.ts` | damage = a random ally's Attack (randomAllyStat), buffs to that random ally → native spell Target=Ally: damage = the chosen ally's pre-buff Attack (chosenStat), Attack/Armor buffs to the chosen ally |  |
| 2026-09-28T05:57 | sa-R5 | L1-7014-order | assembler | 8546 | troop:7014 Essencia | `src/engine/skills/curated/batch-r5.ts` | summon 1-3 uniform, then explode 10 if a Dragon Spirit is present (always true after the summon) → explode 10 only if a Dragon Spirit was already on the team (counted first), then Dragon Spirit + 2 x 50% |  |
| 2026-09-28T05:57 | sa-R5 | L1-1274-amanithrax | data | 8140 | weapon:1274 TomeOfSpores | `src/engine/skills/curated/batch-w02.ts`<br>`src/data/gowWeaponReviewedOverrides.json` | explode 3 + 3/ally gems; summon any zh-kingdom 齐埃金 (Zaejin) troop → explode 3 per ally only; summon raw Amanithrax 3053 roster (5); ally count still pending P-R5-faction-kingdom |  |
| 2026-09-28T05:58 | sa-R7 | R7-1219-create-before-hit | assembler | 7866 | weapon:1219 SymbolOfAnu | `src/engine/skills/curated/batch-w02.ts` | drain, damage, then create gems of the target colour (after a kill) → native order (R001): DecreaseMana -> CreateGems FromTarget -> Damage |  |
| 2026-09-28T06:00 | sa-P | R010 | test | 7052 | troop:6052 Zombie | `tests/unit/gowFixR010.test.ts` | no test for removed special gems → test: removed bomb/doomSkull/manaPotionGem do not trigger, destroyed ones do; runtime unchanged |  |
| 2026-09-28T06:01 | sa-R6 | L2-board-chosen | data | 7433, 7463, 9846 | troop:6287 BoneScorpion；troop:6313 DragonianMonk；troop:7805 Lapitaur | `src/engine/skills/curated/batch-r17.ts`<br>`src/engine/skills/curated/batch-r7.ts` | Target Board skills used a random row (7433), the fixed board centre for the X (7463), a random gem to explode (9846) → native BoardTarget Row / Diagonals / SingleGem on the player's chosen cell: destroyChosenRow, destroyArea x at CELL, explodeAt(CELL) |  |
| 2026-09-28T06:01 | sa-R6 | L2-6731-branches | data | 8101 | troop:6731 LapinaExplorer | `src/engine/skills/curated/batch-r18.ts` | random row + random column; both knock-backs and two damage rounds always ran → chosen row+column (RowAndColumn); Randomize AB+(CD-EF): knock back the 1st OR the 2nd enemy (1/2 each), then one [M+4] (+4 per Green destroyed) hit on the first 2 |  |
| 2026-09-28T06:01 | sa-R5 | L1-gnome-race | assembler | 8592, 8594 | troop:7064 FrediFretfiddler；troop:7066 BazBonebeater | `src/engine/skills/curated/batch-39.ts` | boosted by Goblin allies (zh 地精 misread) → boosted by Gnome allies (native CountArmyType gnome) |  |
| 2026-09-28T06:01 | sa-R5 | L1-7719-random | assembler | 9711 | troop:7719 RatchetCogbolt | `src/engine/skills/curated/batch-r9.ts` | 2 distinct random enemies; summonRandom countRange 2 (same mech twice) → RandomEnemy + RandomPrefNotPrevEnemy hits; two independent random Mech summons |  |
| 2026-09-28T06:01 | sa-R5 | L1-6425-dist | assembler | 7598 | troop:6425 PrinceEthoras | `src/engine/skills/curated/batch-r21.ts` | oneOf SilverDrakon / Krystenax 50/50 → Randomize AB+(C-D-E-F): SilverDrakon 75%, Krystenax 25% |  |
| 2026-09-28T06:01 | sa-R5 | L1-6594-prefnotprev | assembler | 7798 | troop:6594 ThePossessedKing | `src/engine/skills/curated/batch-r21.ts` | 3 x 20% transform on enemyRandom → RandomEnemy then 2 x RandomPrefNotPrevEnemy |  |
| 2026-09-28T08:22 | sa-R7 | R7-6599-full-or | assembler | 7808 | troop:6599 Envy | `src/engine/skills/curated/batch-r22.ts` | one count of enemies with both full Life and full Mana, x4 → native CountEnemiesFullHealth 400 + CountEnemiesFullMana 400: two separate counts (full Life or full Mana), x4 each; ZH desc 或 |  |
| 2026-09-28T08:22 | sa-R7 | R7-6928-zh-count | data | 8406 | troop:6928 Detect-o-bot | `src/engine/skills/curated/batch-r22.ts` | ZH desc: 8 Red gems per full-Mana enemy → ZH desc: 7 (English/native CountEnemiesFullMana 700; runtime already x7) |  |
| 2026-09-28T08:24 | sa-R6 | L2-6972-order | data | 8475 | troop:6972 VolcanicGolem | `src/engine/skills/curated/batch-r17.ts` | self Life then Armor → native order IncreaseArmor then IncreaseHealth (R001; independent, no observable change) |  |
| 2026-09-28T08:28 | sa-R7 | R7-tarot-extra-turn | assembler | 8667, 8974, 9003, 9115, 8917 | troop:7088 TheDevil；troop:7346 DeathTarot；troop:7363 TheHangedMan；troop:7421 TheHermit；troop:7305 TheHighPriestess | `src/engine/skills/curated/batch-p38.ts`<br>`src/engine/skills/curated/batch-r4.ts`<br>`src/engine/skills/curated/batch-p39.ts`<br>`src/engine/skills/curated/batch-r14.ts` | extra-turn chance 7% base + 7% per gem (8667/8974/9003/9115); counted after the gem creation (8974/9003/9115/8917) → native ExtraTurnConditional UseCounterForAmount, no Amount: 7% per gem only; CountGems step 0 so extra-turn roll placed before the creation (R001) |  |
| 2026-09-28T08:28 | sa-R7 | R7-7211-gargoyle-count | assembler | 8798 | troop:7211 Tourmaline | `src/engine/skills/curated/batch-r8.ts` | drain 4 + 3 per gem on the board (boardGems any) → drain 4 + 3 per Gargoyle gem, Good + Evil (native CountGems GoodGargoyle/BadGargoyle 300) |  |
| 2026-09-28T08:28 | sa-R7 | R7-6825-ratio | assembler | 8235 | troop:6825 Tuliao | `src/engine/skills/curated/batch-r22.ts` | 6 Mana + 4 per chosen-colour gem (x4) → 6 Mana + 1 per 4 chosen-colour gems (native CountGems Amount 25 = [4:1], R003) |  |
| 2026-09-28T08:29 | sa-R5 | L1-gnome-race | assembler | 8591, 8593 | troop:7063 CindiSavagelips；troop:7065 HoagiHumbucker | `src/engine/skills/curated/batch-39.ts` | boosted by Goblin allies; 8593 boost on Attack only → boosted by Gnome allies (native CountArmyType gnome); 8593 [x4] on both Armor and Attack |  |
| 2026-09-28T08:29 | sa-R5 | L1-6135-allies | assembler | 7237 | troop:6135 GarNok | `src/engine/skills/curated/batch-30.ts` | true damage 1 only to caster (allyAll single range); Orc boost on Brown only → true damage 1 to every ally; Orc count [1:1] boosts Red and Brown |  |
| 2026-09-28T08:29 | sa-R5 | L1-6201-dispel | assembler | 7343 | troop:6201 SacrificialPriest | `src/engine/skills/curated/batch-r2.ts` | sacrifice first other ally; Barrier blocks the sacrifice → native FromTarget: chosen ally dispelled then sacrificed |  |
| 2026-09-28T08:29 | sa-R5 | L1-R2-consume-first | assembler | 7281, 7984 | troop:6161 SandShark；troop:6650 HighKingIrongut | `src/engine/skills/curated/batch-r22.ts` | Damage then Devour → native Consume first (R001), Damage only if not devoured |  |
| 2026-09-28T08:29 | sa-R5 | L1-drain-devour | assembler | 8587, 9118 | troop:7059 Kelpie；troop:7424 Eyestalker | `src/engine/skills/curated/batch-r20.ts`<br>`src/engine/skills/curated/batch-r19.ts` | plain execute by drained-mana chance (8587 after the damage) → Devour (ConsumeConditional) by drained-mana chance; 8587 before the damage |  |
| 2026-09-28T08:30 | sa-R7 | R7-tarot-extra-turn | assembler | 9283, 9337 | troop:7526 JusticeTarot；troop:7551 TheHierophant | `src/engine/skills/curated/batch-r7.ts` | 9283: extra turn only if NO Blue gems, 7% base (+boost); ZH desc said 'no Blue gem'. 9337: 7% base + 7%/Green gem, counted after creation → 7% per counted gem only, rolled before the creation (native CountGems step 0 + ExtraTurnConditional without Amount); 9283 ZH desc fixed to 'each Blue gem' |  |
| 2026-09-28T08:34 | sa-R7 | R7-dragon-convert-extra-turn | assembler | 8850, 9515, 9516, 9517, 9518, 9519, 9520, 9521 | troop:7251 Diamantina；troop:7616 Belcerulea；troop:7617 Gladius；troop:7618 Thornaressa；troop:7619 Narcithus；troop:7620 Orrissea；troop:7621 Orchidius；troop:7622 Chrysantherax | `src/engine/skills/curated/batch-r4.ts`<br>`src/engine/skills/curated/batch-r16.ts`<br>`src/engine/skills/curated/batch-r9.ts`<br>`src/engine/skills/curated/batch-p39.ts`<br>`src/engine/skills/curated/batch-r14.ts`<br>`src/engine/skills/curated/batch-30.ts` | extra-turn chance counted after converting/exploding the counted gems; 9515 boost ratio 300:10 (~0); 9521 boost = all destroyed gems x4 → native CountGems step 0: extra-turn roll placed before the gem change (R001); 9515 +3%/Blue gem; 9521 +4%/Skull on the board (boardSkulls) |  |
| 2026-09-28T08:35 | sa-R6 | L2-7125-branches | data | 8665 | troop:7125 FaerieGobmother | `src/engine/skills/curated/batch-p38.ts` | oneOf 3: create 2-3 Wish (countRange) \| damage all \| heal others, 1/3 each → native Randomize AB+(C-D-E-F): 2 Wish \| damage all \| heal others \| 3 Wish, 1/4 each (create total 1/2) |  |
| 2026-09-28T08:35 | sa-R6 | L2-6369-ratio | data | 7521 | troop:6369 Domovoi | `src/engine/skills/curated/batch-r3.ts` | Life +3 per Brown gem (multiplier 3) → native CountGems Brown Amount 34 = [3:1]: + floor(Brown x 34%) (R003 ratio) |  |
| 2026-09-28T08:35 | sa-R6 | L2-7829-heavy-splash | data | 9873 | troop:7829 ToxAndSion | `src/engine/skills/curated/batch-r2.ts` | splash branch used default 50% adjacent splash → native SplashHeavyDamage: adjacent 75% (splashRatio 0.75) |  |
| 2026-09-28T08:36 | sa-P | P-R1-count-at-native-step | primitive | 7207, 7237, 7797, 9237, 7568, 7655, 7656, 7657, 7658, 7659, 7660, 7952, 7963, 7973, 8053, 8077, 8078, 8391, 8392, 9211, 9212, 9213, 9214, 9215, 9216, 8758 | troop:6115 Ranger；troop:6135 GarNok；troop:6593 FallenValdis；troop:7492 Amatiel；weapon:1158 Runeforger；weapon:1180 DoomedTome；weapon:1181 DoomedLibram；weapon:1182 DoomedOpus；weapon:1183 DoomedScripture；weapon:1184 DoomedChronicle；weapon:1185 DoomedCodex；weapon:1226 DoomedBlade；weapon:1229 DoomedClub；weapon:1233 DoomedCrossbow；weapon:1248 DoomedGlaive；weapon:1257 DoomedAxe；weapon:1258 DoomedScythe；weapon:1357 DevilsBane；weapon:1358 HammerOfForce；weapon:1563 DoomedCorseque；weapon:1564 DoomedFauchard；weapon:1565 DoomedImpaler；weapon:1566 DoomedSpear；weapon:1567 DoomedVoulge；weapon:1568 DoomedSpade；troop:7188 FireBeetle | `src/engine/skills/effects/secondary.ts`<br>`src/engine/skills/effects/context.ts`<br>`src/engine/skills/prototypes.ts`<br>`src/engine/skills/curated/batch-r22.ts`<br>`src/engine/skills/curated/batch-30.ts`<br>`src/engine/skills/curated/batch-r21.ts`<br>`src/engine/skills/curated/batch-r13.ts`<br>`src/engine/skills/curated/batch-w01.ts`<br>`src/engine/skills/curated/batch-w02.ts`<br>`src/engine/skills/curated/batch-w04.ts`<br>`src/data/gowWeaponReviewedOverrides.json`<br>`tests/unit/gowFixP-R1-count-at-native-step.test.ts`<br>`tests/unit/gowLaneL3B05.test.ts` | army count sources (teamSize/alliesOf*/enemiesOf* Race/Kingdom/Color) read the live roster when the consuming segment runs: units killed by an earlier segment of the same spell were no longer counted → new atCastStart flag reads castTracking.unitsAtCastStart (alive units at cast start, native Count* at step 0); set on the 26 spells whose native step-0 Count precedes a segment that can kill the counted side | situational: only when a counted unit dies earlier in the same cast; ally-only counts after enemy damage left unflagged (no observable change) |
| 2026-09-28T08:36 | sa-R5 | L1-devour-first | assembler | 8609, 9773, 8574, 8582 | troop:7081 VidarrTheVast；troop:7767 Voidjaw；troop:7049 Devourer；troop:7054 Wereshark | `src/engine/skills/curated/batch-r20.ts`<br>`src/engine/skills/curated/batch-r19.ts` | plain execute roll, after the damage / drain / bleeds (7081 before damage) → native ConsumeConditional first as a real Devour (caster gains stats), then the remaining steps |  |
| 2026-09-28T08:36 | sa-R5 | L1-6294-villager | assembler | 7440 | troop:6294 Werewolf | `src/engine/skills/curated/batch-r7.ts` | transform self into Werewolf (itself) → transform self into Villager (native Transform 6295) |  |
| 2026-09-28T08:36 | sa-R5 | L1-6606-native | assembler | 7930 | troop:6606 WatchMother | `src/engine/skills/curated/batch-26.ts`<br>`src/data/gowLifeRules.json` | one heal to other allies, then summon Leech or Ocularen 50/50 → heal, summon Ocularen Leech, heal again (incl. Leech), summon Ocularen (native order; second summon needs a free slot) |  |
| 2026-09-28T08:36 | sa-R5 | L1-7032-count-first | assembler | 8553 | troop:7032 TheMoon | `src/engine/skills/curated/batch-r26.ts` | extra-turn chance read Purple gems after 2 Lycanthropy Gems were created → extra-turn roll before the creation (native CountGems Purple is step 0) |  |
| 2026-09-28T08:41 | sa-R5 | L1-6827-base | assembler | 8229 | troop:6827 Werebird | `src/engine/skills/curated/batch-r4.ts` | damage base 4 + Magic + Red [3:1] → damage base 3 (native Amount 3, English [Magic + 3]) |  |
| 2026-09-28T08:41 | sa-R5 | L1-6994-summons | assembler | 8500 | troop:6994 DarkDjinnBottle | `src/engine/skills/curated/batch-r13.ts` | summonRandom one of Djinn/Al-Mundhir/Ifrit/Dao → native four sequential Summoning steps Djinn, Al-Mundhir, Ifrit, Dao (fill free slots in order) |  |
| 2026-09-28T08:41 | sa-R5 | L1-7222-chance | assembler | 8817 | troop:7222 Anglerfin | `src/engine/skills/curated/batch-r19.ts` | execute chance 10% per Yellow destroyed → Devour 10% + 1% per Yellow destroyed (native Amount 10 + counter [1:1]) |  |
| 2026-09-28T08:41 | sa-R5 | L1-7155-devour | assembler | 8715 | troop:7155 Piscea | `src/engine/skills/curated/batch-r19.ts` | two 30% executes on enemyRandom → two 30% Devours: RandomEnemy then RandomPrefNotPrevEnemy |  |
| 2026-09-28T08:41 | sa-R5 | L1-devour-first | assembler | 9492 | troop:7609 TheCragMaw | `src/engine/skills/curated/batch-r22.ts` | Damage@LastEnemy then Devour lastTarget → Devour@LastEnemy first (R001), then Damage@LastEnemy |  |
| 2026-09-28T08:43 | sa-R6 | L2-6916-one-skill | data | 8377 | troop:6916 HiveMind | `src/engine/skills/curated/batch-r24.ts` | stolen Magic spread point by point over random Skills of each ally → native IncreaseRandom: each ally gains the full stolen amount on one random Skill (R007-2, oneSkill) |  |
| 2026-09-28T08:43 | sa-R6 | L2-7556-gold-count | data | 9341 | troop:7556 LordDesollatus | `src/engine/skills/curated/batch-r22.ts` | Diseases counted from my Gold after the [M+1] Gold gain → native CountMyGold is step 0: one Disease per 10 Gold held before the gain (disease segment moved before gainGold) |  |
| 2026-09-28T08:43 | sa-R6 | L2-7850-target | data | 9909 | troop:7850 DarkWitch | `src/engine/skills/curated/batch-r12.ts` | Skill reduction + Curse + Web on a random enemy → native spell Target=Enemy, FromTarget steps: on the chosen enemy |  |
| 2026-09-28T08:43 | sa-R6 | L2-1317-branches | data | 8321 | weapon:1317 FellWard | `src/engine/skills/curated/batch-w02.ts`<br>`src/data/gowWeaponReviewedOverrides.json` | Armor +5 per Burning enemy only; always Burn all → native AB+(CD-EF): Armor +5 per Burning and per Diseased enemy; then Burn all OR Disease all (1/2 each) |  |
| 2026-09-28T08:43 | sa-R6 | L2-7496-pref-not-prev | data | 9241 | troop:7496 Bearlock | `src/engine/skills/curated/batch-r12.ts` | enemyRandomN 2 distinct; only one reduction when one enemy is alive → native RandomEnemy + RandomPrefNotPrevEnemy steps (R007-3): second avoids only the previous target, repeats it when it is the only one alive |  |
| 2026-09-28T08:43 | sa-R7 | R7-not-board-misread | assembler | 8824, 7457 | troop:7229 AceOfRunes；troop:6307 Shadowblade | `src/engine/skills/curated/batch-r5.ts` | extra turn / full mana only if there are NO Blue/Purple gems, fixed 7%/6% base (+boost); ZH desc 'no gem' → EN 'for each X Gem' + native Conditional without Amount: 7%/6% per gem only; ZH desc fixed |  |
| 2026-09-28T08:43 | sa-R7 | R7-7061-no-base | assembler | 8589 | troop:7061 DarkKnight | `src/engine/skills/curated/batch-30.ts` | drain 4 + 4 per Purple gem destroyed → drain 4 per Purple gem in the column only (native DecreaseMana UseCounterForAmount, no Amount) |  |
| 2026-09-28T08:47 | sa-R7 | R7-tarot-extra-turn | assembler | 8970, 8666 | troop:7552 TwoOfSwords；troop:7126 TheFool | `src/engine/skills/curated/batch-r4.ts`<br>`src/engine/skills/curated/batch-r5.ts` | extra-turn chance 7% base + 7% per gem → 7% per gem only (native ExtraTurnConditional UseCounterForAmount, no Amount) |  |
| 2026-09-28T08:47 | sa-R6 | L2-7265-dragon | data | 8884 | troop:7265 KoboldEmissary | `src/engine/skills/curated/batch-r9.ts` | 5 (+3) plain Blue gems → native CreateGems DragonBlue: 5 (+3) Blue Dragon gems (R009) |  |
| 2026-09-28T08:47 | sa-R6 | L2-6946-order | data | 8427 | troop:6946 Ankhnum | `src/engine/skills/curated/batch-r22.ts` | damage all first, then one Barrier per cursed enemy still alive → native: count Cursed + Barriers first, then recount + damage (R001) |  |
| 2026-09-28T08:47 | sa-R6 | L2-6237-one-colour | data | 7378 | troop:6237 Couatl | `src/engine/skills/curated/batch-r15.ts` | 12 gems, each a random colour (six-colour mix) → native Randomize A-B-C-D-E-F: 12 gems of one random colour, 1/6 each |  |
| 2026-09-28T08:47 | sa-R6 | L2-6181-create | data | 7322 | troop:6181 TwistedHero | `src/engine/skills/curated/batch-05.ts` | 5 gems, a Red/Purple mix → native two CreateGems steps: 5 Red + 5 Purple (10 gems) |  |
| 2026-09-28T08:51 | sa-P | P-R1-gargoyle-tier-filter,P-R2-gargoyle-tier,P-R4-gargoyle-tier-count,P-R3-dragon-gem-count | primitive | 9918, 9022, 8797, 9547, 9527, 9494, 9532, 9371, 9649 | troop:7851 Seditius；troop:7380 PetrifiedTreant；troop:7210 Xenith；troop:7643 Mudwalker；troop:7626 DragonlordLuther；troop:7611 Bahamata；troop:7627 DragonknightAmira；troop:7575 ImmortalAquaria；weapon:1647 DrakkonsCrest | `src/engine/skills/effects/secondary.ts`<br>`src/engine/skills/effects/gems.ts`<br>`src/engine/skills/builders.ts`<br>`src/engine/skills/curated/batch-r19.ts`<br>`src/engine/skills/curated/batch-r16.ts`<br>`src/engine/skills/curated/batch-r11.ts`<br>`src/engine/skills/curated/batch-r8.ts`<br>`src/engine/skills/curated/batch-r10.ts`<br>`src/engine/skills/curated/batch-r14.ts`<br>`src/engine/skills/curated/batch-w04.ts`<br>`tests/unit/gowFixP-boardSpecial-filters.test.ts` | boardSpecial / destroyedGems special / special clear targets matched on kind only: Good and Bad Gargoyles merged; Dragon<Color> counts used every gem of the colour (9527 9494 9532) or every dragon gem (9371 9649) → boardSpecial {tier?, color?}, destroyedGems {specialTier?}, clear target special {tier?} / randomGems {specialTier?} (missing gem tier = 1); 9918 explodes Bad only, 9022 Good only, 8797 counts Bad only, 9547 counts Good and Bad as separate floored steps, dragon counters use dragonGem + colour | only boards with gargoyle / dragon gems; golden review board has none (diff 0 new lines) |
| 2026-09-28T08:53 | sa-R5 | L1-6930-summons | assembler | 8408 | troop:6930 TinkSteamwhistle | `src/engine/skills/curated/batch-r9.ts` | armor then life; summonRandom countRange 1-3 uniform (same bot) → life then armor (native); Bot + 2 x 50% independent random Bots (25/50/25%) |  |
| 2026-09-28T08:53 | sa-R5 | L1-6513-sacrifice | assembler | 7704 | troop:6513 TheWidowQueen | `src/engine/skills/curated/batch-r2.ts` | sacrifice first other ally (Barrier blocks); summon Urska pool → chosen ally dispelled then sacrificed; summon raw kingdom 3029 Zhul'Kari |  |
| 2026-09-28T08:53 | sa-R5 | L1-6428-steal-summon | assembler | 7602 | troop:6428 Xathenos | `src/engine/skills/curated/batch-r15.ts` | steal half Magic stole 0 (steal() drops halve); on kill summonRandom countRange 1-3 uniform → steal floor(Magic x 50%); on kill three independent random Undead summons 100%/50%/25% |  |
| 2026-09-28T08:53 | sa-R5 | L1-7157-devour | assembler | 8732 | troop:7157 HoardMimic | `src/engine/skills/curated/batch-r19.ts` | devour branch = plain execute → devour branch = real Devour (native Consume) |  |
| 2026-09-28T08:53 | sa-R7 | R7-b11-defs | assembler | 8595, 8439, 8861 | troop:7067 TheStar；weapon:1376 AnkhOfNefertani；troop:7287 TheWheelOfFortune | `src/engine/skills/curated/batch-27.ts`<br>`src/engine/skills/curated/batch-w03.ts`<br>`src/engine/skills/curated/batch-r19.ts` | 8595 gave Mana; 8439 healed + quarter mana to all allies; 8861 extra-turn chance counted on the refilled board after Remove all Gems → 8595 gives Magic (IncreaseSpellPower); 8439 chosen ally only (FromTarget); 8861 chance counted before the removal (CountGems step 0) |  |
| 2026-09-28T08:54 | sa-R6 | L2-7406-branch-weights | data | 9069 | troop:7406 Murk,Lurk,AndDurk | `src/engine/skills/curated/batch-r4.ts` | oneOf 3: true damage \| heal all \| explode Brown, 1/3 each → native AB+(C-D-E-F), C and F both true damage to the last 2: damage 1/2, heal 1/4, explode 1/4 |  |
| 2026-09-28T08:54 | sa-R6 | L2-7483-explode-board | data | 9200 | troop:7483 MazeGuardian | `src/engine/skills/curated/batch-r15.ts` | explode the board = 7 sequential explodeColor/skull segments (board settles between them, ~45-53 gems) → native ExplodeGems Amount 100: one explosion of all 64 gems (explodeRandomGems 100) |  |
| 2026-09-28T08:54 | sa-R6 | L2-6988-one-block | data | 8492 | troop:6988 DarkSmith | `src/engine/skills/curated/batch-r15.ts` | destroy branch removed every Stone Block → native DestroyColor Block Amount 1: one random Stone Block (destroyRandomSpecialGems 1) |  |
| 2026-09-28T08:57 | sa-R5 | L1-devour-first | assembler | 9838, 8382, 8471 | troop:7799 CromCruach；troop:6920 Amarok；troop:6968 Kharybdis | `src/engine/skills/curated/batch-r19.ts`<br>`src/engine/skills/curated/batch-r20.ts` | Damage then plain execute roll(s) → native ConsumeConditional first as real Devour(s), then Damage (6968 damage re-resolves first/last) |  |
| 2026-09-28T08:57 | sa-R5 | L1-6786-summons | assembler | 8193 | troop:6786 Kobra | `src/engine/skills/curated/batch-r9.ts` | summonRandom countRange 1-2 (same troop twice) → kingdom 3016 troop + 50% independent second troop |  |
| 2026-09-28T08:57 | sa-R5 | L1-1486-order | assembler | 8842 | weapon:1486 MirrorShield | `src/engine/skills/curated/batch-w03.ts` | Reflect self first, so 'if I already have Reflect' always held; gave Reflect to all allies → armor, then Reflect to other allies only if I already had it, then Reflect self (native order) |  |
| 2026-09-28T08:57 | sa-R7 | R7-6205-steal-order | assembler | 7347 | troop:6205 MorthanisWill | `src/engine/skills/curated/batch-r15.ts` | steal Armor -> my Magic; true damage before the mana drain (a killed target was never drained) → StealArmor -> my Armor; native order steal, drain all + gain half, then TrueDamage 4 (R001) |  |
| 2026-09-28T08:57 | sa-R7 | R7-7800-prefnotprev | assembler | 9839 | troop:7800 ImmortalTrogolin | `src/engine/skills/curated/batch-r11.ts` | enemyRandomN n:3 (three distinct enemies; lone enemy hit once) → RandomEnemy + 2 x RandomPrefNotPrevEnemy (R007-3): each hit avoids only the previous; lone enemy hit three times |  |
| 2026-09-28T09:01 | sa-R5 | L1-summon-dist | assembler | 8559, 7214, 7501, 8747 | troop:7034 SkrollReborn；troop:6122 Dokkalfar；troop:6349 SirGwayne；troop:7177 AncestorBrodir | `src/engine/skills/curated/batch-r5.ts`<br>`src/engine/skills/curated/batch-p37.ts`<br>`src/engine/skills/curated/batch-r12.ts`<br>`src/engine/skills/curated/batch-r9.ts` | countRange 1-3 uniform (kingdom pools: one troop repeated) → native per-step summons: 100/50/50% (7214: 100/50/25%), kingdom pools re-rolled per step |  |
| 2026-09-28T09:01 | sa-R5 | L1-1154-egg | data | 7529 | weapon:1154 MysteryEgg | `src/engine/skills/curated/batch-w01.ts` | 8 Red Dragon Gems, no summon → Randomize ABC-DEF: 8 Red + 8 Yellow gems, then Dragon Eggs or Fell Dragon Egg |  |
| 2026-09-28T09:01 | sa-R5 | L1-7417-devour | assembler | 9066 | troop:7417 DeathTrapMimic | `src/engine/skills/curated/batch-r19.ts` | devour branch = plain execute → devour branch = real Devour |  |
| 2026-09-28T09:02 | sa-P | P-R4-nextdown-default-range | primitive | 8365 | troop:6904 LordBelanor | `src/engine/skills/prototypes.ts`<br>`tests/unit/gowFixP-R4-nextdown-default-range.test.ts` | damage on enemyChosenAndNextDown without range resolved 2 victims but hit only the first → enemyChosenAndNextDown defaults to range all like enemyChosenAndBelow (curated range:'all' workarounds now redundant) | no curated skill without explicit range (6904/8365 and r22 already pass range all) |
| 2026-09-28T09:02 | sa-P | P-R3-target-status-count,P-R3-ally-status-excl-self | primitive | 8417, 8640, 9808 | troop:6936 RoyalAssassin；weapon:1427 ElementalReach；troop:7791 ImmortalKhaomani | `src/engine/skills/effects/secondary.ts`<br>`src/engine/skills/curated/batch-p37.ts`<br>`src/engine/skills/curated/batch-w03.ts`<br>`src/engine/skills/curated/batch-r11.ts`<br>`tests/unit/gowFixP-R3-status-counts.test.ts` | 8417 counted listed statuses across all enemies; 8640 condBonus anyOf added +12 once; 9808 allyStatusCount blessed included the caster → new source targetStatusCount {statusIds} = listed statuses on the chosen target at cast start (8417 x10, 8640 x12); allyStatusCount excludeSelf (9808 AllAlliesButNotSelf) | situational (statuses on target / Blessed caster) |
| 2026-09-28T09:02 | sa-P | P-R3-precast-compare | primitive | 9291, 7454, 7458, 7960, 9651, 7192 | troop:7533 FirebornPaladin | `src/engine/skills/effects/secondary.ts`<br>`src/engine/skills/curated/batch-r7.ts`<br>`tests/unit/gowFixP-R3-status-counts.test.ts` | casterStatBeatsTarget / targetStatBeatsCaster read castTracking.lastTarget only (false before the first targeting segment); 9291 had to grant Barrier after the hit (post-damage Armor) → both fall back to the chosen target when no lastTarget exists; 9291 native order Barrier (Armor compare) then damage | also seg-0 damage condMult/condBonus using these conditions (7454 7458 7960 9651 7192 / Kingslayer) now evaluate against the chosen target pre-hit; golden diff 0 new lines |
| 2026-09-28T09:02 | sa-R7 | R7-guardian-potions | assembler | 8601, 8606, 8603, 8605 | troop:7073 JakalTheGuardian；troop:7078 AransiTheGuardian；troop:7075 UrielleTheGuardian；troop:7077 RokGarTheGuardian | `src/engine/skills/curated/batch-r8.ts` | 'Create 1-3 <colour> Mana Potions' created plain colour gems; 8606 poison uniform 1-3 distinct targets → manaPotionGem of that colour (native CreateGemsRange <Colour>ManaPotion, same as 8604); 8606 RandomEnemy + 2 x 50% RandomPrefNotPrevEnemy |  |
| 2026-09-28T09:02 | sa-R7 | R7-1460-burning-gems | assembler | 8761 | weapon:1460 TheMoltenWard | `src/engine/skills/curated/batch-w03.ts` | Armor boosted by the number of Burning enemies → boosted by Burning gems on the board (native CountSet + CountGems Burning 100); extra-turn step before the armor (native order) |  |
| 2026-09-28T09:04 | sa-R6 | L2-6949-branches | data | 8430 | troop:6949 DeepMagus | `src/engine/skills/curated/batch-35.ts` | damage all, then Curse all AND Web all → native AB-CD: damage all, then Curse all OR Web all (1/2 each) |  |
| 2026-09-28T09:04 | sa-R6 | L2-1420-branches | data | 8618 | weapon:1420 MedusasBlade | `src/engine/skills/curated/batch-w03.ts`<br>`src/data/gowWeaponReviewedOverrides.json` | [M+1] then always Death Mark → native AB-CD: [M+1] then Poison OR Death Mark (1/2 each) |  |
| 2026-09-28T09:04 | sa-R6 | L2-7523-one-colour | data | 9313 | troop:7523 Chromaticea | `src/engine/skills/curated/batch-11.ts` | 13 gems, each a random one of five colours (mix) → native A+(B-C-D-E-F): 13 gems of one random colour (Blue/Green/Red/Yellow/Purple, 1/5 each) |  |
| 2026-09-28T09:04 | sa-R6 | L2-wrong-enemy-branches | data | 8108, 7254, 7386 | troop:6738 BaneJaw；troop:6140 Gnoll；troop:6243 SavageHunter | `src/engine/skills/curated/batch-r22.ts` | hit the chosen enemy AND a random enemy (two hits; 6738 two skull checks) → native A-B / AB-CD '50% chance to hit the wrong Enemy': one hit, the chosen enemy OR a random enemy (1/2 each); x3 colour condition and 8 Skulls on kill per branch |  |
| 2026-09-28T09:05 | sa-R5 | L1-summon-dist | assembler | 9140 | troop:7438 Caribou | `src/engine/skills/curated/batch-r7.ts` | summonRef Caribou countRange 0-3 uniform → three independent Caribou summons at 50% / 33% / 25% (native) |  |
| 2026-09-28T09:07 | sa-R7 | R7-b14-status-counts | assembler | 8139, 8488, 7410 | troop:6759 KingGobtruffle；troop:6984 TheScourgeOfHonor；weapon:1144 SpiderTotem | `src/engine/skills/curated/batch-p38.ts`<br>`src/engine/skills/curated/batch-p37.ts`<br>`src/engine/skills/curated/batch-w01.ts` | 8139 damage boosted by Poisoned/Diseased enemies, mix fixed 14 (ZH too); 8488 mana counted after the true damage (killed enemies lost); 7410 extra turn if any enemy Webbed after this spell's Web (always) → 8139 mix 14 + poisoned + diseased, created before the unboosted damage; 8488 mana gain before the damage; 7410 extra turn iff the target was Webbed before this spell's Web |  |
| 2026-09-28T09:07 | sa-P | P-R3-next-up-target | primitive | 8485 | troop:6982 Mechataur | `src/engine/skills/targeting.ts`<br>`src/render/App.ts`<br>`src/engine/skills/curated/batch-r13.ts`<br>`tests/unit/gowFixP-R3-next-up-target.test.ts` | no single-unit NextUpFromTarget mode; 8485 silenced both neighbours with one shared 30% roll (enemyChosenAndAdjacent) → new target mode enemyNextUp (living enemy right above the chosen one, R012 cast-start slot); 8485 silence chosen / enemyNextUp / enemyNextDown, three independent 30% rolls | troop:6982 only (random split) |
| 2026-09-28T09:10 | sa-R6 | L2-7282-pref-not-prev | data | 8856 | troop:7282 Vulperus | `src/engine/skills/curated/batch-30.ts` | both Choose branches used enemyRandomN n:3 (3 distinct enemies; fewer hits when fewer alive) → native RandomEnemy + 2 x RandomPrefNotPrevEnemy (R007-3): each pick avoids only the previous target; a lone enemy takes all three |  |
| 2026-09-28T09:10 | sa-R6 | L2-wrong-enemy-branches | data | 7314, 8307 | troop:6175 WildFang；troop:6884 Bullygnoll | `src/engine/skills/curated/batch-r22.ts` | hit the chosen enemy AND a random enemy; 7314 kill bonus applied only Attack (ifTargetDied lost after the first self buff) → one hit, the chosen enemy OR a random enemy (1/2 each); 7314 +8 to all four Skills on kill (castEnemyDied), 8307 +16 Attack on kill |  |
| 2026-09-28T09:12 | sa-R5 | L1-6808-branches | assembler | 8211 | troop:6808 Krampus | `src/engine/skills/curated/batch-acceptance.ts`<br>`tests/unit/troopAcceptanceFixes.test.ts` | Damage always, then one of Submerge / Devour / Transform+Back → native Randomize AB-CD-EF: (Damage+Submerge) \| (Transform daemon+Back) \| (Devour) |  |
| 2026-09-28T09:12 | sa-R5 | L1-6279-chosen | assembler | 7425 | troop:6279 GiantToadstool | `src/engine/skills/curated/batch-r3.ts` | gems of a random enemy colour; 20% transform a random enemy → chosen enemy (inputTarget enemyChosen): its colour x7, 20% transform it into Giant Toadstool |  |
| 2026-09-28T09:12 | sa-R5 | L1-7510-prefnotprev | assembler | 9256 | troop:7510 Weresnake | `src/engine/skills/curated/batch-r15.ts` | second hit enemyRandom (may repeat) → second hit enemyRandomPrefNotPrev (native RandomPrefNotPrevEnemy) |  |
| 2026-09-28T09:13 | sa-P | P-R2-chosen-color-modifier | primitive | 8060 | troop:6704 ShamanOfSet | `src/engine/skills/colorChooser.ts`<br>`tests/unit/gowFixP-R2-chosen-color-modifier.test.ts` | prototypeNeedsColor ignored modifier sources; 8060 never asked for a colour and its boardGems CHOSEN count read 0 (created 0 Red) → boardGems 'CHOSEN' sources anywhere in a segment trigger the colour chooser; 8060 creates one Red per gem of the chosen colour | registry scan: 8060 only |
| 2026-09-28T09:20 | sa-P | P-R1-chosen-target-color-cond | primitive | 8467 | troop:6964 StormKnight | `src/engine/skills/effects/secondary.ts`<br>`src/engine/skills/curated/batch-r22.ts`<br>`tests/unit/gowFixP-R1-chosen-target-color-cond.test.ts` | only lastTargetColor existed (needs a prior targeting segment), so 8467 dealt the true damage first and column skulls could miss a killed front target → global condition chosenTargetColor (cast-start colours of the chosen target); 8467 native order DestroyColumn -> IncreaseAttack -> TrueDamage | troop:6964 only |
| 2026-09-28T09:20 | sa-P | P-R1-row-count-at-cast-start | primitive | 8928 | troop:7316 EyeOfArges | `src/engine/skills/prototypes.ts`<br>`src/engine/skills/effects/context.ts`<br>`src/engine/skills/effects/secondary.ts`<br>`src/engine/skills/curated/batch-28.ts`<br>`tests/unit/gowFixP-R1-row-count-at-cast-start.test.ts` | 8928 counted Red / Brown / Skull gems on the whole board (L10 dmg 178) → castTracking.chosenRowAtCastStart + source chosenRowAtCastStart: only the chosen row, captured before the explode (26 + 8 x row count) | troop:7316 only |
| 2026-09-28T09:25 | sa-P | P-R1-dual-storm | primitive | 8560, 8562, 8454 | troop:7036 HellclawHunter；troop:7038 HellclawWarrior；weapon:1391 IndrajitsClaw | `src/engine/types.ts`<br>`src/engine/TurnEngine.ts`<br>`src/engine/skills/effects/storm.ts`<br>`src/engine/skills/prototypes.ts`<br>`src/engine/skills/builders.ts`<br>`src/engine/skills/effects/secondary.ts`<br>`src/engine/skills/curated/batch-p37.ts`<br>`src/engine/skills/curated/batch-w03.ts`<br>`tests/unit/gowFixP-R1-dual-storm.test.ts` | storms had one colour; Hellstorm (native StormRedPurple) approximated as a Red storm → Team.storm.color2 / storm segment color2 / createStorm opts.color2: both colours get STORM_DROP_WEIGHT in refills, stormPresent matches either; 8560 8562 8454 Red + Purple | storm-change event still reports the primary colour only (UI shows a Red storm) |
| 2026-09-28T10:15 | sa-A | L4a-r3-7874 | data | 9949 | troop:7874 MineCart | `src/engine/skills/curated/batch-r9.ts` | Brown count boosted x3 by every destroyed gem in the row (27 on review board) → boosted x3 by destroyed Skulls only (native CountGems Skull 300 Row) |  |
| 2026-09-28T10:15 | sa-A | L4a-r3-6224 | data | 7366 | troop:6224 LionPrince | `src/engine/skills/curated/batch-12.ts` | enemyFirstN 2 resolved once → native Damage@FrontEnemy then Damage@SecondEnemy resolved per step (front dies -> new second) |  |
| 2026-09-28T10:15 | sa-A | L4a-r3-6736 | data | 8106 | troop:6736 HarpyEagle | `src/engine/skills/curated/batch-r18.ts` | random column; pull lastTarget (dead -> no move) → chosen column (Target Board); TroopOrderFront@LastEnemy resolved at its step |  |
| 2026-09-28T10:15 | sa-A | L4a-r3-7685 | data | 9642 | troop:7685 LapinaLancer | `src/engine/skills/curated/batch-18.ts` | enemyRandomN 2 (lone enemy hit once) → Damage@RandomEnemy + Damage@RandomPrefNotPrevEnemy (R007.3 lone enemy hit twice) |  |
| 2026-09-28T10:19 | sa-C | L5-C-7900-waves | assembler | 9982, 9374 | troop:7900 ImmortalZephaar；troop:7578 ImmortalSagittarian | `src/engine/skills/curated/batch-r11.ts` | 3 random hits as one enemyRandomN draw (3 distinct enemies; 7578 one damage roll shared by the 3 random hits) → randomWaves 3: native RandomEnemy + 2x RandomPrefNotPrevEnemy (avoid only previous, repeats allowed), per-step damage roll |  |
| 2026-09-28T10:19 | sa-C | L5-C-7553-boss | assembler | 9338 | troop:7553 BarrowLord | `src/engine/skills/curated/batch-r19.ts`<br>`src/data/gowSnapshotOverrides.json` | zh + condMult said Tower (Castle x3) → Boss per English/native MultiplyForAscensionBoss (waived R000); zh override |  |
| 2026-09-28T10:19 | sa-C | L5-C-6791-precount | assembler | 8182 | troop:6791 RedCap | `src/engine/skills/curated/batch-r22.ts` | Hunter's Mark checked on the target after the damage (killed marked target -> no Faerie Fire) → lastTargetStatusAtCastStart: native CountSpecificStatusEffect@FromTarget is step 0, before the damage |  |
| 2026-09-28T10:19 | sa-D | D-1435-doomskull | assembler | 8664 | weapon:1435 BlackheartsHorn | `src/engine/skills/curated/batch-w03.ts` | slay chance boosted by all Skulls on the board (boardSkulls) → boosted by Doomskulls only (native CountGems Doomskull 600); order Lethal->TrueDamage still pending P-D-lethal-first-lasttarget |  |
| 2026-09-28T10:19 | sa-A | L4a-r3-6777 | data | 8167 | troop:6777 GorThrum | `src/engine/skills/curated/batch-21.ts` | explode 2 + 2 x Yellow random colour gems → native ExplodeGems UseCounter no Amount: 2 x Yellow destroyed, no base, any gem |  |
| 2026-09-28T10:19 | sa-A | L4a-r3-6361 | data | 7513 | troop:6361 MerchantPrince | `src/engine/skills/curated/batch-r18.ts` | random row + random column → chosen row and column (Target Board, BoardTarget RowAndColumn) |  |
| 2026-09-28T10:19 | sa-A | L4a-r3-6422 | data | 7595 | troop:6422 SummerKnight | `src/engine/skills/curated/batch-30.ts` | Armor [(M/2)+1] unboosted, only Attack boosted by Red → Armor and Attack both boosted x2 per Red destroyed (both UseCounterForAmount) |  |
| 2026-09-28T10:19 | sa-A | L4a-r3-7139 | data | 8688 | troop:7139 Ostryx | `src/engine/skills/curated/batch-27.ts`<br>`src/data/gowSnapshotOverrides.json` | destroy chosen row; 3 Magic to one weakest Mystic; zh row → destroy chosen column; 3 Magic to every Mystic ally (AllyType mystic); zh column |  |
| 2026-09-28T10:19 | sa-A | L4a-r3-6233 | data | 7379 | troop:6233 Dragotaur | `src/engine/skills/curated/batch-19.ts` | Dragon Attack [Magic] unboosted, only Armor boosted → Attack and Armor both boosted x2 per Yellow (both UseCounterForAmount) |  |
| 2026-09-28T10:19 | sa-A | L4a-r3-6909 | data | 8370 | troop:6909 HeraldOfWoe | `src/engine/skills/curated/batch-21.ts` | Attack unboosted, only Armor boosted x5 Brown → Attack and Armor both boosted x5 per Brown |  |
| 2026-09-28T10:19 | sa-A | L4a-r3-6954 | data | 8481 | troop:6954 TombKnight | `src/engine/skills/curated/batch-22.ts` | Armor unboosted, only Attack boosted → native IncreaseAttack then IncreaseArmor, both boosted x2 per Yellow |  |
| 2026-09-28T10:20 | sa-B | B-L4b-prefnotprev | data | 9677, 10045, 9475 | troop:7716 ForsakenGuardian；weapon:1713 VolcanicStaff；troop:7596 StingBat | `src/engine/skills/curated/batch-38.ts`<br>`src/engine/skills/curated/batch-w05.ts`<br>`src/engine/skills/curated/batch-r15.ts`<br>`src/data/gowWeaponReviewedOverrides.json` | enemyRandomN (N distinct targets; lone enemy hit once); 7596 portals only if the first target died → native RandomEnemy + RandomPrefNotPrevEnemy chain (R007-3); 7596 portals on any kill this cast (castEnemyDied) |  |
| 2026-09-28T10:20 | sa-B | B-L4b-7595-order | data | 9474 | troop:7595 DoomedGuardian | `src/engine/skills/curated/batch-r19.ts` | create 2 Portals, then Yellow->Spirit → native order (R001): Yellow->Spirit, then create 2 Portals |  |
| 2026-09-28T10:20 | sa-B | B-L4b-1613-zh | data | 9505 | weapon:1613 BlackflameSpear | `src/engine/skills/curated/batch-w04.ts`<br>`scripts/curated-pools/pool-w01.json`<br>`src/data/gowWeaponReviewedOverrides.json` | zh: boosted by 噩梦传送门宝石 → zh: boosted by 恶魔传送门宝石 (Daemonic Portal Gems, EN + native CountGems DaemonicPortal) |  |
| 2026-09-28T10:23 | sa-D | D-7575-zh | data | 9371 | troop:7575 ImmortalAquaria | `src/engine/skills/curated/batch-r14.ts`<br>`scripts/curated-pools/pool-30.json`<br>`src/data/gowSnapshotOverrides.json` | zh: 并使其下方敌受到其所受伤害的一半 (no 'all') → zh: 并对其下方所有敌人造成该伤害的一半 (English 'all Enemies below them', native BelowTarget) |  |
| 2026-09-28T10:24 | sa-B | B-L4b-6104-blue | data | 7169 | troop:6104 Sylvasi | `src/engine/skills/curated/batch-05.ts`<br>`scripts/curated-pools/pool-05.json`<br>`src/data/gowSnapshotOverrides.json` | converts Yellow->Purple (zh 黄色) → EN + native ConvertGems 100 Blue>Purple: converts Blue->Purple, zh 蓝色 |  |
| 2026-09-28T10:24 | sa-B | B-L4b-1585-entangle-gems | data | 9349 | weapon:1585 BlackwoodsStaff | `src/engine/skills/curated/batch-w04.ts` | scatter boosted x8 per Entangled enemy → native CountGems 800 Entangle: boosted x8 per Entangle Gem on the board |  |
| 2026-09-28T10:25 | sa-C | L5-C-1250-bleed-n | assembler | 8062 | weapon:1250 BloodthirstyAxe | `src/engine/skills/curated/batch-w02.ts`<br>`src/data/gowWeaponReviewedOverrides.json` | Bleed only on the first enemy (enemyFirstN without n) → Bleed on the first 2 enemies (native CauseBleed@FirstTwoEnemies) |  |
| 2026-09-28T10:25 | sa-C | L5-C-1695-lycanthropy | assembler | 9934 | weapon:1695 KveldulfsMaw | `src/engine/skills/curated/batch-w04.ts`<br>`src/data/gowWeaponReviewedOverrides.json` | Kveldulf branch inflicted Curse → Kveldulf branch inflicts Lycanthropy (native Data lycanthropy) |  |
| 2026-09-28T10:25 | sa-C | L5-C-cursebreaker-targets | assembler | 8698, 8699, 8700 | weapon:1442 CursebreakerSword；weapon:1443 CursebreakerBow；weapon:1444 CursebreakerAxe | `src/engine/skills/curated/batch-w03.ts`<br>`scripts/curated-pools/pool-w01.json`<br>`src/data/gowWeaponReviewedOverrides.json` | all three hit last + first; Tempering bonus only on the first-enemy hit; 1443/1444 zh said first and last → 1442 first + last, 1443 last 2, 1444 first 2 (native FirstLast/LastTwo/FirstTwo), +4 per Tempering on every hit; zh for 1443/1444 fixed |  |
| 2026-09-28T10:25 | sa-C | L5-C-6007-random-burn | assembler | 7006 | troop:6007 FlameCannon | `src/engine/skills/curated/batch-04.ts` | 20% Burn on the chosen enemy → 20% Burn on a random enemy (native CauseBurning@RandomEnemy) |  |
| 2026-09-28T10:25 | sa-D | D-6806-count20 | assembler | 8209 | troop:6806 Night-Slayer | `src/engine/skills/curated/batch-r18.ts`<br>`src/data/gowSnapshotOverrides.json` | damage boosted by target Life ratio 20:1 (5%): 59 vs E11 900 Life; zh did not say whose Life → native CountLife@FromTarget 20 = 20% = [5:1] (R003-2): 194; zh 因其生命值 |  |
| 2026-09-28T10:25 | sa-A | L4a-r3-6303 | data | 7453 | troop:6303 RockSpirit | `src/engine/skills/curated/batch-13.ts` | chosen row then chosen column as two destroys (second includes refills) → one 15-cell RowAndColumn cross (native single DestroyGems step) |  |
| 2026-09-28T10:25 | sa-A | L4a-r3-1117 | data | 7269 | weapon:1117 WardensGauntlets | `src/engine/skills/curated/batch-w01.ts` | row then column; boosted by every Green gem on the board → one 15-cell cross; boosted x3 per Green destroyed in it (native CountGems Green RowAndColumn) |  |
| 2026-09-28T10:25 | sa-A | L4a-r3-6720 | data | 8090 | troop:6720 CorpseMare | `src/engine/skills/curated/batch-r9.ts` | boosted x2 by every destroyed gem in the row → boosted x2 by destroyed Skulls only (CountGems Skull 200 Row) |  |
| 2026-09-28T10:25 | sa-A | L4a-r3-7539 | data | 9297 | troop:7539 FeyDragoon | `src/engine/skills/curated/batch-r7.ts` | boosted 1:1 by every gem cleared by the Freeze-gem explosions → boosted 1:1 by the number of Freeze gems (CountGems Freeze 100) |  |
| 2026-09-28T10:27 | sa-C | L5-C-1176-knight | assembler | 7625 | weapon:1176 HeartOfXathenos | `src/engine/skills/curated/batch-w01.ts`<br>`src/data/gowWeaponReviewedOverrides.json` | Disease on Divine enemies → Disease on Knight enemies (native CauseDisease@EnemyType knight) |  |
| 2026-09-28T10:29 | sa-B | B-L4b-7000-zh | data | 8503 | troop:7000 Baihu | `src/engine/skills/curated/batch-r20.ts`<br>`src/data/gowSnapshotOverrides.json` | zh garbled: 结果…伤害一名敌人，由黄色宝石激活。迷惑自己 → zh: 对一名敌人造成…伤害值因黄色宝石数而增强。赋予自己法印效果 (EN Enchant myself) |  |
| 2026-09-28T10:30 | sa-D | D-6117-beast-triple | assembler | 7209 | troop:6117 Scarlett | `src/engine/skills/curated/batch-05.ts`<br>`scripts/curated-pools/pool-05.json`<br>`src/data/gowSnapshotOverrides.json` | x2 against Beasts (raceDouble default 2); zh 双倍 → x3 (native MultiplyForBeast StatusAmount 3, English triple); zh 三倍 |  |
| 2026-09-28T10:31 | sa-A | L4a-r3-7304 | data | 8916 | troop:7304 KingOfRavens | `src/engine/skills/curated/batch-r14.ts` | boosted by Spirit gems left on the board after exploding them (always 0) → boosted x6 per Spirit gem cleared by the spell (native CountGems Spirit at step 0) |  |
| 2026-09-28T10:31 | sa-A | L4a-r3-7586 | data | 9465 | troop:7586 Astaroth | `src/engine/skills/curated/batch-r15.ts` | damage (portal count) then explode → R001: explode 1 per Portal first, then damage x2 per Portal left |  |
| 2026-09-28T10:31 | sa-A | L4a-r3-6778 | data | 8168 | troop:6778 WarWolf | `src/engine/skills/curated/batch-r9.ts` | Red count boosted x3 by every exploded gem → boosted x3 by exploded Skulls only (CountGems Skull Block3x3) |  |
| 2026-09-28T10:33 | sa-B | B-L4b-7257-countmax | data | 8871 | troop:7257 Carmina | `src/engine/skills/curated/batch-r21.ts`<br>`scripts/curated-pools/pool-10.json`<br>`src/data/gowSnapshotOverrides.json` | 4+4+4 creates then 3 conditional +1 creates; zh truncated → native CountMax 1 counter: one create per kind of 4 + (1 if any enemy Death Marked); zh completed |  |
| 2026-09-28T10:33 | sa-B | B-L4b-7768-mix-boost | data | 9774 | troop:7768 ChampionOfRot | `src/engine/skills/curated/batch-33.ts`<br>`scripts/curated-pools/pool-29.json`<br>`src/data/gowSnapshotOverrides.json` | damage boosted by Diseased+Poisoned enemies, mix fixed 16 → EN + native: damage unboosted, mix of 16 + Poisoned + Diseased enemies; zh fixed |  |
| 2026-09-28T10:37 | sa-D | D-1000-strongest | assembler | 7066 | weapon:1000 KnightsSword | `src/engine/skills/curated/batch-w01.ts`<br>`scripts/curated-pools/pool-w01.json`<br>`src/data/gowWeaponReviewedOverrides.json` | damage to the first enemy (enemyFront); zh 对第 1 名敌人 → native Damage@StrongestEnemy -> enemyHealthiest (Life+Armor, R005); zh 对最强的敌人 (pool + reviewed-override description) |  |
| 2026-09-28T10:38 | sa-B | B-L4b-6261-life-boost | data | 7404 | troop:6261 Justice | `src/engine/skills/curated/batch-30.ts` | only Attack boosted by Frozen enemies [x4] → EN + native (both steps UseCounterForAmount): Life and Attack both boosted |  |
| 2026-09-28T10:38 | sa-B | B-L4b-7832-entangle-count | data | 9939 | troop:7832 Wisterina | `src/engine/skills/curated/batch-r2.ts`<br>`scripts/curated-pools/pool-25.json`<br>`src/data/gowSnapshotOverrides.json` | x2 damage only on Entangled targets (condMult); zh 'extra damage on entangled' → native CountSpecificStatusEffect 200: +2 per Entangled enemy to every enemy; zh fixed |  |
| 2026-09-28T10:39 | sa-D | D-1109-single-hit | assembler | 7246 | weapon:1109 CrimsonInsignia | `src/engine/skills/curated/batch-w01.ts` | 13+ Red Gems: a second separate 8-damage hit → native single Damage step with AddFor10RedGems 8: one hit of [Magic+4]+8 (condBonus) |  |
| 2026-09-28T10:40 | sa-A | L4a-r3-1523 | data | 8995 | weapon:1523 Sparkhammer | `src/engine/skills/curated/batch-w03.ts`<br>`src/data/gowWeaponReviewedOverrides.json` | boosted by Bombs left on the board after the explosion → boosted x2 per Bomb cleared by the chosen-gem explosion (CountGems Bomb Block3x3) |  |
| 2026-09-28T10:40 | sa-A | L4a-r3-6188 | data | 7329 | troop:6188 WinterKnight | `src/engine/skills/curated/batch-r15.ts` | explode a random colour gem → explode the chosen Mana Gem (Target ManaGemsOnly, SingleGem) |  |
| 2026-09-28T10:40 | sa-A | L4a-r3-6793 | data | 8184 | troop:6793 WildKnight | `src/engine/skills/curated/batch-26.ts` | Life [Magic+1] unboosted, only Attack boosted → Attack then Life, both boosted x3 per Green |  |
| 2026-09-28T10:40 | sa-A | L4a-r3-6822 | data | 8226 | troop:6822 Merknight | `src/engine/skills/curated/batch-27.ts` | Submerged then Barrier → native order Barrier then Submerged |  |
| 2026-09-28T10:40 | sa-A | L4a-r3-7821 | data | 9865 | troop:7821 StormOracle | `src/engine/skills/curated/batch-r7.ts` | explode a random gem → explode the chosen gem (Target Board, SingleGem) |  |
| 2026-09-28T10:40 | sa-A | L4a-r3-7543 | data | 9318 | troop:7543 Emberclaw | `src/engine/skills/curated/batch-r8.ts` | boosted x5 by every colour gem on the board → boosted x5 per Elemental Star on the board before the explosion |  |
| 2026-09-28T10:40 | sa-A | L4a-r3-7044 | data | 8569 | troop:7044 Researcher | `src/engine/skills/curated/batch-p38.ts` | explode 2, then explode 1 per Bomb left → one explosion of 2 + 1 per Bomb (single native ExplodeGems) |  |
| 2026-09-28T10:40 | sa-A | L4a-r3-7086 | data | 8614 | troop:7086 TerraWyrm | `src/engine/skills/curated/batch-15.ts` | Attack unboosted; explode 3 colour gems → Attack and Armor both +floor(Skulls/2); explode 3 random gems of any kind |  |
| 2026-09-28T10:42 | sa-D | D-b09-targets | assembler | 8463, 7239, 7271, 7648 | troop:6956 Baphomet；weapon:1103 OrderAndChaos；weapon:1119 ChainFlail；troop:6470 Scorpius | `src/engine/skills/curated/batch-08.ts`<br>`src/engine/skills/curated/batch-w01.ts`<br>`src/engine/skills/curated/batch-r15.ts` | 6956 3 distinct randoms picked at once (only 2 hits with 2 enemies); 1103 only the last enemy hit (second-last missing); 1119 bonus 9 dmg could hit the chosen enemy again; 6470 lethal re-resolved the last 2 after kills → 6956 randomWaves 3 + notHit (R006-C3); 1103 enemyLastN n2 (second-last then last); 1119 enemyRandomPrefNotPrev (native RandomPrefNotPrevEnemy); 6470 lethal on lastTargets (same two enemies) |  |
| 2026-09-28T10:42 | sa-B | B-L4b-1167-fromprevious | data | 7586 | weapon:1167 PearlOfWisdom | `src/engine/skills/curated/batch-w01.ts`<br>`src/data/gowWeaponReviewedOverrides.json` | 1 Magic to the caster → native IncreaseSpellPower@FromPrevious: 1 Magic to the Submerged random ally |  |
| 2026-09-28T10:42 | sa-B | B-L4b-7092-singlegem | data | 8627 | troop:7092 Shayle | `src/engine/skills/curated/batch-r14.ts` | random Mana Gem -> Elemental Star → native BoardTarget SingleGem: the chosen cell -> Elemental Star (L4b-7276 convention) |  |
| 2026-09-28T10:44 | sa-D | D-1509-mark-target | assembler | 8952 | weapon:1509 VampiricMark | `src/engine/skills/curated/batch-w03.ts` | steal 6 Life if ANY enemy has Hunter's Mark → only if the target has Hunter's Mark (native StealLife@FromTarget AddForHuntersMark) |  |
| 2026-09-28T10:45 | sa-B | B-L4b-6890-native-chances | data | 8316 | troop:6890 TheLordOfSlaughter | `src/engine/skills/curated/batch-p39.ts` | 1-2 distinct random enemies (50/50) Bleed, then 1-2 Death Mark → native: Bleed@Random, DeathMark@Random, then each again at 25% (fresh random target) |  |
| 2026-09-28T10:45 | sa-B | B-L4b-7082-native-create | data | 8610 | troop:7082 ArchproxyYvendra | `src/engine/skills/curated/batch-36.ts` | no Yellow create; Web/Poison re-pick strongest → native step 0 CreateGems 2 Yellow before Yellow->Uber Doomskull; Web/Poison FromPrevious (lastTarget) |  |
| 2026-09-28T10:46 | sa-A | L4a-r3-7488 | data | 9221 | troop:7488 Unagh | `src/engine/skills/curated/batch-38.ts` | Life then Attack → native order Attack then Life |  |
| 2026-09-28T10:46 | sa-A | L4a-r3-7018 | data | 8525 | troop:7018 RockSquid | `src/engine/skills/curated/batch-r11.ts` | Armor 2 + 2 x removed → Armor 2 x removed (native IncreaseArmor has no Amount) |  |
| 2026-09-28T10:46 | sa-A | L4a-r3-1036 | data | 7102 | weapon:1036 Shadowbringer | `src/engine/skills/curated/batch-w01.ts` | [3:1] boost had no source (always 0) → boosted 34% of Purple gems removed |  |
| 2026-09-28T10:46 | sa-A | L4a-r3-1037 | data | 7103 | weapon:1037 GhostsBane | `src/engine/skills/curated/batch-w01.ts` | [2:1] boost had no source (always 0) → boosted 50% of Blue gems removed |  |
| 2026-09-28T10:46 | sa-A | L4a-r3-1038 | data | 7116 | weapon:1038 FrozenSoul | `src/engine/skills/curated/batch-w01.ts` | [3:1] boost had no source (always 0) → boosted 34% of Red gems removed |  |
| 2026-09-28T10:46 | sa-A | L4a-r3-1039 | data | 7104 | weapon:1039 LionsClaw | `src/engine/skills/curated/batch-w01.ts` | [3:1] boost had no source (always 0) → boosted 34% of Brown gems removed |  |
| 2026-09-28T10:46 | sa-A | L4a-r3-1040 | data | 7105 | weapon:1040 HolyAvenger | `src/engine/skills/curated/batch-w01.ts` | [3:1] boost had no source (always 0) → boosted 34% of Yellow gems removed |  |
| 2026-09-28T10:46 | sa-A | L4a-r3-1044 | data | 7109 | weapon:1044 EagleEye | `src/engine/skills/curated/batch-w01.ts` | [2:1] boost had no source (always 0) → boosted 50% of Green gems removed |  |
| 2026-09-28T10:52 | sa-B | B-L4b-6510-two-creates | data | 7700 | troop:6510 PharaohHound | `src/engine/skills/curated/batch-13.ts`<br>`scripts/curated-pools/pool-13.json`<br>`src/data/gowSnapshotOverrides.json` | mix of 8 Purple/Red → EN + native: 8 Purple, then 8 Red; zh fixed |  |
| 2026-09-28T10:52 | sa-B | B-L4b-6080-nine | data | 7150 | troop:6080 JarlFiremantle | `src/engine/skills/curated/batch-02.ts`<br>`scripts/curated-pools/pool-02.json`<br>`src/data/gowSnapshotOverrides.json` | 10 Red + 10 Yellow (zh 10) → EN + native: 9 Red + 9 Yellow; zh fixed |  |
| 2026-09-28T10:52 | sa-B | B-L4b-6626-order | data | 7944 | troop:6626 SeaWitch | `src/engine/skills/curated/batch-33.ts` | Submerge then Enrage → native order (R001): Enrage, Submerge, heal |  |
| 2026-09-28T10:52 | sa-B | B-L4b-1428-four-creates | data | 8641 | weapon:1428 ElementalBalance | `src/engine/skills/curated/batch-w03.ts`<br>`src/data/gowWeaponReviewedOverrides.json` | only 8 Red → native: 8 Green, 8 Red, 8 Blue, 8 Brown |  |
| 2026-09-28T10:52 | sa-B | B-L4b-1417-wildcard-tiers | data | 8577 | weapon:1417 WildOrb | `src/engine/skills/curated/batch-w03.ts`<br>`src/data/gowWeaponReviewedOverrides.json` | 3 untiered Wildcards → native: 3 x2 + x3/x4 at 50% + x2/x3/x4 at 25% (3-8 various multipliers) |  |
| 2026-09-28T10:52 | sa-B | B-L4b-1371-target-status | data | 8432 | weapon:1371 EldraziWand | `src/engine/skills/curated/batch-w03.ts`<br>`src/data/gowWeaponReviewedOverrides.json` | creates if ANY enemy is Cursed/Webbed → native CreateGems@FromTarget AddForCursed/AddForWeb: the chosen enemy's status at cast start |  |
| 2026-09-28T10:52 | sa-B | B-L4b-1585-entangle-gems | data | 9349 | weapon:1585 BlackwoodsStaff | `src/data/gowWeaponReviewedOverrides.json` | no reviewed override (regeneration would restore the Entangled-enemy source) → override prototype synced with curated batch-w04 (boardSpecial entangleGem) |  |
| 2026-09-28T10:53 | sa-A | L4a-r3-1138 | data | 7308 | weapon:1138 DragonOak | `src/engine/skills/curated/batch-w01.ts` | removed the weapon's own colour (CASTER); [2:1] boost had no source → removes one of the chosen enemy's mana colours (RemoveColor FromTarget); boosted 50% of gems removed |  |
| 2026-09-28T11:07 | sa-C | L5-C-r4-7432 | data | 9126 | troop:7432 LivingRime | `src/engine/skills/curated/batch-r4.ts` | 50% Freeze enemyChosenAndBelow (target included) → 50% Freeze enemyBelowTarget (native BelowTarget, target excluded, R012 pre-kill anchor) |  |
| 2026-09-28T11:08 | sa-E | L1-E-1394-pool | assembler | 8461 | weapon:1394 EmperinasTooth | `src/engine/skills/curated/batch-w03.ts` | summon branch pool Kobold,KoboldKnight,KoboldMagi,KoboldEmissary,KoboldThief → native SummoningKingdomNoError 3051 = raw KingdomId 3051: Kobold,KoboldKnight,KoboldMagi,KoboldThief,Emperinazara |  |
| 2026-09-28T11:09 | sa-A | L4a-r4-1071 | data | 7184 | weapon:1071 Skullblade | `src/engine/skills/curated/batch-w01.ts`<br>`scripts/curated-pools/pool-w01.json`<br>`src/data/gowWeaponReviewedOverrides.json` | damage first, then remove Skulls; boost had no source (always +0); zh duplicated 效果 → native order: remove Skulls, then damage first 2 boosted [2:1] by Skulls removed; zh reordered |  |
| 2026-09-28T11:09 | sa-A | L4a-r4-7457 | data | 9174 | troop:7457 Salamandria | `src/engine/skills/curated/batch-p39.ts` | explode Burning gems first, damage boosted x5 by every gem the blasts destroyed → native order: CountGems Burning, true damage boosted x5 per Burning gem on the board, then explode them |  |
| 2026-09-28T11:10 | sa-C | L5-C-r4-1132 | data | 7296 | weapon:1132 IceDagger | `src/engine/skills/curated/batch-w01.ts` | Freeze enemyChosen → Freeze lastTarget = the LastEnemy that was damaged (native LastEnemy) |  |
| 2026-09-28T11:10 | sa-C | L5-C-r4-7131 | data | 8675 | troop:7131 VaultGuard | `src/engine/skills/curated/batch-37.ts`<br>`src/data/gowSnapshotOverrides.json` | oneOf(Freeze \| Death Mark); zh 'or' → Freeze and Death Mark (native both steps); zh override 'and' |  |
| 2026-09-28T11:10 | sa-C | L5-C-r4-6051 | data | 7051 | troop:6051 Chimera | `src/engine/skills/curated/batch-02.ts` | Poison/Burn re-pick enemyHealthiest each step → Poison/Burn lastTarget (native FromPrevious); none after a kill |  |
| 2026-09-28T11:10 | sa-C | L5-C-r4-6377 | data | 7532 | troop:6377 Parrot | `src/engine/skills/curated/batch-r11.ts` | one 50% roll for both adjacent enemies → NextUp and NextDown each own 50% roll (native two PercentageChance steps) |  |
| 2026-09-28T11:10 | sa-P | P-A-target-kingdom | primitive | 8322, 8323, 8324, 8325, 8326, 8327, 8328, 8329, 8330, 8331, 8332, 8333, 8334, 8335, 8336, 8337, 8338, 8339, 8340, 8341, 8342, 8343, 8344, 8345, 8346, 8347, 8348, 8349, 8350, 8351, 8352, 8353, 8354, 8642, 8807, 8875, 9111, 9593 | weapon:1318 PistolOfAdana；weapon:1319 TomeOfKarakoth；weapon:1320 ChokerOfZhulKari；weapon:1321 StaffOfTheFields；weapon:1322 DaggerOfScales；weapon:1323 BowOfThorns；weapon:1324 StaffOfWhitehelm；weapon:1325 LuteOfTheVale；weapon:1326 HammerOfKhaziel；weapon:1327 ScytheOfKhetar；weapon:1328 DaggerOfZaejin；weapon:1329 SpearOfThePride；weapon:1330 MaceOfGhulvania；weapon:1331 ShieldOfTheEdge；weapon:1332 AxeOfTheStorm；weapon:1333 DaggerOfMaugrim；weapon:1334 MaceOfGrosh-Nak；weapon:1335 StaffOfTheWild；weapon:1336 IdolOfDarkstone；weapon:1337 DaggerOfTheSands；weapon:1338 ScytheOfTheBlight；weapon:1339 ChaliceOfThePeaks；weapon:1340 PendantOfTheEmpire；weapon:1341 TorcOfTheDragon；weapon:1342 FlintlockOfBlackhawk；weapon:1343 RunestoneOfSilverglade；weapon:1344 JavelinOfSuncrest；weapon:1345 AegisOfUrskaya；weapon:1346 TridentOfMerlantis；weapon:1347 StaffOfBrightForest；weapon:1348 HammerOfShentang；weapon:1349 AxeOfDhrak-Zum；weapon:1350 ScytheOfSin；weapon:1429 StarOfNexus；weapon:1479 AegisOfHellcrag；weapon:1499 OrbOfVulpacea；weapon:1560 MydnightsTerror；troop:7665 SeabornKnight | `src/engine/skills/effects/secondary.ts`<br>`src/engine/skills/curated/batch-w02.ts`<br>`src/engine/skills/curated/batch-w03.ts`<br>`src/engine/skills/curated/batch-r19.ts`<br>`src/data/gowWeaponReviewedOverrides.json`<br>`scripts/curated-pools/pool-w01.json`<br>`scripts/_weapon_pools.mjs`<br>`tests/unit/gowFixP-A-target-kingdom.test.ts`<br>`tests/unit/weaponNativeStepRepair.test.ts` | condMult kingdomOf side enemy: any living enemy from the kingdom doubled the hit on any target; zh desc 造成l → new target-relative condition targetKingdom (segment target, fallback chosen target); kingdom weapons anyOf(targetKingdom, kingdomPresent), 9593 targetKingdom; zh stray l removed (pool-w01 + override description/prototype for 34 spells); generator hKingdomCond emits targetKingdom | only kingdom weapons + 9593 used kingdomOf enemy |
| 2026-09-28T11:12 | sa-A | L4a-r4-6990-zh | data | 8494 | troop:6990 NyarMel | `src/engine/skills/curated/batch-r15.ts`<br>`src/data/gowSnapshotOverrides.json` | zh unreadable machine translation → zh follows English (true heavy splash, boosted by Stone Blocks, explode all, create 3); behaviour unchanged |  |
| 2026-09-28T11:12 | sa-A | L4a-r4-7318-zh | data | 8930 | troop:7318 Mumakus | `src/engine/skills/curated/batch-r14.ts`<br>`src/data/gowSnapshotOverrides.json` | zh described another spell (5x5, armor/life, gargoyle gems) → zh follows English (destroy a row, damage first 2 boosted by my Life [3:1]); behaviour unchanged |  |
| 2026-09-28T11:13 | sa-C | L5-C-r4-1294 | data | 8221 | weapon:1294 FrostfireJewel | `src/engine/skills/curated/batch-w02.ts` | Curse/Death Mark if ANY enemy is Frozen/Burning → only if the damaged target itself is Frozen/Burning (native FromTarget AddForFrozen/AddForBurning) |  |
| 2026-09-28T11:13 | sa-C | L5-C-r4-1405 | data | 8508 | weapon:1405 TheNightfallBlade | `src/engine/skills/curated/batch-w03.ts` | 4 Bleed on the chosen enemy if ANY enemy is Poisoned → 4 Bleed on the last enemy if it is Poisoned (native LastEnemy AddForPoison x4) |  |
| 2026-09-28T11:15 | sa-C | L5-C-r4-1132 | data | 7296, 8508 | weapon:1132 IceDagger；weapon:1405 TheNightfallBlade | `src/engine/skills/curated/batch-w01.ts`<br>`src/engine/skills/curated/batch-w03.ts` | LastEnemy status step bound to the damaged enemy (lastTarget) → LastEnemy re-resolved at the step (enemyLast), consistent with native per-step targets and troop:6674 |  |
| 2026-09-28T11:15 | sa-C | L5-C-r4-7142 | data | 8691 | troop:7142 SkyGoat | `src/engine/skills/curated/batch-r15.ts` | three independent enemyRandom waves → RandomEnemy then 2x RandomPrefNotPrevEnemy (R007-3) |  |
| 2026-09-28T11:16 | sa-P | P-B-action-status-self-count | primitive | 8038, 8411, 8937, 7491, 7942 | troop:6692 Mervorax；troop:6933 Ishtara；troop:7325 Tuzi；weapon:1151 EmeraldTear；troop:6624 Mershark | `src/engine/TurnEngine.ts`<br>`src/engine/skills/effects/context.ts`<br>`src/engine/skills/effects/secondary.ts`<br>`src/engine/skills/prototypes.ts`<br>`tests/unit/gowFixP-B-action-status-self-count.test.ts` | TurnEngine.castSkill removed the caster's Enchanted/Submerged/Blessed before the spell body; allyStatusCount/selfStatus/anyAllyStatus never saw the caster's own status → removed ids kept in ctx.actionEndedStatusIds (and castTracking.statusesAtCastStart of the caster); allyStatusCount / selfStatus / anyAllyStatus count the caster; the status is still removed | self-including allyStatusCount/anyAllyStatus/selfStatus users of submerged/blessed/enchanted: troop:6412 6417 6519 6576 6713 6823 6968 7109 7262 7405 7650 7729 7813 weapon:1156 |
| 2026-09-28T11:16 | sa-E | L1-E-1213-dist | assembler | 7816 | weapon:1213 TomeOfSin | `src/engine/skills/curated/batch-w02.ts` | summonRandomOfKingdom zh 迈纳杰之罪 uniform 1-3 → 3 independent summons 100/50/50% (>=13 Purple) from raw KingdomId 3037 list (33; zh kingdom added 5 non-3037) |  |
| 2026-09-28T11:16 | sa-E | L1-E-1238-pool | assembler | 7991 | weapon:1238 Riftblade | `src/engine/skills/curated/batch-w02.ts` | 5 seasonal imps → raw KingdomId 3032: + ImpOfLove |  |
| 2026-09-28T11:16 | sa-E | L1-E-6910-wraith | assembler | 8371 | troop:6910 GaelSpiritwhisperer | `src/engine/skills/curated/batch-r4.ts` | transform into random of Wraith/IceWraith/FrostfireWraith → native Data 6206 = Wraith only |  |
| 2026-09-28T11:16 | sa-E | L1-E-6757-target | assembler | 8137 | troop:6757 Fungomancer | `src/engine/skills/curated/batch-p37.ts`<br>`src/data/gowSnapshotOverrides.json` | transform if ANY enemy Diseased; zh desc said any enemy → target itself Diseased (TransformConditional@FromTarget AddForDisease); zh desc + snapshot override |  |
| 2026-09-28T11:16 | sa-E | L1-E-7111-dist | assembler | 8654 | troop:7111 Oneiros | `src/engine/skills/curated/batch-r5.ts` | Nightmare uniform 1-3 → 3 independent summons 100/50/25% |  |
| 2026-09-28T11:20 | sa-C | L5-C-r4-6819 | data | 8223 | troop:6819 Faemark | `src/engine/skills/curated/batch-r18.ts` | Dispel ifTargetDied after the cleanse segment (checked an ally, never fired) → Dispel all enemies gated by castEnemyDied |  |
| 2026-09-28T11:20 | sa-C | L5-C-r4-6108 | data | 7177 | troop:6108 IceWitch | `src/engine/skills/curated/batch-12.ts`<br>`src/data/gowSnapshotOverrides.json` | +1 Magic to all allies on kill; zh 1 → +3 Magic (English/native StatusAmount 3); zh override |  |
| 2026-09-28T11:20 | sa-C | L5-C-r4-6602 | data | 7811 | troop:6602 Barghast | `src/engine/skills/curated/batch-r4.ts` | target and ALL enemies below → target and the next enemy below only (native NextDownFromTarget) |  |
| 2026-09-28T11:20 | sa-C | L5-C-r4-6708 | data | 8065 | troop:6708 HexRat | `src/engine/skills/curated/batch-37.ts` | double/Death Mark applied to every Cursed enemy in the column → only the chosen enemy is checked, doubled and Death Marked; below plain |  |
| 2026-09-28T11:20 | sa-C | L5-C-r4-6937 | data | 8418 | troop:6937 SisterEbony | `src/engine/skills/curated/batch-r6.ts` | double if ANY enemy uses Blue → each of first/last doubled on its own Blue (MultiplyForBlueTarget); barrier still open (P-C-firstlast-army-color) |  |
| 2026-09-28T11:21 | sa-A | L4a-r4-6758 | data | 8138 | troop:6758 Exploadstool | `src/engine/skills/curated/batch-37.ts` | if an enemy is Diseased: Poison 1-4 distinct random enemies (uniform count) → native four conditional Poison@RandomEnemy steps at 100/50/25/25%, fresh random pick each (may repeat) |  |
| 2026-09-28T11:21 | sa-A | L4a-r4-7174 | data | 8745 | troop:7174 Mechweaver | `src/engine/skills/curated/batch-p37.ts` | destroy chosen row, then chosen column (two clears; a created Bomb could trigger between) → native DestroyGems RowAndColumn: one 15-cell cross clear |  |
| 2026-09-28T11:21 | sa-P | P-D-lethal-first-lasttarget | primitive | 8664 | weapon:1435 BlackheartsHorn | `src/engine/skills/prototypes.ts`<br>`src/engine/skills/curated/batch-w03.ts`<br>`tests/unit/gowFixP-D-lethal-first-lasttarget.test.ts` | failed chance roll of an execute segment returned before target resolution (no lastTarget); 8664 wrote true damage before the slay roll → runSegment: failed roll of a damage execute segment still resolves/tracks its targets; 8664 native order execute enemyLast -> trueDmg lastTarget | execute+chance segments followed by lastTarget/ifTargetDied steps now see the (surviving) victim: troop:6252 6460 6585 6753 7016 7145 7252 7797 |
| 2026-09-28T11:47 | sa-P | P-R5-summon-id-reuse | primitive | 7602, 7643 | troop:6428 Xathenos；troop:6465 Hyena | `src/engine/teamRoster.ts`<br>`src/engine/GameState.ts`<br>`src/engine/TurnEngine.ts`<br>`src/engine/skills/effects/summon.ts` | summon id = max living id + 1: killing the highest-id unit made the next summon reuse its id, lastTarget resolved to the summon and later ifTargetDied summons skipped → monotonic allocateCharId (GameState.charIdHighWater records removed ids); dead ids never reused | every summon (ids after a kill now > highest removed id) |
| 2026-09-28T11:55 | sa-E | L1-E-kingdom-summon-raw | assembler | 8399, 8513, 8514, 8515, 8529, 8670 | weapon:1364 CobaltineWand；weapon:1410 FireGodsHeart；weapon:1411 King-Chopper；weapon:1412 OldMagusStaff；weapon:1414 JellyShot；weapon:1438 EmeraldBlade | `src/engine/skills/curated/gowKingdomPools.ts`<br>`src/engine/skills/curated/batch-w02.ts`<br>`src/engine/skills/curated/batch-w03.ts`<br>`src/data/gowWeaponReviewedOverrides.json` | summonRandomOfKingdom(<zh kingdom name>) = parent kingdom + its faction troops (1411 King-Chopper also drew Dripping Caverns only) → summonRandom(rawKingdomPool(<native Data id>)): roster troops with raw KingdomId 3030/3000/3018/3017/3058/3009 |  |
| 2026-09-28T11:55 | sa-E | L1-E-1414-desc | data | 8529 | weapon:1414 JellyShot | `src/engine/skills/curated/batch-w03.ts`<br>`scripts/curated-pools/pool-w01.json`<br>`src/data/gowWeaponReviewedOverrides.json` | zh desc typo 使用对多的颜色 → 使用最多的颜色 (curated desc + pool-w01 + reviewed override) |  |
| 2026-09-28T11:55 | sa-E | L1-E-6596-row | assembler | 7818 | troop:6596 GloryGnome | `src/engine/skills/curated/batch-39.ts` | destroy a random row → destroy the chosen row (native Target Board, DestroyGems BoardTarget Row) |  |
| 2026-09-28T11:55 | sa-E | L1-E-6601-target | assembler | 7810 | troop:6601 Gluttony | `src/engine/skills/curated/batch-acceptance.ts` | explode colour of a RANDOM enemy (TRACKED_ENEMY) and 20% devour that random enemy; no target prompt → native Target Enemy: explode 4 gems of the chosen enemy's colour (CHOSEN_TARGET), 20% devour the chosen enemy |  |
| 2026-09-28T11:55 | sa-P | P-R5-named-ally-count | primitive | 8744, 8658 | troop:7173 Uvhash-Ka；troop:7115 AbjectOfDespond | `src/engine/skills/effects/secondary.ts`<br>`src/engine/skills/curated/batch-r15.ts`<br>`src/engine/skills/curated/batch-r11.ts` | troopPresent boolean: 3 extra Doomskulls / 3 more Magic if any Eldritch Minion / Despond ally → modifier source alliesNamed {name, atCastStart}: 3 per matching ally (native CountArmyTroop step 0 counter) |  |
| 2026-09-28T12:00 | sa-P | P-R7-dead-last-target-cond | primitive | 9550, 7410, 7541 | troop:7646 ShadowWraith；weapon:1144 SpiderTotem；troop:6386 Warhawk | `src/engine/skills/effects/context.ts`<br>`src/engine/skills/prototypes.ts`<br>`src/engine/skills/effects/secondary.ts` | lastTargetColor/Race/Status false once the hit killed the target (unit spliced, findCharacter undefined) → castTracking.lastTarget.unit keeps the picked Character; colour/race/status conditions read it after death | lastTargetColor/Race/Status users: 8925 8276 8533 8373 9550 7410 7541 |
| 2026-09-28T12:03 | sa-E | L1-E-kingdom-summon-raw | assembler | 8451, 8505, 8510, 8707, 8725, 8765, 8766, 8816, 8905, 8911, 8955, 9034, 9036, 9142, 9145, 9205, 9208, 9235, 9264, 9267, 9305, 9351, 9509, 9577, 9628, 9832, 9835, 8460 | weapon:1388 EyeOfOrion；weapon:1402 WildCleaver；weapon:1407 IceSapphire；weapon:1449 TombLordsCrook；weapon:1453 Runegauge；weapon:1464 DaisysCudgel；weapon:1465 FlailOfGaard；weapon:1484 ObsidianLibram；weapon:1491 BaneOfGods；weapon:1497 ThornOfTheGods；weapon:1511 RuthlessDefense；weapon:1534 ElementalFury；weapon:1536 ThreeGraves；weapon:1541 EmeraldBaton；weapon:1544 WatchersBlade；weapon:1553 FoxFang；weapon:1556 KingCrusher；weapon:1569 ChampionsCleaver；weapon:1573 LionsReach；weapon:1576 ShieldOfVengeance；weapon:1583 Moonshard；weapon:1587 Bonecutter；weapon:1617 BloodcrystalBlade；weapon:1629 GodsBloodRuby；weapon:1638 Stonecaller；weapon:1675 DeadEnd；weapon:1678 Windfall；troop:6960 Emperinazara | `src/engine/skills/curated/gowKingdomPools.ts`<br>`src/engine/skills/curated/batch-w03.ts`<br>`src/engine/skills/curated/batch-w04.ts`<br>`src/engine/skills/curated/batch-r7.ts`<br>`src/data/gowWeaponReviewedOverrides.json` | summonRandomOfKingdom(<zh kingdom name>) (parent + faction troops); 8460 Kobold list had KoboldEmissary (3012), lacked Emperinazara → summonRandom(rawKingdomPool(<native SummoningKingdom Data>)) from raw KingdomId roster |  |
| 2026-09-28T12:03 | sa-E | L1-E-kingdom-desc | data | 9205, 9208 | weapon:1553 FoxFang；weapon:1556 KingCrusher | `src/engine/skills/curated/batch-w04.ts`<br>`scripts/curated-pools/pool-w01.json`<br>`src/data/gowWeaponReviewedOverrides.json` | zh: 一个正面增益状态效果 (random missing) → 一个随机正面增益状态效果 |  |
| 2026-09-28T12:06 | sa-E | L1-E-kingdom-desc | data | 9305, 9509, 9577, 9628 | weapon:1583 Moonshard；weapon:1617 BloodcrystalBlade；weapon:1629 GodsBloodRuby；weapon:1638 Stonecaller | `src/engine/skills/curated/batch-w04.ts`<br>`scripts/curated-pools/pool-w01.json`<br>`src/data/gowWeaponReviewedOverrides.json` | zh kingdom names off-roster (冰封之巅 / 马拉杰之罪 / 地狱岩 / untranslated Dhrak-Zum), 'random positive' wording lost → roster names 冰峰之巅 / 迈纳杰之罪 / 地狱悬崖 / 卓克祖, family wording 赋予…一个随机正面增益效果。再召唤一名…军队 |  |
| 2026-09-28T12:07 | sa-E | L1-E-kingdom-desc | data | 9832 | weapon:1675 DeadEnd | `src/engine/skills/curated/batch-w04.ts`<br>`scripts/curated-pools/pool-w01.json`<br>`src/data/gowWeaponReviewedOverrides.json` | zh 扎金 (off-roster name), status wording → 齐埃金, family wording |  |
| 2026-09-28T12:10 | sa-P | P-R6-chosen-diagonal-transform | primitive | 8762, 8448, 7943 | weapon:1461 SlashingEmbers；weapon:1385 MinosCleaver；troop:6625 Hammerclaw | `src/engine/skills/effects/gems.ts`<br>`src/engine/skills/cellChooser.ts`<br>`src/engine/skills/curated/batch-w03.ts`<br>`src/data/gowWeaponReviewedOverrides.json` | transform diagonal fixed to the board's main diagonals; prototypeNeedsCell ignored oneOf branches (8448 / 7943 chosen row/col explode had no cell and exploded nothing) → transform diagonalAnchor 'chosenCell' (row-col / row+col of the chosen cell); prototypeNeedsCell recurses into oneOf options | Target Board spells whose cell step is inside a random oneOf branch: 8762 8448 7943 |
| 2026-09-28T12:11 | sa-E | L1-E-race-desc | data | 8771, 9207, 9210 | weapon:1470 KingsDagger；weapon:1555 PandaskianWand；weapon:1558 Stonecutter | `src/engine/skills/curated/batch-w03.ts`<br>`src/engine/skills/curated/batch-w04.ts`<br>`scripts/curated-pools/pool-w01.json`<br>`src/data/gowWeaponReviewedOverrides.json` | 1470 zh 罗格 (transliterated Rogue); 1555/1558 'random' missing → 盗贼 + family wording; 一个随机正面增益状态效果 |  |
| 2026-09-28T12:11 | sa-E | L1-E-1551-giant-pool | assembler | 9203 | weapon:1551 TheEnor-mace | `src/engine/skills/curated/batch-w04.ts` | Giant summon pool lacked ImmortalGirthrok → pool = raw TroopType Giant roster (74 -> 75) |  |
| 2026-09-28T12:14 | sa-E | L1-E-race-desc | data | 9508, 9754 | weapon:1616 GoldenTalon；weapon:1665 VulpineFangs | `src/engine/skills/curated/batch-w04.ts`<br>`scripts/curated-pools/pool-w01.json`<br>`src/data/gowWeaponReviewedOverrides.json` | 1616 zh untranslated Stryx; 1665 Wargare as 战神 → 鸟族 / 狼族 (as in troop descs), family wording |  |
| 2026-09-28T12:19 | sa-P | P-R6-chosen-cell-counts | primitive | 8965, 8070 | weapon:1525 StarLocket；troop:6712 BoneGolem | `src/engine/skills/effects/secondary.ts`<br>`src/engine/skills/curated/batch-w03.ts`<br>`src/engine/skills/curated/batch-r17.ts`<br>`src/data/gowWeaponReviewedOverrides.json` | 8965 counted and destroyed the fixed centre X; 8070 exploded first and marked per destroyed skull (killed enemies left the pool), attack before armor → diagonalGems anchor chosenCell + area x center CELL; chosenCellBlockGems skulls; 8070 native order count -> death marks -> explode -> armor -> attack |  |
| 2026-09-28T12:19 | sa-E | L1-E-race-pool-immortals | assembler | 7697, 8648, 8770, 9916 | troop:6507 HyndlaFrostcrown；troop:7105 FlamingOni；weapon:1469 CrownOfHorns；weapon:1692 OceanStar | `src/engine/skills/curated/batch-15.ts`<br>`src/engine/skills/curated/batch-20.ts`<br>`src/engine/skills/curated/batch-w03.ts`<br>`src/engine/skills/curated/batch-w04.ts`<br>`src/data/gowWeaponReviewedOverrides.json` | race summon pools missing newer roster troops (Giant: ImmortalGirthrok; Goblin: Murk,Lurk,AndDurk; Merfolk: ImmortalThalassa) → pools = raw TroopType roster (sweep over all native SummoningType* skills: no other diffs) |  |
| 2026-09-28T12:19 | sa-E | L1-E-race-desc | data | 8622 | weapon:1425 StaffOfStorms | `src/engine/skills/curated/batch-w03.ts`<br>`scripts/curated-pools/pool-w01.json`<br>`src/data/gowWeaponReviewedOverrides.json` | zh Stryx as 冥河 / summon 猎鹰军团 → 鸟族, family wording |  |
| 2026-09-28T12:23 | sa-E | L1-E-7554-dist | assembler | 9339 | troop:7554 HoundmasterGor | `src/engine/skills/curated/batch-r7.ts` | Blight Hound count uniform 1-3 → 3 independent summons 100/50/50% (25/50/25%) |  |
| 2026-09-28T12:23 | sa-E | L1-E-7465-dist | assembler | 9181 | troop:7465 Theodorevich | `src/engine/skills/curated/batch-r22.ts` | 4 summons uniform 25% each → Randomize A+(B-C-D-E-F), B and F both Ragnagord: 40/20/20/20% |  |
| 2026-09-28T12:24 | sa-P | P-R5-faction-kingdom | primitive | 8985, 8140 | troop:7357 FeyHound；weapon:1274 TomeOfSpores | `src/engine/skills/effects/secondary.ts`<br>`src/engine/skills/curated/batch-r19.ts`<br>`src/engine/skills/curated/batch-w02.ts`<br>`src/data/gowWeaponReviewedOverrides.json` | alliesOfKingdom zh parent kingdom (卜筮之原 / 齐埃金) counted every Adana / Zaejin ally → alliesNamed name[] = raw KingdomId 3048 / 3053 roster zh names (Wild Court 5, Amanithrax 5) |  |
| 2026-09-28T12:51 | sa-B | R013-3 | assembler | 7770 | weapon:1203 DaemonsLeash | `src/engine/skills/curated/batch-w02.ts` | second hit Damage@enemyRandom (may repeat the chosen target) → second hit enemyRandomPrefNotPrev (another random enemy; same one only if alone), per R013-3 |  |
| 2026-09-28T12:59 | sa-B | B5-L4b-7403-singlegem | data | 9053 | troop:7403 ForestGremlin | `src/engine/skills/curated/batch-r4.ts` | Faerie Fire Gem on a random gem → chosen cell (native Target Board + SingleGem) |  |
| 2026-09-28T13:00 | sa-B | B5-L4b-1067-singlegem | data | 7174 | weapon:1067 EternalFlame | `src/engine/skills/curated/batch-w01.ts` | random gem converted to Red → chosen non-Red gem (native Target NotRedGems + SingleGem) |  |
| 2026-09-28T13:00 | sa-B | B5-L4b-1091-armor-target | data | 7204 | weapon:1091 PrismaticOrb | `src/engine/skills/curated/batch-w01.ts` | Magic Armor to all allies → Magic Armor to the chosen ally only (IncreaseArmor@FromTarget) |  |
| 2026-09-28T13:06 | sa-B | B5-L4b-doomed-random-armor | data | 8442, 8443, 8444, 8445, 8446, 8447 | weapon:1379 DoomedWand；weapon:1380 DoomedRod；weapon:1381 DoomedStaff；weapon:1382 DoomedFocus；weapon:1383 DoomedMagi；weapon:1384 DoomedBaton | `src/engine/skills/curated/batch-w03.ts` | Doom present: all Armor removed from every enemy → Doom present: all Armor removed from one random enemy (native DecreaseArmor@RandomEnemy) |  |
| 2026-09-28T13:06 | sa-B | B5-L4b-6359-target | data | 7511 | troop:6359 OrcVeteran | `src/engine/skills/curated/batch-r6.ts`<br>`src/data/gowSnapshotOverrides.json` | range damage split over the first 2 enemies; create after damage; zh stray {2} and 'my Attack higher' → one hit on the chosen enemy; create 8 Red first if the target's Attack is lower (native order); zh fixed |  |
| 2026-09-28T13:09 | sa-P | P-E-faction-kingdom | primitive | 8111, 8365, 8556, 8607, 8723, 9245, 9249, 9588, 9593, 8045, 8048, 8051, 8054, 8119, 8121, 8123, 8125, 8176, 8178, 8197, 8199, 8201, 8260, 8261, 8262, 8263, 8285, 8313, 8322, 8323, 8324, 8325, 8326, 8327, 8328, 8329, 8330, 8331, 8332, 8333, 8334, 8335, 8336, 8337, 8338, 8339, 8340, 8341, 8342, 8343, 8344, 8345, 8346, 8347, 8348, 8349, 8350, 8351, 8352, 8353, 8354, 8383, 8385, 8399, 8434, 8451, 8452, 8453, 8487, 8505, 8506, 8510, 8513, 8514, 8515, 8620, 8642, 8645, 8669, 8670, 8707, 8725, 8765, 8766, 8807, 8809, 8905, 8911, 8875, 8877, 8955, 8971, 9034, 9036, 9142, 9145, 9205, 9208, 9111, 9235, 9264, 9267, 9302, 9305, 9351, 9354, 9506, 9509, 9574, 9577, 9628, 9632, 9635, 9689, 9692, 9749, 9752, 9832, 9835, 9911, 9914, 9876, 9974, 9977, 10047, 10050 | troop:6741 GeneralSuladin；troop:6904 LordBelanor；troop:7029 SkyMage；troop:7079 LadyEstelle；troop:7171 LordArchimedus；troop:7500 ManeCourser；troop:7504 Belladonnus；troop:7660 DugallRamhorn；troop:7665 SeabornKnight；weapon:1240 RoseBow；weapon:1243 SpikedMace；weapon:1246 CrystalPoint；weapon:1249 Razorclaw；weapon:1265 DrillShooter；weapon:1267 Grudgekeeper；weapon:1269 PlumedStaff；weapon:1271 SummerAegis；weapon:1282 KoragsInvention；weapon:1284 WolfHammer；weapon:1288 MedusaTome；weapon:1290 CatsPaw；weapon:1292 OakenCrown；weapon:1303 SickleOfSin；weapon:1304 StingingWind；weapon:1305 Soulreaper；weapon:1306 GuardianHammer；weapon:1312 StaffOfOtherworlds；weapon:1314 AmberPartizan；weapon:1318 PistolOfAdana；weapon:1319 TomeOfKarakoth；weapon:1320 ChokerOfZhulKari；weapon:1321 StaffOfTheFields；weapon:1322 DaggerOfScales；weapon:1323 BowOfThorns；weapon:1324 StaffOfWhitehelm；weapon:1325 LuteOfTheVale；weapon:1326 HammerOfKhaziel；weapon:1327 ScytheOfKhetar；weapon:1328 DaggerOfZaejin；weapon:1329 SpearOfThePride；weapon:1330 MaceOfGhulvania；weapon:1331 ShieldOfTheEdge；weapon:1332 AxeOfTheStorm；weapon:1333 DaggerOfMaugrim；weapon:1334 MaceOfGrosh-Nak；weapon:1335 StaffOfTheWild；weapon:1336 IdolOfDarkstone；weapon:1337 DaggerOfTheSands；weapon:1338 ScytheOfTheBlight；weapon:1339 ChaliceOfThePeaks；weapon:1340 PendantOfTheEmpire；weapon:1341 TorcOfTheDragon；weapon:1342 FlintlockOfBlackhawk；weapon:1343 RunestoneOfSilverglade；weapon:1344 JavelinOfSuncrest；weapon:1345 AegisOfUrskaya；weapon:1346 TridentOfMerlantis；weapon:1347 StaffOfBrightForest；weapon:1348 HammerOfShentang；weapon:1349 AxeOfDhrak-Zum；weapon:1350 ScytheOfSin；weapon:1353 AranaeanBloom；weapon:1355 Krys-hook；weapon:1364 CobaltineWand；weapon:1372 ScreamingTome；weapon:1388 EyeOfOrion；weapon:1389 DragonTales；weapon:1390 GinormousCleaver；weapon:1400 PiratesSignet；weapon:1402 WildCleaver；weapon:1403 Whump!；weapon:1407 IceSapphire；weapon:1410 FireGodsHeart；weapon:1411 King-Chopper；weapon:1412 OldMagusStaff；weapon:1423 AxeOfLeeching；weapon:1429 StarOfNexus；weapon:1432 VolcansMace；weapon:1437 HackJob；weapon:1438 EmeraldBlade；weapon:1449 TombLordsCrook；weapon:1453 Runegauge；weapon:1464 DaisysCudgel；weapon:1465 FlailOfGaard；weapon:1479 AegisOfHellcrag；weapon:1481 WatchfulBlade；weapon:1491 BaneOfGods；weapon:1497 ThornOfTheGods；weapon:1499 OrbOfVulpacea；weapon:1501 FoxfireTome；weapon:1511 RuthlessDefense；weapon:1527 AngelsFaith；weapon:1534 ElementalFury；weapon:1536 ThreeGraves；weapon:1541 EmeraldBaton；weapon:1544 WatchersBlade；weapon:1553 FoxFang；weapon:1556 KingCrusher；weapon:1560 MydnightsTerror；weapon:1569 ChampionsCleaver；weapon:1573 LionsReach；weapon:1576 ShieldOfVengeance；weapon:1580 MistyJournal；weapon:1583 Moonshard；weapon:1587 Bonecutter；weapon:1590 ShadowStaff；weapon:1614 TrickstersSlice；weapon:1617 BloodcrystalBlade；weapon:1626 CrystallianBlade；weapon:1629 GodsBloodRuby；weapon:1638 Stonecaller；weapon:1642 PoisonousBrew；weapon:1645 CoralBow；weapon:1651 TeslasWrench；weapon:1654 LostTreasure；weapon:1660 ArcaneComet；weapon:1663 JewelOfMischief；weapon:1675 DeadEnd；weapon:1678 Windfall；weapon:1687 MiasmicDirk；weapon:1690 Spiritflame；weapon:1694 Nightwatch；weapon:1700 SlayersCleaver；weapon:1703 BigBang；weapon:1715 GrimoireOfTheGrove；weapon:1718 DesertStar | `scripts/build_troops.mjs`<br>`src/data/troops.ts`<br>`src/engine/types.ts`<br>`src/engine/skills/effects/secondary.ts`<br>`src/engine/skills/prototypes.ts`<br>`src/engine/skills/effects/summon.ts`<br>`src/session/contract.ts`<br>`src/session/combatantMapping.ts`<br>`src/meta/systems/battleBridge.ts`<br>`scripts/_weapon_pools.mjs`<br>`src/engine/skills/curated/batch-w02.ts`<br>`src/engine/skills/curated/batch-w03.ts`<br>`src/engine/skills/curated/batch-w04.ts`<br>`src/engine/skills/curated/batch-r18.ts`<br>`src/engine/skills/curated/batch-r19.ts`<br>`src/engine/skills/curated/batch-r21.ts`<br>`src/data/gowWeaponReviewedOverrides.json` | kingdom filters (targetKingdom / alliesOfKingdom / kingdomOf) matched the zh kingdom name, which faction troops share with their parent kingdom (e.g. raw 3070 troops = 圣唐) → troops.json/Character carry raw native kingdomId; KingdomRef number matches kingdomId; curated users of native AllyKingdom / CountArmyKingdom / MultiplyForKingdom<id> switched to the id; kingdomPresent (battle kingdom) keeps the zh name | 126 skills with a native kingdom id step; only differs when a faction troop (or mis-assigned zh kingdom) is on the field |
| 2026-09-28T13:10 | sa-B | B5-L4b-6321-more-magic | data | 7471 | troop:6321 SilverDrakon | `src/engine/skills/curated/batch-r6.ts` | 8 Blue when my Magic is above the target's (inverted) → 8 Blue when the front enemy's Magic is above mine (AddForMoreMagicOnTarget) |  |
| 2026-09-28T13:10 | sa-B | B5-L4b-1489-blue-giants | data | 8874 | weapon:1489 DiamondRingOfFire&Ice | `src/engine/skills/curated/batch-w03.ts`<br>`src/data/gowWeaponReviewedOverrides.json` | only 3 Red Giant Gems → 3 Blue Giant Gems then 3 Red Giant Gems (native); reviewed override prototype synced |  |
| 2026-09-28T13:12 | sa-B | B5-L4b-R009-giants | data | 8834, 8836, 8837, 8839 | troop:7238 TheRubyGiant；troop:7240 TheAmethystGiant；troop:7241 TheTopazGiant；troop:7243 TheUmbralGiant | `src/engine/skills/curated/batch-r9.ts` | ConvertGems 5 X > Giant<C> produced plain <C> gems → produces <C> Giant Gems (giantGem, R009) |  |
| 2026-09-28T13:31 | sa-B | B5-L4b-6034-fromtarget | data | 7034 | troop:6034 Siren | `src/engine/skills/curated/batch-02.ts`<br>`src/data/gowSnapshotOverrides.json` | created 9 gems of the caster's colour (CASTER); zh said this troop's colour → creates 9 gems of one of the damaged enemy's colours (native Color1 FromTarget); zh fixed via snapshot override |  |
| 2026-09-28T13:43 | sa-P | P-E-faction-kingdom | primitive | 7241, 7662, 7692, 7707, 7722, 7976, 7391 | weapon:1105 BoneShield；weapon:1186 RadiantJewel；weapon:1188 GlacialCrystal；weapon:1191 TheEdgedBlade；weapon:1193 HookSword；weapon:1234 PrimalAxe；troop:6248 GrandInquisitor | `src/engine/types.ts`<br>`src/engine/skills/curated/batch-w01.ts`<br>`src/engine/skills/curated/batch-w02.ts`<br>`src/engine/skills/curated/batch-r18.ts`<br>`scripts/lib/gow-skill-audit.mjs` | numeric kingdom refs never matched units carrying only the zh kingdom name (community troops, hand fixtures, old host snapshots); 7 CountArmyKingdom users in w01/w02/r18 still used the zh name → matchesKingdom derives the parent native id from the zh name when kingdomId is absent (ZH_KINGDOM_PARENT_ID; exact for non-faction troops, never matches a faction id); 7241 7662 7692 7707 7722 7976 7391 alliesOfKingdom use the native CountArmyKingdom id | all numeric kingdom filters: name-only units match their parent kingdom again; 7 skills: only differ with a faction ally |
| 2026-09-28T13:54 | sa-P | R013-5 | primitive | 8861, 7137, 7052, 8297, 7352, 8598, 8976, 7184 | troop:7287 TheWheelOfFortune；troop:6067 Abhorath；troop:6052 Zombie；troop:6873 Ironjaw；troop:6210 AnubiteWarrior；troop:7070 SkyScorpion；troop:7348 FallenSatyr；weapon:1071 Skullblade | `src/engine/skills/effects/gems.ts`<br>`src/engine/skills/builders.ts`<br>`src/engine/skills/curated/batch-r19.ts`<br>`src/engine/skills/curated/batch-r7.ts` | 'Remove all Gems' (8861, 7137) = allColors, Skulls / Doom Skulls / specials left on the board; clear target 'skulls' took only normal Skulls (Doom / Uber Doom Skulls left) → new clear target allGems (every gem incl. Skulls, skull variants, specials) + builder destroyAllGems for 8861 / 7137 (still remove mode, R010); target 'skulls' = matchJoinKey skull (normal + doomSkull + uberDoomSkull) | 8 skills; skulls target users only differ with Doom / Uber Doom Skulls on the board; golden diff 0 lines |
| 2026-09-28T14:02 | sa-P | P-C-firstlast-army-color | primitive | 8418 | troop:6937 SisterEbony | `src/engine/skills/effects/secondary.ts`<br>`src/engine/skills/curated/batch-r6.ts` | Barrier if any alive enemy uses Purple (anyEnemyColor; default scenario: middle E12 Purple -> Barrier) → new global condition firstLastEnemyColor (first / last alive enemy at cast start, castTracking.unitsAtCastStart; native CountArmyColor@FirstLastEnemies); 8418 Barrier uses it | only 8418 (sole native CountArmyColor@FirstLastEnemies user) |
| 2026-09-28T14:26 | sa-C | L5-C-r6-doomed-blades | data | 9825, 9826, 9827, 9828, 9829, 9830 | weapon:1668 DoomedGladius；weapon:1669 DoomedBroadsword；weapon:1670 DoomedFlamberge；weapon:1671 DoomedClaymore；weapon:1672 DoomedEdge；weapon:1673 DoomedFalchion | `src/engine/skills/curated/batch-w04.ts` | chosen hit without Tempering/Bleed/armor break; random plain RandomEnemy; Bleed + armor break (after the damage) on the random only → native per hit: armor break if Doom -> damage +2/Tempering -> own-colour Bleed, on chosen then RandomPrefNotPrev |  |
| 2026-09-28T14:26 | sa-C | L5-C-r6-7589 | data | 9468 | troop:7589 Ragepaw | `src/engine/skills/curated/batch-r11.ts` | gain 2 Mana → gain 2 Magic (EN / native IncreaseSpellPower@Self) |  |
| 2026-09-28T14:43 | sa-B | L4b-R6-B02 | data | 9904 | weapon:1685 SinisterReaper | `src/engine/skills/curated/batch-w04.ts`<br>`scripts/curated-pools/pool-w01.json`<br>`src/data/gowWeaponReviewedOverrides.json` | only 3 Bleed (+3 on kill); Terror and Poison creates missing; zh said extra only Bleed+Terror → native: Bleed/Terror/Poison 3 each, each +3 AddForKill; zh extra = every gem |  |
| 2026-09-28T14:43 | sa-B | L4b-R6-B02 | data | 9023 | troop:7381 DragonstoneGuardian | `src/engine/skills/curated/batch-r14.ts` | 5 gargoyleGem tier unset (Good only) → CreateGems2Colors mix: tier 1 Good / tier 2 Evil (createSpecialGems2, 8795 pattern) |  |
| 2026-09-28T14:43 | sa-B | L4b-R6-B02 | data | 9466 | troop:7587 DaeDrak | `src/engine/skills/curated/batch-r15.ts` | one create with uniform countRange 1-3 → native three independent CreateGems 1 DaemonicPortal; later ones may overwrite an earlier portal (English 1-3) |  |
| 2026-09-28T14:50 | sa-B | L4b-R6-B03-prefnotprev | data | 8803, 9903, 8963 | troop:7216 Craghound；weapon:1684 FlailOfSuffering；troop:7340 TheCattauriKing | `src/engine/skills/curated/batch-r14.ts`<br>`src/engine/skills/curated/batch-w04.ts`<br>`src/engine/skills/curated/batch-r4.ts`<br>`src/data/gowWeaponReviewedOverrides.json` | enemyRandomN n=2/3 (distinct targets; lone survivor hit once) → native RandomEnemy + RandomPrefNotPrevEnemy chain (R007-3: avoid only previous; lone survivor hit every time; 3rd may return to 1st) |  |
| 2026-09-28T14:55 | sa-B | L4b-R6-B04 | data | 9356, 9357, 9358, 9359, 9360, 9361 | weapon:1592 DoomedProtector；weapon:1593 DoomedBuckler；weapon:1594 DoomedWall；weapon:1595 DoomedBarrier；weapon:1596 DoomedShield；weapon:1597 DoomedAegis | `src/engine/skills/curated/batch-w04.ts`<br>`src/data/gowWeaponReviewedOverrides.json` | Doom branch converted to colourless giantGem → R009: giantGem carries its colour (Giant Blue/Green/Red/Yellow/Purple/Brown) |  |
| 2026-09-28T14:55 | sa-B | L4b-R6-B04 | data | 7708 | troop:6516 WarCleric | `src/engine/skills/curated/batch-r15.ts` | one hit per Undead-or-Daemon enemy → native two steps: Damage Daemon enemies, then Damage Undead enemies (Daemon+Undead hit twice, R001) |  |
| 2026-09-28T15:14 | sa-B | L4b-R6-B06 | data | 8813 | troop:7219 OnyxGargoyle | `src/engine/skills/curated/batch-r14.ts`<br>`src/data/gowSnapshotOverrides.json` | Good-only gargoyle (tier unset); zh light splash → CreateGems2ColorsRange Good/Evil tiers 1-2; zh splash (SplashHighDamage) + snapshot override |  |
| 2026-09-28T15:14 | sa-B | L4b-R6-B06 | data | 9648 | troop:7689 ImmortalDrakkon | `src/engine/skills/curated/batch-r11.ts` | 6 Yellow -> plain Green → 6 Yellow -> Green Dragon Gems (R009) |  |
| 2026-09-28T15:14 | sa-B | L4b-R6-B06 | data | 9220 | troop:7487 Takshaka | `src/engine/skills/curated/batch-r9.ts` | second hit enemyRandom (could repeat the chosen target) → native RandomPrefNotPrevEnemy (avoids the chosen target) |  |
| 2026-09-28T15:14 | sa-B | L4b-R6-B06 | data | 8996 | weapon:1524 Gearslinger | `src/engine/skills/curated/batch-w03.ts`<br>`src/data/gowWeaponReviewedOverrides.json` | enemyRandomN n=2 → native RandomEnemy + RandomPrefNotPrevEnemy true damage (R007-3) |  |
| 2026-09-28T15:44 | coord | R014-7000-count-before-create | assembler | 8503 | troop:7000 Baihu | `src/engine/skills/curated/batch-r20.ts`<br>`src/engine/skills/prototypes.ts`<br>`src/engine/skills/effects/secondary.ts`<br>`src/engine/skills/effects/context.ts` | Yellow counted after CreateGems 3 Yellow (created gems boosted the damage) → castStartBoardGems Yellow: counted before the create, CountSet 1 not added (R014) | new source castStartBoardGems; only 8503 uses it |
| 2026-09-28T16:28 | sa-F | L3-F-6454 | assembler | 7632 | troop:6454 Hind | `src/engine/skills/curated/batch-20.ts`<br>`src/data/gowSnapshotOverrides.json` | damage, then flat 2 Mana, then extra-turn 25%/Entangled → 2 Mana per Entangled enemy and 25%/Entangled extra-turn, both counted before the damage (native order); ZH fixed |  |
| 2026-09-28T16:28 | sa-F | L3-F-1211 | assembler | 7806 | weapon:1211 StoneAegis | `src/engine/skills/curated/batch-w02.ts` | 8 Attack / 2 Mana base + 2 per enemy Barrier → 8 Attack and 2 Mana per enemy Barrier, no base (native CountStatus 800 / 200 counters) |  |
| 2026-09-28T16:28 | sa-F | L3-F-7074 | assembler | 8602 | troop:7074 HelgorTheGuardian | `src/engine/skills/curated/batch-r8.ts` | creates 1-3 plain Red gems → creates 1-3 Red Mana Potions (native CreateGemsRange RedManaPotion) |  |
| 2026-09-28T16:28 | sa-F | L3-F-6897 | assembler | 8358 | troop:6897 ArachnaeanWatcher | `src/engine/skills/curated/batch-r12.ts`<br>`src/data/gowSnapshotOverrides.json` | quarter Mana to all allies incl. caster → quarter Mana to all other allies (native AllAlliesButNotSelf); ZH fixed |  |
| 2026-09-28T16:28 | sa-F | L3-F-7806 | assembler | 9847 | troop:7806 SetauriSkulk | `src/engine/skills/curated/batch-18.ts` | true damage, then 2 Mana per Bleeding enemy (killed target not counted) → Mana gain before the damage: count is native step 0 (R001) |  |
| 2026-09-28T21:12 | sa-A | L4a-R8-1578-random-explode | data | 9300 | weapon:1578 Frostbound | `src/engine/skills/curated/batch-w04.ts`<br>`src/data/gowWeaponReviewedOverrides.json` | 9300 explode target cell CELL (chosen cell; native spell Target None) → explode randomGems 1 (native ExplodeGems 1, Target None = random gem) |  |
| 2026-09-28T21:13 | sa-F | L3-F-6111 | assembler | 7181 | troop:6111 Aziris | `src/engine/skills/curated/batch-19.ts` | transforms every gem of the selected gem's colour into Skulls → transforms only the selected gem (native CreateGems 1 Skull BoardTarget SingleGem, ManaGemsOnly); 6 Mana at 13+ Purple counted after the transform |  |
| 2026-09-28T21:13 | sa-F | L3-F-6863 | data | 8282 | troop:6863 QueenBeetrix | `src/engine/skills/curated/batch-r9.ts`<br>`src/data/gowSnapshotOverrides.json` | ZH: chance boosted by Brown Gems → ZH matches English/native (no Brown count step); behaviour unchanged |  |
| 2026-09-28T21:13 | sa-F | L3-F-7714 | data | 9675 | troop:7714 DesertOx | `src/engine/skills/curated/batch-r17.ts`<br>`src/data/gowSnapshotOverrides.json` | ZH: use a mix of 10 Curse Gems and Doomskulls → ZH: create 10 (random mix); behaviour unchanged |  |
| 2026-09-28T21:13 | sa-F | L3-F-7774 | data | 9780 | troop:7774 CountGobula | `src/engine/skills/curated/batch-r22.ts`<br>`src/data/gowSnapshotOverrides.json` | ZH: 14 Green and 14 Bleed → ZH: 14 Green/Bleed total (random mix); behaviour unchanged |  |
| 2026-09-28T21:14 | sa-G | G-6154-order | assembler | 7274 | troop:6154 Faunessa | `src/engine/skills/curated/batch-r22.ts` | damage first, then Life boosted by lastDamage 3:1 (0 through a Barrier) → native order: Life boosted by the chosen enemy Attack x34% first, then damage equal to its Attack |  |
| 2026-09-28T21:14 | sa-G | G-7181-zh | data | 8751 | troop:7181 Tauraeus | `src/engine/skills/curated/batch-r7.ts`<br>`src/data/gowSnapshotOverrides.json` | ZH typo 二增强 → ZH 而增强 (troops override 7181) |  |
| 2026-09-28T21:15 | sa-H | L2-H-7047-last2-random | assembler | 8572 | troop:7047 SisterOfNightmares | `src/engine/skills/curated/batch-r4.ts` | RandomStatusEffect@LastTwoEnemies approximated by one random status on the last enemy only → random status rolled separately on 2nd-last and last enemy (enemySecondLast + enemyLastN), then Poison both |  |
| 2026-09-28T21:15 | sa-H | L2-H-6706-prefnotprev | assembler | 8063 | troop:6706 Rattigar | `src/engine/skills/curated/batch-r15.ts` | second hit plain enemyRandom (could repeat the first target) → second hit enemyRandomPrefNotPrev per native RandomPrefNotPrevEnemy (R007-3) |  |
| 2026-09-28T21:16 | sa-F | L3-F-6278 | assembler | 7424 | troop:6278 SirSnothelm | `src/engine/skills/curated/batch-13.ts` | Web then Entangle → Entangle then Web (native CauseEntangle -> CauseWeb, R001) |  |
| 2026-09-28T21:16 | sa-F | L3-F-6867 | data | 8289 | troop:6867 Solari | `src/engine/skills/curated/batch-r12.ts`<br>`src/data/gowSnapshotOverrides.json` | ZH: other allies enemies → ZH: all other allies; behaviour unchanged |  |
| 2026-09-28T21:16 | sa-F | L3-F-6834 | assembler | 8239 | troop:6834 Finesse | `src/engine/skills/curated/batch-p37.ts`<br>`src/data/gowSnapshotOverrides.json` | second hit plain random enemy (could re-hit the chosen one); ZH stray comma → second hit RandomPrefNotPrevEnemy (native); ZH punctuation fixed |  |
| 2026-09-28T21:17 | sa-A | L4a-R8-random-any-gem | assembler | 7147 | troop:6077 Behemoth | `src/engine/skills/curated/batch-02.ts` | 7147 destroyRandomGems 12 include color (no Skulls) → include all: native DestroyGems 12 picks any gem, Skulls are Gems (R013-5) |  |
| 2026-09-28T21:17 | sa-A | L4a-R8-random-any-gem | data | 7121 | weapon:1055 Pigsticker | `src/engine/skills/curated/batch-w01.ts`<br>`src/data/gowWeaponReviewedOverrides.json` | 7121 kill branch explodeRandomGems 1 include color → include all (native ExplodeGems AddForKill 1, any gem); override entry added |  |
| 2026-09-28T21:18 | sa-G | G-6914-zh-order | assembler | 8375 | troop:6914 IllithianColossus | `src/engine/skills/curated/batch-r17.ts`<br>`src/data/gowSnapshotOverrides.json` | ZH said Life and Attack; Life before Armor → ZH Life and Armor (override 6914); native order Armor then Life |  |
| 2026-09-28T21:18 | sa-G | G-7201-count-before-hit | assembler | 8788 | troop:7201 Leio | `src/engine/skills/curated/batch-15.ts` | Armor counted all Enemy Magic after the hit (a kill shrank it: 30 instead of 36) → Armor segment first so both read the native step-0 count (pre-hit) |  |
| 2026-09-28T21:18 | sa-H | L2-H-7737-zh | data | 9640 | troop:7737 CourtWitch | `src/engine/skills/curated/batch-r17.ts`<br>`src/data/gowSnapshotOverrides.json` | zh: 消除 [魔法 + 2] 个敌人的攻击 (reads [M+2] as number of enemies) → zh: 消除一名敌人 [魔法 + 2] 点攻击力 / 一项随机技能 [魔法 + 2] 点 (matches English one enemy) |  |
| 2026-09-28T21:19 | sa-F | L3-F-7291 | assembler | 8865 | troop:7291 SableSpiritbane | `src/engine/skills/curated/batch-r19.ts` | drains 5 Magic → drains 5 Mana (native DecreaseMana 5) |  |
| 2026-09-28T21:19 | sa-F | L3-F-6128 | assembler | 7229 | troop:6128 Hobgoblin | `src/engine/skills/curated/batch-r15.ts` | second hit plain random enemy → second hit RandomPrefNotPrevEnemy (native) |  |
| 2026-09-28T21:19 | sa-F | L3-F-6214 | assembler | 7356 | troop:6214 DwarvenSlayer | `src/engine/skills/curated/batch-r7.ts` | one self-sacrifice: a Barrier saved the caster → two self-sacrifice steps (native two Damage@Self 10000): Barrier popped, then dies |  |
| 2026-09-28T21:21 | sa-G | G-1133-prefnotprev | assembler | 7299 | weapon:1133 SlayBells | `src/engine/skills/curated/batch-w01.ts`<br>`src/data/gowWeaponReviewedOverrides.json` | second hit plain enemyRandom → enemyRandomPrefNotPrev (native Damage@RandomPrefNotPrevEnemy, R007-3) |  |
| 2026-09-28T21:22 | sa-A | L4a-R8-7704-zh-column | data | 9665 | troop:7704 HanXin | `src/engine/skills/curated/batch-r16.ts`<br>`src/data/gowSnapshotOverrides.json` | 9665 zh '摧毁一根随机柱子' (pillar) → zh '随机摧毁一列宝石' (Destroy a random Column) + snapshot override |  |
| 2026-09-28T21:22 | sa-A | L4a-R8-random-any-gem | assembler | 9120, 9464 | troop:7426 Hornwing；troop:7585 DwarvenOverseer | `src/engine/skills/curated/batch-r19.ts` | 9120 DestroyGems 7 / 9464 DestroyGems 8 as include color (no Skulls) → include all (any gem, R013-5) |  |
| 2026-09-28T21:23 | sa-F | L3-F-6975 | data | 8478 | troop:6975 Metztli | `src/engine/skills/curated/batch-p39.ts`<br>`src/data/gowSnapshotOverrides.json` | ZH typo 在召唤 → ZH 再召唤; behaviour unchanged |  |
| 2026-09-28T21:24 | sa-F | L3-F-6015 | assembler | 7015 | troop:6015 SpiderQueen | `src/engine/skills/curated/batch-02.ts`<br>`src/data/gowSnapshotOverrides.json` | Armor, Web, then drain; ZH 他他 → drain all Mana -> Armor -> Web (native order, R001); ZH typo fixed |  |
| 2026-09-28T21:24 | sa-F | L3-F-6789 | data | 8180 | troop:6789 TheGrayKing | `src/engine/skills/curated/batch-r11.ts`<br>`src/data/gowSnapshotOverrides.json` | ZH [魔法 + 9]  真实伤害 → ZH [魔法 + 9] 点真实伤害; behaviour unchanged |  |
| 2026-09-28T21:25 | sa-G | G-kill-all-skills | assembler | 7165, 7294 | troop:6095 Tau；weapon:1130 RunicBlade | `src/engine/skills/curated/batch-05.ts`<br>`src/engine/skills/curated/batch-w01.ts` | on kill only Attack applied (ifTargetDied re-read lastTarget = caster after the first self buff) → all four Skills via ifCond castEnemyDied (7314 precedent) |  |
| 2026-09-28T21:25 | sa-G | G-6334-kill-order | assembler | 7484 | troop:6334 JaguarWarrior | `src/engine/skills/curated/batch-r15.ts` | full heal then Attack +8 (Attack never applied after the heal rewrote lastTarget) → native order Attack +8 then full heal, both castEnemyDied |  |
| 2026-09-28T21:26 | sa-H | L2-H-7186-enemy-drain | assembler | 8756 | troop:7186 CryptHound | `src/engine/skills/curated/batch-37.ts`<br>`src/data/gowSnapshotOverrides.json` | drained 7 Mana from a chosen ALLY (zh said ally) → drains 7 Mana from the chosen enemy (English/native DecreaseMana FromTarget), zh fixed + override |  |
| 2026-09-28T21:26 | sa-H | L2-H-1296-spm034 | assembler | 8253 | weapon:1296 StaffOfInsanity | `src/engine/skills/curated/batch-w02.ts`<br>`src/data/gowWeaponReviewedOverrides.json` | Magic branch mult 0.3333 (English Magic / 3) → mult 0.34 = native SpellPowerMultiplier (R001; differs e.g. at Magic 25: 10 vs 9) |  |
| 2026-09-28T21:26 | sa-H | L2-H-6198-order | assembler | 7340 | troop:6198 Plague | `src/engine/skills/curated/batch-r12.ts` | Poison then Disease → native order Disease then Poison (R001) |  |
| 2026-09-28T21:26 | sa-H | L2-H-6993-prefnotprev | assembler | 8499 | troop:6993 Dao | `src/engine/skills/curated/batch-r13.ts`<br>`src/data/gowSnapshotOverrides.json` | repeats used plain enemyRandom; zh mistranslated → repeats enemyRandomPrefNotPrev (native RandomPrefNotPrevEnemy, R007-3); zh rewritten + override |  |
| 2026-09-28T21:29 | sa-G | G-kill-all-skills | assembler | 8104 | troop:6734 Stone-Biter | `src/engine/skills/curated/batch-r18.ts`<br>`src/data/gowSnapshotOverrides.json` | on kill only Attack +7; ZH lacked the kill condition → all four Skills +7 via castEnemyDied; ZH 如果敌人身亡 (override 6734) |  |
| 2026-09-28T21:32 | sa-H | L2-H-6959-magic | assembler | 8459 | troop:6959 KoboldMagi | `src/engine/skills/curated/batch-r1.ts` | second branch gave 12 Mana → gives 12 Magic (native IncreaseSpellPower 12, English gain 12 Magic) |  |
| 2026-09-28T21:32 | sa-H | L2-H-6948-either-colour | assembler | 8429 | troop:6948 DeepHuntsman | `src/engine/skills/curated/batch-r22.ts` | explode [M+1] gems from a Green+Purple union pool → Randomize ABC-DEF: 1/2 explode [M+1] Green, 1/2 explode [M+1] Purple; then Curse + Web first enemy |  |
| 2026-09-28T21:34 | sa-G | G-6881-kill-double | assembler | 8304 | troop:6881 EldritchGuardian | `src/engine/skills/curated/batch-r20.ts` | Life then Armor +12; kill doubling never applied (ifTargetDied after self segments) → native Armor then Life, +12 each more on kill via castEnemyDied |  |
| 2026-09-28T21:34 | sa-F | L3-F-7778 | assembler | 9784 | troop:7778 BloodSpore | `src/engine/skills/curated/batch-37.ts`<br>`src/data/gowSnapshotOverrides.json` | damage first, then removed the Bleed itself + Curse + drain 3 → native order: if Bleeding Dispel positives (Bleed kept) -> Curse -> drain 3 -> damage; ZH fixed |  |
| 2026-09-28T21:34 | sa-F | L3-F-doomed-ranged | assembler | 9580, 9581, 9582, 9583 | weapon:1632 DoomedArbalest；weapon:1633 DoomedStingshot；weapon:1634 DoomedDart-thrower；weapon:1635 DoomedBoltshooter | `src/engine/skills/curated/batch-w04.ts`<br>`src/data/gowWeaponReviewedOverrides.json` | damage first, then explode 3 of the colour if the (already hit) target uses it, then quarter Mana → native order ExplodeColor (chosen target uses colour) -> quarter Mana if enemy has a Doom -> damage |  |
| 2026-09-28T21:34 | sa-A | L4a-R8-7535-ghost-chances | assembler | 9292 | troop:7535 GhostOgre | `src/engine/skills/curated/batch-r7.ts` | 9292 one explode segment countRange 1-4 (uniform) → 4 native steps: Ghost 1 always, then Ghost 1 at 60%/50%/40% independent chances |  |
| 2026-09-28T21:34 | sa-A | L4a-R8-random-any-gem | assembler | 8134 | troop:6755 QueenXochi | `src/engine/skills/curated/batch-37.ts` | 8134 storm explode 5 include color → include all (any gem, R013-5) |  |
| 2026-09-28T21:36 | sa-F | L3-F-doomed-ranged | assembler | 9584, 9585 | weapon:1636 DoomedBalliste；weapon:1637 DoomedSauterelle | `src/engine/skills/curated/batch-w04.ts`<br>`src/data/gowWeaponReviewedOverrides.json` | damage first, then explode 3 of the colour if the (already hit) target uses it, then quarter Mana → native order ExplodeColor (chosen target uses colour) -> quarter Mana if enemy has a Doom -> damage |  |
| 2026-09-28T21:37 | sa-H | L2-H-7847-one-colour | assembler | 9906 | troop:7847 CannonMimic | `src/engine/skills/curated/batch-r9.ts` | 3 random coloured gems of mixed colours → Randomize A-F: one colour 1/6, then 3 gems of that colour |  |
| 2026-09-28T21:37 | sa-H | L2-H-6390-weights | assembler | 7545 | troop:6390 PrincessFizzbang | `src/engine/skills/curated/batch-r15.ts` | extra turn first, then 1/2 explode Green \| 1/2 random Skill → AB-CD-EF: 2/3 explode Green, 1/3 random Skill (Goblin x2), extra turn after each (native order) |  |
| 2026-09-28T21:37 | sa-H | L2-H-6247-any-gem | assembler | 7390 | troop:6247 Remnant | `src/engine/skills/curated/batch-01.ts` | explode 2 random coloured gems (skulls/specials excluded) → explode 2 random gems of any kind (native ExplodeGems 2, same as signed 6204/6251/6875/7044) |  |
| 2026-09-28T21:38 | sa-F | L3-F-7311 | data | 8923 | troop:7311 OrpheusPriestess | `src/engine/skills/curated/batch-r19.ts`<br>`src/data/gowSnapshotOverrides.json` | ZH: all allies → ZH: all other allies; behaviour unchanged |  |
| 2026-09-28T21:38 | sa-F | L3-F-6998 | data | 8501 | troop:6998 WilliTheAnchor | `src/engine/skills/curated/batch-r20.ts`<br>`src/data/gowSnapshotOverrides.json` | ZH machine translation (淹没自己 / 额外的转向) → ZH: submerge self, sink to the back, extra turn; behaviour unchanged |  |
| 2026-09-28T21:39 | sa-A | L4a-R8-7561-chosen-column | data | 9346 | troop:7561 WingedDonkey | `src/engine/skills/curated/batch-r7.ts`<br>`src/data/gowSnapshotOverrides.json` | 9346 destroyRandomCols(1); zh '摧毁一个随机列' → destroyChosenCol (native spell Target Board, DestroyGems BoardTarget Column); zh '摧毁一列宝石' + snapshot override |  |
| 2026-09-28T21:39 | sa-A | L4a-R8-7652-storm-bonus | assembler | 9567 | troop:7652 Treviamus | `src/engine/skills/curated/batch-p40.ts` | 9567 separate 10 damage to enemyChosen after the jumble when a Storm exists → one Damage@AllEnemies 1+M with condBonus +10 if any Storm (native AddForAnyStorm on the same step), then jumble, then Icestorm |  |
| 2026-09-28T21:40 | sa-F | L3-F-6996 | assembler | 8523 | troop:6996 TheEmperor | `src/engine/skills/curated/batch-r15.ts`<br>`src/data/gowSnapshotOverrides.json` | Attack/Armor/Magic only; ZH garbled → all four Skills incl. Life (native IncreaseAllStats); ZH rewritten |  |
| 2026-09-28T21:41 | sa-G | G-1096-steal-2 | assembler | 7221 | weapon:1096 KrisKnife | `src/engine/skills/curated/batch-w01.ts`<br>`src/data/gowWeaponReviewedOverrides.json`<br>`scripts/curated-pools/pool-w01.json` | steal 1 Magic (ZH 1 too) → steal 2 Magic (EN + native StealMagic 2); ZH 2 |  |
| 2026-09-28T21:41 | sa-G | G-6976-prefnotprev | assembler | 8479 | troop:6976 Pan | `src/engine/skills/curated/batch-r15.ts` | three plain random hits (could repeat the previous) → hits 2-3 RandomPrefNotPrev (native, R007-3) |  |
| 2026-09-28T21:41 | sa-A | L4a-R8-1370-order-electrostorm | data | 8409 | weapon:1370 TinkersBuzzblade | `src/engine/skills/curated/batch-w03.ts`<br>`src/data/gowWeaponReviewedOverrides.json` | 8409 damage then Mech -30 Armor; storm Yellow only → native order: -30 Armor [AddIfIHaveMech] first, then damage (R001); StormRedYellow = storm Red + color2 Yellow; override entry added |  |
| 2026-09-28T21:41 | sa-A | L4a-R8-random-any-gem | assembler | 7001 | troop:6099 Warhound | `src/engine/skills/curated/batch-11.ts` | 7001 explode 2 include color → include all (any gem, R013-5) |  |
| 2026-09-28T21:41 | sa-H | L2-H-6981-chosen-line | assembler | 8484 | troop:6981 Rhinotaur | `src/engine/skills/curated/batch-r20.ts` | explode a RANDOM row or column → explode the chosen gem's row or column (spell Target Board + BoardTarget Row/Column), 1/2 each |  |
| 2026-09-28T21:41 | sa-H | L2-H-1418-one-colour | assembler | 8578 | weapon:1418 CelestialFlask | `src/engine/skills/curated/batch-w03.ts`<br>`src/data/gowWeaponReviewedOverrides.json`<br>`scripts/curated-pools/pool-w01.json` | 3 potions from a 5-colour mixed pool; zh said 3 kinds of potion → A+(B-C-D-E-F): extra turn, then 3 potions of one colour (1/5 each); zh fixed in pool + weapon override |  |
| 2026-09-28T21:42 | sa-F | L3-F-6992 | data | 8498 | troop:6992 TheArchdeva | `src/engine/skills/curated/batch-r15.ts`<br>`src/data/gowSnapshotOverrides.json` | ZH garbled, amount missing → ZH matches English; behaviour unchanged |  |
| 2026-09-28T21:43 | sa-G | G-7807-knock-order | assembler | 9848 | troop:7807 Giraffataur | `src/engine/skills/curated/batch-r9.ts` | front enemy knocked back twice (final ..., 1st, 2nd) → native SecondEnemy then FrontEnemy (final ..., 2nd, 1st) |  |
| 2026-09-28T21:43 | sa-G | G-zh-typos | data | 8416, 8781 | troop:6935 ArmoredBoarlet；troop:7194 Sabellius | `src/engine/skills/curated/batch-r9.ts`<br>`src/engine/skills/curated/batch-15.ts`<br>`src/data/gowSnapshotOverrides.json` | 6935 ZH 并将之; 7194 ZH 在对 → 6935 则将之; 7194 再对 (overrides 6935, 7194) |  |
| 2026-09-28T21:44 | sa-A | L4a-R8-random-any-gem | assembler | 8957 | troop:7334 Eleanor | `src/engine/skills/curated/batch-04.ts` | 8957 destroy 8 random include color → include all ('Destroy 8 random Gems', R013-5) |  |
| 2026-09-28T21:44 | sa-A | L4a-R8-7019-zh | data | 8526 | troop:7019 Cloakmantle | `src/engine/skills/curated/batch-r11.ts`<br>`src/data/gowSnapshotOverrides.json` | 8526 zh '敌人队伍使用对多的颜色宝石' → zh '敌方队伍使用最多的法力颜色的宝石' + snapshot override |  |
| 2026-09-28T21:46 | sa-H | L2-H-6157-ally-colour | assembler | 7277 | troop:6157 Djinn | `src/engine/skills/curated/batch-r7.ts` | created 6 gems of the CASTER's colour → 6 gems of the chosen ally's colour (native CreateGems FromTarget) |  |
| 2026-09-28T21:46 | sa-H | L2-H-1396-any-gem | assembler | 8517 | weapon:1396 ExperimentalElixir | `src/engine/skills/curated/batch-w03.ts` | explode 1 random coloured gem → explode 1 random gem of any kind (native ExplodeGems 1); skill issued for Amount dispute |  |
| 2026-09-28T21:46 | sa-G | G-6258-order | assembler | 7401 | troop:6258 Innkeeper | `src/engine/skills/curated/batch-01.ts` | Attack to others, then -1 Magic → native order: -1 Magic, then Attack |  |
| 2026-09-28T21:46 | sa-F | L3-F-6966 | data | 8469 | troop:6966 SpringEmissary | `src/engine/skills/curated/batch-r20.ts`<br>`src/data/gowSnapshotOverrides.json` | ZH garbled (而等于其法力的半数) → ZH: half their Mana cost; behaviour unchanged |  |
| 2026-09-28T21:46 | sa-F | L3-F-7736 | assembler | 9613 | troop:7736 MaelstromDagoNath | `src/engine/skills/curated/batch-r8.ts` | 12 plain coloured gems (three createMix pairs) → 12 Mana Potion Gems: native CreateGems2Colors Blue/Green, Red/Yellow, Purple/Brown ManaPotion, 4 each |  |
| 2026-09-28T21:46 | sa-A | L4a-R8-6482-zh | data | 7669 | troop:6482 Shocktopus | `src/engine/skills/curated/batch-r18.ts`<br>`src/data/gowSnapshotOverrides.json` | 7669 zh '珠宝' and plain damage → zh '宝石' + '真实伤害' + snapshot override |  |
| 2026-09-28T21:46 | sa-A | L4a-R8-random-any-gem | assembler | 7462 | troop:6312 Bogstrider | `src/engine/skills/curated/batch-01.ts` | 7462 destroy 1+M include color → include all (R013-5) |  |
| 2026-09-28T21:47 | sa-G | G-6728-order | assembler | 8098 | troop:6728 Thunderforge | `src/engine/skills/curated/batch-07.ts` | Armor then Attack → native order: Attack then Armor (Dwarf double on both) |  |
| 2026-09-28T21:49 | sa-G | G-7514-order | assembler | 9260 | troop:7514 KooTheBrave | `src/engine/skills/curated/batch-11.ts` | Life then Attack → native order: Attack then Life (Tauros double on both) |  |
| 2026-09-28T21:49 | sa-H | L2-H-6817-one-skill | assembler | 8216 | troop:6817 ShahbanuVespera | `src/engine/skills/curated/batch-r18.ts`<br>`src/data/gowSnapshotOverrides.json` | each grant split [(M/2)+1] across several Skills; zh said 2 other allies → each native IncreaseRandom gives the whole amount to one random Skill (oneSkill); zh 'repeat 2 more times for random allies' + override |  |
| 2026-09-28T21:50 | sa-A | L4a-R8-random-any-gem | assembler | 8823, 8022 | troop:7228 BORK-3000；troop:6676 Plainsjumper | `src/engine/skills/curated/batch-34.ts`<br>`src/engine/skills/curated/batch-03.ts` | 8823 / 8022 random destroy include color → include all (R013-5) |  |
| 2026-09-28T21:50 | sa-A | L4a-R8-1452-column-only | data | 8721 | weapon:1452 ShockHammer | `src/engine/skills/curated/batch-w03.ts`<br>`scripts/curated-pools/pool-w01.json`<br>`src/data/gowWeaponReviewedOverrides.json` | 8721 chosenCross (row+column); zh '摧毁其行和列' → chosenLine col (native BoardTarget Column, English 'destroy its column'); zh '摧毁其所在的列'; override description+prototype |  |
| 2026-09-28T21:50 | sa-F | L3-F-6462 | assembler | 7640 | troop:6462 ClawDancer | `src/engine/skills/curated/batch-r5.ts`<br>`src/data/gowSnapshotOverrides.json` | range damage on the front enemy split into 2 hits (hit E10 and E11); ZH {2} placeholder → one range hit on the chosen enemy (native RandomHighDamage@FromTarget, L7-7517 precedent); ZH fixed |  |
| 2026-09-28T21:50 | sa-F | L3-F-6636 | assembler | 7962 | troop:6636 Rhynaggor | `src/engine/skills/curated/batch-07.ts` | 12 Mana only if the splash centre died → 12 Mana if any enemy died to the cast (EN 'If an enemy dies', AddForKill; castEnemyDied as 7802) |  |
| 2026-09-28T21:52 | sa-A | L4a-R8-random-any-gem | assembler | 9020, 7594 | troop:7378 Ursky；troop:6421 Brownie | `src/engine/skills/curated/batch-04.ts`<br>`src/engine/skills/curated/batch-13.ts` | 9020 / 7594 random destroy include color → include all (R013-5) |  |
| 2026-09-28T21:52 | sa-A | L4a-R8-7470-order | assembler | 9187 | troop:7470 GiantBadger | `src/engine/skills/curated/batch-r5.ts` | 9187 reposition self front, then last enemy front → native order: last enemy front, then self front (R001) |  |
| 2026-09-28T21:54 | sa-H | L2-H-7253-steal-first | assembler | 8852 | troop:7253 Sagittarian | `src/engine/skills/curated/batch-r9.ts`<br>`src/data/gowSnapshotOverrides.json` | true damage first, then steal 10 MANA \| 20 Life \| 20 Armor; zh 盔甲魔力值 → native AB-CD-EF: steal 10 Magic \| 20 Armor \| 20 Life before the true damage (R001); zh fixed + override |  |
| 2026-09-28T21:55 | sa-A | L4a-R8-7136-column | data | 8685 | troop:7136 Narwhale | `src/engine/skills/curated/batch-03.ts`<br>`src/data/gowSnapshotOverrides.json` | 8685 destroyChosenRow; zh '摧毁一行' → destroyChosenCol (native BoardTarget Column); zh '摧毁一列' + snapshot override |  |
| 2026-09-28T21:57 | sa-H | L2-H-7746-kill-gate | assembler | 9731 | troop:7746 Cascabel | `src/engine/skills/curated/batch-r17.ts` | 3 x ifTargetDied random-status segments: 2nd/3rd looked at the 1st status segment's living target and never fired (always exactly 1 status on kill) → gate all three on castEnemyDied: kill -> 1 + 50% + 50% random negative statuses on each other enemy |  |
| 2026-09-28T21:57 | sa-A | L4a-R8-6707-same-targets | assembler | 8064 | troop:6707 PlagueRat | `src/engine/skills/curated/batch-34.ts` | 8064 poison enemyRandomN 2, then disease enemyRandomN 2 (independent picks) → native: Disease@RandomEnemy, Poison@FromPrevious, Disease@RandomPrefNotPrev, Poison@FromPrevious (same 2 enemies, Disease first) |  |
| 2026-09-28T22:00 | sa-H | L1-H-6854-magic | assembler | 8273 | troop:6854 Lyriath | `src/engine/skills/curated/batch-r22.ts` | Yellow allies gained 2 Mana → Yellow allies gain 2 Magic (native IncreaseSpellPower 2) |  |
| 2026-09-28T22:00 | sa-H | L1-H-7235-one-skill | assembler | 8831 | troop:7235 FakyrTheWise | `src/engine/skills/curated/batch-r9.ts` | each IncreaseRandom split [M+1] across Skills → each of the two IncreaseRandom steps gives the whole [M+1] to one random Skill |  |
| 2026-09-28T22:06 | sa-H | L1-H-7497-book-weights | assembler | 9242 | troop:7497 Isban | `src/engine/skills/curated/batch-10.ts` | 3 Books 1/3 each → native A+(B-C-D-E-F): Witches 2/5, Secrets 2/5, Tome of Evil 1/5 |  |
| 2026-09-28T22:06 | sa-H | L1-H-6651-double-stun-summons | assembler | 7985 | troop:6651 TianYi | `src/engine/skills/curated/batch-r6.ts` | no x2 when my Attack greater; stun = every enemy below max Life; Monkey count uniform 1-3 → x2 via casterStatBeatsTarget attack; stun target + adjacent; Monkey 100% + 50% + 50% |  |
| 2026-09-28T22:06 | sa-H | L1-H-6507-freeze-affected | assembler | 7697 | troop:6507 HyndlaFrostcrown | `src/engine/skills/curated/batch-20.ts`<br>`src/data/gowSnapshotOverrides.json` | froze all enemies; zh said all enemies → freezes target + adjacent (native FromTarget + AdjacentFromTarget); zh + override |  |
| 2026-09-28T22:08 | sa-H | L1-H-7376-prefnotprev | assembler | 9016 | troop:7376 MorthanisDarkness | `src/engine/skills/curated/batch-04.ts` | 4 distinct random enemies (enemyRandomN) → RandomEnemy + 3 x RandomPrefNotPrevEnemy Life steals (R007-3; repeats allowed, never twice in a row) |  |
| 2026-09-28T22:12 | sa-H | L1-H-6908-four-branches | assembler | 8369 | troop:6908 BookOfSecrets | `src/engine/skills/curated/batch-r7.ts`<br>`src/data/gowSnapshotOverrides.json` | 3 branches 1/3; status branch hit enemies AND allies; zh said enemies and allies → native A-B-C-D 1/4 each: Daemon \| positive all allies \| negative all enemies \| [M+2] front; zh 或 + override |  |
| 2026-09-28T22:28 | sa-A | L4a-R9-7404-purple | assembler | 9054 | troop:7404 HauntedDoll | `src/engine/skills/curated/batch-r4.ts` | 9054 explodeRandomGems(1,1) any gem incl. Skulls → native ExplodeColor Purple: explode 1+M Purple gems only |  |
| 2026-09-28T22:32 | sa-A | L4a-R9-7001-zh | data | 8504 | troop:7001 HoundOfYaoGuai | `src/engine/skills/curated/batch-r22.ts`<br>`src/data/gowSnapshotOverrides.json` | 8504 zh '炸毁三个骷髅头。获得一次攻击。' → zh '爆破 3 颗骷髅。获得 [(魔法 / 2) + 1] 点攻击力。' + snapshot override |  |
| 2026-09-28T22:32 | sa-A | L4a-R9-1064-zh | data | 7071 | weapon:1064 CrudeClub | `src/engine/skills/curated/batch-w05.ts`<br>`scripts/curated-pools/pool-w01.json`<br>`src/data/gowWeaponReviewedOverrides.json` | 7071 zh '?????????' → zh '随机爆破一颗宝石。' (English 'Explode a random Gem.') |  |
| 2026-09-28T22:32 | sa-A | L4a-R9-7402-same-target | assembler | 9052 | troop:7402 TriTerror | `src/engine/skills/curated/batch-r22.ts` | 9052 entangle enemyRandom, web enemyRandom (independent) → native CauseWeb@FromPrevious: web lastTarget (same random enemy) |  |
| 2026-09-28T22:32 | sa-A | L4a-R9-6536-skulls | assembler | 7730 | troop:6536 Vargouille | `src/engine/skills/curated/batch-26.ts` | 7730 explodeRandomGems 4 include color → include all: Skulls are Gems (R013-5) |  |
| 2026-09-28T22:34 | sa-A | L4a-R9-skulls-b03 | assembler | 7145, 8696, 7674 | troop:6075 Gorgotha；weapon:1440 GobmothersWand；troop:6487 PandaskaGuard | `src/engine/skills/curated/batch-01.ts`<br>`src/engine/skills/curated/batch-w03.ts`<br>`src/engine/skills/curated/batch-07.ts`<br>`src/data/gowWeaponReviewedOverrides.json` | colourless ExplodeGems built as randomGems include color → include all: Skulls are Gems (R013-5); 8696 override prototype updated |  |
| 2026-09-28T22:34 | sa-A | L4a-R9-6041-from-previous | assembler | 7041 | troop:6041 Bombardier | `src/engine/skills/curated/batch-11.ts` | 7041 burning 30% on enemyChosen (Board spell, no chosen enemy) → native CauseBurning@FromPrevious: burning 30% on lastTarget (the random enemy damaged) |  |
| 2026-09-28T22:36 | sa-A | L4a-R9-6721-prefnotprev | assembler | 8091 | troop:6721 ROVER-300 | `src/engine/skills/curated/batch-36.ts` | 8091 dmg enemyRandomN n=2 (distinct, range all) → native Damage@RandomEnemy + Damage@RandomPrefNotPrevEnemy (R007-3) |  |
| 2026-09-28T22:36 | sa-A | L4a-R9-6471-skulls | assembler | 7649 | troop:6471 TheWorldbreaker | `src/engine/skills/curated/batch-03.ts` | 7649 explode 18 include color → include all (R013-5) |  |
| 2026-09-28T22:36 | sa-A | L4a-R9-7364-cross | assembler | 9004 | troop:7364 BoatswainBart | `src/engine/skills/curated/batch-r15.ts` | 9004 destroyChosenRow then destroyChosenCol (two steps) → native DestroyGems RowAndColumn: destroyChosenCross (one step) |  |
| 2026-09-28T22:40 | sa-A | L4a-R9-7725-zh | data | 9725 | troop:7725 PrisonerLuther | `src/engine/skills/curated/batch-r7.ts`<br>`src/data/gowSnapshotOverrides.json` | 9725 zh '爆破 2-4 颗宝石。' (damage clause missing) → zh adds '对第一名敌人造成 [(魔法 / 2) + 4] 点伤害。' + snapshot override |  |
| 2026-09-28T22:40 | sa-A | L4a-R9-6943-cell | assembler | 8424 | troop:6943 HauntedGuardian | `src/engine/skills/curated/batch-r12.ts` | 8424 cross3 explode at fixed board centre (3,3) → cross3 explode centred on the chosen cell (spell Target Board) |  |
| 2026-09-28T22:40 | sa-A | L4a-R9-giant-9168 | assembler | 9168, 9169, 9170 | troop:7447 GiantSentinel；troop:7448 ElementalSentinel；troop:7449 DaemonicSentinel | `src/engine/skills/curated/batch-r8.ts`<br>`src/data/gowSnapshotOverrides.json` | createGems plain Blue/Green/Red 8 if any enemy Cursed; zh '若敌人被诅咒' → R009 giantGem special of that colour; zh '若有任一敌人被诅咒' + snapshot overrides |  |
| 2026-09-28T22:43 | sa-A | L4a-R9-giant-9171 | assembler | 9171, 9172, 9173 | troop:7450 DraconicSentinel；troop:7451 UndeadSentinel；troop:7452 MonstrousSentinel | `src/engine/skills/curated/batch-r8.ts`<br>`src/data/gowSnapshotOverrides.json` | createGems plain Yellow/Purple/Brown 8 if any enemy Cursed; zh '若敌人被诅咒' → R009 giantGem special of that colour; zh '若有任一敌人被诅咒' + snapshot overrides |  |
| 2026-09-28T22:43 | sa-A | L4a-R9-1114-skulls | assembler | 7251 | weapon:1114 Boom-Boom | `src/engine/skills/curated/batch-w01.ts` | 7251 explode 3 include color → include all (R013-5) |  |
| 2026-09-28T22:46 | sa-A | L4a-R9-1413-target-stun | data | 8521 | weapon:1413 FleurDeLeon | `src/engine/skills/curated/batch-w03.ts`<br>`scripts/curated-pools/pool-w01.json`<br>`src/data/gowWeaponReviewedOverrides.json` | 8521 explode 4 include color if ANY enemy Stunned; zh machine text '结果 ... 超级重击 ... 打昏 ... 炸毁四枚' → explode 4 include all if the damaged target is Stunned (lastTargetStatus); zh '对一名敌人造成 [魔法 + 3] 点重度溅射伤害。若该敌人被击晕，则爆破 4 颗宝石。'; native order still issued |  |
| 2026-09-28T22:46 | sa-A | L4a-R9-6891-skulls | assembler | 8317 | troop:6891 UndeadDrake | `src/engine/skills/curated/batch-37.ts` | 8317 explode 4 include color → include all (R013-5) |  |
| 2026-09-28T22:49 | sa-A | L4a-R9-7150-enchant-fey | data | 8718 | troop:7150 KingOberron | `src/engine/skills/curated/batch-37.ts`<br>`src/data/gowSnapshotOverrides.json` | 8718 last step magic +5 to Elf allies; zh '施魔法于所有的精灵同盟' → native CauseEnchanted@AllyType fey: enchant Fey allies; zh '赋予所有仙灵盟友法印效果' + snapshot override |  |
| 2026-09-28T22:49 | sa-A | L4a-R9-7623-order | assembler | 9489 | troop:7623 ImmortalFurnax | `src/engine/skills/curated/batch-r11.ts` | 9489 attack, heal, armor → native order attack, armor, health (R001) |  |

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
| 7001 | 1 | L4a-R8-random-any-gem |
| 7006 | 1 | L5-C-6007-random-burn |
| 7009 | 1 | P-create-interleave |
| 7014 | 1 | L4a-R1-7014-order |
| 7015 | 1 | L3-F-6015 |
| 7022 | 1 | F3-q18 |
| 7023 | 1 | L1-charm-instant |
| 7024 | 1 | F2-R001-order |
| 7025 | 1 | F2-R001-order |
| 7032 | 1 | L3-017 |
| 7034 | 1 | B5-L4b-6034-fromtarget |
| 7035 | 1 | L3-018 |
| 7037 | 1 | F2-R001-order |
| 7041 | 1 | L4a-R9-6041-from-previous |
| 7047 | 1 | F1-6047-dispel |
| 7050 | 1 | F3-q29 |
| 7051 | 1 | L5-C-r4-6051 |
| 7052 | 3 | F2-R001-order、R010、R013-5 |
| 7053 | 1 | F2-R001-order |
| 7054 | 1 | F2-R001-order |
| 7055 | 1 | F2-R001-order |
| 7061 | 1 | F3-t6061 |
| 7063 | 1 | P-create-interleave |
| 7065 | 1 | F2-R001-order |
| 7066 | 1 | D-1000-strongest |
| 7071 | 1 | L4a-R9-1064-zh |
| 7092 | 1 | L4b-7276-singlegem |
| 7094 | 1 | F2-1028-missing-magic |
| 7102 | 1 | L4a-r3-1036 |
| 7103 | 1 | L4a-r3-1037 |
| 7104 | 1 | L4a-r3-1039 |
| 7105 | 1 | L4a-r3-1040 |
| 7109 | 1 | L4a-r3-1044 |
| 7116 | 1 | L4a-r3-1038 |
| 7121 | 1 | L4a-R8-random-any-gem |
| 7124 | 1 | F2-1058-boost-source |
| 7133 | 1 | L4a-R1-7133-no-base |
| 7137 | 1 | R013-5 |
| 7138 | 2 | L4b-7138-zh、L4b-6068-order |
| 7139 | 1 | F3-q28 |
| 7143 | 1 | R004-tests |
| 7145 | 1 | L4a-R9-skulls-b03 |
| 7146 | 2 | F1-remove-order、P-F1-remove-gems |
| 7147 | 1 | L4a-R8-random-any-gem |
| 7149 | 1 | F2-R001-order |
| 7150 | 1 | B-L4b-6080-nine |
| 7156 | 1 | F1-onkill-order |
| 7159 | 1 | L4a-R1-7159-cross |
| 7162 | 1 | L4b-7138-onecolour |
| 7165 | 1 | G-kill-all-skills |
| 7169 | 2 | L4b-7276-singlegem、B-L4b-6104-blue |
| 7174 | 1 | B5-L4b-1067-singlegem |
| 7177 | 1 | L5-C-r4-6108 |
| 7181 | 1 | L3-F-6111 |
| 7184 | 2 | L4a-r4-1071、R013-5 |
| 7185 | 2 | L5-012、R004 (L5-004,L5-005,L5-014,L4b-6340) |
| 7192 | 1 | P-R3-precast-compare |
| 7194 | 2 | P-F1-oneof-chosen-target、P-F1-oneof-chosen-target |
| 7204 | 1 | B5-L4b-1091-armor-target |
| 7207 | 1 | P-R1-count-at-native-step |
| 7208 | 1 | P-prefnotprev-semantics |
| 7209 | 1 | D-6117-beast-triple |
| 7210 | 1 | L1-consume-first |
| 7211 | 1 | F1-steal-before-damage |
| 7214 | 1 | L1-summon-dist |
| 7216 | 1 | P-chooser-native-restrictions |
| 7221 | 1 | G-1096-steal-2 |
| 7229 | 1 | L3-F-6128 |
| 7230 | 1 | L4a-R1-7230-7964-count |
| 7232 | 1 | F2-R001-order |
| 7233 | 1 | F1-items-62-75 |
| 7236 | 2 | P-random-stat-pool、F1-items-54-60 |
| 7237 | 2 | L1-6135-allies、P-R1-count-at-native-step |
| 7239 | 1 | D-b09-targets |
| 7240 | 2 | P-random-stat-pool、F1-steal-before-damage |
| 7241 | 1 | P-E-faction-kingdom |
| 7244 | 2 | P-random-stat-pool、F1-steal-before-damage |
| 7245 | 1 | F1-onkill-order |
| 7246 | 1 | D-1109-single-hit |
| 7248 | 1 | L7-R1-weapon-colour-race |
| 7251 | 1 | L4a-R9-1114-skulls |
| 7252 | 3 | P-counter-per-step、L7-R1-attack-armor-life-pooled、P-counter-per-step |
| 7254 | 1 | L2-wrong-enemy-branches |
| 7260 | 1 | F1-items-62-75 |
| 7265 | 1 | L3-008 |
| 7266 | 1 | L4b-6152-attack |
| 7269 | 1 | L4a-r3-1117 |
| 7271 | 1 | D-b09-targets |
| 7272 | 1 | F2-1120-column-skulls |
| 7274 | 1 | G-6154-order |
| 7277 | 1 | L2-H-6157-ally-colour |
| 7280 | 1 | P-create-interleave |
| 7281 | 1 | L1-R2-consume-first |
| 7287 | 1 | F3-q26 |
| 7293 | 1 | L1-consume-first |
| 7294 | 1 | G-kill-all-skills |
| 7295 | 1 | F3-q35 |
| 7296 | 2 | L5-C-r4-1132、L5-C-r4-1132 |
| 7297 | 1 | F3-q20 |
| 7299 | 1 | G-1133-prefnotprev |
| 7307 | 1 | F3-q27 |
| 7308 | 1 | L4a-r3-1138 |
| 7310 | 2 | P-random-stat-pool、F1-steal-before-damage |
| 7312 | 1 | F1-steal-before-damage |
| 7314 | 1 | L2-wrong-enemy-branches |
| 7316 | 1 | L1-charm-instant |
| 7317 | 1 | F3-q05 |
| 7318 | 1 | R3-B01-1141 |
| 7319 | 1 | P-random-stat-pool |
| 7322 | 1 | L2-6181-create |
| 7323 | 2 | P-random-stat-pool、F1-items-62-75 |
| 7326 | 1 | L1-R2-consume-first |
| 7329 | 1 | L4a-r3-6188 |
| 7333 | 1 | R004 (L5-004,L5-005,L5-014,L4b-6340) |
| 7334 | 1 | L7-6193 |
| 7338 | 2 | L5-006、R004 (L5-004,L5-005,L5-014,L4b-6340) |
| 7339 | 1 | F1-items-62-75 |
| 7340 | 2 | P-random-stat-pool、L2-H-6198-order |
| 7343 | 1 | L1-6201-dispel |
| 7345 | 1 | F2-6203-no-cleanse |
| 7347 | 1 | R7-6205-steal-order |
| 7348 | 2 | P-F1-oneof-chosen-target、P-F1-oneof-chosen-target |
| 7349 | 2 | F1-remove-order、P-F1-remove-gems |
| 7352 | 1 | R013-5 |
| 7353 | 1 | L7-6211 |
| 7354 | 1 | F1-steal-before-damage |
| 7356 | 1 | L3-F-6214 |
| 7357 | 1 | F2-R001-order |
| 7358 | 1 | P-chooser-native-restrictions |
| 7359 | 2 | L5-013、R004 (L5-004,L5-005,L5-014,L4b-6340) |
| 7360 | 1 | F2-R001-order |
| 7361 | 2 | L5-013、R004 (L5-004,L5-005,L5-014,L4b-6340) |
| 7364 | 2 | L5-013、R004 (L5-004,L5-005,L5-014,L4b-6340) |
| 7366 | 1 | L4a-r3-6224 |
| 7368 | 1 | F3-q23 |
| 7369 | 1 | F1-items-62-75 |
| 7371 | 2 | L5-013、R004 (L5-004,L5-005,L5-014,L4b-6340) |
| 7378 | 1 | L2-6237-one-colour |
| 7379 | 1 | L4a-r3-6233 |
| 7380 | 1 | R3-B11-1143 |
| 7383 | 1 | F2-R001-order |
| 7386 | 1 | L2-wrong-enemy-branches |
| 7388 | 1 | L4a-R1-7388-chosen-row |
| 7390 | 1 | L2-H-6247-any-gem |
| 7391 | 1 | P-E-faction-kingdom |
| 7392 | 2 | L5-009、R004 (L5-004,L5-005,L5-014,L4b-6340) |
| 7395 | 1 | L3-011 |
| 7396 | 1 | F3-q25 |
| 7399 | 1 | P-chooser-native-restrictions |
| 7401 | 1 | G-6258-order |
| 7402 | 1 | R7-6259-chosen-ally |
| 7404 | 1 | B-L4b-6261-life-boost |
| 7408 | 1 | F2-6265-dispel-last |
| 7410 | 2 | R7-b14-status-counts、P-R7-dead-last-target-cond |
| 7415 | 1 | R7-6269-chosen-daemon |
| 7418 | 1 | L7-R1-random-chain-waves |
| 7424 | 1 | L3-F-6278 |
| 7425 | 1 | L1-6279-chosen |
| 7431 | 1 | L3-002 |
| 7433 | 1 | L2-board-chosen |
| 7434 | 1 | F2-R001-order |
| 7436 | 1 | R3-B04-6290 |
| 7438 | 2 | P-F1-oneof-chosen-target、P-F1-oneof-chosen-target |
| 7440 | 1 | L1-6294-villager |
| 7441 | 1 | F1-items-62-75 |
| 7442 | 1 | R3-B01-6296 |
| 7443 | 1 | F2-R001-order |
| 7444 | 2 | L5-010、R004 (L5-004,L5-005,L5-014,L4b-6340) |
| 7453 | 1 | L4a-r3-6303 |
| 7454 | 4 | P-counter-per-step、L7-R1-attack-armor-life-pooled、P-counter-per-step、P-R3-precast-compare |
| 7455 | 1 | L1-6305-repeat |
| 7457 | 1 | R7-not-board-misread |
| 7458 | 1 | P-R3-precast-compare |
| 7460 | 1 | P-F1-oneof-chosen-target |
| 7462 | 1 | L4a-R8-random-any-gem |
| 7463 | 1 | L2-board-chosen |
| 7470 | 1 | P-counter-per-step |
| 7471 | 1 | B5-L4b-6321-more-magic |
| 7473 | 1 | F1-items-62-75 |
| 7477 | 1 | L4a-R1-7477-armor-boost |
| 7478 | 2 | F1-remove-order、P-F1-remove-gems |
| 7480 | 2 | L4b-7276-singlegem、L1-R2-consume-first |
| 7482 | 1 | P-random-stat-pool |
| 7484 | 1 | G-6334-kill-order |
| 7489 | 1 | P-counter-per-step |
| 7491 | 1 | P-B-action-status-self-count |
| 7501 | 1 | L1-summon-dist |
| 7504 | 2 | L7-6352-a、R005-test-sync |
| 7507 | 1 | F2-6355-native-order |
| 7511 | 1 | B5-L4b-6359-target |
| 7513 | 1 | L4a-r3-6361 |
| 7518 | 1 | P-prefnotprev-semantics |
| 7520 | 1 | R3-B07-6368 |
| 7521 | 1 | L2-6369-ratio |
| 7526 | 1 | F1-items-62-75 |
| 7529 | 1 | L1-1154-egg |
| 7532 | 1 | L5-C-r4-6377 |
| 7533 | 1 | L1-6378-pool |
| 7541 | 1 | P-R7-dead-last-target-cond |
| 7542 | 2 | F1-6387-rebirth、P-F1-summon-after-caster-death |
| 7545 | 1 | L2-H-6390-weights |
| 7548 | 1 | R004-tests |
| 7553 | 2 | F2-6398-random-dispel、P-F2-precount-explode |
| 7554 | 1 | P-chooser-native-restrictions |
| 7558 | 1 | F3-q32 |
| 7559 | 1 | L1-R2-consume-first |
| 7560 | 1 | P-random-stat-pool |
| 7561 | 3 | L5-001、R004 (L5-004,L5-005,L5-014,L4b-6340)、R004-tests |
| 7563 | 2 | R3-B11-1156、R012 |
| 7568 | 3 | P-counter-per-step、L4a-R1-7568-random-gem、P-R1-count-at-native-step |
| 7574 | 1 | L2-6416-branch-weights |
| 7576 | 1 | F2-R001-order |
| 7577 | 1 | F2-1159-boost-source |
| 7586 | 1 | B-L4b-1167-fromprevious |
| 7594 | 1 | L4a-R8-random-any-gem |
| 7595 | 1 | L4a-r3-6422 |
| 7596 | 3 | P-random-stat-pool、F1-remove-order、P-F1-remove-gems |
| 7598 | 1 | L1-6425-dist |
| 7599 | 1 | F2-R001-order |
| 7601 | 1 | L4a-R1-7601-targets |
| 7602 | 2 | L1-6428-steal-summon、P-R5-summon-id-reuse |
| 7624 | 1 | F1-items-54-60 |
| 7625 | 1 | L5-C-1176-knight |
| 7626 | 1 | F1-steal-before-damage |
| 7631 | 1 | L1-6453-order |
| 7632 | 1 | L3-F-6454 |
| 7633 | 1 | F1-steal-before-damage |
| 7635 | 1 | F2-6457-dispel-self |
| 7637 | 1 | L1-R2-consume-first |
| 7640 | 1 | L3-F-6462 |
| 7643 | 1 | P-R5-summon-id-reuse |
| 7644 | 2 | P-counter-per-step、P-counter-per-step |
| 7645 | 1 | F2-6467-life-armor |
| 7646 | 1 | F3-q07 |
| 7647 | 1 | L1-6469-order |
| 7648 | 1 | D-b09-targets |
| 7649 | 1 | L4a-R9-6471-skulls |
| 7654 | 1 | P-prefnotprev-semantics |
| 7655 | 1 | P-R1-count-at-native-step |
| 7656 | 1 | P-R1-count-at-native-step |
| 7657 | 1 | P-R1-count-at-native-step |
| 7658 | 1 | P-R1-count-at-native-step |
| 7659 | 1 | P-R1-count-at-native-step |
| 7660 | 1 | P-R1-count-at-native-step |
| 7662 | 1 | P-E-faction-kingdom |
| 7666 | 1 | P-prefnotprev-semantics |
| 7668 | 1 | L3-010 |
| 7669 | 1 | L4a-R8-6482-zh |
| 7670 | 1 | P-F3-prehit-target-compare |
| 7674 | 1 | L4a-R9-skulls-b03 |
| 7685 | 1 | L1-6498-summon-dist |
| 7692 | 1 | P-E-faction-kingdom |
| 7693 | 1 | F2-R001-order |
| 7697 | 2 | L1-E-race-pool-immortals、L1-H-6507-freeze-affected |
| 7700 | 1 | B-L4b-6510-two-creates |
| 7704 | 1 | L1-6513-sacrifice |
| 7707 | 1 | P-E-faction-kingdom |
| 7708 | 1 | L4b-R6-B04 |
| 7712 | 1 | R3-B03-6519 |
| 7720 | 1 | F3-q03 |
| 7722 | 1 | P-E-faction-kingdom |
| 7723 | 1 | F2-6529-dispel-kill |
| 7728 | 2 | L1-6534-order、L1-charm-instant |
| 7730 | 1 | L4a-R9-6536-skulls |
| 7735 | 1 | P-chooser-native-restrictions |
| 7740 | 2 | L5-013、R004 (L5-004,L5-005,L5-014,L4b-6340) |
| 7743 | 1 |  |
| 7744 | 1 | F3-t6550 |
| 7747 | 1 | P-counter-per-step |
| 7752 | 1 |  |
| 7761 | 1 | F2-R001-order |
| 7765 | 1 | P-counter-per-step |
| 7768 | 1 | F2-R001-order |
| 7769 | 1 | L4a-R1-7769-column-count |
| 7770 | 1 | R013-3 |
| 7773 | 1 | F1-steal-before-damage |
| 7780 | 1 | F3-q04 |
| 7781 | 1 | L1-R2-consume-first |
| 7786 | 1 | P-prefnotprev-semantics |
| 7787 | 1 | L2-6583-storm-pool |
| 7790 | 1 | R012 |
| 7791 | 2 | F3-q21、P-F3-lasttarget-damaged |
| 7797 | 2 | L4a-R1-7797-order、P-R1-count-at-native-step |
| 7798 | 1 | L1-6594-prefnotprev |
| 7804 | 1 | L4a-R1-no-base-7804-8423 |
| 7805 | 1 | F3-t1210 |
| 7806 | 1 | L3-F-1211 |
| 7808 | 1 | R7-6599-full-or |
| 7810 | 1 | L1-E-6601-target |
| 7811 | 1 | L5-C-r4-6602 |
| 7816 | 1 | L1-E-1213-dist |
| 7818 | 1 | L1-E-6596-row |
| 7864 | 1 | L7-R1-attack-armor-life-pooled |
| 7866 | 1 | R7-1219-create-before-hit |
| 7928 | 1 | L4a-R1-7928-allnegative |
| 7929 | 1 | R3-B04-1221 |
| 7930 | 2 | P-counter-per-step、L1-6606-native |
| 7931 | 1 | F2-6607-steal-mult |
| 7932 | 1 | F2-R001-order |
| 7933 | 1 | F2-R001-order |
| 7936 | 1 | P-create-interleave |
| 7941 | 1 | F2-6623-column-order |
| 7942 | 1 | P-B-action-status-self-count |
| 7943 | 1 | P-R6-chosen-diagonal-transform |
| 7944 | 1 | B-L4b-6626-order |
| 7945 | 1 | P-prefnotprev-semantics |
| 7947 | 1 | L1-1351-pool |
| 7952 | 4 | L3-015、L3-016、R7-doomed-count-order、P-R1-count-at-native-step |
| 7960 | 1 | P-R3-precast-compare |
| 7962 | 1 | L3-F-6636 |
| 7963 | 4 | L3-015、L3-016、R7-doomed-count-order、P-R1-count-at-native-step |
| 7964 | 1 | L4a-R1-7230-7964-count |
| 7973 | 4 | L3-015、L3-016、R7-doomed-count-order、P-R1-count-at-native-step |
| 7975 | 3 | P-counter-per-step、L7-R1-attack-armor-life-pooled、P-counter-per-step |
| 7976 | 1 | P-E-faction-kingdom |
| 7978 | 1 | L5-013 |
| 7982 | 1 | R7-doomed-support-counters |
| 7983 | 1 | P-counter-per-step |
| 7984 | 1 | L1-R2-consume-first |
| 7985 | 1 | L1-H-6651-double-stun-summons |
| 7991 | 1 | L1-E-1238-pool |
| 8022 | 1 | L4a-R8-random-any-gem |
| 8024 | 1 | P-prefnotprev-semantics |
| 8032 | 1 | F2-R001-order |
| 8035 | 1 | F2-R001-order |
| 8038 | 1 | P-B-action-status-self-count |
| 8039 | 1 | L4a-R1-cross-8039-9952 |
| 8045 | 1 | P-E-faction-kingdom |
| 8047 | 1 | R7-doomed-support-counters |
| 8048 | 1 | P-E-faction-kingdom |
| 8050 | 1 | R7-doomed-support-counters |
| 8051 | 1 | P-E-faction-kingdom |
| 8052 | 1 | R3-B03-1247 |
| 8053 | 4 | L3-015、L3-016、R7-doomed-count-order、P-R1-count-at-native-step |
| 8054 | 1 | P-E-faction-kingdom |
| 8055 | 1 | L7-R1-random-chain-waves |
| 8060 | 1 | P-R2-chosen-color-modifier |
| 8062 | 1 | L5-C-1250-bleed-n |
| 8063 | 1 | L2-H-6706-prefnotprev |
| 8064 | 1 | L4a-R8-6707-same-targets |
| 8065 | 1 | L5-C-r4-6708 |
| 8070 | 1 | P-R6-chosen-cell-counts |
| 8073 | 1 | L7-R1-random-chain-waves |
| 8076 | 1 | R3-B01-1256 |
| 8077 | 4 | L3-015、L3-016、R7-doomed-count-order、P-R1-count-at-native-step |
| 8078 | 4 | L3-015、L3-016、R7-doomed-count-order、P-R1-count-at-native-step |
| 8079 | 1 | R7-doomed-support-counters |
| 8080 | 1 | R7-doomed-support-counters |
| 8081 | 1 | R7-doomed-support-counters |
| 8083 | 1 | L7-R1-lethal-order-doomskull |
| 8084 | 1 | L5-007 |
| 8090 | 1 | L4a-r3-6720 |
| 8091 | 1 | L4a-R9-6721-prefnotprev |
| 8097 | 1 | F3-q06 |
| 8098 | 1 | G-6728-order |
| 8101 | 1 | L2-6731-branches |
| 8103 | 1 | P-counter-per-step |
| 8104 | 1 | G-kill-all-skills |
| 8106 | 1 | L4a-r3-6736 |
| 8108 | 1 | L2-wrong-enemy-branches |
| 8111 | 1 | P-E-faction-kingdom |
| 8112 | 1 | F3-q33 |
| 8113 | 1 | P-counter-per-step |
| 8119 | 1 | P-E-faction-kingdom |
| 8121 | 1 | P-E-faction-kingdom |
| 8123 | 1 | P-E-faction-kingdom |
| 8125 | 1 | P-E-faction-kingdom |
| 8130 | 1 | F3-t1272 |
| 8133 | 1 | F2-6754-no-explode |
| 8134 | 1 | L4a-R8-random-any-gem |
| 8137 | 1 | L1-E-6757-target |
| 8138 | 1 | L4a-r4-6758 |
| 8139 | 2 | P-counter-per-step、R7-b14-status-counts |
| 8140 | 2 | L1-1274-amanithrax、P-R5-faction-kingdom |
| 8150 | 1 | F2-R001-order |
| 8155 | 1 | R3-B07-1279 |
| 8160 | 1 | P-prefnotprev-semantics |
| 8165 | 1 | P-random-stat-pool |
| 8166 | 1 | P-random-stat-pool |
| 8167 | 1 | L4a-r3-6777 |
| 8168 | 1 | L4a-r3-6778 |
| 8169 | 1 | P-create-interleave |
| 8176 | 1 | P-E-faction-kingdom |
| 8178 | 1 | P-E-faction-kingdom |
| 8180 | 1 | L3-F-6789 |
| 8182 | 1 | L5-C-6791-precount |
| 8184 | 1 | L4a-r3-6793 |
| 8193 | 1 | L1-6786-summons |
| 8197 | 1 | P-E-faction-kingdom |
| 8199 | 1 | P-E-faction-kingdom |
| 8201 | 1 | P-E-faction-kingdom |
| 8203 | 2 | P-counter-per-step、P-counter-per-step |
| 8204 | 1 | P-counter-per-step |
| 8208 | 1 | F2-R001-order |
| 8209 | 1 | D-6806-count20 |
| 8211 | 1 | L1-6808-branches |
| 8215 | 1 | L4a-R1-8215-fromprevious |
| 8216 | 1 | L2-H-6817-one-skill |
| 8218 | 2 | P-counter-per-step、L2-6814-branch-weights |
| 8219 | 1 | P-counter-per-step |
| 8221 | 1 | L5-C-r4-1294 |
| 8223 | 1 | L5-C-r4-6819 |
| 8226 | 1 | L4a-r3-6822 |
| 8228 | 3 | P-counter-per-step、F2-6826-kill-skulls、P-counter-per-step |
| 8229 | 1 | L1-6827-base |
| 8234 | 2 | L4b-6824-random-ally、P-chooser-native-restrictions |
| 8235 | 1 | R7-6825-ratio |
| 8236 | 1 | R3-B11-6831 |
| 8237 | 1 | L1-6832-prefnotprev |
| 8238 | 3 | P-counter-per-step、L7-R1-attack-armor-life-pooled、P-counter-per-step |
| 8239 | 1 | L3-F-6834 |
| 8241 | 1 | R3-B11-6831 |
| 8243 | 1 | F1-items-54-60 |
| 8245 | 1 | L5-001 |
| 8246 | 1 | L4b-6841-prefnotprev |
| 8247 | 1 | L4b-6842-prev |
| 8248 | 2 | F1-onkill-order、R012 |
| 8250 | 2 | P-F1-oneof-chosen-target、P-F1-oneof-chosen-target |
| 8251 | 1 | P-counter-per-step |
| 8253 | 1 | L2-H-1296-spm034 |
| 8260 | 1 | P-E-faction-kingdom |
| 8261 | 1 | P-E-faction-kingdom |
| 8262 | 1 | P-E-faction-kingdom |
| 8263 | 1 | P-E-faction-kingdom |
| 8273 | 1 | L1-H-6854-magic |
| 8282 | 1 | L3-F-6863 |
| 8283 | 1 | L1-1310-brown |
| 8285 | 1 | P-E-faction-kingdom |
| 8288 | 1 | P-prefnotprev-semantics |
| 8289 | 1 | L3-F-6867 |
| 8294 | 1 | P-prefnotprev-semantics |
| 8297 | 2 | L4a-R1-8297-life-boost、R013-5 |
| 8299 | 1 | F2-1313-order-life |
| 8302 | 1 | F1-steal-before-damage |
| 8304 | 1 | G-6881-kill-double |
| 8307 | 1 | L2-wrong-enemy-branches |
| 8313 | 1 | P-E-faction-kingdom |
| 8316 | 1 | B-L4b-6890-native-chances |
| 8317 | 1 | L4a-R9-6891-skulls |
| 8321 | 1 | L2-1317-branches |
| 8322 | 2 | P-A-target-kingdom、P-E-faction-kingdom |
| 8323 | 2 | P-A-target-kingdom、P-E-faction-kingdom |
| 8324 | 2 | P-A-target-kingdom、P-E-faction-kingdom |
| 8325 | 2 | P-A-target-kingdom、P-E-faction-kingdom |
| 8326 | 2 | P-A-target-kingdom、P-E-faction-kingdom |
| 8327 | 2 | P-A-target-kingdom、P-E-faction-kingdom |
| 8328 | 2 | P-A-target-kingdom、P-E-faction-kingdom |
| 8329 | 2 | P-A-target-kingdom、P-E-faction-kingdom |
| 8330 | 2 | P-A-target-kingdom、P-E-faction-kingdom |
| 8331 | 2 | P-A-target-kingdom、P-E-faction-kingdom |
| 8332 | 2 | P-A-target-kingdom、P-E-faction-kingdom |
| 8333 | 2 | P-A-target-kingdom、P-E-faction-kingdom |
| 8334 | 2 | P-A-target-kingdom、P-E-faction-kingdom |
| 8335 | 2 | P-A-target-kingdom、P-E-faction-kingdom |
| 8336 | 2 | P-A-target-kingdom、P-E-faction-kingdom |
| 8337 | 2 | P-A-target-kingdom、P-E-faction-kingdom |
| 8338 | 2 | P-A-target-kingdom、P-E-faction-kingdom |
| 8339 | 2 | P-A-target-kingdom、P-E-faction-kingdom |
| 8340 | 2 | P-A-target-kingdom、P-E-faction-kingdom |
| 8341 | 2 | P-A-target-kingdom、P-E-faction-kingdom |
| 8342 | 2 | P-A-target-kingdom、P-E-faction-kingdom |
| 8343 | 2 | P-A-target-kingdom、P-E-faction-kingdom |
| 8344 | 2 | P-A-target-kingdom、P-E-faction-kingdom |
| 8345 | 2 | P-A-target-kingdom、P-E-faction-kingdom |
| 8346 | 2 | P-A-target-kingdom、P-E-faction-kingdom |
| 8347 | 2 | P-A-target-kingdom、P-E-faction-kingdom |
| 8348 | 2 | P-A-target-kingdom、P-E-faction-kingdom |
| 8349 | 2 | P-A-target-kingdom、P-E-faction-kingdom |
| 8350 | 2 | P-A-target-kingdom、P-E-faction-kingdom |
| 8351 | 2 | P-A-target-kingdom、P-E-faction-kingdom |
| 8352 | 2 | P-A-target-kingdom、P-E-faction-kingdom |
| 8353 | 2 | P-A-target-kingdom、P-E-faction-kingdom |
| 8354 | 2 | P-A-target-kingdom、P-E-faction-kingdom |
| 8357 | 1 | L1-1351-pool |
| 8358 | 1 | L3-F-6897 |
| 8365 | 3 | L7-R1-6904-nextdown、P-R4-nextdown-default-range、P-E-faction-kingdom |
| 8369 | 1 | L1-H-6908-four-branches |
| 8370 | 1 | L4a-r3-6909 |
| 8371 | 1 | L1-E-6910-wraith |
| 8373 | 1 | R3-B03-6912 |
| 8375 | 1 | G-6914-zh-order |
| 8377 | 1 | L2-6916-one-skill |
| 8382 | 1 | L1-devour-first |
| 8383 | 1 | P-E-faction-kingdom |
| 8385 | 1 | P-E-faction-kingdom |
| 8389 | 1 | L1-1351-pool |
| 8390 | 1 | P-prefnotprev-semantics |
| 8391 | 1 | P-R1-count-at-native-step |
| 8392 | 1 | P-R1-count-at-native-step |
| 8393 | 2 | L5-013、R004 (L5-004,L5-005,L5-014,L4b-6340) |
| 8396 | 1 | L2-1361-daemon-barrier |
| 8399 | 2 | L1-E-kingdom-summon-raw、P-E-faction-kingdom |
| 8403 | 3 | L5-001、R004 (L5-004,L5-005,L5-014,L4b-6340)、R004-tests |
| 8404 | 3 | L5-001、L5-002、L5-003 |
| 8406 | 1 | R7-6928-zh-count |
| 8407 | 2 | P-F1-oneof-chosen-target、P-F1-oneof-chosen-target |
| 8408 | 1 | L1-6930-summons |
| 8409 | 1 | L4a-R8-1370-order-electrostorm |
| 8410 | 1 | P-prefnotprev-semantics |
| 8411 | 1 | P-B-action-status-self-count |
| 8413 | 1 | R7-6925-two-hits |
| 8414 | 2 | F1-items-62-75、R012 |
| 8415 | 1 | R3-B04-6934 |
| 8416 | 1 | G-zh-typos |
| 8417 | 1 | P-R3-target-status-count,P-R3-ally-status-excl-self |
| 8418 | 2 | L5-C-r4-6937、P-C-firstlast-army-color |
| 8420 | 1 | L4a-R1-8420-cross |
| 8422 | 1 | P-create-interleave |
| 8423 | 1 | L4a-R1-no-base-7804-8423 |
| 8424 | 1 | L4a-R9-6943-cell |
| 8427 | 1 | L2-6946-order |
| 8429 | 1 | L2-H-6948-either-colour |
| 8430 | 1 | L2-6949-branches |
| 8432 | 1 | B-L4b-1371-target-status |
| 8434 | 1 | P-E-faction-kingdom |
| 8436 | 1 | R3-B01-1374 |
| 8438 | 1 | F1-6931-dispel |
| 8439 | 1 | R7-b11-defs |
| 8440 | 2 | P-random-stat-pool、F1-1377-target |
| 8442 | 1 | B5-L4b-doomed-random-armor |
| 8443 | 1 | B5-L4b-doomed-random-armor |
| 8444 | 1 | B5-L4b-doomed-random-armor |
| 8445 | 1 | B5-L4b-doomed-random-armor |
| 8446 | 1 | B5-L4b-doomed-random-armor |
| 8447 | 1 | B5-L4b-doomed-random-armor |
| 8448 | 1 | P-R6-chosen-diagonal-transform |
| 8451 | 2 | L1-E-kingdom-summon-raw、P-E-faction-kingdom |
| 8452 | 1 | P-E-faction-kingdom |
| 8453 | 1 | P-E-faction-kingdom |
| 8454 | 1 | P-R1-dual-storm |
| 8458 | 1 | L2-6958-order |
| 8459 | 1 | L2-H-6959-magic |
| 8460 | 1 | L1-E-kingdom-summon-raw |
| 8461 | 1 | L1-E-1394-pool |
| 8463 | 1 | D-b09-targets |
| 8467 | 2 | L4a-R1-8467-target-count、P-R1-chosen-target-color-cond |
| 8468 | 1 | F2-R001-order |
| 8469 | 2 | R011、L3-F-6966 |
| 8471 | 1 | L1-devour-first |
| 8472 | 2 | P-F1-oneof-chosen-target、P-F1-oneof-chosen-target |
| 8473 | 1 | P-F1-remove-gems |
| 8475 | 1 | L2-6972-order |
| 8478 | 1 | L3-F-6975 |
| 8479 | 1 | G-6976-prefnotprev |
| 8481 | 1 | L4a-r3-6954 |
| 8484 | 1 | L2-H-6981-chosen-line |
| 8485 | 1 | P-R3-next-up-target |
| 8487 | 1 | P-E-faction-kingdom |
| 8488 | 1 | R7-b14-status-counts |
| 8491 | 1 | P-chooser-native-restrictions |
| 8492 | 1 | L2-6988-one-block |
| 8494 | 1 | L4a-r4-6990-zh |
| 8495 | 1 | R3-B08-6985 |
| 8497 | 1 | F2-6991-explode-mult |
| 8498 | 1 | L3-F-6992 |
| 8499 | 2 | P-random-stat-pool、L2-H-6993-prefnotprev |
| 8500 | 2 | P-random-stat-pool、L1-6994-summons |
| 8501 | 1 | L3-F-6998 |
| 8502 | 1 | R3-B12-6999 |
| 8503 | 2 | B-L4b-7000-zh、R014-7000-count-before-create |
| 8504 | 1 | L4a-R9-7001-zh |
| 8505 | 2 | L1-E-kingdom-summon-raw、P-E-faction-kingdom |
| 8506 | 1 | P-E-faction-kingdom |
| 8508 | 2 | L5-C-r4-1405、L5-C-r4-1132 |
| 8510 | 2 | L1-E-kingdom-summon-raw、P-E-faction-kingdom |
| 8513 | 2 | L1-E-kingdom-summon-raw、P-E-faction-kingdom |
| 8514 | 2 | L1-E-kingdom-summon-raw、P-E-faction-kingdom |
| 8515 | 2 | L1-E-kingdom-summon-raw、P-E-faction-kingdom |
| 8517 | 1 | L2-H-1396-any-gem |
| 8521 | 1 | L4a-R9-1413-target-stun |
| 8523 | 1 | L3-F-6996 |
| 8525 | 1 | L4a-r3-7018 |
| 8526 | 1 | L4a-R8-7019-zh |
| 8528 | 1 | F2-R001-order |
| 8529 | 2 | L1-E-kingdom-summon-raw、L1-E-1414-desc |
| 8535 | 1 | R3-B02-7007 |
| 8540 | 1 | L7-R1-random-chain-waves |
| 8546 | 1 | L1-7014-order |
| 8549 | 1 | P-random-stat-pool |
| 8553 | 1 | L1-7032-count-first |
| 8556 | 1 | P-E-faction-kingdom |
| 8557 | 1 | L4b-7030-dragon |
| 8559 | 1 | L1-summon-dist |
| 8560 | 2 | P-counter-per-step、P-R1-dual-storm |
| 8562 | 3 | P-counter-per-step、L4a-R1-8562-attack-boost、P-R1-dual-storm |
| 8563 | 2 | P-counter-per-step、L7-R1-board-special-counts |
| 8569 | 1 | L4a-r3-7044 |
| 8570 | 1 | L7-7045 |
| 8572 | 1 | L2-H-7047-last2-random |
| 8574 | 1 | L1-devour-first |
| 8575 | 1 | L1-7050-order |
| 8577 | 1 | B-L4b-1417-wildcard-tiers |
| 8578 | 1 | L2-H-1418-one-colour |
| 8580 | 1 | L3-015 |
| 8582 | 1 | L1-devour-first |
| 8586 | 1 | F2-R001-order |
| 8587 | 1 | L1-drain-devour |
| 8589 | 1 | R7-7061-no-base |
| 8590 | 1 | R012 |
| 8591 | 1 | L1-gnome-race |
| 8592 | 1 | L1-gnome-race |
| 8593 | 1 | L1-gnome-race |
| 8594 | 1 | L1-gnome-race |
| 8595 | 1 | R7-b11-defs |
| 8596 | 1 | L4b-7068-potion-colour |
| 8597 | 1 | P-steal-to-life |
| 8598 | 4 | L3-007、L3-008、L3-009、R013-5 |
| 8599 | 1 | L4b-7071-base |
| 8601 | 1 | R7-guardian-potions |
| 8602 | 1 | L3-F-7074 |
| 8603 | 1 | R7-guardian-potions |
| 8605 | 1 | R7-guardian-potions |
| 8606 | 1 | R7-guardian-potions |
| 8607 | 1 | P-E-faction-kingdom |
| 8609 | 1 | L1-devour-first |
| 8610 | 1 | B-L4b-7082-native-create |
| 8614 | 1 | L4a-r3-7086 |
| 8618 | 1 | L2-1420-branches |
| 8620 | 1 | P-E-faction-kingdom |
| 8622 | 1 | L1-E-race-desc |
| 8624 | 2 | P-counter-per-step、L7-R1-teamsize-source |
| 8625 | 1 | F1-items-54-60 |
| 8626 | 2 | P-counter-per-step、L7-R1-teamsize-source |
| 8627 | 1 | B-L4b-7092-singlegem |
| 8629 | 1 | L4b-7277-7094 |
| 8630 | 1 | L7-R1-board-special-counts |
| 8632 | 2 | L3-001、P-create-interleave |
| 8633 | 2 | L3-001、P-create-interleave |
| 8634 | 2 | L3-001、P-create-interleave |
| 8635 | 2 | L3-001、P-create-interleave |
| 8636 | 1 | F3-t7101 |
| 8637 | 1 | L4a-R1-8637-row-green |
| 8638 | 1 | L3-015 |
| 8639 | 1 | L7-R1-board-special-counts |
| 8640 | 1 | P-R3-target-status-count,P-R3-ally-status-excl-self |
| 8641 | 1 | B-L4b-1428-four-creates |
| 8642 | 2 | P-A-target-kingdom、P-E-faction-kingdom |
| 8644 | 1 | L7-R1-weapon-colour-race |
| 8645 | 1 | P-E-faction-kingdom |
| 8646 | 1 | L4a-R1-8646-counters |
| 8648 | 1 | L1-E-race-pool-immortals |
| 8650 | 1 | P-prefnotprev-semantics |
| 8651 | 1 | L4b-7108-purple-enemies |
| 8654 | 2 | L3-008、L1-E-7111-dist |
| 8656 | 2 | P-prefnotprev-semantics、L7-R1-7113-enemy-colour |
| 8658 | 1 | P-R5-named-ally-count |
| 8660 | 1 | L7-R1-lethal-order-doomskull |
| 8662 | 1 | L7-R1-lethal-order-doomskull |
| 8663 | 1 | L4a-R1-8663-deaths-order |
| 8664 | 2 | D-1435-doomskull、P-D-lethal-first-lasttarget |
| 8665 | 1 | L2-7125-branches |
| 8666 | 1 | R7-tarot-extra-turn |
| 8667 | 1 | R7-tarot-extra-turn |
| 8668 | 2 | L5-007、R004 (L5-004,L5-005,L5-014,L4b-6340) |
| 8669 | 1 | P-E-faction-kingdom |
| 8670 | 2 | L1-E-kingdom-summon-raw、P-E-faction-kingdom |
| 8672 | 1 | R3-B06-7128 |
| 8674 | 2 | P-counter-per-step、L7-R1-board-special-counts |
| 8675 | 1 | L5-C-r4-7131 |
| 8684 | 1 | P-random-stat-pool |
| 8685 | 1 | L4a-R8-7136-column |
| 8686 | 1 | P-random-stat-pool |
| 8688 | 1 | L4a-r3-7139 |
| 8691 | 1 | L5-C-r4-7142 |
| 8692 | 1 | R3-B08-7143 |
| 8694 | 1 | F2-7145-miss-branch |
| 8696 | 1 | L4a-R9-skulls-b03 |
| 8697 | 1 | L4b-1441-cursed-gems |
| 8698 | 1 | L5-C-cursebreaker-targets |
| 8699 | 1 | L5-C-cursebreaker-targets |
| 8700 | 1 | L5-C-cursebreaker-targets |
| 8707 | 2 | L1-E-kingdom-summon-raw、P-E-faction-kingdom |
| 8713 | 1 | P-counter-per-step |
| 8715 | 1 | L1-7155-devour |
| 8718 | 1 | L4a-R9-7150-enchant-fey |
| 8721 | 1 | L4a-R8-1452-column-only |
| 8722 | 1 | L2-singlegem-cell |
| 8723 | 1 | P-E-faction-kingdom |
| 8725 | 2 | L1-E-kingdom-summon-raw、P-E-faction-kingdom |
| 8732 | 1 | L1-7157-devour |
| 8744 | 1 | P-R5-named-ally-count |
| 8745 | 1 | L4a-r4-7174 |
| 8747 | 1 | L1-summon-dist |
| 8751 | 3 | P-counter-per-step、P-counter-per-step、G-7181-zh |
| 8752 | 2 | L5-008、R004 (L5-004,L5-005,L5-014,L4b-6340) |
| 8755 | 1 | F2-R001-order |
| 8756 | 1 | L2-H-7186-enemy-drain |
| 8758 | 1 | P-R1-count-at-native-step |
| 8761 | 1 | R7-1460-burning-gems |
| 8762 | 1 | P-R6-chosen-diagonal-transform |
| 8765 | 2 | L1-E-kingdom-summon-raw、P-E-faction-kingdom |
| 8766 | 2 | L1-E-kingdom-summon-raw、P-E-faction-kingdom |
| 8767 | 1 | L7-R1-weapon-colour-race |
| 8770 | 1 | L1-E-race-pool-immortals |
| 8771 | 1 | L1-E-race-desc |
| 8776 | 1 | R3-B03-1474 |
| 8781 | 1 | G-zh-typos |
| 8782 | 1 | L4b-7195-order |
| 8783 | 1 | F2-R001-order |
| 8785 | 1 | P-counter-per-step |
| 8788 | 2 | L7-7201、G-7201-count-before-hit |
| 8795 | 1 | L3-003 |
| 8796 | 1 | L2-7209-gargoyle-branches |
| 8797 | 2 | L4b-7210-doomskull、P-R1-gargoyle-tier-filter,P-R2-gargoyle-tier,P-R4-gargoyle-tier-count,P-R3-dragon-gem-count |
| 8798 | 1 | R7-7211-gargoyle-count |
| 8802 | 1 | F3-t7215 |
| 8803 | 1 | L4b-R6-B03-prefnotprev |
| 8804 | 1 | L2-7217-cell |
| 8807 | 3 | F2-R001-order、P-A-target-kingdom、P-E-faction-kingdom |
| 8809 | 1 | P-E-faction-kingdom |
| 8812 | 1 | L4a-R1-8812-no-base |
| 8813 | 1 | L4b-R6-B06 |
| 8815 | 1 | L7-R1-board-special-counts |
| 8816 | 1 | L1-E-kingdom-summon-raw |
| 8817 | 1 | L1-7222-chance |
| 8820 | 1 | P-counter-per-step |
| 8823 | 1 | L4a-R8-random-any-gem |
| 8824 | 1 | R7-not-board-misread |
| 8830 | 1 | R009-giant-dragon-L4b |
| 8831 | 1 | L1-H-7235-one-skill |
| 8832 | 1 | R009-giant-dragon-L4b |
| 8834 | 1 | B5-L4b-R009-giants |
| 8836 | 1 | B5-L4b-R009-giants |
| 8837 | 1 | B5-L4b-R009-giants |
| 8839 | 1 | B5-L4b-R009-giants |
| 8841 | 1 | L4a-R1-8841-random-explode |
| 8842 | 1 | L1-1486-order |
| 8844 | 1 | R009-giant |
| 8845 | 1 | R009-giant |
| 8846 | 1 | R009-giant |
| 8847 | 1 | R009-giant |
| 8848 | 1 | R009-giant |
| 8849 | 1 | R009-giant |
| 8850 | 1 | R7-dragon-convert-extra-turn |
| 8852 | 1 | L2-H-7253-steal-first |
| 8854 | 1 | P-prefnotprev-semantics |
| 8856 | 1 | L2-7282-pref-not-prev |
| 8859 | 1 | P-random-stat-pool |
| 8861 | 2 | R7-b11-defs、R013-5 |
| 8865 | 1 | L3-F-7291 |
| 8871 | 1 | B-L4b-7257-countmax |
| 8872 | 1 | L4b-1487-1488 |
| 8873 | 1 | L4b-1487-1488 |
| 8874 | 1 | B5-L4b-1489-blue-giants |
| 8875 | 2 | P-A-target-kingdom、P-E-faction-kingdom |
| 8877 | 1 | P-E-faction-kingdom |
| 8881 | 2 | P-prefnotprev-semantics、R3-B12-7262 |
| 8884 | 1 | L2-7265-dragon |
| 8886 | 1 | R009-7267-color |
| 8887 | 1 | R009-giant-dragon-L4b |
| 8889 | 1 | L4b-7270-dragon |
| 8890 | 1 | L1-consume-first |
| 8891 | 1 | L1-consume-first |
| 8894 | 2 | L1-7260-target、L1-7260-target |
| 8895 | 1 | F1-items-62-75 |
| 8901 | 2 | L4b-7276-singlegem、P-chooser-native-restrictions |
| 8902 | 1 | L4b-7277-7094 |
| 8905 | 2 | L1-E-kingdom-summon-raw、P-E-faction-kingdom |
| 8911 | 2 | L1-E-kingdom-summon-raw、P-E-faction-kingdom |
| 8916 | 1 | L4a-r3-7304 |
| 8917 | 1 | R7-tarot-extra-turn |
| 8923 | 1 | L3-F-7311 |
| 8924 | 1 | F2-R001-order |
| 8928 | 1 | P-R1-row-count-at-cast-start |
| 8930 | 1 | L4a-r4-7318-zh |
| 8933 | 1 | F2-7321-no-events |
| 8937 | 1 | P-B-action-status-self-count |
| 8939 | 1 | R3-B02-7327 |
| 8941 | 2 | P-F1-oneof-chosen-target、P-F1-oneof-chosen-target |
| 8946 | 1 | R3-B09-1505 |
| 8952 | 1 | D-1509-mark-target |
| 8955 | 2 | L1-E-kingdom-summon-raw、P-E-faction-kingdom |
| 8957 | 1 | L4a-R8-random-any-gem |
| 8961 | 1 | F2-7338-cross-skulls |
| 8963 | 1 | L4b-R6-B03-prefnotprev |
| 8965 | 1 | P-R6-chosen-cell-counts |
| 8967 | 1 | P-random-stat-pool |
| 8969 | 1 | L7-7344 |
| 8970 | 2 | P-prefnotprev-semantics、R7-tarot-extra-turn |
| 8971 | 1 | P-E-faction-kingdom |
| 8972 | 1 | R3-B05-1528 |
| 8974 | 1 | R7-tarot-extra-turn |
| 8976 | 1 | R013-5 |
| 8979 | 1 | F1-onkill-order |
| 8985 | 1 | P-R5-faction-kingdom |
| 8987 | 1 | P-counter-per-step |
| 8995 | 1 | L4a-r3-1523 |
| 8996 | 1 | L4b-R6-B06 |
| 9003 | 1 | R7-tarot-extra-turn |
| 9004 | 1 | L4a-R9-7364-cross |
| 9008 | 1 | R009-giant-dragon-L4b |
| 9013 | 1 | L7-R1-random-chain-waves |
| 9015 | 2 | L5-001、L5-002 |
| 9016 | 1 | L1-H-7376-prefnotprev |
| 9020 | 1 | L4a-R8-random-any-gem |
| 9022 | 1 | P-R1-gargoyle-tier-filter,P-R2-gargoyle-tier,P-R4-gargoyle-tier-count,P-R3-dragon-gem-count |
| 9023 | 1 | L4b-R6-B02 |
| 9025 | 1 | F2-7383-kill-gems |
| 9034 | 2 | L1-E-kingdom-summon-raw、P-E-faction-kingdom |
| 9036 | 2 | L1-E-kingdom-summon-raw、P-E-faction-kingdom |
| 9051 | 1 | L3-008 |
| 9052 | 1 | L4a-R9-7402-same-target |
| 9053 | 1 | B5-L4b-7403-singlegem |
| 9054 | 1 | L4a-R9-7404-purple |
| 9064 | 1 | P-counter-per-step |
| 9066 | 1 | L1-7417-devour |
| 9067 | 1 | L3-008 |
| 9069 | 1 | L2-7406-branch-weights |
| 9111 | 2 | P-A-target-kingdom、P-E-faction-kingdom |
| 9115 | 1 | R7-tarot-extra-turn |
| 9118 | 1 | L1-drain-devour |
| 9119 | 1 | P-create-interleave |
| 9120 | 1 | L4a-R8-random-any-gem |
| 9126 | 1 | L5-C-r4-7432 |
| 9132 | 1 | R009-dragon |
| 9133 | 1 | R009-dragon |
| 9134 | 1 | R009-dragon |
| 9135 | 1 | R009-dragon |
| 9136 | 1 | R009-dragon |
| 9137 | 1 | R009-dragon |
| 9138 | 1 | P-create-interleave |
| 9139 | 1 | P-steal-to-life |
| 9140 | 1 | L1-summon-dist |
| 9142 | 2 | L1-E-kingdom-summon-raw、P-E-faction-kingdom |
| 9145 | 2 | L1-E-kingdom-summon-raw、P-E-faction-kingdom |
| 9161 | 1 | L4b-1548-steps |
| 9162 | 1 | R012 |
| 9163 | 1 | P-create-interleave |
| 9165 | 1 | L7-R1-random-chain-waves |
| 9168 | 1 | L4a-R9-giant-9168 |
| 9169 | 1 | L4a-R9-giant-9168 |
| 9170 | 1 | L4a-R9-giant-9168 |
| 9171 | 1 | L4a-R9-giant-9171 |
| 9172 | 1 | L4a-R9-giant-9171 |
| 9173 | 1 | L4a-R9-giant-9171 |
| 9174 | 1 | L4a-r4-7457 |
| 9181 | 1 | L1-E-7465-dist |
| 9184 | 2 | P-counter-per-step、P-counter-per-step |
| 9187 | 1 | L4a-R8-7470-order |
| 9190 | 1 | L7-R1-random-chain-waves |
| 9193 | 1 | L4a-R1-9193-random-explode |
| 9197 | 1 | L2-singlegem-cell |
| 9199 | 1 | P-prefnotprev-semantics |
| 9200 | 1 | L2-7483-explode-board |
| 9203 | 1 | L1-E-1551-giant-pool |
| 9205 | 3 | L1-E-kingdom-summon-raw、L1-E-kingdom-desc、P-E-faction-kingdom |
| 9207 | 1 | L1-E-race-desc |
| 9208 | 3 | L1-E-kingdom-summon-raw、L1-E-kingdom-desc、P-E-faction-kingdom |
| 9210 | 1 | L1-E-race-desc |
| 9211 | 2 | L2-1563-create-base、P-R1-count-at-native-step |
| 9212 | 2 | L2-1563-create-base、P-R1-count-at-native-step |
| 9213 | 2 | L2-1563-create-base、P-R1-count-at-native-step |
| 9214 | 2 | L2-1563-create-base、P-R1-count-at-native-step |
| 9215 | 2 | L2-1563-create-base、P-R1-count-at-native-step |
| 9216 | 2 | L2-1563-create-base、P-R1-count-at-native-step |
| 9220 | 1 | L4b-R6-B06 |
| 9221 | 1 | L4a-r3-7488 |
| 9222 | 1 | R3-B12-6999 |
| 9223 | 1 | P-steal-to-life |
| 9235 | 2 | L1-E-kingdom-summon-raw、P-E-faction-kingdom |
| 9237 | 1 | P-R1-count-at-native-step |
| 9241 | 2 | P-random-stat-pool、L2-7496-pref-not-prev |
| 9242 | 1 | L1-H-7497-book-weights |
| 9244 | 1 | L4b-7499-dragon |
| 9245 | 1 | P-E-faction-kingdom |
| 9249 | 1 | P-E-faction-kingdom |
| 9256 | 1 | L1-7510-prefnotprev |
| 9258 | 1 | R012 |
| 9260 | 1 | G-7514-order |
| 9262 | 1 | L7-R1-1571-native-gems |
| 9264 | 2 | L1-E-kingdom-summon-raw、P-E-faction-kingdom |
| 9267 | 2 | L1-E-kingdom-summon-raw、P-E-faction-kingdom |
| 9279 | 1 | L1-7515-summon-dist |
| 9280 | 2 | P-prefnotprev-semantics、R3-B12-7262 |
| 9281 | 1 | L7-7517 |
| 9282 | 1 | F3-q37 |
| 9283 | 1 | R7-tarot-extra-turn |
| 9291 | 1 | P-R3-precast-compare |
| 9292 | 1 | L4a-R8-7535-ghost-chances |
| 9297 | 1 | L4a-r3-7539 |
| 9300 | 1 | L4a-R8-1578-random-explode |
| 9302 | 1 | P-E-faction-kingdom |
| 9303 | 1 | L7-R1-weapon-colour-race |
| 9305 | 3 | L1-E-kingdom-summon-raw、L1-E-kingdom-desc、P-E-faction-kingdom |
| 9306 | 1 | L7-R1-weapon-colour-race |
| 9313 | 1 | L2-7523-one-colour |
| 9318 | 1 | L4a-r3-7543 |
| 9337 | 1 | R7-tarot-extra-turn |
| 9338 | 1 | L5-C-7553-boss |
| 9339 | 1 | L1-E-7554-dist |
| 9341 | 1 | L2-7556-gold-count |
| 9346 | 1 | L4a-R8-7561-chosen-column |
| 9349 | 2 | B-L4b-1585-entangle-gems、B-L4b-1585-entangle-gems |
| 9351 | 2 | L1-E-kingdom-summon-raw、P-E-faction-kingdom |
| 9352 | 1 | L7-R1-weapon-colour-race |
| 9354 | 1 | P-E-faction-kingdom |
| 9355 | 1 | L7-R1-weapon-colour-race |
| 9356 | 1 | L4b-R6-B04 |
| 9357 | 1 | L4b-R6-B04 |
| 9358 | 1 | L4b-R6-B04 |
| 9359 | 1 | L4b-R6-B04 |
| 9360 | 1 | L4b-R6-B04 |
| 9361 | 1 | L4b-R6-B04 |
| 9363 | 1 | F2-R001-order |
| 9367 | 1 | P-prefnotprev-semantics |
| 9370 | 1 | P-prefnotprev-semantics |
| 9371 | 3 | R012、P-R1-gargoyle-tier-filter,P-R2-gargoyle-tier,P-R4-gargoyle-tier-count,P-R3-dragon-gem-count、D-7575-zh |
| 9372 | 2 | P-prefnotprev-semantics、F2-R001-order |
| 9374 | 1 | L5-C-7900-waves |
| 9377 | 1 | P-prefnotprev-semantics |
| 9380 | 1 | L4a-R1-immortal-order |
| 9385 | 1 | R012 |
| 9387 | 1 | L4a-R1-immortal-order |
| 9388 | 1 | L4b-1608-1611-order |
| 9464 | 1 | L4a-R8-random-any-gem |
| 9465 | 1 | L4a-r3-7586 |
| 9466 | 1 | L4b-R6-B02 |
| 9468 | 1 | L5-C-r6-7589 |
| 9474 | 1 | B-L4b-7595-order |
| 9475 | 1 | B-L4b-prefnotprev |
| 9476 | 1 | P-F2-dead-target-colour |
| 9483 | 1 | P-prefnotprev-semantics |
| 9485 | 1 | P-random-stat-pool |
| 9486 | 1 | L4a-R1-immortal-order |
| 9488 | 1 | L4b-1608-1611-order |
| 9489 | 1 | L4a-R9-7623-order |
| 9492 | 1 | L1-devour-first |
| 9494 | 1 | P-R1-gargoyle-tier-filter,P-R2-gargoyle-tier,P-R4-gargoyle-tier-count,P-R3-dragon-gem-count |
| 9505 | 1 | B-L4b-1613-zh |
| 9506 | 1 | P-E-faction-kingdom |
| 9507 | 1 | L7-R1-weapon-colour-race |
| 9508 | 1 | L1-E-race-desc |
| 9509 | 3 | L1-E-kingdom-summon-raw、L1-E-kingdom-desc、P-E-faction-kingdom |
| 9512 | 1 | P-counter-per-step |
| 9513 | 1 | L3-007 |
| 9514 | 1 | P-random-stat-pool |
| 9515 | 1 | R7-dragon-convert-extra-turn |
| 9516 | 1 | R7-dragon-convert-extra-turn |
| 9517 | 1 | R7-dragon-convert-extra-turn |
| 9518 | 1 | R7-dragon-convert-extra-turn |
| 9519 | 1 | R7-dragon-convert-extra-turn |
| 9520 | 1 | R7-dragon-convert-extra-turn |
| 9521 | 1 | R7-dragon-convert-extra-turn |
| 9522 | 2 | L7-7615、P-counter-per-step |
| 9523 | 1 | L2-1620-random-bleed |
| 9524 | 1 | L2-1620-random-bleed |
| 9525 | 1 | L2-1620-random-bleed |
| 9527 | 1 | P-R1-gargoyle-tier-filter,P-R2-gargoyle-tier,P-R4-gargoyle-tier-count,P-R3-dragon-gem-count |
| 9528 | 1 | P-prefnotprev-semantics |
| 9529 | 1 | P-prefnotprev-semantics |
| 9530 | 1 | P-prefnotprev-semantics |
| 9531 | 1 | P-prefnotprev-semantics |
| 9532 | 1 | P-R1-gargoyle-tier-filter,P-R2-gargoyle-tier,P-R4-gargoyle-tier-count,P-R3-dragon-gem-count |
| 9534 | 2 | L3-007、F1-items-62-75 |
| 9538 | 1 | L4b-7634-attack |
| 9542 | 1 | L4a-R1-9542-order |
| 9547 | 2 | P-counter-per-step、P-R1-gargoyle-tier-filter,P-R2-gargoyle-tier,P-R4-gargoyle-tier-count,P-R3-dragon-gem-count |
| 9550 | 2 | R7-7646-target-colour、P-R7-dead-last-target-cond |
| 9563 | 1 | R3-B10-7650 |
| 9567 | 1 | L4a-R8-7652-storm-bonus |
| 9569 | 1 | L1-7654-devour |
| 9573 | 1 | L4b-1625-1674-any |
| 9574 | 1 | P-E-faction-kingdom |
| 9577 | 3 | L1-E-kingdom-summon-raw、L1-E-kingdom-desc、P-E-faction-kingdom |
| 9578 | 1 | L7-R1-weapon-colour-race |
| 9579 | 1 | R7-1631-counter-only-drain |
| 9580 | 1 | L3-F-doomed-ranged |
| 9581 | 1 | L3-F-doomed-ranged |
| 9582 | 1 | L3-F-doomed-ranged |
| 9583 | 1 | L3-F-doomed-ranged |
| 9584 | 1 | L3-F-doomed-ranged |
| 9585 | 1 | L3-F-doomed-ranged |
| 9588 | 1 | P-E-faction-kingdom |
| 9589 | 1 | L7-R1-random-chain-waves |
| 9591 | 1 | P-counter-per-step |
| 9593 | 2 | P-A-target-kingdom、P-E-faction-kingdom |
| 9594 | 1 | R011 |
| 9597 | 1 | P-counter-per-step |
| 9602 | 1 | F1-7674-target |
| 9613 | 1 | L3-F-7736 |
| 9615 | 1 | L1-7680-pool |
| 9616 | 1 | F3-q24 |
| 9628 | 3 | L1-E-kingdom-summon-raw、L1-E-kingdom-desc、P-E-faction-kingdom |
| 9630 | 1 | L7-R1-weapon-colour-race |
| 9632 | 1 | P-E-faction-kingdom |
| 9633 | 1 | L7-R1-weapon-colour-race |
| 9635 | 2 | L7-R1-teamsize-source、P-E-faction-kingdom |
| 9636 | 1 | L7-R1-weapon-colour-race |
| 9639 | 1 | L4a-R1-9639-block-gargoyle |
| 9640 | 2 | P-random-stat-pool、L2-H-7737-zh |
| 9641 | 1 | P-prefnotprev-semantics |
| 9642 | 1 | L4a-r3-7685 |
| 9646 | 1 | R3-B10-7688 |
| 9647 | 1 | L4b-1646-prefnotprev |
| 9648 | 1 | L4b-R6-B06 |
| 9649 | 1 | P-R1-gargoyle-tier-filter,P-R2-gargoyle-tier,P-R4-gargoyle-tier-count,P-R3-dragon-gem-count |
| 9651 | 1 | P-R3-precast-compare |
| 9659 | 2 | P-prefnotprev-semantics、L4a-R1-9659-prefnotprev |
| 9660 | 1 | R7-7691-count150-floor |
| 9661 | 2 | F3-q19、R011 |
| 9665 | 1 | L4a-R8-7704-zh-column |
| 9666 | 1 | P-chooser-native-restrictions |
| 9673 | 1 | P-counter-per-step |
| 9675 | 1 | L3-F-7714 |
| 9677 | 1 | B-L4b-prefnotprev |
| 9687 | 1 | R3-B06-1649 |
| 9688 | 1 | L7-R1-teamsize-source |
| 9689 | 1 | P-E-faction-kingdom |
| 9692 | 1 | P-E-faction-kingdom |
| 9711 | 1 | L1-7719-random |
| 9716 | 1 | F3-t7724 |
| 9719 | 1 | P-prefnotprev-semantics |
| 9721 | 2 | P-prefnotprev-semantics、F2-R001-order |
| 9722 | 1 | R3-B02-1657 |
| 9723 | 1 | F2-7728-no-damage |
| 9725 | 1 | L4a-R9-7725-zh |
| 9731 | 1 | L2-H-7746-kill-gate |
| 9733 | 1 | P-counter-per-step |
| 9739 | 1 | P-counter-per-step |
| 9749 | 1 | P-E-faction-kingdom |
| 9752 | 1 | P-E-faction-kingdom |
| 9754 | 1 | L1-E-race-desc |
| 9773 | 1 | L1-devour-first |
| 9774 | 2 | P-counter-per-step、B-L4b-7768-mix-boost |
| 9776 | 1 | P-prefnotprev-semantics |
| 9780 | 1 | L3-F-7774 |
| 9784 | 2 | L3-007、L3-F-7778 |
| 9808 | 1 | P-R3-target-status-count,P-R3-ally-status-excl-self |
| 9809 | 1 | L4a-R1-immortal-order |
| 9811 | 1 | R7-1667-drain-order |
| 9812 | 1 | L1-7793-prefnotprev |
| 9816 | 1 | L3-012 |
| 9825 | 1 | L5-C-r6-doomed-blades |
| 9826 | 1 | L5-C-r6-doomed-blades |
| 9827 | 1 | L5-C-r6-doomed-blades |
| 9828 | 1 | L5-C-r6-doomed-blades |
| 9829 | 1 | L5-C-r6-doomed-blades |
| 9830 | 1 | L5-C-r6-doomed-blades |
| 9831 | 1 | L4b-1625-1674-any |
| 9832 | 3 | L1-E-kingdom-summon-raw、L1-E-kingdom-desc、P-E-faction-kingdom |
| 9835 | 2 | L1-E-kingdom-summon-raw、P-E-faction-kingdom |
| 9838 | 1 | L1-devour-first |
| 9839 | 1 | R7-7800-prefnotprev |
| 9842 | 1 | L4b-1682-order |
| 9844 | 1 | F1-items-62-75 |
| 9846 | 1 | L2-board-chosen |
| 9847 | 2 | L3-015、L3-F-7806 |
| 9848 | 1 | G-7807-knock-order |
| 9849 | 1 | P-random-stat-pool |
| 9851 | 1 | F3-q34 |
| 9852 | 1 | P-counter-per-step |
| 9859 | 1 | L7-R1-random-chain-waves |
| 9861 | 1 | P-random-stat-pool |
| 9862 | 1 | R012 |
| 9865 | 1 | L4a-r3-7821 |
| 9869 | 1 | F1-7825-count |
| 9873 | 1 | L2-7829-heavy-splash |
| 9874 | 2 | F2-7830-heal-mult、P-prefnotprev-semantics |
| 9875 | 1 | L7-R1-teamsize-source |
| 9876 | 1 | P-E-faction-kingdom |
| 9879 | 1 | F3-q38 |
| 9880 | 1 | P-prefnotprev-semantics |
| 9882 | 4 | P-counter-per-step、L7-R1-attack-armor-life-pooled、P-counter-per-step、L7-R1-random-chain-waves |
| 9903 | 1 | L4b-R6-B03-prefnotprev |
| 9904 | 1 | L4b-R6-B02 |
| 9906 | 1 | L2-H-7847-one-colour |
| 9909 | 2 | P-random-stat-pool、L2-7850-target |
| 9911 | 1 | P-E-faction-kingdom |
| 9914 | 1 | P-E-faction-kingdom |
| 9915 | 1 | L7-R1-weapon-colour-race |
| 9916 | 1 | L1-E-race-pool-immortals |
| 9918 | 1 | P-R1-gargoyle-tier-filter,P-R2-gargoyle-tier,P-R4-gargoyle-tier-count,P-R3-dragon-gem-count |
| 9933 | 1 | P-prefnotprev-semantics |
| 9934 | 1 | L5-C-1695-lycanthropy |
| 9935 | 1 | P-prefnotprev-semantics |
| 9936 | 1 | F3-q02 |
| 9937 | 1 | P-prefnotprev-semantics |
| 9939 | 1 | B-L4b-7832-entangle-count |
| 9942 | 1 | F3-q08 |
| 9944 | 1 | L7-R1-random-chain-waves |
| 9949 | 1 | L4a-r3-7874 |
| 9952 | 1 | L4a-R1-cross-8039-9952 |
| 9957 | 1 | L3-007 |
| 9958 | 1 | L4a-R1-9958-count-order |
| 9974 | 1 | P-E-faction-kingdom |
| 9977 | 1 | P-E-faction-kingdom |
| 9982 | 1 | L5-C-7900-waves |
| 9983 | 1 | L4a-R1-immortal-order |
| 9986 | 1 | F3-q22 |
| 10003 | 1 | F1-doomed-random-skill |
| 10005 | 1 | F1-doomed-random-skill |
| 10006 | 1 | F1-doomed-random-skill |
| 10008 | 1 | F1-doomed-random-skill |
| 10045 | 1 | B-L4b-prefnotprev |
| 10047 | 1 | P-E-faction-kingdom |
| 10048 | 1 | L7-R1-weapon-colour-race |
| 10050 | 1 | P-E-faction-kingdom |
| 10061 | 1 |  |
| 10063 | 1 | F3-q30 |
