import type { DrawingStorage } from "../storage/index.js";
import { exec, spawn } from "child_process";
import { promisify } from "util";
import * as net from "net";
import * as path from "path";
import { fileURLToPath } from "url";

const execAsync = promisify(exec);

// Get the directory path for the current module
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Check if a port is in use
 */
async function isPortInUse(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.once('error', () => resolve(true));
    server.once('listening', () => {
      server.close();
      resolve(false);
    });
    server.listen(port);
  });
}

/**
 * Start the web app servers (Express API + Vite widget)
 */
async function startWebAppServers(): Promise<void> {
  // Use CANVAS_PLUGIN_ROOT if available (plugin mode), otherwise resolve relative to this file
  const pluginRoot = process.env.CANVAS_PLUGIN_ROOT || path.resolve(__dirname, '../../..');
  const webAppPath = path.join(pluginRoot, 'web-app');

  console.error('🚀 Starting web app servers...');

  // Start both servers using npm start (which runs both concurrently)
  const serverProcess = spawn('npm', ['start'], {
    cwd: webAppPath,
    detached: true,
    stdio: 'ignore',
  });

  serverProcess.unref(); // Allow parent to exit independently

  // Wait for servers to be ready (check both ports)
  let attempts = 0;
  const maxAttempts = 30; // 15 seconds max

  while (attempts < maxAttempts) {
    const apiReady = await isPortInUse(3721);
    const viteReady = await isPortInUse(5173) || await isPortInUse(5174); // Vite might use 5174 if 5173 is taken

    if (apiReady && viteReady) {
      console.error('✅ Web app servers ready!');
      return;
    }

    await new Promise(resolve => setTimeout(resolve, 500));
    attempts++;
  }

  console.error('⚠️  Servers started but may not be fully ready yet');
}

/**
 * Ensure web app servers are running (API + Vite)
 * Note: Does NOT start electron dev server - production mode uses pre-built files
 */
async function ensureServersRunning(): Promise<void> {
  const apiRunning = await isPortInUse(3721);
  const webViteRunning = await isPortInUse(5173);

  if (!apiRunning || !webViteRunning) {
    await startWebAppServers();
  } else {
    console.error('✅ Web app servers already running');
  }

  // Production mode: Electron loads from dist/renderer (no dev server needed)
  // Dev mode would use start:dev script which sets NODE_ENV=development
  console.error('✅ Electron production mode: using pre-built renderer');
}

/**
 * Build Electron main process if needed
 */
async function buildElectronMain(): Promise<void> {
  // Use CANVAS_PLUGIN_ROOT if available (plugin mode), otherwise resolve relative to this file
  const pluginRoot = process.env.CANVAS_PLUGIN_ROOT || path.resolve(__dirname, '../../..');
  const electronAppPath = path.join(pluginRoot, 'electron-app');

  console.error('🔨 Building Electron main process...');

  try {
    await execAsync('npm run build:main', { cwd: electronAppPath });
    console.error('✅ Electron main process built successfully');
  } catch (error) {
    console.error('⚠️ Failed to build Electron main process:', error);
    throw error;
  }
}

/**
 * Launch Electron app with drawing ID
 */
async function launchElectronApp(drawingId: string): Promise<void> {
  // Use CANVAS_PLUGIN_ROOT if available (plugin mode), otherwise resolve relative to this file
  const pluginRoot = process.env.CANVAS_PLUGIN_ROOT || path.resolve(__dirname, '../../..');
  const electronAppPath = path.join(pluginRoot, 'electron-app');
  const useDevMode = process.env.EXCALIDRAW_DEV === '1';
  const mcpPid = process.pid.toString(); // Pass MCP server PID for lifecycle management

  console.error(`🖥️  Launching Electron app for drawing ${drawingId}...`);
  console.error(`📂 Plugin root: ${pluginRoot}`);
  console.error(`🚀 Mode: ${useDevMode ? 'development' : 'production (packaged app)'}`);
  console.error(`🔗 MCP PID: ${mcpPid} (Electron will auto-close when this dies)`);

  if (useDevMode) {
    // Development mode: run electron . with NODE_ENV=development
    const electronMainPath = path.join(electronAppPath, 'dist/main/main/main.js');
    const fs = await import('fs/promises');
    try {
      await fs.access(electronMainPath);
    } catch {
      console.error('⚠️ Electron main not found, building...');
      await buildElectronMain();
    }

    const electronProcess = spawn('npm', ['run', 'start:dev', drawingId, mcpPid], {
      cwd: electronAppPath,
      detached: true,
      stdio: 'ignore',
    });
    electronProcess.unref();
  } else {
    // Production mode: launch packaged .app bundle (macOS)
    // This ensures proper app name in menu bar and dock
    const platform = process.platform;

    if (platform === 'darwin') {
      // macOS: use 'open' command with packaged app
      const appPath = path.join(electronAppPath, 'release/mac/Collaborative Canvas.app');
      const fs = await import('fs/promises');

      try {
        await fs.access(appPath);
      } catch {
        // Fallback to npm start if packaged app not found
        console.error('⚠️ Packaged app not found, falling back to npm start...');
        const electronProcess = spawn('npm', ['run', 'start', drawingId, mcpPid], {
          cwd: electronAppPath,
          detached: true,
          stdio: 'ignore',
        });
        electronProcess.unref();
        console.error('✅ Electron app launched (unpackaged)');
        return;
      }

      // Launch packaged app with drawing ID and MCP PID as arguments
      const electronProcess = spawn('open', ['-a', appPath, '--args', drawingId, mcpPid], {
        detached: true,
        stdio: 'ignore',
      });
      electronProcess.unref();
    } else {
      // Windows/Linux: fall back to npm start for now
      const electronProcess = spawn('npm', ['run', 'start', drawingId, mcpPid], {
        cwd: electronAppPath,
        detached: true,
        stdio: 'ignore',
      });
      electronProcess.unref();
    }
  }

  console.error('✅ Electron app launched');
}

/**
 * Create a new drawing or open an existing one
 * Launches Electron desktop app for visual editing
 */
export async function handleOpenCanvas(
  storage: DrawingStorage,
  args: {
    name?: string;
    drawingId?: string;
    width?: number;
    height?: number;
    launchExcalidraw?: boolean;
  },
  sessionCallback?: (drawingId: string, drawingName: string) => void
) {
  const { name, drawingId, launchExcalidraw = true } = args;

  let drawing;

  // Load existing drawing
  if (drawingId) {
    const existing = await storage.getDrawing(drawingId);
    if (!existing) {
      throw new Error(`Drawing ${drawingId} not found`);
    }
    drawing = existing;
  } else {
    // Create new drawing
    if (!name) {
      throw new Error("Either 'name' or 'drawingId' is required");
    }

    drawing = await storage.createDrawing({
      name,
      elements: [],
      appState: {
        viewBackgroundColor: "#ffffff",
      },
    });
  }

  // Update session tracking
  if (sessionCallback) {
    sessionCallback(drawing.id, drawing.name);
  }

  const sessionReminder = `\n\n📍 **Active Drawing**: ${drawing.name} (ID: \`${drawing.id}\`)`;

  // Launch Electron app if requested
  if (launchExcalidraw) {
    try {
      await launchElectronApp(drawing.id);

      return {
        content: [
          {
            type: "text",
            text: `${drawingId ? "Opened" : "Created"} drawing: **${drawing.name}**\n\n` +
              `ID: ${drawing.id}\n` +
              `Elements: ${drawing.elementCount}\n\n` +
              `✅ Electron app launched!\n\n` +
              `The Excalidraw editor should open in a native window.\n` +
              `Changes are auto-saved to the MCP server.${sessionReminder}`,
          },
        ],
      };
    } catch (error) {
      // Fallback to browser if Electron fails
      console.error('⚠️ Electron launch failed, falling back to browser...');

      // Start web app servers for browser mode (only if Electron failed)
      await ensureServersRunning();

      const widgetUrl = `http://localhost:5173?id=${drawing.id}`;

      try {
        const platform = process.platform;
        let openCommand: string;

        if (platform === "darwin") {
          openCommand = `open "${widgetUrl}"`;
        } else if (platform === "win32") {
          openCommand = `start "${widgetUrl}"`;
        } else {
          openCommand = `xdg-open "${widgetUrl}"`;
        }

        await execAsync(openCommand);

        return {
          content: [
            {
              type: "text",
              text: `${drawingId ? "Opened" : "Created"} drawing: **${drawing.name}**\n\n` +
                `ID: ${drawing.id}\n` +
                `Elements: ${drawing.elementCount}\n\n` +
                `⚠️ Electron failed, browser widget launched instead:\n${widgetUrl}\n\n` +
                `Changes are auto-saved to the MCP server.${sessionReminder}`,
            },
          ],
        };
      } catch (browserError) {
        return {
          content: [
            {
              type: "text",
              text: `${drawingId ? "Opened" : "Created"} drawing: **${drawing.name}**\n\n` +
                `ID: ${drawing.id}\n` +
                `Elements: ${drawing.elementCount}\n\n` +
                `⚠️ Could not launch Electron or browser. Please open manually:\n${widgetUrl}\n\n` +
                `Electron error: ${error instanceof Error ? error.message : String(error)}\n` +
                `Browser error: ${browserError instanceof Error ? browserError.message : String(browserError)}${sessionReminder}`,
            },
          ],
        };
      }
    }
  } else {
    // Don't launch, just return drawing info
    const widgetUrl = `http://localhost:5173?id=${drawing.id}`;
    return {
      content: [
        {
          type: "text",
          text: `${drawingId ? "Opened" : "Created"} drawing: **${drawing.name}**\n\n` +
          `ID: ${drawing.id}\n` +
          `Elements: ${drawing.elementCount}\n\n` +
          `Widget URL: ${widgetUrl}${sessionReminder}`,
        },
      ],
    };
  }
}
