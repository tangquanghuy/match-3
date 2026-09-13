import { SkillTestPage } from './render/SkillTestPage';

const mount = document.getElementById('app');
if (mount) {
  const page = new SkillTestPage();
  (window as unknown as { __testPage: SkillTestPage }).__testPage = page;
  page.init(mount).catch((err) => {
    console.error('测试页初始化失败:', err);
    mount.textContent = '测试页初始化失败，请查看控制台。';
  });
}
