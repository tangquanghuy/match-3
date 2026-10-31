import type {AbilitySource,SettlementReceipt} from './save';

/** Marker the runtime prompt tells the AI to treat as the program's battle report. */
export const STORY_REPORT_HEADER='【三消战报】';
const percent=(value:number):string=>`${Math.max(0,Math.round(value))}%`;

/** Readable, ID-free report of one committed story battle; every fact comes from the receipt. */
export function formatStoryReportMessage(receipt:SettlementReceipt,_sources:readonly AbilitySource[]=[]):string {
 const {report,result}=receipt;
 const won=receipt.winner==='player';
 const outcome=result.endReason==='surrender'?'我方放弃战斗，按败北结算'
  :won?'我方胜利':result.endReason==='turn-limit'?'回合耗尽，我方败北':'我方败北';
 const lines=[STORY_REPORT_HEADER,`战斗结果：${outcome}，共 ${report.turns} 回合。`];
 const enemies=report.units.filter(unit=>unit.side==='enemy');
 if(enemies.length){
  lines.push('敌方：');
  for(const unit of enemies){
   const state=unit.fled?'已逃离':unit.finallyDefeated?'被击败':`仍可战斗（生命 ${percent(unit.finalHpPercent)}）`;
   lines.push(`- ${unit.name}：${state}`);
  }
 }
 const allies=report.units.filter(unit=>unit.side==='player');
 if(allies.length){
  lines.push('我方：');
  for(const unit of allies){
   const notes=[`生命 ${percent(unit.initialHpPercent)} → ${percent(unit.finalHpPercent)}`];
   if(unit.finallyDefeated)notes.push('最终倒下，失去战斗能力');
   else if(unit.fellCount>0)notes.push(unit.revivedCount>0?`曾倒下 ${unit.fellCount} 次后复起`:'曾倒下');
   if(unit.fled)notes.push('已撤离战场');
   lines.push(`- ${unit.name}：${notes.join('；')}`);
  }
 }
 // Match-3 progression (fragments, learned abilities) stays out of the story: it is shown on the
 // settlement page and saved by the program; AIRP loot is settled by the AI separately (2026-10-30).
 lines.push('请依据以上战报续写战后剧情。');
 return lines.join('\n');
}

/**
 * Send text as the player's chat message, the same way the status bar's travel action does:
 * fill #send_textarea in the tavern document and click #send_but.
 */
export function sendTavernChatMessage(host:Window,text:string):boolean {
 try{
  const doc=host.document;
  const area=doc.getElementById('send_textarea') as HTMLTextAreaElement|null;
  const button=doc.getElementById('send_but') as HTMLElement|null;
  if(!area||!button)return false;
  area.value=text;area.dispatchEvent(new Event('input',{bubbles:true}));button.click();
  return true;
 }catch(error){console.warn('[三消] 战报发送失败',error);return false;}
}
