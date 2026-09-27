/** Structural/render-state checks, not an aesthetic sign-off. Runs after measured tails. */
export async function inspectPresentation(app) {
  const state = app.getEngine().getState();
  const errors = [], checks = { boardCells: 0, cards: 0, portraits: 0 };
  const ids = new Set();
  state.board.forEach((gem, pos) => {
    if (!gem) return;
    checks.boardCells++; ids.add(gem.id);
    const sprite = app.board.getSprite(gem.id), xy = app.board.cellCenter(pos);
    if (!sprite || !sprite.visible || sprite.alpha < 0.99) errors.push(`gem-not-visible:${gem.id}`);
    else if (Math.abs(sprite.x - xy.x) > 1 || Math.abs(sprite.y - xy.y) > 1) errors.push(`gem-wrong-position:${gem.id}`);
  });
  for (const sprite of app.board.layer.children) if (!ids.has(sprite.gemId)) errors.push(`stale-gem-sprite:${sprite.gemId}`);
  for (const side of ['Left', 'Right']) {
    const view = side === 'Left' ? app.leftTeamView : app.rightTeamView;
    for (const ch of state.teams[side].characters) {
      if (ch.defeated) continue;
      checks.cards++;
      const card = view.getCard(ch.id), el = card?.el;
      if (!el?.isConnected) { errors.push(`missing-card:${ch.id}`); continue; }
      for (const [selector, value] of [['.hp', ch.hp], ['.atk', ch.attack], ['.magic-v', ch.magic], ['.armor .v', ch.armor]]) {
        const displayed = Number(el.querySelector(selector)?.textContent ?? 0);
        if (displayed !== value) errors.push(`card-stat-mismatch:${ch.id}:${selector}:${displayed}/${value}`);
      }
      if (card.displayedMana !== Math.min(ch.mana, ch.manaCost)) errors.push(`card-mana-mismatch:${ch.id}`);
      const rect = el.getBoundingClientRect();
      if (!rect.width || !rect.height || rect.left < -1 || rect.top < -1 || rect.right > innerWidth + 1 || rect.bottom > innerHeight + 1)
        errors.push(`card-outside-viewport:${ch.id}`);
      for (const photo of el.querySelectorAll('.photo')) {
        const src = getComputedStyle(photo).backgroundImage.match(/url\(["']?(.*?)["']?\)/)?.[1];
        if (!src) { errors.push(`missing-portrait:${ch.id}`); continue; }
        checks.portraits++;
        const img = new Image(); img.src = src;
        try { await img.decode(); if (!img.naturalWidth) errors.push(`blank-portrait:${ch.id}`); }
        catch { errors.push(`broken-portrait:${ch.id}:${src}`); }
      }
    }
  }
  return { checks, errors, scope: 'final board IDs/positions/visibility, active card stats/mana/bounds and portrait decode; aesthetics and per-phase effects require evidence review' };
}
