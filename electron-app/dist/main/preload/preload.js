"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const electron_1 = require("electron");
// Expose protected methods that allow the renderer process to use
// ipcRenderer without exposing the entire object
electron_1.contextBridge.exposeInMainWorld('electronAPI', {
    loadDrawing: (id) => electron_1.ipcRenderer.invoke('load-drawing', id),
    saveDrawing: (id, elements, appState) => electron_1.ipcRenderer.invoke('save-drawing', id, { elements, appState }),
    updateDrawingName: (id, newName) => electron_1.ipcRenderer.invoke('update-drawing-name', id, newName),
    listenStatus: (id) => electron_1.ipcRenderer.invoke('listen-status', id),
    collaborate: (id, data) => electron_1.ipcRenderer.invoke('collaborate', id, data),
    finished: (id, data) => electron_1.ipcRenderer.invoke('finished', id, data),
    collaborateStatus: (id) => electron_1.ipcRenderer.invoke('collaborate-status', id),
    closeSignal: (id) => electron_1.ipcRenderer.invoke('close-signal', id),
    mermaidStatus: (id) => electron_1.ipcRenderer.invoke('mermaid-status', id),
    deleteListenState: (id) => electron_1.ipcRenderer.invoke('delete-listen-state', id),
    // Native file operations (bypass broken File System Access API)
    exportToFile: (options) => electron_1.ipcRenderer.invoke('export-to-file', options),
    openFileDialog: (options) => electron_1.ipcRenderer.invoke('open-file-dialog', options),
    // Screenshot capture for Claude
    captureScreenshot: (options) => electron_1.ipcRenderer.invoke('capture-screenshot', options),
    // Screenshot request polling (from MCP server)
    screenshotRequest: (drawingId) => electron_1.ipcRenderer.invoke('screenshot-request', drawingId),
    // Write screenshot result (for MCP server)
    screenshotResult: (drawingId, result) => electron_1.ipcRenderer.invoke('screenshot-result', drawingId, result),
});
console.log('✅ Preload script loaded - electronAPI exposed');
//# sourceMappingURL=preload.js.map