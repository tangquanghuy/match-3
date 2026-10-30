import './encounterCard.css';

/**
 * Compact in-message encounter strip. The full lineup and art are shown by the battle
 * loading screen after "进入战斗", so this strip only carries small thumbnails and actions.
 */
interface StripUnit {name:string;label?:string;portraitUrl?:string}

const nonce=new URLSearchParams(location.hash.slice(1)).get('channel');
const root=document.querySelector<HTMLElement>('#encounter')!;
root.innerHTML=`<section class="ec" aria-label="剧情遭遇">
  <div class="ec-lineup">
    <div class="ec-side ec-side--player" role="region" aria-label="我方阵容"></div>
    <span class="ec-vs" aria-hidden="true">VS</span>
    <div class="ec-side ec-side--enemy" role="region" aria-label="敌方阵容"></div>
  </div>
  <div class="ec-actions">
    <button id="play" type="button" class="ec-btn primary" disabled>进入战斗</button>
    <button id="reset" type="button" class="ec-btn test" hidden title="临时测试功能：撤回本场战果，可在同一楼重新开战">重置本场（测试）</button>
  </div>
  <p id="status" role="status" aria-live="polite"></p>
</section>`;
const play=root.querySelector<HTMLButtonElement>('#play')!;
const reset=root.querySelector<HTMLButtonElement>('#reset')!;
const status=root.querySelector<HTMLElement>('#status')!;
const playerSide=root.querySelector<HTMLElement>('.ec-side--player')!;
const enemySide=root.querySelector<HTMLElement>('.ec-side--enemy')!;
let parentOrigin:string|undefined;let busy=false;let settled=false;let resetArmed:number|undefined;
let enemyUnits:StripUnit[]=[];let playerUnits:StripUnit[]=[];

function unitTile(unit:StripUnit):HTMLElement{
 const figure=document.createElement('figure');figure.className='ec-unit';figure.setAttribute('aria-label',unit.name);figure.title=unit.label?`${unit.name}（${unit.label}）`:unit.name;
 if(unit.portraitUrl){const img=document.createElement('img');img.src=unit.portraitUrl;img.alt='';img.decoding='async';figure.append(img);}
 else{const blank=document.createElement('span');blank.className='ec-unit-blank';blank.textContent=[...unit.name][0]??'?';figure.append(blank);}
 return figure;
}
function renderLineup():void{
 playerSide.replaceChildren(...(playerUnits.length?playerUnits.map(unitTile):[Object.assign(document.createElement('span'),{className:'ec-empty',textContent:'我方'})]));
 enemySide.replaceChildren(...enemyUnits.map(unitTile));
 // Names, rank and level stay in each thumbnail's tooltip; the loading screen shows the full lineup.
}
// Only same-origin http(s) art from the program; never arbitrary schemes from a message.
function lineupUnits(value:unknown):StripUnit[]|undefined{
 if(!Array.isArray(value)||value.length>4)return undefined;
 const units:StripUnit[]=[];
 for(const item of value){
  if(!item||typeof item.name!=='string')return undefined;
  let portraitUrl:string|undefined;
  if(typeof item.portraitUrl==='string'){try{const url=new URL(item.portraitUrl,location.href);if(url.origin===location.origin)portraitUrl=url.href;}catch{/* skip invalid art */}}
  units.push({name:item.name,...(portraitUrl?{portraitUrl}:{})});
 }
 return units;
}
function disarmReset():void{window.clearTimeout(resetArmed);resetArmed=undefined;reset.textContent='重置本场（测试）';reset.classList.remove('armed');}
function syncButtons():void{play.disabled=busy;reset.hidden=!settled;reset.disabled=busy;if(busy||!settled)disarmReset();}
const send=(type:string,extra:Record<string,unknown>={})=>{if(nonce&&window.parent!==window)window.parent.postMessage({channel:'match3:message:v1',nonce,type,...extra},parentOrigin??'*');};
window.addEventListener('message',event=>{
 if(event.source!==window.parent||!/^https?:\/\//.test(event.origin))return;
 const data=event.data;if(!data||data.channel!=='match3:message:v1'||data.nonce!==nonce)return;
 if(parentOrigin&&event.origin!==parentOrigin)return;
 if(data.type==='encounter'){
  if(typeof data.difficulty!=='string'||!Array.isArray(data.enemies)||data.enemies.length<1||data.enemies.length>4)return;
  parentOrigin=event.origin;
  const units:StripUnit[]=[];
  for(const enemy of data.enemies){
   if(!enemy||typeof enemy.rank!=='string'||typeof enemy.form!=='string'||!Number.isInteger(enemy.level))continue;
   units.push({name:typeof enemy.name==='string'&&enemy.name?enemy.name:enemy.form,label:`${enemy.rank} Lv.${enemy.level}`});
  }
  enemyUnits=units;renderLineup();
  if(typeof data.busy==='boolean')busy=data.busy;
  status.textContent='';syncButtons();
 }else if(data.type==='state'){
  if(!parentOrigin)return;
  if(data.state==='new'||data.state==='pending'||data.state==='settled'){
   play.textContent=data.state==='settled'?'查看本场战果':data.state==='pending'?'继续本场战斗':'进入战斗';
   settled=data.state==='settled';syncButtons();
  }
 }else if(data.type==='lineup'){
  if(!parentOrigin)return;
  const player=lineupUnits(data.player),enemy=lineupUnits(data.enemy);
  if(!player||!enemy||enemy.length!==enemyUnits.length)return;
  // Keep the AI-given names and rank labels; only add the program-chosen art.
  enemyUnits=enemyUnits.map((unit,index)=>({...unit,...(enemy[index]!.portraitUrl?{portraitUrl:enemy[index]!.portraitUrl}:{})}));
  playerUnits=player;renderLineup();
 }else if(data.type==='busy'){busy=true;status.textContent='';syncButtons();}
 else if(data.type==='idle'||data.type==='error'){busy=false;status.textContent=data.type==='error'&&typeof data.message==='string'?data.message:'';syncButtons();}
});
play.onclick=()=>{if(busy)return;busy=true;syncButtons();send('play');};
// Two clicks: the first only arms the button, so a stray click never undoes a result.
reset.onclick=()=>{
 if(busy||!settled)return;
 if(resetArmed===undefined){reset.textContent='确认重置：撤回本场战果';reset.classList.add('armed');resetArmed=window.setTimeout(disarmReset,5000);return;}
 disarmReset();busy=true;syncButtons();send('reset');
};
const observer=new ResizeObserver(()=>send('resize',{height:Math.ceil(root.getBoundingClientRect().height)}));
observer.observe(root);
window.addEventListener('pagehide',()=>observer.disconnect(),{once:true});
if(!nonce||window.parent===window)status.textContent='请通过酒馆正文中的战斗入口打开';else send('ready');
