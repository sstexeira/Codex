const { contextBridge, ipcRenderer, webUtils } = require("electron");

contextBridge.exposeInMainWorld("appBridge", {
  transcribe: (filePath, speakerRefs) =>
    ipcRenderer.invoke("transcribe", { filePath, speakerRefs }),
  saveMarkdown: (markdown, originalPathBase) =>
    ipcRenderer.invoke("save-markdown", { markdown, originalPathBase }),
  renderMarkdown: (markdown) =>
    ipcRenderer.invoke("render-markdown", { markdown }),
  createClip: (filePath, startSeconds, durationSeconds, slotIndex) =>
    ipcRenderer.invoke("create-clip", {
      filePath,
      startSeconds,
      durationSeconds,
      slotIndex,
    }),
  clearClip: (clipPath) => ipcRenderer.invoke("clear-clip", { clipPath }),
  openOutputFolder: (markdownPath) =>
    ipcRenderer.invoke("open-output-folder", { markdownPath }),
  postProcessMarkdown: (markdownPath, prompt, history) =>
    ipcRenderer.invoke("post-process-markdown", {
      markdownPath,
      prompt,
      history,
    }),
  loadPromptPresets: () => ipcRenderer.invoke("load-prompt-presets"),
  getPathForFile: (file) => webUtils.getPathForFile(file),
  onStatus: (handler) => {
    ipcRenderer.on("status-update", (_event, message) => {
      handler(message);
    });
  },
});
