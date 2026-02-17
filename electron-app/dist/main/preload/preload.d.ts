/**
 * Preload script - Security bridge between main and renderer processes
 * Exposes safe IPC methods to the renderer via window.electronAPI
 */
export interface ElectronAPI {
    loadDrawing: (id: string) => Promise<any>;
    saveDrawing: (id: string, elements: any[], appState: any) => Promise<void>;
    updateDrawingName: (id: string, newName: string) => Promise<{
        success: boolean;
    }>;
    listenStatus: (id: string) => Promise<{
        isListening: boolean;
        expiresAt?: number;
    }>;
    collaborate: (id: string, data: {
        elementCount: number;
        timestamp: number;
    }) => Promise<any>;
    finished: (id: string, data: {
        elementCount: number;
        timestamp: number;
    }) => Promise<any>;
    collaborateStatus: (id: string) => Promise<{
        status: string;
    }>;
    closeSignal: (id: string) => Promise<{
        shouldClose: boolean;
    }>;
    mermaidStatus: (id: string) => Promise<{
        hasPending: boolean;
        definition?: string;
    }>;
    deleteListenState: (id: string) => Promise<{
        success: boolean;
    }>;
    exportToFile: (options: {
        defaultName: string;
        content: string;
        fileType: 'excalidraw' | 'png' | 'svg' | 'json';
    }) => Promise<{
        success: boolean;
        filePath?: string;
        cancelled?: boolean;
    }>;
    openFileDialog: (options: {
        fileTypes: string[];
    }) => Promise<{
        success: boolean;
        filePath?: string;
        content?: string;
        cancelled?: boolean;
    }>;
    captureScreenshot: (options: {
        drawingId: string;
        saveToFile?: boolean;
    }) => Promise<{
        success: boolean;
        base64?: string;
        filePath?: string;
        width?: number;
        height?: number;
    }>;
    screenshotRequest: (drawingId: string) => Promise<{
        hasPending: boolean;
        saveToFile?: boolean;
    }>;
    screenshotResult: (drawingId: string, result: {
        success: boolean;
        base64?: string;
        filePath?: string;
        width?: number;
        height?: number;
        error?: string;
    }) => Promise<{
        success: boolean;
    }>;
}
//# sourceMappingURL=preload.d.ts.map