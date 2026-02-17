import type { ExcalidrawElement } from '@excalidraw/excalidraw/types/element/types';
import type { AppState } from '@excalidraw/excalidraw/types/types';

export interface Drawing {
  id: string;
  name: string;
  elements: ExcalidrawElement[];
  appState: Partial<AppState>;
  created: number;
  modified: number;
}

/**
 * Load a drawing using Electron IPC
 * Replaces HTTP fetch() with window.electronAPI
 */
export async function loadDrawing(id: string): Promise<Drawing> {
  return window.electronAPI.loadDrawing(id);
}

/**
 * Save a drawing using Electron IPC
 * Replaces HTTP POST with window.electronAPI
 */
export async function saveDrawing(
  id: string,
  elements: readonly ExcalidrawElement[],
  appState: Partial<AppState>
): Promise<void> {
  return window.electronAPI.saveDrawing(id, Array.from(elements), appState);
}

/**
 * Update elements (kept for compatibility, same as saveDrawing in Electron)
 */
export async function updateElements(
  id: string,
  elements: readonly ExcalidrawElement[]
): Promise<void> {
  // In Electron, we just save the elements with the existing appState
  // The App.tsx already has the appState, so this is mainly for compatibility
  return window.electronAPI.saveDrawing(id, Array.from(elements), {});
}
