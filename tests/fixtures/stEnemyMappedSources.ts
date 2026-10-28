/**
 * ST-04 source expectations for seven mapped, not accepted enemies.
 * Static literals only; no compiler, registry, source imports or test execution.
 * sourceTroop/sourceTraits/progression/portrait preserve complete source JSON rows.
 * stats precede battle-start passives: base + raw growth[0..level-1], then
 * Math.round(value * difficulty), hp >= 1. Auras and Fast are excluded.
 * portraitSha256 hashes actual game-assets/public portrait bytes.
 * segments freeze the registered native prototype; rawSource retains the original
 * contract. Treant curated destroy is normalized to registered remove by gowRemoveRules.
 * nativeCases marks template titles explicitly. A named assertion is evidence
 * only for its actual checks; neither mapping nor fixture grants acceptance.
 */

export const MAPPED_SOURCES = [
  {
    "enemyId": 6016,
    "referenceName": "CentaurScout",
    "sourceTroop": {
      "id": 6016,
      "name": "人马斥候",
      "referenceName": "CentaurScout",
      "rarity": "Common",
      "rarityIdx": 0,
      "kingdom": "卜筮之原",
      "kingdomId": 3028,
      "troopTypes": [
        "Centaur"
      ],
      "role": "Striker",
      "attack": 10,
      "armor": 9,
      "health": 19,
      "magic": 12,
      "base": {
        "attack": 2,
        "armor": 1,
        "health": 4,
        "magic": 1
      },
      "manaColors": [
        "Yellow"
      ],
      "manaCost": 7,
      "spell": {
        "id": 7016,
        "name": "一马当先",
        "description": "摧毁 1 行，并对第 1 名敌人造成 [魔法 + 1] 点伤害。",
        "meta": {
          "scalings": [
            {
              "base": 1,
              "mult": 1
            }
          ],
          "raw": "摧毁 1 行，并对第 1 名敌人造成 [魔法 + 1] 点伤害。",
          "parsed": true
        }
      },
      "traits": [
        {
          "code": "airspirit",
          "name": "空气之灵",
          "description": "每有一名黄色盟友则获得 1 点魔力值。"
        },
        {
          "code": "agile",
          "name": "敏捷",
          "description": "有 20% 的几率闪避骷髅头伤害。"
        },
        {
          "code": "fast",
          "name": "快速",
          "description": "战斗开始时获得 50% 法力值。"
        }
      ],
      "portrait": "Troop_K04_00"
    },
    "sourceTraits": [
      {
        "code": "airspirit",
        "name": "空气之灵",
        "description": "每有一名黄色盟友则获得 1 点魔力值。",
        "troops": 16,
        "perAllyColor": {
          "color": "Yellow",
          "stat": "magic",
          "amount": 1
        }
      },
      {
        "code": "agile",
        "name": "敏捷",
        "description": "有 20% 的几率闪避骷髅头伤害。",
        "troops": 110,
        "dodgeChance": 0.2
      },
      {
        "code": "fast",
        "name": "快速",
        "description": "战斗开始时获得 50% 法力值。",
        "troops": 68,
        "battleStartManaRatio": 0.5
      }
    ],
    "progression": {
      "growth": {
        "health": [
          0,
          0,
          1,
          0,
          1,
          0,
          1,
          0,
          0,
          1,
          1,
          0,
          0,
          1,
          1,
          1,
          2,
          1,
          2,
          2
        ],
        "armor": [
          0,
          0,
          0,
          1,
          0,
          0,
          0,
          1,
          0,
          1,
          0,
          1,
          0,
          0,
          0,
          0,
          1,
          1,
          1,
          1
        ],
        "attack": [
          0,
          1,
          0,
          0,
          0,
          1,
          0,
          0,
          1,
          0,
          0,
          0,
          1,
          0,
          0,
          0,
          1,
          1,
          1,
          1
        ],
        "magic": [
          0,
          0,
          1,
          0,
          0,
          1,
          0,
          0,
          0,
          1,
          0,
          1,
          0,
          0,
          1,
          1,
          1,
          1,
          1,
          2
        ]
      },
      "traits": [
        {
          "minor:yellow": 10,
          "major:yellow": 4
        },
        {
          "minor:yellow": 14,
          "major:yellow": 4,
          "runic:yellow": 4
        },
        {
          "minor:yellow": 18,
          "major:yellow": 4,
          "arcane:yellow:yellow": 1
        }
      ]
    },
    "portrait": {
      "assetId": "Troop_K04_00",
      "troopId": 6016,
      "manaColors": [
        "Yellow"
      ],
      "rank": "杂兵",
      "form": "怪物",
      "role": "Striker",
      "portraitUrl": "/static/portraits/Troop_K04_00.webp",
      "review": "thumbnail-reviewed",
      "contentHash": "c1f32f6775a848d5b5295486b65821f908f4dbaed1ccab1e7ed111e3591a43c5"
    },
    "portraitSha256": "c1f32f6775a848d5b5295486b65821f908f4dbaed1ccab1e7ed111e3591a43c5",
    "stats": {
      "1@1": {
        "hp": 4,
        "armor": 1,
        "attack": 2,
        "magic": 1
      },
      "20@1": {
        "hp": 19,
        "armor": 9,
        "attack": 10,
        "magic": 12
      },
      "20@1.5": {
        "hp": 29,
        "armor": 14,
        "attack": 15,
        "magic": 18
      },
      "7@1.3": {
        "hp": 9,
        "armor": 3,
        "attack": 5,
        "magic": 4
      }
    },
    "segments": [
      {
        "kind": "gem",
        "params": {
          "op": "clear",
          "mode": "destroy",
          "target": {
            "kind": "chosenLine",
            "orientation": "row"
          }
        }
      },
      {
        "kind": "damage",
        "target": "enemyFront",
        "scaling": {
          "base": 1,
          "mult": 1
        }
      }
    ],
    "rawSource": {
      "englishSpell": {
        "name": "Charge",
        "desc": "Destroy a row, and deal [Magic + 1] damage to the first Enemy.",
        "id": 7016
      },
      "nativeSpell": {
        "Id": 7016,
        "Cost": 7,
        "Target": "Board",
        "SpellSteps": [
          {
            "Amount": 1,
            "BoardTarget": "Row",
            "Type": "DestroyGems"
          },
          {
            "SpellPowerMultiplier": 1,
            "Target": "FrontEnemy",
            "Amount": 1,
            "Primarypower": true,
            "Type": "Damage"
          }
        ]
      },
      "traits": [
        {
          "code": "airspirit",
          "englishDescription": "Gain 1 Magic for each Yellow ally.",
          "native": {
            "Activation": "start_battle",
            "Code": "airspirit",
            "Description": "[TRAIT_AIRSPIRIT_DESC]",
            "Filter": "3",
            "Image": "airspirit",
            "Modifier": 1,
            "Name": "[TRAIT_AIRSPIRIT]",
            "TraitType": "adjust_magic_per_ally",
            "Trigger": "none"
          }
        },
        {
          "code": "agile",
          "englishDescription": "20% chance to dodge Skull damage.",
          "native": {
            "Activation": "on_skull_attacked",
            "Code": "agile",
            "Description": "[TRAIT_AGILE_DESC]",
            "Image": "agile",
            "Modifier": 0.2,
            "Name": "[TRAIT_AGILE]",
            "TraitType": "dodge",
            "Trigger": "self"
          }
        },
        {
          "code": "fast",
          "englishDescription": "Start battles with 50% Mana.",
          "native": {
            "Activation": "start_battle",
            "Code": "fast",
            "Description": "[TRAIT_FAST_DESC]",
            "Image": "fast",
            "Modifier": 0.5,
            "Name": "[TRAIT_FAST]",
            "TraitType": "set_mana_percentage",
            "Trigger": "none"
          }
        }
      ]
    },
    "nativeEvidence": [
      {
        "testFile": "tests/unit/gowCentaurScoutChargeAudit.test.ts",
        "fullName": "Centaur Scout 6016 / Charge 7016 per-entity original spell audit English, native, historical official, registry and display agree",
        "clausesCovered": [
          "row destruction followed by first-living-enemy Magic+1 damage",
          "source cost, colors and registered native prototype"
        ],
        "limits": [
          "Native source/prototype evidence. This assertion does not execute an ST blueprint or prove all native trait triggers."
        ]
      },
      {
        "testFile": "tests/unit/gowCentaurScoutChargeAudit.test.ts",
        "fullName": "Centaur Scout 6016 / Charge 7016 per-entity original spell audit Web suppresses only Magic scaling; fixed +1 still hits",
        "clausesCovered": [
          "specific native battle boundary: Web suppresses only Magic scaling; fixed +1 still hits"
        ],
        "limits": [
          "One named boundary only; additional parameterized native cases remain in this suite. ST mapping and whole-enemy acceptance remain separate."
        ]
      }
    ],
    "nativeCases": [
      {
        "testFile": "tests/unit/gowCentaurScoutChargeAudit.test.ts",
        "line": 29,
        "fullName": "Centaur Scout 6016 / Charge 7016 per-entity original spell audit English, native, historical official, registry and display agree"
      },
      {
        "testFile": "tests/unit/gowCentaurScoutChargeAudit.test.ts",
        "line": 47,
        "fullNameTemplate": "Centaur Scout 6016 / Charge 7016 per-entity original spell audit ${side}: destroys selected row ${row} then damages only front enemy"
      },
      {
        "testFile": "tests/unit/gowCentaurScoutChargeAudit.test.ts",
        "line": 61,
        "fullNameTemplate": "Centaur Scout 6016 / Charge 7016 per-entity original spell audit Magic=${magic}: exact 1+Magic damage, no row-derived boost"
      },
      {
        "testFile": "tests/unit/gowCentaurScoutChargeAudit.test.ts",
        "line": 65,
        "fullName": "Centaur Scout 6016 / Charge 7016 per-entity original spell audit front defeated before cast: next living enemy is hit, later positions unaffected"
      },
      {
        "testFile": "tests/unit/gowCentaurScoutChargeAudit.test.ts",
        "line": 69,
        "fullName": "Centaur Scout 6016 / Charge 7016 per-entity original spell audit Web suppresses only Magic scaling; fixed +1 still hits"
      },
      {
        "testFile": "tests/unit/gowCentaurScoutChargeAudit.test.ts",
        "line": 73,
        "fullName": "Centaur Scout 6016 / Charge 7016 per-entity original spell audit Barrier absorbs fixed hit after row destroy"
      },
      {
        "testFile": "tests/unit/gowCentaurScoutChargeAudit.test.ts",
        "line": 79,
        "fullName": "Centaur Scout 6016 / Charge 7016 per-entity original spell audit lethal damage after row destroy hits and defeats only front enemy"
      },
      {
        "testFile": "tests/unit/gowCentaurScoutChargeAudit.test.ts",
        "line": 85,
        "fullNameTemplate": "Centaur Scout 6016 / Charge 7016 per-entity original spell audit ${mode}: no row destroy, mana spent, or action"
      }
    ],
    "remainingStObligations": [
      "source portrait, rarity and complete ordinary traits",
      "ST context, identity and source affinities",
      "multi-level and difficulty panel scaling",
      "actual assembled cast including required target/color/board choice",
      "trait-plus-active interaction and family boundaries",
      "descriptions and tactical role",
      "save/reopen deterministic continuation",
      "invalid-action atomicity",
      "independent per-source review"
    ],
    "reviewState": "mapped-not-accepted",
    "sourceRefs": [
      "src/data/troops.json#6016",
      "src/data/troop-progression.json#6016",
      "data/raw/troops.gow.en.json#troops[Id=6016]",
      "data/raw/spells.gow.en.json#spells[Id=7016]",
      "src/data/traits.json#airspirit",
      "src/data/traits.json#agile",
      "src/data/traits.json#fast",
      "src/sillytavern/data/portraits.json#entries[troopId=6016]",
      "game-assets/public/static/portraits/Troop_K04_00.webp",
      "src/engine/skills/curated/batch-01.ts#7016",
      "data/raw/gow-2026-09-18/traits.en.json#traits[RawData.Code=airspirit]",
      "data/raw/gow-2026-09-18/traits.en.json#traits[RawData.Code=agile]",
      "data/raw/gow-2026-09-18/traits.en.json#traits[RawData.Code=fast]"
    ],
    "activeExpected": {
      "spellId": 7016,
      "requiredChoice": "cell",
      "target": "first-living-enemy-after-row-destruction",
      "formula": "damage = effectiveMagic + 1",
      "parameters": {
        "rowWidth": 8,
        "base": 1,
        "magicMultiplier": 1
      },
      "examples": [
        {
          "magic": 11,
          "expectedDamage": 12
        },
        {
          "magic": 25,
          "web": true,
          "expectedDamage": 1
        }
      ]
    },
    "nativeCaseMatrix": {
      "sides": [
        "Left",
        "Right"
      ],
      "rows": [
        0,
        2,
        4,
        7
      ],
      "magic": [
        0,
        1,
        11,
        25
      ],
      "blocked": [
        "low-mana",
        "silence"
      ]
    },
    "traitNativeEvidence": [
      {
        "testFile": "tests/unit/traits.test.ts",
        "line": 771,
        "fullName": "回合开始与战斗开始特质 水系之心按蓝色盟友数量叠加生命",
        "scope": "native-family",
        "clausesCovered": [
          "Water Heart counts allied Blue characters including self; hp/maxHp +2; other ally unchanged"
        ],
        "limits": [
          "Exact Water Heart execution. Air Spirit, Nature Heart and Fire Spirit reuse is family-level evidence only."
        ]
      },
      {
        "testFile": "tests/unit/traits.test.ts",
        "line": 264,
        "fullName": "闪避与反弹特质 敏捷：判定命中时攻击落空，reason=dodge，且不触发受击/命中类特质",
        "scope": "exact-native-trait",
        "clausesCovered": [
          "Agile RNG 0.1 dodges skull hit and suppresses Frenzy/Venomous"
        ],
        "limits": [
          "No exact RNG=0.2 threshold or spell bypass assertion."
        ]
      },
      {
        "testFile": "tests/unit/traits.test.ts",
        "line": 814,
        "fullName": "回合开始与战斗开始特质 快速 / 赐能在 TurnEngine 构造时结算开局法力",
        "scope": "exact-native-trait",
        "clausesCovered": [
          "Fast initializes mana 5/10 in TurnEngine constructor; plain mana 0/10"
        ],
        "limits": [
          "Does not test odd cost 7 rounding or startup idempotence on ST reopen."
        ]
      }
    ],
    "recommendedStCases": [
      {
        "id": "row-and-front",
        "setup": "Right 6016, row 7, defeated front enemy, controlled refill colors",
        "expected": "Destroy exactly 8 original row cells before Magic+1 hits only the next living enemy; final mana reflects 7 spent plus actual Yellow refill."
      },
      {
        "id": "air-spirit-fast-reopen",
        "setup": "One/two living Yellow allies and a non-Yellow control, fresh battle then reopen",
        "expected": "Air Spirit gives holder +1 Magic per Yellow ally including self; Fast starts floor(7*0.5)=3; reopen repeats neither; Charge uses post-aura Magic."
      },
      {
        "id": "dodge-boundary",
        "setup": "Assembled Agile, skull RNG just below/at 0.2 and a spell hit",
        "expected": "Verify exact dodge threshold and that spells bypass skull dodge, with unchanged seeded continuation after reopen."
      }
    ],
    "remainingGaps": [
      "Charge suite uses generic damageFixture actors without source traits; Air Spirit plus active and source-specific Agile/Fast assembly remain unproved.",
      "Generic Fast test uses even cost 10; cost 7 floor-to-3 and reopen idempotence need explicit coverage.",
      "Blocked native tests check events/mana/actionLog, not full board/RNG/status state; cell cancellation and out-of-range choices are absent."
    ]
  },
  {
    "enemyId": 6026,
    "referenceName": "Owlbear",
    "sourceTroop": {
      "id": 6026,
      "name": "枭熊",
      "referenceName": "Owlbear",
      "rarity": "Uncommon",
      "rarityIdx": 1,
      "kingdom": "荆棘森林",
      "kingdomId": 3015,
      "troopTypes": [
        "Beast",
        "Monster"
      ],
      "role": "Striker",
      "attack": 11,
      "armor": 10,
      "health": 24,
      "magic": 12,
      "base": {
        "attack": 3,
        "armor": 1,
        "health": 5,
        "magic": 1
      },
      "manaColors": [
        "Green",
        "Brown"
      ],
      "manaCost": 10,
      "spell": {
        "id": 7026,
        "name": "刺耳尖叫",
        "description": "对一名敌人造成 [魔法 + 3] 点伤害，并减除其 2 点攻击力",
        "meta": {
          "scalings": [
            {
              "base": 3,
              "mult": 1
            }
          ],
          "raw": "对一名敌人造成 [魔法 + 3] 点伤害，并减除其 2 点攻击力",
          "parsed": true
        }
      },
      "traits": [
        {
          "code": "beastbond",
          "name": "野兽族亲",
          "description": "野兽盟友获得 2 点生命值。"
        },
        {
          "code": "frenzy",
          "name": "狂暴",
          "description": "在受到攻击时获得 1 点攻击力。"
        },
        {
          "code": "regeneration",
          "name": "再生",
          "description": "在每回合开始时恢复 1 点生命值。"
        }
      ],
      "portrait": "Troop_K06_02"
    },
    "sourceTraits": [
      {
        "code": "beastbond",
        "name": "野兽族亲",
        "description": "野兽盟友获得 2 点生命值。",
        "troops": 45,
        "typeAura": {
          "troopType": "Beast",
          "stat": "hp",
          "amount": 2
        }
      },
      {
        "code": "frenzy",
        "name": "狂暴",
        "description": "在受到攻击时获得 1 点攻击力。",
        "troops": 38,
        "onDamagedGain": {
          "stat": "attack",
          "amount": 1
        }
      },
      {
        "code": "regeneration",
        "name": "再生",
        "description": "在每回合开始时恢复 1 点生命值。",
        "troops": 45,
        "regen": {
          "stat": "hp",
          "amount": 1
        }
      }
    ],
    "progression": {
      "growth": {
        "health": [
          0,
          1,
          0,
          1,
          0,
          1,
          0,
          1,
          0,
          1,
          1,
          1,
          0,
          1,
          1,
          2,
          2,
          2,
          2,
          2
        ],
        "armor": [
          0,
          0,
          1,
          0,
          0,
          0,
          1,
          0,
          1,
          0,
          1,
          0,
          1,
          0,
          0,
          0,
          1,
          1,
          1,
          1
        ],
        "attack": [
          0,
          0,
          0,
          0,
          1,
          0,
          0,
          0,
          0,
          1,
          0,
          0,
          0,
          1,
          0,
          1,
          1,
          1,
          1,
          1
        ],
        "magic": [
          0,
          0,
          0,
          1,
          0,
          0,
          1,
          0,
          0,
          1,
          0,
          0,
          1,
          0,
          1,
          1,
          1,
          1,
          1,
          2
        ]
      },
      "traits": [
        {
          "minor:green": 12,
          "major:green": 4,
          "major:brown": 4
        },
        {
          "minor:green": 16,
          "runic:green": 4,
          "runic:brown": 4
        },
        {
          "minor:green": 20,
          "major:green": 6,
          "arcane:green:brown": 2
        }
      ]
    },
    "portrait": {
      "assetId": "Troop_K06_02",
      "troopId": 6026,
      "manaColors": [
        "Green",
        "Brown"
      ],
      "rank": "杂兵",
      "form": "类人",
      "role": "Striker",
      "portraitUrl": "/static/portraits/Troop_K06_02.webp",
      "review": "thumbnail-reviewed",
      "contentHash": "674bba0df28fb9309c6ed5499d3b2e69e32a57bd31e02d7afe6f72879b566b26"
    },
    "portraitSha256": "674bba0df28fb9309c6ed5499d3b2e69e32a57bd31e02d7afe6f72879b566b26",
    "stats": {
      "1@1": {
        "hp": 5,
        "armor": 1,
        "attack": 3,
        "magic": 1
      },
      "20@1": {
        "hp": 24,
        "armor": 10,
        "attack": 11,
        "magic": 12
      },
      "20@1.5": {
        "hp": 36,
        "armor": 15,
        "attack": 17,
        "magic": 18
      },
      "7@1.3": {
        "hp": 10,
        "armor": 4,
        "attack": 5,
        "magic": 4
      }
    },
    "segments": [
      {
        "kind": "damage",
        "target": "enemyChosen",
        "scaling": {
          "base": 3,
          "mult": 1
        }
      },
      {
        "kind": "reduce",
        "target": "enemyChosen",
        "stat": "attack",
        "scaling": {
          "base": 2,
          "mult": 0
        }
      }
    ],
    "rawSource": {
      "englishSpell": {
        "name": "Screech",
        "desc": "Deal [Magic + 3] damage to an Enemy, and eliminate 2 Attack from them.",
        "id": 7026
      },
      "nativeSpell": {
        "Id": 7026,
        "Cost": 10,
        "Target": "Enemy",
        "SpellSteps": [
          {
            "SpellPowerMultiplier": 1,
            "Target": "FromTarget",
            "Amount": 3,
            "Primarypower": true,
            "Type": "Damage"
          },
          {
            "Target": "FromTarget",
            "Amount": 2,
            "Type": "DecreaseAttack"
          }
        ]
      },
      "traits": [
        {
          "code": "beastbond",
          "englishDescription": "Allied Beasts gain 2 Life.",
          "native": {
            "Activation": "start_battle",
            "Code": "beastbond",
            "Description": "[TRAIT_BEASTBOND_DESC]",
            "Filter": "beast",
            "Image": "beastbond",
            "Modifier": 2,
            "Name": "[TRAIT_BEASTBOND]",
            "TraitType": "adjust_allies_life",
            "Trigger": "none"
          }
        },
        {
          "code": "frenzy",
          "englishDescription": "Gain 1 Attack when taking damage.",
          "native": {
            "Activation": "damage_received",
            "Code": "frenzy",
            "Description": "[TRAIT_FRENZY_DESC]",
            "Image": "frenzy",
            "Modifier": 1,
            "Name": "[TRAIT_FRENZY]",
            "TraitType": "adjust_attack",
            "Trigger": "self"
          }
        },
        {
          "code": "regeneration",
          "englishDescription": "Recover 1 Life at the start of each turn.",
          "native": {
            "Activation": "start_turn",
            "Code": "regeneration",
            "Description": "[TRAIT_REGENERATION_DESC]",
            "Image": "regeneration",
            "Modifier": 1,
            "Name": "[TRAIT_REGENERATION]",
            "TraitType": "adjust_life_limited",
            "Trigger": "self_player"
          }
        }
      ]
    },
    "nativeEvidence": [
      {
        "testFile": "tests/unit/gowOwlbearScreechAudit.test.ts",
        "fullName": "Owlbear 6026 / Screech 7026 whole-spell source and battle review English, two native steps, registered prototype, binding and display match",
        "clausesCovered": [
          "chosen-enemy Magic+3 damage followed by independent Attack -2",
          "source cost, colors and registered native prototype"
        ],
        "limits": [
          "Native source/prototype evidence. This assertion does not execute an ST blueprint or prove all native trait triggers."
        ]
      },
      {
        "testFile": "tests/unit/gowOwlbearScreechAudit.test.ts",
        "fullName": "Owlbear 6026 / Screech 7026 whole-spell source and battle review Barrier prevents the damage but not the later, independent Attack reduction",
        "clausesCovered": [
          "specific native battle boundary: Barrier prevents the damage but not the later, independent Attack reduction"
        ],
        "limits": [
          "One named boundary only; additional parameterized native cases remain in this suite. ST mapping and whole-enemy acceptance remain separate."
        ]
      }
    ],
    "nativeCases": [
      {
        "testFile": "tests/unit/gowOwlbearScreechAudit.test.ts",
        "line": 34,
        "fullName": "Owlbear 6026 / Screech 7026 whole-spell source and battle review English, two native steps, registered prototype, binding and display match"
      },
      {
        "testFile": "tests/unit/gowOwlbearScreechAudit.test.ts",
        "line": 53,
        "fullNameTemplate": "Owlbear 6026 / Screech 7026 whole-spell source and battle review ${side}: selected enemy ${chosen} alone receives damage then two Attack reduction"
      },
      {
        "testFile": "tests/unit/gowOwlbearScreechAudit.test.ts",
        "line": 65,
        "fullNameTemplate": "Owlbear 6026 / Screech 7026 whole-spell source and battle review Magic=${magic}, enemy Attack=${attack}: full scaling and reduction floors at zero"
      },
      {
        "testFile": "tests/unit/gowOwlbearScreechAudit.test.ts",
        "line": 71,
        "fullName": "Owlbear 6026 / Screech 7026 whole-spell source and battle review Web removes the [Magic] contribution but leaves fixed +3 damage and -2 Attack"
      },
      {
        "testFile": "tests/unit/gowOwlbearScreechAudit.test.ts",
        "line": 76,
        "fullName": "Owlbear 6026 / Screech 7026 whole-spell source and battle review Barrier prevents the damage but not the later, independent Attack reduction"
      },
      {
        "testFile": "tests/unit/gowOwlbearScreechAudit.test.ts",
        "line": 81,
        "fullName": "Owlbear 6026 / Screech 7026 whole-spell source and battle review lethal first step defeats the selected enemy; no replacement target gets its two Attack reduction"
      },
      {
        "testFile": "tests/unit/gowOwlbearScreechAudit.test.ts",
        "line": 88,
        "fullNameExpression": "Owlbear 6026 / Screech 7026 whole-spell source and battle review reason+' leaves board and mana unchanged; no cast or turn'"
      }
    ],
    "remainingStObligations": [
      "source portrait, rarity and complete ordinary traits",
      "ST context, identity and source affinities",
      "multi-level and difficulty panel scaling",
      "actual assembled cast including required target/color/board choice",
      "trait-plus-active interaction and family boundaries",
      "descriptions and tactical role",
      "save/reopen deterministic continuation",
      "invalid-action atomicity",
      "independent per-source review"
    ],
    "reviewState": "mapped-not-accepted",
    "sourceRefs": [
      "src/data/troops.json#6026",
      "src/data/troop-progression.json#6026",
      "data/raw/troops.gow.en.json#troops[Id=6026]",
      "data/raw/spells.gow.en.json#spells[Id=7026]",
      "src/data/traits.json#beastbond",
      "src/data/traits.json#frenzy",
      "src/data/traits.json#regeneration",
      "src/sillytavern/data/portraits.json#entries[troopId=6026]",
      "game-assets/public/static/portraits/Troop_K06_02.webp",
      "src/engine/skills/curated/batch-01.ts#7026",
      "data/raw/gow-2026-09-18/traits.en.json#traits[RawData.Code=beastbond]",
      "data/raw/gow-2026-09-18/traits.en.json#traits[RawData.Code=frenzy]",
      "data/raw/gow-2026-09-18/traits.en.json#traits[RawData.Code=regeneration]"
    ],
    "activeExpected": {
      "spellId": 7026,
      "requiredChoice": "enemy",
      "target": "same-chosen-living-enemy-for-both-steps",
      "formula": "damage = effectiveMagic + 3; attack = max(0, oldAttack - 2)",
      "parameters": {
        "damageBase": 3,
        "magicMultiplier": 1,
        "attackReduction": 2,
        "attackFloor": 0
      },
      "examples": [
        {
          "magic": 11,
          "targetArmor": 5,
          "targetHp": 1000,
          "targetAttack": 17,
          "expectedDamage": 14,
          "expectedHp": 991,
          "expectedAttack": 15
        },
        {
          "magic": 21,
          "web": true,
          "expectedDamage": 3
        },
        {
          "barrier": true,
          "expectedDamage": 0,
          "expectedAttackReduction": 2
        }
      ]
    },
    "nativeCaseMatrix": {
      "sides": [
        "Left",
        "Right"
      ],
      "targetIds": [
        10,
        11,
        12,
        13
      ],
      "magic": [
        0,
        1,
        25
      ],
      "targetAttack": [
        0,
        1,
        2,
        9
      ],
      "blocked": [
        "low-mana",
        "silence",
        "cancel-invalid-id-999"
      ]
    },
    "traitNativeEvidence": [
      {
        "testFile": "tests/unit/traits.test.ts",
        "line": 741,
        "fullName": "回合开始与战斗开始特质 骑士族亲只给同队骑士 +2 生命，不影响其它种族与敌方骑士",
        "scope": "native-family",
        "clausesCovered": [
          "Knight Bond +2 hp includes holder and same-team Knights; excludes Beast and opposing Knight"
        ],
        "limits": [
          "Beast Bond and Wildfolk Bond exact source affiliation remain ST obligations."
        ]
      },
      {
        "testFile": "tests/unit/traits.test.ts",
        "line": 225,
        "fullName": "受击 / 命中触发特质 狂暴：受到骷髅伤害后攻击力 +1",
        "scope": "exact-native-trait",
        "clausesCovered": [
          "Frenzy gains exactly +1 Attack after skull damage"
        ],
        "limits": [
          "Does not establish spell-hit, zero-damage, Barrier or lethal branches."
        ]
      },
      {
        "testFile": "tests/unit/traits.test.ts",
        "line": 669,
        "fullName": "回合开始与战斗开始特质 再生每回合恢复 1 点，不超过上限",
        "scope": "exact-native-trait",
        "clausesCovered": [
          "Regeneration heals 1 to cap; no event at full hp"
        ],
        "limits": [
          "Pure helper; assembled turn-start ordering remains separate."
        ]
      }
    ],
    "recommendedStCases": [
      {
        "id": "barrier-reduction-floor",
        "setup": "Right Owlbear chooses barrier-protected non-front enemy with Attack 1",
        "expected": "Barrier consumes damage; independent Attack -2 still floors to 0; other enemies unchanged."
      },
      {
        "id": "lethal-no-retarget",
        "setup": "Chosen enemy at 1 hp, another living enemy behind it",
        "expected": "After lethal first segment, Attack -2 does not transfer to a replacement target."
      },
      {
        "id": "bond-frenzy-regeneration",
        "setup": "Allied Beast and Monster-only controls, opposing Beast, wounded Owlbear; damage/turn start before and after reopen",
        "expected": "Beast Bond +2 hp only for same-team Beast including self; actual damage Frenzy +1 Attack; start-turn regeneration +1 to cap; verify no-damage exclusions."
      }
    ],
    "remainingGaps": [
      "Screech suite equips none of Beast Bond/Frenzy/Regeneration. Knight Bond family evidence does not prove Beast affiliation remapping.",
      "Frenzy skull reference does not establish spell, Barrier, zero-damage or lethal behavior on assembled Owlbear.",
      "Cancel selects invalid id 999; allied/defeated targets remain untested. Atomicity checks only board cell 0,0 and RNG, not the full session."
    ]
  },
  {
    "enemyId": 6027,
    "referenceName": "Treant",
    "sourceTroop": {
      "id": 6027,
      "name": "树精",
      "referenceName": "Treant",
      "rarity": "Rare",
      "rarityIdx": 2,
      "kingdom": "荆棘森林",
      "kingdomId": 3015,
      "troopTypes": [
        "Fey",
        "Elemental"
      ],
      "role": "Defender",
      "attack": 15,
      "armor": 15,
      "health": 18,
      "magic": 6,
      "base": {
        "attack": 3,
        "armor": 3,
        "health": 4,
        "magic": 1
      },
      "manaColors": [
        "Blue",
        "Green"
      ],
      "manaCost": 12,
      "spell": {
        "id": 7027,
        "name": "粗糙树皮",
        "description": "获得 [魔法] 点攻击力和护甲值，并移除所有棕色宝石以增强效果。 [4:1]",
        "meta": {
          "scalings": [
            {
              "base": 0,
              "mult": 1
            }
          ],
          "raw": "获得 [魔法] 点攻击力和护甲值，并移除所有棕色宝石以增强效果。 [4:1]",
          "parsed": true,
          "modifier": {
            "kind": "ratio",
            "a": 4,
            "b": 1
          }
        }
      },
      "traits": [
        {
          "code": "natureheart",
          "name": "自然之心",
          "description": "每有一名绿色盟友则获得 1 点生命值。"
        },
        {
          "code": "big",
          "name": "庞然",
          "description": "在配对 4 或 5 颗宝石时，获得 1 点生命值。"
        },
        {
          "code": "stoneskin",
          "name": "铁壁铜墙",
          "description": "降低来自骷髅头的伤害 50%。"
        }
      ],
      "portrait": "Troop_K06_03"
    },
    "sourceTraits": [
      {
        "code": "natureheart",
        "name": "自然之心",
        "description": "每有一名绿色盟友则获得 1 点生命值。",
        "troops": 21,
        "perAllyColor": {
          "color": "Green",
          "stat": "hp",
          "amount": 1
        }
      },
      {
        "code": "big",
        "name": "庞然",
        "description": "在配对 4 或 5 颗宝石时，获得 1 点生命值。",
        "troops": 55,
        "onBigMatchGain": {
          "stat": "hp",
          "amount": 1
        }
      },
      {
        "code": "stoneskin",
        "name": "铁壁铜墙",
        "description": "降低来自骷髅头的伤害 50%。",
        "troops": 148,
        "skullDamageReduction": 0.5
      }
    ],
    "progression": {
      "growth": {
        "health": [
          0,
          1,
          0,
          1,
          0,
          0,
          0,
          1,
          0,
          1,
          1,
          0,
          1,
          0,
          0,
          1,
          2,
          1,
          2,
          2
        ],
        "armor": [
          0,
          1,
          0,
          0,
          0,
          1,
          0,
          0,
          0,
          1,
          0,
          1,
          0,
          0,
          1,
          1,
          1,
          2,
          1,
          2
        ],
        "attack": [
          0,
          0,
          1,
          0,
          1,
          0,
          1,
          0,
          1,
          0,
          0,
          0,
          0,
          1,
          0,
          1,
          1,
          2,
          1,
          2
        ],
        "magic": [
          0,
          0,
          0,
          0,
          0,
          1,
          0,
          0,
          0,
          1,
          0,
          0,
          0,
          0,
          1,
          0,
          0,
          1,
          0,
          1
        ]
      },
      "traits": [
        {
          "minor:green": 14,
          "major:green": 6,
          "major:blue": 6
        },
        {
          "minor:green": 20,
          "runic:green": 6,
          "runic:blue": 6
        },
        {
          "minor:green": 26,
          "major:green": 8,
          "arcane:blue:green": 3
        }
      ]
    },
    "portrait": {
      "assetId": "Troop_K06_03",
      "troopId": 6027,
      "manaColors": [
        "Blue",
        "Green"
      ],
      "rank": "精锐",
      "form": "类人",
      "role": "Defender",
      "portraitUrl": "/static/portraits/Troop_K06_03.webp",
      "review": "thumbnail-reviewed",
      "contentHash": "68c0c3e7c634979ee17c346d39c8ba696a57954648cc3605d93802a528f85917"
    },
    "portraitSha256": "68c0c3e7c634979ee17c346d39c8ba696a57954648cc3605d93802a528f85917",
    "stats": {
      "1@1": {
        "hp": 4,
        "armor": 3,
        "attack": 3,
        "magic": 1
      },
      "20@1": {
        "hp": 18,
        "armor": 15,
        "attack": 15,
        "magic": 6
      },
      "20@1.5": {
        "hp": 27,
        "armor": 23,
        "attack": 23,
        "magic": 9
      },
      "7@1.3": {
        "hp": 8,
        "armor": 7,
        "attack": 8,
        "magic": 3
      }
    },
    "segments": [
      {
        "kind": "gem",
        "params": {
          "op": "clear",
          "mode": "remove",
          "target": {
            "kind": "color",
            "color": "Brown"
          }
        }
      },
      {
        "kind": "buff",
        "target": "allySelf",
        "stat": "armor",
        "scaling": {
          "base": 0,
          "mult": 1
        },
        "modifier": {
          "mod": {
            "kind": "ratio",
            "a": 4,
            "b": 1
          },
          "source": {
            "kind": "destroyedGems",
            "color": "Brown"
          }
        }
      },
      {
        "kind": "buff",
        "target": "allySelf",
        "stat": "attack",
        "scaling": {
          "base": 0,
          "mult": 1
        },
        "modifier": {
          "mod": {
            "kind": "ratio",
            "a": 4,
            "b": 1
          },
          "source": {
            "kind": "destroyedGems",
            "color": "Brown"
          }
        }
      }
    ],
    "rawSource": {
      "englishSpell": {
        "name": "Barkskin",
        "desc": "Remove all Brown Gems. Gain [Magic] Attack and Armor, boosted by Gems removed. [4:1]",
        "id": 7027
      },
      "nativeSpell": {
        "Id": 7027,
        "Cost": 12,
        "Target": "None",
        "SpellSteps": [
          {
            "Color1": "Brown",
            "Amount": 25,
            "Type": "CountGems"
          },
          {
            "Color1": "Brown",
            "Amount": 100,
            "Type": "RemoveColor"
          },
          {
            "SpellPowerMultiplier": 1,
            "Target": "Self",
            "UseCounterForAmount": true,
            "Primarypower": true,
            "Type": "IncreaseArmor"
          },
          {
            "SpellPowerMultiplier": 1,
            "Target": "Self",
            "UseCounterForAmount": true,
            "Type": "IncreaseAttack"
          }
        ]
      },
      "traits": [
        {
          "code": "natureheart",
          "englishDescription": "Gain 1 Life for each Green ally.",
          "native": {
            "Activation": "start_battle",
            "Code": "natureheart",
            "Description": "[TRAIT_NATUREHEART_DESC]",
            "Filter": "1",
            "Image": "natureheart",
            "Modifier": 1,
            "Name": "[TRAIT_NATUREHEART]",
            "TraitType": "adjust_life_per_ally",
            "Trigger": "none"
          }
        },
        {
          "code": "big",
          "englishDescription": "Gain 1 Life on 4 or 5 Gem matches.",
          "native": {
            "Activation": "four_or_five_of_a_kind",
            "Code": "big",
            "Description": "[TRAIT_BIG_DESC]",
            "Image": "big",
            "Modifier": 1,
            "Name": "[TRAIT_BIG]",
            "TraitType": "adjust_life",
            "Trigger": "self_player"
          }
        },
        {
          "code": "stoneskin",
          "englishDescription": "Reduce damage from Skulls by 50%.",
          "native": {
            "Activation": "received_skull_damage",
            "Code": "stoneskin",
            "Description": "[TRAIT_STONESKIN_DESC]",
            "Image": "stoneskin",
            "Modifier": 0.5,
            "Name": "[TRAIT_STONESKIN]",
            "TraitType": "damage_reduction",
            "Trigger": "self"
          }
        }
      ]
    },
    "nativeEvidence": [
      {
        "testFile": "tests/unit/gowTreantBarkskinAudit.test.ts",
        "fullName": "Treant 6027 / Barkskin 7027 source and real-battle audit the historical guide, English snapshot and all four native steps agree on both boosted Skills",
        "clausesCovered": [
          "remove Brown; both self Armor and Attack gain Magic+floor(Brown/4)",
          "source cost, colors and registered native prototype"
        ],
        "limits": [
          "Native source/prototype evidence. This assertion does not execute an ST blueprint or prove all native trait triggers."
        ]
      },
      {
        "testFile": "tests/unit/gowTreantBarkskinAudit.test.ts",
        "fullName": "Treant 6027 / Barkskin 7027 source and real-battle audit Web disables Magic scaling while retaining the Brown boost to both stats",
        "clausesCovered": [
          "specific native battle boundary: Web disables Magic scaling while retaining the Brown boost to both stats"
        ],
        "limits": [
          "One named boundary only; additional parameterized native cases remain in this suite. ST mapping and whole-enemy acceptance remain separate."
        ]
      }
    ],
    "nativeCases": [
      {
        "testFile": "tests/unit/gowTreantBarkskinAudit.test.ts",
        "line": 43,
        "fullName": "Treant 6027 / Barkskin 7027 source and real-battle audit the historical guide, English snapshot and all four native steps agree on both boosted Skills"
      },
      {
        "testFile": "tests/unit/gowTreantBarkskinAudit.test.ts",
        "line": 64,
        "fullNameTemplate": "Treant 6027 / Barkskin 7027 source and real-battle audit ${side}: removes ${brown} Brown and gives BOTH Armor then Attack Magic+floor(Brown/4)"
      },
      {
        "testFile": "tests/unit/gowTreantBarkskinAudit.test.ts",
        "line": 81,
        "fullNameTemplate": "Treant 6027 / Barkskin 7027 source and real-battle audit ${mode}: no spell or spent turn"
      },
      {
        "testFile": "tests/unit/gowTreantBarkskinAudit.test.ts",
        "line": 87,
        "fullName": "Treant 6027 / Barkskin 7027 source and real-battle audit Web disables Magic scaling while retaining the Brown boost to both stats"
      }
    ],
    "remainingStObligations": [
      "source portrait, rarity and complete ordinary traits",
      "ST context, identity and source affinities",
      "multi-level and difficulty panel scaling",
      "actual assembled cast including required target/color/board choice",
      "trait-plus-active interaction and family boundaries",
      "descriptions and tactical role",
      "save/reopen deterministic continuation",
      "invalid-action atomicity",
      "independent per-source review"
    ],
    "reviewState": "mapped-not-accepted",
    "sourceRefs": [
      "src/data/troops.json#6027",
      "src/data/troop-progression.json#6027",
      "data/raw/troops.gow.en.json#troops[Id=6027]",
      "data/raw/spells.gow.en.json#spells[Id=7027]",
      "src/data/traits.json#natureheart",
      "src/data/traits.json#big",
      "src/data/traits.json#stoneskin",
      "src/sillytavern/data/portraits.json#entries[troopId=6027]",
      "game-assets/public/static/portraits/Troop_K06_03.webp",
      "src/engine/skills/curated/batch-04.ts#7027",
      "data/raw/gow-2026-09-18/traits.en.json#traits[RawData.Code=natureheart]",
      "data/raw/gow-2026-09-18/traits.en.json#traits[RawData.Code=big]",
      "data/raw/gow-2026-09-18/traits.en.json#traits[RawData.Code=stoneskin]",
      "src/engine/skills/curated/index.ts#collectCurated/applyGowRemoveRule",
      "src/engine/skills/gowRemoveRules.ts#NATIVE_REMOVE_SPELL_IDS[7027]",
      "src/engine/skills/effects/gems.ts#doClear",
      "src/engine/TurnEngine.ts#resolveBoardChange"
    ],
    "activeExpected": {
      "spellId": 7027,
      "requiredChoice": "none",
      "target": "self",
      "formula": "each Armor and Attack gain = effectiveMagic + floor(originalBrownCount / 4)",
      "parameters": {
        "sourceColor": "Brown",
        "boostDivisor": 4,
        "boostMultiplier": 1,
        "magicMultiplier": 1,
        "buffOrder": [
          "armor",
          "attack"
        ],
        "sourceOperation": "RemoveColor",
        "registeredOperation": "remove",
        "curatedOperation": "destroy",
        "directManaCredit": 0,
        "registrationRule": "applyGowRemoveRule(7027)"
      },
      "examples": [
        {
          "magic": 11,
          "brown": 3,
          "expectedEachGain": 11
        },
        {
          "magic": 11,
          "brown": 4,
          "expectedEachGain": 12
        },
        {
          "magic": 11,
          "brown": 7,
          "expectedEachGain": 12
        },
        {
          "magic": 11,
          "brown": 8,
          "expectedEachGain": 13
        },
        {
          "magic": 20,
          "brown": 8,
          "web": true,
          "expectedEachGain": 2
        }
      ]
    },
    "nativeCaseMatrix": {
      "sides": [
        "Left",
        "Right"
      ],
      "brownCounts": [
        0,
        3,
        4,
        7,
        8,
        16
      ],
      "blocked": [
        "low-mana",
        "silence"
      ]
    },
    "traitNativeEvidence": [
      {
        "testFile": "tests/unit/traits.test.ts",
        "line": 771,
        "fullName": "回合开始与战斗开始特质 水系之心按蓝色盟友数量叠加生命",
        "scope": "native-family",
        "clausesCovered": [
          "Water Heart counts allied Blue characters including self; hp/maxHp +2; other ally unchanged"
        ],
        "limits": [
          "Exact Water Heart execution. Air Spirit, Nature Heart and Fire Spirit reuse is family-level evidence only."
        ]
      },
      {
        "testFile": "tests/unit/traits.test.ts",
        "line": 569,
        "fullName": "施法 / 阵亡 / 4-5 连响应特质 庞然 / 修理：4 连时匹配方全队获得生命 / 护甲，对方不获得",
        "scope": "exact-native-trait",
        "clausesCovered": [
          "Left four-match gives Big maxHp >=51 from 50; opposing Big unchanged"
        ],
        "limits": [
          "Uses >=, so exact +1 per qualifying match is not asserted."
        ]
      },
      {
        "testFile": "tests/unit/traits.test.ts",
        "line": 147,
        "fullName": "骷髅减伤特质 铁壁铜墙减半",
        "scope": "exact-native-trait",
        "clausesCovered": [
          "Stone Skin reduces 10 skull damage to 5"
        ],
        "limits": [
          "Does not execute Treant plus active or spell damage control."
        ]
      }
    ],
    "recommendedStCases": [
      {
        "id": "brown-boost-web",
        "setup": "Assembled Treant with Brown counts 0/3/4/7/8, Web variant, reopened continuation",
        "expected": "Both buffs use same original count and floor(count/4), Armor then Attack; Web suppresses Magic only."
      },
      {
        "id": "remove-versus-destroy",
        "setup": "Empty-mana Brown ally with controlled removed Brown cells and no incidental cascades",
        "expected": "Registered mode is remove: directly removed Brown gems grant zero mana to a Brown ally and emit gem-destroy with removed=true. Gravity/refill and later cascades still run; only cascades may grant mana. This confirms ST composition of an existing native rule, not a production destroy defect."
      },
      {
        "id": "heart-big-stoneskin",
        "setup": "Living Green/non-Green allies, exact four-match then skull and spell hits",
        "expected": "Nature Heart counts own living Green allies including self; Big exactly +1 per qualifying match; Stone Skin affects skull damage only."
      }
    ],
    "remainingGaps": [
      "Treant-specific native suite has no Brown-mana ally and caster cannot use Brown. P-F1 tests prove final remove compilation and shared no-direct-settlement behavior; an assembled ST Treant plus Brown ally and reopen remain composition checks, not evidence of a production destroy defect.",
      "Treant source/prototype test checks first segment only as kind=gem. Read together with the P-F1 compile test and 7027 registration path to establish final mode=remove; curated destroy is normalized before registration.",
      "Nature Heart uses Water Heart family evidence; native Big assertion uses >=1. Source-specific Barkskin/trait interaction remains open."
    ],
    "mechanismNativeEvidence": [
      {
        "testFile": "tests/unit/gowFixP-F1-remove-gems.test.ts",
        "line": 37,
        "fullName": "P-F1-remove-gems every native Remove* spell compiles its clear segments as remove",
        "scope": "registered-native-mode",
        "clausesCovered": [
          "All present NATIVE_REMOVE_SPELL_IDS prototypes have nonempty clear modes, all remove; 7027 is listed and separately present in the Treant suite."
        ],
        "limits": [
          "Test skips missing prototypes; registry presence for 7027 comes from the Treant source test. Does not execute assembled ST Treant."
        ]
      },
      {
        "testFile": "tests/unit/gowFixP-F1-remove-gems.test.ts",
        "line": 21,
        "fullName": "P-F1-remove-gems troop:6970 Argos (8473): Remove all Blue gems -> no mana for the Blue ally, drain still counts 11",
        "scope": "native-remove-family",
        "clausesCovered": [
          "Nonempty removed cells and no direct settlement events before gravity; counter-dependent enemy mana drain still executes."
        ],
        "limits": [
          "Argos family behavior; title says 11 but assertion only checks enemy mana less than 6. No exact removed-count 11 or Treant Brown ally assertion."
        ]
      },
      {
        "testFile": "tests/unit/gowFixP-F1-remove-gems.test.ts",
        "line": 31,
        "fullName": "P-F1-remove-gems troop:6052 Zombie (7052): Remove Skulls -> no skull damage on the front enemy",
        "scope": "native-remove-family",
        "clausesCovered": [
          "No direct skullBurst skill-damage event before gravity."
        ],
        "limits": [
          "Zombie control; no Treant or ST assembly."
        ]
      },
      {
        "testFile": "tests/unit/gowFixP-F1-remove-gems.test.ts",
        "line": 48,
        "fullName": "P-F1-remove-gems a Destroy spell still settles mana (control: troop:6000 Ogre explode)",
        "scope": "native-destroy-control",
        "clausesCovered": [
          "Ogre explosion emits at least one direct settlement event before gravity."
        ],
        "limits": [
          "Assertion checks nonempty settlement events rather than an exact mana delta."
        ]
      }
    ]
  },
  {
    "enemyId": 6029,
    "referenceName": "Paladin",
    "sourceTroop": {
      "id": 6029,
      "name": "圣骑士",
      "referenceName": "Paladin",
      "rarity": "Uncommon",
      "rarityIdx": 1,
      "kingdom": "白盔国",
      "kingdomId": 3014,
      "troopTypes": [
        "Divine",
        "Knight"
      ],
      "role": "Striker",
      "attack": 11,
      "armor": 18,
      "health": 14,
      "magic": 7,
      "base": {
        "attack": 3,
        "armor": 3,
        "health": 3,
        "magic": 1
      },
      "manaColors": [
        "Green",
        "Yellow"
      ],
      "manaCost": 11,
      "spell": {
        "id": 7029,
        "name": "正义之士",
        "description": "对 1 名敌人造成 [魔法] 点伤害，伤害值因自身的护甲值而增强。 [1:1]",
        "meta": {
          "scalings": [
            {
              "base": 0,
              "mult": 1
            }
          ],
          "raw": "对 1 名敌人造成 [魔法] 点伤害，伤害值因自身的护甲值而增强。 [1:1]",
          "parsed": true,
          "modifier": {
            "kind": "ratio",
            "a": 1,
            "b": 1
          }
        }
      },
      "traits": [
        {
          "code": "dragonslayer",
          "name": "龙族杀手",
          "description": "对龙族军队造成双倍骷髅头伤害。"
        },
        {
          "code": "airlink",
          "name": "空气灵链",
          "description": "从黄色宝石配对中获得额外的黄色法力值。"
        },
        {
          "code": "armored",
          "name": "全副武装",
          "description": "降低来自骷髅头的伤害 25%。"
        }
      ],
      "portrait": "Troop_K07_01"
    },
    "sourceTraits": [
      {
        "code": "dragonslayer",
        "name": "龙族杀手",
        "description": "对龙族军队造成双倍骷髅头伤害。",
        "troops": 7,
        "skullMultVsTroopType": {
          "troopType": "Dragon",
          "mult": 2
        }
      },
      {
        "code": "airlink",
        "name": "空气灵链",
        "description": "从黄色宝石配对中获得额外的黄色法力值。",
        "troops": 24,
        "manaLink": {
          "color": "Yellow",
          "amount": 1
        }
      },
      {
        "code": "armored",
        "name": "全副武装",
        "description": "降低来自骷髅头的伤害 25%。",
        "troops": 203,
        "skullDamageReduction": 0.25
      }
    ],
    "progression": {
      "growth": {
        "health": [
          0,
          0,
          0,
          1,
          0,
          1,
          0,
          0,
          1,
          0,
          0,
          1,
          0,
          0,
          1,
          1,
          1,
          1,
          1,
          2
        ],
        "armor": [
          0,
          1,
          0,
          0,
          1,
          0,
          1,
          0,
          1,
          1,
          1,
          0,
          0,
          1,
          0,
          1,
          2,
          1,
          2,
          2
        ],
        "attack": [
          0,
          0,
          1,
          0,
          0,
          0,
          0,
          1,
          0,
          0,
          0,
          0,
          1,
          0,
          0,
          1,
          1,
          1,
          1,
          1
        ],
        "magic": [
          0,
          0,
          0,
          0,
          0,
          0,
          1,
          0,
          0,
          0,
          0,
          1,
          0,
          0,
          1,
          0,
          1,
          0,
          1,
          1
        ]
      },
      "traits": [
        {
          "minor:yellow": 12,
          "major:yellow": 4,
          "major:green": 4
        },
        {
          "minor:yellow": 16,
          "runic:yellow": 4,
          "runic:green": 4
        },
        {
          "minor:yellow": 20,
          "major:yellow": 6,
          "arcane:green:yellow": 2
        }
      ]
    },
    "portrait": {
      "assetId": "Troop_K07_01",
      "troopId": 6029,
      "manaColors": [
        "Green",
        "Yellow"
      ],
      "rank": "杂兵",
      "form": "人形",
      "role": "Striker",
      "portraitUrl": "/static/portraits/Troop_K07_01.webp",
      "review": "thumbnail-reviewed",
      "contentHash": "d8af5136aa4160b7cd65ded4855d49e02a309aa3da1a9049ac9bdd1f277968ac"
    },
    "portraitSha256": "d8af5136aa4160b7cd65ded4855d49e02a309aa3da1a9049ac9bdd1f277968ac",
    "stats": {
      "1@1": {
        "hp": 3,
        "armor": 3,
        "attack": 3,
        "magic": 1
      },
      "20@1": {
        "hp": 14,
        "armor": 18,
        "attack": 11,
        "magic": 7
      },
      "20@1.5": {
        "hp": 21,
        "armor": 27,
        "attack": 17,
        "magic": 11
      },
      "7@1.3": {
        "hp": 7,
        "armor": 8,
        "attack": 5,
        "magic": 3
      }
    },
    "segments": [
      {
        "kind": "damage",
        "target": "enemyChosen",
        "scaling": {
          "base": 0,
          "mult": 1
        },
        "modifier": {
          "mod": {
            "kind": "ratio",
            "a": 1,
            "b": 1
          },
          "source": {
            "kind": "selfStat",
            "stat": "armor"
          }
        }
      }
    ],
    "rawSource": {
      "englishSpell": {
        "name": "Justice",
        "desc": "Deal [Magic] damage to an Enemy, boosted by my Armor. [1:1]",
        "id": 7029
      },
      "nativeSpell": {
        "Id": 7029,
        "Cost": 11,
        "Target": "Enemy",
        "SpellSteps": [
          {
            "Target": "Self",
            "Amount": 100,
            "Type": "CountArmor"
          },
          {
            "SpellPowerMultiplier": 1,
            "Target": "FromTarget",
            "UseCounterForAmount": true,
            "Primarypower": true,
            "Type": "Damage"
          }
        ]
      },
      "traits": [
        {
          "code": "dragonslayer",
          "englishDescription": "Deal double Skull damage vs. Dragons.",
          "native": {
            "Activation": "on_skull_damage",
            "Code": "dragonslayer",
            "Description": "[TRAIT_DRAGONSLAYER_DESC]",
            "Filter": "dragon",
            "Image": "dragonslayer",
            "Modifier": 2,
            "Name": "[TRAIT_DRAGONSLAYER]",
            "TraitType": "bonus_damage",
            "Trigger": "self"
          }
        },
        {
          "code": "airlink",
          "englishDescription": "Gain bonus Yellow Mana from Yellow Gem matches.",
          "native": {
            "Activation": "match_mana",
            "Code": "airlink",
            "Description": "[TRAIT_AIRLINK_DESC]",
            "Filter": "3",
            "Image": "airlink",
            "Modifier": 1,
            "Name": "[TRAIT_AIRLINK]",
            "TraitType": "bonus_mana",
            "Trigger": "none"
          }
        },
        {
          "code": "armored",
          "englishDescription": "Reduce damage from Skulls by 25%.",
          "native": {
            "Activation": "received_skull_damage",
            "Code": "armored",
            "Description": "[TRAIT_ARMORED_DESC]",
            "Image": "armored",
            "Modifier": 0.75,
            "Name": "[TRAIT_ARMORED]",
            "TraitType": "damage_reduction",
            "Trigger": "self"
          }
        }
      ]
    },
    "nativeEvidence": [
      {
        "testFile": "tests/unit/gowPaladinJusticeAudit.test.ts",
        "fullName": "Paladin 6029 / Justice 7029 full skill snapshot audit English, two native steps, historical guide and display agree on cost, colors, self Armor and single enemy",
        "clausesCovered": [
          "single enemy damage Magic+self Armor",
          "source cost, colors and registered native prototype"
        ],
        "limits": [
          "Native source/prototype evidence. This assertion does not execute an ST blueprint or prove all native trait triggers."
        ]
      },
      {
        "testFile": "tests/unit/gowPaladinJusticeAudit.test.ts",
        "fullName": "Paladin 6029 / Justice 7029 full skill snapshot audit Web suppresses only Magic; self Armor is still counted",
        "clausesCovered": [
          "specific native battle boundary: Web suppresses only Magic; self Armor is still counted"
        ],
        "limits": [
          "One named boundary only; additional parameterized native cases remain in this suite. ST mapping and whole-enemy acceptance remain separate."
        ]
      }
    ],
    "nativeCases": [
      {
        "testFile": "tests/unit/gowPaladinJusticeAudit.test.ts",
        "line": 29,
        "fullName": "Paladin 6029 / Justice 7029 full skill snapshot audit English, two native steps, historical guide and display agree on cost, colors, self Armor and single enemy"
      },
      {
        "testFile": "tests/unit/gowPaladinJusticeAudit.test.ts",
        "line": 48,
        "fullNameTemplate": "Paladin 6029 / Justice 7029 full skill snapshot audit ${side}: target ${chosen}, caster Armor=7 adds exactly 7 to Magic; target Armor absorbs first"
      },
      {
        "testFile": "tests/unit/gowPaladinJusticeAudit.test.ts",
        "line": 60,
        "fullNameTemplate": "Paladin 6029 / Justice 7029 full skill snapshot audit Magic=${magic}, Armor=${armor}: scaling and no rounding or accidental target-armor boost"
      },
      {
        "testFile": "tests/unit/gowPaladinJusticeAudit.test.ts",
        "line": 67,
        "fullName": "Paladin 6029 / Justice 7029 full skill snapshot audit Web suppresses only Magic; self Armor is still counted"
      },
      {
        "testFile": "tests/unit/gowPaladinJusticeAudit.test.ts",
        "line": 71,
        "fullName": "Paladin 6029 / Justice 7029 full skill snapshot audit Barrier negates the single hit and is consumed, without changing caster Armor"
      },
      {
        "testFile": "tests/unit/gowPaladinJusticeAudit.test.ts",
        "line": 77,
        "fullName": "Paladin 6029 / Justice 7029 full skill snapshot audit lethal hit defeats only the chosen enemy"
      },
      {
        "testFile": "tests/unit/gowPaladinJusticeAudit.test.ts",
        "line": 83,
        "fullNameTemplate": "Paladin 6029 / Justice 7029 full skill snapshot audit ${mode} leaves mana and action intact"
      }
    ],
    "remainingStObligations": [
      "source portrait, rarity and complete ordinary traits",
      "ST context, identity and source affinities",
      "multi-level and difficulty panel scaling",
      "actual assembled cast including required target/color/board choice",
      "trait-plus-active interaction and family boundaries",
      "descriptions and tactical role",
      "save/reopen deterministic continuation",
      "invalid-action atomicity",
      "independent per-source review"
    ],
    "reviewState": "mapped-not-accepted",
    "sourceRefs": [
      "src/data/troops.json#6029",
      "src/data/troop-progression.json#6029",
      "data/raw/troops.gow.en.json#troops[Id=6029]",
      "data/raw/spells.gow.en.json#spells[Id=7029]",
      "src/data/traits.json#dragonslayer",
      "src/data/traits.json#airlink",
      "src/data/traits.json#armored",
      "src/sillytavern/data/portraits.json#entries[troopId=6029]",
      "game-assets/public/static/portraits/Troop_K07_01.webp",
      "src/engine/skills/curated/batch-04.ts#7029",
      "data/raw/gow-2026-09-18/traits.en.json#traits[RawData.Code=dragonslayer]",
      "data/raw/gow-2026-09-18/traits.en.json#traits[RawData.Code=airlink]",
      "data/raw/gow-2026-09-18/traits.en.json#traits[RawData.Code=armored]"
    ],
    "activeExpected": {
      "spellId": 7029,
      "requiredChoice": "enemy",
      "target": "chosen-enemy",
      "formula": "damage = effectiveMagic + currentCasterArmor; Armor is counted, not consumed",
      "parameters": {
        "base": 0,
        "magicMultiplier": 1,
        "armorMultiplier": 1,
        "armorOwner": "caster",
        "armorConsumed": false
      },
      "examples": [
        {
          "magic": 11,
          "casterArmor": 7,
          "targetArmor": 5,
          "targetHp": 1000,
          "expectedDamage": 18,
          "expectedHp": 987
        },
        {
          "magic": 20,
          "casterArmor": 9,
          "web": true,
          "expectedDamage": 9
        },
        {
          "magic": 0,
          "casterArmor": 0,
          "expectedDamage": 0,
          "expectedDamageEvents": 0
        }
      ]
    },
    "nativeCaseMatrix": {
      "sides": [
        "Left",
        "Right"
      ],
      "targetIds": [
        10,
        11,
        12,
        13
      ],
      "magic": [
        0,
        1,
        21
      ],
      "casterArmor": [
        0,
        1,
        23
      ],
      "blocked": [
        "low-mana",
        "silence",
        "cancel-invalid-id-999"
      ]
    },
    "traitNativeEvidence": [
      {
        "testFile": "tests/unit/traits.test.ts",
        "line": 403,
        "fullName": "屠戮倍率与穿透护甲 龙族杀手对龙族造成双倍骷髅伤害，对其它种族不变",
        "scope": "exact-native-trait",
        "clausesCovered": [
          "Dragon Slayer doubles skull damage versus Dragon; Beast unchanged"
        ],
        "limits": [
          "Native Dragon token only; ST affinity:9 and spell exclusion need assembly."
        ]
      },
      {
        "testFile": "tests/unit/traits.test.ts",
        "line": 791,
        "fullName": "回合开始与战斗开始特质 法力灵链在匹配对应色时额外充能，且不挤占队友",
        "scope": "native-family",
        "clausesCovered": [
          "Water Link adds 1 Blue mana without consuming extra base mana"
        ],
        "limits": [
          "Blue Water Link only; Yellow Air Link exact source branch remains separate."
        ]
      },
      {
        "testFile": "tests/unit/traits.test.ts",
        "line": 141,
        "fullName": "骷髅减伤特质 全副武装把 10 点骷髅伤害减到 8",
        "scope": "exact-native-trait",
        "clausesCovered": [
          "Armored reduces 10 skull damage to round(7.5)=8"
        ],
        "limits": [
          "Does not establish Justice skill damage exclusion."
        ]
      }
    ],
    "recommendedStCases": [
      {
        "id": "armor-web-zero",
        "setup": "Own Armor 0/1/23, independent target Armor, Web and zero-total cases",
        "expected": "Only own Armor boosts; Web retains Armor; own Armor remains; zero total emits no damage event."
      },
      {
        "id": "dragon-affinity-boundary",
        "setup": "Adapted Dragon-affinity and Beast-affinity enemies, skull attacks and Justice",
        "expected": "Slayer doubles skull damage only against Dragon affiliation; Justice has no Slayer multiplier."
      },
      {
        "id": "yellow-link-armored",
        "setup": "Yellow matches at empty/near-full mana, 10-point skull and spell hits then Justice",
        "expected": "Air Link +1 Yellow up to mana cap; Armored rounds skull hit to 8 but leaves spell hit unchanged; Justice uses remaining own Armor."
      }
    ],
    "remainingGaps": [
      "Justice suite omits source traits; native Slayer uses Dragon token, not ST affinity:9; Air Link is family reuse of Water Link.",
      "Native invalid-id cancel does not prove wrong-team/dead selection or full-session atomicity."
    ]
  },
  {
    "enemyId": 6074,
    "referenceName": "KeeperOfSouls",
    "sourceTroop": {
      "id": 6074,
      "name": "守魂者",
      "referenceName": "KeeperOfSouls",
      "rarity": "Epic",
      "rarityIdx": 4,
      "kingdom": "盖塔尔",
      "kingdomId": 3020,
      "troopTypes": [
        "Undead"
      ],
      "role": "Warmaster",
      "attack": 17,
      "armor": 21,
      "health": 23,
      "magic": 0,
      "base": {
        "attack": 5,
        "armor": 4,
        "health": 4,
        "magic": 0
      },
      "manaColors": [
        "Purple",
        "Brown"
      ],
      "manaCost": 15,
      "spell": {
        "id": 7144,
        "name": "灵魂攻击",
        "description": "将选定颜色的所有宝石转换成骷髅头。",
        "meta": {
          "scalings": [],
          "raw": "将选定颜色的所有宝石转换成骷髅头。",
          "parsed": false
        }
      },
      "traits": [
        {
          "code": "necromancy",
          "name": "死灵法术",
          "description": "从战斗中获得 50% 额外灵魂。"
        },
        {
          "code": "undying",
          "name": "不死不灭",
          "description": "对中毒、疾病、狼化和死亡标记免疫"
        },
        {
          "code": "soullegion",
          "name": "灵魂军团",
          "description": "当敌人身亡时有 50% 的几率召唤一只幽魂。"
        }
      ],
      "portrait": "Troop_Boss_K09"
    },
    "sourceTraits": [
      {
        "code": "necromancy",
        "name": "死灵法术",
        "description": "从战斗中获得 50% 额外灵魂。",
        "troops": 30,
        "battleEconomyGain": {
          "currency": "souls",
          "ratio": 0.5
        }
      },
      {
        "code": "undying",
        "name": "不死不灭",
        "description": "对中毒、疾病、狼化和死亡标记免疫",
        "troops": 150,
        "statusImmunities": [
          "poison",
          "death-mark",
          "disease",
          "wolf",
          "wolf-form",
          "lycanthropy"
        ]
      },
      {
        "code": "soullegion",
        "name": "灵魂军团",
        "description": "当敌人身亡时有 50% 的几率召唤一只幽魂。",
        "troops": 1,
        "summonOnEnemyDeath": {
          "chance": 0.5,
          "troopId": 6037,
          "referenceName": "Wight",
          "displayName": "幽魂"
        }
      }
    ],
    "progression": {
      "growth": {
        "health": [
          0,
          1,
          0,
          1,
          1,
          0,
          1,
          1,
          0,
          1,
          1,
          0,
          1,
          0,
          0,
          2,
          2,
          2,
          2,
          3
        ],
        "armor": [
          0,
          0,
          1,
          0,
          1,
          1,
          0,
          1,
          1,
          0,
          0,
          1,
          0,
          1,
          0,
          2,
          2,
          2,
          2,
          2
        ],
        "attack": [
          0,
          0,
          0,
          1,
          0,
          0,
          1,
          0,
          0,
          1,
          0,
          0,
          0,
          0,
          1,
          1,
          2,
          1,
          2,
          2
        ],
        "magic": [
          0,
          0,
          0,
          0,
          0,
          0,
          0,
          0,
          0,
          0,
          0,
          0,
          0,
          0,
          0,
          0,
          0,
          0,
          0,
          0
        ]
      },
      "traits": [
        {
          "minor:purple": 18,
          "runic:purple": 10,
          "runic:brown": 10
        },
        {
          "minor:purple": 26,
          "major:purple": 12,
          "arcane:purple:brown": 10
        },
        {
          "minor:purple": 34,
          "arcane:purple:brown": 6,
          "celestial": 2
        }
      ]
    },
    "portrait": {
      "assetId": "Troop_Boss_K09",
      "troopId": 6074,
      "manaColors": [
        "Purple",
        "Brown"
      ],
      "rank": "领主",
      "form": "类人",
      "role": "Warmaster",
      "portraitUrl": "/static/portraits/Troop_Boss_K09.webp",
      "review": "thumbnail-reviewed",
      "contentHash": "b1449458b524198d9b2c026d781df9a24d3378a2237576c5b86f27588c4437bd"
    },
    "portraitSha256": "b1449458b524198d9b2c026d781df9a24d3378a2237576c5b86f27588c4437bd",
    "stats": {
      "1@1": {
        "hp": 4,
        "armor": 4,
        "attack": 5,
        "magic": 0
      },
      "20@1": {
        "hp": 23,
        "armor": 21,
        "attack": 17,
        "magic": 0
      },
      "20@1.5": {
        "hp": 35,
        "armor": 32,
        "attack": 26,
        "magic": 0
      },
      "7@1.3": {
        "hp": 10,
        "armor": 9,
        "attack": 9,
        "magic": 0
      }
    },
    "segments": [
      {
        "kind": "gem",
        "params": {
          "op": "transform",
          "from": "CHOSEN",
          "to": "SKULL"
        }
      }
    ],
    "rawSource": {
      "englishSpell": {
        "name": "Soul Strike",
        "desc": "Transform all Gems of a chosen color to Skulls.",
        "id": 7144
      },
      "nativeSpell": {
        "Id": 7144,
        "Cost": 15,
        "Target": "ManaGemsOnly",
        "SpellSteps": [
          {
            "Color1": "FromTarget",
            "Amount": 100,
            "Color2": "Skull",
            "Type": "ConvertGems"
          }
        ]
      },
      "traits": [
        {
          "code": "necromancy",
          "englishDescription": "Gain 50% bonus Souls from battle.",
          "native": {
            "Activation": "end_battle_rewards",
            "Code": "necromancy",
            "Description": "[TRAIT_NECROMANCY_DESC]",
            "Image": "necromancy",
            "Modifier": 0.5,
            "Name": "[TRAIT_NECROMANCY]",
            "TraitType": "bonus_souls_end",
            "Trigger": "none"
          }
        },
        {
          "code": "undying",
          "englishDescription": "Immune to Poison, Disease, Lycanthropy, and Death Mark.",
          "native": {
            "Activation": "status_effect_received",
            "Code": "undying",
            "Description": "[TRAIT_UNDYING_DESC]",
            "Image": "undeadslayer",
            "Name": "[TRAIT_UNDYING]",
            "TraitType": "immune_spec_undying",
            "Trigger": "self"
          }
        },
        {
          "code": "soullegion",
          "englishDescription": "50% chance to Summon a Wight when an enemy dies.",
          "native": {
            "Activation": "death",
            "Code": "soullegion",
            "Description": "[TRAIT_SOULLEGION_DESC]",
            "Filter": "6037",
            "Image": "soullegion",
            "Modifier": 0.5,
            "Name": "[TRAIT_SOULLEGION]",
            "TraitType": "summon",
            "Trigger": "other_player"
          }
        }
      ]
    },
    "nativeEvidence": [
      {
        "testFile": "tests/unit/gowKeeperOfSoulsWholeSkillAudit.test.ts",
        "fullName": "Keeper of Souls 6074: complete selected-colour Skull transform (stored snapshot) corroborates full English/native clause and notes historical official cost change",
        "clausesCovered": [
          "transform all chosen-color gems into Skulls; stored cost 15",
          "source cost, colors and registered native prototype"
        ],
        "limits": [
          "Native source/prototype evidence. This assertion does not execute an ST blueprint or prove all native trait triggers."
        ]
      },
      {
        "testFile": "tests/unit/gowKeeperOfSoulsWholeSkillAudit.test.ts",
        "fullName": "Keeper of Souls 6074: complete selected-colour Skull transform (stored snapshot) an absent color changes zero gems but still spends the cast, without a fabricated extra turn",
        "clausesCovered": [
          "specific native battle boundary: an absent color changes zero gems but still spends the cast, without a fabricated extra turn"
        ],
        "limits": [
          "One named boundary only; additional parameterized native cases remain in this suite. ST mapping and whole-enemy acceptance remain separate."
        ]
      }
    ],
    "nativeCases": [
      {
        "testFile": "tests/unit/gowKeeperOfSoulsWholeSkillAudit.test.ts",
        "line": 34,
        "fullName": "Keeper of Souls 6074: complete selected-colour Skull transform (stored snapshot) corroborates full English/native clause and notes historical official cost change"
      },
      {
        "testFile": "tests/unit/gowKeeperOfSoulsWholeSkillAudit.test.ts",
        "line": 53,
        "fullNameTemplate": "Keeper of Souls 6074: complete selected-colour Skull transform (stored snapshot) ${color}/${side}: transforms exactly the chosen color across the whole board"
      },
      {
        "testFile": "tests/unit/gowKeeperOfSoulsWholeSkillAudit.test.ts",
        "line": 66,
        "fullName": "Keeper of Souls 6074: complete selected-colour Skull transform (stored snapshot) an absent color changes zero gems but still spends the cast, without a fabricated extra turn"
      },
      {
        "testFile": "tests/unit/gowKeeperOfSoulsWholeSkillAudit.test.ts",
        "line": 73,
        "fullNameTemplate": "Keeper of Souls 6074: complete selected-colour Skull transform (stored snapshot) ${mode}: prevents cast and keeps mana and active side"
      },
      {
        "testFile": "tests/unit/gowKeeperOfSoulsWholeSkillAudit.test.ts",
        "line": 80,
        "fullName": "Keeper of Souls 6074: complete selected-colour Skull transform (stored snapshot) chooses the color once from the battle entry"
      }
    ],
    "remainingStObligations": [
      "source portrait, rarity and complete ordinary traits",
      "ST context, identity and source affinities",
      "multi-level and difficulty panel scaling",
      "actual assembled cast including required target/color/board choice",
      "trait-plus-active interaction and family boundaries",
      "descriptions and tactical role",
      "save/reopen deterministic continuation",
      "invalid-action atomicity",
      "independent per-source review"
    ],
    "reviewState": "mapped-not-accepted",
    "sourceRefs": [
      "src/data/troops.json#6074",
      "src/data/troop-progression.json#6074",
      "data/raw/troops.gow.en.json#troops[Id=6074]",
      "data/raw/spells.gow.en.json#spells[Id=7144]",
      "src/data/traits.json#necromancy",
      "src/data/traits.json#undying",
      "src/data/traits.json#soullegion",
      "src/sillytavern/data/portraits.json#entries[troopId=6074]",
      "game-assets/public/static/portraits/Troop_Boss_K09.webp",
      "src/engine/skills/curated/batch-02.ts#7144",
      "data/raw/gow-2026-09-18/traits.en.json#traits[RawData.Code=necromancy]",
      "data/raw/gow-2026-09-18/traits.en.json#traits[RawData.Code=undying]",
      "data/raw/gow-2026-09-18/traits.en.json#traits[RawData.Code=soullegion]"
    ],
    "activeExpected": {
      "spellId": 7144,
      "requiredChoice": "color",
      "target": "all-board-gems-of-chosen-mana-color",
      "formula": "transform all original chosen-color gems to Skulls; no direct damage segment",
      "parameters": {
        "from": "CHOSEN",
        "to": "SKULL",
        "all": true,
        "storedManaCost": 15,
        "historicalOfficialManaCost": 16
      },
      "examples": [
        {
          "chosenColorPresent": false,
          "expectedTransformEvents": 0,
          "expectedMana": 0,
          "expectedExtraTurn": false
        }
      ]
    },
    "nativeCaseMatrix": {
      "sides": [
        "Left",
        "Right"
      ],
      "presentColors": [
        "Blue",
        "Yellow",
        "Purple",
        "Brown"
      ],
      "absentColor": "Green",
      "blocked": [
        "silence",
        "low-mana"
      ],
      "colorChooserCalls": 1
    },
    "traitNativeEvidence": [
      {
        "testFile": "tests/unit/economyEngine.test.ts",
        "line": 428,
        "fullName": "battle-start economy traits apply during battle soul bonus changes live gain and cap, with additive traits and no victory doubling",
        "scope": "exact-native-trait",
        "clausesCovered": [
          "Player Necromancy + Necromaster add to 3x souls; per-credit floor/cap; victory does not multiply twice"
        ],
        "limits": [
          "Mixed player traits; exact Right-side Necromancy no-player-bonus branch remains separate."
        ]
      },
      {
        "testFile": "tests/unit/traitDeathSummon.test.ts",
        "line": 190,
        "fullName": "TurnEngine 集成：真实对局中的死亡召唤 召唤名可解析的敌方死亡召唤（soullegion → 幽魂）触发时补位正确",
        "scope": "exact-native-trait",
        "clausesCovered": [
          "Enemy Soul Legion eventually produces a troop named Wight in the holder team over seeds 1..119"
        ],
        "limits": [
          "Name/eventual occurrence only; no id=6037 template/stat checks, exact 0.5 threshold, FIFO or restored RNG."
        ]
      }
    ],
    "recommendedStCases": [
      {
        "id": "six-colors-and-skulls",
        "setup": "Each of six present mana colors, absent color, and a conversion creating Skull matches",
        "expected": "Transform exactly original chosen color; no direct skill damage; real Skull cascade deaths/extra turns follow; stored mana cost 15."
      },
      {
        "id": "soullegion-template-and-queue",
        "setup": "Enemy death with RNG below/at 0.5; free slot/full team; repeat after reopen",
        "expected": "Eligible success queues Wight 6037 with ST-resolved identity, template and environmental scaling; preserve FIFO/RNG and process death once."
      },
      {
        "id": "undying-economy",
        "setup": "Try poison/death-mark/disease/wolf/wolf-form/lycanthropy plus control; Right Necromancy with soul credit",
        "expected": "Six declared immunity tokens are excluded; other statuses follow normal rules. Right Necromancy grants no player soul ratio; retain snapshot after reopen."
      }
    ],
    "remainingGaps": [
      "Native transform tests four present colors, not Red/present Green or Skull-created death cascades triggering Soul Legion.",
      "Soul Legion native assertion proves name/occurrence only; exact Wight template/traits/scaling, probability boundary, capacity queue and reopened RNG remain open.",
      "No exact Undying status-application assertion was identified in the reviewed native suites; trait declaration alone is data evidence.",
      "Necromancy reference uses mixed player-side traits; enemy-source ownership and serialized economy snapshots need ST proof."
    ]
  },
  {
    "enemyId": 6098,
    "referenceName": "Peasant",
    "sourceTroop": {
      "id": 6098,
      "name": "农民",
      "referenceName": "Peasant",
      "rarity": "Common",
      "rarityIdx": 0,
      "kingdom": "剑锋崖",
      "kingdomId": 3006,
      "troopTypes": [
        "Human"
      ],
      "role": "Generator",
      "attack": 10,
      "armor": 10,
      "health": 20,
      "magic": 0,
      "base": {
        "attack": 2,
        "armor": 1,
        "health": 3,
        "magic": 0
      },
      "manaColors": [
        "Blue"
      ],
      "manaCost": 3,
      "spell": {
        "id": 7000,
        "name": "干草叉",
        "description": "摧毁 1 颗宝石和其两侧的宝石。",
        "meta": {
          "scalings": [],
          "raw": "摧毁 1 颗宝石和其两侧的宝石。",
          "parsed": false
        }
      },
      "traits": [
        {
          "code": "greedy",
          "name": "贪婪",
          "description": "在配对 4 或 5 颗宝石时，获得额外 2 黄金。"
        },
        {
          "code": "waterheart",
          "name": "水系之心",
          "description": "每有一名蓝色盟友则获得 1 点生命值。"
        },
        {
          "code": "jinx",
          "name": "霉运",
          "description": "将敌人的宝石灵力减半。"
        }
      ],
      "portrait": "Troop_K14_04"
    },
    "sourceTraits": [
      {
        "code": "greedy",
        "name": "贪婪",
        "description": "在配对 4 或 5 颗宝石时，获得额外 2 黄金。",
        "troops": 63,
        "onBigMatchEconomy": {
          "currency": "gold",
          "amount": 2
        }
      },
      {
        "code": "waterheart",
        "name": "水系之心",
        "description": "每有一名蓝色盟友则获得 1 点生命值。",
        "troops": 22,
        "perAllyColor": {
          "color": "Blue",
          "stat": "hp",
          "amount": 1
        }
      },
      {
        "code": "jinx",
        "name": "霉运",
        "description": "将敌人的宝石灵力减半。",
        "troops": 24,
        "enemyMasteryMult": 0.5
      }
    ],
    "progression": {
      "growth": {
        "health": [
          0,
          1,
          1,
          0,
          1,
          0,
          1,
          1,
          0,
          1,
          1,
          1,
          0,
          1,
          0,
          1,
          2,
          1,
          2,
          2
        ],
        "armor": [
          0,
          0,
          0,
          0,
          0,
          1,
          0,
          0,
          1,
          1,
          0,
          1,
          0,
          1,
          0,
          0,
          1,
          1,
          1,
          1
        ],
        "attack": [
          0,
          0,
          0,
          1,
          0,
          0,
          0,
          1,
          0,
          0,
          0,
          0,
          1,
          0,
          1,
          0,
          1,
          1,
          1,
          1
        ],
        "magic": [
          0,
          0,
          0,
          0,
          0,
          0,
          0,
          0,
          0,
          0,
          0,
          0,
          0,
          0,
          0,
          0,
          0,
          0,
          0,
          0
        ]
      },
      "traits": [
        {
          "minor:blue": 10,
          "major:blue": 4
        },
        {
          "minor:blue": 14,
          "major:blue": 4,
          "runic:blue": 4
        },
        {
          "minor:blue": 18,
          "major:blue": 4,
          "arcane:blue:blue": 1
        }
      ]
    },
    "portrait": {
      "assetId": "Troop_K14_04",
      "troopId": 6098,
      "manaColors": [
        "Blue"
      ],
      "rank": "杂兵",
      "form": "人形",
      "role": "Generator",
      "portraitUrl": "/static/portraits/Troop_K14_04.webp",
      "review": "thumbnail-reviewed",
      "contentHash": "9eee0d93863f88413ba4fde3da7dd0a3616e217b3a4ec8a2fffcc93729ef3276"
    },
    "portraitSha256": "9eee0d93863f88413ba4fde3da7dd0a3616e217b3a4ec8a2fffcc93729ef3276",
    "stats": {
      "1@1": {
        "hp": 3,
        "armor": 1,
        "attack": 2,
        "magic": 0
      },
      "20@1": {
        "hp": 20,
        "armor": 10,
        "attack": 10,
        "magic": 0
      },
      "20@1.5": {
        "hp": 30,
        "armor": 15,
        "attack": 15,
        "magic": 0
      },
      "7@1.3": {
        "hp": 9,
        "armor": 3,
        "attack": 4,
        "magic": 0
      }
    },
    "segments": [
      {
        "kind": "gem",
        "params": {
          "op": "clear",
          "mode": "destroy",
          "target": {
            "kind": "area",
            "shape": "row3",
            "center": "CELL"
          }
        }
      }
    ],
    "rawSource": {
      "englishSpell": {
        "name": "Pitchfork",
        "desc": "Destroy a Gem and the Gems either side of it.",
        "id": 7000
      },
      "nativeSpell": {
        "Id": 7000,
        "Cost": 3,
        "Target": "Board",
        "SpellSteps": [
          {
            "Amount": 1,
            "BoardTarget": "Block3x1",
            "Type": "DestroyGems"
          }
        ]
      },
      "traits": [
        {
          "code": "greedy",
          "englishDescription": "Gain 2 bonus Gold on 4 or 5 Gem matches.",
          "native": {
            "Activation": "four_or_five_of_a_kind",
            "Code": "greedy",
            "Description": "[TRAIT_GREEDY_DESC]",
            "Filter": "self_player",
            "Image": "greedy",
            "Modifier": 2,
            "Name": "[TRAIT_GREEDY]",
            "TraitType": "bonus_gold",
            "Trigger": "self_player"
          }
        },
        {
          "code": "waterheart",
          "englishDescription": "Gain 1 Life for each Blue ally.",
          "native": {
            "Activation": "start_battle",
            "Code": "waterheart",
            "Description": "[TRAIT_WATERHEART_DESC]",
            "Filter": "0",
            "Image": "waterheart",
            "Modifier": 1,
            "Name": "[TRAIT_WATERHEART]",
            "TraitType": "adjust_life_per_ally",
            "Trigger": "none"
          }
        },
        {
          "code": "jinx",
          "englishDescription": "Halve enemy Gem Masteries.",
          "native": {
            "Activation": "start_battle",
            "Code": "jinx",
            "Description": "[TRAIT_JINX_DESC]",
            "Filter": "other_player",
            "Image": "jinx",
            "Modifier": 0.5,
            "Name": "[TRAIT_JINX]",
            "TraitType": "adjust_all_masteries",
            "Trigger": "none"
          }
        }
      ]
    },
    "nativeEvidence": [
      {
        "testFile": "tests/unit/gowPeasantWholeSkillAudit.test.ts",
        "fullName": "Peasant 6098: Pitchfork complete stored-snapshot review cross-checks source, official historical wording, native geometry and final registered spell",
        "clausesCovered": [
          "destroy chosen gem and horizontal neighbors; source cost 3",
          "source cost, colors and registered native prototype"
        ],
        "limits": [
          "Native source/prototype evidence. This assertion does not execute an ST blueprint or prove all native trait triggers."
        ]
      },
      {
        "testFile": "tests/unit/gowPeasantWholeSkillAudit.test.ts",
        "fullName": "Peasant 6098: Pitchfork complete stored-snapshot review center with no Blue gems in the row destroys three and spends exactly 3 mana",
        "clausesCovered": [
          "specific native battle boundary: center with no Blue gems in the row destroys three and spends exactly 3 mana"
        ],
        "limits": [
          "One named boundary only; additional parameterized native cases remain in this suite. ST mapping and whole-enemy acceptance remain separate."
        ]
      }
    ],
    "nativeCases": [
      {
        "testFile": "tests/unit/gowPeasantWholeSkillAudit.test.ts",
        "line": 31,
        "fullName": "Peasant 6098: Pitchfork complete stored-snapshot review cross-checks source, official historical wording, native geometry and final registered spell"
      },
      {
        "testFile": "tests/unit/gowPeasantWholeSkillAudit.test.ts",
        "line": 43,
        "fullNameTemplate": "Peasant 6098: Pitchfork complete stored-snapshot review ${side} cell ${row},${col}: only selected gem and horizontal neighbours destroyed"
      },
      {
        "testFile": "tests/unit/gowPeasantWholeSkillAudit.test.ts",
        "line": 57,
        "fullName": "Peasant 6098: Pitchfork complete stored-snapshot review center with no Blue gems in the row destroys three and spends exactly 3 mana"
      },
      {
        "testFile": "tests/unit/gowPeasantWholeSkillAudit.test.ts",
        "line": 60,
        "fullName": "Peasant 6098: Pitchfork complete stored-snapshot review calls chooser once for board-target anchor"
      },
      {
        "testFile": "tests/unit/gowPeasantWholeSkillAudit.test.ts",
        "line": 67,
        "fullNameTemplate": "Peasant 6098: Pitchfork complete stored-snapshot review ${mode}: blocks cast and turn change"
      }
    ],
    "remainingStObligations": [
      "source portrait, rarity and complete ordinary traits",
      "ST context, identity and source affinities",
      "multi-level and difficulty panel scaling",
      "actual assembled cast including required target/color/board choice",
      "trait-plus-active interaction and family boundaries",
      "descriptions and tactical role",
      "save/reopen deterministic continuation",
      "invalid-action atomicity",
      "independent per-source review"
    ],
    "reviewState": "mapped-not-accepted",
    "sourceRefs": [
      "src/data/troops.json#6098",
      "src/data/troop-progression.json#6098",
      "data/raw/troops.gow.en.json#troops[Id=6098]",
      "data/raw/spells.gow.en.json#spells[Id=7000]",
      "src/data/traits.json#greedy",
      "src/data/traits.json#waterheart",
      "src/data/traits.json#jinx",
      "src/sillytavern/data/portraits.json#entries[troopId=6098]",
      "game-assets/public/static/portraits/Troop_K14_04.webp",
      "src/engine/skills/curated/batch-r22.ts#7000",
      "data/raw/gow-2026-09-18/traits.en.json#traits[RawData.Code=greedy]",
      "data/raw/gow-2026-09-18/traits.en.json#traits[RawData.Code=waterheart]",
      "data/raw/gow-2026-09-18/traits.en.json#traits[RawData.Code=jinx]"
    ],
    "activeExpected": {
      "spellId": 7000,
      "requiredChoice": "cell",
      "target": "chosen-cell-and-horizontal-neighbors",
      "formula": "destroy in-bounds cells (row,col-1), (row,col), (row,col+1)",
      "parameters": {
        "shape": "row3",
        "clipToBoard": true,
        "interiorCount": 3,
        "horizontalEdgeCount": 2,
        "baseManaCost": 3
      },
      "examples": [
        {
          "row": 3,
          "col": 3,
          "expectedCells": [
            [
              3,
              2
            ],
            [
              3,
              3
            ],
            [
              3,
              4
            ]
          ]
        },
        {
          "row": 0,
          "col": 0,
          "expectedCells": [
            [
              0,
              0
            ],
            [
              0,
              1
            ]
          ]
        },
        {
          "row": 0,
          "col": 7,
          "expectedCells": [
            [
              0,
              6
            ],
            [
              0,
              7
            ]
          ]
        }
      ]
    },
    "nativeCaseMatrix": {
      "sides": [
        "Left",
        "Right"
      ],
      "cells": [
        [
          3,
          3
        ],
        [
          0,
          0
        ],
        [
          0,
          7
        ],
        [
          7,
          1
        ],
        [
          7,
          6
        ]
      ],
      "blocked": [
        "silence",
        "low-mana"
      ],
      "cellChooserCalls": 1
    },
    "traitNativeEvidence": [
      {
        "testFile": "tests/unit/traitEconomyAura.test.ts",
        "line": 108,
        "fullName": "applyBigMatchTriggers / applyColorMatchTriggers（纯函数层） greedy：4 连入账 2 黄金；5 连同样触发（「4 或 5 颗」= 任意大连）",
        "scope": "exact-native-trait",
        "clausesCovered": [
          "Greedy size-4 and size-5 each credits 2 Gold; size-4 event belongs to Left"
        ],
        "limits": [
          "Pure helper; Right source ownership/cast cascades/ST restoration remain separate."
        ]
      },
      {
        "testFile": "tests/unit/traits.test.ts",
        "line": 771,
        "fullName": "回合开始与战斗开始特质 水系之心按蓝色盟友数量叠加生命",
        "scope": "exact-native-trait",
        "clausesCovered": [
          "Water Heart counts allied Blue characters including self; hp/maxHp +2; other ally unchanged"
        ],
        "limits": [
          "Exact Water Heart startup counts self; not Peasant plus active or reopen."
        ]
      },
      {
        "testFile": "tests/unit/traitCombatMechs.test.ts",
        "line": 308,
        "fullName": "TurnEngine 集成：jinx 敌方宝石灵力减半 敌方持有 jinx：同局面首位红盟友只 +2（floor(4×0.5)，宝石灵力减半）",
        "scope": "exact-native-trait",
        "clausesCovered": [
          "Opposing Jinx changes base 4 Red match mana to floor(4*0.5)=2"
        ],
        "limits": [
          "Not Peasant destruction credits or ST continuation."
        ]
      },
      {
        "testFile": "tests/unit/traitCombatMechs.test.ts",
        "line": 325,
        "fullName": "TurnEngine 集成：jinx 敌方宝石灵力减半 官方 Activation=start_battle：开局快照全场持续，jinx 持有者离场抑制不解除",
        "scope": "exact-native-trait",
        "clausesCovered": [
          "Jinx start snapshot persists after holder is defeated and removed"
        ],
        "limits": [
          "ST restored snapshot remains separate."
        ]
      }
    ],
    "recommendedStCases": [
      {
        "id": "edges-and-blue-refill",
        "setup": "All four corners and interior anchors; Blue/non-Blue controlled cells",
        "expected": "Only clipped horizontal row3 destroyed; no direct skill damage/explode; spend 3 then credit actual Blue refill, not unconditional final mana 0."
      },
      {
        "id": "greedy-jinx-side",
        "setup": "Right Peasant, controlled four/five matches, opposing mana receiver; reopen then remove holder",
        "expected": "Greedy credits base 2 Gold per qualifying own-side match to Right under existing economy rules; Jinx floors opposing base mana by 0.5 and persists as startup snapshot."
      },
      {
        "id": "waterheart-invalid-cell",
        "setup": "Living Blue/non-Blue allies; canceled/invalid/out-of-board anchors before and after reopen",
        "expected": "Water Heart raises only self hp/maxHp by Blue ally count including self; invalid actions preserve full state including mana/economy/RNG."
      }
    ],
    "remainingGaps": [
      "Pitchfork suite has no source traits; mana=0 center case intentionally has no Blue row gems and does not prove refill behavior.",
      "Top corners and two bottom interior cells are tested; bottom corners, empty anchors, cancellation and malformed/out-of-board cells are absent.",
      "Jinx reference proves match suppression and persistent startup snapshot, not Peasant destruction credit or ST save/reopen."
    ]
  },
  {
    "enemyId": 6105,
    "referenceName": "Ragnagord",
    "sourceTroop": {
      "id": 6105,
      "name": "拉格纳戈德",
      "referenceName": "Ragnagord",
      "rarity": "UltraRare",
      "rarityIdx": 3,
      "kingdom": "卜筮之原",
      "kingdomId": 3028,
      "troopTypes": [
        "Wildfolk"
      ],
      "role": "Generator",
      "attack": 17,
      "armor": 11,
      "health": 24,
      "magic": 5,
      "base": {
        "attack": 4,
        "armor": 1,
        "health": 6,
        "magic": 1
      },
      "manaColors": [
        "Red",
        "Brown"
      ],
      "manaCost": 14,
      "spell": {
        "id": 7171,
        "name": "闪电攻击",
        "description": "随机爆破 [魔法 + 2] 颗选定颜色的宝石。",
        "meta": {
          "scalings": [
            {
              "base": 2,
              "mult": 1
            }
          ],
          "raw": "随机爆破 [魔法 + 2] 颗选定颜色的宝石。",
          "parsed": true
        }
      },
      "traits": [
        {
          "code": "wildfolkbond",
          "name": "蛮族族亲",
          "description": "蛮族盟友获得 2 点生命值。"
        },
        {
          "code": "fast",
          "name": "快速",
          "description": "战斗开始时获得 50% 法力值。"
        },
        {
          "code": "firespirit",
          "name": "火焰之灵",
          "description": "每有一名红色盟友则获得 1 点魔力值。"
        }
      ],
      "portrait": "Troop_K04_04"
    },
    "sourceTraits": [
      {
        "code": "wildfolkbond",
        "name": "蛮族族亲",
        "description": "蛮族盟友获得 2 点生命值。",
        "troops": 15,
        "typeAura": {
          "troopType": "Wildfolk",
          "stat": "hp",
          "amount": 2
        }
      },
      {
        "code": "fast",
        "name": "快速",
        "description": "战斗开始时获得 50% 法力值。",
        "troops": 68,
        "battleStartManaRatio": 0.5
      },
      {
        "code": "firespirit",
        "name": "火焰之灵",
        "description": "每有一名红色盟友则获得 1 点魔力值。",
        "troops": 16,
        "perAllyColor": {
          "color": "Red",
          "stat": "magic",
          "amount": 1
        }
      }
    ],
    "progression": {
      "growth": {
        "health": [
          0,
          1,
          0,
          1,
          0,
          1,
          0,
          1,
          0,
          1,
          1,
          0,
          1,
          0,
          0,
          2,
          2,
          2,
          2,
          3
        ],
        "armor": [
          0,
          0,
          0,
          1,
          0,
          0,
          1,
          0,
          0,
          1,
          0,
          1,
          0,
          1,
          0,
          1,
          1,
          1,
          1,
          1
        ],
        "attack": [
          0,
          0,
          1,
          0,
          1,
          0,
          0,
          0,
          1,
          1,
          0,
          0,
          0,
          0,
          1,
          1,
          2,
          1,
          2,
          2
        ],
        "magic": [
          0,
          0,
          0,
          0,
          1,
          0,
          0,
          0,
          0,
          1,
          0,
          0,
          0,
          0,
          1,
          0,
          0,
          0,
          0,
          1
        ]
      },
      "traits": [
        {
          "minor:red": 16,
          "runic:red": 8,
          "runic:brown": 8
        },
        {
          "minor:red": 22,
          "major:red": 8,
          "arcane:red:brown": 8
        },
        {
          "minor:red": 28,
          "arcane:red:brown": 4,
          "celestial": 1
        }
      ]
    },
    "portrait": {
      "assetId": "Troop_K04_04",
      "troopId": 6105,
      "manaColors": [
        "Red",
        "Brown"
      ],
      "rank": "首领",
      "form": "类人",
      "role": "Generator",
      "portraitUrl": "/static/portraits/Troop_K04_04.webp",
      "review": "thumbnail-reviewed",
      "contentHash": "a62bbeb4d8d234cb600bc4d39b620151ff431beb6f93e042583ec7f3938a0a3c"
    },
    "portraitSha256": "a62bbeb4d8d234cb600bc4d39b620151ff431beb6f93e042583ec7f3938a0a3c",
    "stats": {
      "1@1": {
        "hp": 6,
        "armor": 1,
        "attack": 4,
        "magic": 1
      },
      "20@1": {
        "hp": 24,
        "armor": 11,
        "attack": 17,
        "magic": 5
      },
      "20@1.5": {
        "hp": 36,
        "armor": 17,
        "attack": 26,
        "magic": 8
      },
      "7@1.3": {
        "hp": 12,
        "armor": 4,
        "attack": 8,
        "magic": 3
      }
    },
    "segments": [
      {
        "kind": "gem",
        "params": {
          "op": "clear",
          "mode": "explode",
          "target": {
            "kind": "randomGems",
            "count": {
              "base": 2,
              "mult": 1
            },
            "include": "color",
            "color": "CHOSEN"
          }
        }
      }
    ],
    "rawSource": {
      "englishSpell": {
        "name": "Blitz 'Em",
        "desc": "Explode [Magic + 2] Gems of a chosen Color.",
        "id": 7171
      },
      "nativeSpell": {
        "Id": 7171,
        "Cost": 14,
        "Target": "ManaGemsOnly",
        "SpellSteps": [
          {
            "SpellPowerMultiplier": 1,
            "Color1": "FromTarget",
            "Amount": 2,
            "Primarypower": true,
            "Type": "ExplodeColor"
          }
        ]
      },
      "traits": [
        {
          "code": "wildfolkbond",
          "englishDescription": "Allied Wildfolk gain 2 Life.",
          "native": {
            "Activation": "start_battle",
            "Code": "wildfolkbond",
            "Description": "[TRAIT_WILDFOLKBOND_DESC]",
            "Filter": "wildfolk",
            "Image": "wildfolkbond",
            "Modifier": 2,
            "Name": "[TRAIT_WILDFOLKBOND]",
            "TraitType": "adjust_allies_life",
            "Trigger": "none"
          }
        },
        {
          "code": "fast",
          "englishDescription": "Start battles with 50% Mana.",
          "native": {
            "Activation": "start_battle",
            "Code": "fast",
            "Description": "[TRAIT_FAST_DESC]",
            "Image": "fast",
            "Modifier": 0.5,
            "Name": "[TRAIT_FAST]",
            "TraitType": "set_mana_percentage",
            "Trigger": "none"
          }
        },
        {
          "code": "firespirit",
          "englishDescription": "Gain 1 Magic for each Red ally.",
          "native": {
            "Activation": "start_battle",
            "Code": "firespirit",
            "Description": "[TRAIT_FIRESPIRIT_DESC]",
            "Filter": "2",
            "Image": "firespirit",
            "Modifier": 1,
            "Name": "[TRAIT_FIRESPIRIT]",
            "TraitType": "adjust_magic_per_ally",
            "Trigger": "none"
          }
        }
      ]
    },
    "nativeEvidence": [
      {
        "testFile": "tests/unit/gowRagnagordWholeSkillAudit.test.ts",
        "fullName": "Ragnagord 6105: Blitz Em complete stored-snapshot review cross-checks current stored English/native step, final registry and historical official randomized wording",
        "clausesCovered": [
          "explode random Magic+2 gems of chosen color, capped by pool",
          "source cost, colors and registered native prototype"
        ],
        "limits": [
          "Native source/prototype evidence. This assertion does not execute an ST blueprint or prove all native trait triggers."
        ]
      },
      {
        "testFile": "tests/unit/gowRagnagordWholeSkillAudit.test.ts",
        "fullName": "Ragnagord 6105: Blitz Em complete stored-snapshot review absent chosen color explodes nothing but spends the cast",
        "clausesCovered": [
          "specific native battle boundary: absent chosen color explodes nothing but spends the cast"
        ],
        "limits": [
          "One named boundary only; additional parameterized native cases remain in this suite. ST mapping and whole-enemy acceptance remain separate."
        ]
      }
    ],
    "nativeCases": [
      {
        "testFile": "tests/unit/gowRagnagordWholeSkillAudit.test.ts",
        "line": 27,
        "fullName": "Ragnagord 6105: Blitz Em complete stored-snapshot review cross-checks current stored English/native step, final registry and historical official randomized wording"
      },
      {
        "testFile": "tests/unit/gowRagnagordWholeSkillAudit.test.ts",
        "line": 38,
        "fullNameTemplate": "Ragnagord 6105: Blitz Em complete stored-snapshot review ${side} M=${magic} ${color}: randomly explode only chosen-color gems, capped by pool"
      },
      {
        "testFile": "tests/unit/gowRagnagordWholeSkillAudit.test.ts",
        "line": 69,
        "fullName": "Ragnagord 6105: Blitz Em complete stored-snapshot review absent chosen color explodes nothing but spends the cast"
      },
      {
        "testFile": "tests/unit/gowRagnagordWholeSkillAudit.test.ts",
        "line": 74,
        "fullName": "Ragnagord 6105: Blitz Em complete stored-snapshot review prompts for chosen color exactly once"
      },
      {
        "testFile": "tests/unit/gowRagnagordWholeSkillAudit.test.ts",
        "line": 81,
        "fullNameTemplate": "Ragnagord 6105: Blitz Em complete stored-snapshot review ${mode}: no cast or turn expenditure"
      }
    ],
    "remainingStObligations": [
      "source portrait, rarity and complete ordinary traits",
      "ST context, identity and source affinities",
      "multi-level and difficulty panel scaling",
      "actual assembled cast including required target/color/board choice",
      "trait-plus-active interaction and family boundaries",
      "descriptions and tactical role",
      "save/reopen deterministic continuation",
      "invalid-action atomicity",
      "independent per-source review"
    ],
    "reviewState": "mapped-not-accepted",
    "sourceRefs": [
      "src/data/troops.json#6105",
      "src/data/troop-progression.json#6105",
      "data/raw/troops.gow.en.json#troops[Id=6105]",
      "data/raw/spells.gow.en.json#spells[Id=7171]",
      "src/data/traits.json#wildfolkbond",
      "src/data/traits.json#fast",
      "src/data/traits.json#firespirit",
      "src/sillytavern/data/portraits.json#entries[troopId=6105]",
      "game-assets/public/static/portraits/Troop_K04_04.webp",
      "src/engine/skills/curated/batch-01.ts#7171",
      "data/raw/gow-2026-09-18/traits.en.json#traits[RawData.Code=wildfolkbond]",
      "data/raw/gow-2026-09-18/traits.en.json#traits[RawData.Code=fast]",
      "data/raw/gow-2026-09-18/traits.en.json#traits[RawData.Code=firespirit]"
    ],
    "activeExpected": {
      "spellId": 7171,
      "requiredChoice": "color",
      "target": "random-distinct-original-chosen-color-centers",
      "formula": "centers = min(effectiveMagic + 2, originalChosenColorPool); footprint = clipped union of 3x3 neighborhoods",
      "parameters": {
        "base": 2,
        "magicMultiplier": 1,
        "poolCap": true,
        "centerSampling": "without-replacement",
        "radius": 1,
        "overlap": "deduplicate-original-gem-ids"
      },
      "examples": [
        {
          "magic": 0,
          "poolSize": 5,
          "expectedCenters": 2
        },
        {
          "magic": 11,
          "poolSize": 4,
          "expectedCenters": 4
        },
        {
          "magic": 20,
          "web": true,
          "poolSize": 5,
          "expectedCenters": 2
        },
        {
          "magic": 11,
          "poolSize": 0,
          "expectedExplodeEvents": 0,
          "expectedMana": 0
        }
      ]
    },
    "nativeCaseMatrix": {
      "sides": [
        "Left",
        "Right"
      ],
      "magic": [
        0,
        1,
        11,
        20
      ],
      "presentColors": [
        "Blue",
        "Yellow"
      ],
      "absentColor": "Green",
      "blocked": [
        "silence",
        "low-mana"
      ],
      "colorChooserCalls": 1
    },
    "traitNativeEvidence": [
      {
        "testFile": "tests/unit/traits.test.ts",
        "line": 741,
        "fullName": "回合开始与战斗开始特质 骑士族亲只给同队骑士 +2 生命，不影响其它种族与敌方骑士",
        "scope": "native-family",
        "clausesCovered": [
          "Knight Bond +2 hp includes holder and same-team Knights; excludes Beast and opposing Knight"
        ],
        "limits": [
          "Beast Bond and Wildfolk Bond exact source affiliation remain ST obligations."
        ]
      },
      {
        "testFile": "tests/unit/traits.test.ts",
        "line": 814,
        "fullName": "回合开始与战斗开始特质 快速 / 赐能在 TurnEngine 构造时结算开局法力",
        "scope": "exact-native-trait",
        "clausesCovered": [
          "Fast initializes mana 5/10 in TurnEngine constructor; plain mana 0/10"
        ],
        "limits": [
          "Does not test odd cost 7 rounding or startup idempotence on ST reopen."
        ]
      },
      {
        "testFile": "tests/unit/traits.test.ts",
        "line": 771,
        "fullName": "回合开始与战斗开始特质 水系之心按蓝色盟友数量叠加生命",
        "scope": "native-family",
        "clausesCovered": [
          "Water Heart counts allied Blue characters including self; hp/maxHp +2; other ally unchanged"
        ],
        "limits": [
          "Exact Water Heart execution. Air Spirit, Nature Heart and Fire Spirit reuse is family-level evidence only."
        ]
      }
    ],
    "recommendedStCases": [
      {
        "id": "pool-web-and-overlap",
        "setup": "Chosen pools 0/1/2/below/above Magic+2, overlapping corner centers and Web",
        "expected": "Use min(effectiveMagic+2,pool) distinct centers; Web leaves fixed 2; footprint clips to board and deduplicates original gem ids."
      },
      {
        "id": "fire-spirit-fast-wildfolk",
        "setup": "Living Red/non-Red allies and Wildfolk/non-Wildfolk affiliations, fresh battle then reopen",
        "expected": "Fire Spirit counts Red allies including self before active count; Fast 7/14; Wildfolk Bond +2 hp only to allied matching affinity; no duplicate startup."
      },
      {
        "id": "rng-continuation",
        "setup": "Save immediately before explosion, reopen, identical chosen color then invalid color",
        "expected": "Identical centers/footprint/cascades/mana/events/actionLog/economy/turn and subsequent RNG; invalid choice changes none."
      }
    ],
    "remainingGaps": [
      "Native footprint oracle establishes existence of some eligible n-center subset. Overlapping footprints can alias, so exact centers and RNG sequence are not identified.",
      "Web, four other present colors, tiny positive pools, canceled/malformed colors and deterministic ST resume are absent from the named spell suite.",
      "Native suite sets Magic directly and omits source traits; Fire Spirit plus count, Wildfolk Bond affiliation and Fast plus restore need assembly proof."
    ]
  }
];

export type MappedSource = (typeof MAPPED_SOURCES)[number];

/** Full Wight source oracle for Soul Legion summons; not an eighth mapped source. */
export const WIGHT_SOURCE = {
  "enemyId": 6037,
  "referenceName": "Wight",
  "sourceTroop": {
    "id": 6037,
    "name": "幽魂",
    "referenceName": "Wight",
    "rarity": "Uncommon",
    "rarityIdx": 1,
    "kingdom": "盖塔尔",
    "kingdomId": 3020,
    "troopTypes": [
      "Undead"
    ],
    "role": "Warlock",
    "attack": 11,
    "armor": 22,
    "health": 9,
    "magic": 7,
    "base": {
      "attack": 2,
      "armor": 2,
      "health": 2,
      "magic": 1
    },
    "manaColors": [
      "Blue",
      "Red"
    ],
    "manaCost": 10,
    "spell": {
      "id": 7037,
      "name": "耗尽生命",
      "description": "窃取 1 名敌军 [魔法 + 1] 点生命值。创造 5 颗紫色宝石。获得 [魔法 + 1] 个灵魂。",
      "meta": {
        "scalings": [
          {
            "base": 1,
            "mult": 1
          },
          {
            "base": 1,
            "mult": 1
          }
        ],
        "raw": "窃取 1 名敌军 [魔法 + 1] 点生命值。创造 5 颗紫色宝石。获得 [魔法 + 1] 个灵魂。",
        "parsed": true
      }
    },
    "traits": [
      {
        "code": "waterlink",
        "name": "水系灵链",
        "description": "在配对蓝色宝石时获得额外的蓝色法力值。"
      },
      {
        "code": "lifedrain",
        "name": "吸收生命",
        "description": "当敌人身亡时获得 4 点生命值。"
      },
      {
        "code": "undying",
        "name": "不死不灭",
        "description": "对中毒、疾病、狼化和死亡标记免疫"
      }
    ],
    "portrait": "Troop_K09_01"
  },
  "sourceTraits": [
    {
      "code": "waterlink",
      "name": "水系灵链",
      "description": "在配对蓝色宝石时获得额外的蓝色法力值。",
      "troops": 35,
      "manaLink": {
        "color": "Blue",
        "amount": 1
      }
    },
    {
      "code": "lifedrain",
      "name": "吸收生命",
      "description": "当敌人身亡时获得 4 点生命值。",
      "troops": 18,
      "onEnemyDeathGain": {
        "stat": "hp",
        "amount": 4
      }
    },
    {
      "code": "undying",
      "name": "不死不灭",
      "description": "对中毒、疾病、狼化和死亡标记免疫",
      "troops": 150,
      "statusImmunities": [
        "poison",
        "death-mark",
        "disease",
        "wolf",
        "wolf-form",
        "lycanthropy"
      ]
    }
  ],
  "progression": {
    "growth": {
      "health": [
        0,
        0,
        0,
        0,
        1,
        0,
        0,
        0,
        0,
        1,
        0,
        0,
        0,
        0,
        1,
        0,
        1,
        1,
        1,
        1
      ],
      "armor": [
        0,
        1,
        1,
        0,
        1,
        1,
        0,
        1,
        1,
        1,
        1,
        1,
        0,
        1,
        0,
        2,
        2,
        2,
        2,
        2
      ],
      "attack": [
        0,
        0,
        0,
        1,
        0,
        0,
        1,
        0,
        0,
        1,
        0,
        0,
        1,
        0,
        0,
        1,
        1,
        1,
        1,
        1
      ],
      "magic": [
        0,
        0,
        0,
        1,
        0,
        0,
        1,
        0,
        0,
        1,
        0,
        0,
        0,
        0,
        1,
        0,
        0,
        1,
        0,
        1
      ]
    },
    "traits": [
      {
        "minor:red": 12,
        "major:red": 4,
        "major:blue": 4
      },
      {
        "minor:red": 16,
        "runic:red": 4,
        "runic:blue": 4
      },
      {
        "minor:red": 20,
        "major:red": 6,
        "arcane:blue:red": 2
      }
    ]
  },
  "portrait": {
    "assetId": "Troop_K09_01",
    "troopId": 6037,
    "manaColors": [
      "Red",
      "Blue"
    ],
    "rank": "杂兵",
    "form": "人形",
    "role": "Warlock",
    "portraitUrl": "/static/portraits/Troop_K09_01.webp",
    "review": "thumbnail-reviewed",
    "contentHash": "7222cd8ba0612c0efae1feba124a9c65fcef11855e86e0979c799b3089ed46bc"
  },
  "portraitSha256": "7222cd8ba0612c0efae1feba124a9c65fcef11855e86e0979c799b3089ed46bc",
  "stats": {
    "1@1": {
      "hp": 2,
      "armor": 2,
      "attack": 2,
      "magic": 1
    },
    "20@1": {
      "hp": 9,
      "armor": 22,
      "attack": 11,
      "magic": 7
    },
    "20@1.5": {
      "hp": 14,
      "armor": 33,
      "attack": 17,
      "magic": 11
    },
    "7@1.3": {
      "hp": 4,
      "armor": 8,
      "attack": 5,
      "magic": 4
    }
  },
  "sourceRefs": [
    "src/data/troops.json#6037",
    "src/data/traits.json#waterlink",
    "src/data/traits.json#lifedrain",
    "src/data/traits.json#undying",
    "src/data/troop-progression.json#6037",
    "src/sillytavern/data/portraits.json#entries[troopId=6037]",
    "game-assets/public/static/portraits/Troop_K09_01.webp"
  ],
  "usage": "Independent source oracle for KeeperOfSouls Soul Legion -> Wight (6037). Stats follow MAPPED_SOURCES level/difficulty convention before passives; summon level, scaling and initialization must be asserted against the ST summon contract."
};
