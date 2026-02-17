import type { DrawingStorage } from "../storage/index.js";

/**
 * List all drawings with optional search and sorting
 */
export async function handleListCanvases(
  storage: DrawingStorage,
  args: {
    search?: string;
    sortBy?: "name" | "created" | "modified";
    limit?: number;
  }
) {
  const { search, sortBy = "modified", limit = 50 } = args;

  const drawings = await storage.listDrawings({
    search,
    sortBy,
    limit,
  });

  if (drawings.length === 0) {
    return {
      content: [
        {
          type: "text",
          text: search
            ? `No drawings found matching "${search}"`
            : "No drawings found. Create your first drawing with the open_drawing tool!",
        },
      ],
    };
  }

  const drawingList = drawings
    .map(
      (d) =>
        `• **${d.name}** (ID: ${d.id})\n  Created: ${new Date(d.created).toLocaleString()}\n  Modified: ${new Date(d.modified).toLocaleString()}\n  Elements: ${d.elementCount}\n  Tags: ${d.tags.length > 0 ? d.tags.join(", ") : "none"}`
    )
    .join("\n\n");

  return {
    content: [
      {
        type: "text",
        text: `Found ${drawings.length} drawing${drawings.length === 1 ? "" : "s"}:\n\n${drawingList}`,
      },
    ],
  };
}
