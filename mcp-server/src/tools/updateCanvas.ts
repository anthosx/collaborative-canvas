import type { DrawingStorage } from "../storage/index.js";
import { apiClient } from "../api/index.js";

/**
 * Update drawing with elements, appState, or metadata
 * Phase 2: Supports real-time widget updates via HTTP
 * Phase 2.5: Will add Mermaid syntax support
 */
export async function handleUpdateCanvas(
  storage: DrawingStorage,
  args: {
    drawingId: string;
    elements?: any[];
    appState?: any;
    replace?: boolean;
    name?: string;
    tags?: string[];
  },
  updateLastAccessedCallback?: () => void
) {
  const { drawingId, elements, appState, replace = false, name, tags } = args;

  // Update last accessed timestamp
  if (updateLastAccessedCallback) {
    updateLastAccessedCallback();
  }

  // Verify drawing exists
  const existing = await storage.getDrawing(drawingId);
  if (!existing) {
    throw new Error(`Drawing ${drawingId} not found`);
  }

  // Track what we're updating
  const updateTypes: string[] = [];

  // Handle element/appState updates (with real-time widget communication)
  if (elements !== undefined || appState !== undefined) {
    // Update storage
    const storageUpdates: any = {};

    if (elements !== undefined) {
      if (replace) {
        storageUpdates.elements = elements;
      } else {
        // Append to existing elements
        storageUpdates.elements = [...existing.elements, ...elements];
      }
      updateTypes.push(`${elements.length} element(s) ${replace ? "replaced" : "added"}`);
    }

    if (appState !== undefined) {
      storageUpdates.appState = { ...existing.appState, ...appState };
      updateTypes.push("app state updated");
    }

    await storage.updateDrawing(drawingId, storageUpdates);

    // Send to widget for real-time visual update (if widget is open)
    try {
      await apiClient.updateElements(drawingId, {
        elements: elements,
        appState: appState,
        replace: replace,
      });
    } catch (error) {
      // Widget not open or not responding - that's okay, storage was updated
      console.log(`Note: Widget update failed (widget may not be open): ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  // Handle metadata updates
  if (name !== undefined || tags !== undefined) {
    const metadataUpdates: any = {};
    if (name !== undefined) {
      metadataUpdates.name = name;
      updateTypes.push("name updated");
    }
    if (tags !== undefined) {
      metadataUpdates.tags = tags;
      updateTypes.push("tags updated");
    }

    await storage.updateDrawing(drawingId, metadataUpdates);
  }

  // Validate that something was updated
  if (updateTypes.length === 0) {
    throw new Error("No updates provided. Specify elements, appState, name, or tags to update.");
  }

  const updated = await storage.getDrawing(drawingId);

  const sessionReminder = `\n\n📍 **Active Drawing**: ${updated!.name} (ID: \`${drawingId}\`)`;

  return {
    content: [
      {
        type: "text",
        text: `Updated drawing: **${updated!.name}**\n\n` +
          `ID: ${drawingId}\n` +
          `Updates: ${updateTypes.join(", ")}\n` +
          `Total elements: ${updated!.elementCount}\n` +
          `Tags: ${updated!.tags.length > 0 ? updated!.tags.join(", ") : "none"}\n` +
          `Last modified: ${new Date(updated!.modified).toLocaleString()}\n\n` +
          (elements ? "✨ Elements added to widget in real-time!" : "") +
          sessionReminder,
      },
    ],
  };
}
