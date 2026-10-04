/**
 * 版本库内的美术素材（game-assets/bundled/meta/**，文生图产物见 scripts/art-gen）。
 *
 * 走 Vite 的 import.meta.glob：构建时带哈希进 dist，开发期直接服务源文件——
 * 不再依赖被 .gitignore 忽略的 public/ 目录（上线打包不会丢图）。
 * 页面 CSS 以 ?raw 注入、不做 url() 改写，所以 CSS 里的图一律由屏层写成
 * CSS 变量（style="--art-x:url(...)"）再在样式表里 var() 引用。
 */
const RESULT = import.meta.glob('@assets/meta/result/*.webp', { eager: true, query: '?url', import: 'default' }) as Record<string, string>;
const KINGDOM = import.meta.glob('@assets/meta/kingdom/*.webp', { eager: true, query: '?url', import: 'default' }) as Record<string, string>;
const DAILY = import.meta.glob('@assets/meta/daily/*.webp', { eager: true, query: '?url', import: 'default' }) as Record<string, string>;
const SHOP = import.meta.glob('@assets/meta/shop/*.webp', { eager: true, query: '?url', import: 'default' }) as Record<string, string>;
const GIFT = import.meta.glob('@assets/meta/gift/*.webp', { eager: true, query: '?url', import: 'default' }) as Record<string, string>;

const EVENTS = import.meta.glob('@assets/meta/events/*.webp', { eager: true, query: '?url', import: 'default' }) as Record<string, string>;

/** 活动玩法素材 URL（bg-* 场景底图 / node-* 塔节点 / relic-* 遗物 / tile-* / squad-* / district-*） */
export function eventArt(name: string): string {
  return pick(EVENTS, name);
}

const GEMS = import.meta.glob('@assets/gems/**/*.{png,webp}', { eager: true, query: '?url', import: 'default' }) as Record<string, string>;
const STATUS_ICONS = import.meta.glob('@assets/status-icons/*.png', { eager: true, query: '?url', import: 'default' }) as Record<string, string>;

/** 棋盘宝石贴图 URL（`red` / `skull` / `special/doomSkull` / `status/burningGem`），与战斗层同一素材 */
export function gemArt(path: string): string {
  const hit = Object.entries(GEMS).find(([p]) => (p.endsWith(`/gems/${path}.webp`) || p.endsWith(`/gems/${path}.png`)));
  return hit?.[1] ?? '';
}

/** 状态图标 URL（`barrier` / `frozen` / `poison` …），与战斗卡面徽记同一素材 */
export function statusArt(name: string): string {
  const hit = Object.entries(STATUS_ICONS).find(([p]) => p.endsWith(`/${name}.png`));
  return hit?.[1] ?? '';
}

const TUTORIAL = import.meta.glob('@assets/meta/tutorial/*.webp', { eager: true, query: '?url', import: 'default' }) as Record<string, string>;

/** 新手引导 / 战斗加载页素材 URL（guide / frame / battle-loading） */
export function tutorialArt(name: string): string {
  return pick(TUTORIAL, name);
}

/** 馈赠页素材 URL（hall / 分组 id） */
export function giftArt(name: string): string {
  return pick(GIFT, name);
}

function pick(map: Record<string, string>, name: string): string {
  const hit = Object.entries(map).find(([path]) => path.endsWith(`/${name}.webp`));
  return hit?.[1] ?? '';
}

/** 结算 / 升级页素材 URL */
export function resultArt(name: string): string {
  return pick(RESULT, name);
}

/** 王国 / 进贡 / 旗帜素材 URL */
export function kingdomArt(name: string): string {
  return pick(KINGDOM, name);
}

/** 地图底部「每日行动」徽章素材 URL（firstwin / tribute / arena / hunt） */
export function dailyArt(name: string): string {
  return pick(DAILY, name);
}

/** 商店横幅素材 URL（event-<活动 id> / gem-vault） */
export function shopArt(name: string): string {
  return pick(SHOP, name);
}

/** 生成 `--name:url("…")` 形式的 CSS 变量声明（用于 style 属性） */
export function cssUrlVar(name: string, url: string): string {
  return url ? `--${name}:url("${url}")` : '';
}

const REGIONAL = import.meta.glob('@assets/meta/regional/*.webp', { eager: true, query: '?url', import: 'default' }) as Record<string, string>;
export function regionalArt(name: string): string { return pick(REGIONAL, name); }
