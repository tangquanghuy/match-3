import { isFailure } from '../gateway';
import { queueGiftReveal } from './chestsScreen';
import { getTroopById } from '../../data/troops';
import { RARITY_NAMES, RARITY_COLORS } from '../data/rarity';
import { GACHA_RULES as R } from '../data/gachaRules';
import { matchesTroopCatalog, type TroopCatalogFilter } from '../data/troopCatalog';
import { ROLE_NAMES, ROLE_ORDER } from '../data/roles';
import { reallyOwned, recommendWishlist, validateWishlist, WISHLIST_TROOPS, wishlistHitRate, wishlistKingdom } from '../systems/wishlist';
import { bottomNavHtml, topbarHtml, toast, toastHtml } from '../shell/chrome';
import type { Screen, ShellCtx } from '../shell/screen';
import type { GatewayUpdate } from '../gateway/types';
import type { MetaFailure } from '../types';
import { troopCardFace, escapeHtml as esc } from './troopCard';
import { typeCn } from './teamScreen';

const kingdoms=[...new Set(WISHLIST_TROOPS.map(wishlistKingdom))].sort((a,b)=>a.localeCompare(b,'zh-CN'));
const races=[...new Set(WISHLIST_TROOPS.flatMap(t=>t.troopTypes))].sort();
const colorLabels:Record<string,string>={red:'红',green:'绿',blue:'蓝',yellow:'黄',purple:'紫',brown:'棕'};
const SIZE=12;
export class WishlistScreen implements Screen {
  private ctx!:ShellCtx;
  private root!:HTMLElement;
  private filter:TroopCatalogFilter={};
  private owned='all'; private selectedOnly=false; private availableOnly=false; private sort='id';
  private page=1; private busy=false; private notice=''; private preview:number[]=[];
  private view='browse';
  private controller?:AbortController;
  private choiceMailId: string | null = null;
  private choiceTroopId: number | null = null;
  private choiceQuery = '';
  private choicePage = 1;
  private modalInvoker?:HTMLButtonElement;
  html(_ctx:ShellCtx, param?:string):string {
    if (param?.startsWith('choice/')) {
      let nextId: string | null;
      try { nextId = decodeURIComponent(param.slice(7)); } catch { nextId = null; }
      if (this.choiceMailId !== nextId) { this.choiceQuery = ''; this.choicePage = 1; this.choiceTroopId = null; }
      this.choiceMailId = nextId;
      this.view = 'choice';
      return `${topbarHtml()}<main class="screen wishlist-screen mythic-choice-screen"><header class="wl-head"><div><a class="wl-text-button" href="#mail">← 返回邮件</a><h1>神话自选</h1><p>仅可选择神话部队。确认后将直接写入收藏并展示开箱演出。</p></div></header><div class="wl-layout"><section class="wl-browser"><label class="wl-search">搜索神话部队 <input id="choice-query" type="search" placeholder="输入部队名称"></label><div id="choice-results"></div></section></div><dialog id="choice-confirm" class="wl-dialog"><h2>确认领取神话部队？</h2><p id="choice-name"></p><button type="button" data-choice-cancel>取消</button><button type="button" data-choice-confirm>确认领取</button></dialog></main>${bottomNavHtml('')}${toastHtml()}`;
    }
    this.choiceMailId = null;
    this.view=param==='pursuit'?'pursuit':param==='selected'?'selected':param==='rules'?'rules':'browse';
    return `${topbarHtml()}<main class="screen wishlist-screen" data-view="${this.view}">
      <header class="wl-head"><div><button class="wl-text-button" data-action="back">← 返回宝箱</button><h1>我的愿望单</h1></div><a class="wl-help" href="#wishlist/rules">召唤规则 <span aria-hidden="true">↗</span></a></header>
      <nav class="wl-tabs" aria-label="愿望单页面"><a href="#wishlist" ${this.view==='browse'?'aria-current="page"':''}>选择角色</a><a href="#wishlist/selected" ${this.view==='selected'||this.view==='pursuit'?'aria-current="page"':''}>已选角色 <span id="wl-mobile-count">0</span></a></nav>
      <div class="wl-layout">
        <section class="wl-browser" aria-label="选择角色" ${this.view!=='browse'?'hidden':''}>
          <div class="wl-toolbar"><label class="wl-search"><span class="wl-sr-only">搜索角色</span><input id="wl-query" type="search" placeholder="搜索名字、技能或特质" value="${esc(this.filter.query??'')}"></label><button data-action="filters" id="wl-filter-button">筛选</button><button class="wl-text-button" data-action="reset" id="wl-reset" hidden>重置</button></div>
          <div id="wl-results"></div>
        </section>
        <section class="wl-selection" aria-label="已选愿望角色" ${this.view!=='selected'&&this.view!=='pursuit'?'hidden':''}><div id="wl-selected-panel"></div></section>
        <section class="wl-rules-page" aria-label="召唤规则" ${this.view!=='rules'?'hidden':''}><a href="#wishlist" class="wl-help">← 返回选择</a><h2>召唤规则</h2>
          <section><h3>选择心仪角色</h3><p>愿望单用于宝石宝箱。传说、史诗、神话各可选 ${R.slotsPerRarity} 名，不限王国。随时更换，选择后自动保存。</p></section>
          <section><h3>愿望概率</h3><p>品质概率保持不变。抽到对应品质后，名单内角色有更高机会出现；少选角色不会集中概率。</p><div id="wl-rates"></div><p>每名角色占满名单概率的 1/${R.slotsPerRarity}，空位概率留给名单外角色。愿望角色可重复获得。</p></section>
          <section><h3>神话追寻</h3><p>在已选角色中，指定一名尚未拥有的神话。首次最多 ${R.firstPursuitLimit} 抽获得，第二次最多 ${R.secondPursuitLimit} 抽，第三次起每轮最多 ${R.repeatPursuitLimit} 抽。</p><p>未选择目标时宝石抽数也累计，达到上限后保留资格；选定目标的下一抽必出。更换或取消目标仍保留进度。抽到目标即完成本轮，抽到其他神话不重置。保底在该次抽卡中生效，不额外增加卡片。</p></section>
          <section><h3>十连保障</h3><p>十连至少获得一张稀有或以上角色。</p></section>
        </section>
      </div>
      <dialog id="wl-filters-dialog" class="wl-dialog" aria-labelledby="wl-filters-title"><header><h2 id="wl-filters-title">筛选角色</h2><button data-action="close-filters" aria-label="关闭筛选">×</button></header><div class="wl-filters">
        ${this.select('rarity','品质',[[3,'传说'],[4,'史诗'],[5,'神话']].map(([a,b])=>[String(a),String(b)]),String(this.filter.rarity??''))}
        ${this.select('kingdom','王国',kingdoms.map(k=>[k,k]),this.filter.kingdom??'')}
        ${this.select('color','颜色',Object.entries(colorLabels),this.filter.color??'')}
        ${this.select('type','种族',races.map(r=>[r,typeCn([r])]),this.filter.type??'')}
        ${this.select('role','定位',ROLE_ORDER.map(r=>[r,ROLE_NAMES[r]!]),this.filter.role??'')}
        ${this.select('owned','持有',[['unowned','未拥有'],['owned','已拥有']],this.owned)}
        ${this.select('sort','排序',[['id','图鉴编号'],['name','名称'],['unowned','未拥有优先']],this.sort,false)}
        <label class="wl-check"><input id="wl-selected" type="checkbox" ${this.selectedOnly?'checked':''}>只看已选</label>
        <label class="wl-check"><input id="wl-available" type="checkbox" ${this.availableOnly?'checked':''}>只看可加入</label>
        </div><footer><button data-action="reset-filters">重置</button><button class="wl-primary" data-action="close-filters" id="wl-filter-done">查看角色</button></footer></dialog>
      <dialog id="wl-preview" class="wl-dialog" aria-labelledby="wl-preview-title"><header><h2 id="wl-preview-title">推荐角色</h2><button data-action="cancel-preview" aria-label="关闭推荐">×</button></header><p id="wl-preview-note">优先推荐未拥有的角色，保留已有选择。</p><div id="wl-preview-list"></div><footer><button data-action="cancel-preview">取消</button><button class="wl-primary" data-action="apply-preview">确认加入</button></footer></dialog>
      </main>${bottomNavHtml('宝箱')}${toastHtml()}`;
  }
  private select(key:string,label:string,entries:string[][],value:string,all=true):string {
    return `<label>${label}<select id="wl-${key}">${all?'<option value="">全部</option>':''}${entries.map(([v,l])=>`<option value="${esc(v!)}" ${v===value?'selected':''}>${esc(l!)}</option>`).join('')}</select></label>`;
  }
  mount(ctx:ShellCtx,root:HTMLElement):void {
    this.ctx=ctx;this.root=root;this.controller=new AbortController();
    if (this.view === 'choice') { this.mountChoice(ctx, root); return; }
    const options={signal:this.controller.signal};
    root.addEventListener('click',e=>void this.click(e),options);
    root.addEventListener('input',e=>{if((e.target as HTMLElement).id==='wl-query'){this.filter.query=(e.target as HTMLInputElement).value;this.page=1;this.render();}},options);
    root.addEventListener('change',e=>{
      const el=e.target as HTMLInputElement; const key=el.id.replace('wl-','');
      if(key==='rarity')this.filter.rarity=el.value?Number(el.value):null;
      else if(key==='kingdom'||key==='color'||key==='type'||key==='role')this.filter[key]=el.value||null;
      else if(key==='owned')this.owned=el.value||'all'; else if(key==='sort')this.sort=el.value;
      else if(key==='selected')this.selectedOnly=el.checked;else if(key==='available')this.availableOnly=el.checked;
      else return;
      this.page=1;this.render();
    },options);
    root.querySelector('#wl-preview')!.addEventListener('close',()=>{
      const button=this.modalInvoker?.isConnected ? this.modalInvoker : [...root.querySelectorAll<HTMLButtonElement>('[data-action="recommend"]')].find(b=>b.offsetWidth>0);
      button?.focus({preventScroll:true});
    },options);
    this.render();
    if(this.view==='pursuit') queueMicrotask(() => {
      if(this.controller?.signal.aborted)return;
      const pursuit=this.root.querySelector<HTMLElement>('#wl-pursuit');
      if(!pursuit)return;
      pursuit.scrollIntoView?.({block:'center',behavior:'smooth'});
      pursuit.focus({preventScroll:true});
    });
  }
  private mountChoice(ctx: ShellCtx, root: HTMLElement): void {
    const mailId = this.choiceMailId;
    const item = ctx.save().mailbox.items.find(mail => mail.id === mailId);
    if (!item || !item.mythicChoice || item.claimedAt === null) {
      root.querySelector('#choice-results')!.textContent = '这封邮件没有待使用的神话自选，请返回邮件查看。';
      return;
    }
    const query = root.querySelector<HTMLInputElement>('#choice-query')!;
    const dialog = root.querySelector<HTMLDialogElement>('#choice-confirm')!;
    query.value = this.choiceQuery;
    let page = this.choicePage;
    const draw = () => {
      const matches = WISHLIST_TROOPS.filter(t => t.rarityIdx === 5 && t.id !== 7446 && t.id !== 7622
        && (t.name.includes(query.value.trim()) || !query.value.trim()));
      const pages = Math.max(1, Math.ceil(matches.length / SIZE));
      page = Math.min(page, pages);
      this.choicePage = page;
      root.querySelector('#choice-results')!.innerHTML = `<div class="wl-result-head"><span>${matches.length} 名神话角色 · 剩余 ${item.mythicChoice} 次自选</span><span>${page} / ${pages}</span></div>
        <div class="wl-grid">${matches.slice((page - 1) * SIZE, page * SIZE).map(t => {
          const rec = (ctx.save().collectionTruth ?? ctx.save().collection)[String(t.id)];
          return `<article class="wl-card"><button type="button" class="collection-card r-5${rec ? '' : ' locked'}" style="--rc:${RARITY_COLORS[5]}" data-choice-detail="${t.id}" aria-label="查看${esc(t.name)}详情">${troopCardFace(t, rec)}</button>
            <small>${esc(wishlistKingdom(t))} · 神话${rec ? ' · 已拥有，领取后成为副本' : ''}</small>
            <div class="wl-choice-actions"><button type="button" data-choice-detail="${t.id}">查看详情</button>
            <button type="button" data-choice-id="${t.id}">选择 ${esc(t.name)}</button></div></article>`;
        }).join('')}</div><div class="wl-pages"><button type="button" data-choice-page="prev" ${page === 1 ? 'disabled' : ''}>上一页</button><span>${page} / ${pages}</span><button type="button" data-choice-page="next" ${page === pages ? 'disabled' : ''}>下一页</button></div>`;
    };
    query.addEventListener('input', () => { this.choiceQuery = query.value; page = 1; draw(); });
    root.addEventListener('click', event => {
      const button = (event.target as HTMLElement).closest<HTMLButtonElement>('button');
      if (!button) return;
      if (button.dataset.choicePage) { page += button.dataset.choicePage === 'next' ? 1 : -1; draw(); }
      if (button.dataset.choiceDetail && mailId) {
        ctx.navigate(`#troop/${button.dataset.choiceDetail}/choice/${encodeURIComponent(mailId)}`);
        return;
      }
      if (button.dataset.choiceId) {
        this.choiceTroopId = Number(button.dataset.choiceId);
        root.querySelector('#choice-name')!.textContent = getTroopById(this.choiceTroopId)?.name ?? '';
        dialog.showModal();
      }
      if (button.hasAttribute('data-choice-cancel')) dialog.close();
    });
    root.querySelector<HTMLButtonElement>('[data-choice-confirm]')!.onclick = async () => {
      if (this.busy || !mailId || !this.choiceTroopId) return;
      this.busy = true;
      const troopId = this.choiceTroopId;
      root.querySelector<HTMLButtonElement>('[data-choice-confirm]')!.disabled = true;
      try {
        const { result } = await ctx.gateway.chooseMailMythic(mailId, troopId);
        if (isFailure(result)) { toast(result.message); dialog.close(); return; }
        // The authoritative save has already committed both the grant and entitlement consumption.
        // The reveal is cosmetic and can safely be interrupted or skipped.
        queueGiftReveal({ cards: [{ troopId: result.troopId, rarityIdx: 5, duplicate: result.duplicate }],
          gems: 0, gold: 0, souls: 0, mats: {}, returnHash: '#mail', label: '神话自选' });
        ctx.navigate('#chests/gems');
      } catch {
        dialog.close();
        toast('领取结果待同步，请返回邮件核对后重试');
      } finally {
        this.busy = false;
        const confirm = root.querySelector<HTMLButtonElement>('[data-choice-confirm]');
        if (confirm) confirm.disabled = false;
      }
    };
    draw();
  }
  dispose():void { this.controller?.abort(); }
  private render():void {
    if(this.controller?.signal.aborted)return;
    const save=this.ctx.save(),ids=save.gachaWishlist.troopIds;
    this.root.querySelector('#wl-mobile-count')!.textContent=String(ids.length);
    const count=[this.filter.rarity,this.filter.kingdom,this.filter.color,this.filter.type,this.owned!=='all',this.selectedOnly,this.availableOnly,this.sort!=='id'].filter(Boolean).length;
    this.root.querySelector('#wl-filter-button')!.textContent=count?`筛选 · ${count}`:'筛选';
    (this.root.querySelector('#wl-reset') as HTMLElement).hidden=!count&&!this.filter.query;
    const choices=WISHLIST_TROOPS.filter(t=>matchesTroopCatalog(t,this.filter)
      && (this.owned==='all'||(this.owned==='owned')===reallyOwned(save,t.id))
      && (!this.selectedOnly||ids.includes(t.id))
      && (!this.availableOnly||(!ids.includes(t.id)&&!validateWishlist([...ids,t.id]))));
    choices.sort((a,b)=>this.sort==='name'?a.name.localeCompare(b.name,'zh-CN'):this.sort==='unowned'?Number(reallyOwned(save,a.id))-Number(reallyOwned(save,b.id))||a.id-b.id:a.id-b.id);
    const pages=Math.max(1,Math.ceil(choices.length/SIZE));this.page=Math.max(1,Math.min(this.page,pages));
    this.root.querySelector('#wl-results')!.innerHTML=`<div class="wl-result-head"><span>${choices.length} 名角色</span><span>${this.page} / ${pages}</span></div>
      <div class="wl-grid">${choices.slice((this.page-1)*SIZE,this.page*SIZE).map(t=>{
        const selected=ids.includes(t.id);
        const rec=(save.collectionTruth??save.collection)[String(t.id)];
        return `<article class="wl-card ${selected?'is-selected':''}"><button class="collection-card r-${t.rarityIdx}${!rec?' locked':''}" style="--rc:${RARITY_COLORS[t.rarityIdx]}" data-detail="${t.id}" aria-label="查看${esc(t.name)}详情">${troopCardFace(t,rec)}</button>
          <small>${esc(wishlistKingdom(t))} · ${RARITY_NAMES[t.rarityIdx]}</small>
          <button data-toggle="${t.id}" ${this.busy?'disabled':''} aria-label="${selected?'移除':'加入'}${esc(t.name)}" aria-pressed="${selected}">${selected?'✓ 已加入':'+ 加入'}</button></article>`;
      }).join('')}</div>
      ${!choices.length?'<div class="wl-empty"><h3>没有匹配的角色</h3><p>试试减少筛选条件，或用名字、技能关键词搜索。</p><button data-action="reset">重置全部筛选</button></div>':''}
      <div class="wl-pages"><button data-action="prev" ${this.page===1?'disabled':''}>上一页</button><span>${this.page} / ${pages}</span><button data-action="next" ${this.page===pages?'disabled':''}>下一页</button></div>`;
    const groups=[3,4,5].filter(r=>ids.some(id=>getTroopById(id)?.rarityIdx===r));
    const p=save.gachaWishlist.pursuit;
    const active=p.targetId!==null&&!reallyOwned(save,p.targetId);
    this.root.querySelector('#wl-filter-done')!.textContent=`查看 ${choices.length} 名角色`;
    this.root.querySelector('#wl-rates')!.innerHTML=`<table><thead><tr><th>品质</th><th>当前名单命中</th><th>满名单命中</th></tr></thead><tbody>${[3,4,5].map(r=>`<tr><th>${RARITY_NAMES[r]}</th><td>${(wishlistHitRate(ids,r)*100).toFixed(1)}%</td><td>${R.wishlistShares[r]!*100}%</td></tr>`).join('')}</tbody></table>`;
    this.root.querySelector('#wl-selected-panel')!.innerHTML=`<div class="wl-selection-head"><div><h2>已选角色 <span>${ids.length}</span></h2><p class="wl-status" role="status" aria-live="polite">${esc(this.notice)}</p></div><button data-action="recommend" ${this.busy?'disabled':''}>推荐角色</button></div>
      <section id="wl-pursuit" class="wl-pursuit ${active?'is-active':'is-empty'}" tabindex="-1" role="region" aria-labelledby="wl-pursuit-title"><div class="wl-pursuit-copy"><h3 id="wl-pursuit-title">神话追寻</h3><b>${active?esc(getTroopById(p.targetId!)!.name):p.progress?'等待选择新的神话目标':'尚未设置'}</b><p>${p.progress>=p.limit?active?'下一抽必出当前目标':'选定目标后下一抽必出':active?`当前目标 · 最多再 ${p.limit-p.progress} 抽`:'未选择目标也累计宝石抽数'}</p></div><div class="wl-pursuit-progress"><span>进度 ${p.progress} / ${p.limit} 抽</span><progress aria-label="神话追寻进度" max="${p.limit}" value="${p.progress}"></progress></div>${active?`<button data-action="pause" ${this.busy?'disabled':''}>取消目标</button>`:`<button class="wl-pursuit-choose" data-action="choose-pursuit" ${this.busy?'disabled':''}>选择神话</button>`}</section>
      <div class="wl-groups">${groups.map(k=>`<section class="wl-group"><h3>${RARITY_NAMES[k]} ${ids.filter(id=>getTroopById(id)?.rarityIdx===k).length}/${R.slotsPerRarity}<button class="wl-clear-group wl-text-button" data-clear-rarity="${k}" ${this.busy?'disabled':''}>移除此组</button></h3><div class="wl-group-picks">${ids.filter(id=>getTroopById(id)?.rarityIdx===k).map(id=>{
        const t=getTroopById(id)!,rec=(save.collectionTruth??save.collection)[String(id)];
        return `<article class="wl-pick"><button class="collection-card r-${t.rarityIdx}" style="--rc:${RARITY_COLORS[t.rarityIdx]}" data-detail="${id}" aria-label="查看${esc(t.name)}详情">${troopCardFace(t,rec)}</button><div class="wl-pick-actions">
          ${t.rarityIdx===5&&!reallyOwned(save,id)?`<button data-pursue="${id}" ${p.targetId===id||this.busy?'disabled':''}>${p.targetId===id?'追寻中':'追寻'}</button>`:''}<button data-toggle="${id}" aria-label="移除${esc(t.name)}" ${this.busy?'disabled':''}>移除</button></div></article>`;
      }).join('')}</div></section>`).join('')||'<div class="wl-empty"><span class="wl-empty-star" aria-hidden="true">✧</span><h3>把喜欢的角色留在这里</h3><a href="#wishlist" class="wl-primary">选择角色</a></div>'}</div>
      ${ids.length?`<footer class="wl-selection-foot"><button class="wl-text-button" data-action="clear" ${this.busy?'disabled':''}>清空愿望单</button></footer>`:''}`;
  }

  private async write(action:()=>Promise<GatewayUpdate<{ok:true}|MetaFailure>>):Promise<void> {
    if(this.busy)return;this.busy=true;this.notice='保存中…';this.render();
    try { const {result}=await action();this.notice=result.ok?'已保存':result.message;this.ctx.refreshChrome(); }
    catch { this.notice='保存失败，请重试'; }
    finally {this.busy=false;this.render();}
  }
  private async click(e:Event):Promise<void> {
    const btn=(e.target as HTMLElement).closest<HTMLButtonElement>('button');if(!btn||btn.disabled)return;
    const {action,detail,toggle,pursue,clearRarity}=btn.dataset;
    if(clearRarity){await this.write(()=>this.ctx.gateway.setWishlist(this.ctx.save().gachaWishlist.troopIds.filter(id=>getTroopById(id)?.rarityIdx!==Number(clearRarity))));return;}
    if(detail){this.ctx.navigate(`#troop/${detail}/wishlist`);return;}
    if(toggle){const id=Number(toggle),ids=this.ctx.save().gachaWishlist.troopIds;const next=ids.includes(id)?ids.filter(n=>n!==id):[...ids,id];const error=validateWishlist(next);if(error){toast(error.message);return;}await this.write(()=>this.ctx.gateway.setWishlist(next));return;}
    if(pursue){await this.write(()=>this.ctx.gateway.setPursuitTarget(Number(pursue)));return;}
    const dialog=this.root.querySelector<HTMLDialogElement>('#wl-preview')!;
    if(action==='filters')this.root.querySelector<HTMLDialogElement>('#wl-filters-dialog')!.showModal();
    else if(action==='close-filters')this.root.querySelector<HTMLDialogElement>('#wl-filters-dialog')!.close();
    else if(action==='back')this.ctx.navigate('#chests/gems');
    else if(action==='encyclopedia')this.ctx.navigate('#troop');
    else if(action==='reset'||action==='reset-filters'){this.filter={};this.owned='all';this.selectedOnly=false;this.availableOnly=false;this.sort='id';this.page=1;this.ctx.refresh();if(action==='reset-filters')this.root.querySelector<HTMLDialogElement>('#wl-filters-dialog')!.showModal();}
    else if(action==='prev'||action==='next'){this.page+=action==='prev'?-1:1;this.render();this.root.querySelector('.wl-layout')!.scrollTop=0;}
    else if(action==='choose-pursuit'){
      this.filter={rarity:R.pursuitRarity};this.owned='unowned';this.selectedOnly=false;this.availableOnly=false;this.sort='unowned';this.page=1;
      this.ctx.navigate('#wishlist');
    }
    else if(action==='pause')await this.write(()=>this.ctx.gateway.setPursuitTarget(null));
    else if(action==='recommend'||action==='clear'){
      this.modalInvoker=btn;
      this.root.querySelector('#wl-preview-note')!.textContent=action==='clear'?'所有已选角色都会移除，追寻进度保留。':'优先推荐未拥有的角色，保留已有选择。';
      this.root.querySelector('[data-action="apply-preview"]')!.textContent=action==='clear'?'确认清空':'确认加入';
      this.preview=action==='clear'?[]:recommendWishlist(this.ctx.save());
      this.root.querySelector('#wl-preview-title')!.textContent=action==='clear'?'确认清空愿望单？':'推荐角色';
      this.root.querySelector('#wl-preview-list')!.innerHTML=action==='clear'?'<p>清空会暂停追寻；已有进度保留。</p>':`<p>将加入 ${this.preview.filter(id=>!this.ctx.save().gachaWishlist.troopIds.includes(id)).length} 名角色</p>`+this.preview.filter(id=>!this.ctx.save().gachaWishlist.troopIds.includes(id)).map(id=>{const t=getTroopById(id)!;return `<p>${esc(wishlistKingdom(t))} · ${RARITY_NAMES[t.rarityIdx]} · ${esc(t.name)}</p>`;}).join('');
      dialog.showModal();
    }else if(action==='cancel-preview')dialog.close();
    else if(action==='apply-preview'){dialog.close();await this.write(()=>this.ctx.gateway.setWishlist(this.preview));}
  }
}
