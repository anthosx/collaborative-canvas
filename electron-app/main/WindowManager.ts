import { BrowserWindow, app } from 'electron';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Manages Electron windows for drawings
 * Each drawing gets its own window
 */
export class WindowManager {
  private windows: Map<string, BrowserWindow> = new Map();

  /**
   * Create a new window for a drawing
   */
  createWindow(drawingId: string, drawingName: string = 'Untitled Drawing'): BrowserWindow {
    // Check if window already exists
    const existing = this.windows.get(drawingId);
    if (existing && !existing.isDestroyed()) {
      existing.focus();
      return existing;
    }

    // Determine if we're in development or production
    // For --dir builds, app.isPackaged is false, so also check if running from release folder
    const isInReleaseFolder = __dirname.includes('/release/') || __dirname.includes('\\release\\');
    const isDev = !app.isPackaged && !isInReleaseFolder && process.env.NODE_ENV === 'development';
    console.log(`📍 Mode detection: isPackaged=${app.isPackaged}, isInReleaseFolder=${isInReleaseFolder}, NODE_ENV=${process.env.NODE_ENV}, isDev=${isDev}`);

    // Create the browser window
    const window = new BrowserWindow({
      width: 1200,
      height: 800,
      title: drawingName,
      backgroundColor: '#121212', // Match dark mode background
      webPreferences: {
        // __dirname is dist/main/main, preload is at dist/main/preload
        preload: path.join(__dirname, '../preload/preload.js'),
        contextIsolation: true,
        nodeIntegration: false,
      },
      show: false, // Don't show until ready-to-show
    });

    // Load the renderer
    if (isDev) {
      // Development: load from electron-app Vite dev server (port 5174)
      window.loadURL(`http://localhost:5174?id=${drawingId}`);
      // window.webContents.openDevTools(); // Uncomment for debugging
    } else {
      // Production: load from built files
      // __dirname is dist/main/main, so go up to dist/ then into renderer/
      window.loadFile(path.join(__dirname, '../../renderer/index.html'), {
        query: { id: drawingId }
      });
    }

    // Show window when ready
    window.once('ready-to-show', () => {
      window.show();
    });

    // Intercept window close to check for unsaved changes
    window.on('close', (e) => {
      // Ask renderer if it's safe to close
      // If renderer has unsaved changes, it will show the custom dialog
      // and prevent the close by calling e.preventDefault() in its own handler

      // For now, we'll let the renderer handle it via its beforeunload handler
      // which will show the custom SaveConfirmDialog component

      // Note: In Electron, we could also use IPC to ask the renderer
      // about unsaved changes, but the current approach with the
      // SaveConfirmDialog component works well for now
    });

    // Clean up when window is closed
    window.on('closed', () => {
      this.windows.delete(drawingId);
    });

    this.windows.set(drawingId, window);
    return window;
  }

  /**
   * Get an existing window for a drawing
   */
  getWindow(drawingId: string): BrowserWindow | undefined {
    const window = this.windows.get(drawingId);
    if (window && !window.isDestroyed()) {
      return window;
    }
    return undefined;
  }

  /**
   * Close a window for a drawing
   */
  closeWindow(drawingId: string): void {
    const window = this.windows.get(drawingId);
    if (window && !window.isDestroyed()) {
      window.close();
    }
    this.windows.delete(drawingId);
  }

  /**
   * Close all windows
   */
  closeAll(): void {
    for (const window of this.windows.values()) {
      if (!window.isDestroyed()) {
        window.close();
      }
    }
    this.windows.clear();
  }

  /**
   * Get all open windows
   */
  getAllWindows(): BrowserWindow[] {
    return Array.from(this.windows.values()).filter(w => !w.isDestroyed());
  }
}
