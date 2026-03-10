const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("electronAPI", {
  // Window controls
  minimize: () => ipcRenderer.send("win:minimize"),
  maximize: () => ipcRenderer.send("win:maximize"),
  close: () => ipcRenderer.send("win:close"),
  openExternal: (url) => ipcRenderer.send("open-external", url),

  // System checks
  checkEnvironment: () => ipcRenderer.invoke("check-environment"),

  // API key validation
  validateApiKey: (data) => ipcRenderer.invoke("validate-api-key", data),

  // Installation
  installOpenClaw: (data) => ipcRenderer.invoke("install-openclaw", data),
  uninstallOpenClaw: () => ipcRenderer.invoke("uninstall-openclaw"),
  onInstallLog: (callback) => {
    const handler = (_, msg) => callback(msg);
    ipcRenderer.on("install-log", handler);
    return () => ipcRenderer.removeListener("install-log", handler);
  },
});
