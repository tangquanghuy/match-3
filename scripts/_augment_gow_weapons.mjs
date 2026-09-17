// 追加已验证的补充数据到 artifacts/gow-weapons.json（官方目录 + 社区论坛/官方帖交叉验证）
// 用法：node scripts/_augment_gow_weapons.mjs
import fs from 'node:fs';

const p = 'artifacts/gow-weapons.json';
const data = JSON.parse(fs.readFileSync(p, 'utf8'));

data.supplements = {
  provenance: '以下补充数据均来自官方社区论坛（community.gemsofwar.com，Discourse JSON API 抓取）与官方站/官方新闻引句，抓取日期 2026-09-17；未经验证的来源一律不收录。',
  weaponPackByKingdom: {
    _desc: '官方帖（Saltypatra, 2019-06-25, topic 55952）：$4.99 王国武器包清单。标 ★ 的为官方站武器目录（123 把）之外新增的武器名。',
    'Broken Spire': 'Goblin Crusher',
    'Adana': 'Wrenchmaster 5000',
    'Bright Forest': 'Fey Wand ★',
    "Pan's Vale": 'Crescendo ★',
    'Zaejin': 'Boom-Boom',
    'Pridelands': 'Sun Chakram',
    "Sword's Edge": 'Order and Chaos',
    'Ghulvania': 'Chain Flail',
    'Maugrim Woods': 'Crimson Insignia（另为 PAX Aus 2015 赠品）',
    'Silverglade': 'Sun and Moon',
    'Urskaya': 'Bear Totem',
    'Glacial Peaks': "Nature's Wrath",
    'Khaziel': 'Deepstone',
    'Stormheim': 'Frostreaver',
    'Whitehelm': 'Celestial Staff',
    'Forest of Thorns': "Yasmine's Chalice",
    'Mist of Scales': 'Kris Knife',
    'Karakoth': 'Staff of Madness',
    'Grosh-Nak': 'Skull Cleaver',
    "Dragon's Claw": 'Prey Seeker',
    'Blighted Lands': 'Chaos Blade',
    'Darkstone': 'Soultrap',
    'Suncrest': 'Farsight Orb',
    'Drifting Sands': 'Sands of Time',
    'Leonis Empire': "Merchant's Blade ★",
    'Blackhawk': 'Skullblade',
    'Wild Plains': 'Bullroarer',
    'Divinion Fields': 'Eternal Flame',
    "Zhul'Kari": "Spider's Kiss",
    'Shentang': 'Festival Staff ★',
    'Dhrak-Zum': "Daemon's Leash ★",
    'Merlantis': "Undine's Trident ★",
    'Sin of Maraj': 'Tome of Sin ★',
  },
  classWeaponsConfirmed: {
    _desc: '职业专属神话武器（每职业 250 胜解锁；官方 2018-09 裁定职业武器一律单色，Flame Soul 由红/绿改回红）。多来源交叉验证。',
    'Plaguelord': 'Essence of Evil',
    'Sentinel': 'Shield of Urskaya',
    'Archmagus': 'Reflection of Good',
    'Thief': 'Skeleton Key',
    'Doomsayer': "Sins' Harvest",
    'Sunspear': 'Flame Soul（红，原红/绿被官方改回单色）',
    'Dragonguard': "Dragon's Eye（曾因 PvE 过强被平衡性下调；地下城主力）",
    'Knight': 'Serve and Protect（蓝）',
    'Priest': 'Staff of St. Astra（黄）',
    'Frostmage': 'Orb of Winter',
  },
  notableNonClassMythic: {
    _desc: '非职业向神话主角武器（论坛确认样本）。',
    'Dawnbringer': '三色神话武器，130 万灵魂购买（主角武器中少有的多色 + 高价直接购买档）',
  },
  modernUnlockLevels: {
    _desc: '官方人员 Jeto 2026-03 发布的玩家等级解锁表（武器相关条目）。',
    'PL3': 'Weapon Tempering 武器淬炼（奖励 3 Rare Ingots）——现代武器用钢锭升级',
    'PL20': 'Hero Classes 职业系统',
    'PL38': 'Soulforge Tier 1-10（500 灵魂解锁）',
    'PL45': 'Soulforge Tier 11-20（50 Cursed Runes）',
    'PL48': 'Epic Trials（100 Glory）',
  },
  classKingdomType2018: {
    _desc: '官方论坛帖 topic 44520（2018-08，27 职业）：职业-种族-王国对照。',
    Archer: 'Elf / Forest of Thorns', Assassin: 'Naga / Mist of Scales', Bard: "Wildfolk / Pan's Vale",
    Corsair: 'Rogue / Blackhawk', Deathknight: 'Undead / Ghulvania', Dervish: 'Monster / Drifting Sands',
    Dragonguard: "Dragon / Dragon's Claw", Frostmage: 'Fey / Glacial Peaks', Hierophant: 'Fey / Bright Forest',
    Knight: "Knight / Sword's Edge", Mechanist: 'Mech / Adana', Necromancer: 'Undead / Khetar',
    Oracle: 'Centaur / Divinion Fields', Orbweaver: "Elf / Zhul'Kari", Plaguelord: 'Human / Darkstone',
    Priest: 'Divine / Whitehelm', Runepriest: 'Dwarf / Khaziel', Sentinel: 'Urska / Urskaya',
    Shaman: 'Tauros / Wild Plains', Sorcerer: 'Daemon / Karakoth', Sunspear: 'Raksha / Pridelands',
    Thief: 'Goblin / Zaejin', Tidecaller: 'Merfolk / Merlantis', Titan: 'Giant / Stormheim',
    Warden: 'Beast / Maugrim Woods', Warlord: 'Giant / Broken Spire', Warpriest: 'Human / Leonis Empire',
  },
  classKingdomTypeLater: {
    _desc: '2018 之后新增职业（wiki Classes 页 2023-06 快照共 37 职业 → 差额 10 个；职业名与归属来自快照阅读记录，逐职业页可复核）。',
    Diabolist: 'Daemon / Blighted Lands', Doomsayer: 'Daemon / Sin of Maraj', Barbarian: 'Orc / Grosh-Nak',
    Monk: 'Elf / Shentang', Archmagus: 'Mystic / Silverglade', Stormcaller: 'Stryx / Suncrest',
    Slayer: 'Dwarf / Dhrak-Zum', Geomancer: 'Construct / Hellcrag', Elementalist: 'Elemental / Nexus',
    Spiritwalker: 'Wargare / Vulpacea',
  },
};

fs.writeFileSync(p, JSON.stringify(data, null, 2));
console.log('augmented. weapons:', data.weapons.length, '| supplements keys:', Object.keys(data.supplements).length);
