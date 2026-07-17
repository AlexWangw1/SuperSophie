/* eslint-disable @typescript-eslint/no-require-imports */
const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("sophieDesktop", {
  setPetEnabled: (enabled) => ipcRenderer.invoke("sophie:set-pet-enabled", Boolean(enabled)),
  showMain: () => ipcRenderer.invoke("sophie:show-main"),
  quit: () => ipcRenderer.invoke("sophie:quit"),
});
