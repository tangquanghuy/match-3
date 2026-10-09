/** Historical base kingdom-team bonuses from in-game observations (2016), separate from level/pets.
 * Source: https://community.gemsofwar.com/t/all-troop-type-kingdom-bonuses-2-0-updated/1032
 * Name mapping: data/raw/gow-2026-09-18/kingdoms.en.json + src/data/troops.json (KingdomId).
 * This is NOT a current-game prestige tier table. */
export const KINGDOM_TEAM_BASE: Readonly<Record<string, readonly [{ health: number; armor: number; attack: number; magic: number }, { health: number; armor: number; attack: number; magic: number }, { health: number; armor: number; attack: number; magic: number }]>> = {
  "\u51b0\u5cf0\u4e4b\u5dc5": [
    {
      "health": 0,
      "armor": 2,
      "attack": 0,
      "magic": 0
    },
    {
      "health": 0,
      "armor": 2,
      "attack": 0,
      "magic": 1
    },
    {
      "health": 0,
      "armor": 2,
      "attack": 0,
      "magic": 2
    }
  ],
  "\u5251\u950b\u5d16": [
    {
      "health": 0,
      "armor": 2,
      "attack": 0,
      "magic": 0
    },
    {
      "health": 0,
      "armor": 6,
      "attack": 0,
      "magic": 0
    },
    {
      "health": 0,
      "armor": 10,
      "attack": 0,
      "magic": 0
    }
  ],
  "\u52a0\u5c14\u51e1\u5c3c\u4e9a": [
    {
      "health": 1,
      "armor": 1,
      "attack": 0,
      "magic": 0
    },
    {
      "health": 1,
      "armor": 1,
      "attack": 0,
      "magic": 1
    },
    {
      "health": 2,
      "armor": 4,
      "attack": 0,
      "magic": 1
    }
  ],
  "\u535c\u7b6e\u4e4b\u539f": [
    {
      "health": 0,
      "armor": 0,
      "attack": 1,
      "magic": 0
    },
    {
      "health": 2,
      "armor": 0,
      "attack": 2,
      "magic": 0
    },
    {
      "health": 4,
      "armor": 0,
      "attack": 3,
      "magic": 0
    }
  ],
  "\u5361\u5176\u5c14": [
    {
      "health": 2,
      "armor": 0,
      "attack": 0,
      "magic": 0
    },
    {
      "health": 4,
      "armor": 2,
      "attack": 0,
      "magic": 0
    },
    {
      "health": 6,
      "armor": 4,
      "attack": 0,
      "magic": 0
    }
  ],
  "\u5361\u62c9\u8003\u65af": [
    {
      "health": 2,
      "armor": 0,
      "attack": 0,
      "magic": 0
    },
    {
      "health": 2,
      "armor": 0,
      "attack": 0,
      "magic": 1
    },
    {
      "health": 2,
      "armor": 0,
      "attack": 0,
      "magic": 2
    }
  ],
  "\u6bdb\u683c\u745e\u59c6\u68ee\u6797": [
    {
      "health": 0,
      "armor": 0,
      "attack": 1,
      "magic": 0
    },
    {
      "health": 2,
      "armor": 0,
      "attack": 2,
      "magic": 0
    },
    {
      "health": 2,
      "armor": 0,
      "attack": 4,
      "magic": 0
    }
  ],
  "\u6df7\u6c8c": [
    {
      "health": 2,
      "armor": 0,
      "attack": 0,
      "magic": 0
    },
    {
      "health": 4,
      "armor": 2,
      "attack": 0,
      "magic": 0
    },
    {
      "health": 7,
      "armor": 3,
      "attack": 0,
      "magic": 0
    }
  ],
  "\u6f58\u795e\u4e4b\u8c37": [
    {
      "health": 2,
      "armor": 0,
      "attack": 0,
      "magic": 0
    },
    {
      "health": 3,
      "armor": 3,
      "attack": 0,
      "magic": 0
    },
    {
      "health": 5,
      "armor": 5,
      "attack": 0,
      "magic": 0
    }
  ],
  "\u72c2\u91ce\u5e73\u539f": [
    {
      "health": 2,
      "armor": 0,
      "attack": 0,
      "magic": 0
    },
    {
      "health": 4,
      "armor": 0,
      "attack": 1,
      "magic": 0
    },
    {
      "health": 6,
      "armor": 0,
      "attack": 2,
      "magic": 0
    }
  ],
  "\u767d\u76d4\u56fd": [
    {
      "health": 0,
      "armor": 2,
      "attack": 0,
      "magic": 0
    },
    {
      "health": 2,
      "armor": 2,
      "attack": 1,
      "magic": 0
    },
    {
      "health": 2,
      "armor": 2,
      "attack": 1,
      "magic": 1
    }
  ],
  "\u76d6\u5854\u5c14": [
    {
      "health": 0,
      "armor": 2,
      "attack": 0,
      "magic": 0
    },
    {
      "health": 0,
      "armor": 2,
      "attack": 0,
      "magic": 1
    },
    {
      "health": 0,
      "armor": 6,
      "attack": 0,
      "magic": 1
    }
  ],
  "\u7834\u788e\u5c16\u5854": [
    {
      "health": 2,
      "armor": 0,
      "attack": 0,
      "magic": 0
    },
    {
      "health": 4,
      "armor": 0,
      "attack": 1,
      "magic": 0
    },
    {
      "health": 6,
      "armor": 0,
      "attack": 2,
      "magic": 0
    }
  ],
  "\u805a\u6c99\u4e4b\u5730": [
    {
      "health": 0,
      "armor": 0,
      "attack": 1,
      "magic": 0
    },
    {
      "health": 1,
      "armor": 1,
      "attack": 2,
      "magic": 0
    },
    {
      "health": 3,
      "armor": 1,
      "attack": 3,
      "magic": 0
    }
  ],
  "\u8346\u68d8\u68ee\u6797": [
    {
      "health": 1,
      "armor": 1,
      "attack": 0,
      "magic": 0
    },
    {
      "health": 2,
      "armor": 2,
      "attack": 1,
      "magic": 0
    },
    {
      "health": 3,
      "armor": 3,
      "attack": 2,
      "magic": 0
    }
  ],
  "\u8352\u829c\u4e4b\u5730": [
    {
      "health": 0,
      "armor": 0,
      "attack": 1,
      "magic": 0
    },
    {
      "health": 0,
      "armor": 0,
      "attack": 1,
      "magic": 1
    },
    {
      "health": 0,
      "armor": 0,
      "attack": 3,
      "magic": 1
    }
  ],
  "\u8363\u8000\u4e4b\u5730": [
    {
      "health": 0,
      "armor": 0,
      "attack": 1,
      "magic": 0
    },
    {
      "health": 0,
      "armor": 0,
      "attack": 3,
      "magic": 0
    },
    {
      "health": 0,
      "armor": 0,
      "attack": 5,
      "magic": 0
    }
  ],
  "\u845b\u6d1b\u4ec0\u5948\u514b": [
    {
      "health": 0,
      "armor": 0,
      "attack": 1,
      "magic": 0
    },
    {
      "health": 2,
      "armor": 0,
      "attack": 2,
      "magic": 0
    },
    {
      "health": 2,
      "armor": 0,
      "attack": 4,
      "magic": 0
    }
  ],
  "\u86db\u5c14\u5361\u91cc": [
    {
      "health": 0,
      "armor": 0,
      "attack": 1,
      "magic": 0
    },
    {
      "health": 0,
      "armor": 0,
      "attack": 1,
      "magic": 1
    },
    {
      "health": 0,
      "armor": 0,
      "attack": 1,
      "magic": 2
    }
  ],
  "\u963f\u8fbe\u7eb3": [
    {
      "health": 0,
      "armor": 2,
      "attack": 0,
      "magic": 0
    },
    {
      "health": 0,
      "armor": 4,
      "attack": 1,
      "magic": 0
    },
    {
      "health": 0,
      "armor": 6,
      "attack": 2,
      "magic": 0
    }
  ],
  "\u98ce\u66b4\u5ce1\u6e7e": [
    {
      "health": 2,
      "armor": 0,
      "attack": 0,
      "magic": 0
    },
    {
      "health": 6,
      "armor": 0,
      "attack": 0,
      "magic": 0
    },
    {
      "health": 10,
      "armor": 0,
      "attack": 0,
      "magic": 0
    }
  ],
  "\u9cde\u96fe\u6cbc\u6cfd": [
    {
      "health": 2,
      "armor": 0,
      "attack": 0,
      "magic": 0
    },
    {
      "health": 2,
      "armor": 0,
      "attack": 0,
      "magic": 1
    },
    {
      "health": 6,
      "armor": 0,
      "attack": 0,
      "magic": 1
    }
  ],
  "\u9ed1\u77f3": [
    {
      "health": 0,
      "armor": 0,
      "attack": 1,
      "magic": 0
    },
    {
      "health": 0,
      "armor": 2,
      "attack": 2,
      "magic": 0
    },
    {
      "health": 0,
      "armor": 4,
      "attack": 3,
      "magic": 0
    }
  ],
  "\u9f50\u57c3\u91d1": [
    {
      "health": 2,
      "armor": 0,
      "attack": 0,
      "magic": 0
    },
    {
      "health": 2,
      "armor": 0,
      "attack": 2,
      "magic": 0
    },
    {
      "health": 4,
      "armor": 0,
      "attack": 3,
      "magic": 0
    }
  ]
} as const;
