/**
 * 放映厅对账（窗口 G）——官方描述关键词 × 实际事件流的粗匹配。
 *
 * 任务书阶段 1.3：「伤害段数/状态施加/宝石操作计数 vs 描述里的关键词粗匹配，标记可疑项红色」。
 * 规则刻意保守：只有「描述明确要求、事件流确认为零」才记可疑；反向（事件多出）只做信息项。
 * 判定不了的（纯数值被动、无事件的减免类）归为 passive，不算可疑。
 */

/** 状态中文名 → 引擎 statusId（与 skills/effects/status.ts 的 id 对齐） */
const STATUS_KEYWORDS = [
  { re: /中毒/, id: 'poison', label: '中毒' },
  { re: /燃烧|灼烧/, id: 'burning', label: '燃烧' },
  { re: /冰冻/, id: 'frozen', label: '冰冻' },
  { re: /沉默/, id: 'silence', label: '沉默' },
  { re: /击晕|眩晕/, id: 'stun', label: '击晕' },
  { re: /缠绕/, id: 'entangle', label: '缠绕' },
  { re: /诅咒/, id: 'curse', label: '诅咒' },
  { re: /疾病/, id: 'disease', label: '疾病' },
  { re: /死亡标记/, id: 'death-mark', label: '死亡标记' },
  { re: /魅惑/, id: 'charm', label: '魅惑' },
  { re: /狂怒|激怒/, id: 'rage', label: '狂怒' },
  { re: /狼化/, id: 'lycanthropy', label: '狼化' },
  { re: /法力燃烧/, id: 'mana-burn', label: '法力燃烧' },
  { re: /织网|蛛网/, id: 'web', label: '织网' },
];

/**
 * 技能描述 → 事件流对账。
 * @param {string} desc 官方描述原文
 * @param {Array} events 裁剪后的事件流
 * @returns {{checks: Array<{label:string, expect:string, got:string, ok:boolean, info:boolean}>, suspicious: boolean, summary: string}}
 */
export function auditSkillCast(desc, events) {
  const counts = countEvents(events);
  const checks = [];
  const push = (label, expect, got, ok, info = false) => checks.push({ label, expect, got, ok, info });

  // 施放本身必须发生
  push('施放', 'skill-cast ≥1', String(counts['skill-cast'] || 0), (counts['skill-cast'] || 0) >= 1);

  const hasDesc = (re) => re.test(desc);

  // —— 伤害 ——
  if (hasDesc(/造成[^。；]*伤害/)) {
    const n = counts['skill-damage'] || 0;
    push('伤害', 'skill-damage ≥1', String(n), n >= 1);
    if (hasDesc(/所有敌人|全体敌人|每名敌人|每个敌人/)) {
      const targets = new Set(events.filter((e) => e.type === 'skill-damage').map((e) => e.targetId)).size;
      push('群体覆盖', '命中目标 ≥2', String(targets), targets >= 2);
    }
  }
  if (hasDesc(/溅射/)) {
    const n = events.filter((e) => e.type === 'skill-damage' && e.range === 'splash').length;
    push('溅射', "range='splash' ≥1", String(n), n >= 1);
  }

  // —— 状态 ——
  for (const { re, id, label } of STATUS_KEYWORDS) {
    if (hasDesc(re)) {
      const n = statusApplyCount(events, id);
      push(`状态·${label}`, `status-apply ${id} ≥1`, String(n), n >= 1);
    }
  }

  // —— 宝石操作 ——
  if (hasDesc(/创造[^。；]*(宝石|骷髅|宝石)/) || hasDesc(/变成[^。；]*宝石/)) {
    const n = (counts['gem-create'] || 0) + (counts['gem-transform'] || 0);
    const spawns = sumOf(events, 'gem-create', 'spawns');
    push('创造宝石', 'gem-create/transform ≥1', String(n), n >= 1,
      spawns > 0 ? `共 ${spawns} 颗` : false);
  }
  if (hasDesc(/转化|转换为|转成|变成/)) {
    const n = counts['gem-transform'] || 0;
    push('转化宝石', 'gem-transform ≥1', String(n), n >= 1);
  }
  if (hasDesc(/摧毁/)) {
    const nDestroy = counts['gem-destroy'] || 0;
    const nExplode = counts['gem-explode'] || 0;
    // 「爆破 X，摧毁其周围」类描述：环内摧毁常并入爆破实现（explode 自带辐射圈），
    // 有爆破事件即视为已覆盖，标注为信息项而非缺口
    const fusedIntoExplode = nDestroy === 0 && nExplode > 0 && hasDesc(/爆破|引爆/);
    push('摧毁宝石', 'gem-destroy ≥1',
      fusedIntoExplode ? `0（并入爆破 ×${nExplode}）` : String(nDestroy),
      nDestroy >= 1 || fusedIntoExplode,
      fusedIntoExplode ? '环内摧毁由爆破辐射实现' : (nDestroy ? `共 ${sumOf(events, 'gem-destroy', 'cells')} 颗` : false));
  }
  if (hasDesc(/爆破/)) {
    const n = counts['gem-explode'] || 0;
    push('爆破宝石', 'gem-explode ≥1', String(n), n >= 1,
      n ? `共 ${sumOf(events, 'gem-explode', 'cells')} 颗` : false);
  }

  // —— 数值增益 ——
  // 「获得 [魔法 + N] 个灵魂」是战斗外货币（本作裁定不实现），不算魔法增益缺口
  const soulClause = /获得[^。；]*灵魂/.test(desc);
  if (hasDesc(/获得[^。；]*攻击/)) push('攻击增益', 'buff attack', buffText(events, 'attack'), !!buffText(events, 'attack'));
  if (hasDesc(/获得[^。；]*护甲|加[^。；]*护甲/)) push('护甲增益', 'buff armor', buffText(events, 'armor'), !!buffText(events, 'armor'));
  if (hasDesc(/获得[^。；]*生命|治疗|回复/)) push('生命增益', 'buff hp', buffText(events, 'hp'), !!buffText(events, 'hp'));
  if (hasDesc(/获得[^。；]*魔法/) && !soulClause) push('魔法增益', 'buff magic', buffText(events, 'magic'), !!buffText(events, 'magic'));
  if (hasDesc(/获得[^。；]*法力/)) push('法力增益', 'buff mana', buffText(events, 'mana'), !!buffText(events, 'mana'));

  // —— 其它 ——
  if (hasDesc(/额外回合/)) push('额外回合', 'extra-turn ≥1', String(counts['extra-turn'] || 0), (counts['extra-turn'] || 0) >= 1);
  if (hasDesc(/召唤/)) push('召唤', 'summon ≥1', String(counts['summon'] || 0), (counts['summon'] || 0) >= 1);
  if (hasDesc(/驱散|解除[^。；]*状态/)) push('驱散', 'status-cleanse ≥1', String(counts['status-cleanse'] || 0), (counts['status-cleanse'] || 0) >= 1);
  if (hasDesc(/风暴/)) push('风暴', 'storm-change ≥1', String(counts['storm-change'] || 0), (counts['storm-change'] || 0) >= 1);

  // 汇总
  const hardFails = checks.filter((c) => !c.ok && !c.info);
  const infoNotes = checks.filter((c) => c.info && c.ok);
  const summaryParts = [];
  for (const c of checks) {
    if (c.info && c.ok) summaryParts.push(`${c.label} ${c.got}`);
    else summaryParts.push(`${c.ok ? '✓' : '✗'} ${c.label}(${c.got})`);
  }
  return {
    checks,
    suspicious: hardFails.length > 0,
    summary: summaryParts.join(' · ') || '（无可对账关键词）',
    failLabels: hardFails.map((c) => c.label),
    infoNotes: infoNotes.map((c) => `${c.label} ${c.got}`),
  };
}

/**
 * 特质描述 → 刺激全程事件流对账（粗粒度）：
 * 有触发式描述（在…时获得/施加）却全程零事件才记可疑；纯数值被动不记。
 */
export function auditTraitEvents(desc, events) {
  const counts = countEvents(events);
  const interesting = ['buff', 'status-apply', 'status-cleanse', 'status-tick', 'summon', 'storm-change', 'extra-turn'];
  const total = interesting.reduce((n, k) => n + (counts[k] || 0), 0);
  const looksReactive = /在[^。；]*时|每当|每次|开局|战斗开始|受到|攻击时|配对|施法/.test(desc);
  const looksPassiveOnly = /降低|减少|免疫|无视|翻倍|额外[^。]*伤害|首个[^。]*骷髅/.test(desc) && !looksReactive;
  return {
    eventTotal: total,
    counts: Object.fromEntries(interesting.map((k) => [k, counts[k] || 0]).filter(([, n]) => n > 0)),
    suspicious: looksReactive && total === 0,
    kind: looksPassiveOnly ? 'passive' : (looksReactive ? 'reactive' : 'unknown'),
  };
}

function countEvents(events) {
  const counts = {};
  for (const ev of events) counts[ev.type] = (counts[ev.type] || 0) + 1;
  return counts;
}

function statusApplyCount(events, statusId) {
  return events.filter((e) => e.type === 'status-apply' && e.statusId === statusId).length;
}

function sumOf(events, type, field) {
  let n = 0;
  for (const ev of events) if (ev.type === type && typeof ev[field] === 'number') n += ev[field];
  return n;
}

function buffText(events, stat) {
  const hits = events.filter((e) => e.type === 'buff' && e.stat === stat);
  if (hits.length === 0) return '';
  const total = hits.reduce((n, e) => n + (e.amount || 0), 0);
  return `×${hits.length} 共${total}`;
}
