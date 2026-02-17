import type { DrawingStorage } from "../storage/index.js";
import fs from "fs/promises";
import path from "path";
import os from "os";

const LISTEN_TIMEOUT_MS = 30 * 60 * 1000; // 30 minutes to match hook timeout

/**
 * Listen for user to click Collaborate or Finish button
 * Triggers PostToolUse hook that polls for collaboration requests
 */
export async function handleListen(
  storage: DrawingStorage,
  args: {
    drawingId: string;
  },
  updateLastAccessedCallback?: () => void
) {
  const { drawingId } = args;

  // Update last accessed timestamp
  if (updateLastAccessedCallback) {
    updateLastAccessedCallback();
  }

  // Verify drawing exists
  const drawing = await storage.getDrawing(drawingId);
  if (!drawing) {
    throw new Error(`Drawing ${drawingId} not found`);
  }

  // Create per-drawing listen state file for widget to detect (XDG-compliant)
  const xdgDataHome = process.env.XDG_DATA_HOME || path.join(os.homedir(), ".local", "share");
  const storageDir = path.join(xdgDataHome, "collaborative-canvas");
  const listenStatePath = path.join(storageDir, `listen-state-${drawingId}.json`);

  const listenState = {
    drawingId,
    isListening: true,
    startTime: Date.now(),
    expiresAt: Date.now() + LISTEN_TIMEOUT_MS,
  };

  try {
    await fs.writeFile(listenStatePath, JSON.stringify(listenState, null, 2), "utf-8");
    console.log(`✅ Listen state created for ${drawingId}: expires in ${LISTEN_TIMEOUT_MS / 1000}s`);
  } catch (error) {
    console.error("Failed to create listen state:", error);
    // Non-fatal - continue anyway
  }

  const sessionReminder = `\n\n📍 **Active Drawing**: ${drawing.name} (ID: \`${drawingId}\`)`;

  return {
    content: [
      {
        type: "text",
        text: `👂 Listening for collaboration on "${drawing.name}"...\n\n` +
          `Waiting for user to:\n` +
          `- Click "Collaborate" for your feedback/additions\n` +
          `- Click "Finish" when done\n\n` +
          `Buttons are now active in the widget for ${LISTEN_TIMEOUT_MS / 60000} minutes.\n` +
          `Press Ctrl-C to cancel listening.${sessionReminder}`,
      },
    ],
  };
}
