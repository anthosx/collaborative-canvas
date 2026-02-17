/**
 * Drawing and metadata type definitions
 */

export interface Drawing {
  id: string;
  name: string;
  elements: ExcalidrawElement[];
  appState: AppState;
  files?: BinaryFiles;
  created: number;
  modified: number;
  tags: string[];
  elementCount: number;
  thumbnail?: string;
  claudeElementIds?: string[]; // Track IDs of elements created by Claude
}

export interface DrawingMetadata {
  id: string;
  name: string;
  created: number;
  modified: number;
  tags: string[];
  elementCount: number;
  thumbnail?: string;
  claudeElementIds?: string[]; // Track IDs of elements created by Claude
}

export interface ExcalidrawElement {
  id: string;
  type: string;
  x: number;
  y: number;
  width: number;
  height: number;
  angle: number;
  strokeColor: string;
  backgroundColor: string;
  fillStyle: string;
  strokeWidth: number;
  strokeStyle: string;
  roughness: number;
  opacity: number;
  groupIds: string[];
  frameId: string | null;
  roundness: { type: number; value?: number } | null;
  seed: number;
  version: number;
  versionNonce: number;
  isDeleted: boolean;
  boundElements: BoundElement[] | null;
  updated: number;
  link: string | null;
  locked: boolean;
  customData?: Record<string, any>; // Custom data including creator attribution
  // Type-specific properties
  text?: string;
  fontSize?: number;
  fontFamily?: number;
  textAlign?: string;
  verticalAlign?: string;
  containerId?: string | null;
  originalText?: string;
  lineHeight?: number;
  points?: number[][];
  lastCommittedPoint?: number[] | null;
  startBinding?: Binding | null;
  endBinding?: Binding | null;
  startArrowhead?: string | null;
  endArrowhead?: string | null;
}

export interface BoundElement {
  type: string;
  id: string;
}

export interface Binding {
  elementId: string;
  focus?: number;
  gap?: number;
}

export interface AppState {
  viewBackgroundColor?: string;
  gridSize?: number | null;
  [key: string]: any;
}

export interface BinaryFiles {
  [key: string]: BinaryFile;
}

export interface BinaryFile {
  mimeType: string;
  id: string;
  dataURL: string;
  created: number;
  lastRetrieved?: number;
}

export interface ListDrawingsOptions {
  search?: string;
  sortBy?: "name" | "created" | "modified";
  limit?: number;
}

export interface CreateDrawingData {
  name: string;
  elements: ExcalidrawElement[];
  appState: AppState;
  files?: BinaryFiles;
}

export interface CollaborationRequest {
  drawingId: string;
  elementCount: number;
  timestamp: number;
  retryCount: number;
  nextRetryAt?: number;
  status: 'pending' | 'processing' | 'retry' | 'completed' | 'failed';
  type?: 'collaborate' | 'finished'; // Type of collaboration request
}

export interface CollaborationStatus {
  drawingId: string;
  status: 'pending' | 'processing' | 'retry' | 'completed' | 'failed';
  retryCount: number;
  timestamp: number;
}
