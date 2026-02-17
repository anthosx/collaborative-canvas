import type { DrawingStorage } from "../storage/index.js";
import { apiClient } from "../api/index.js";
import { randomUUID } from "crypto";

/**
 * Generate a short random ID similar to Excalidraw's format
 */
function generateElementId(): string {
  return randomUUID().replace(/-/g, '').slice(0, 21);
}

/**
 * Normalize a compact element by ensuring it has an ID and marking creator.
 * The Electron renderer's convertToExcalidrawElements will expand all other properties.
 *
 * Compact elements only need: type, x, y, and type-specific props (text, points, etc.)
 * Optional: width, height, strokeColor, backgroundColor, fontSize
 */
function normalizeCompactElement(el: any): any {
  return {
    ...el,
    id: el.id || generateElementId(),
    customData: {
      ...(el.customData || {}),
      createdBy: 'claude',
      createdAt: Date.now(),
    },
  };
}

/**
 * Add elements to a drawing using either direct element data or Mermaid syntax (OPT-IN).
 *
 * **DEFAULT BEHAVIOR**: Normal element-based drawing (existing functionality)
 * **COMPACT ELEMENTS**: Supports minimal element definitions - renderer will expand
 * **OPT-IN ONLY**: Mermaid syntax support when explicitly requested
 *
 * Compact element format (renderer expands via convertToExcalidrawElements):
 * - Required: type, x, y
 * - Optional: width, height, text, points, strokeColor, backgroundColor, fontSize
 * - Auto-generated: id (if not provided), customData.createdBy, customData.createdAt
 *
 * Mermaid support limitations:
 * - Only flowcharts and sequence diagrams are fully supported
 * - Other diagram types may render as images in Excalidraw
 */
export async function handleAddToCanvas(
  storage: DrawingStorage,
  args: {
    drawingId: string;
    elements?: any[];
    mermaid?: string;
    replace?: boolean;
  },
  updateLastAccessedCallback?: () => void
) {
  const { drawingId, elements, mermaid, replace = false } = args;

  // Update last accessed timestamp
  if (updateLastAccessedCallback) {
    updateLastAccessedCallback();
  }

  // Verify drawing exists
  const existing = await storage.getDrawing(drawingId);
  if (!existing) {
    throw new Error(`Drawing ${drawingId} not found`);
  }

  // Validate: either elements OR mermaid, not both
  if (elements && mermaid) {
    throw new Error("Cannot specify both 'elements' and 'mermaid'. Use one or the other.");
  }

  if (!elements && !mermaid) {
    throw new Error("Must specify either 'elements' (default) or 'mermaid' (opt-in) parameter.");
  }

  // MERMAID PATH (OPT-IN ONLY)
  if (mermaid) {
    console.log(`🧜‍♀️ Mermaid conversion requested for drawing: ${drawingId}`);
    console.log(`   Definition length: ${mermaid.length} chars`);

    try {
      // Send Mermaid definition to Express API for widget conversion
      const response = await fetch(`http://localhost:3721/api/drawings/${drawingId}/mermaid`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mermaidDefinition: mermaid }),
      });

      if (!response.ok) {
        const errorData = await response.json() as { error?: string };
        throw new Error(errorData.error || 'Failed to send Mermaid definition to widget');
      }

      const sessionReminder = `\n\n📍 **Active Drawing**: ${existing.name} (ID: \`${drawingId}\`)`;

      return {
        content: [
          {
            type: "text",
            text: `Mermaid diagram queued for conversion\n\n` +
              `Drawing: **${existing.name}**\n` +
              `ID: ${drawingId}\n` +
              `Status: Widget will convert and add elements automatically\n\n` +
              `⚠️  **Limitations**: Only flowcharts and sequence diagrams are fully supported.\n` +
              `Other diagram types may render as images.\n\n` +
              `The widget is polling and will convert your Mermaid syntax within 2 seconds.${sessionReminder}`,
          },
        ],
      };
    } catch (error: unknown) {
      throw new Error(`Mermaid conversion failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  // DEFAULT PATH: DIRECT ELEMENTS (Normal behavior)
  if (elements) {
    // Normalize compact elements: add IDs and createdBy metadata
    // The Electron renderer's convertToExcalidrawElements will expand to full format
    const normalizedElements = elements.map(normalizeCompactElement);

    // Update storage
    const storageUpdates: any = {};

    if (replace) {
      storageUpdates.elements = normalizedElements;
    } else {
      // Append to existing elements
      storageUpdates.elements = [...existing.elements, ...normalizedElements];
    }

    await storage.updateDrawing(drawingId, storageUpdates);

    // Send to widget for real-time visual update (if widget is open)
    try {
      await apiClient.updateElements(drawingId, {
        elements: normalizedElements,
        replace: replace,
      });
    } catch (error) {
      // Widget not open or not responding - that's okay, storage was updated
      console.log(`Note: Widget update failed (widget may not be open): ${error instanceof Error ? error.message : String(error)}`);
    }

    const updated = await storage.getDrawing(drawingId);

    const sessionReminder = `\n\n📍 **Active Drawing**: ${updated!.name} (ID: \`${drawingId}\`)`;

    return {
      content: [
        {
          type: "text",
          text: `Added elements to drawing: **${updated!.name}**\n\n` +
            `ID: ${drawingId}\n` +
            `Elements added: ${elements.length}\n` +
            `Total elements: ${updated!.elementCount}\n` +
            `Last modified: ${new Date(updated!.modified).toLocaleString()}\n\n` +
            `✨ Elements added to widget in real-time!${sessionReminder}`,
        },
      ],
    };
  }

  // Should never reach here due to validation above
  throw new Error("Invalid state - no elements or mermaid provided");
}
