import type { DrawingStorage } from './storage/DrawingStorage.js';
/**
 * Register all IPC handlers for drawing operations
 * This replaces the HTTP API from the web-app version
 */
export declare function registerIpcHandlers(storage: DrawingStorage): void;
/**
 * Set close signal for a drawing (called by MCP server via close_widget tool)
 */
export declare function setCloseSignal(drawingId: string): void;
/**
 * Add Mermaid conversion request (called by MCP server via save_drawing tool)
 */
export declare function addMermaidConversion(drawingId: string, definition: string): void;
//# sourceMappingURL=ipc-handlers.d.ts.map