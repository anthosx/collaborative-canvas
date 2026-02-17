import type { DrawingStorage } from "../storage/index.js";
import fs from "fs/promises";
import path from "path";
import os from "os";

const LISTEN_TIMEOUT_MS = 60 * 60 * 1000; // 60 minutes
const POLL_INTERVAL_MS = 3000; // 3 seconds

/**
 * Clear stale entries from hooks-queue.json before starting a new listen session.
 */
async function clearStaleHooksQueue(storageDir: string): Promise<void> {
  const queuePath = path.join(storageDir, "hooks-queue.json");
  try {
    const content = await fs.readFile(queuePath, "utf-8");
    const queue = JSON.parse(content);
    if (Array.isArray(queue) && queue.length > 0) {
      console.error(`🧹 Clearing ${queue.length} stale entry(ies) from hooks-queue.json`);
      await fs.writeFile(queuePath, "[]", "utf-8");
    }
  } catch {
    try {
      await fs.writeFile(queuePath, "[]", "utf-8");
    } catch {
      // Non-fatal
    }
  }
}

/**
 * Listen for user to click Collaborate or Finish button.
 *
 * This tool BLOCKS by polling hooks-queue.json until the Electron app
 * writes a collaborate or finished event. Claude cannot continue until
 * this tool returns — which is the desired behavior (the REPL is paused
 * while the user draws).
 */
export async function handleListen(
  storage: DrawingStorage,
  args: {
    drawingId: string;
  },
  updateLastAccessedCallback?: () => void
) {
  const { drawingId } = args;

  if (updateLastAccessedCallback) {
    updateLastAccessedCallback();
  }

  // Verify drawing exists
  const drawing = await storage.getDrawing(drawingId);
  if (!drawing) {
    throw new Error(`Drawing ${drawingId} not found`);
  }

  // Setup paths
  const xdgDataHome = process.env.XDG_DATA_HOME || path.join(os.homedir(), ".local", "share");
  const storageDir = path.join(xdgDataHome, "collaborative-canvas");
  const queuePath = path.join(storageDir, "hooks-queue.json");
  const listenStatePath = path.join(storageDir, `listen-state-${drawingId}.json`);

  // Clear stale queue entries before starting
  await clearStaleHooksQueue(storageDir);

  // Create listen-state file so Electron enables Collaborate/Finish buttons
  const listenState = {
    drawingId,
    isListening: true,
    startTime: Date.now(),
    expiresAt: Date.now() + LISTEN_TIMEOUT_MS,
  };

  try {
    await fs.writeFile(listenStatePath, JSON.stringify(listenState, null, 2), "utf-8");
  } catch (error) {
    console.error("Failed to create listen state:", error);
  }

  console.error(`👂 Listening for collaboration on "${drawing.name}" (${drawingId}) — polling for up to ${LISTEN_TIMEOUT_MS / 60000} minutes`);

  // Poll hooks-queue.json until we detect a collaborate/finish event
  const startTime = Date.now();

  while (Date.now() - startTime < LISTEN_TIMEOUT_MS) {
    try {
      const content = await fs.readFile(queuePath, "utf-8");
      const queue = JSON.parse(content);

      if (Array.isArray(queue)) {
        const matchIndex = queue.findIndex(
          (entry: { drawingId: string; type: string }) =>
            entry.drawingId === drawingId &&
            (entry.type === "collaborate" || entry.type === "finished")
        );

        if (matchIndex >= 0) {
          const entry = queue[matchIndex];

          // Consume the entry
          queue.splice(matchIndex, 1);
          await fs.writeFile(queuePath, JSON.stringify(queue), "utf-8");

          // Clean up listen-state
          await fs.unlink(listenStatePath).catch(() => {});

          const elapsed = ((Date.now() - startTime) / 1000).toFixed(0);
          console.error(`📬 Received "${entry.type}" after ${elapsed}s`);

          if (entry.type === "collaborate") {
            return {
              content: [
                {
                  type: "text",
                  text:
                    `🎨 **Collaboration requested!** The user clicked Collaborate on "${drawing.name}".\n\n` +
                    `Elements on canvas: ${entry.elementCount ?? "unknown"}\n\n` +
                    `**Next step**: Call \`get_canvas_state\` to review their work, then respond with feedback and/or additions via \`save_canvas\`.\n\n` +
                    `Drawing ID: \`${drawingId}\``,
                },
              ],
            };
          } else {
            return {
              content: [
                {
                  type: "text",
                  text:
                    `✅ **Session complete!** The user clicked Finish on "${drawing.name}".\n\n` +
                    `**Next step**: Call \`close_widget\` to close the canvas window, then acknowledge completion.\n\n` +
                    `Drawing ID: \`${drawingId}\``,
                },
              ],
            };
          }
        }
      }
    } catch {
      // Queue file missing or invalid — keep polling
    }

    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
  }

  // Timeout — clean up
  await fs.unlink(listenStatePath).catch(() => {});

  return {
    content: [
      {
        type: "text",
        text:
          `⏰ Listen timed out after ${LISTEN_TIMEOUT_MS / 60000} minutes on "${drawing.name}". ` +
          `The user did not click Collaborate or Finish.\n\n` +
          `Drawing ID: \`${drawingId}\``,
      },
    ],
  };
}
