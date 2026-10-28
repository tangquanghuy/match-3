// 三消面板注入入口；也可由底栏直接加载同一模块。
!(function () {
  "use strict";

  const runtimeWindow = window;
  const MODULE_URL = "https://match3-tavern-playtest.linjiang-workshop.workers.dev/sillytavern-panel.js";
  let hostWindow = runtimeWindow;
  try {
    while (hostWindow.parent && hostWindow.parent !== hostWindow) {
      const parentWindow = hostWindow.parent;
      void parentWindow.document;
      hostWindow = parentWindow;
    }
  } catch (error) { /* 使用可访问的酒馆宿主窗口。 */ }

  let opening = null;
  const open = () => {
    if (opening) return opening;
    opening = (async () => {
      if (!hostWindow.__match3PanelModulePromise) {
        const retry = hostWindow.__match3PanelModuleRetry || 0;
        const moduleUrl = retry ? MODULE_URL + "?retry=" + retry : MODULE_URL;
        hostWindow.__match3PanelModulePromise = import(moduleUrl).catch(error => {
          hostWindow.__match3PanelModuleRetry = retry + 1;
          delete hostWindow.__match3PanelModulePromise;
          throw error;
        });
      }
      const panelModule = await hostWindow.__match3PanelModulePromise;
      if (typeof panelModule.openStPanel !== "function") {
        delete hostWindow.__match3PanelModulePromise;
        hostWindow.__match3PanelModuleRetry = (hostWindow.__match3PanelModuleRetry || 0) + 1;
        throw new Error("三消面板入口尚未就绪");
      }
      return panelModule.openStPanel({ runtimeWindow, hostWindow });
    })().finally(() => { opening = null; });
    return opening;
  };

  hostWindow.match3_panel_open = open;
  runtimeWindow.match3_panel_open = open;
})();
