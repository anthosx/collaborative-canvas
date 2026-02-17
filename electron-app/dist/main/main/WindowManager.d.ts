import { BrowserWindow } from 'electron';
/**
 * Manages Electron windows for drawings
 * Each drawing gets its own window
 */
export declare class WindowManager {
    private windows;
    /**
     * Create a new window for a drawing
     */
    createWindow(drawingId: string, drawingName?: string): BrowserWindow;
    /**
     * Get an existing window for a drawing
     */
    getWindow(drawingId: string): BrowserWindow | undefined;
    /**
     * Close a window for a drawing
     */
    closeWindow(drawingId: string): void;
    /**
     * Close all windows
     */
    closeAll(): void;
    /**
     * Get all open windows
     */
    getAllWindows(): BrowserWindow[];
}
//# sourceMappingURL=WindowManager.d.ts.map