import type { DrawingStorage } from "../storage/index.js";

/**
 * Close a drawing
 * Phase 2: Verifies drawing exists and provides closure confirmation
 * Note: Browser widget (browser tab) must be closed manually by user
 */
export async function handleCloseCanvas(
  storage: DrawingStorage,
  args: {
    drawingId: string;
    save?: boolean;
  },
  clearSessionCallback?: () => void
) {
  const { drawingId, save = true } = args;

  // Verify drawing exists
  const drawing = await storage.getDrawing(drawingId);
  if (!drawing) {
    throw new Error(`Drawing ${drawingId} not found`);
  }

  // Clear session tracking when closing
  if (clearSessionCallback) {
    clearSessionCallback();
  }

  // Get final element count
  const finalElementCount = drawing.elementCount;

  return {
    content: [
      {
        type: "text",
        text: `Closed drawing: **${drawing.name}**\n\n` +
          `ID: ${drawing.id}\n` +
          `Final element count: ${finalElementCount}\n` +
          `Last modified: ${new Date(drawing.modified).toLocaleString()}\n\n` +
          `${save ? "✅ All changes are auto-saved via the widget." : ""}\n\n` +
          `💡 You can manually close the browser tab with the Excalidraw widget.`,
      },
    ],
  };
}
