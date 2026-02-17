import { contextBridge, ipcRenderer } from 'electron';

/**
 * Preload script - Security bridge between main and renderer processes
 * Exposes safe IPC methods to the renderer via window.electronAPI
 */

export interface ElectronAPI {
  loadDrawing: (id: string) => Promise<any>;
  saveDrawing: (id: string, elements: any[], appState: any) => Promise<void>;
  updateDrawingName: (id: string, newName: string) => Promise<{ success: boolean }>;
  listenStatus: (id: string) => Promise<{ isListening: boolean; expiresAt?: number }>;
  collaborate: (id: string, data: { elementCount: number; timestamp: number }) => Promise<any>;
  finished: (id: string, data: { elementCount: number; timestamp: number }) => Promise<any>;
  collaborateStatus: (id: string) => Promise<{ status: string }>;
  closeSignal: (id: string) => Promise<{ shouldClose: boolean }>;
  mermaidStatus: (id: string) => Promise<{ hasPending: boolean; definition?: string }>;
  deleteListenState: (id: string) => Promise<{ success: boolean }>;
  // Native file operations (bypass broken File System Access API)
  exportToFile: (options: {
    defaultName: string;
    content: string;
    fileType: 'excalidraw' | 'png' | 'svg' | 'json';
  }) => Promise<{ success: boolean; filePath?: string; cancelled?: boolean }>;
  openFileDialog: (options: {
    fileTypes: string[];
  }) => Promise<{ success: boolean; filePath?: string; content?: string; cancelled?: boolean }>;
  // Screenshot capture for Claude
  captureScreenshot: (options: {
    drawingId: string;
    saveToFile?: boolean;
  }) => Promise<{ success: boolean; base64?: string; filePath?: string; width?: number; height?: number }>;
  // Screenshot request polling (from MCP server)
  screenshotRequest: (drawingId: string) => Promise<{ hasPending: boolean; saveToFile?: boolean }>;
  // Write screenshot result (for MCP server)
  screenshotResult: (drawingId: string, result: {
    success: boolean;
    base64?: string;
    filePath?: string;
    width?: number;
    height?: number;
    error?: string;
  }) => Promise<{ success: boolean }>;
}

// Expose protected methods that allow the renderer process to use
// ipcRenderer without exposing the entire object
contextBridge.exposeInMainWorld('electronAPI', {
  loadDrawing: (id: string) => ipcRenderer.invoke('load-drawing', id),

  saveDrawing: (id: string, elements: any[], appState: any) =>
    ipcRenderer.invoke('save-drawing', id, { elements, appState }),

  updateDrawingName: (id: string, newName: string) =>
    ipcRenderer.invoke('update-drawing-name', id, newName),

  listenStatus: (id: string) =>
    ipcRenderer.invoke('listen-status', id),

  collaborate: (id: string, data: { elementCount: number; timestamp: number }) =>
    ipcRenderer.invoke('collaborate', id, data),

  finished: (id: string, data: { elementCount: number; timestamp: number }) =>
    ipcRenderer.invoke('finished', id, data),

  collaborateStatus: (id: string) =>
    ipcRenderer.invoke('collaborate-status', id),

  closeSignal: (id: string) =>
    ipcRenderer.invoke('close-signal', id),

  mermaidStatus: (id: string) =>
    ipcRenderer.invoke('mermaid-status', id),

  deleteListenState: (id: string) =>
    ipcRenderer.invoke('delete-listen-state', id),

  // Native file operations (bypass broken File System Access API)
  exportToFile: (options: {
    defaultName: string;
    content: string;
    fileType: 'excalidraw' | 'png' | 'svg' | 'json';
  }) => ipcRenderer.invoke('export-to-file', options),

  openFileDialog: (options: { fileTypes: string[] }) =>
    ipcRenderer.invoke('open-file-dialog', options),

  // Screenshot capture for Claude
  captureScreenshot: (options: { drawingId: string; saveToFile?: boolean }) =>
    ipcRenderer.invoke('capture-screenshot', options),

  // Screenshot request polling (from MCP server)
  screenshotRequest: (drawingId: string) =>
    ipcRenderer.invoke('screenshot-request', drawingId),

  // Write screenshot result (for MCP server)
  screenshotResult: (drawingId: string, result: {
    success: boolean;
    base64?: string;
    filePath?: string;
    width?: number;
    height?: number;
    error?: string;
  }) => ipcRenderer.invoke('screenshot-result', drawingId, result),
} as ElectronAPI);

console.log('✅ Preload script loaded - electronAPI exposed');
