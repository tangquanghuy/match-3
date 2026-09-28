import { stoneName } from '../data/materials';
import { bottomNavHtml, toast, toastHtml, topbarHtml, $ } from '../shell/chrome';
import type { Screen, ShellCtx } from '../shell/screen';
import { isFailure } from '../gateway';
import { LOOT_ART } from './huntArt';
import {
  HUNT_START_TURNS,
  LOOT_LADDER,
  LOOT_NAMES,
  stonesFromMoves,
  type HuntGrant,
} from '../systems/treasureHunt';
import type { TreasureHuntState } from '../state/schema';

const fmt = (n: number): string => n.toLocaleString('en-US');

function ladderHtml(): string {
  return LOOT_LADDER.map((row, index) => `
    <li><img src="${LOOT_ART[index]}" alt="" draggable="false"><div><b>${row.name}</b><small>${row.reward}</small></div></li>
  `).join('');
}

function grantLines(grant: HuntGrant): string {
  const rows: string[] = [];
  if (grant.gold) rows.push(`黄金 +${fmt(grant.gold)}`);
  if (grant.souls) rows.push(`灵魂 +${fmt(grant.souls)}`);
  if (grant.glory) rows.push(`荣耀 +${fmt(grant.glory)}`);
  if (grant.gems) rows.push(`宝石 +${fmt(grant.gems)}`);
  if (grant.goldKeys) rows.push(`金钥匙 +${fmt(grant.goldKeys)}`);
  for (const [key, n] of Object.entries(grant.traitstones)) {
    if (n > 0) rows.push(`${stoneName(key)} +${n}`);
  }
  return rows.map((line) => `<li>${line}</li>`).join('') || '<li>这局没有开出东西</li>';
}

export class HuntScreen implements Screen {
  private selected: number | null = null;
  private busy = false;
  private previous: number[] = [];

  html(ctx: ShellCtx): string {
    const maps = ctx.save().materials.treasureMaps;
    return `
      ${topbarHtml()}
      <div class="screen hunt-screen">
        <section class="hunt-panel">
          <aside class="hunt-turns">
            <b id="huntTurns">${HUNT_START_TURNS}</b>
            <small>剩余步数</small>
            <span class="hunt-meta" id="huntMoves">已走 0 步</span>
            <span class="hunt-meta" id="huntStones">特质石 0</span>
            <span class="hunt-meta" id="huntMaps">藏宝图 ${fmt(maps)}</span>
            <p class="hunt-rule">三连耗 1 步，四连不耗，五连加 1 步。金库不能交换。每 15 步，结束时得 1 颗特质石。</p>
          </aside>
          <div class="hunt-stage">
            <div class="hunt-board" id="huntBoard" hidden></div>
            <div class="hunt-gate" id="huntGate">
              <h2>寻宝</h2>
              <p>消耗 1 张藏宝图。三连合成高一档，留在棋盘上。步数用完后，每件东西在自己的奖池里开出一项。</p>
              <button class="hunt-begin" id="huntBegin" type="button" ${maps > 0 ? '' : 'disabled'}>${maps > 0 ? `开始 · 藏宝图 ${fmt(maps)}` : '没有藏宝图'}</button>
              <a class="hunt-back" href="#map">返回地图</a>
            </div>
            <div class="hunt-result" id="huntResult" hidden>
              <h2>寻宝结束</h2>
              <ul class="hunt-loot" id="huntLoot"></ul>
              <button class="hunt-again" id="huntAgain" type="button">再开一局</button>
              <a class="hunt-back" href="#map">返回地图</a>
            </div>
          </div>
          <aside class="hunt-ladder">
            <h2>开出其一</h2>
            <ol>${ladderHtml()}</ol>
          </aside>
        </section>
      </div>
      ${bottomNavHtml('地图')}
      ${toastHtml()}`;
  }

  mount(ctx: ShellCtx, root: HTMLElement): void {
    const hunt = ctx.save().treasureHunt;
    if (hunt) this.showBoard(ctx, hunt);
    $('#huntBegin')?.addEventListener('click', () => void this.start(ctx));
    $('#huntAgain')?.addEventListener('click', () => void this.start(ctx));
    $('#huntBoard')?.addEventListener('click', (event) => {
      const cell = (event.target as HTMLElement).closest<HTMLElement>('[data-i]');
      if (!cell) return;
      void this.pick(ctx, Number(cell.dataset.i));
    });
    void root;
  }

  private async start(ctx: ShellCtx): Promise<void> {
    if (this.busy) return;
    this.busy = true;
    const begun = await ctx.gateway.startTreasureHunt();
    this.busy = false;
    ctx.refreshChrome();
    if (isFailure(begun.result)) {
      toast(begun.result.message);
      return;
    }
    $('#huntResult').hidden = true;
    this.selected = null;
    this.previous = [];
    this.showBoard(ctx, begun.result.state);
  }

  private async pick(ctx: ShellCtx, index: number): Promise<void> {
    if (this.busy || $('#huntBoard').hidden) return;
    const tier = ctx.save().treasureHunt?.cells[index];
    if (tier === 7) {
      toast('金库不能移动');
      return;
    }
    if (this.selected === null || this.selected === index) {
      this.selected = this.selected === index ? null : index;
      this.paint(ctx, ctx.save().treasureHunt);
      return;
    }
    const from = this.selected;
    this.selected = null;
    this.busy = true;
    const played = await ctx.gateway.playTreasureHunt(from, index);
    this.busy = false;
    ctx.refreshChrome();
    if (isFailure(played.result)) {
      toast(played.result.message);
      this.paint(ctx, ctx.save().treasureHunt);
      return;
    }
    if (played.result.shuffled) toast('没有可交换的步，棋盘已重排');
    this.paint(ctx, {
      cells: played.result.cells,
      turns: played.result.turns,
      moves: played.result.moves,
      rng: played.result.rng,
    });
    if (played.result.over && played.result.grant) this.showGrant(ctx, played.result.grant);
  }

  private showBoard(ctx: ShellCtx, state: TreasureHuntState): void {
    $('#huntGate').hidden = true;
    $('#huntBoard').hidden = false;
    this.paint(ctx, state);
  }

  private paint(ctx: ShellCtx, state: TreasureHuntState | null): void {
    if (!state) return;
    const changed = new Set<number>();
    if (this.previous.length === state.cells.length) {
      state.cells.forEach((tier, index) => {
        if (tier !== this.previous[index]) changed.add(index);
      });
    }
    $('#huntTurns').textContent = String(state.turns);
    $('#huntMoves').textContent = `已走 ${state.moves} 步`;
    $('#huntStones').textContent = `特质石 ${stonesFromMoves(state.moves)}`;
    $('#huntMaps').textContent = `藏宝图 ${fmt(ctx.save().materials.treasureMaps)}`;
    $('#huntBoard').innerHTML = state.cells.map((tier, index) => {
      const on = this.selected === index ? ' is-on' : '';
      const vault = tier === 7 ? ' is-vault' : '';
      const up = changed.has(index) ? ' is-up' : '';
      return `<button type="button" class="hunt-cell${on}${vault}${up}" data-i="${index}"><img src="${LOOT_ART[tier] ?? LOOT_ART[0]}" alt="${LOOT_NAMES[tier] ?? ''}" draggable="false"></button>`;
    }).join('');
    this.previous = state.cells.slice();
  }

  private showGrant(ctx: ShellCtx, grant: HuntGrant): void {
    $('#huntLoot').innerHTML = grantLines(grant);
    const again = $('#huntAgain') as HTMLButtonElement;
    const maps = ctx.save().materials.treasureMaps;
    again.disabled = maps <= 0;
    again.textContent = maps > 0 ? `再开一局 · 藏宝图 ${fmt(maps)}` : '没有藏宝图';
    $('#huntMaps').textContent = `藏宝图 ${fmt(maps)}`;
    $('#huntResult').hidden = false;
  }

  dispose(): void {}
}
