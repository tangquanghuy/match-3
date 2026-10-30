import {ResultScreen} from '../meta/screens/resultScreen';
import resultStyles from '../meta/shell/styles/result.css?raw';
import type {AbilitySource,SettlementReceipt} from './save';
import {sourceFragmentName} from './fragmentRewards';
import {abilityDisplayName,fragmentDisplayName} from './abilityName';

export interface StSettlementView {
 dispose():void;
 setContinueEnabled(enabled:boolean):void;
}
const views=new WeakMap<HTMLElement,StSettlementView>();
/** Adapt the committed receipt to the game's native result screen. Never credits or rolls. */
export function renderStSettlement(mount:HTMLElement,receipt:SettlementReceipt,options:{onContinue?:()=>void;playMusic?:boolean;sources?:readonly AbilitySource[]}={}):StSettlementView {
 views.get(mount)?.dispose();
 const doc=mount.ownerDocument;
 // Preserve an intrinsic fallback for auto-height embeds while fitting short, sized parents.
 const host=doc.createElement('div');host.style.cssText='display:block;position:relative;width:100%;height:100%;min-height:0;contain:size;contain-intrinsic-height:360px';
 const shadow=host.attachShadow({mode:'open'});
 const style=doc.createElement('style');style.textContent=`
 :host{--gold:#d8c290;--light:#f4e2b4;--ink:#f2ead8;--display:"Palatino Linotype","STZhongsong","SimSun",serif;--body:"Segoe UI","Microsoft YaHei",sans-serif}
 *,*::before,*::after{box-sizing:border-box}button{font:inherit;cursor:pointer}[hidden]{display:none!important}
 .stage{position:absolute;inset:0;min-height:0}
 ${resultStyles}
 /* Committed receipts have no source subtitle, so the reward strip would sit on the lower half
    of the banner's zodiac art. Start it below the art: the art is centred 5.4cqmin above the banner
    bottom and is half as tall as wide, so it reaches a quarter of its width below that centre. */
 .result-screen[data-result-mode="committed"] .rs-summary-content .rs-strip{margin-top:max(12px,calc(min(25cqw,225px,25cqh) - 5.4cqmin + 6px))}
 @container rs (max-width: 760px){.result-screen[data-result-mode="committed"] .rs-summary-content .rs-strip{margin-top:max(12px,calc(min(37.5cqw,25cqh) - 5.4cqmin + 6px))}}`;
 const stage=doc.createElement('div');stage.className='stage';stage.setAttribute('aria-label','本场战斗结算');stage.dataset.battleId=receipt.battleId;
 const screen=new ResultScreen(stage);stage.innerHTML=screen.committedHtml();
 shadow.append(style,stage);mount.replaceChildren(host);
 // The owner's page preference lives outside this shadow tree. Keep it live on reopen too.
 const syncMotion=()=>{stage.dataset.motion=doc.documentElement.dataset.motion??'full';};
 syncMotion();
 const motionObserver=new MutationObserver(syncMotion);
 motionObserver.observe(doc.documentElement,{attributes:true,attributeFilter:['data-motion']});
 const rewards=[
  ...receipt.grants.map(grant=>({...grant,name:grant.kind==='fragment'?(sourceFragmentName(receipt.request.enemyTeam,options.sources??[],grant.id)??fragmentDisplayName(grant.name)):grant.name})),
  ...receipt.learnedAbilityIds.map(id=>({id,kind:'ability',name:abilityDisplayName(receipt.learnedAbilityNames[id]??id),quantity:1})),
 ];
 screen.mountCommitted({victory:receipt.winner==='player',rewards,...options});
 for(const image of stage.querySelectorAll<HTMLImageElement>('img[src]')){
  const src=image.getAttribute('src');if(src)image.src=new URL(src,import.meta.url).href;
 }
 const view:StSettlementView={
  dispose(){motionObserver.disconnect();screen.dispose();host.remove();if(views.get(mount)===view)views.delete(mount);},
  setContinueEnabled(enabled){stage.querySelector<HTMLButtonElement>('#again')!.disabled=!enabled;},
 };
 views.set(mount,view);return view;
}
