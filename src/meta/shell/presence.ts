/** Server-timed presence: foreground game with a recent real interaction, not a login timestamp. */
let started = false;
export function startPresence(): void {
  if (started || typeof window === 'undefined') return;
  started = true;
  let lastInteraction = Date.now();
  let lastActive: boolean | undefined;
  let lastSentAt = 0;
  const send = (active: boolean) => {
    if (active === lastActive && (!active || Date.now() - lastSentAt < 30000)) return;
    lastActive = active;
    lastSentAt = Date.now();
    void fetch('/api/presence', {
      method: 'POST', credentials: 'same-origin', cache: 'no-store', keepalive: true,
      headers: { 'content-type': 'application/json' }, body: JSON.stringify({ active }),
    }).catch(() => { /* network loss: no time is credited until the next accepted heartbeat */ });
  };
  const tick = () => send(!document.hidden && document.hasFocus() && Date.now() - lastInteraction <= 90000);
  const interact = () => { lastInteraction = Date.now(); tick(); };
  window.addEventListener('pointerdown', interact, { passive: true });
  window.addEventListener('keydown', interact);
  window.addEventListener('touchstart', interact, { passive: true });
  window.addEventListener('focus', tick);
  window.addEventListener('blur', () => send(false));
  document.addEventListener('visibilitychange', tick);
  window.addEventListener('pagehide', () => send(false));
  tick();
  window.setInterval(tick, 30000);
}
