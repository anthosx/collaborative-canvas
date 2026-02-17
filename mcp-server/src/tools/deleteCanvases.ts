import type { DrawingStorage } from "../storage/index.js";

/**
 * Delete drawings with two-step preview and confirmation
 *
 * Step 1: Preview mode (dryRun: true, default)
 * - Shows what would be deleted based on filters
 * - Returns list of drawings with IDs for confirmation
 *
 * Step 2: Confirmation mode (confirm: true)
 * - Requires explicit drawingIds array
 * - Actually deletes the specified drawings
 * - Cannot be used with date filters (safety)
 */
export async function handleDeleteCanvases(
  storage: DrawingStorage,
  args: {
    olderThanDays?: number;
    search?: string;
    dryRun?: boolean;
    drawingIds?: string[];
    confirm?: boolean;
  }
) {
  const {
    olderThanDays,
    search,
    drawingIds,
    confirm = false,
  } = args;

  // === CONFIRMATION MODE ===
  if (confirm) {
    // Safety: Must provide explicit drawing IDs
    if (!drawingIds || drawingIds.length === 0) {
      throw new Error(
        "Confirmation mode requires explicit 'drawingIds' array. " +
        "First run with dryRun: true to preview what will be deleted."
      );
    }

    // Safety: Cannot use date filters with confirm mode
    if (olderThanDays !== undefined || search !== undefined) {
      throw new Error(
        "Cannot use date filters (olderThanDays, search) with confirm: true. " +
        "Only 'drawingIds' array is allowed for safety. " +
        "First preview with dryRun: true to get the IDs."
      );
    }

    // Delete each drawing
    const deleted: Array<{ id: string; name: string }> = [];
    const errors: Array<{ id: string; error: string }> = [];

    for (const id of drawingIds) {
      try {
        // Get drawing name before deletion
        const drawing = await storage.getDrawing(id);
        const name = drawing ? drawing.name : `Unknown (${id})`;

        await storage.deleteDrawing(id);
        deleted.push({ id, name });
      } catch (error) {
        errors.push({
          id,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    // Build response
    let responseText = `✅ Deleted ${deleted.length} drawing${deleted.length === 1 ? "" : "s"}:\n\n`;

    if (deleted.length > 0) {
      responseText += deleted
        .map((d) => `• **${d.name}** (ID: ${d.id})`)
        .join("\n");
    }

    if (errors.length > 0) {
      responseText += `\n\n⚠️  Failed to delete ${errors.length} drawing${errors.length === 1 ? "" : "s"}:\n\n`;
      responseText += errors
        .map((e) => `• ID ${e.id}: ${e.error}`)
        .join("\n");
    }

    return {
      content: [
        {
          type: "text",
          text: responseText,
        },
      ],
    };
  }

  // === PREVIEW MODE (default) ===

  // Calculate date threshold if specified
  let beforeTimestamp: number | undefined;
  if (olderThanDays !== undefined) {
    if (olderThanDays < 0) {
      throw new Error("olderThanDays must be a positive number");
    }
    const daysInMs = olderThanDays * 24 * 60 * 60 * 1000;
    beforeTimestamp = Date.now() - daysInMs;
  }

  // Get all drawings
  let drawings = await storage.listDrawings({
    search,
    limit: 1000, // High limit to get all matching drawings
  });

  // Filter by date if specified
  if (beforeTimestamp !== undefined) {
    drawings = drawings.filter((d) => d.modified < beforeTimestamp);
  }

  // Build preview response
  if (drawings.length === 0) {
    return {
      content: [
        {
          type: "text",
          text:
            "No drawings match the specified criteria.\n\n" +
            (olderThanDays
              ? `Filter: older than ${olderThanDays} days\n`
              : "") +
            (search ? `Search: "${search}"\n` : ""),
        },
      ],
    };
  }

  // Format preview list
  const now = Date.now();
  const drawingList = drawings
    .map((d) => {
      const ageInDays = Math.floor((now - d.modified) / (1000 * 60 * 60 * 24));
      return (
        `• **${d.name}**\n` +
        `  ID: ${d.id}\n` +
        `  Created: ${new Date(d.created).toLocaleString()}\n` +
        `  Last modified: ${new Date(d.modified).toLocaleString()} (${ageInDays} days ago)\n` +
        `  Elements: ${d.elementCount}\n` +
        `  Tags: ${d.tags.length > 0 ? d.tags.join(", ") : "none"}`
      );
    })
    .join("\n\n");

  const responseText =
    `🔍 **Preview: Would delete ${drawings.length} drawing${drawings.length === 1 ? "" : "s"}**\n\n` +
    (olderThanDays ? `Filter: Older than ${olderThanDays} days\n` : "") +
    (search ? `Search: "${search}"\n` : "") +
    (beforeTimestamp
      ? `Cutoff date: ${new Date(beforeTimestamp).toLocaleString()}\n`
      : "") +
    `\n${drawingList}\n\n` +
    `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n` +
    `⚠️  **This is a preview only (dryRun: true)**\n\n` +
    `To actually delete these drawings, call:\n` +
    `\`\`\`\n` +
    `delete_drawings({\n` +
    `  drawingIds: [${drawings.map((d) => `"${d.id}"`).join(", ")}],\n` +
    `  confirm: true\n` +
    `})\n` +
    `\`\`\``;

  return {
    content: [
      {
        type: "text",
        text: responseText,
      },
    ],
  };
}
