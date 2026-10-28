import {describe,expect,it} from 'vitest';
import {adaptedTrait,adaptedTraitDescription} from '../../src/sillytavern/enemyBlueprint';
import {conciseTraitRules,readableTraitRules} from '../../src/sillytavern/traitDescriptionView';
import {describeAdaptedTrait} from '../../src/sillytavern/traitDescription';

// Independent player-facing facts: the closed preview must still explain what it grants and to whom.
const cases:[string,string[]][]=[
 ['greedy',['己方每组配对 4 颗','基础 2 点战斗金币','所属方']],
 ['extremegreed',['己方每组配对 4 颗','基础 4 点战斗金币']],
 ['pillageandplunder',['己方每组配对 4 颗','基础 20 点战斗金币']],
 ['necromancy',['仅玩家方持有者','双方共享战斗灵魂池','+50%','敌方持有者不贡献倍率']],
 ['necromaster',['仅玩家方持有者','+150%','敌方持有者不贡献倍率']],
 ['merchant',['所属方战斗金币池','开战时','+25%']],
 ['moneybags',['所属方战斗金币池','开战时','+100%']],
 ['valuable',['自身阵亡','行动末尾','基础 25 点战斗金币']],
 ['pickpocket',['自身收到骷髅头伤害事件后','仍存活且未被击晕','基础 10 点战斗金币']],
 ['darkensouls',['己方每组骷髅头配对伤害结算后','双方共享','基础 3 点战斗灵魂']],
 ['soulverdict',['己方任一角色成功施法（含自身）','技能效果前','基础 3 点战斗灵魂']],
 ['goldenhoard',['真实换手进入己方回合','持续伤害前','基础 5 点战斗金币']],
 ['soulgatherer',['真实换手进入己方回合','基础 4 点战斗灵魂','双方共享']],
 ['old_meepo_earth_bind',['真实换手进入己方回合','基础 20 点战斗金币','攻击归零']],
 ['defender',['仅在 PvP 模式','敌方防守队','全体存活角色','护甲增加 3 点']],
 ['siege',['仅在 PvP 模式','玩家方进攻队','全体存活角色','攻击增加 2 点']],
 ['virtueofhonor',['仅在 PvP 模式','为持有者自身','当前与最大生命各增加 10 点','魔力增加 10 点']],
];
describe('closed ST trait preview retains the mechanical outcome',()=>{
 it.each(cases)('%s retains its trigger, benefit and account restriction',(code,facts)=>{
  const trait=adaptedTrait(code)!;const audit=adaptedTraitDescription(code)!;
  const original=JSON.stringify({trait,audit});const text=conciseTraitRules(trait,audit);
  for(const fact of facts)expect(text).toContain(fact);
  expect(text).not.toMatch(/floor\(|左方|右方|快照/);
  expect(JSON.stringify({trait,audit})).toBe(original);
 });
 it('keeps unknown effect diagnostics visible instead of constructing a shortened claim',()=>{
  const trait={code:'fixture',name:'未知',description:'',turnStartEconomy:{currency:'gold' as const,amount:-1}};
  const audit=describeAdaptedTrait(trait);
  expect(audit.support).toBe('partial');
  expect(conciseTraitRules(trait,audit)).toBe(readableTraitRules(audit.effects[0]!.text));
  expect(conciseTraitRules(trait,audit)).toContain('【待核对】');
 });
});
