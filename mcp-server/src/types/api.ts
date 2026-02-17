/**
 * API request/response type definitions for widget communication
 */

import type { ExcalidrawElement, AppState, BinaryFiles } from "./drawing.js";

export interface OpenDrawingRequest {
  drawingId: string;
  width?: number;
  height?: number;
}

export interface OpenDrawingResponse {
  drawingId: string;
  status: "open";
  windowId?: number;
  url?: string;
}

export interface CloseDrawingRequest {
  drawingId: string;
}

export interface CloseDrawingResponse {
  status: "closed";
}

export interface GetDrawingStateResponse {
  elements: ExcalidrawElement[];
  appState: AppState;
  files: BinaryFiles;
}

export interface UpdateElementsRequest {
  elements: ExcalidrawElement[];
  appState?: AppState;
  replace: boolean;
}

export interface UpdateElementsResponse {
  status: "updated";
}

export interface SaveDrawingRequest {
  drawingId: string;
  state: GetDrawingStateResponse;
}

export interface SaveDrawingResponse {
  status: "saved";
  path: string;
}

export interface ExportDrawingRequest {
  format: "png" | "jpeg" | "svg" | "pdf" | "excalidraw";
  quality?: number;
  scale?: number;
  exportBackground?: boolean;
  darkMode?: boolean;
}

export interface ExportDrawingResponse {
  data: string | Buffer;
  format: string;
}
