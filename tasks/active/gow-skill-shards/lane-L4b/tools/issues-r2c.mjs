export default [
  { id: 'L4b-1481-zh', key: 'weapon:1481', clause: 'display-description', expected: "'数值因地狱悬崖盟友数而增强' (kingdom 地狱悬崖 as in the next sentence)", actual: "src/data/weapons.json 8809 description writes '地域悬崖' in the first sentence", repro: 'tests/unit/gowLaneL4bB14.test.ts binding asserts the current text', layer: 'data', status: 'open' },
  { id: 'L4b-1501-zh', key: 'weapon:1501', clause: 'display-description', expected: "'伤害值因沃尔帕克盟友数而增强'", actual: "8877 description reads '伤害只因…' (只 for 值)", repro: 'not yet (not scaffolded)', layer: 'data', status: 'open' },
];
