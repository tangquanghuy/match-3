import http from 'node:http'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const port = Number(process.argv[2] || 4179)
const htmlPath = path.join(__dirname, 'index.html')
const imageRe = /\.(png|jpe?g|webp)$/i

let templateDir = ''
let sortDir = ''
let rev = 0
let picking = null
let picks = {}
let history = []

function httpError(status, message) {
  const err = new Error(message)
  err.status = status
  return err
}

function statePath() {
  return sortDir ? path.join(sortDir, '.pick-state.json') : ''
}

function loadState() {
  picks = {}
  history = []
  const file = statePath()
  if (!file || !fs.existsSync(file)) return
  try {
    const data = JSON.parse(fs.readFileSync(file, 'utf8'))
    if (data.template && templateDir && path.resolve(data.template) !== path.resolve(templateDir)) return
    picks = data.picks && typeof data.picks === 'object' ? data.picks : {}
    history = Array.isArray(data.history) ? data.history.slice(-100) : []
  } catch {
    picks = {}
    history = []
  }
}

function saveState() {
  const file = statePath()
  if (!file) return
  const payload = {
    template: templateDir,
    picks,
    history: history.slice(-100),
  }
  fs.writeFileSync(file, JSON.stringify(payload, null, 2))
}

function setDirectory(which, dir) {
  const resolved = path.resolve(String(dir || ''))
  let stat
  try {
    stat = fs.statSync(resolved)
  } catch {
    throw httpError(400, '找不到这个文件夹')
  }
  if (!stat.isDirectory()) throw httpError(400, '这不是文件夹')
  if (which === 'template') templateDir = resolved
  else if (which === 'sort') sortDir = resolved
  else throw httpError(400, '未知的文件夹')
  rev += 1
  if (which === 'sort' || which === 'template') loadState()
  prunePicks()
  return snapshot()
}

function listImages(dir) {
  if (!dir) return []
  return fs.readdirSync(dir).filter((name) => imageRe.test(name) && !name.startsWith('.')).sort((a, b) => a.localeCompare(b, 'zh-CN'))
}

function templateSlots() {
  const slots = []
  for (const name of listImages(templateDir)) {
    const matched = name.match(/^(.*?)(\d+)\.[^.]+$/)
    if (!matched?.[1]) continue
    slots.push({ slot: `${matched[1]}${Number(matched[2])}`, cat: matched[1], n: Number(matched[2]) })
  }
  return slots.sort((a, b) => a.cat.localeCompare(b.cat, 'zh-CN') || a.n - b.n)
}

function categoriesByLength(slots) {
  return [...new Set(slots.map((item) => item.cat))].sort((a, b) => b.length - a.length)
}

function classify(filename, cats) {
  for (const cat of cats) {
    if (!filename.startsWith(cat)) continue
    const rest = filename.slice(cat.length)
    if (rest.startsWith('_') || /^\d+_/.test(rest)) return cat
  }
  return null
}

function placement(slots) {
  const cats = categoriesByLength(slots)
  const pools = new Map()
  const loose = []
  for (const name of listImages(sortDir)) {
    const cat = classify(name, cats)
    if (!cat) {
      loose.push(name)
      continue
    }
    const list = pools.get(cat) || []
    list.push(name)
    pools.set(cat, list)
  }
  return { pools, loose }
}

function slotFiles(slot, placed) {
  return placed.pools.get(slot.cat) || []
}

function takenSlots() {
  const taken = new Map()
  for (const [slot, list] of Object.entries(picks)) {
    if (!Array.isArray(list)) continue
    for (const name of list) taken.set(name, slot)
  }
  return taken
}

function prunePicks() {
  const slots = templateSlots()
  const files = new Set(listImages(sortDir))
  const placed = placement(slots)
  const next = {}
  const used = new Set()
  for (const slot of slots) {
    const list = Array.isArray(picks[slot.slot]) ? picks[slot.slot] : []
    const keep = list.filter((name) => files.has(name) && !used.has(name) && slotFiles(slot, placed).includes(name))
    if (keep[0]) {
      next[slot.slot] = [keep[0]]
      used.add(keep[0])
    }
  }
  picks = next
  history = history.filter((item) => item && files.has(item.name))
}

function groups() {
  const slots = templateSlots()
  const placed = placement(slots)
  const taken = takenSlots()
  const rows = slots.map((slot) => {
    const chosen = picks[slot.slot] || []
    return {
      name: slot.slot,
      cat: slot.cat,
      need: 1,
      files: slotFiles(slot, placed).map((name) => {
        const owner = taken.get(name) || ''
        return {
          name,
          order: owner === slot.slot ? 1 : 0,
          usedBy: owner && owner !== slot.slot ? owner : '',
        }
      }),
    }
  })
  if (placed.loose.length) {
    rows.push({
      name: '未归类',
      cat: '',
      need: 0,
      files: placed.loose.map((name) => ({ name, order: 0 })),
    })
  }
  return rows
}

function snapshot() {
  const rows = sortDir || templateDir ? groups() : []
  const required = rows.filter((row) => row.need > 0)
  const ready = required.filter((row) => row.files.filter((file) => file.order > 0).length === row.need).length
  const picked = required.reduce((sum, row) => sum + row.files.filter((file) => file.order > 0).length, 0)
  const need = required.reduce((sum, row) => sum + row.need, 0)
  return {
    rev,
    template: templateDir,
    sort: sortDir,
    aside: sortDir ? `${sortDir}-未入选` : '',
    ready,
    categories: required.length,
    picked,
    need,
    groups: rows,
  }
}

function toggle(name, slotName) {
  if (!sortDir || !templateDir) throw httpError(400, '先选择样板文件夹和待分拣文件夹')
  const base = path.basename(String(name || ''))
  const slot = String(slotName || '')
  if (!base || base !== name || !imageRe.test(base)) throw httpError(400, '只能标记图片')
  const slots = templateSlots()
  const target = slots.find((item) => item.slot === slot)
  if (!target) throw httpError(400, '样板里没有这个编号')
  const placed = placement(slots)
  const allowed = new Set(slotFiles(target, placed))
  if (!allowed.has(base)) throw httpError(400, '这张图不能用在这个编号上')
  const chosen = picks[slot] ? [...picks[slot]] : []
  const index = chosen.indexOf(base)
  if (index >= 0) {
    chosen.splice(index, 1)
    history.push({ name: base, slot, picked: false })
  } else {
    if (chosen.length >= 1) throw httpError(409, `「${slot}」已经选了 1 张，先撤销`)
    for (const [other, list] of Object.entries(picks)) {
      if (other !== slot && Array.isArray(list) && list.includes(base)) throw httpError(409, `这张已经选给了「${other}」`)
    }
    chosen.push(base)
    history.push({ name: base, slot, picked: true })
  }
  picks[slot] = chosen
  history = history.slice(-100)
  saveState()
  return snapshot()
}

function undo() {
  const last = history.pop()
  if (!last) throw httpError(400, '没有可撤销的标记')
  const slot = last.slot
  const chosen = picks[slot] ? [...picks[slot]] : []
  const index = chosen.indexOf(last.name)
  if (last.picked && index >= 0) chosen.splice(index, 1)
  if (!last.picked && index < 0 && chosen.length < 1) chosen.push(last.name)
  picks[slot] = chosen
  saveState()
  return snapshot()
}

function moveUnique(fromDir, filename, toDir) {
  const src = path.join(fromDir, filename)
  let destName = filename
  let dest = path.join(toDir, destName)
  let n = 2
  while (fs.existsSync(dest)) {
    const ext = path.extname(filename)
    destName = `${path.basename(filename, ext)}__${n}${ext}`
    dest = path.join(toDir, destName)
    n += 1
  }
  fs.renameSync(src, dest)
}

function finish() {
  if (!sortDir || !templateDir) throw httpError(400, '先选择样板文件夹和待分拣文件夹')
  const rows = groups().filter((row) => row.need > 0)
  if (!rows.some((row) => row.files.some((file) => file.order > 0))) {
    throw httpError(409, '至少选中一张图片后才能重命名')
  }
  const aside = `${sortDir}-未入选`
  const renames = []
  const chosenNames = new Set()
  for (const row of rows) {
    const file = row.files.find((item) => item.order > 0)
    if (!file) continue
    chosenNames.add(file.name)
    renames.push({ from: file.name, to: `${row.name}${path.extname(file.name)}` })
  }
  const seenDest = new Set()
  for (const item of renames) {
    if (seenDest.has(item.to)) throw httpError(409, `目标文件名重复：${item.to}`)
    seenDest.add(item.to)
  }
  const sources = new Set(renames.map((item) => item.from))
  for (const item of renames) {
    if (item.from === item.to) continue
    if (fs.existsSync(path.join(sortDir, item.to)) && !sources.has(item.to)) {
      throw httpError(409, `目标文件名已存在：${item.to}`)
    }
  }
  const parked = []
  const seenParked = new Set()
  for (const row of groups()) {
    for (const file of row.files) {
      if (chosenNames.has(file.name) || seenParked.has(file.name)) continue
      seenParked.add(file.name)
      parked.push(file.name)
    }
  }
  const pending = renames.filter((item) => item.from !== item.to)
  const temps = []
  try {
    pending.forEach((item, index) => {
      const tmp = path.join(sortDir, `.__pick_${index}${path.extname(item.from)}`)
      fs.renameSync(path.join(sortDir, item.from), tmp)
      temps.push(tmp)
    })
    pending.forEach((item, index) => {
      fs.renameSync(temps[index], path.join(sortDir, item.to))
    })
  } catch (err) {
    temps.forEach((tmp, index) => {
      if (!fs.existsSync(tmp)) return
      const back = path.join(sortDir, pending[index].from)
      if (!fs.existsSync(back)) fs.renameSync(tmp, back)
    })
    throw err
  }
  fs.mkdirSync(aside, { recursive: true })
  for (const name of parked) moveUnique(sortDir, name, aside)
  picks = {}
  history = []
  saveState()
  rev += 1
  return { renamed: pending.length, parked: parked.length, aside, ...snapshot() }
}

function pickFolder(initial) {
  if (picking) return picking
  const scriptPath = path.join(os.tmpdir(), `set-sorter-pick-${process.pid}.ps1`)
  const script = `
Add-Type -AssemblyName System.Windows.Forms
$owner = New-Object System.Windows.Forms.Form
$owner.TopMost = $true
$owner.ShowInTaskbar = $false
$dialog = New-Object System.Windows.Forms.FolderBrowserDialog
$dialog.Description = 'Select image folder'
$dialog.UseDescriptionForTitle = $true
$dialog.ShowNewFolderButton = $false
$initial = $env:SORTER_INITIAL
if ($initial -and (Test-Path -LiteralPath $initial)) { $dialog.SelectedPath = $initial }
$result = $dialog.ShowDialog($owner)
$owner.Dispose()
if ($result -eq [System.Windows.Forms.DialogResult]::OK) {
  # PowerShell 5's native stdout uses the local code page, which corrupts Unicode paths.
  [Console]::Out.Write([Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes($dialog.SelectedPath)))
}
`
  fs.writeFileSync(scriptPath, '\uFEFF' + script, 'utf8')
  picking = new Promise((resolve, reject) => {
    const child = spawn('powershell.exe', ['-STA', '-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', scriptPath], {
      windowsHide: true,
      env: { ...process.env, SORTER_INITIAL: initial || '' },
    })
    const out = []
    const err = []
    child.stdout.on('data', (chunk) => out.push(chunk))
    child.stderr.on('data', (chunk) => err.push(chunk))
    child.on('error', reject)
    child.on('close', (code) => {
      fs.rmSync(scriptPath, { force: true })
      if (code !== 0) {
        reject(httpError(500, Buffer.concat(err).toString('utf8').trim() || '没能打开文件夹选择窗口'))
        return
      }
      const encoded = Buffer.concat(out).toString('ascii').trim()
      resolve(encoded ? Buffer.from(encoded, 'base64').toString('utf8') : '')
    })
  }).finally(() => {
    picking = null
  })
  return picking
}

function resolveImage(name) {
  if (!sortDir) throw httpError(400, '先选择待分拣文件夹')
  const base = path.basename(String(name || ''))
  if (!base || base !== name || !imageRe.test(base)) throw httpError(400, '只能查看图片')
  const full = path.resolve(sortDir, base)
  const rel = path.relative(sortDir, full)
  if (rel.startsWith('..') || path.isAbsolute(rel)) throw httpError(400, '非法路径')
  return full
}

function sendJson(res, status, body) {
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
  })
  res.end(JSON.stringify(body))
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = []
    let size = 0
    req.on('data', (chunk) => {
      size += chunk.length
      if (size > 1_000_000) {
        reject(httpError(413, '请求过大'))
        req.destroy()
      } else chunks.push(chunk)
    })
    req.on('end', () => {
      if (!chunks.length) {
        resolve({})
        return
      }
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')))
      } catch {
        reject(httpError(400, '无效 JSON'))
      }
    })
    req.on('error', reject)
  })
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url || '/', 'http://127.0.0.1')
    if (req.method === 'GET' && url.pathname === '/') {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' })
      res.end(fs.readFileSync(htmlPath))
      return
    }
    if (req.method === 'GET' && url.pathname === '/api/state') {
      sendJson(res, 200, snapshot())
      return
    }
    if (req.method === 'POST' && url.pathname === '/api/folder') {
      const body = await readBody(req)
      sendJson(res, 200, setDirectory(body.which, body.path))
      return
    }
    if (req.method === 'POST' && url.pathname === '/api/pick-folder') {
      if (picking) throw httpError(409, '文件夹选择窗口已经开着')
      const body = await readBody(req)
      const initial = body.which === 'template' ? templateDir : sortDir
      const picked = await pickFolder(initial)
      if (!picked) {
        sendJson(res, 200, { ...snapshot(), cancelled: true })
        return
      }
      sendJson(res, 200, { ...setDirectory(body.which, picked), cancelled: false })
      return
    }
    if (req.method === 'POST' && url.pathname === '/api/toggle') {
      const body = await readBody(req)
      sendJson(res, 200, toggle(body.name, body.slot))
      return
    }
    if (req.method === 'POST' && url.pathname === '/api/undo') {
      sendJson(res, 200, undo())
      return
    }
    if (req.method === 'POST' && url.pathname === '/api/finish') {
      sendJson(res, 200, finish())
      return
    }
    if (req.method === 'GET' && url.pathname === '/img') {
      const full = resolveImage(url.searchParams.get('name'))
      if (!fs.existsSync(full)) throw httpError(404, '文件不存在')
      const ext = path.extname(full).toLowerCase()
      const type = ext === '.png' ? 'image/png' : ext === '.webp' ? 'image/webp' : 'image/jpeg'
      res.writeHead(200, { 'Content-Type': type, 'Cache-Control': 'private, max-age=86400' })
      fs.createReadStream(full).pipe(res)
      return
    }
    sendJson(res, 404, { error: '未找到' })
  } catch (err) {
    sendJson(res, err.status || 500, { error: err.message || '服务器错误' })
  }
})

function useIfExists(which, dir) {
  if (dir && fs.existsSync(dir) && fs.statSync(dir).isDirectory()) setDirectory(which, dir)
}

useIfExists('template', process.env.SET_TEMPLATE || 'D:\\Code\\主播\\NSFW\\东雪莲')
useIfExists('sort', process.env.SET_SORT || 'D:\\Code\\主播\\鲸鱼娘')

server.listen(port, '127.0.0.1', () => {
  console.log(`种类分拣 http://127.0.0.1:${port}`)
  console.log(templateDir ? `样板 ${templateDir}` : '还没有样板文件夹')
  console.log(sortDir ? `待分拣 ${sortDir}` : '还没有待分拣文件夹')
})
