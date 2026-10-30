import {installStHost} from './hostEntry';
import {compileEnemyBlueprint} from './enemyBlueprint';
import {restoreEnemyFormation} from './enemyFormation';
import {PORTRAITS,savePortrait,RANKS} from './portraits';
import type {MvuData} from './hostAdapter';

const doc=document;const mount=doc.getElementById('playtest')!;
const style=doc.createElement('style');style.textContent='body{margin:0;background:#141d2c;color:#edf0f7;font:16px/1.6 system-ui}main{max-width:820px;margin:40px auto;padding:20px}button,select,input{font:inherit;padding:8px;background:#28374d;color:inherit;border:1px solid #62728b;border-radius:6px}label{display:block;margin:12px 0}button{cursor:pointer;margin:8px 8px 8px 0}pre{white-space:pre-wrap;background:#1d293d;padding:14px;border-radius:8px}a{color:#a9d2ff}';doc.head.append(style);
function el<K extends keyof HTMLElementTagNameMap>(tag:K,text?:string):HTMLElementTagNameMap[K]{const node=doc.createElement(tag);if(text)node.textContent=text;return node;}
mount.append(el('h1','酒馆三消 · 流程试玩'),el('p','本页使用示例人物与独立的本地聊天存档，战斗由正式三消引擎执行。可以测试建档、队伍准备、剧情战斗、魂片收藏和往昔再现；真实酒馆安装仍需单独验证。'),el('p','操作：先点右下角“三消存档”创建当前聊天存档，再点“开始示例遭遇”，在准备页确认队伍。首次剧情胜利后，在存档面板进入往昔再现。'));
const schemaKey='match3.playtest.host.v1';
const formationKey='st.enemy-formation-preview.v1';
interface Fixture {chatId:string;variables:Record<string,Record<string,unknown>>;states:Record<string,MvuData>}
function actor(name:string):Record<string,unknown>{return {名称:name,等级:20,生命值上限:200,当前生命值:200,临时生命值:0,AC:14,属性:{力量:16,敏捷:12,体质:14,智力:18,感知:12,魅力:10},战斗属性:{武器面板:{伤害骰:'2d6',等级系数:3,固定伤害:10},物理减伤:20,魔法减伤:0,每回合动作资源:{攻击次数:2}},装备列表:{}};}
function fresh():Fixture {return {chatId:'示例聊天一',variables:{},states:{}};}
let fixture:Fixture;try{fixture=JSON.parse(localStorage.getItem(schemaKey)??'null')??fresh();}catch{fixture=fresh();}
function persist():void{localStorage.setItem(schemaKey,JSON.stringify(fixture));}
function state():MvuData {if(!Object.hasOwn(fixture.states,fixture.chatId)){fixture.states[fixture.chatId]={stat_data:{人物:actor('旅人'),羁绊列表:{同行者:{...actor('同行者'),同行誓约:true}},系统配置:{战斗数值模式:'classic'}}};persist();}return fixture.states[fixture.chatId]!;}
const chatLabel=el('label','当前示例聊天：');const chats=el('select');chats.setAttribute('aria-label','示例聊天');for(const name of ['示例聊天一','示例聊天二','示例聊天三','示例聊天四']){const option=el('option',name);option.value=name;chats.append(option);}chats.value=fixture.chatId;chatLabel.append(chats);mount.append(chatLabel);
const rankLabel=el('label','敌人稀有度：');const rank=el('select');rank.setAttribute('aria-label','敌人稀有度');for(const name of RANKS){const option=el('option',name);option.value=name;rank.append(option);}rankLabel.append(rank);mount.append(rankLabel);
const modeLabel=el('label','人物面板模式：');const mode=el('select');mode.setAttribute('aria-label','人物面板模式');for(const [value,name]of [['classic','经典'],['new','新版']]){const option=el('option',name);option.value=value;mode.append(option);}modeLabel.append(mode);mount.append(modeLabel);
const start=el('button','开始示例遭遇');const challenge=el('button','挑战已保存的组装编队');const show=el('button','打开存档与往昔再现');const status=el('p');status.setAttribute('role','status');const facts=el('pre');facts.setAttribute('aria-label','示例酒馆人物状态');mount.append(start,challenge,show,status,facts);
// Stand-in for the tavern chat box: the story result's "继续" sends its report here.
const chatLog=el('pre');chatLog.setAttribute('aria-label','发送给 AI 的消息');
const chatInput=el('textarea');chatInput.id='send_textarea';chatInput.hidden=true;
const chatSend=el('button');chatSend.id='send_but';chatSend.hidden=true;
chatSend.onclick=()=>{chatLog.textContent=chatInput.value;chatInput.value='';};
mount.append(el('h2','发送给 AI 的消息'),chatLog,chatInput,chatSend);
const preview=el('a','打开敌人组装预览');preview.href=new URL('sillytavern.html',location.href).href;preview.target='_blank';mount.append(preview);
function render():void{const data=state().stat_data;facts.textContent=JSON.stringify({当前聊天:fixture.chatId,人物:data['人物'],同伴颜色:(data['羁绊列表'] as Record<string,Record<string,unknown>>)?.['同行者']?.['三消']},null,2);mode.value=(data['系统配置'] as Record<string,string>)['战斗数值模式']!;}
const handle=await installStHost({hostWindow:window,hostId:'match3-playtest-v1',battleUrl:new URL('sillytavern-battle.html',location.href).href,helpers:{
 getContext:()=>({characterId:0,characters:[{avatar:'match3-playtest-card.png'}],chat:[{swipe_id:0}],getCurrentChatId:()=>fixture.chatId}),
 getVariables:()=>structuredClone(fixture.variables[fixture.chatId]??{}),
 updateVariablesWith:fn=>{fixture.variables[fixture.chatId]=fn(structuredClone(fixture.variables[fixture.chatId]??{}));persist();},
 Mvu:{getMvuData:()=>structuredClone(state()),replaceMvuData:async next=>{fixture.states[fixture.chatId]=structuredClone(next);persist();render();}},
}});
chats.onchange=()=>{fixture.chatId=chats.value;persist();render();};mode.onchange=()=>{const data=state().stat_data;data['系统配置']={战斗数值模式:mode.value};const hero=data['人物'] as Record<string,unknown>;const panel=(hero['战斗属性'] as Record<string,unknown>)['武器面板'] as Record<string,unknown>;panel['等级系数']=mode.value==='new'?1:3;persist();render();};
show.onclick=()=>void handle.open();
function launchEncounter(run:()=>Promise<void>):void {
 if(start.disabled)return;start.disabled=challenge.disabled=true;status.textContent='';
 void run().then(()=>render()).catch(error=>{status.textContent=error instanceof Error?error.message:String(error);}).finally(()=>{start.disabled=challenge.disabled=false;});
}
start.onclick=()=>launchEncounter(async()=>{
 const portrait=PORTRAITS.find(p=>p.rank===rank.value)!;const query={rank:portrait.rank,form:portrait.form,role:portrait.role};
 const enemy=compileEnemyBlueprint({portrait:savePortrait(query,portrait),externalId:'encounter-enemy-1',level:1,difficulty:1});
 await handle.playStory({enemies:[enemy],difficulty:'示例·等级1',seed:20261021});
});
challenge.onclick=()=>launchEncounter(async()=>{
 const saved=localStorage.getItem(formationKey);
 if(saved===null)throw new Error('尚未保存组装编队，请先在敌人组装预览中保存当前编队');
 let formation;
 try{formation=restoreEnemyFormation(JSON.parse(saved));}
 catch(error){throw new Error('已保存的组装编队恢复失败：'+(error instanceof Error?error.message:String(error)));}
 await handle.playStory({enemies:formation.members,difficulty:'组装编队试玩',seed:20261024,...(formation.budgetPolicy?{budgetPolicy:formation.budgetPolicy}:{})});
});
render();await handle.open();
