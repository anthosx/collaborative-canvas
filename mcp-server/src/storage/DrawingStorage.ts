/**
 * Drawing storage manager - handles CRUD operations for drawings
 */

import fs from "fs/promises";
import path from "path";
import os from "os";
import { v4 as uuidv4 } from "uuid";
import lockfile from "proper-lockfile";
import type {
  Drawing,
  DrawingMetadata,
  CreateDrawingData,
  ListDrawingsOptions,
  CollaborationRequest,
  CollaborationStatus,
} from "../types/index.js";

export class DrawingStorage {
  private baseDir: string;

  /** Validate drawing ID to prevent path traversal */
  private static readonly VALID_ID = /^[a-f0-9-]{36}$/;

  private validateId(id: string): void {
    if (!DrawingStorage.VALID_ID.test(id)) {
      throw new Error(`Invalid drawing ID: ${id}`);
    }
  }

  constructor() {
    // Platform-aware storage path
    if (process.platform === "win32") {
      // Windows: use LOCALAPPDATA (e.g. C:\Users\<user>\AppData\Local)
      const localAppData = process.env.LOCALAPPDATA
        || path.join(process.env.USERPROFILE || os.homedir(), "AppData", "Local");
      this.baseDir = path.join(localAppData, "collaborative-canvas");
    } else {
      // macOS / Linux / WSL: use XDG_DATA_HOME
      const xdgDataHome = process.env.XDG_DATA_HOME
        || path.join(os.homedir(), ".local", "share");
      this.baseDir = path.join(xdgDataHome, "collaborative-canvas");
    }
  }

  /**
   * Initialize storage directories
   */
  async initialize(): Promise<void> {
    await this.ensureDirectories();
  }

  /**
   * Create a new drawing
   */
  async createDrawing(data: CreateDrawingData): Promise<Drawing> {
    const id = uuidv4();
    const now = Date.now();

    const drawing: Drawing = {
      id,
      name: data.name,
      elements: data.elements,
      appState: data.appState,
      files: data.files || {},
      created: now,
      modified: now,
      tags: [],
      elementCount: data.elements.length,
    };

    await this.saveDrawing(drawing);
    await this.saveMetadata(drawing);

    return drawing;
  }

  /**
   * Get a drawing by ID
   */
  async getDrawing(id: string): Promise<Drawing | null> {
    this.validateId(id);
    const filePath = path.join(this.baseDir, "drawings", `${id}.excalidraw`);

    try {
      const content = await fs.readFile(filePath, "utf-8");
      const data = JSON.parse(content);

      // Also load metadata
      const metadata = await this.getMetadata(id);

      return {
        id,
        name: metadata?.name || "Untitled",
        elements: data.elements || [],
        appState: data.appState || {},
        files: data.files || {},
        created: metadata?.created || Date.now(),
        modified: metadata?.modified || Date.now(),
        tags: metadata?.tags || [],
        elementCount: metadata?.elementCount || 0,
        thumbnail: metadata?.thumbnail,
      };
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === "ENOENT") {
        return null;
      }
      throw err;
    }
  }

  /**
   * Update an existing drawing
   */
  async updateDrawing(
    id: string,
    updates: Partial<Drawing>
  ): Promise<void> {
    this.validateId(id);
    const current = await this.getDrawing(id);
    if (!current) {
      throw new Error(`Drawing ${id} not found`);
    }

    const updated: Drawing = {
      ...current,
      ...updates,
      id, // Ensure ID doesn't change
      modified: Date.now(),
      elementCount: updates.elements?.length ?? current.elementCount,
    };

    await this.saveDrawing(updated);
    await this.saveMetadata(updated);
  }

  /**
   * Delete a drawing
   */
  async deleteDrawing(id: string): Promise<void> {
    this.validateId(id);
    const drawingPath = path.join(
      this.baseDir,
      "drawings",
      `${id}.excalidraw`
    );
    const metaPath = path.join(this.baseDir, "drawings", `${id}.meta.json`);

    try {
      await fs.unlink(drawingPath);
      await fs.unlink(metaPath);
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== "ENOENT") {
        throw err;
      }
    }

    // Also delete exports
    const exportsDir = path.join(this.baseDir, "exports", id);
    try {
      await fs.rm(exportsDir, { recursive: true, force: true });
    } catch (err) {
      // Ignore errors when deleting exports
    }
  }

  /**
   * List all drawings with optional filtering
   */
  async listDrawings(
    opts: ListDrawingsOptions = {}
  ): Promise<DrawingMetadata[]> {
    const drawingsDir = path.join(this.baseDir, "drawings");

    try {
      const files = await fs.readdir(drawingsDir);
      const metaFiles = files.filter((f) => f.endsWith(".meta.json"));

      let drawings: DrawingMetadata[] = [];
      for (const file of metaFiles) {
        try {
          const content = await fs.readFile(
            path.join(drawingsDir, file),
            "utf-8"
          );
          drawings.push(JSON.parse(content));
        } catch (err) {
          // Skip invalid metadata files
          console.error(`Error reading metadata file ${file}:`, err);
        }
      }

      // Filter by search
      if (opts.search) {
        const query = opts.search.toLowerCase();
        drawings = drawings.filter(
          (d) =>
            d.name.toLowerCase().includes(query) ||
            d.tags.some((t) => t.toLowerCase().includes(query))
        );
      }

      // Sort
      const sortBy = opts.sortBy || "modified";
      drawings.sort((a, b) => {
        if (sortBy === "name") {
          return a.name.localeCompare(b.name);
        }
        return b[sortBy] - a[sortBy];
      });

      // Limit
      if (opts.limit) {
        drawings = drawings.slice(0, opts.limit);
      }

      return drawings;
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === "ENOENT") {
        // Directory doesn't exist yet
        return [];
      }
      throw err;
    }
  }

  /**
   * Get metadata for a drawing
   */
  private async getMetadata(id: string): Promise<DrawingMetadata | null> {
    const metaPath = path.join(this.baseDir, "drawings", `${id}.meta.json`);
    try {
      const content = await fs.readFile(metaPath, "utf-8");
      return JSON.parse(content);
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === "ENOENT") {
        return null;
      }
      throw err;
    }
  }

  /**
   * Save drawing to .excalidraw file
   */
  private async saveDrawing(drawing: Drawing): Promise<void> {
    const filePath = path.join(
      this.baseDir,
      "drawings",
      `${drawing.id}.excalidraw`
    );

    const data = {
      type: "excalidraw",
      version: 2,
      source: "collaborative-canvas",
      elements: drawing.elements,
      appState: drawing.appState,
      files: drawing.files || {},
    };

    await fs.writeFile(filePath, JSON.stringify(data, null, 2));
  }

  /**
   * Save metadata to .meta.json file
   */
  private async saveMetadata(drawing: Drawing): Promise<void> {
    const metaPath = path.join(
      this.baseDir,
      "drawings",
      `${drawing.id}.meta.json`
    );

    const metadata: DrawingMetadata = {
      id: drawing.id,
      name: drawing.name,
      created: drawing.created,
      modified: drawing.modified,
      tags: drawing.tags,
      elementCount: drawing.elementCount,
      thumbnail: drawing.thumbnail,
    };

    await fs.writeFile(metaPath, JSON.stringify(metadata, null, 2));
  }

  /**
   * Ensure all required directories and files exist.
   * This is the self-healing entry point — if storage was never
   * initialized (fresh install), this creates everything the MCP
   * server and Electron app need so neither process crashes.
   */
  private async ensureDirectories(): Promise<void> {
    const dirs = [
      this.baseDir,
      path.join(this.baseDir, "drawings"),
      path.join(this.baseDir, "exports"),
      path.join(this.baseDir, "thumbnails"),
      path.join(this.baseDir, "logs"),
      path.join(this.baseDir, "screenshots"),
    ];

    for (const dir of dirs) {
      await fs.mkdir(dir, { recursive: true });
    }

    // Ensure queue files exist (prevents fs.watch ENOENT crash)
    const queueFiles = [
      path.join(this.baseDir, "collaboration-queue.json"),
      path.join(this.baseDir, "hooks-queue.json"),
    ];

    for (const file of queueFiles) {
      try {
        await fs.access(file);
      } catch {
        await fs.writeFile(file, "[]", "utf-8");
      }
    }
  }

  /**
   * Add a collaboration request to the queue
   */
  async addCollaborationRequest(
    drawingId: string,
    elementCount: number,
    type: 'collaborate' | 'finished' = 'collaborate'
  ): Promise<void> {
    const queuePath = path.join(this.baseDir, "collaboration-queue.json");
    let release: (() => Promise<void>) | undefined;

    try {
      // Ensure queue file exists before attempting to lock
      try {
        await fs.access(queuePath);
      } catch {
        await fs.writeFile(queuePath, '[]', 'utf-8');
      }

      // Acquire exclusive lock with retry logic
      // Prevents race conditions between Electron and MCP server processes
      release = await lockfile.lock(queuePath, {
        retries: {
          retries: 10,
          minTimeout: 100,
          maxTimeout: 1000
        },
        stale: 10000 // 10s stale lock timeout
      });

      // Critical section - read, modify, write with lock held
      let queue: CollaborationRequest[] = [];
      const content = await fs.readFile(queuePath, "utf-8");
      queue = JSON.parse(content);

      const request: CollaborationRequest = {
        drawingId,
        elementCount,
        timestamp: Date.now(),
        retryCount: 0,
        status: 'pending',
        type,
      };

      queue.push(request);

      await fs.writeFile(queuePath, JSON.stringify(queue, null, 2));

      console.log(`🔒 Collaboration request added with file lock: ${drawingId} (${type})`);

      // Initialize status tracking
      await this.updateCollaborationStatus(drawingId, 'pending', 0);
    } catch (error) {
      console.error(`❌ Failed to add collaboration request:`, error);
      throw error;
    } finally {
      // Always release lock in finally block to prevent deadlocks
      if (release) {
        try {
          await release();
        } catch (unlockError) {
          console.error(`⚠️  Failed to release lock:`, unlockError);
        }
      }
    }
  }

  /**
   * Get all pending collaboration requests
   */
  async getCollaborationRequests(): Promise<CollaborationRequest[]> {
    const queuePath = path.join(this.baseDir, "collaboration-queue.json");
    let release: (() => Promise<void>) | undefined;

    try {
      // Check if file exists
      try {
        await fs.access(queuePath);
      } catch {
        return []; // File doesn't exist, return empty array
      }

      // Acquire exclusive lock for reading
      release = await lockfile.lock(queuePath, {
        retries: {
          retries: 10,
          minTimeout: 100,
          maxTimeout: 1000
        },
        stale: 10000
      });

      const content = await fs.readFile(queuePath, "utf-8");
      return JSON.parse(content);
    } catch (error) {
      console.error(`❌ Failed to read collaboration queue:`, error);
      return [];
    } finally {
      if (release) {
        try {
          await release();
        } catch (unlockError) {
          console.error(`⚠️  Failed to release lock:`, unlockError);
        }
      }
    }
  }

  /**
   * Clear a collaboration request from the queue
   */
  async clearCollaborationRequest(drawingId: string): Promise<void> {
    const queuePath = path.join(this.baseDir, "collaboration-queue.json");
    let release: (() => Promise<void>) | undefined;

    try {
      // Check if file exists
      try {
        await fs.access(queuePath);
      } catch {
        return; // File doesn't exist, nothing to clear
      }

      // Acquire exclusive lock for read-modify-write
      release = await lockfile.lock(queuePath, {
        retries: {
          retries: 10,
          minTimeout: 100,
          maxTimeout: 1000
        },
        stale: 10000
      });

      const content = await fs.readFile(queuePath, "utf-8");
      const queue = JSON.parse(content);
      const filtered = queue.filter((req: any) => req.drawingId !== drawingId);
      await fs.writeFile(queuePath, JSON.stringify(filtered, null, 2));

      console.log(`🔒 Collaboration request cleared with file lock: ${drawingId}`);
    } catch (error) {
      console.error(`❌ Failed to clear collaboration request:`, error);
    } finally {
      if (release) {
        try {
          await release();
        } catch (unlockError) {
          console.error(`⚠️  Failed to release lock:`, unlockError);
        }
      }
    }
  }

  /**
   * Increment retry count for a collaboration request in the queue
   */
  async incrementCollaborationRetry(drawingId: string): Promise<void> {
    const queuePath = path.join(this.baseDir, "collaboration-queue.json");
    let release: (() => Promise<void>) | undefined;

    try {
      try {
        await fs.access(queuePath);
      } catch {
        return; // File doesn't exist, nothing to update
      }

      release = await lockfile.lock(queuePath, {
        retries: {
          retries: 10,
          minTimeout: 100,
          maxTimeout: 1000
        },
        stale: 10000
      });

      const content = await fs.readFile(queuePath, "utf-8");
      const queue = JSON.parse(content);

      const updated = queue.map((req: any) => {
        if (req.drawingId === drawingId) {
          return {
            ...req,
            retryCount: (req.retryCount || 0) + 1
          };
        }
        return req;
      });

      await fs.writeFile(queuePath, JSON.stringify(updated, null, 2));
    } catch (err) {
      // Queue file doesn't exist or lock failed, nothing to update
    } finally {
      if (release) {
        try {
          await release();
        } catch (unlockError) {
          console.error(`⚠️  Failed to release lock:`, unlockError);
        }
      }
    }
  }

  /**
   * Update collaboration status for a drawing
   */
  async updateCollaborationStatus(
    drawingId: string,
    status: CollaborationStatus['status'],
    retryCount: number
  ): Promise<void> {
    const statusPath = path.join(this.baseDir, "collaboration-status.json");

    let statuses: Record<string, CollaborationStatus> = {};
    try {
      const content = await fs.readFile(statusPath, "utf-8");
      statuses = JSON.parse(content);
    } catch (err) {
      // File doesn't exist yet, start with empty object
    }

    statuses[drawingId] = {
      drawingId,
      status,
      retryCount,
      timestamp: Date.now(),
    };

    await fs.writeFile(statusPath, JSON.stringify(statuses, null, 2));
  }

  /**
   * Get collaboration status for a drawing
   */
  async getCollaborationStatus(
    drawingId: string
  ): Promise<CollaborationStatus | null> {
    const statusPath = path.join(this.baseDir, "collaboration-status.json");

    try {
      const content = await fs.readFile(statusPath, "utf-8");
      const statuses: Record<string, CollaborationStatus> = JSON.parse(content);
      return statuses[drawingId] || null;
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === "ENOENT") {
        return null;
      }
      throw err;
    }
  }

  /**
   * Update a collaboration request in the queue
   */
  async updateCollaborationRequest(
    drawingId: string,
    updates: Partial<CollaborationRequest>
  ): Promise<void> {
    const queuePath = path.join(this.baseDir, "collaboration-queue.json");

    try {
      const content = await fs.readFile(queuePath, "utf-8");
      const queue: CollaborationRequest[] = JSON.parse(content);

      const index = queue.findIndex(req => req.drawingId === drawingId);
      if (index !== -1) {
        const current = queue[index]!;
        // Merge updates while preserving required fields
        queue[index] = {
          ...current,
          ...updates,
          // Ensure required fields are not undefined
          drawingId: current.drawingId,
          elementCount: current.elementCount,
          timestamp: current.timestamp,
          retryCount: updates.retryCount ?? current.retryCount,
          status: updates.status ?? current.status,
        };
        await fs.writeFile(queuePath, JSON.stringify(queue, null, 2));
      }
    } catch (err) {
      // Queue file doesn't exist, nothing to update
    }
  }

  /**
   * Get the base directory path
   */
  getBaseDir(): string {
    return this.baseDir;
  }
}
