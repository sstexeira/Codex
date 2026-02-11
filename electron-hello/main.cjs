const { app, BrowserWindow, ipcMain } = require("electron");
const path = require("path");

app.whenReady().then(() => {
  const win = new BrowserWindow({
    width: 500,
    height: 300,
    resizable: false,
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
    },
  });

  win.loadFile(path.join(__dirname, "index.html"));
});

ipcMain.on("quit-app", () => {
  app.quit();
});
