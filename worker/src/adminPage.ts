/** Standalone admin viewer: bearer token stays in memory and is never put in a URL or storage. */
export const adminPage = `<!doctype html>
<html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>线上玩家存档查询</title>
<style nonce="__ADMIN_NONCE__">
:root { color-scheme: dark; font-family: system-ui,-apple-system,"Microsoft YaHei",sans-serif; background:#0e1420; color:#e4ebf6 }
* { box-sizing:border-box } body { max-width:1100px; padding:24px; margin:auto } h1 { font-size:1.55rem; margin:0 0 6px }
p { color:#aab9ca } .hint { font-size:.9rem; margin:0 0 22px } form { display:flex; gap:8px; flex-wrap:wrap; margin:16px 0 }
input { min-width:230px; flex:1; padding:11px 13px; background:#192337; color:#fff; border:1px solid #39465f; border-radius:7px }
button { cursor:pointer; padding:10px 15px; background:#3d72ce; border:0; border-radius:7px; color:#fff; font-weight:600 }
button:hover { background:#5287e0 } button.secondary { background:#324159 }
section,details { background:#182234; border:1px solid #32415a; border-radius:9px; padding:17px; margin:16px 0 }
#status { min-height:1.5em; color:#e5bd74 } #matches button { margin:3px; text-align:left }
.grid { display:grid; grid-template-columns:repeat(auto-fit,minmax(210px,1fr)); gap:10px }
.card { padding:12px; border-radius:7px; background:#212f47; overflow-wrap:anywhere } .label { font-size:.82rem; color:#aab9ca; display:block; margin-bottom:5px }
table { width:100%; border-collapse:collapse; font-size:.9rem } th,td { padding:9px 6px; border-bottom:1px solid #32415a; text-align:left; vertical-align:top }
.scroll { overflow:auto } .result-head { display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap } pre { white-space:pre-wrap; word-break:break-all; max-height:65vh; overflow:auto; font-size:.8rem }
[hidden] { display:none!important }
</style></head><body>
<h1>线上玩家存档查询</h1><p class="hint">直接读取 Durable Object 已保存的存档，不使用 PvP 镜像；查询不会领取邮件、结算战斗或更新存档。令牌仅留在本页内存，关闭或刷新页面后需重新输入。</p>
<form id="login"><input id="token" type="password" required autocomplete="off" placeholder="管理员查询令牌" aria-label="管理员查询令牌"><button type="submit">进入查询</button></form>
<div id="status" role="status"></div>
<div id="panel" hidden>
<form id="search"><input id="query" type="search" maxlength="64" required placeholder="输入玩家昵称或 player_id" aria-label="玩家昵称或 player_id"><button type="submit">搜索</button></form>
<section><strong>匹配账号</strong><div id="matches"></div></section>
<section id="result" hidden><div class="result-head"><h2 id="name"></h2><button id="refresh" class="secondary" type="button">刷新当前存档</button></div><div id="summary" class="grid"></div>
<h3>系统邮件（投递记录 / 当前存档领取情况）</h3><div class="scroll"><table><thead><tr><th>邮件</th><th>发信时间</th><th>投递</th><th>附件</th></tr></thead><tbody id="mail"></tbody></table></div>
<details><summary>完整存档 JSON（原始持久化记录）</summary><button id="download" class="secondary" type="button">下载 JSON</button><pre id="raw"></pre></details></section>
</div>
<script nonce="__ADMIN_NONCE__">
(() => {
  let token = '', selected = '', lastResult = null;
  const byId = id => document.getElementById(id);
  const status = text => { byId('status').textContent = text; };
  const time = ms => ms ? new Date(ms).toLocaleString('zh-CN', { timeZone: 'Asia/Hong_Kong', hour12: false }) : '—';
  const text = value => value === null || value === undefined ? '—' : String(value);
  async function api(path, options = {}) {
    const res = await fetch(path, { ...options, cache: 'no-store', headers: { 'authorization': 'Bearer ' + token, ...(options.headers || {}) } });
    if (res.status === 401) { token = ''; byId('panel').hidden = true; byId('login').hidden = false; throw Error('查询令牌有误，请重新输入。'); }
    if (!res.ok) throw Error('查询失败（HTTP ' + res.status + '）');
    return res.json();
  }
  function card(label, value) { const el = document.createElement('div'); el.className = 'card'; const a = document.createElement('span'); a.className = 'label'; a.textContent = label; el.append(a, document.createTextNode(text(value))); byId('summary').append(el); }
  function cell(row, value) { const td = document.createElement('td'); td.textContent = text(value); row.append(td); }
  async function openPlayer(id) {
    status('正在读取当前存档…');
    try {
      const data = await api('/api/admin/player/' + encodeURIComponent(id));
      selected = id; lastResult = data; const save = data.save;
      byId('result').hidden = false; byId('name').textContent = data.account.username + '  (' + id + ')';
      byId('summary').replaceChildren();
      card('账号创建', time(data.account.created_at)); card('最近登录', time(data.account.last_login_at));
      card('存档创建', save ? time(save.createdAt) : '尚未创建存档'); card('存档最近保存', save ? time(save.savedAt) : '—');
      card('主角等级', save && save.hero ? save.hero.level : '—'); card('角色名称', save && save.character ? save.character.name : '—');
      card('存档版本 / 修订号', save ? text(save.version) + ' / ' + text(save.revision) : '—');
      card('黄金 / 宝石', save && save.currencies ? text(save.currencies.gold) + ' / ' + text(save.currencies.gems) : '—');
      card('部队收藏数量', save && save.collection ? Object.keys(save.collection).length : 0);
      card('查询时刻（香港时间）', time(data.inspectedAt));
      byId('mail').replaceChildren();
      const items = save && save.mailbox && Array.isArray(save.mailbox.items) ? save.mailbox.items : [];
      const itemById = new Map(items.map(item => [item.id, item]));
      for (const mail of data.systemMail) {
        const row = document.createElement('tr'); const item = itemById.get(mail.id);
        cell(row, mail.title + ' (' + mail.id + ')'); cell(row, time(mail.sent_at));
        cell(row, mail.delivered_at ? time(mail.delivered_at) : '待登录投递');
        cell(row, item ? (item.claimedAt ? '已领取：' + time(item.claimedAt) : '未领取') : (mail.delivered_at ? '当前存档中无此邮件' : '尚未进入存档'));
        byId('mail').append(row);
      }
      if (!data.systemMail.length) { const row = document.createElement('tr'); cell(row, '无系统邮件'); byId('mail').append(row); }
      byId('raw').textContent = save ? JSON.stringify(save, null, 2) : '无存档';
      status('已读取线上持久化存档，查询不会触发游戏操作。');
    } catch (err) { status(err.message); }
  }
  byId('login').addEventListener('submit', event => { event.preventDefault(); token = byId('token').value.trim(); byId('token').value = ''; byId('login').hidden = true; byId('panel').hidden = false; byId('query').focus(); status('请输入昵称或 player_id。'); });
  byId('search').addEventListener('submit', async event => {
    event.preventDefault(); const query = byId('query').value.trim(); if (!query) return;
    status('正在搜索…');
    try {
      const data = await api('/api/admin/lookup', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ query }) });
      byId('matches').replaceChildren();
      for (const account of data.accounts) { const button = document.createElement('button'); button.type = 'button'; button.className = 'secondary'; button.textContent = account.username + ' · ' + account.player_id + ' · ' + time(account.created_at); button.addEventListener('click', () => openPlayer(account.player_id)); byId('matches').append(button); }
      status(data.accounts.length ? '找到 ' + data.accounts.length + ' 个账号，请点击查看。' : '未找到匹配账号。');
    } catch (err) { status(err.message); }
  });
  byId('refresh').addEventListener('click', () => { if (selected) openPlayer(selected); });
  byId('download').addEventListener('click', () => { if (!lastResult) return; const blob = new Blob([JSON.stringify(lastResult, null, 2)], { type: 'application/json' }); const href = URL.createObjectURL(blob); const link = document.createElement('a'); link.href = href; link.download = lastResult.account.username + '-' + lastResult.account.player_id + '.json'; link.click(); setTimeout(() => URL.revokeObjectURL(href), 1000); });
})();
</script></body></html>`;
