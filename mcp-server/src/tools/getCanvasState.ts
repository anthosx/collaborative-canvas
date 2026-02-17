import type { DrawingStorage } from "../storage/index.js";

/**
 * Compact element format - strips redundant Excalidraw properties
 * while preserving all data needed for understanding and editing.
 *
 * Compression ratio: ~3-4x (600 chars → 150 chars per element)
 *
 * The Electron renderer uses convertToExcalidrawElements to expand
 * compact elements back to full format, so this is safe for storage.
 */
/**
 * Round to 5 decimal places - preserves sub-pixel precision while keeping JSON compact.
 * Using Math.round() caused element offset bugs when Claude read/modified drawings.
 */
function round5(n: number): number {
  return Number(n.toFixed(5));
}

function compactElement(el: any): any {
  const compact: any = {
    id: el.id,
    type: el.type,
    x: round5(el.x),
    y: round5(el.y),
    width: round5(el.width || 0),
    height: round5(el.height || 0),
  };

  // Text elements - include content and font size
  if (el.type === 'text') {
    if (el.text) compact.text = el.text;
    if (el.fontSize && el.fontSize !== 20) compact.fontSize = el.fontSize;
  }

  // Arrow/line elements - include points and bindings
  if (el.type === 'arrow' || el.type === 'line') {
    if (el.points) compact.points = el.points.map((p: number[]) => p.map(round5));
    if (el.startBinding) compact.startBinding = { elementId: el.startBinding.elementId };
    if (el.endBinding) compact.endBinding = { elementId: el.endBinding.elementId };
  }

  // Text container bindings (critical for proper positioning)
  if (el.containerId) {
    compact.containerId = el.containerId;
  }
  if (el.boundElements && el.boundElements.length > 0) {
    compact.boundElements = el.boundElements;
  }

  // Styling (only if non-default to save space)
  if (el.strokeColor && el.strokeColor !== '#1e1e1e') {
    compact.strokeColor = el.strokeColor;
  }
  if (el.backgroundColor && el.backgroundColor !== 'transparent') {
    compact.backgroundColor = el.backgroundColor;
  }

  // Creator tracking (essential for collaboration context)
  if (el.customData?.createdBy) {
    compact.createdBy = el.customData.createdBy;
  }

  return compact;
}

/**
 * Get current state of a drawing (elements and appState)
 * Useful for Claude to read and understand drawing contents
 *
 * Returns compact element format to fit large drawings within token limits.
 * For extreme cases (>1000 elements), uses spatial chunking with compact elements.
 */
export async function handleGetCanvasState(
  storage: DrawingStorage,
  args: {
    drawingId: string;
    includeMetadata?: boolean;
    chunk?: number; // 1-indexed chunk number for paginated access (optional)
  },
  updateLastAccessedCallback?: () => void
) {
  const { drawingId, includeMetadata = false, chunk } = args;

  // Update last accessed timestamp
  if (updateLastAccessedCallback) {
    updateLastAccessedCallback();
  }

  const drawing = await storage.getDrawing(drawingId);
  if (!drawing) {
    throw new Error(`Drawing ${drawingId} not found`);
  }

  // Compact all elements
  const compactElements = drawing.elements.map(compactElement);
  const compactJson = JSON.stringify(compactElements);
  const estimatedTokens = Math.ceil(compactJson.length / 4);

  console.error(`📊 Drawing: ${drawing.elementCount} elements, ${compactJson.length} chars compact (~${estimatedTokens} tokens)`);

  const TOKEN_LIMIT = 25000;
  const needsChunking = estimatedTokens > TOKEN_LIMIT;

  if (needsChunking) {
    console.error(`⚠️  Compact format exceeds ${TOKEN_LIMIT} tokens - using spatial chunking`);
    return handleChunkedDrawing(drawing, drawingId, compactElements, includeMetadata, estimatedTokens, TOKEN_LIMIT, chunk);
  }

  // Build response with compact elements
  const sessionReminder = `\n\n📍 **Active Drawing**: ${drawing.name} (ID: \`${drawingId}\`)`;

  // Separate by creator for summary
  const claudeElements = compactElements.filter((el: any) => el.createdBy === 'claude');
  const userElements = compactElements.filter((el: any) => el.createdBy !== 'claude');

  let response = `**Drawing: ${drawing.name}**\n\n`;
  response += `Total Elements: ${drawing.elementCount} (${userElements.length} user, ${claudeElements.length} Claude)\n`;
  response += `Format: Compact JSON (${compactJson.length} chars, ~${estimatedTokens} tokens)\n\n`;

  // Brief summary by type
  const typeCounts: Record<string, number> = {};
  compactElements.forEach((el: any) => {
    typeCounts[el.type] = (typeCounts[el.type] || 0) + 1;
  });
  response += `**Element Types:** ${Object.entries(typeCounts).map(([t, c]) => `${t}: ${c}`).join(', ')}\n`;

  if (includeMetadata) {
    response += `\n**Metadata:**\n`;
    response += `- Created: ${new Date(drawing.created).toLocaleString()}\n`;
    response += `- Modified: ${new Date(drawing.modified).toLocaleString()}\n`;
    response += `- Tags: ${drawing.tags.length > 0 ? drawing.tags.join(", ") : "none"}\n`;
  }

  response += sessionReminder;

  return {
    content: [
      {
        type: "text",
        text: response,
      },
      {
        type: "resource",
        resource: {
          uri: `drawing://${drawingId}/compact`,
          mimeType: "application/json",
          text: compactJson,
        },
      },
    ],
  };
}

/**
 * Handle large drawings using spatial partitioning with compact elements.
 * Divides drawing into spatial regions, each small enough to fit in one response.
 */
function handleChunkedDrawing(
  drawing: any,
  drawingId: string,
  compactElements: any[],
  includeMetadata: boolean,
  estimatedTokens: number,
  TOKEN_LIMIT: number,
  requestedChunk?: number
) {
  // Calculate how many chunks we need
  const chunkCount = Math.ceil(estimatedTokens / TOKEN_LIMIT);
  console.error(`📦 Dividing into ${chunkCount} spatial chunks`);

  // Calculate bounding box
  const bounds = {
    minX: Math.min(...compactElements.map((el) => el.x)),
    maxX: Math.max(...compactElements.map((el) => el.x + el.width)),
    minY: Math.min(...compactElements.map((el) => el.y)),
    maxY: Math.max(...compactElements.map((el) => el.y + el.height)),
  };

  const width = bounds.maxX - bounds.minX;
  const height = bounds.maxY - bounds.minY;

  // Determine grid layout
  let cols = 1, rows = 1;
  if (chunkCount === 2) { cols = 2; rows = 1; }
  else if (chunkCount === 3) { cols = 3; rows = 1; }
  else if (chunkCount === 4) { cols = 2; rows = 2; }
  else if (chunkCount <= 6) { cols = 3; rows = 2; }
  else if (chunkCount <= 9) { cols = 3; rows = 3; }
  else { cols = Math.ceil(Math.sqrt(chunkCount)); rows = Math.ceil(chunkCount / cols); }

  console.error(`📐 Grid layout: ${cols}x${rows}`);

  // Create spatial chunks
  const chunks: { region: any; elements: any[] }[] = [];
  const chunkWidth = width / cols;
  const chunkHeight = height / rows;

  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const regionMinX = bounds.minX + col * chunkWidth;
      const regionMaxX = regionMinX + chunkWidth;
      const regionMinY = bounds.minY + row * chunkHeight;
      const regionMaxY = regionMinY + chunkHeight;

      const regionElements = compactElements.filter((el) => {
        const elMinX = el.x;
        const elMaxX = el.x + el.width;
        const elMinY = el.y;
        const elMaxY = el.y + el.height;
        return elMinX < regionMaxX && elMaxX > regionMinX && elMinY < regionMaxY && elMaxY > regionMinY;
      });

      if (regionElements.length > 0) {
        chunks.push({
          region: { col: col + 1, row: row + 1, minX: Math.round(regionMinX), maxX: Math.round(regionMaxX), minY: Math.round(regionMinY), maxY: Math.round(regionMaxY) },
          elements: regionElements,
        });
      }
    }
  }

  const sessionReminder = `\n\n📍 **Active Drawing**: ${drawing.name} (ID: \`${drawingId}\`)`;

  // If specific chunk requested, return just that chunk
  if (requestedChunk !== undefined) {
    if (requestedChunk < 1 || requestedChunk > chunks.length) {
      throw new Error(`Invalid chunk number ${requestedChunk}. Drawing has ${chunks.length} chunks (1-${chunks.length}).`);
    }

    const selectedChunk = chunks[requestedChunk - 1]!;
    const chunkJson = JSON.stringify(selectedChunk.elements);

    return {
      content: [
        {
          type: "text",
          text: `**Drawing: ${drawing.name}** - Chunk ${requestedChunk}/${chunks.length}\n\n` +
            `Region: (${selectedChunk.region.minX}, ${selectedChunk.region.minY}) to (${selectedChunk.region.maxX}, ${selectedChunk.region.maxY})\n` +
            `Elements in chunk: ${selectedChunk.elements.length}\n` +
            `Total chunks: ${chunks.length}` +
            sessionReminder,
        },
        {
          type: "resource",
          resource: {
            uri: `drawing://${drawingId}/chunk-${requestedChunk}`,
            mimeType: "application/json",
            text: chunkJson,
          },
        },
      ],
    };
  }

  // No specific chunk - return index/summary with instructions
  let response = `**Drawing: ${drawing.name}** (LARGE - ${chunks.length} chunks)\n\n`;
  response += `⚠️  Drawing exceeds token limit (~${estimatedTokens} tokens). Divided into ${chunks.length} spatial chunks.\n\n`;
  response += `**Total Elements:** ${drawing.elementCount}\n`;
  response += `**Grid Layout:** ${cols}x${rows}\n`;
  response += `**Bounds:** (${Math.round(bounds.minX)}, ${Math.round(bounds.minY)}) to (${Math.round(bounds.maxX)}, ${Math.round(bounds.maxY)})\n\n`;

  response += `**Chunks:**\n`;
  chunks.forEach((chunk, i) => {
    const typeCounts: Record<string, number> = {};
    chunk.elements.forEach((el: any) => {
      typeCounts[el.type] = (typeCounts[el.type] || 0) + 1;
    });
    const typeStr = Object.entries(typeCounts).map(([t, c]) => `${c} ${t}`).join(', ');
    response += `  ${i + 1}. Region (${chunk.region.minX}, ${chunk.region.minY}) to (${chunk.region.maxX}, ${chunk.region.maxY}): ${chunk.elements.length} elements (${typeStr})\n`;
  });

  response += `\n**To view a specific chunk:** Call get_drawing_state with chunk=N (1-${chunks.length})\n`;

  if (includeMetadata) {
    response += `\n**Metadata:**\n`;
    response += `- Created: ${new Date(drawing.created).toLocaleString()}\n`;
    response += `- Modified: ${new Date(drawing.modified).toLocaleString()}\n`;
    response += `- Tags: ${drawing.tags.length > 0 ? drawing.tags.join(", ") : "none"}\n`;
  }

  response += sessionReminder;

  return {
    content: [
      {
        type: "text",
        text: response,
      },
    ],
  };
}
