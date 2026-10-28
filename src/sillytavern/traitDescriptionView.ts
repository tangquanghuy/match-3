import type {TraitDefinition} from '../engine/traits';
import type {AdaptedTraitDescription} from './traitDescription';

/** Player wording for the audited rules; canonical mechanical descriptions stay intact. */
export function readableTraitRules(text:string):string {
 return text.replace(/floor\(([^()]*)\)/g,'$1（向下取整）')
  .replaceAll('开战快照倍率','开战时确定的收益倍率')
  .replaceAll('战斗开始时快照','战斗开始时确定')
  .replaceAll('不撤销快照','不改变已确定的倍率')
  .replaceAll('快照','开战记录')
  .replaceAll('首次领取开局事件时','战斗开局时')
  .replaceAll('左方','玩家方').replaceAll('右方','敌方');
}

/** Summaries retain the trigger, quantity and account owner from the audited fields. */
export function conciseTraitRules(trait:TraitDefinition,audit:AdaptedTraitDescription):string {
 return audit.effects.map(effect=>{
  if(effect.support!=='full')return readableTraitRules(effect.text);
  const currencyName=(currency:string)=>({gold:'金币',souls:'灵魂',gems:'钻石'}[currency]??currency);
  const owner=(currency:string)=>currency==='gold'?'所属方':'双方共享';
  const gains:Partial<Record<string,{currency:string;amount:number;minSize?:number}>>={
   onBigMatchEconomy:trait.onBigMatchEconomy,onSkullMatchEconomy:trait.onSkullMatchEconomy,
   turnStartEconomy:trait.turnStartEconomy,onDamagedEconomy:trait.onDamagedEconomy,
   onAllyCastEconomy:trait.onAllyCastEconomy,onDeathEconomy:trait.onDeathEconomy,
  };
  const gain=gains[effect.field];
  if(gain){
   const trigger:Record<string,string>={
    onBigMatchEconomy:`持有者存活且未被击晕时，己方每组配对 ${Math.max(4,gain.minSize??4)} 颗及以上宝石（含骷髅头）`,
    onSkullMatchEconomy:'持有者存活且未被击晕时，己方每组骷髅头配对伤害结算后',
    turnStartEconomy:'真实换手进入己方回合时，持有者存活且未被击晕，在持续伤害前',
    onDamagedEconomy:'自身收到骷髅头伤害事件后，仍存活且未被击晕时',
    onAllyCastEconomy:'己方任一角色成功施法（含自身）时，持有者存活且未被击晕，在技能效果前',
    onDeathEconomy:'自身阵亡且特质未被击晕压制时，在行动末尾',
   };
   return `${trigger[effect.field]}，为${owner(gain.currency)}战斗${currencyName(gain.currency)}池增加基础 ${gain.amount} 点战斗${currencyName(gain.currency)}`;
  }
  if(effect.field==='battleEconomyGain'&&trait.battleEconomyGain){
   const gain=trait.battleEconomyGain;
   const subject=gain.currency==='souls'?'仅玩家方持有者为双方共享战斗灵魂池':'持有者为所属方战斗金币池';
   const percent=Number((gain.ratio*100).toPrecision(12));
   return `${subject}在开战时提供 +${percent}% 收益加成${gain.currency==='souls'?'，敌方持有者不贡献倍率':''}`;
  }
  // PvP's first clause already contains its phase, recipient and exact stat changes.
  if(effect.field==='pvpBonus')return readableTraitRules(effect.text.split('；')[0]!);
  if(effect.field==='mode')return '仅在 PvP 模式启用，当前 ST 未提供此模式';
  // Unrecognized and non-economic effects remain complete rather than silently losing semantics.
  return readableTraitRules(effect.text);
 }).join('。');
}

export function renderTraitDescription(trait:TraitDefinition,audit:AdaptedTraitDescription):HTMLElement {
 const root=document.createElement('div');
 const paragraph=(text:string)=>{const p=document.createElement('p');p.textContent=text;return p;};
 const full=readableTraitRules(trait.description||'特质文字待复核');
 const economic=audit.effects.some(effect=>/Economy|^pvpBonus$|^mode$/.test(effect.field));
 if(!economic){root.append(paragraph(`${trait.name}：${full}`));return root;}
 const concise=conciseTraitRules(trait,audit);
 root.append(paragraph(`${trait.name}：${concise}。完整条件见详细规则。`));
 const details=document.createElement('details');details.className='trait-rules';
 const summary=document.createElement('summary');summary.textContent=`${trait.name}详细规则`;
 details.append(summary,paragraph(`${trait.name}：${full}`));root.append(details);
 return root;
}
