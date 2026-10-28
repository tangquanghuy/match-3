/** Install in a Tavern Helper script; the installation page fills this address. */
const MATCH3_BASE = 'https://YOUR_MATCH3_HOST/';
let match3;
let disposed = false;
const lifecycle = new AbortController();
const cleanup = () => {
  disposed = true;
  lifecycle.abort();
  match3?.destroy();
  if (window.match3Host === match3) delete window.match3Host;
  if (match3 && tavernWindow?.match3Host === match3) delete tavernWindow.match3Host;
};
let tavernWindow;
window.addEventListener('pagehide', cleanup, {once: true});
try {
  // Helper scripts can be nested; select the actual same-origin Tavern window.
  // Helper iframes also expose SillyTavern.getContext. The outermost accessible
  // Tavern window owns the visible DOM, fullscreen and account storage.
  let candidate = window;
  while (true) {
    try {
      if (candidate.SillyTavern?.getContext) tavernWindow = candidate;
      if (candidate.parent === candidate) break;
      candidate = candidate.parent;
    } catch { break; }
  }
  if (!tavernWindow?.SillyTavern?.getContext) throw new Error('请在酒馆助手脚本中运行三消加载器');
  let initializationTimeout;
  try {
    await Promise.race([
      waitGlobalInitialized('Mvu'),
      new Promise((_, reject) => { initializationTimeout = setTimeout(() => reject(new Error('等待 MVU 初始化超时，请先启用 MVU，再重载三消脚本')), 30000); }),
    ]);
  } finally { clearTimeout(initializationTimeout); }
  if (!disposed) {
    const {installStHost} = await import(new URL('sillytavern-host.js', MATCH3_BASE).href);
    if (!disposed) {
      tavernWindow.match3Host?.destroy();
      match3 = await installStHost({
        hostWindow: tavernWindow,
        signal: lifecycle.signal,
        battleUrl: new URL('sillytavern-battle.html', MATCH3_BASE).href,
        helpers: {
          getContext: () => tavernWindow.SillyTavern.getContext(),
          ...(typeof getTavernHelperVersion === 'function' ? {getTavernHelperVersion: () => getTavernHelperVersion()} : {}),
          ...(typeof getTavernVersion === 'function' ? {getTavernVersion: () => getTavernVersion()} : {}),
          getVariables: options => getVariables(options),
          updateVariablesWith: (updater, options) => updateVariablesWith(updater, options),
          Mvu,
        },
      });
      if (disposed) { match3.destroy(); }
      else {
        window.match3Host = match3;
        tavernWindow.match3Host = match3;
        if (typeof eventOn === 'function' && typeof getButtonEvent === 'function') {
          eventOn(getButtonEvent('三消存档'), () => match3.open());
        }
      }
    }
  }
} catch (error) {
  cleanup();
  const message = error instanceof Error ? error.message : String(error);
  console.error('[match3]', error);
  if (tavernWindow?.toastr) tavernWindow.toastr.error(message, '三消加载失败');
  else console.error('三消加载失败：' + message);
}
