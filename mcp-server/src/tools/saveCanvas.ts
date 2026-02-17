import type { DrawingStorage } from "../storage/index.js";
import type { ExcalidrawElement, AppState } from "../types/index.js";
import { randomUUID } from "crypto";

/**
 * Generate a short random ID similar to Excalidraw's format
 */
function generateElementId(): string {
  return randomUUID().replace(/-/g, '').slice(0, 21);
}

/**
 * Ensure element has an ID (required for Excalidraw)
 */
function ensureElementId(el: any): any {
  if (el.id) return el;
  return { ...el, id: generateElementId() };
}

/**
 * Save drawing with updated elements and state
 * Updates the drawing file with new elements/appState
 */
export async function handleSaveCanvas(
  storage: DrawingStorage,
  args: {
    drawingId: string;
    elements?: ExcalidrawElement[];
    appState?: Partial<AppState>;
    name?: string;
    tags?: string[];
  },
  updateLastAccessedCallback?: () => void
) {
  const { drawingId, elements, appState, name, tags } = args;

  // Update last accessed timestamp
  if (updateLastAccessedCallback) {
    updateLastAccessedCallback();
  }

  // Verify drawing exists
  const existing = await storage.getDrawing(drawingId);
  if (!existing) {
    throw new Error(`Drawing ${drawingId} not found`);
  }

  // Update drawing
  const updates: any = {};

  // If elements are being updated, MERGE with existing (don't replace)
  if (elements !== undefined) {
    // CRITICAL: Ensure all elements have IDs before processing
    // This prevents Excalidraw crashes from elements without IDs
    const normalizedElements = elements.map(ensureElementId);

    const existingElementIds = new Set(existing.elements.map(el => el.id));
    const newElementIds = new Set(normalizedElements.map(el => el.id));

    // Mark new elements from Claude
    const markedNewElements = normalizedElements
      .filter(el => !existingElementIds.has(el.id)) // Only truly new elements
      .map(el => ({
        ...el,
        customData: {
          ...(el.customData || {}),
          createdBy: 'claude',
          createdAt: Date.now()
        }
      }));

    // Keep existing elements that weren't updated, plus merge in new ones
    // This PRESERVES user elements while ADDING Claude's new elements
    const mergedElements = [
      ...existing.elements.filter(el => !newElementIds.has(el.id)), // Keep existing not being replaced
      ...normalizedElements.filter(el => existingElementIds.has(el.id)), // Updated versions of existing
      ...markedNewElements // New elements from Claude
    ];

    updates.elements = mergedElements;

    // Track all Claude-created element IDs (existing + new)
    const existingClaudeIds = existing.claudeElementIds || [];
    const newClaudeIds = markedNewElements.map(el => el.id);
    updates.claudeElementIds = Array.from(new Set([...existingClaudeIds, ...newClaudeIds]));
  }

  if (appState !== undefined) updates.appState = { ...existing.appState, ...appState };
  if (name !== undefined) updates.name = name;
  if (tags !== undefined) updates.tags = tags;

  await storage.updateDrawing(drawingId, updates);

  const updated = await storage.getDrawing(drawingId);

  const sessionReminder = `\n\n📍 **Active Drawing**: ${updated!.name} (ID: \`${drawingId}\`)`;

  return {
    content: [
      {
        type: "text",
        text: `Saved drawing: **${updated!.name}**\n\nID: ${drawingId}\nElements: ${updated!.elementCount}\nLast modified: ${new Date(updated!.modified).toLocaleString()}${sessionReminder}`,
      },
    ],
  };
}
