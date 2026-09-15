/**
 * 放映厅专用 dev 服务（窗口 G）。
 *
 * 选 dev 而非 build+preview 的理由（任务书阶段 1.1 要求说明）：
 *   - E 的内容批次在持续落 src，build 是全量 tsc+vite，慢且会被 E 的在途语法态卡死；
 *     dev 按需编译，画廊跑「当下」的代码，还天然满足「E 边扩 G 边放」的并行诉求。
 *   - 端口自管：默认 5175，避开 5173（PARALLEL-WORK 防撞规则 3）。
 * 端口上已有可用服务时直接复用（幂等），否则 spawn `npx vite --port N --strictPort`。
 */
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('../..', import.meta.url));

export async function ensureServer({ port = 5175, timeoutMs = 90_000 } = {}) {
  const base = `http://127.0.0.1:${port}`;
  if (await probe(base)) {
    return { base, child: null, reused: true };
  }
  const child = spawn('npx', ['vite', '--port', String(port), '--strictPort', '--host', '127.0.0.1'], {
    cwd: ROOT,
    stdio: ['ignore', 'pipe', 'pipe'],
    shell: process.platform === 'win32',
  });
  child.stdout.on('data', () => { /* 静默：画廊跑批日志已多 */ });
  child.stderr.on('data', (d) => { process.stderr.write(`[vite] ${d}`); });

  const t0 = Date.now();
  for (;;) {
    if (await probe(base)) return { base, child, reused: false };
    if (child.exitCode !== null) {
      throw new Error(`vite dev 服务退出（code=${child.exitCode}），端口 ${port} 可能被占用`);
    }
    if (Date.now() - t0 > timeoutMs) {
      child.kill();
      throw new Error(`vite dev 服务 ${timeoutMs}ms 内未就绪（端口 ${port}）`);
    }
    await new Promise((r) => setTimeout(r, 400));
  }
}

async function probe(base) {
  try {
    const res = await fetch(`${base}/tests/e2e/theater.html`, {
      signal: AbortSignal.timeout(2500),
    });
    return res.ok;
  } catch {
    return false;
  }
}

export function disposeServer(server) {
  if (!server || !server.child) return;
  const child = server.child;
  if (process.platform === 'win32' && child.pid) {
    // shell:true 时 child 是 shell，kill 杀不到孙进程（vite），须树杀
    spawn('taskkill', ['/PID', String(child.pid), '/T', '/F'], { stdio: 'ignore' });
  } else {
    child.kill();
  }
}
