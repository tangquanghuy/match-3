import type {Page} from '@playwright/test';

/** Minimal stand-in for SillyTavern's chat box (#send_textarea + #send_but); records sent text. */
export async function installTavernChat(page:Page):Promise<void> {
 await page.addInitScript(()=>{
  const sent:string[]=[];Object.assign(window,{__tavernChatSent:sent});
  const mount=()=>{
   if(document.getElementById('send_textarea'))return;
   const area=document.createElement('textarea');area.id='send_textarea';area.hidden=true;
   const button=document.createElement('button');button.id='send_but';button.hidden=true;
   button.onclick=()=>{sent.push(area.value);area.value='';};
   document.body.append(area,button);
  };
  if(document.body)mount();else document.addEventListener('DOMContentLoaded',mount);
 });
}
export function sentTavernMessages(page:Page):Promise<string[]> {
 return page.evaluate(()=>[...((window as unknown as {__tavernChatSent?:string[]}).__tavernChatSent??[])]);
}
