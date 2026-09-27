import http from 'node:http'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const port = Number(process.argv[3] || 4177)
let imageDir = ''
let rev = 0
let picking = null
const MARK = '（待删除）'
const htmlPath = path.join(__dirname, 'index.html')

function httpError(status, message) {
  const err = new Error(message)
  err.status = status
  return err
}

function groupKey(filename) {
  const stem = filename.replace(/\.png$/i, '')
  const matched = stem.match(/^(.*)-(正面|侧面)_r\d+_\d+_/)
  return matched ? matched[1] : stem.replace(/（待删除）$/, '')
}

function describe(name, key) {
  const stem = name.replace(/\.png$/i, '')
  const marked = stem.endsWith(MARK)
  const bare = marked ? stem.slice(0, -MARK.length) : stem
  const label = bare.startsWith(`${key}-`) ? bare.slice(key.length + 1) : bare
  return { name, marked, label }
}

function variantRank(name) {
  const front = name.includes('-正面') ? 0 : 1
  const edition = name.includes('（新）') ? 1 : name.includes('（旧）') ? 2 : 0
  return front * 10 + edition
}

function folderState() {
  return { path: imageDir, rev }
}

function setFolder(dir) {
  const resolved = path.resolve(String(dir || ''))
  let stat
  try {
    stat = fs.statSync(resolved)
  } catch {
    throw httpError(400, '找不到这个文件夹')
  }
  if (!stat.isDirectory()) throw httpError(400, '这不是文件夹')
  imageDir = resolved
  rev += 1
  return folderState()
}

function listGroups() {
  if (!imageDir) return []
  let names
  try {
    names = fs.readdirSync(imageDir)
  } catch {
    throw httpError(400, '文件夹读不了')
  }
  names = names.filter((name) => name.toLowerCase().endsWith('.png'))
  const map = new Map()
  for (const name of names) {
    const key = groupKey(name)
    if (!map.has(key)) map.set(key, [])
    map.get(key).push(describe(name, key))
  }
  return [...map.entries()]
    .sort((a, b) => a[0].localeCompare(b[0], 'zh-CN'))
    .map(([name, files]) => ({
      name,
      files: files.sort((a, b) => variantRank(a.name) - variantRank(b.name) || a.name.localeCompare(b.name, 'zh-CN')),
    }))
}

function pickFolder() {
  if (picking) return picking
  const scriptPath = path.join(os.tmpdir(), `portrait-sorter-pick-${process.pid}.ps1`)
  const script = `
Add-Type -AssemblyName System.Windows.Forms
$owner = New-Object System.Windows.Forms.Form
$owner.TopMost = $true
$owner.ShowInTaskbar = $false
$dialog = New-Object System.Windows.Forms.FolderBrowserDialog
$dialog.Description = '选择要分拣的图片文件夹'
$dialog.UseDescriptionForTitle = $true
$dialog.ShowNewFolderButton = $false
$initial = $env:SORTER_INITIAL
if ($initial -and (Test-Path -LiteralPath $initial)) { $dialog.SelectedPath = $initial }
$result = $dialog.ShowDialog($owner)
$owner.Dispose()
if ($result -eq [System.Windows.Forms.DialogResult]::OK) {
  [Console]::Out.Write($dialog.SelectedPath)
}
`
  fs.writeFileSync(scriptPath, '\uFEFF' + script, 'utf8')
  picking = new Promise((resolve, reject) => {
    const child = spawn('powershell.exe', ['-STA', '-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', scriptPath], {
      windowsHide: true,
      env: { ...process.env, SORTER_INITIAL: imageDir },
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
      resolve(Buffer.concat(out).toString('utf8').trim())
    })
  }).finally(() => {
    picking = null
  })
  return picking
}

function resolveInside(name) {
  if (!imageDir) throw httpError(400, '先选择一个文件夹')
  const base = path.basename(String(name || ''))
  if (!base || base !== name || !base.toLowerCase().endsWith('.png')) {
    throw httpError(400, '只能处理这个文件夹里的 png')
  }
  const full = path.resolve(imageDir, base)
  const rel = path.relative(imageDir, full)
  if (rel.startsWith('..') || path.isAbsolute(rel)) throw httpError(400, '非法路径')
  return { base, full }
}

function toggleMark(name) {
  const { base, full } = resolveInside(name)
  if (!fs.existsSync(full)) throw httpError(404, '文件不存在')
  const ext = path.extname(base)
  const stem = base.slice(0, -ext.length)
  const marked = !stem.endsWith(MARK)
  const nextStem = marked ? stem + MARK : stem.slice(0, -MARK.length)
  const nextName = nextStem + ext
  const nextFull = path.resolve(imageDir, nextName)
  if (fs.existsSync(nextFull)) throw httpError(409, '目标文件名已存在')
  try {
    fs.renameSync(full, nextFull)
  } catch {
    throw httpError(500, '文件正在被占用，稍后再试')
  }
  return describe(nextName, groupKey(nextName))
}

function sendJson(res, status, body) {
  const payload = JSON.stringify(body)
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
  })
  res.end(payload)
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
      } else {
        chunks.push(chunk)
      }
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
      const html = fs.readFileSync(htmlPath)
      res.writeHead(200, {
        'Content-Type': 'text/html; charset=utf-8',
        'Cache-Control': 'no-store',
      })
      res.end(html)
      return
    }
    if (req.method === 'GET' && url.pathname === '/api/groups') {
      sendJson(res, 200, { ...folderState(), groups: listGroups() })
      return
    }
    if (req.method === 'POST' && url.pathname === '/api/folder') {
      const body = await readBody(req)
      sendJson(res, 200, setFolder(body.path))
      return
    }
    if (req.method === 'POST' && url.pathname === '/api/pick-folder') {
      if (picking) throw httpError(409, '文件夹选择窗口已经开着')
      const picked = await pickFolder()
      if (!picked) {
        sendJson(res, 200, { ...folderState(), cancelled: true })
        return
      }
      sendJson(res, 200, { ...setFolder(picked), cancelled: false })
      return
    }
    if (req.method === 'GET' && url.pathname === '/img') {
      const { full } = resolveInside(url.searchParams.get('name'))
      if (!fs.existsSync(full)) throw httpError(404, '文件不存在')
      res.writeHead(200, {
        'Content-Type': 'image/png',
        'Cache-Control': 'public, max-age=86400',
      })
      fs.createReadStream(full).pipe(res)
      return
    }
    if (req.method === 'POST' && url.pathname === '/api/mark') {
      const body = await readBody(req)
      sendJson(res, 200, toggleMark(body.name))
      return
    }
    sendJson(res, 404, { error: '未找到' })
  } catch (err) {
    const status = err.status || 500
    sendJson(res, status, { error: err.message || '服务器错误' })
  }
})

const initial = process.argv[2] || 'D:\\Code\\三消原图\\波次4'
try {
  if (fs.existsSync(initial) && fs.statSync(initial).isDirectory()) setFolder(initial)
} catch {
  imageDir = ''
}

server.listen(port, '127.0.0.1', () => {
  console.log(`分拣页面 http://127.0.0.1:${port}`)
  console.log(imageDir ? `图片目录 ${imageDir}` : '还没有图片目录，在页面里选择')
})
