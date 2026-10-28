import shellCss from '../meta/shell/styles/style.css?inline';
import screenCss from '../meta/shell/styles/screens.css?inline';
import troopCss from '../meta/shell/styles/troop.css?inline';
import managementCss from './managementPage.css?inline';

/** CSS is injected into the Tavern document; artwork must keep the game origin. */
export function managementAsset(path:string):string {
 return new URL(path,import.meta.url).href;
}
export const managementPageCss=[shellCss,screenCss,troopCss,managementCss].join('\n')
 .replaceAll(':root',':host')
 .replace(/url\((['"]?)(\/[^)'"]+)\1\)/g,(_match,_quote:string,path:string)=>`url("${managementAsset(path)}")`);
