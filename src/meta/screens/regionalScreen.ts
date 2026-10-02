import { regionalPortraitStats } from './regionalPresentation';
import { bindTermTips } from '../shell/termTip';
import type { Screen, ShellCtx } from '../shell/screen';
import { topbarHtml, toastHtml, toast, icon } from '../shell/chrome';
import { regionalArt, eventArt } from '../shell/artAssets';
import { escapeHtml as esc } from './troopCard';
import { troopImg } from './teamScreen';
import { getTroopById } from '../../data/troops';
import { renderSpell } from '../shell/spellText';
import { isFailure } from '../gateway';
import { weekStartOf, todayStartOf } from '../gateway/clock';
import { regionalState, regionalProgress, activeRegions, regionOpen, nextRegionWeek, regionalRule, regionalFrenzy, regionalTeamIssue, previewRegionalEnemy, previewRegionalBattle, planRegional, type RegionalPlanArgs, type RegionalAction } from '../systems/regionalPvp';
import { buildPlayerSnapshots } from '../systems/battleBridge';
import { REGIONS, regionDefinition, isRegionId, type RegionId, REGION_UNLOCK_LEVEL, REGION_REWARDS, REGION_TIERS, MONOLITHS, MONOLITH_LEVELS } from '../data/regionalPvp';
import type { CombatantSnapshot } from '../../session/contract';
import type { MonolithId } from '../state/regional';

const n = (v:number) => v.toLocaleString('zh-CN');
function link(path:string, text:string, cls=''):string { return `<a class="rg-button ${cls}" href="#regional${path ? '/'+esc(path) : ''}">${text}</a>`; }
type RegionCtx=ShellCtx & { region:RegionId };
function regionLinks(region:RegionId) {return (path:string,text:string,cls='')=>link(`region/${region}${path?'/'+path:''}`,text,cls);}
function scene(region:RegionId):string {
 const art=regionDefinition(region)!.art;
 if(art==='winter')return regionalArt('winter-map');
 const event:Record<string,string>={tower:'bg-tower',bay:'bg-world',expanse:'bg-trials',summer:'bg-faction',broken:'bg-raid'};
 return event[art]?eventArt(event[art]!):`/static/kingdoms/${art}.webp`;
}
function dateText(at:number):string {return new Date(at).toLocaleDateString('zh-CN',{timeZone:'Asia/Shanghai',month:'long',day:'numeric'});}
function atlas(ctx:ShellCtx):string {
 const now=ctx.gateway.now(),week=weekStartOf(now),s=regionalState(ctx.save()),open=activeRegions(week);
 const card=(id:RegionId,resting=false)=>{
  const def=regionDefinition(id)!,r=regionalRule(resting?nextRegionWeek(id,week):week,id),p=s.regions[id];
  return `<a class="rg-destination ${id==='CentralSpire'?'rg-central':''} ${resting?'rg-resting':''}" data-region-card="${id}" href="#regional/region/${id}" style="--rg-scene:url('${scene(id)}');--rg-accent:${def.accent}"><span class="rg-destination-state">${resting?dateText(nextRegionWeek(id,week))+' 开放':id==='CentralSpire'?'常驻战场':regionalFrenzy(now,id)?'血怒 · 积分 ×2':'本周开放'}</span><div><small>${def.subtitle}</small><h2>${def.name}</h2><p>${r.name}${r.restriction.kind==='none'?'':'限定'}${r.gem?' · '+r.gem.name:''}</p><span>${resting?'查看战区 ›':p.citadel.stage?`城塞进军 ${p.citadel.stage} / 4 · 进入战区 ›`:'进入战区 ›'}</span></div></a>`;
 };
 return `<section class="rg-atlas"><div class="rg-atlas-heading"><div><small>IMMORTAL REALMS</small><h1>永生战域</h1><p>中央尖塔常驻 · 每周两处特色战区</p></div><div class="rg-atlas-wallet"><b>${n(s.vp)}</b><span>本周总积分</span><small>城塞符印 ${s.sigils} / 6</small></div></div><div class="rg-active-regions">${open.map(id=>card(id)).join('')}</div><div class="rg-heading rg-rest-heading"><div><h2>休整中的疆域</h2><p>每周一轮换 · ${dateText(week+7*86400000)} 更新</p></div>${link('rules','战域规则')}</div><div class="rg-rest-regions">${REGIONS.filter(r=>!open.includes(r.id)).map(r=>card(r.id,true)).join('')}</div></section>`;
}
function closedRegion(ctx:RegionCtx):string {
 const def=regionDefinition(ctx.region)!,week=nextRegionWeek(ctx.region,weekStartOf(ctx.gateway.now())),rule=regionalRule(week,ctx.region);
 return `<article class="rg-region-intro" style="--rg-scene:url('${scene(ctx.region)}')"><div><small>战区休整 · ${dateText(week)} 开放</small><h1>${def.name}</h1><p>${def.subtitle}</p><p>下次规则：${rule.name}限定${rule.gem?' · '+rule.gem.name:''}</p><h2>主场不朽</h2><p>${def.homes.map(id=>esc(getTroopById(id)?.name??String(id))).join(' · ')}</p>${link('','返回战域总览','rg-primary')}</div></article>`;
}
function attributes(c:CombatantSnapshot):string { return `<div class="rg-attributes">${([['attack','swords','攻击'],['armor','shield','护甲'],['hp','heart','生命'],['magic','orb','魔力']] as const).map(([k,g,l])=>`<span title="${l}" aria-label="${l} ${c.stats[k]}">${icon(g)}<b>${c.stats[k]}</b></span>`).join('')}</div>`; }
function argsOf(region:RegionId,kind:string,id:string):RegionalPlanArgs { return kind==='monolith' ? {region,kind:'monolith',monolith:id as MonolithId} : kind==='citadel' ? {region,kind:'citadel',...(id&&id!=='-'?{opponentId:id}:{})} : {region,kind:'duel',opponentId:id}; }
function team(ctx:RegionCtx, side:'player'|'enemy', kind:string,id:string):CombatantSnapshot[] {
  // Preview is calculated on a detached snapshot through the same planner as signing.
  const plan=previewRegionalBattle(ctx.save(),argsOf(ctx.region,kind,id),ctx.gateway.now());
  if(plan.ok)return side==='player'?plan.request.playerTeam:plan.request.enemyTeam;
  if(side==='player'){const built=buildPlayerSnapshots(ctx.save());return built.ok?built.playerTeam:[];}
  const o=regionalProgress(ctx.save(),ctx.region).opponents.find(o=>o.id===id);
  return o?previewRegionalEnemy(o,ctx.gateway.now(),ctx.region):[];
}
function cards(list:CombatantSnapshot[],kind:string,id:string,side:string,region:RegionId):string {
  return `<div class="rg-team" data-preview-side="${side}">${list.map((c,i)=>{
    const troop=getTroopById(Number(c.templateId));
    return `<a class="rg-troop" href="#regional/region/${region}/unit/${kind}/${id||'-'}/${side}/${i}" aria-label="查看${esc(c.name)}详情">
      <div class="rg-troop-art">${troopImg(troop??null,c.templateId==='hero',`alt="${esc(c.name)}"`)}
        ${regionalPortraitStats(c)}<span class="rg-troop-position" title="${i===0?'队首':`${i+1} 号位`}">${i+1}</span>
      </div>
      <div class="rg-troop-caption"><h3>${esc(c.name)}</h3>${c.levelLabel?`<small>${esc(c.levelLabel)}</small>`:''}<span aria-hidden="true">›</span></div>
    </a>`;
  }).join('')}</div>`;
}
function home(ctx:RegionCtx):string {
 const link=regionLinks(ctx.region);
  const s=regionalState(ctx.save()),p=s.regions[ctx.region],now=ctx.gateway.now(),r=regionalRule(s.week,ctx.region),def=regionDefinition(ctx.region)!;
  return `<div class="rg-world" style="--rg-art:url('${scene(ctx.region)}')"><div class="rg-world-copy"><small>永生神疆域</small><h1>${def.name}</h1><p>本周 · ${r.name}${r.restriction.kind==='none'?'':'限定'} ${r.gem?'<span> / '+r.gem.name+'</span>':''}</p>${regionalFrenzy(now,ctx.region)?'<strong class="rg-frenzy">血怒 · 敌方属性 +50% / 区域积分 ×2</strong>':''}</div>
  ${link('citadel',`<span>${icon('temple')}</span><b>${def.name}城塞</b><small>${p.citadel.stage===4?'守护者已现身':`进军 ${p.citadel.stage} / 4`}</small>`,'rg-landmark rg-citadel')}
  ${MONOLITHS.map((m,i)=>link('monolith/'+m.id,`<span>${icon(m.icon)}</span><b>${m.name}</b><small>${s.monoliths[m.id].expires>now?`增益 ${s.monoliths[m.id].level} 阶`:'挑战巨石碑'}</small>`,`rg-landmark rg-monolith rg-m${i}`)).join('')}
  <div class="rg-world-footer"><div><b>${n(s.vp)}</b><span>本周战域总积分</span></div>${link('opponents','寻找对手 ›','rg-primary')}${link('rules','区域规则')}</div></div>`;
}
function opponents(ctx:RegionCtx):string {
 const link=regionLinks(ctx.region);
 const s=regionalState(ctx.save()),p=s.regions[ctx.region];return `<div class="rg-heading"><div><small>区域对战</small><h1>选择你的对手</h1></div><button data-action="refresh" class="rg-button">更换对手</button></div><div class="rg-opponents">${p.opponents.map(o=>`<article class="rg-opponent"><div class="rg-opponent-art">${troopImg(getTroopById(Number(o.team[0]?.templateId))??null,false,'alt=""')}<span>${REGION_TIERS[o.tier].name}</span></div><div class="rg-opponent-copy"><small>${o.mirror?'指挥官镜像':'区域守卫'}</small><h2>${esc(o.name)}</h2><p>${o.team.map(c=>esc(c.name)).join(' · ')}</p><div class="rg-loot">${icon('coin')} ${n(o.gold)} <span> / ${o.vp*(regionalFrenzy(ctx.gateway.now(),ctx.region)?2:1)} 积分</span></div>${link('prepare/duel/'+o.id,'查看队伍 ›','rg-primary')}</div></article>`).join('')}</div>`;
}
function prepare(ctx:RegionCtx,kind:string,id:string):string {
 const link=regionLinks(ctx.region);
 const save=ctx.save(),s=regionalState(save),issue=regionalTeamIssue(save,s.week,ctx.region),plan=planRegional(structuredClone(save),argsOf(ctx.region,kind,id),ctx.gateway.now(),0);
 const enemy=team(ctx,'enemy',kind,id), player=team(ctx,'player',kind,id);
 return `<div class="rg-heading"><div><small>战前准备 · ${regionalRule(s.week,ctx.region).name}${regionalRule(s.week,ctx.region).restriction.kind==='none'?'':'限定'}</small><h1>${esc(plan.ok?plan.context.opponent.name:'队伍准备')}</h1></div>${link(kind==='duel'?'opponents':kind==='citadel'?'citadel':'monolith/'+id,'返回')}</div>
 <section class="rg-panel rg-team-panel"><div class="rg-team-heading"><h2>敌方队伍</h2><span>${enemy.length} 人</span></div>${enemy.length?cards(enemy,kind,id,'enemy',ctx.region):'<p>先配置符合本周规则的队伍，再查看本场敌方属性。</p>'}</section>
 <section class="rg-panel rg-team-panel"><div class="rg-heading"><h2>我的队伍</h2><a class="rg-button" href="#team/regional/region/${ctx.region}/prepare/${esc(kind)}/${esc(id)}">调整编队 ›</a></div>${cards(player,kind,id,'player',ctx.region)}</section>
 <div class="rg-launch"><p>${esc(issue??(!plan.ok?plan.message:'属性已计入本场血怒与有效巨石碑增益'))}</p><button class="rg-button rg-primary" data-fight="${esc(kind)}" data-id="${esc(id)}" ${!plan.ok?'disabled':''}>进入战斗${kind==='citadel'?' · 1 符印':kind==='monolith'?' · 1 碑能':''}</button></div>`;
}
function unit(ctx:RegionCtx,kind:string,id:string,side:string,index:string):string {
 const link=regionLinks(ctx.region);
 const c=team(ctx,side==='player'?'player':'enemy',kind,id)[Number(index)];if(!c)return '<p>队伍已更新，请返回重新选择。</p>';
 const t=getTroopById(Number(c.templateId));return `<div class="rg-heading"><h1>部队详情</h1>${link('prepare/'+kind+'/'+id,'返回备战')}</div><article class="rg-detail"><div class="rg-detail-art">${troopImg(t??null,false,'alt=""')}</div><div><small>${side==='player'?'我方':'敌方'} · 本场属性</small><h1>${esc(c.name)}</h1>${attributes(c)}<h2>${esc(c.spellName??t?.spell.name??'技能')}</h2><p class="rg-spell">${renderSpell(c.spellDescription??t?.spell.description??'',c.stats.magic,{interactive:false}).html}</p><h2>特质</h2>${t?.traits.map(tr=>`<p class="rg-trait ${(c.displayTraitIds??c.traitIds??[]).includes(tr.code)?'':'rg-muted'}"><b>${esc(tr.name)}</b><span>${esc(tr.description)}</span></p>`).join('')??''}</div></article>`;
}
function monolith(ctx:RegionCtx,id:string):string {
 const link=regionLinks(ctx.region);
 const m=MONOLITHS.find(m=>m.id===id);if(!m)return '<p>巨石碑不存在。</p>';
 const s=regionalState(ctx.save()),b=s.monoliths[m.id],active=b.expires>ctx.gateway.now(),level=active?b.level:0;
 return `<div class="rg-sanctum" style="--rg-art:url('${regionalArt('winter-sanctum')}')"><div class="rg-sanctum-copy"><small>区域备战 · 巨石碑</small><h1>${m.name}</h1><p>${m.description}，最多五阶。</p><p>${active?`当前 ${level} 阶 · 剩余 ${Math.ceil((b.expires-ctx.gateway.now())/60000)} 分钟`:'击败守卫，点亮巨石碑'}</p><ol class="rg-steps">${MONOLITH_LEVELS.map((lv,i)=>`<li class="${i<level?'complete':i===level?'current':''}"><span>${i+1}</span><div><b>第 ${i+1} 阶</b><small>守卫 Lv.${lv} · ${m.description.replace('每阶 ', '累计 ').replace('10%',`${(i+1)*10}%`)}</small></div></li>`).join('')}</ol><p>每次胜利延长 1 小时；增益用于区域对战与城塞。</p>${level<5?link('prepare/monolith/'+id,'挑战守卫 · 1 碑能','rg-primary'):'<strong>巨石碑已完全点亮</strong>'}<small>碑能 ${s.energy} / 10 · 每赢两场区域对战恢复 1 点</small></div></div>`;
}
function citadel(ctx:RegionCtx):string {
 const link=regionLinks(ctx.region);const s=regionalState(ctx.save()),p=s.regions[ctx.region],def=regionDefinition(ctx.region)!;return `<div class="rg-sanctum rg-fortress" style="--rg-art:url('${scene(ctx.region)}')"><div class="rg-sanctum-copy"><small>个人城塞挑战</small><h1>${def.name}城塞</h1><p>突破四支守军，再迎战区域守护者。</p><ol class="rg-steps">${['外围巡卫','城门守军','要塞防线','内城近卫','区域守护者'].map((label,i)=>`<li class="${i<p.citadel.stage?'complete':i===p.citadel.stage?'current':''}"><span>${i===4?'Ⅴ':i+1}</span><div><b>${label}</b><small>${i===4?'胜利：燃烧灵魂 ×3（各区合计每周前五轮）':'区域积分与战利品'}</small></div></li>`).join('')}</ol><p>已完成 ${p.citadel.cycles} 轮 · 今日符印 ${s.sigils} / 6</p>${p.citadel.stage===4?link('prepare/citadel/-','挑战守护者 ›','rg-primary'):p.opponents.map(o=>link('prepare/citadel/'+o.id,`${REGION_TIERS[o.tier].name} · ${esc(o.name)} ›`)).join(' ')}<small>守护者战后开启新一轮；每次成功突破提升敌方强度。</small></div></div>`;}
function rewards(ctx:ShellCtx):string {const s=regionalState(ctx.save());return `<div class="rg-heading"><div><small>每周奖励</small><h1>战域战利品</h1></div><span>${s.vp} 区域积分</span></div><div class="rg-rewards">${REGION_REWARDS.map((r,i)=>`<article class="rg-panel"><div><h2>${r.vp} 区域积分</h2><p>${r.cycles?`突破城塞 ${r.cycles} 轮`:'参与区域对战'}</p></div><p>黄金 ${n(r.gold)} · 宝石 ${r.gems}<br>灵魂 ${n(r.souls)} · 燃烧灵魂 ${r.burning}</p><button class="rg-button" data-claim="${i}" ${s.claimed.includes(i)||s.vp<r.vp||s.guardianWins<r.cycles?'disabled':''}>${s.claimed.includes(i)?'已领取':'领取奖励'}</button></article>`).join('')}</div>`;}
const RULES=`<h1>永生战域规则</h1><h2>区域与周轮换</h2><p>中央尖塔常驻，不限制配队。其他九个战区每周开放两个：内环限定法力颜色（主角按装备武器判断），外环轮换种族或王国。主场不朽仅自身豁免限制，每队仍至多一名不朽。战区名称对应技能的主场条件。</p><h2>对手与血怒</h2><p>优先匹配合规指挥官镜像，不足时由成熟养成的区域守卫补位。精锐、强敌、霸主生命为成熟基准的 3、4、5 倍，护甲为 2、3、4 倍。两处特色战区每日轮换血怒：敌方四维额外 +50%，积分翻倍。中央尖塔不出现血怒。</p><h2>共享资源，独立进军</h2><p>各区分别保存对手、城塞进度和战绩。周总积分、周奖励、燃烧灵魂、碑能、巨石碑增益和每日符印由所有区域共用。城塞每天补满 6 枚符印，每战消耗 1 枚；四胜后挑战守护者，守护者战结束重开一轮，胜利提高本区下一轮强度。</p><p>全战域每周前五次击败守护者各得 3 个燃烧灵魂，周奖励另有合计 60 个。高级周奖励要求各区累计守护者胜场；切换区域不重置奖励额度。</p><h2>巨石碑</h2><p>每阶提升对应属性 10%，最多五阶，每胜延长 1 小时。增益用于所有区域对战和城塞，巨石碑自身不享受。每两场区域对战胜利恢复 1 点碑能，上限 10。</p><h2>周更与中断</h2><p>每周一重置各区进军、总积分和周奖励；燃烧灵魂、碑能及尚未到期的巨石碑增益保留。跨周战斗结算基础战利品，不计新周进度。战斗中刷新或离场按放弃处理，不退回消耗。</p><h2>当前范围</h2><p>城塞为个人挑战，不包含联盟占领、投票与区域全服排行。镜像战记录在进攻方战报，不改变对方普通入侵防守奖励及复仇记录。</p>`;
function route(param:string|undefined):{region:RegionId|null;page:string;parts:string[];invalid:boolean} {
 const parts=(param??'').split('/');
 if(parts[0]==='region') {const id=parts[1];return {region:isRegionId(id)?id:null,page:parts[2]??'',parts:parts.slice(3),invalid:!isRegionId(id)};}
 const page=parts[0]??'';
 return {region:['opponents','prepare','unit','monolith','citadel'].includes(page)?'WintersReach':null,page,parts:parts.slice(1),invalid:false};
}
let mountVersion=0;
let disposeTermTips: (() => void) | undefined;
export const regionalScreen:Screen={
 html(ctx,param){
  const s=regionalState(ctx.save()),r=route(param),[a='',b='',c='',d='']=r.parts,region=r.region;
  const rc=region?Object.assign(Object.create(ctx),{region}) as RegionCtx:null;
  let body='';
  if(ctx.save().hero.level<REGION_UNLOCK_LEVEL)body=`<div class="rg-lock"><h1>永生战域</h1><p>主角达到 ${REGION_UNLOCK_LEVEL} 级后开放</p><a href="#map" class="rg-button">返回世界地图</a></div>`;
  else if(r.invalid)body='<div class="rg-lock"><h1>战区不存在</h1>'+link('','返回战域总览')+'</div>';
  else if(rc&&!regionOpen(rc.region,weekStartOf(ctx.gateway.now())))body=closedRegion(rc);
  else if(rc&&r.page==='rules')body=`<article class="rg-panel rg-rules">${RULES}</article>`;
  else if(rc){
   if(r.page==='opponents')body=opponents(rc);else if(r.page==='prepare')body=prepare(rc,a,b);else if(r.page==='unit')body=unit(rc,a,b,c,d);else if(r.page==='monolith')body=monolith(rc,a);else if(r.page==='citadel')body=citadel(rc);else body=home(rc);
  }else if(r.page==='rewards')body=rewards(ctx);
  else if(r.page==='rules')body=`<article class="rg-panel rg-rules">${RULES}</article>`;
  else if(r.page==='history')body=`<h1>最近战报</h1><div class="rg-rewards">${s.history.length?s.history.map(h=>`<article class="rg-panel"><div><small>${regionDefinition(h.region??'WintersReach')?.name??'区域对战'}</small><p><b>${h.victory?'胜利':'落败'} · ${esc(h.name)}</b></p></div><span>+${h.vp} 积分</span><time>${new Date(h.at).toLocaleString('zh-CN')}</time></article>`).join(''):'<p>还没有区域战报。</p>'}</div>`;
  else body=atlas(ctx);
  const back=region&&r.page?`#regional/region/${region}`:region||r.page?'#regional':'#map';
  const backName=region&&r.page?regionDefinition(region)!.name:region||r.page?'永生战域':'世界地图';
  return `${topbarHtml()}<main class="screen regional-screen" ${region?`data-region="${region}"`:''}><header class="rg-toolbar"><a href="${back}" class="rg-back">‹ <span>${backName}</span></a><nav>${link('rewards','周奖励')}${link('history','战报')}</nav><span class="rg-balance">燃烧灵魂 <b>${n(s.burningSouls)}</b></span></header><div class="rg-content">${body}</div><div class="rg-message" role="status" aria-live="polite"></div></main>${toastHtml()}`;
 },
 mount(ctx,root,param){
  disposeTermTips?.();disposeTermTips=bindTermTips(root);const version=++mountVersion,region=route(param).region;let busy=false;
  const msg=root.querySelector<HTMLElement>('.rg-message')!;
  async function action(args:RegionalAction){
   if(busy)return;busy=true;msg.innerHTML='<span class="rg-spinner" aria-hidden="true"></span>等待网络中…';
   const states=[...root.querySelectorAll<HTMLButtonElement>('.regional-screen button')].map(b=>[b,b.disabled] as const);states.forEach(([b])=>b.disabled=true);
   try{const {result}=await ctx.gateway.regionalAction(args);if(version!==mountVersion)return;if(isFailure(result)){toast(result.message);msg.textContent=result.message;}else ctx.refresh();}
   catch(e){if(version===mountVersion){toast(e instanceof Error?e.message:'网络异常，请重试');msg.innerHTML='<button class="rg-button" data-action="sync">重新连接</button>';}}
   finally{busy=false;states.forEach(([b,disabled])=>b.disabled=disabled);}
  }
  root.querySelector('.regional-screen')?.addEventListener('click',e=>{
   const el=(e.target as HTMLElement).closest<HTMLElement>('button');if(!el)return;
   if(el.dataset.action)void action({action:el.dataset.action as 'sync'|'refresh',region:region??'CentralSpire'});
   else if(el.dataset.claim)void action({action:'claim',index:Number(el.dataset.claim)});
   else if(el.dataset.fight&&region&&!busy){busy=true;el.setAttribute('disabled','');msg.innerHTML='<span class="rg-spinner" aria-hidden="true"></span>等待网络中…';void ctx.launchRegionalBattle?.(argsOf(region,el.dataset.fight,el.dataset.id??'')).finally(()=>{busy=false;el.removeAttribute('disabled');msg.textContent='';});}
  });
  const s=regionalState(ctx.save()),week=weekStartOf(ctx.gateway.now());
  if(ctx.save().hero.level>=REGION_UNLOCK_LEVEL&&(s.day!==todayStartOf(ctx.gateway.now())||s.week!==week||(region&&regionOpen(region,week)&&s.regions[region].opponents.length!==3)))void action({action:'sync',region:region&&regionOpen(region,week)?region:'CentralSpire'});
 },
 dispose(){mountVersion++;disposeTermTips?.();disposeTermTips=undefined;},
};
