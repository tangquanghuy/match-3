import test from 'node:test';
import assert from 'node:assert/strict';
import { compareTroops } from './audit-live-gowhead-troops.mjs';

const en = {
  id: 6000, ReferenceName: 'Ogre', name_localized: 'Ogre', RarityIdx: 0, KingdomId: 3000,
  TroopType: 'Giant', TroopType2: null, _TroopRole_parsed: ['Generator'],
  Attack: 14, Armor: 10, Health: 22, Magic: 0, ManaCost: 6,
  mana_colors: ['ColorBlue'], SpellId: 7131, FileBase: 'Troop_K00_00',
  stats: { role: 'Generator', spell: { name: 'Smash', desc: 'Explode 2 Gems.' }, traits: [
    { code: 'frenzy', name: 'Frenzy', description: 'Gain 1 Attack.' },
  ] },
};
const local = {
  id: 6000, referenceName: 'Ogre', name: '食人魔', rarityIdx: 0, kingdomId: 3000,
  troopTypes: ['Giant'], role: 'Generator', attack: 14, armor: 10, health: 22, magic: 0,
  manaCost: 6, manaColors: ['Blue'], spell: { id: 7131, name: '粉碎', description: '爆破 2 颗宝石。' },
  portrait: 'Troop_K00_00', traits: [{ code: 'frenzy', name: '狂暴', description: '获得 1 点攻击。' }],
};

test('English fallback in live zh does not create fake translation errors', () => {
  const result = compareTroops([local], [en], [structuredClone(en)]);
  assert.equal(result.summary.zhFallsBackToEnglish, true);
  assert.equal(result.summary.fieldDifferences, 0);
  assert.equal(result.summary.translationPairs, 5);
  assert.equal(result.summary.troopsWithReviewFlags, 0);
});

test('runtime data discrepancy and missing live ID are kept separate', () => {
  const changed = { ...local, armor: 15 };
  const missing = { ...local, id: 6001 };
  const result = compareTroops([changed, missing], [en, { ...en, id: 6002 }], [en, { ...en, id: 6002 }]);
  assert.equal(result.summary.fieldDifferences, 1);
  assert.deepEqual(result.rows[0].differences[0], {
    id: 6000, referenceName: 'Ogre', field: 'armor', type: 'data', local: 15, gowheadZh: 10, gowheadEn: 10,
  });
  assert.equal(result.rows[1].status, 'missing_en');
  assert.equal(result.summary.uninstalled, 1);
});

import { fetchPage, enrichSemanticFindings } from './audit-live-gowhead-troops.mjs';

test('request uses gowhead lang=zh, not ignored language=zh', async () => {
  const oldFetch = globalThis.fetch;
  try {
    globalThis.fetch = async (url) => {
      assert.match(url, /[?&]lang=zh(?:&|$)/u);
      assert.doesNotMatch(url, /[?&]language=/u);
      return { ok: true, json: async () => ({ data: [], total: 0, limit: 100, page: 1 }) };
    };
    await fetchPage('zh', 1);
  } finally {
    globalThis.fetch = oldFetch;
  }
});

test('Chinese queen-bee chance qualifier is reported with English/native/runtime conflict', () => {
  const queen = { ...local, id: 6863, spell: { ...local.spell, id: 8282,
    description: '额外回合与返还半数法力各有 40% 的独立几率。' } };
  const english = { ...en, id: 6863, SpellId: 8282, stats: { ...en.stats, spell: {
    name: 'Nest', desc: 'There are independent 40% chances, to gain an extra turn and half my mana back.' } } };
  const chinese = { ...english, stats: { ...english.stats, spell: { name: '蜂窝',
    desc: '有 40% 个别几率获得一个额外回合和半数法力值，几率因棕色宝石数而增强。' } } };
  const compared = compareTroops([queen], [english], [chinese]);
  const findings = enrichSemanticFindings(compared.rows, [queen], [english], [chinese], [
    { id: 8282, RawData: JSON.stringify({ SpellSteps: [
      { Type: 'ExtraTurnConditional', Amount: 40 }, { Type: 'GenerateHalfMana', PercentageChance: 40 },
    ] }) },
  ], { 8282: { segments: [{ kind: 'extraTurn', chance: 0.4 }] } });
  assert.equal(findings.length, 1);
  assert.equal(findings[0].kind, 'chinese_source_vs_english_native_conflict');
  assert.equal(findings[0].nativeCountGemsForColor, false);
  assert.deepEqual(findings[0].runtimeExtraTurnSegments, [{ kind: 'extraTurn', chance: 0.4 }]);
});

test('role code stays consistent while Chinese UI label difference is tracked', () => {
  const source = { ...en, stats: { ...en.stats, role: { code: 'Generator', name: 'Generator' } } };
  const zh = { ...source, stats: { ...source.stats, role: { code: 'Generator', name: '生成者' } } };
  const result = compareTroops([local], [source], [zh], { roleNames: { Generator: '供魔' } });
  assert.equal(result.rows[0].differences.find((d) => d.field === 'role'), undefined);
  assert.equal(result.rows[0].differences.find((d) => d.field === 'role.display')?.type, 'label_review');
});
