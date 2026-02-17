import { app, Menu, session } from 'electron';
import path from 'path';
import { fileURLToPath } from 'url';
import { WindowManager } from './WindowManager.js';
import { registerIpcHandlers } from './ipc-handlers.js';
import { createApplicationMenu } from './menu.js';
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
// Import DrawingStorage from local bundled copy
import { DrawingStorage } from './storage/DrawingStorage.js';
// Set application name BEFORE app.whenReady()
app.setName('Collaborative Canvas');
// Storage instance (shared with MCP server via file system)
const storage = new DrawingStorage();
// Window manager
const windowManager = new WindowManager();
/**
 * Main Electron application entry point
 */
async function main() {
    console.log('🎨 Collaborative Canvas');
    console.log('=======================');
    // Initialize storage
    await storage.initialize();
    console.log('✅ Storage initialized');
    // Register IPC handlers
    registerIpcHandlers(storage);
    // Handle app ready
    app.whenReady().then(() => {
        console.log('✅ Electron app ready');
        // Enable File System Access API permissions
        // This allows Excalidraw's native save/export features to work
        session.defaultSession.setPermissionRequestHandler((webContents, permission, callback) => {
            // Allow file system access for save/export functionality
            // Note: 'fileSystem' is a valid permission but not in older TypeScript types
            const permStr = permission;
            if (permStr === 'fileSystem' || permStr === 'file-system') {
                console.log('✅ Granting fileSystem permission for save/export');
                callback(true);
                return;
            }
            // Allow clipboard access
            if (permission === 'clipboard-read' || permission === 'clipboard-sanitized-write') {
                callback(true);
                return;
            }
            // Log unknown permissions for debugging
            console.log(`⚠️ Permission requested: ${permission}`);
            // Allow most permissions for better compatibility
            callback(true);
        });
        // Also handle permission check requests
        session.defaultSession.setPermissionCheckHandler((webContents, permission) => {
            // Allow file system and clipboard operations
            const permStr = permission;
            if (permStr === 'fileSystem' || permStr === 'file-system' ||
                permission === 'clipboard-read' || permission === 'clipboard-sanitized-write') {
                return true;
            }
            // Allow most permissions by default
            return true;
        });
        console.log('✅ File System Access API permissions enabled');
        // Set custom application menu (removes "Electron" references)
        const menu = createApplicationMenu();
        Menu.setApplicationMenu(menu);
        // Set dock icon (macOS)
        if (process.platform === 'darwin' && app.dock) {
            // In packaged app, icon is in Resources folder via extraResources
            // In dev mode, icon is in build/ relative to project root
            const iconPath = app.isPackaged
                ? path.join(process.resourcesPath, 'icon.png')
                : path.resolve(__dirname, '../../../build/icon.png');
            try {
                app.dock.setIcon(iconPath);
                console.log('✅ Dock icon set');
            }
            catch (err) {
                console.warn('⚠️ Could not set dock icon:', err);
            }
        }
        // Find drawing ID and parent MCP PID from command line arguments
        // Format: e4c <drawingId> [mcpPid]
        const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
        const testDrawingId = process.argv.find(arg => uuidRegex.test(arg));
        // Look for MCP PID (numeric argument after UUID)
        const pidRegex = /^\d+$/;
        const mcpPidArg = process.argv.find(arg => pidRegex.test(arg) && parseInt(arg) > 1000);
        const mcpPid = mcpPidArg ? parseInt(mcpPidArg, 10) : 0;
        console.log(`🔍 argv: ${process.argv.join(', ')}`);
        // Monitor parent MCP server - self-terminate if it dies
        // This prevents orphaned Electron windows when Claude session ends
        if (mcpPid > 0) {
            console.log(`👁️ Monitoring parent MCP server (PID: ${mcpPid})`);
            setInterval(() => {
                try {
                    process.kill(mcpPid, 0); // Signal 0 = check if process exists
                }
                catch {
                    console.log('🛑 Parent MCP server died, self-terminating...');
                    app.quit();
                }
            }, 5000); // Check every 5 seconds
        }
        else {
            console.log('⚠️ No MCP PID provided - window will not auto-close on session end');
        }
        if (testDrawingId) {
            console.log(`📖 Opening drawing: ${testDrawingId}`);
            storage.getDrawing(testDrawingId).then((drawing) => {
                if (drawing) {
                    windowManager.createWindow(testDrawingId, drawing.name);
                }
                else {
                    console.error(`❌ Drawing ${testDrawingId} not found`);
                    app.quit();
                }
            });
        }
        else {
            console.log('ℹ️  No drawing ID provided. Usage: npm start <drawingId>');
            app.quit();
        }
        // Note: We don't handle 'activate' since each Electron instance is a
        // single-drawing session that quits when the window closes
    });
    // Quit when all windows are closed
    // Note: Unlike typical macOS apps, we quit on all platforms since each
    // Electron instance is a single-drawing session launched by MCP server
    app.on('window-all-closed', () => {
        app.quit();
    });
    // Cleanup on quit
    app.on('before-quit', () => {
        windowManager.closeAll();
    });
}
// Start the application
main().catch(err => {
    console.error('❌ Fatal error:', err);
    app.quit();
});
//# sourceMappingURL=main.js.map