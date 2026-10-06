/** Standalone admin viewer: bearer token stays in memory and is never put in a URL or storage. */
export const adminPage = `<!doctype html>
<html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>线上玩家与写入监控</title>
<style nonce="__ADMIN_NONCE__">
:root { color-scheme: dark; font-family: system-ui,-apple-system,"Microsoft YaHei",sans-serif; background:#0e1420; color:#e4ebf6 }
* { box-sizing:border-box } body { max-width:1100px; padding:24px; margin:auto } h1 { font-size:1.55rem; margin:0 0 6px }
p { color:#aab9ca } .hint { font-size:.9rem; margin:0 0 22px } form { display:flex; gap:8px; flex-wrap:wrap; margin:16px 0 }
input { min-width:230px; flex:1; padding:11px 13px; background:#192337; color:#fff; border:1px solid #39465f; border-radius:7px }
button { cursor:pointer; padding:10px 15px; background:#3d72ce; border:0; border-radius:7px; color:#fff; font-weight:600 }
button:hover { background:#5287e0 } button.secondary { background:#324159 } button.inline { padding:5px 8px; background:transparent; color:#90b9ff; text-align:left; overflow-wrap:anywhere } button.inline:hover { text-decoration:underline }
section,details { background:#182234; border:1px solid #32415a; border-radius:9px; padding:17px; margin:16px 0 }
#status { min-height:1.5em; color:#e5bd74 } #matches button { margin:3px; text-align:left }
.grid { display:grid; grid-template-columns:repeat(auto-fit,minmax(210px,1fr)); gap:10px }
.card { padding:12px; border-radius:7px; background:#212f47; overflow-wrap:anywhere } .label { font-size:.82rem; color:#aab9ca; display:block; margin-bottom:5px }
table { width:100%; border-collapse:collapse; font-size:.9rem } .scroll table { min-width:700px } .note { font-size:.85rem; line-height:1.6 } th,td { padding:9px 6px; border-bottom:1px solid #32415a; text-align:left; vertical-align:top }
.scroll { overflow:auto } .result-head { display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap } pre { white-space:pre-wrap; word-break:break-all; max-height:65vh; overflow:auto; font-size:.8rem }
[hidden] { display:none!important }
</style></head><body>
<h1>线上玩家与写入监控</h1><p class="hint">直接读取 Durable Object 已保存的存档，不使用 PvP 镜像；查询不会领取邮件、结算战斗或更新存档。令牌仅留在本页内存，关闭或刷新页面后需重新输入。</p>
<form id="login"><input id="token" type="password" required autocomplete="off" placeholder="管理员查询令牌" aria-label="管理员查询令牌"><button type="submit">进入查询</button></form>
<div id="status" role="status"></div>
<div id="panel" hidden>
<section id="traffic"><div class="result-head"><h2>全站访问与游戏活跃时长</h2><button id="refreshTraffic" class="secondary" type="button">刷新访问统计</button></div><p class="note">PV 为成功加载封面 / 与游戏页 /game 的页面请求次数（含匿名访问，不含图片、API 及管理页）；不是独立访客数。活跃时长按登录玩家在游戏页前台且最近有交互的服务端心跳累计，跨标签按账号去重；离线、后台、长时间闲置及未完成区间不计入。开始统计前的历史数据不可追溯。近 24 小时为当前整点及前 23 个整点小时桶。</p><div id="trafficSummary" class="grid"></div><h3>活跃时长排行榜（累计前 30）</h3><div class="scroll"><table><thead><tr><th>玩家</th><th>累计活跃</th><th>最后心跳（香港时间）</th></tr></thead><tbody id="trafficLeaders"></tbody></table></div></section><section id="overview"><div class="result-head"><h2>账号登录与 D1 写入概览</h2><button id="refreshOverview" class="secondary" type="button">刷新概览</button></div><p class="note">登录人数按账号最近一次登录时间统计；写入数据来自 PvP 镜像 / 防守 / 周榜 / 快照 D1 表（近 24 个整点小时桶），写入字节为估算值。它不代表全站访问量、游戏在线人数或 Durable Object 存档写入。</p><div id="overviewSummary" class="grid"></div><h3>玩家写入排行（前 50，按写入次数）</h3><div class="scroll"><table><thead><tr><th>玩家</th><th>写入次数</th><th>估算字节</th><th>镜像</th><th>防守</th><th>周榜</th><th>快照</th></tr></thead><tbody id="writeLeaders"></tbody></table></div><h3>最近登录（前 20）</h3><div class="scroll"><table><thead><tr><th>玩家</th><th>最近登录（香港时间）</th></tr></thead><tbody id="recentLogins"></tbody></table></div><small id="overviewTime"></small></section>
<form id="search"><input id="query" type="search" maxlength="64" required placeholder="输入玩家昵称或 player_id" aria-label="玩家昵称或 player_id"><button type="submit">搜索</button></form>
<section><strong>匹配账号</strong><div id="matches"></div></section>
<section id="result" hidden><div class="result-head"><h2 id="name"></h2><button id="refresh" class="secondary" type="button">刷新当前存档</button></div><div id="summary" class="grid"></div>
<h3>该玩家的游戏活跃时长</h3><div id="playerTrafficSummary" class="grid"></div><div class="scroll"><table><thead><tr><th>小时（香港时间）</th><th>已确认活跃时长</th></tr></thead><tbody id="playerTrafficHours"></tbody></table></div><h3>该玩家近 24 个小时桶的 D1 写入</h3><p class="note">仅列出有写入的小时；零记录表示未监测到这四类 PvP 表写入，不代表玩家没有登录或游玩。</p><div id="writeSummary" class="grid"></div><div class="scroll"><table><thead><tr><th>小时（香港时间）</th><th>写入次数</th><th>估算字节</th><th>镜像</th><th>防守</th><th>周榜</th><th>快照</th></tr></thead><tbody id="writeHours"></tbody></table></div><h3>系统邮件（投递记录 / 当前存档领取情况）</h3><div class="scroll"><table><thead><tr><th>邮件</th><th>发信时间</th><th>投递</th><th>附件</th></tr></thead><tbody id="mail"></tbody></table></div>
<details><summary>完整存档 JSON（原始持久化记录）</summary><button id="download" class="secondary" type="button">下载 JSON</button><pre id="raw"></pre></details></section>
</div>
<script nonce="__ADMIN_NONCE__">
(() => {
  let token = '', selected = '', lastResult = null;
  const byId = id => document.getElementById(id);
  const status = text => { byId('status').textContent = text; };
  const time = ms => ms ? new Date(ms).toLocaleString('zh-CN', { timeZone: 'Asia/Hong_Kong', hour12: false }) : '—';
  const text = value => value === null || value === undefined ? '—' : String(value);
  const number = value => Number(value || 0).toLocaleString('zh-CN');
  const bytes = value => number(value) + ' B';
  const duration = ms => number(Math.floor(Number(ms || 0) / 1000)) + ' 秒';
  async function api(path, options = {}) {
    const res = await fetch(path, { ...options, cache: 'no-store', headers: { 'authorization': 'Bearer ' + token, ...(options.headers || {}) } });
    if (res.status === 401) { token = ''; byId('panel').hidden = true; byId('login').hidden = false; throw Error('查询令牌有误，请重新输入。'); }
    if (!res.ok) throw Error('查询失败（HTTP ' + res.status + '）');
    return res.json();
  }
  function card(label, value, target = 'summary') { const el = document.createElement('div'); el.className = 'card'; const a = document.createElement('span'); a.className = 'label'; a.textContent = label; el.append(a, document.createTextNode(text(value))); byId(target).append(el); }
  function cell(row, value) { const td = document.createElement('td'); td.textContent = text(value); row.append(td); }
  function playerButton(account) {
    const button = document.createElement('button'); button.className = 'inline'; button.type = 'button';
    button.textContent = account.username || account.player_id;
    button.title = account.player_id;
    button.addEventListener('click', () => openPlayer(account.player_id)); return button;
  }
  async function refreshTraffic() {
    byId('refreshTraffic').disabled = true;
    try {
      const data = await api('/api/admin/traffic');
      byId('trafficSummary').replaceChildren();
      card('全站累计 PV', number(data.pages['/'].total + data.pages['/game'].total), 'trafficSummary');
      card('封面累计 PV', number(data.pages['/'].total), 'trafficSummary');
      card('游戏页累计 PV', number(data.pages['/game'].total), 'trafficSummary');
      card('全站近 24 小时 PV', number(data.pages['/'].recent + data.pages['/game'].recent), 'trafficSummary');
      card('游戏活跃玩家（最近 45 秒心跳）', number(data.currentPlayers), 'trafficSummary');
      card('近 24 小时活跃玩家', number(data.activePlayers24h), 'trafficSummary');
      card('近 24 小时游戏活跃时长', duration(data.activeMs24h), 'trafficSummary');
      byId('trafficLeaders').replaceChildren();
      for (const item of data.leaderboard) {
        const row = document.createElement('tr'), td = document.createElement('td');
        td.append(playerButton(item)); row.append(td);
        cell(row, duration(item.total_ms)); cell(row, time(item.last_seen));
        byId('trafficLeaders').append(row);
      }
      if (!data.leaderboard.length) { const row = document.createElement('tr'); cell(row, '暂无活跃记录'); byId('trafficLeaders').append(row); }
    } catch (err) { status(err.message); } finally { byId('refreshTraffic').disabled = false; }
  }
  async function loadPlayerTraffic(id) {
    const data = await api('/api/admin/traffic/player/' + encodeURIComponent(id));
    byId('playerTrafficSummary').replaceChildren(); byId('playerTrafficHours').replaceChildren();
    card('累计游戏活跃', duration(data.presence && data.presence.total_ms), 'playerTrafficSummary');
    card('最后心跳', data.presence ? time(data.presence.last_seen) : '无记录', 'playerTrafficSummary');
    card('最近 24 小时', duration(data.hours.reduce((sum, hour) => sum + hour.active_ms, 0)), 'playerTrafficSummary');
    for (const hour of data.hours) {
      const row = document.createElement('tr'); cell(row, time(hour.hour_start)); cell(row, duration(hour.active_ms)); byId('playerTrafficHours').append(row);
    }
  }
  async function refreshOverview() {
    byId('refreshOverview').disabled = true;
    try {
      const data = await api('/api/admin/overview');
      byId('overviewSummary').replaceChildren();
      card('账号总数', number(data.accounts.total), 'overviewSummary');
      card('最近 24 小时登录过的账号', number(data.accounts.loggedIn24h), 'overviewSummary');
      card('近 24 小时发生 D1 写入的玩家', number(data.writes.players), 'overviewSummary');
      card('近 24 小时 PvP 表写入次数', number(data.writes.count), 'overviewSummary');
      card('近 24 小时估算写入字节', bytes(data.writes.bytes), 'overviewSummary');
      byId('overviewTime').textContent = '查询时刻：' + time(data.inspectedAt);
      byId('writeLeaders').replaceChildren();
      for (const item of data.leaderboard) {
        const row = document.createElement('tr'), td = document.createElement('td'); td.append(playerButton(item)); row.append(td);
        [number(item.writes_24h), bytes(item.payload_bytes_24h), number(item.mirror_writes_24h), number(item.defense_writes_24h), number(item.weekly_writes_24h), number(item.snapshot_writes_24h)].forEach(value => cell(row, value));
        byId('writeLeaders').append(row);
      }
      if (!data.leaderboard.length) { const row = document.createElement('tr'); cell(row, '该时段无写入记录'); byId('writeLeaders').append(row); }
      byId('recentLogins').replaceChildren();
      for (const item of data.recentLogins) {
        const row = document.createElement('tr'), td = document.createElement('td'); td.append(playerButton(item)); row.append(td);
        cell(row, time(item.last_login_at)); byId('recentLogins').append(row);
      }
      if (!data.recentLogins.length) { const row = document.createElement('tr'); cell(row, '暂无账号'); byId('recentLogins').append(row); }
      status('概览已更新。');
    } catch (err) { status(err.message); }
    finally { byId('refreshOverview').disabled = false; }
  }
  async function loadWrites(id) {
    byId('writeSummary').replaceChildren(); byId('writeHours').replaceChildren();
    const data = await api('/api/admin/writes/' + encodeURIComponent(id));
    if (id !== selected) return;
    const total = data.hours.reduce((sum, item) => sum + item.writes, 0);
    const size = data.hours.reduce((sum, item) => sum + item.bytes, 0);
    card('写入小时数', number(data.hours.length), 'writeSummary');
    card('写入次数', number(total), 'writeSummary'); card('估算字节', bytes(size), 'writeSummary');
    for (const item of data.hours) {
      const row = document.createElement('tr');
      [time(item.hour_start), number(item.writes), bytes(item.bytes), number(item.mirror), number(item.defense), number(item.weekly), number(item.snapshot)].forEach(value => cell(row, value));
      byId('writeHours').append(row);
    }
    if (!data.hours.length) { const row = document.createElement('tr'); cell(row, '该时段无 PvP 表写入记录'); byId('writeHours').append(row); }
  }
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
      await loadWrites(id);
      await loadPlayerTraffic(id);
      status('已读取线上持久化存档及 D1 写入数据，查询不会触发游戏操作。');
    } catch (err) { status(err.message); }
  }
  byId('login').addEventListener('submit', event => { event.preventDefault(); token = byId('token').value.trim(); byId('token').value = ''; byId('login').hidden = true; byId('panel').hidden = false; byId('query').focus(); status('正在读取概览…'); refreshOverview(); refreshTraffic(); });
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
  byId('refreshOverview').addEventListener('click', refreshOverview);
  byId('refreshTraffic').addEventListener('click', refreshTraffic);
  byId('refresh').addEventListener('click', () => { if (selected) openPlayer(selected); });
  byId('download').addEventListener('click', () => { if (!lastResult) return; const blob = new Blob([JSON.stringify(lastResult, null, 2)], { type: 'application/json' }); const href = URL.createObjectURL(blob); const link = document.createElement('a'); link.href = href; link.download = lastResult.account.username + '-' + lastResult.account.player_id + '.json'; link.click(); setTimeout(() => URL.revokeObjectURL(href), 1000); });
})();
</script></body></html>`;
