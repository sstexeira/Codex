const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("appBridge", {
  quit: () => ipcRenderer.send("quit-app"),
});
