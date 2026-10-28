import '../meta/shell/styles/battle-loading.css';
import './encounterCard.css';
import {createBattleLoadingView} from '../meta/shell/battleLoadingView';
import type {BattleLoadingUnit} from '../meta/shell/battleLoadingView';

const nonce=new URLSearchParams(location.hash.slice(1)).get('channel');
const root=document.querySelector<HTMLElement>('#encounter')!;
const view=createBattleLoadingView({title:'',playerTeam:[],enemyTeam:[],playerEmpty:'我方'});
view.classList.add('bl-screen--encounter');
const foot=view.querySelector<HTMLElement>('.bl-foot')!;
foot.innerHTML='<div class="bl-actions"><button id="play" type="button" class="bl-btn primary" disabled>进入战斗</button></div><p id="status" role="status" aria-live="polite"></p>';
root.replaceChildren(view);
const play=view.querySelector<HTMLButtonElement>('#play')!;
const status=view.querySelector<HTMLElement>('#status')!;
let parentOrigin:string|undefined;let busy=false;
const send=(type:string,extra:Record<string,unknown>={})=>{if(nonce&&window.parent!==window)window.parent.postMessage({channel:'match3:message:v1',nonce,type,...extra},parentOrigin??'*');};
window.addEventListener('message',event=>{
 if(event.source!==window.parent||!/^https?:\/\//.test(event.origin))return;
 const data=event.data;if(!data||data.channel!=='match3:message:v1'||data.nonce!==nonce)return;
 if(parentOrigin&&event.origin!==parentOrigin)return;
 if(data.type==='encounter'){
  if(typeof data.difficulty!=='string'||!Array.isArray(data.enemies)||data.enemies.length<1||data.enemies.length>4)return;
  parentOrigin=event.origin;
  const units:BattleLoadingUnit[]=[];
  for(const enemy of data.enemies){
   if(!enemy||typeof enemy.rank!=='string'||typeof enemy.form!=='string'||!Number.isInteger(enemy.level))continue;
   units.push({name:typeof enemy.name==='string'&&enemy.name?enemy.name:enemy.form,race:typeof enemy.race==='string'?enemy.race:undefined,levelLabel:`${enemy.rank} · ${enemy.form} · Lv.${enemy.level}`,tier:['首领','领主','传奇'].includes(enemy.rank)?'boss':undefined});
  }
  const lineup=createBattleLoadingView({title:'',playerTeam:[],enemyTeam:units,playerEmpty:'我方'});
  view.querySelector('.bl-versus')!.replaceWith(lineup.querySelector('.bl-versus')!);
  if(typeof data.busy==='boolean')busy=data.busy;
  play.disabled=busy;status.textContent='';
 }else if(data.type==='state'){
  if(!parentOrigin)return;
  if(data.state==='new'||data.state==='pending'||data.state==='settled')play.textContent=data.state==='settled'?'查看本场战果':data.state==='pending'?'继续本场战斗':'进入战斗';
 }else if(data.type==='busy'){busy=true;play.disabled=true;status.textContent='';}
 else if(data.type==='idle'||data.type==='error'){busy=false;play.disabled=false;status.textContent=data.type==='error'&&typeof data.message==='string'?data.message:'';}
});
play.onclick=()=>{if(busy)return;busy=true;play.disabled=true;send('play');};
const observer=new ResizeObserver(()=>send('resize',{height:Math.ceil(root.getBoundingClientRect().height)}));
observer.observe(root);
window.addEventListener('pagehide',()=>observer.disconnect(),{once:true});
if(!nonce||window.parent===window)status.textContent='请通过酒馆正文中的战斗入口打开';else send('ready');
