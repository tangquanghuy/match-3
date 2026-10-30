// Export one Kiro session into readable handoff records:
//   user-dialogue.md  every user message verbatim (numbered from --start), screenshots inline
//   transcript.md     user messages and the assistant's visible replies in order
//                     (reasoning, tool calls and tool output left out)
//   user-turns.json   machine-readable user messages with timestamps and SHA-256
// Screenshots go to docs/handoff/attachments/<sha256 prefix>.<ext> (shared with earlier exports).
//
//   node scripts/handoff-export-session.cjs <messages.jsonl> <outDir> --start 96 --label "2026-10-28 接手会话" --session sess_xxx
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const args = process.argv.slice(2);
const [input, outDir] = args;
const opt = name => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : undefined; };
const start = Number(opt('--start') ?? 1);
const label = opt('--label') ?? path.basename(path.dirname(input));
const session = opt('--session') ?? path.basename(path.dirname(input));
const attachDir = path.resolve(outDir, '..', 'attachments');
fs.mkdirSync(outDir, { recursive: true }); fs.mkdirSync(attachDir, { recursive: true });

const sha = data => crypto.createHash('sha256').update(data).digest('hex');
const utc8 = iso => new Date(new Date(iso).getTime() + 8 * 3600e3).toISOString().replace('T', ' ').slice(0, 19);
/** Environment blocks are injected by the IDE, not typed by the user. */
const typed = text => String(text).replace(/\n*<EnvironmentContext>[\s\S]*?<\/EnvironmentContext>\s*/g, '\n').trim();
const fence = text => { let f = '````'; while (text.includes(f)) f += '`'; return `${f}text\n${text}\n${f}`; };

const records = fs.readFileSync(input, 'utf8').split('\n').filter(Boolean).map(line => JSON.parse(line));
const turns = []; const transcript = [];
for (const record of records) {
  const p = record.payload;
  if (p.type === 'user') {
    const id = `U${String(start + turns.length).padStart(3, '0')}`;
    const attachments = (p.images ?? []).map(image => {
      const data = Buffer.from(image.data ?? image.base64 ?? '', 'base64');
      const ext = /jpe?g/.test(image.mediaType ?? image.mimeType ?? '') ? 'jpg' : /webp/.test(image.mediaType ?? image.mimeType ?? '') ? 'webp' : 'png';
      const hash = sha(data); const file = `${hash.slice(0, 16)}.${ext}`;
      if (!fs.existsSync(path.join(attachDir, file))) fs.writeFileSync(path.join(attachDir, file), data);
      return { file: `attachments/${file}`, sha256: hash, bytes: data.length };
    });
    const turn = { turn: id, id: record.id, timestamp_utc: record.timestamp, timestamp_utc8: utc8(record.timestamp),
      text: p.content, typed_text: typed(p.content), text_sha256: sha(String(p.content)), attachments };
    turns.push(turn); transcript.push({ kind: 'user', turn });
  } else if (p.type === 'assistant' && (p.operationType === 'Say' || p.operationType === 'Summary')) {
    if (String(p.content).trim()) transcript.push({ kind: p.operationType === 'Summary' ? 'summary' : 'assistant', at: record.timestamp, text: String(p.content).trim() });
  }
}
// Duplicate submissions keep their own entry; mark exact repeats of the previous user message.
turns.forEach((t, i) => { const prev = turns[i - 1]; if (prev && prev.typed_text === t.typed_text) t.repeat_of = prev.turn; });

const first = turns[0], last = turns[turns.length - 1];
const head = `来源：Kiro 会话 \`${session}\`（${label}），${first.timestamp_utc8} 至 ${last.timestamp_utc8}（UTC+8）。`;
const shot = (t, a, i) => `![${t.turn} 用户截图 ${i + 1}](../${a.file})`;

const dialogue = [`# 用户逐轮原话：${label}`, '',
  `${head}共 **${turns.length} 条用户消息、${turns.reduce((n, t) => n + t.attachments.length, 0)} 张截图**，编号接续上一份归档（[U001–U${String(start - 1).padStart(3, '0')}](../user-dialogue.md)）。`,
  '正文为用户原句；IDE 自动附加的 `<EnvironmentContext>` 块已去掉（原文保留在 [user-turns.json](user-turns.json)）。重复提交各占一条，并标注“同上”。助手回答见 [会话记录](transcript.md)。', '',
  '## 发言索引', '', '| 编号 | 时间（UTC+8） | 开头 |', '| --- | --- | --- |',
  ...turns.map(t => `| [${t.turn}](#${t.turn.toLowerCase()}) | ${t.timestamp_utc8} | ${t.typed_text.replace(/\s+/g, ' ').slice(0, 40).replace(/\|/g, '\\|')}${t.repeat_of ? `（同 ${t.repeat_of}）` : ''} |`), ''];
for (const t of turns) {
  dialogue.push(`<a id="${t.turn.toLowerCase()}"></a>`, `## ${t.turn} · ${t.timestamp_utc8}（UTC+8）`, '', `消息 ID：\`${t.id}\`${t.repeat_of ? `；与 ${t.repeat_of} 内容相同（重复提交）` : ''}。`, '', fence(t.typed_text), '');
  t.attachments.forEach((a, i) => dialogue.push(shot(t, a, i), ''));
}
fs.writeFileSync(path.join(outDir, 'user-dialogue.md'), dialogue.join('\n'));

const lines = [`# 会话记录：${label}`, '', `${head}按时间顺序收录用户消息和助手对用户可见的回复。助手的推理过程、工具调用和工具输出未收录；“会话压缩摘要”是上下文过长时自动生成的阶段总结，保留原样。`, '', '用户原话的精确文本以 [user-dialogue.md](user-dialogue.md) 和 [user-turns.json](user-turns.json) 为准。', ''];
for (const item of transcript) {
  if (item.kind === 'user') {
    const t = item.turn;
    lines.push('---', '', `### ${t.turn} 用户 · ${t.timestamp_utc8}`, '', ...t.typed_text.split('\n').map(l => `> ${l}`), '');
    t.attachments.forEach((a, i) => lines.push(shot(t, a, i), ''));
  } else if (item.kind === 'summary') lines.push(`#### 会话压缩摘要 · ${utc8(item.at)}`, '', '<details><summary>展开</summary>', '', item.text, '', '</details>', '');
  else lines.push(`#### 助手 · ${utc8(item.at)}`, '', item.text, '');
}
fs.writeFileSync(path.join(outDir, 'transcript.md'), lines.join('\n'));
fs.writeFileSync(path.join(outDir, 'user-turns.json'), JSON.stringify({ scope: label, source: session, turns }, null, 2));
console.log(JSON.stringify({ users: turns.length, attachments: turns.reduce((n, t) => n + t.attachments.length, 0), assistantReplies: transcript.filter(i => i.kind === 'assistant').length, summaries: transcript.filter(i => i.kind === 'summary').length, range: [first.turn, last.turn] }));
