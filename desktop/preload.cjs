/* eslint-disable @typescript-eslint/no-require-imports */
const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("sophieDesktop", {
  setPetEnabled: (enabled) => ipcRenderer.invoke("sophie:set-pet-enabled", Boolean(enabled)),
  showMain: () => ipcRenderer.invoke("sophie:show-main"),
  quit: () => ipcRenderer.invoke("sophie:quit"),
  pendingPackage: () => ipcRenderer.invoke("sophie:pending-package"),
  consumeOpenedPackage: () => ipcRenderer.invoke("sophie:consume-open-package"),
  onPackageAvailable: (callback) => {
    const listener = (_event, name) => callback(String(name));
    ipcRenderer.on("sophie:package-available", listener);
    return () => ipcRenderer.removeListener("sophie:package-available", listener);
  },
  retryOnline: () => ipcRenderer.invoke("sophie:retry-online"),
  chooseCodeProject: () => ipcRenderer.invoke("sophie:choose-code-project"),
  readCodeFile: (path) => ipcRenderer.invoke("sophie:read-code-file", String(path)),
  saveCodeFile: (input) => ipcRenderer.invoke("sophie:save-code-file", {
    path: String(input.path),
    content: String(input.content),
    expectedHash: input.expectedHash ? String(input.expectedHash) : null,
  }),
  runCodeCheck: (command) => ipcRenderer.invoke("sophie:run-code-check", String(command)),
});
