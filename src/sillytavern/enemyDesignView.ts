import {COLOR_NAMES,FORMS,RANKS,ROLE_NAMES,ROLE_ORDER,PORTRAITS,colorKey} from './portraits';
import type {TroopRole} from '../data/troops';

/** The form submits semantic choices; recipe and artwork IDs stay inside the compiler. */
export interface EnemyDesignDraft {
 manaColors:string[];rank:string;form:string;role:string;level:number;difficulty:number;
 requiredEffects:string[];
 assembly?:'native'|'classified';
 maxMemberPower?:number;
}
export interface EnemyDesignFormOptions {
 effects:readonly {id:string;label:string}[];
 prompt:string;
 compile:(draft:EnemyDesignDraft,seed:number)=>void;
 restore:()=>{draft:EnemyDesignDraft;seed:number};
 initial?:{draft:EnemyDesignDraft;seed:number};
 hasSaved:()=>boolean;
 refresh:()=>void;
 restoredNotice?:string;
}

function el<K extends keyof HTMLElementTagNameMap>(tag:K,text?:string):HTMLElementTagNameMap[K] {
 const element=document.createElement(tag);if(text!==undefined)element.textContent=text;return element;
}

/** One controller survives the preview's renders and preserves an unsuccessful draft. */
export function createEnemyDesignForm(options:EnemyDesignFormOptions):()=>HTMLElement {
 const initial=PORTRAITS.find(p=>p.troopId===6004)??PORTRAITS[0]!;
 let draft:EnemyDesignDraft={manaColors:[...initial.manaColors],rank:initial.rank,form:initial.form,role:initial.role,level:20,difficulty:1,requiredEffects:[],assembly:'classified'};
 if(options.initial)draft={...structuredClone(options.initial.draft),assembly:options.initial.draft.assembly??'classified'};
 let advancedEffectsOpen=draft.requiredEffects.length>0;
 let memberPowerDraft=draft.maxMemberPower===undefined?'':String(draft.maxMemberPower);
 let seed=String(options.initial?.seed??6004);let message=options.restoredNotice??'';let failed=false;
 const colorSets=[...new Set(PORTRAITS.map(p=>colorKey(p.manaColors)))].sort((a,b)=>a.split(',').length-b.split(',').length||a.localeCompare(b));
 const renderForm=()=>{
  const panel=el('section');panel.className='semantic-design';panel.setAttribute('aria-label','按战术设计敌人');
  panel.append(el('h2','按战术设计敌人'),el('p','选择外形分类和职责，程序加权生成完整战法并匹配立绘。'));
  const modeNotice=el('p');modeNotice.setAttribute('aria-label','组装方式说明');
  const explainMode=()=>{modeNotice.textContent=draft.assembly==='classified'?'按职责加权选择主动技能与特质，无需勾选效果。':'匹配原生完整配置，保留同一来源的主动与特质。';};
  explainMode();panel.append(modeNotice);
  const form=el('form');const controls=el('div');controls.className='blueprint-controls';
  const select=(label:string,values:readonly string[],value:string,labelOf:(v:string)=>string,change:(value:string)=>void)=>{
   const field=el('label',label);const input=el('select');input.setAttribute('aria-label',label);
   for(const v of values)input.append(new Option(labelOf(v),v));input.value=value;input.onchange=()=>change(input.value);field.append(input);controls.append(field);
  };
  select('组装方式',['classified','native'],draft.assembly??'classified',v=>v==='classified'?'按机制分类组装':'原生完整配置',v=>{draft.assembly=v as 'native'|'classified';explainMode();});
  select('设计法力颜色',colorSets,colorKey(draft.manaColors),v=>v.split(',').map(c=>COLOR_NAMES[c]??c).join(' / '),v=>{draft.manaColors=v.split(',');});
  select('设计档位',RANKS,draft.rank,v=>v,v=>{draft.rank=v;});
  select('设计形态',FORMS,draft.form,v=>v,v=>{draft.form=v;});
  select('设计职责',ROLE_ORDER,draft.role,v=>ROLE_NAMES[v as TroopRole]??v,v=>{draft.role=v;});
  for(const field of [{key:'level',label:'设计等级',min:1,max:100,step:1},{key:'difficulty',label:'设计难度',min:.1,max:10,step:.1}] as const){
   const label=el('label',field.label);const input=el('input');input.type='number';input.required=true;input.min=String(field.min);input.max=String(field.max);input.step=String(field.step);input.value=String(draft[field.key]);input.setAttribute('aria-label',field.label);input.oninput=()=>{draft[field.key]=Number(input.value);};label.append(input);controls.append(label);
  }
  const powerLabel=el('label','单体参考战力上限（可选）');const powerInput=el('input');powerInput.type='text';powerInput.inputMode='numeric';powerInput.value=memberPowerDraft;powerInput.setAttribute('aria-label','单体参考战力上限');
  powerInput.oninput=()=>{memberPowerDraft=powerInput.value;draft.maxMemberPower=memberPowerDraft.trim()===''?undefined:Number(memberPowerDraft);};powerLabel.append(powerInput);controls.append(powerLabel);
  const seedLabel=el('label','设计种子');const seedInput=el('input');seedInput.type='number';seedInput.step='1';seedInput.required=true;seedInput.value=seed;seedInput.setAttribute('aria-label','设计种子');seedInput.oninput=()=>{seed=seedInput.value;};seedLabel.append(seedInput);controls.append(seedLabel);form.append(controls,el('p','种子用于复现；换种子可换战法。'));
  const advanced=el('details');advanced.open=advancedEffectsOpen;advanced.ontoggle=()=>{advancedEffectsOpen=advanced.open;};advanced.append(el('summary','高级：手动约束效果'));
  const effects=el('fieldset');effects.className='design-effects';effects.append(el('legend','必需效果（可留空）'));
  for(const effect of options.effects){
   const label=el('label');const checkbox=el('input');checkbox.type='checkbox';checkbox.value=effect.id;checkbox.checked=draft.requiredEffects.includes(effect.id);checkbox.setAttribute('aria-label',`需要${effect.label}`);
   checkbox.onchange=()=>{draft.requiredEffects=checkbox.checked?[...draft.requiredEffects,effect.id]:draft.requiredEffects.filter(v=>v!==effect.id);};label.append(checkbox,document.createTextNode(effect.label));effects.append(label);
  }
  effects.append(el('p','留空按职责自动生成；勾选的效果须全部满足。'));advanced.append(effects);form.append(advanced);
  const status=el('p');status.setAttribute('aria-live','polite');status.className='design-feedback';
  const show=(text:string,error:boolean)=>{message=text;failed=error;status.textContent=text;status.setAttribute('role',error?'alert':'status');};
  if(message)show(message,failed);
  const submit=el('button','编译战术设计');submit.type='submit';form.append(submit);
  const restore=el('button','恢复已保存的战术设计');restore.type='button';restore.disabled=!options.hasSaved();
  restore.onclick=()=>{try{const restored=options.restore();draft={...structuredClone(restored.draft),assembly:restored.draft.assembly??'classified'};advancedEffectsOpen=draft.requiredEffects.length>0;memberPowerDraft=draft.maxMemberPower===undefined?'':String(draft.maxMemberPower);seed=String(restored.seed);message='已恢复完整战术设计';failed=false;options.refresh();}catch(error){show(error instanceof Error?error.message:'战术设计读取失败',true);}};
  form.append(restore,status);
  form.onsubmit=event=>{
   event.preventDefault();
   if(!Number.isSafeInteger(Number(seed))||seed.trim()===''){show('设计种子需要填写整数',true);return;}
   try{options.compile(structuredClone(draft),Number(seed));show('战术设计已编译，请检查下方能力配置后保存或加入编队',false);options.refresh();}
   catch(error){show(error instanceof Error?error.message:'战术设计编译失败',true);}
  };
  panel.append(form);
  const details=el('details');details.append(el('summary','查看酒馆设计说明'));const prompt=el('pre',options.prompt);details.append(prompt);panel.append(details);
  return panel;
 };
 return renderForm;
}
