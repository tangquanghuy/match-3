/* 程序化武器插画（steel/gold/wood 渐变 + 按种类剪影）——自视觉小样 v5 原样转入 */
export const WEAPON_DEFS: string = '<svg class="wp-defs" aria-hidden="true" focusable="false"><defs>'
+ '<linearGradient id="wpSteel" x1="0" y1="0" x2="1" y2="1">'
+ '<stop offset="0" stop-color="#f4f8fc"/><stop offset=".38" stop-color="#c2ccd8"/>'
+ '<stop offset=".6" stop-color="#7f8996"/><stop offset="1" stop-color="#454d59"/></linearGradient>'
+ '<linearGradient id="wpGold" x1="0" y1="0" x2="1" y2="1">'
+ '<stop offset="0" stop-color="#ffeec4"/><stop offset=".46" stop-color="#d9ad5e"/>'
+ '<stop offset="1" stop-color="#77551f"/></linearGradient>'
+ '<linearGradient id="wpWood" x1="0" y1="0" x2="1" y2="0">'
+ '<stop offset="0" stop-color="#7d5934"/><stop offset=".52" stop-color="#4a3320"/>'
+ '<stop offset="1" stop-color="#2a1d12"/></linearGradient>'
+ '<radialGradient id="wpGem" cx="36%" cy="30%" r="72%">'
+ '<stop offset="0" stop-color="#fff8dd"/><stop offset=".45" stop-color="#9bd8f2"/>'
+ '<stop offset="1" stop-color="#2d6ba6"/></radialGradient>'
+ '</defs></svg>';

const wrap = (inner: string) => '<svg class="wp" viewBox="0 0 100 140" aria-hidden="true" focusable="false">' + inner + '</svg>';

export const WEAPON_ICONS: Record<string, string> = {
  sword: wrap(
    '<path class="steel" d="M50 6 60 30 58 84H42L40 30Z"/>'
    + '<path class="shine" d="M50 12V80"/>'
    + '<path class="gold" d="M19 83q31-6 62 0l-3 11q-28-5-56 0Z"/>'
    + '<path class="wood" d="M45 94h10v26H45Z"/>'
    + '<path class="line" d="M45 100h10M45 107h10M45 114h10"/>'
    + '<path class="gold" d="M50 120 59 129 50 138 41 129Z"/>'
  ),
  greatsword: wrap(
    '<path class="steel" d="M50 4 64 28 61 80H39L36 28Z"/>'
    + '<path class="shine" d="M50 11V76"/>'
    + '<path class="gold" d="M12 78q38-7 76 0l-4 12q-34-6-68 0Z"/>'
    + '<path class="gold" d="M12 78 6 68l12 4Zm76 0 6-10-12 4Z"/>'
    + '<path class="wood" d="M44 92h12v30H44Z"/>'
    + '<path class="line" d="M44 99h12M44 107h12M44 115h12"/>'
    + '<path class="gold" d="M50 122 61 131 50 140 39 131Z"/>'
  ),
  dagger: wrap(
    '<path class="steel" d="M50 14 59 38 56 76H44L41 38Z"/>'
    + '<path class="shine" d="M50 20V72"/>'
    + '<path class="gold" d="M28 75h44v9H28Z"/>'
    + '<path class="wood" d="M45 84h10v28H45Z"/>'
    + '<path class="line" d="M45 91h10M45 99h10M45 106h10"/>'
    + '<circle class="gold" cx="50" cy="121" r="9"/>'
  ),
  axe: wrap(
    '<path class="wood" d="M46 16h8v120h-8Z"/>'
    + '<path class="steel" d="M52 16q24 2 34 16t-2 44l-32 4Z"/>'
    + '<path class="line" d="M57 26q18 6 22 18t-4 26"/>'
    + '<path class="steel" d="M46 34 26 42l20 12Z"/>'
    + '<path class="gold" d="M41 14h18v10H41Zm0 60h18v10H41Z"/>'
    + '<path class="gold" d="M43 116h14v14H43Z"/>'
  ),
  hammer: wrap(
    '<path class="wood" d="M46 52h8v84h-8Z"/>'
    + '<path class="steel" d="M24 26 31 16h38l7 10v30l-7 10H31l-7-10Z"/>'
    + '<path class="line" d="M35 18v46M65 18v46"/>'
    + '<path class="shine" d="M31 21h38"/>'
    + '<path class="gold" d="M40 60h20v10H40Z"/>'
    + '<path class="gold" d="M43 118h14v12H43Z"/>'
  ),
  staff: wrap(
    '<path class="wood" d="M46 44h8v92h-8Z"/>'
    + '<path class="gstroke" d="M30 32a20 20 0 1 1 40 0"/>'
    + '<path class="gold" d="M27 30h7l4 18h-8Zm46 0h-7l-4 18h8Z"/>'
    + '<circle class="gem" cx="50" cy="30" r="11"/>'
    + '<path class="shine" d="M45 25a8 8 0 0 1 6-3"/>'
    + '<path class="gold" d="M41 44h18v10H41Z"/>'
    + '<path class="gold" d="M43 112h14v12H43Z"/>'
  ),
  bow: wrap(
    '<path class="wstroke" d="M36 10q34 30 34 60t-34 60"/>'
    + '<path class="string" d="M36 10v120"/>'
    + '<path class="gold" d="M62 56h10v28H62Z"/>'
    + '<circle class="gold" cx="36" cy="10" r="4"/>'
    + '<circle class="gold" cx="36" cy="130" r="4"/>'
    + '<path class="steel" d="M20 70h44v4H20Z"/>'
    + '<path class="steel" d="M76 72 60 65v14Z"/>'
  ),
  spear: wrap(
    '<path class="steel" d="M50 2q15 24 0 52Q35 26 50 2Z"/>'
    + '<path class="shine" d="M50 9v36"/>'
    + '<path class="gold" d="M42 52h16v12H42Z"/>'
    + '<path class="wood" d="M45 62h10v74h-10Z"/>'
    + '<path class="gold" d="M42 94h16v22H42Z"/>'
    + '<path class="line" d="M42 101h16M42 109h16"/>'
  ),
  scythe: wrap(
    '<path class="wood" d="M46 14h8v122h-8Z"/>'
    + '<path class="steel" d="M52 8Q12 12 4 48 20 22 52 26Z"/>'
    + '<path class="line" d="M48 16Q20 22 12 42"/>'
    + '<path class="gold" d="M40 10h20v14H40Z"/>'
    + '<path class="gold" d="M43 106h14v16H43Z"/>'
  ),
};

/** 按种类取武器剪影（未知种类回退长剑） */
export function weaponArt(kind: string): string {
  return WEAPON_ICONS[kind] ?? WEAPON_ICONS['sword']!;
}

/** 把渐变 defs 挂到 body（武器插画依赖的 CSS 渐变，全页一次） */
export function mountWeaponDefs(): void {
  if (document.querySelector('.wp-defs')) return;
  const holder = document.createElement('div');
  holder.style.cssText = 'position:absolute;width:0;height:0;overflow:hidden';
  holder.innerHTML = WEAPON_DEFS;
  document.body.appendChild(holder);
}
