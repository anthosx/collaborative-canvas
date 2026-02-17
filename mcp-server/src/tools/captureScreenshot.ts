import type { DrawingStorage } from '../storage/DrawingStorage.js';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';

// XDG-compliant storage path
const xdgDataHome = process.env.XDG_DATA_HOME || path.join(os.homedir(), ".local", "share");
const storageDir = path.join(xdgDataHome, "collaborative-canvas");
const POLL_INTERVAL = 500; // 500ms
const TIMEOUT = 15000; // 15 seconds

/**
 * Capture a screenshot of the currently open canvas.
 *
 * This tool signals the Electron app to capture its window and save the image.
 * The screenshot is saved to ~/.local/share/collaborative-canvas/screenshots/ and the path is returned.
 *
 * Requires an active canvas to be open in the Electron app.
 */
export async function handleCaptureScreenshot(
  drawingId: string,
  options: { saveToFile?: boolean },
  _storage: DrawingStorage
): Promise<{
  content: Array<{ type: 'text'; text: string } | { type: 'image'; data: string; mimeType: string }>;
  isError?: boolean;
}> {
  const saveToFile = options.saveToFile ?? true;

  // Write screenshot request file for Electron to pick up
  const requestPath = path.join(storageDir, `screenshot-request-${drawingId}.json`);
  const resultPath = path.join(storageDir, `screenshot-result-${drawingId}.json`);

  // Clean up any stale result file
  try {
    await fs.unlink(resultPath);
  } catch {
    // File doesn't exist, that's fine
  }

  // Write the request
  await fs.writeFile(requestPath, JSON.stringify({
    drawingId,
    saveToFile,
    timestamp: Date.now()
  }), 'utf8');

  console.log(`📸 Screenshot request written for drawing: ${drawingId}`);

  // Poll for result
  const startTime = Date.now();
  while (Date.now() - startTime < TIMEOUT) {
    try {
      const content = await fs.readFile(resultPath, 'utf8');
      const result = JSON.parse(content);

      // Clean up result file
      await fs.unlink(resultPath);

      if (!result.success) {
        return {
          content: [{
            type: 'text',
            text: `Screenshot capture failed: ${result.error || 'Unknown error'}\n\nMake sure the Electron canvas window is open.`
          }],
          isError: true
        };
      }

      // Build response with image
      const responseContent: Array<{ type: 'text'; text: string } | { type: 'image'; data: string; mimeType: string }> = [];

      // Add text description
      let description = `Screenshot captured successfully!\n\n`;
      description += `**Dimensions**: ${result.width} x ${result.height} pixels\n`;
      if (result.filePath) {
        description += `**Saved to**: ${result.filePath}\n`;
      }

      responseContent.push({ type: 'text', text: description });

      // Add the actual image if base64 is available
      if (result.base64) {
        responseContent.push({
          type: 'image',
          data: result.base64,
          mimeType: 'image/png'
        });
      }

      return { content: responseContent };
    } catch {
      // Result not ready yet, wait and retry
      await new Promise(resolve => setTimeout(resolve, POLL_INTERVAL));
    }
  }

  // Timeout
  // Clean up request file if it still exists
  try {
    await fs.unlink(requestPath);
  } catch {
    // Ignore
  }

  return {
    content: [{
      type: 'text',
      text: `Screenshot capture timed out after ${TIMEOUT / 1000} seconds.\n\nMake sure:\n1. The Electron canvas window is open\n2. The drawing ID matches an active canvas\n\nDrawing ID: ${drawingId}`
    }],
    isError: true
  };
}
