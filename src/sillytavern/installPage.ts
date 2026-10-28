import {createStLoaderArtifacts} from './installer';
import {runtimeAiPrompt} from './runtimeProtocol';
import {createRuntimeRegex} from './runtimeRegex';
import './installPage.css';
const base=new URL('./',window.location.href).href;
const {source,script}=createStLoaderArtifacts(base);
const address=document.querySelector<HTMLElement>('#deployment-address')!;address.textContent=base;
const textarea=document.querySelector<HTMLTextAreaElement>('#loader-source')!;textarea.value=source;
const status=document.querySelector<HTMLElement>('#install-status')!;
function download(name:string,body:string,type:string):void {
 const url=URL.createObjectURL(new Blob([body],{type}));const link=document.createElement('a');link.href=url;link.download=name;link.click();window.setTimeout(()=>URL.revokeObjectURL(url),1000);
}
document.querySelector('#download-runtime-ai')!.addEventListener('click',()=>download('runtime-ai.md',runtimeAiPrompt(),'text/markdown;charset=utf-8'));
document.querySelector('#download-runtime-regex')!.addEventListener('click',()=>download('runtime-regex.json',JSON.stringify(createRuntimeRegex(base),null,2),'application/json;charset=utf-8'));
document.querySelector('#download-runtime-replacement')!.addEventListener('click',()=>download('runtime-regex-replacement.txt',createRuntimeRegex(base).replaceString,'text/plain;charset=utf-8'));
document.querySelector('#download-script')!.addEventListener('click',()=>download('三消战斗与魂片.json',JSON.stringify(script,null,2),'application/json'));
document.querySelector('#download-loader')!.addEventListener('click',()=>download('sillytavern-loader.js',source,'text/javascript'));
document.querySelector('#copy-loader')!.addEventListener('click',()=>{
 const select=():void=>{textarea.closest('details')!.open=true;textarea.focus();textarea.select();status.textContent='已选中加载器，请复制。';};
 if(!navigator.clipboard?.writeText){select();return;}
 void navigator.clipboard.writeText(source).then(()=>{status.textContent='加载器已复制，在酒馆助手脚本中粘贴并启用。';},select);
});
