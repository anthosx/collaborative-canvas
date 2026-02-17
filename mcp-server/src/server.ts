/**
 * MCP Server implementation for Excalidraw integration
 */

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  ListResourcesRequestSchema,
  ReadResourceRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { DrawingStorage } from "./storage/index.js";
import fs from "fs";
import path from "path";
import {
  handleListCanvases,
  handleOpenCanvas,
  handleCloseCanvas,
  handleSaveCanvas,
  handleGetCanvasState,
  handleUpdateCanvas,
  handleExportCanvas,
  handleDeleteCanvases,
  handleListen,
  handleCloseWidget,
  handleAddToCanvas,
} from "./tools/index.js";
import { handleCaptureScreenshot } from "./tools/captureScreenshot.js";
import { CollaborationManager } from "./collaboration/index.js";

export class ExcalidrawMCPServer {
  private server: Server;
  private storage: DrawingStorage;
  private collaborationManager: CollaborationManager;
  // Session tracking (in-memory, per-conversation instance)
  private activeDrawingId: string | null = null;
  private activeDrawingName: string | null = null;
  private lastAccessed: number = 0;

  constructor() {
    this.server = new Server(
      {
        name: "collaborative-canvas-server",
        version: "1.0.0",
      },
      {
        capabilities: {
          tools: {},
          resources: {},
        },
      }
    );

    this.storage = new DrawingStorage();
    this.collaborationManager = new CollaborationManager(this.server);
    this.setupHandlers();
  }

  /**
   * Setup MCP request handlers
   */
  private setupHandlers(): void {
    // List available tools
    this.server.setRequestHandler(ListToolsRequestSchema, async () => {
      return {
        tools: [
          {
            name: "open_canvas",
            description:
              "Open or create a canvas for drawing diagrams, sketches, flowcharts, visual content, and/or providing an alternative 'open canvas' format for Claude-user communication. Use when the user wants to draw, sketch, create a diagram, make a flowchart, visualize something, or collaborate visually.\n\n" +
              "⚠️ IMPORTANT: After opening a canvas, you MUST immediately call either:\n" +
              "- 'listen' if the user will draw/edit (recommended for new canvases)\n" +
              "- 'save_canvas' if you want to add elements yourself\n\n" +
              "Do not wait - choose one of these tools as your very next action.",
            inputSchema: {
              type: "object" as const,
              properties: {
                name: {
                  type: "string",
                  description: "Name for the new drawing (optional)",
                },
                drawingId: {
                  type: "string",
                  description: "ID of existing drawing to open (optional)",
                },
                width: {
                  type: "number",
                  description: "Window width in pixels (default: 1200)",
                },
                height: {
                  type: "number",
                  description: "Window height in pixels (default: 800)",
                },
                launchExcalidraw: {
                  type: "boolean",
                  description: "Whether to automatically launch Excalidraw desktop app (default: true)",
                },
              },
            },
          },
          {
            name: "close_canvas",
            description:
              "Close the canvas widget when visual collaboration is complete. By default, current work is saved before closing - ensuring no drawings, diagrams, sketches, or flowcharts are lost. Useful when transitioning back to text-based conversation.",
            inputSchema: {
              type: "object" as const,
              properties: {
                drawingId: {
                  type: "string",
                  description: "ID of the canvas to close",
                },
                save: {
                  type: "boolean",
                  description: "Whether to save before closing (default: true)",
                },
              },
              required: ["drawingId"],
            },
          },
          {
            name: "list_canvases",
            description:
              "List all saved canvases, drawings, diagrams, sketches, and flowcharts. Search by name or tags to discover past visual work. The metadata includes creation date, last modified time, element count, and custom tags - enabling smart filtering like 'show me architecture diagrams from last week' or 'find canvases with API in the name'. Perfect for resuming previous drawings or understanding the user's visual history.",
            inputSchema: {
              type: "object" as const,
              properties: {
                search: {
                  type: "string",
                  description: "Search query to filter drawings by name or tags",
                },
                sortBy: {
                  type: "string",
                  enum: ["name", "created", "modified"],
                  description: "Sort order (default: modified)",
                },
                limit: {
                  type: "number",
                  description: "Maximum number of results (default: 50)",
                },
              },
            },
          },
          {
            name: "save_canvas",
            description:
              "Save elements to a canvas. Use to update drawings, diagrams, sketches, or flowcharts with new visual content. Updates the visual content (elements), canvas settings (appState), name, or tags.\n\n" +
              "⚠️ IMPORTANT: After saving elements to a canvas, you MUST immediately call 'listen' to allow the user to:\n" +
              "- Add their own elements to the drawing\n" +
              "- Click Collaborate for your feedback/additions\n" +
              "- Click Finish when done\n\n" +
              "Do not wait - call 'listen' as your very next action after save_canvas.",
            inputSchema: {
              type: "object" as const,
              properties: {
                drawingId: {
                  type: "string",
                  description: "ID of the drawing to save",
                },
                elements: {
                  type: "array",
                  description: "Updated array of Excalidraw elements (optional)",
                },
                appState: {
                  type: "object",
                  description: "Updated canvas state (optional)",
                },
                name: {
                  type: "string",
                  description: "New name for the drawing (optional)",
                },
                tags: {
                  type: "array",
                  description: "Updated tags array (optional)",
                },
              },
              required: ["drawingId"],
            },
          },
          {
            name: "get_canvas_state",
            description:
              "Get the current state of a canvas including all drawn elements, diagrams, sketches, and visual content. Returns a human-readable summary plus compact JSON data for all elements. For large canvases (>25k tokens), returns a spatial index with chunk numbers - use the 'chunk' parameter to retrieve specific regions.",
            inputSchema: {
              type: "object" as const,
              properties: {
                drawingId: {
                  type: "string",
                  description: "ID of the drawing to read",
                },
                includeMetadata: {
                  type: "boolean",
                  description: "Include creation/modification timestamps and tags (default: false)",
                },
                chunk: {
                  type: "number",
                  description: "For large drawings: 1-indexed chunk number to retrieve a specific spatial region",
                },
              },
              required: ["drawingId"],
            },
          },
          {
            name: "update_canvas",
            description:
              "Update canvas metadata such as name or tags. For changing the visual content (elements), use save_canvas instead. This tool is specifically for organizational updates - renaming a canvas, diagram, sketch, or flowchart for clarity, adding tags for better searchability, or updating categorization.",
            inputSchema: {
              type: "object" as const,
              properties: {
                drawingId: {
                  type: "string",
                  description: "ID of the drawing to update",
                },
                name: {
                  type: "string",
                  description: "New name for the drawing (optional)",
                },
                tags: {
                  type: "array",
                  description: "Updated tags array (optional)",
                },
              },
              required: ["drawingId"],
            },
          },
          {
            name: "export_canvas",
            description:
              "Export a canvas to various formats (PNG, SVG, PDF, JSON). Useful for sharing diagrams, sketches, flowcharts, or drawings outside of the canvas, embedding in documentation, or creating presentation-ready images. Note: Full export functionality coming in Phase 3 - currently placeholder.",
            inputSchema: {
              type: "object" as const,
              properties: {
                drawingId: {
                  type: "string",
                  description: "ID of the drawing to export",
                },
                format: {
                  type: "string",
                  enum: ["png", "svg", "pdf", "json"],
                  description: "Export format (default: png)",
                },
                outputPath: {
                  type: "string",
                  description: "Output file path (optional)",
                },
              },
              required: ["drawingId"],
            },
          },
          {
            name: "delete_canvases",
            description:
              "Delete canvases with two-step preview and confirmation. SAFETY: Defaults to preview mode (dryRun: true). Use relative dates like 'olderThanDays: 30' for natural cleanup. Step 1: Preview what will be deleted. Step 2: Confirm deletion with explicit canvas IDs. Cannot use date filters with confirmation (safety). Perfect for cleaning up old drawings, diagrams, sketches, flowcharts, or removing outdated visual work.",
            inputSchema: {
              type: "object" as const,
              properties: {
                olderThanDays: {
                  type: "number",
                  description: "Delete drawings older than N days (relative date filtering)",
                },
                search: {
                  type: "string",
                  description: "Additional filter by name or tags (combined with date filter)",
                },
                dryRun: {
                  type: "boolean",
                  description: "Preview mode - shows what would be deleted without deleting (default: true)",
                },
                drawingIds: {
                  type: "array",
                  description: "Explicit drawing IDs to delete (for confirmation step)",
                  items: {
                    type: "string",
                  },
                },
                confirm: {
                  type: "boolean",
                  description: "Actually delete (requires drawingIds, cannot use with date filters)",
                },
              },
            },
          },
          {
            name: "listen",
            description:
              "Wait for user to click Collaborate or Finish button in the canvas widget. Use this tool after opening a canvas to allow the user to draw, sketch, diagram, or visualize while Claude waits for their input. Triggers a polling hook that monitors for collaboration requests.\n\n" +
              "⚠️ IMPORTANT: This tool pauses the REPL for up to 5 minutes while polling. User can press Ctrl-C at any time to cancel and resume normal chat.\n\n" +
              "Button Actions:\n" +
              "- Collaborate: User wants your feedback/additions → respond with feedback AND/OR call save_canvas to add elements\n" +
              "- Finish: User is done → you should call close_widget and acknowledge completion/proceed with next steps\n\n" +
              "User Experience: REPL will appear frozen while this hook polls. This is expected - user should go to browser to draw. If user needs to chat via text instead, they can press Ctrl-C to cancel the polling.",
            inputSchema: {
              type: "object" as const,
              properties: {
                drawingId: {
                  type: "string",
                  description: "ID of the drawing to listen for collaboration on",
                },
              },
              required: ["drawingId"],
            },
          },
          {
            name: "add_to_canvas",
            description:
              "Add elements to an existing canvas. Draw shapes, text, arrows, diagrams, sketches, or flowchart components.\n\n" +
              "**DEFAULT BEHAVIOR**: Use the 'elements' parameter for normal element-based drawing. This is always the default unless Mermaid is explicitly requested.\n\n" +
              "**OPT-IN MERMAID**: Only use the 'mermaid' parameter when the user specifically requests a Mermaid diagram. Mermaid is NOT the go-to or default drawing mode.\n\n" +
              "⚠️ **Mermaid Limitations**: Only flowcharts and sequence diagrams are fully supported. Other diagram types may render as images.\n\n" +
              "**Examples**:\n" +
              "- Normal: { elements: [...] } - Always use this by default\n" +
              "- Mermaid (opt-in only): { mermaid: \"graph TD; A-->B\" } - Only when explicitly requested",
            inputSchema: {
              type: "object" as const,
              properties: {
                drawingId: {
                  type: "string",
                  description: "ID of the drawing to add elements to",
                },
                elements: {
                  type: "array",
                  description: "Array of Excalidraw elements to add (DEFAULT - use this unless Mermaid explicitly requested)",
                },
                mermaid: {
                  type: "string",
                  description: "Mermaid diagram definition (OPT-IN ONLY - only use when user explicitly requests Mermaid syntax)",
                },
                replace: {
                  type: "boolean",
                  description: "If true, replace all existing elements. If false (default), append to existing elements.",
                },
              },
              required: ["drawingId"],
            },
          },
          {
            name: "close_widget",
            description:
              "Close the Excalidraw browser widget. The widget will gracefully shut down. Call this when the user clicks 'Finish' or when the drawing session is complete.",
            inputSchema: {
              type: "object" as const,
              properties: {
                drawingId: {
                  type: "string",
                  description: "ID of the drawing whose widget to close",
                },
              },
              required: ["drawingId"],
            },
          },
          {
            name: "capture_screenshot",
            description:
              "Capture a screenshot of the currently open canvas window. Returns the image for visual analysis.\n\n" +
              "Use this tool when you need to:\n" +
              "- See what the user has drawn\n" +
              "- Verify your additions rendered correctly\n" +
              "- Debug layout or visual issues\n" +
              "- Get a visual reference of the current canvas state\n\n" +
              "The screenshot is captured from the Electron app window and saved to ~/.local/share/collaborative-canvas/screenshots/",
            inputSchema: {
              type: "object" as const,
              properties: {
                drawingId: {
                  type: "string",
                  description: "ID of the drawing to capture",
                },
                saveToFile: {
                  type: "boolean",
                  description: "Whether to save the screenshot to a file (default: true)",
                },
              },
              required: ["drawingId"],
            },
          },
        ],
      };
    });

    // List available resources
    this.server.setRequestHandler(ListResourcesRequestSchema, async () => {
      return {
        resources: [
          {
            uri: "drawing://list",
            name: "All Drawings",
            description: "List of all saved drawings with metadata",
            mimeType: "application/json",
          },
          {
            uri: "drawing://active",
            name: "Active Drawing Session",
            description: "Currently active drawing in this conversation (returns null if no drawing open)",
            mimeType: "application/json",
          },
        ],
      };
    });

    // Read resource
    this.server.setRequestHandler(
      ReadResourceRequestSchema,
      async (request) => {
        const uri = request.params.uri;

        if (uri === "drawing://list") {
          const drawings = await this.storage.listDrawings();
          return {
            contents: [
              {
                uri,
                mimeType: "application/json",
                text: JSON.stringify(drawings, null, 2),
              },
            ],
          };
        }

        if (uri === "drawing://active") {
          const activeDrawing = this.getActiveDrawing();
          return {
            contents: [
              {
                uri,
                mimeType: "application/json",
                text: JSON.stringify(activeDrawing, null, 2),
              },
            ],
          };
        }

        // Handle drawing://{id} pattern
        const drawingMatch = uri.match(/^drawing:\/\/([^/]+)$/);
        if (drawingMatch) {
          const id = drawingMatch[1];
          if (!id) {
            throw new Error("Drawing ID is required");
          }
          const drawing = await this.storage.getDrawing(id);
          if (!drawing) {
            throw new Error(`Drawing ${id} not found`);
          }
          return {
            contents: [
              {
                uri,
                mimeType: "application/vnd.excalidraw+json",
                text: JSON.stringify(drawing, null, 2),
              },
            ],
          };
        }

        // Handle drawing://{id}/metadata pattern
        const metadataMatch = uri.match(/^drawing:\/\/([^/]+)\/metadata$/);
        if (metadataMatch) {
          const id = metadataMatch[1];
          if (!id) {
            throw new Error("Drawing ID is required");
          }
          const drawing = await this.storage.getDrawing(id);
          if (!drawing) {
            throw new Error(`Drawing ${id} not found`);
          }
          const metadata = {
            id: drawing.id,
            name: drawing.name,
            created: drawing.created,
            modified: drawing.modified,
            tags: drawing.tags,
            elementCount: drawing.elementCount,
            thumbnail: drawing.thumbnail,
          };
          return {
            contents: [
              {
                uri,
                mimeType: "application/json",
                text: JSON.stringify(metadata, null, 2),
              },
            ],
          };
        }

        throw new Error(`Unknown resource: ${uri}`);
      }
    );

    // Handle tool calls
    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args = {} } = request.params;

      switch (name) {
        case "list_canvases":
          return await handleListCanvases(this.storage, args as any);
        case "open_canvas":
          return await handleOpenCanvas(
            this.storage,
            args as any,
            this.setActiveDrawing.bind(this)
          );
        case "close_canvas":
          return await handleCloseCanvas(
            this.storage,
            args as any,
            this.clearActiveDrawing.bind(this)
          );
        case "save_canvas":
          return await handleSaveCanvas(
            this.storage,
            args as any,
            this.updateLastAccessed.bind(this)
          );
        case "get_canvas_state":
          return await handleGetCanvasState(
            this.storage,
            args as any,
            this.updateLastAccessed.bind(this)
          );
        case "update_canvas":
          return await handleUpdateCanvas(
            this.storage,
            args as any,
            this.updateLastAccessed.bind(this)
          );
        case "export_canvas":
          return await handleExportCanvas(this.storage, args as any);
        case "delete_canvases":
          return await handleDeleteCanvases(this.storage, args as any);
        case "listen":
          return await handleListen(
            this.storage,
            args as any,
            this.updateLastAccessed.bind(this)
          );
        case "add_to_canvas":
          return await handleAddToCanvas(
            this.storage,
            args as any,
            this.updateLastAccessed.bind(this)
          );
        case "close_widget":
          return await handleCloseWidget(this.storage, args as any);
        case "capture_screenshot":
          return await handleCaptureScreenshot(
            (args as any).drawingId,
            { saveToFile: (args as any).saveToFile },
            this.storage
          );
        default:
          throw new Error(`Unknown tool: ${name}`);
      }
    });
  }

  /**
   * Handle collaboration requests using the CollaborationManager
   * Routes to appropriate strategy based on client environment
   * Max retries: 15 (then clear and reset)
   */
  private async handleCollaborationRequests(): Promise<void> {
    const MAX_RETRIES = 15;

    try {
      const requests = await this.storage.getCollaborationRequests();

      for (const request of requests) {
        const { drawingId, retryCount = 0, type } = request;

        // Check max retries reached
        if (retryCount >= MAX_RETRIES) {
          console.error(`⚠️  Max retries (${MAX_RETRIES}) reached for ${drawingId}, clearing request`);
          await this.storage.clearCollaborationRequest(drawingId);
          await this.storage.updateCollaborationStatus(drawingId, 'failed', retryCount);
          continue;
        }

        // Get drawing details
        const drawing = await this.storage.getDrawing(drawingId);

        if (!drawing) {
          console.error(`⚠️  Drawing ${drawingId} not found, clearing from queue`);
          await this.storage.clearCollaborationRequest(drawingId);
          await this.storage.updateCollaborationStatus(drawingId, 'failed', retryCount);
          continue;
        }

        // Use CollaborationManager to send notification
        try {
          await this.collaborationManager.notifyCollaboration(
            drawingId,
            drawing.name,
            drawing.elements.length,
            type
          );

          // Mark as completed and clear from queue
          await this.storage.clearCollaborationRequest(drawingId);
          await this.storage.updateCollaborationStatus(drawingId, 'completed', retryCount);
        } catch (error) {
          console.error(`❌ Collaboration notification failed for ${drawingId} (retry ${retryCount + 1}/${MAX_RETRIES}):`, error);

          // Increment retry count
          const newRetryCount = retryCount + 1;
          await this.storage.updateCollaborationStatus(drawingId, 'retry', newRetryCount);

          // Update retry count in queue (don't clear yet, will retry)
          await this.storage.incrementCollaborationRetry(drawingId);
        }
      }
    } catch (error) {
      console.error("Error handling collaboration requests:", error);
    }
  }

  /**
   * Initialize and start the server
   */
  async start(): Promise<void> {
    // Initialize storage
    await this.storage.initialize();

    // Initialize collaboration manager (detect client environment)
    await this.collaborationManager.initialize();

    // Setup file watcher for collaboration queue
    const queuePath = path.join(
      this.storage.getBaseDir(),
      "collaboration-queue.json"
    );

    // Watch for changes to the collaboration queue (new requests)
    fs.watch(queuePath, { persistent: false }, async (eventType) => {
      if (eventType === "change" || eventType === "rename") {
        console.error("📥 Collaboration queue changed, processing requests...");
        await this.handleCollaborationRequests();
      }
    });

    // Poll for pending retries every 2 seconds
    setInterval(async () => {
      await this.handleCollaborationRequests();
    }, 2000);

    console.error(`👀 Watching for collaboration requests at: ${queuePath}`);
    console.error(`⏱️  Polling for retries every 2 seconds`);

    // Connect to Claude Code via stdio
    const transport = new StdioServerTransport();
    await this.server.connect(transport);

    console.error("Excalidraw MCP Server running on stdio");
  }

  /**
   * Session Management Methods
   */

  /**
   * Set the active drawing for this conversation
   */
  setActiveDrawing(drawingId: string, drawingName: string): void {
    this.activeDrawingId = drawingId;
    this.activeDrawingName = drawingName;
    this.lastAccessed = Date.now();
    console.error(`📍 Active drawing set: ${drawingName} (ID: ${drawingId})`);
  }

  /**
   * Update last accessed timestamp
   */
  updateLastAccessed(): void {
    this.lastAccessed = Date.now();
  }

  /**
   * Get current active drawing info
   */
  getActiveDrawing(): { drawingId: string; drawingName: string; lastAccessed: number } | null {
    if (!this.activeDrawingId || !this.activeDrawingName) {
      return null;
    }
    return {
      drawingId: this.activeDrawingId,
      drawingName: this.activeDrawingName,
      lastAccessed: this.lastAccessed,
    };
  }

  /**
   * Clear active drawing (when closing)
   */
  clearActiveDrawing(): void {
    this.activeDrawingId = null;
    this.activeDrawingName = null;
    this.lastAccessed = 0;
    console.error(`📍 Active drawing cleared`);
  }

  /**
   * Get storage instance (for testing)
   */
  getStorage(): DrawingStorage {
    return this.storage;
  }
}
