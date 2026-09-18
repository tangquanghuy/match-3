/**
 * 武器图鉴页（weapons-codex.html 挂载点）——718 把全量目录的浏览/筛选/详情。
 * 数据：src/data/weapons.json（中文法术 + 绑定保真度）；图标：public/gowhead-icons/（卡面 webp）。
 */
import { mount } from './render/WeaponCodexPage';

const container = document.getElementById('app');
if (container) {
  container.style.display = 'block';
  container.style.padding = '0';
  container.style.maxWidth = 'none';
  mount(container);
}
