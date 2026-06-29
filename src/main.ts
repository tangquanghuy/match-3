import { App } from './render/App';

const mount = document.getElementById('app');
if (mount) {
  const app = new App();
  app.init(mount).catch((err) => {
    console.error('初始化失败:', err);
    mount.textContent = '初始化失败，请查看控制台。';
  });
}
