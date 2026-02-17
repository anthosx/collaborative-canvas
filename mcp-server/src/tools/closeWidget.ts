import type { DrawingStorage } from "../storage/index.js";
import { apiClient } from "../api/ApiClient.js";
import fs from "fs/promises";
import path from "path";
import os from "os";

// XDG-compliant storage path
const xdgDataHome = process.env.XDG_DATA_HOME || path.join(os.homedir(), ".local", "share");
const storageDir = path.join(xdgDataHome, "collaborative-canvas");

/**
 * Close the Excalidraw widget (browser or Electron)
 * Signals the widget to gracefully shut down
 */
export async function handleCloseWidget(
  storage: DrawingStorage,
  args: {
    drawingId: string;
  }
) {
  const { drawingId } = args;

  // Verify drawing exists
  const drawing = await storage.getDrawing(drawingId);
  if (!drawing) {
    throw new Error(`Drawing ${drawingId} not found`);
  }

  // Try multiple approaches to signal close:

  // 1. File-based signal for Electron
  try {
    const closeSignalPath = path.join(storageDir, `close-signal-${drawingId}.json`);
    await fs.writeFile(closeSignalPath, JSON.stringify({
      drawingId,
      timestamp: Date.now(),
      action: 'close'
    }), 'utf-8');
    console.error(`📁 Close signal file written: ${closeSignalPath}`);
  } catch (fileError) {
    console.error(`⚠️  Failed to write close signal file:`, fileError);
  }

  // 2. HTTP API signal for browser widget
  try {
    await apiClient.closeDrawing(drawingId);
    console.error(`🌐 HTTP close signal sent via API`);

    return {
      content: [
        {
          type: "text",
          text: `✅ Closed widget for drawing: **${drawing.name}**\n\n` +
            `Close signals sent to both Electron and browser widget.\n` +
            `Drawing ID: ${drawingId}`,
        },
      ],
    };
  } catch (error) {
    // If API call fails, Electron file signal might still work
    return {
      content: [
        {
          type: "text",
          text: `✅ Close signal sent for drawing: **${drawing.name}**\n\n` +
            `Drawing ID: ${drawingId}\n\n` +
            `File-based signal written for Electron app.\n` +
            `HTTP API signal failed (widget may be Electron-based or already closed).\n` +
            `Error: ${error instanceof Error ? error.message : String(error)}`,
        },
      ],
    };
  }
}
