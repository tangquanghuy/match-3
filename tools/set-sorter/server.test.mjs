import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import fs from 'node:fs'
import net from 'node:net'
import os from 'node:os'
import path from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))

async function freePort() {
  const server = net.createServer()
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
  const { port } = server.address()
  await new Promise((resolve) => server.close(resolve))
  return port
}

test('submit selected images without requiring every category', async () => {
  const fixture = fs.mkdtempSync(path.join(os.tmpdir(), 'set-sorter-test-'))
  const template = path.join(fixture, 'template')
  const sort = path.join(fixture, 'sort')
  fs.mkdirSync(template)
  fs.mkdirSync(sort)
  for (const name of ['Alpha1.png', 'Beta1.png']) fs.writeFileSync(path.join(template, name), '')
  for (const name of ['Alpha_1.png', 'Alpha_2.png', 'Beta_1.png', 'loose.png']) fs.writeFileSync(path.join(sort, name), '')
  const port = await freePort()
  const url = `http://127.0.0.1:${port}`
  const child = spawn(process.execPath, [path.join(here, 'server.mjs'), String(port)], {
    env: { ...process.env, SET_TEMPLATE: template, SET_SORT: sort },
    stdio: 'ignore',
  })
  const post = async (endpoint, body = {}) => {
    const res = await fetch(`${url}${endpoint}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
    })
    return { status: res.status, data: await res.json() }
  }
  try {
    let started = false
    for (let i = 0; i < 80; i++) {
      if (child.exitCode !== null) break
      try {
        const res = await fetch(`${url}/api/state`)
        if (res.ok) { started = true; break }
      } catch { /* server still starting */ }
      await new Promise((resolve) => setTimeout(resolve, 50))
    }
    assert.ok(started, 'test server started')
    const empty = await post('/api/finish')
    assert.equal(empty.status, 409)
    assert.match(empty.data.error, /\u81f3\u5c11\u9009\u4e2d\u4e00\u5f20/)
    assert.equal((await post('/api/toggle', { name: 'Alpha_1.png', slot: 'Alpha1' })).status, 200)
    const { status, data } = await post('/api/finish')
    assert.equal(status, 200)
    assert.equal(data.renamed, 1)
    assert.equal(data.parked, 3)
    assert.ok(fs.existsSync(path.join(sort, 'Alpha1.png')))
    assert.deepEqual(fs.readdirSync(`${sort}-\u672a\u5165\u9009`).sort(), ['Alpha_2.png', 'Beta_1.png', 'loose.png'])
  } finally {
    child.kill()
    await new Promise((resolve) => child.once('exit', resolve))
    const resolved = path.resolve(fixture)
    assert.ok(resolved.startsWith(path.resolve(os.tmpdir()) + path.sep) && path.basename(resolved).startsWith('set-sorter-test-'))
    fs.rmSync(resolved, { recursive: true, force: true })
  }
})
