export default [
  { id: 'L4b-7068-zh', key: 'troop:7068', clause: 'display-description', expected: "'将 5 颗绿色宝石转换成紫色法力药水，并将所有棕色宝石转换成骷髅头。净化所有妖仙盟友。' (or equivalent)", actual: "stored Chinese '将5有绿宝石都转化为紫色药水，并且所有棕色宝石都变为骷髅头。净化所有精灵同盟。' is garbled machine translation", repro: 'tests/unit/gowLaneL4bB22.test.ts binding asserts the current text', layer: 'data', status: 'open' },
];
