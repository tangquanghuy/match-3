/**
 * 放映厅画廊生成（窗口 G）。
 *
 * 读 artifacts/theater/{skills,traits,enemies}/ 下的 meta json + 截图，产出静态页：
 *   index.html       总览 + 待修摘要
 *   skills.html      技能卡（官方描述原文 / 对账摘要 / 施放中+结算后截图）
 *   traits.html      特质卡（描述 / 刺激分段事件时间线 / 截图）
 *   enemies.html     敌人图鉴（tier×种族编配位：技能/特质清单 + 截图）
 *   repair-list.html 待修清单（聚合 可疑/失败/视觉未过，交给内容窗口 E 消化）
 * 全部相对路径，file:// 直接打开；已存在的 review.json（visual_review 产物）会并入卡片角标。
 */
import { readdir, readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';

let OUT_GALLERY = '';

export async function buildGalleries(outDir, index) {
  OUT_GALLERY = outDir;
  const review = await loadReview(outDir);
  const skills = await loadMetas(path.join(outDir, 'skills'));
  const traits = await loadMetas(path.join(outDir, 'traits'));
  const enemies = await loadMetas(path.join(outDir, 'enemies'));
  const smoke = await loadSmoke(outDir);

  await writeFile(path.join(outDir, 'skills.html'), skillsPage(skills, review), 'utf8');
  await writeFile(path.join(outDir, 'traits.html'), traitsPage(traits, review), 'utf8');
  await writeFile(path.join(outDir, 'enemies.html'), enemiesPage(enemies, review), 'utf8');
  await writeFile(path.join(outDir, 'repair-list.html'), repairPage(skills, traits, enemies, review, smoke), 'utf8');
  await writeFile(path.join(outDir, 'index.html'), indexPage(skills, traits, enemies, review, smoke), 'utf8');
  await writeFile(path.join(outDir, '待修清单.md'), repairMarkdown(skills, traits, enemies, review, smoke), 'utf8');

  return {
    skills: skills.length, traits: traits.length, enemies: enemies.length,
    reviewed: review ? Object.keys(review.items || {}).length : 0,
  };
}

async function loadSmoke(outDir) {
  const file = path.join(outDir, 'smoke', 'report.json');
  if (!existsSync(file)) return null;
  try {
    return JSON.parse(await readFile(file, 'utf8'));
  } catch { return null; }
}

async function loadReview(outDir) {
  const file = path.join(outDir, 'review.json');
  if (!existsSync(file)) return null;
  try {
    const data = JSON.parse(await readFile(file, 'utf8'));
    const items = {};
    for (const it of data.results || []) items[it.file] = it;
    return { ...data, items };
  } catch (e) {
    console.warn('[gallery] review.json 解析失败：', e.message);
    return null;
  }
}

async function loadMetas(dir) {
  if (!existsSync(dir)) return [];
  const files = (await readdir(dir)).filter((f) => f.endsWith('.json'));
  const metas = [];
  for (const f of files) {
    try {
      metas.push(JSON.parse(await readFile(path.join(dir, f), 'utf8')));
    } catch { /* 跳过坏文件 */ }
  }
  const order = (m) => (m.id !== undefined ? Number(m.id) : 0);
  return metas.sort((a, b) => (a.key || '').localeCompare(b.key || '') || order(a) - order(b));
}

// —— 审查结论（截图 → review.json 条目按相对路径匹配） ——

function reviewVerdict(review, relFiles) {
  if (!review) return null;
  for (const f of relFiles) {
    const hit = review.items[f] || review.items[`artifacts/theater/${f}`];
    if (hit) return hit;
  }
  return null;
}

function reviewChip(hit) {
  if (!hit) return '';
  const cls = hit.pass ? 'chip pass' : 'chip fail';
  const text = hit.pass ? '视觉✓' : `视觉✗ ${escapeHtml((hit.issues || []).join('；').slice(0, 80))}`;
  return `<span class="${cls}" title="review model=${escapeHtml(hit.model || '')}">${text}</span>`;
}

// —— HTML 骨架 ——

const CSS = `
:root { color-scheme: dark; }
* { box-sizing: border-box; }
body { margin: 0; background: #0e0e16; color: #e8dcc0; font: 14px/1.55 "Segoe UI","PingFang SC",sans-serif; }
a { color: #7fd4e8; text-decoration: none; }
a:hover { text-decoration: underline; }
header { padding: 18px 24px 10px; border-bottom: 1px solid #2a2436; }
header h1 { margin: 0 0 6px; font-size: 20px; color: #f6efe0; }
nav { display: flex; gap: 14px; font-size: 13px; }
main { padding: 16px 24px 48px; }
.stats { display: flex; gap: 18px; flex-wrap: wrap; margin: 8px 0 2px; font-size: 13px; color: #b9ab84; }
.stats b { color: #f0e2bf; }
.filters { position: sticky; top: 0; z-index: 5; display: flex; gap: 8px; padding: 10px 0;
  background: linear-gradient(#0e0e16 75%, transparent); }
.filters input { flex: 0 1 260px; padding: 6px 10px; border-radius: 6px; border: 1px solid #4a4030;
  background: #171208; color: #f0e2bf; }
.filters button { padding: 6px 12px; border-radius: 6px; border: 1px solid #4a4030; background: #171208;
  color: #d9c79a; cursor: pointer; font-size: 12px; }
.filters button.on { border-color: #e4bc68; background: #49351a; color: #fff1c7; }
.grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(430px, 1fr)); gap: 14px; }
.card { border: 1px solid #34302c; border-radius: 10px; background: #14111c; padding: 12px 14px; }
.card.suspicious { border-color: #a33; }
.card.failed { border-color: #c33; background: #1d1013; }
.card h3 { margin: 0 0 4px; font-size: 15px; color: #f6efe0; }
.card .desc { color: #c9bd9c; font-size: 12.5px; margin: 4px 0 8px; }
.card .meta { color: #8f826b; font-size: 11.5px; }
.badges { display: flex; flex-wrap: wrap; gap: 5px; margin: 6px 0; }
.chip { padding: 2px 8px; border-radius: 99px; font-size: 11px; border: 1px solid #4a4030; background: #171208; }
.chip.ok { color: #9fd48a; border-color: #3d5a33; }
.chip.warn { color: #e8c15a; border-color: #7a6224; }
.chip.fail { color: #ef8f8f; border-color: #7a2f2f; }
.chip.info { color: #9db8d8; border-color: #3a4a63; }
.imgs { display: flex; gap: 8px; margin-top: 8px; flex-wrap: wrap; }
.imgs img { width: 100%; max-width: 100%; border-radius: 6px; border: 1px solid #2a2436; cursor: zoom-in; }
.imgs > div { flex: 1 1 45%; min-width: 180px; }
.imgs figcaption { font-size: 10.5px; color: #8f826b; padding: 2px 2px 4px; }
.timeline { margin: 6px 0 0; padding: 0; list-style: none; font-family: Consolas, monospace; font-size: 11px; }
.timeline li { padding: 3px 0; border-top: 1px dashed #262130; }
.timeline .seg { color: #e4bc68; }
.evcount { color: #8f826b; }
.err { color: #ef8f8f; font-size: 12px; margin: 4px 0; }
table.codex { width: 100%; border-collapse: collapse; font-size: 12.5px; }
table.codex th, table.codex td { border: 1px solid #2a2436; padding: 6px 8px; text-align: left; vertical-align: top; }
table.codex th { background: #171022; color: #c9a35c; }
tr.failed td { background: #1d1013; }
.small { font-size: 11px; color: #8f826b; }
`;

const SCRIPT = `
function filterCards(mode, btn) {
  document.querySelectorAll('.filters button').forEach(b => b.classList.toggle('on', b === btn));
  const q = (document.getElementById('q')?.value || '').toLowerCase();
  for (const card of document.querySelectorAll('.card, tr[data-flag]')) {
    const flag = card.dataset.flag || 'ok';
    const text = card.textContent.toLowerCase();
    const showByMode = mode === 'all' || flag === mode;
    const showByText = !q || text.includes(q);
    card.style.display = showByMode && showByText ? '' : 'none';
  }
}
function wireSearch() {
  document.getElementById('q')?.addEventListener('input', () => {
    const on = document.querySelector('.filters button.on') || document.querySelector('.filters button');
    on?.click();
  });
  document.addEventListener('click', (e) => {
    if (e.target.tagName === 'IMG' && e.target.closest('.imgs')) window.open(e.target.src, '_blank');
  });
}
wireSearch();
`;

function pageShell(title, nav, body, statsHtml = '') {
  return `<!DOCTYPE html>
<html lang="zh-CN"><head><meta charset="utf-8"><title>${escapeHtml(title)} · 放映厅</title>
<style>${CSS}</style></head><body>
<header><h1>🎬 ${escapeHtml(title)}</h1><nav>${nav}</nav><div class="stats">${statsHtml}</div></header>
<main>${body}</main>
<script>${SCRIPT}</script>
</body></html>`;
}

const NAV = (cur) => [
  ['index.html', '总览'],
  ['skills.html', '技能'],
  ['traits.html', '特质'],
  ['enemies.html', '敌人图鉴'],
  ['repair-list.html', '待修清单'],
].map(([href, label]) => `<a href="${href}"${href === cur ? ' style="color:#f0e2bf;font-weight:700"' : ''}>${label}</a>`).join('');

function statsOf(items, reviewedCount) {
  const ok = items.filter((m) => m.status === 'ok' && !m.audit?.suspicious).length;
  const susp = items.filter((m) => m.status === 'ok' && m.audit?.suspicious).length;
  const failed = items.filter((m) => m.status !== 'ok').length;
  return `共 <b>${items.length}</b> · 正常 <b>${ok}</b> · 可疑 <b style="color:#e8c15a">${susp}</b> · 失败 <b style="color:#ef8f8f">${failed}</b>` +
    (reviewedCount ? ` · 已视觉审查 <b>${reviewedCount}</b>` : '') +
    ` · 生成于 ${new Date().toLocaleString('zh-CN')}`;
}

function filterBar() {
  return `<div class="filters">
    <input id="q" placeholder="按 id / 名称 / 描述过滤…">
    <button class="on" onclick="filterCards('all', this)">全部</button>
    <button onclick="filterCards('suspicious', this)">可疑</button>
    <button onclick="filterCards('failed', this)">失败</button>
  </div>`;
}

// —— 技能页 ——

function skillsPage(skills, review) {
  const cards = skills.map((m) => {
    const rel = [`skills/${m.id}.mid.jpg`, `skills/${m.id}.end.jpg`];
    const hit = reviewVerdict(review, rel);
    const flag = m.status !== 'ok' ? 'failed' : (m.audit?.suspicious ? 'suspicious' : 'ok');
    const auditChips = (m.audit?.checks || []).map((c) =>
      `<span class="chip ${c.ok ? 'ok' : (c.info ? 'info' : 'fail')}">${escapeHtml(c.label)} ${escapeHtml(c.got)}</span>`).join('');
    return `<div class="card ${flag}" data-flag="${flag}" id="skill-${m.id}">
      <h3>#${m.id} ${escapeHtml(m.name)} <span class="small">${escapeHtml(m.troopName || '')} · ${escapeHtml(m.kingdom || '')}${m.rarity ? ' · ' + escapeHtml(m.rarity) : ''}</span></h3>
      <div class="desc">${escapeHtml(m.desc || '（无描述）')}</div>
      <div class="badges">${auditChips}${reviewChip(hit)}</div>
      ${m.error ? `<div class="err">✗ ${escapeHtml(m.error)}</div>` : ''}
      <div class="meta">${escapeHtml(m.audit?.summary || '')} · ${m.durationMs}ms</div>
      <div class="imgs">
        ${rel.filter((f) => existsSync(path.join(OUT_GALLERY, f))).map((f, i) =>
          `<figure><figcaption>${i === 0 ? '施放中' : '结算后'}</figcaption><img loading="lazy" src="${f}"></figure>`).join('')}
      </div>
    </div>`;
  }).join('\n');
  const reviewed = review ? skills.filter((m) => reviewVerdict(review, [`skills/${m.id}.mid.jpg`, `skills/${m.id}.end.jpg`])).length : 0;
  return pageShell('技能放映厅', NAV('skills.html'), filterBar() + `<div class="grid">${cards}</div>`, statsOf(skills, reviewed));
}

// —— 特质页 ——

function traitsPage(traits, review) {
  const cards = traits.map((m) => {
    const rel = m.shots.map((s) => `traits/${s}.jpg`);
    const hit = reviewVerdict(review, rel);
    const flag = m.status !== 'ok' ? 'failed' : (m.audit?.suspicious ? 'suspicious' : 'ok');
    const segs = (m.segments || []).map((s) => {
      const counts = countBy(s.events);
      const brief = Object.entries(counts).map(([k, n]) => `${k}×${n}`).join(' ');
      return `<li><span class="seg">${escapeHtml(s.label)}</span> <span class="evcount">${brief || '—'}${s.note ? ' · ' + escapeHtml(s.note) : ''}</span></li>`;
    }).join('');
    const kindChip = m.audit ? `<span class="chip info">${m.audit.kind === 'passive' ? '数值被动' : (m.audit.kind === 'reactive' ? '触发式' : '未归类')}</span>` : '';
    return `<div class="card ${flag}" data-flag="${flag}" id="trait-${escapeHtml(m.code)}">
      <h3>${escapeHtml(m.code)} · ${escapeHtml(m.name)} <span class="small">${escapeHtml(m.race)}</span></h3>
      <div class="desc">${escapeHtml(m.desc || '')}</div>
      <div class="badges">${kindChip}${m.audit && m.audit.suspicious ? '<span class="chip fail">有触发描述但全程零事件</span>' : ''}${reviewChip(hit)}</div>
      ${m.error ? `<div class="err">✗ ${escapeHtml(m.error)}</div>` : ''}
      <div class="meta">触发事件 ${m.audit?.eventTotal ?? 0} 组 · ${m.durationMs}ms</div>
      <ul class="timeline">${segs}</ul>
      <div class="imgs">
        ${rel.filter((f) => existsSync(path.join(OUT_GALLERY, f))).map((f) =>
          `<figure><figcaption>${escapeHtml(f.split('/').pop())}</figcaption><img loading="lazy" src="${f}"></figure>`).join('')}
      </div>
    </div>`;
  }).join('\n');
  const reviewed = review ? traits.filter((m) => reviewVerdict(review, m.shots.map((s) => `traits/${s}.jpg`))).length : 0;
  return pageShell('特质放映厅', NAV('traits.html'), filterBar() + `<div class="grid">${cards}</div>`, statsOf(traits, reviewed));
}

// —— 敌人图鉴 ——

function enemiesPage(enemies, review) {
  const rows = enemies.map((m) => {
    const flag = m.status !== 'ok' ? 'failed' : 'ok';
    const enemyCells = (m.enemy || []).map((e) => {
      const skill = e.skillId && indexSpellName(e) ;
      return `<div><b>${escapeHtml(e.name)}</b> <span class="small">HP${e.hp} 攻${e.attack} 甲${e.armor} 魔${e.magic}</span><br>
        技能：${escapeHtml(skill)}<br>
        特质：${e.traitNames.length ? e.traitNames.map((t) => `<span class="chip ok">${escapeHtml(t)}</span>`).join('') : '<span class="small">无</span>'}</div>`;
    }).join('');
    const rel = m.shots.map((s) => `enemies/${m.key}.${s}.jpg`);
    const hit = reviewVerdict(review, rel);
    return `<tr data-flag="${flag}" id="${escapeHtml(m.key)}">
      <td>${escapeHtml(m.tier)}<br><span class="small">${escapeHtml(m.race)}</span></td>
      <td>${enemyCells}</td>
      <td>${m.caster ? `<span class="small">施放技能 ${escapeHtml(String(m.caster.skillId))}</span>` : ''}${m.castError ? `<div class="err">${escapeHtml(m.castError)}</div>` : ''}
        <div class="evcount">${Object.entries(countBy(m.events)).map(([k, n]) => `${k}×${n}`).join(' ') || '—'}</div>
        ${m.error ? `<div class="err">✗ ${escapeHtml(m.error)}</div>` : ''}${reviewChip(hit)}</td>
      <td style="min-width:220px">${rel.filter((f) => existsSync(path.join(OUT_GALLERY, f))).map((f) =>
        `<img loading="lazy" src="${f}" style="width:100%;border-radius:6px;margin-bottom:4px">`).join('')}</td>
    </tr>`;
  }).join('\n');
  const reviewed = review ? enemies.filter((m) => reviewVerdict(review, m.shots.map((s) => `enemies/${m.key}.${s}.jpg`))).length : 0;
  const body = `<table class="codex">
    <tr><th>阶级 × 种族</th><th>编配结果（分拣引擎自动）</th><th>放映摘要</th><th>截图</th></tr>
    ${rows}</table>`;
  return pageShell('敌人图鉴 · 分拣编配', NAV('enemies.html'), body, statsOf(enemies, reviewed));
}

function indexSpellName(e) {
  return e.skillName || `#${e.skillId}`;
}

// —— 待修清单 ——

/** 烟雾异常（game-over≠1 / 未终局 / 崩溃）→ 待修条目 */
function smokeItems(smoke) {
  if (!smoke || !smoke.failures) return [];
  const items = [];
  const seeds = (pred) => (smoke.failures || []).filter(pred).map((r) => r.seed);
  const multi = seeds((r) => /game-over 事件数/.test(r.error || ''));
  const unb = seeds((r) => /unbounded/.test(r.error || ''));
  const crash = seeds((r) => !/unbounded|game-over 事件数/.test(r.error || ''));
  if (multi.length) {
    items.push(['引擎', '（引擎窗口/E 消化）',
      `一场对局出现 2 条 game-over 事件（${multi.length} 场，seed 例：${multi.slice(0, 8).join(', ')}${multi.length > 8 ? '…' : ''}）`,
      '疑因：死亡召唤特质在终局判定之后结算（事件流尾部 defeat → game-over → game-over → summon）。复现：node scripts/enemy_smoke.mjs --games 50 后查 smoke/failures.txt']);
  }
  if (crash.length) {
    items.push(['引擎', '（引擎窗口/E 消化）', `烟雾崩溃 ${crash.length} 场（seed：${crash.slice(0, 8).join(', ')}）`,
      '详见 artifacts/theater/smoke/failures.txt']);
  }
  if (unb.length) {
    items.push(['平衡', '（信息项，非缺陷）', `${unb.length} 场 ${smoke.summary?.actionsCap ?? 300} 行动内未终局（seed：${unb.slice(0, 8).join(', ')}）`,
      '随机特质汤下双方过坦/回复过高；上限护栏正常工作']);
  }
  return items;
}

function repairPage(skills, traits, enemies, review, smoke) {
  const items = [];
  for (const m of skills) {
    if (m.status !== 'ok') items.push(['技能', `skills.html#skill-${m.id}`, `#${m.id} ${m.name}`, m.error || '施放失败']);
    else if (m.audit?.suspicious) items.push(['技能', `skills.html#skill-${m.id}`, `#${m.id} ${m.name}`, `对账不符：${(m.audit.failLabels || []).join('、')}`]);
  }
  for (const m of traits) {
    if (m.status !== 'ok') items.push(['特质', `traits.html#trait-${m.code}`, `${m.code} ${m.name}`, m.error || '放映失败']);
    else if (m.audit?.suspicious) items.push(['特质', `traits.html#trait-${m.code}`, `${m.code} ${m.name}`, '有触发式描述但标准化刺激下全程零事件']);
  }
  for (const m of enemies) {
    if (m.status !== 'ok') items.push(['敌人', `enemies.html#${m.key}`, `${m.tier}-${m.race}`, m.error || '放映失败']);
    else if (m.castError) items.push(['敌人', `enemies.html#${m.key}`, `${m.tier}-${m.race}`, `编配技能施放异常：${m.castError}`]);
  }
  if (review) {
    for (const [file, hit] of Object.entries(review.items || {})) {
      if (!hit.pass) {
        const [dir, base] = [path.dirname(file), path.basename(file, path.extname(file))];
        const anchor = dir.includes('skills') ? `skills.html#skill-${base.replace(/\..*/, '')}`
          : dir.includes('traits') ? `traits.html#trait-${base.replace(/\.\d-/, '')}`
          : dir.includes('enemies') ? `enemies.html#${base.replace(/\.\d-.*/, '')}` : 'index.html';
        items.push(['视觉', anchor, base, (hit.issues || []).join('；')]);
      }
    }
  }
  items.push(...smokeItems(smoke));

  const body = items.length === 0
    ? '<p>✅ 当前没有待修项。</p>'
    : `<p class="small">验收回流（TASK-MASTER-PLAN 防撞规则 6）：本清单由窗口 G 产出，供内容/引擎窗口消化；G 不自行修内容。</p>
       <table class="codex"><tr><th>域</th><th>对象</th><th>问题</th></tr>
       ${items.map(([domain, href, obj, why]) =>
         `<tr data-flag="suspicious"><td>${domain}</td><td><a href="${href}">${escapeHtml(obj)}</a></td><td>${escapeHtml(why)}</td></tr>`).join('')}
       </table>`;
  return pageShell('待修清单', NAV('repair-list.html'), body, `共 <b>${items.length}</b> 项 · 生成于 ${new Date().toLocaleString('zh-CN')}`);
}

/** 给 E 的纯文本回流版（artifacts/theater/待修清单.md） */
function repairMarkdown(skills, traits, enemies, review, smoke) {
  const lines = [];
  lines.push('# 放映厅待修清单（窗口 G → E / 引擎窗口）', '');
  lines.push(`> 生成于 ${new Date().toLocaleString('zh-CN')}。明细与截图见同目录 index.html / repair-list.html。`, '');
  const push = (domain, obj, why) => lines.push(`- **[${domain}]** ${obj} — ${why}`);

  for (const m of skills) {
    if (m.status !== 'ok') push('技能', `#${m.id} ${m.name}`, m.error || '施放失败');
    else if (m.audit?.suspicious) push('技能', `#${m.id} ${m.name}`, `对账不符：${(m.audit.failLabels || []).join('、')}`);
  }
  for (const m of traits) {
    if (m.status !== 'ok') push('特质', `${m.code} ${m.name}`, m.error || '放映失败');
    else if (m.audit?.suspicious) push('特质', `${m.code} ${m.name}`, '有触发式描述但标准化刺激下全程零事件');
  }
  for (const m of enemies) {
    if (m.status !== 'ok') push('敌人', `${m.tier}-${m.race}`, m.error || '放映失败');
    else if (m.castError) push('敌人', `${m.tier}-${m.race}`, `编配技能施放异常：${m.castError}`);
  }
  if (review) {
    for (const [file, hit] of Object.entries(review.items || {})) {
      if (!hit.pass) push('视觉', file, (hit.issues || []).join('；'));
    }
  }
  for (const [domain, obj, why, note] of smokeItems(smoke)) {
    push(domain, obj, note ? `${why}。${note}` : why);
  }
  if (lines.length === 4) lines.push('（当前没有待修项）');
  return lines.join('\n') + '\n';
}

// —— 总览 ——

function indexPage(skills, traits, enemies, review, smoke) {
  const smokeCard = smoke ? `
    <div class="card"><h3><a href="repair-list.html">千场烟雾</a></h3>
      <div class="desc">纯引擎随机编队对局（scripts/enemy_smoke.mjs）。</div>
      <div class="meta">${smoke.summary ? `完成 <b>${smoke.summary.finished}</b> · 崩溃 <b style="color:#ef8f8f">${smoke.summary.crash}</b> · game-over 异常 <b style="color:#e8c15a">${smoke.summary.multiGameOver}</b> · 未终局 <b>${smoke.summary.unbounded}</b>` : ''}</div></div>` : '';
  const body = `
  <div class="grid" style="grid-template-columns:repeat(auto-fill,minmax(300px,1fr))">
    <div class="card"><h3><a href="skills.html">技能放映厅</a></h3>
      <div class="desc">遍历技能库（registry 实时读取）：装配 → 充能 → 施放 → 描述对账。</div>
      <div class="meta">${statsOf(skills, 0)}</div></div>
    <div class="card"><h3><a href="traits.html">特质放映厅</a></h3>
      <div class="desc">traits.json 已实现 code × 标准化刺激（回合/六色三连/五连/骷髅连/受击/自施法）。</div>
      <div class="meta">${statsOf(traits, 0)}</div></div>
    <div class="card"><h3><a href="enemies.html">敌人图鉴</a></h3>
      <div class="desc">tier×种族分拣编配 + 敌方 AI 施放，供内容对照补缺。</div>
      <div class="meta">${statsOf(enemies, 0)}</div></div>
    <div class="card"><h3><a href="repair-list.html">待修清单</a></h3>
      <div class="desc">可疑对账 / 失败放映 / 视觉审查未过 / 烟雾异常的聚合，回流给内容与引擎窗口。</div></div>
    ${smokeCard}
  </div>
  <p class="small" style="margin-top:16px">运行方式见 scripts/skill_theater.mjs 头注；支持 --only / --offset/--limit 断点续跑。
  视觉审查：<code>node scripts/visual_review.mjs</code>（需 API key，缺失时降级跳过；prompt 见 prompts/visual-review-v1.md）。</p>`;
  return pageShell('放映厅总览', NAV('index.html'), body,
    `技能 <b>${skills.length}</b> · 特质 <b>${traits.length}</b> · 敌人编配 <b>${enemies.length}</b>` +
    (review ? ` · 视觉审查 <b>${Object.keys(review.items || {}).length}</b> 条` : ' · 视觉审查未运行'));
}

function countBy(events) {
  const out = {};
  for (const ev of events || []) out[ev.type] = (out[ev.type] || 0) + 1;
  return out;
}

function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}
