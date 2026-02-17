import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "fs/promises";
import path from "path";
import { DrawingStorage } from "../DrawingStorage.js";
import type { CreateDrawingData } from "../../types/index.js";

describe("DrawingStorage", () => {
  let storage: DrawingStorage;
  let testBaseDir: string;

  beforeEach(async () => {
    // Create temporary test directory
    testBaseDir = path.join(process.cwd(), ".test-storage");
    storage = new DrawingStorage();

    // Override base directory for testing
    (storage as any).baseDir = testBaseDir;

    // Initialize directories
    await storage.initialize();
  });

  afterEach(async () => {
    // Clean up test directory
    try {
      await fs.rm(testBaseDir, { recursive: true, force: true });
    } catch (err) {
      // Ignore cleanup errors
    }
  });

  describe("initialize", () => {
    it("should create required directories", async () => {
      const dirs = ["drawings", "exports", "thumbnails"];

      for (const dir of dirs) {
        const dirPath = path.join(testBaseDir, dir);
        const stats = await fs.stat(dirPath);
        expect(stats.isDirectory()).toBe(true);
      }
    });
  });

  describe("createDrawing", () => {
    it("should create a new drawing with generated ID", async () => {
      const data: CreateDrawingData = {
        name: "Test Drawing",
        elements: [
          {
            id: "elem1",
            type: "rectangle",
            x: 100,
            y: 100,
            width: 200,
            height: 150,
            angle: 0,
            strokeColor: "#000000",
            backgroundColor: "transparent",
            fillStyle: "hachure",
            strokeWidth: 2,
            strokeStyle: "solid",
            roughness: 1,
            opacity: 100,
            groupIds: [],
            frameId: null,
            roundness: null,
            seed: 12345,
            version: 1,
            versionNonce: 67890,
            isDeleted: false,
            boundElements: null,
            updated: Date.now(),
            link: null,
            locked: false,
          },
        ],
        appState: {
          viewBackgroundColor: "#ffffff",
        },
      };

      const drawing = await storage.createDrawing(data);

      expect(drawing.id).toBeDefined();
      expect(drawing.name).toBe("Test Drawing");
      expect(drawing.elements).toHaveLength(1);
      expect(drawing.elementCount).toBe(1);
      expect(drawing.created).toBeDefined();
      expect(drawing.modified).toBe(drawing.created);
    });

    it("should save drawing file and metadata file", async () => {
      const data: CreateDrawingData = {
        name: "File Test",
        elements: [],
        appState: {},
      };

      const drawing = await storage.createDrawing(data);

      const drawingPath = path.join(
        testBaseDir,
        "drawings",
        `${drawing.id}.excalidraw`
      );
      const metaPath = path.join(
        testBaseDir,
        "drawings",
        `${drawing.id}.meta.json`
      );

      const [drawingExists, metaExists] = await Promise.all([
        fs
          .access(drawingPath)
          .then(() => true)
          .catch(() => false),
        fs
          .access(metaPath)
          .then(() => true)
          .catch(() => false),
      ]);

      expect(drawingExists).toBe(true);
      expect(metaExists).toBe(true);
    });
  });

  describe("getDrawing", () => {
    it("should retrieve an existing drawing", async () => {
      const data: CreateDrawingData = {
        name: "Retrieve Test",
        elements: [],
        appState: {},
      };

      const created = await storage.createDrawing(data);
      const retrieved = await storage.getDrawing(created.id);

      expect(retrieved).not.toBeNull();
      expect(retrieved?.id).toBe(created.id);
      expect(retrieved?.name).toBe("Retrieve Test");
    });

    it("should return null for non-existent drawing", async () => {
      const result = await storage.getDrawing("non-existent-id");
      expect(result).toBeNull();
    });

    it("should load metadata along with drawing", async () => {
      const data: CreateDrawingData = {
        name: "Metadata Test",
        elements: [],
        appState: {},
      };

      const created = await storage.createDrawing(data);
      const retrieved = await storage.getDrawing(created.id);

      expect(retrieved?.created).toBe(created.created);
      expect(retrieved?.modified).toBe(created.modified);
      expect(retrieved?.tags).toEqual([]);
    });
  });

  describe("updateDrawing", () => {
    it("should update drawing with new elements", async () => {
      const data: CreateDrawingData = {
        name: "Update Test",
        elements: [],
        appState: {},
      };

      const created = await storage.createDrawing(data);

      await storage.updateDrawing(created.id, {
        elements: [
          {
            id: "elem1",
            type: "text",
            x: 0,
            y: 0,
            width: 100,
            height: 20,
            angle: 0,
            strokeColor: "#000000",
            backgroundColor: "transparent",
            fillStyle: "solid",
            strokeWidth: 1,
            strokeStyle: "solid",
            roughness: 0,
            opacity: 100,
            groupIds: [],
            frameId: null,
            roundness: null,
            seed: 123,
            version: 1,
            versionNonce: 456,
            isDeleted: false,
            boundElements: null,
            updated: Date.now(),
            link: null,
            locked: false,
            text: "Hello",
            fontSize: 20,
            fontFamily: 1,
            textAlign: "left",
            verticalAlign: "top",
          },
        ],
      });

      const updated = await storage.getDrawing(created.id);
      expect(updated?.elements).toHaveLength(1);
      expect(updated?.elementCount).toBe(1);
      expect(updated?.modified).toBeGreaterThan(created.modified);
    });

    it("should throw error for non-existent drawing", async () => {
      await expect(
        storage.updateDrawing("non-existent-id", { name: "New Name" })
      ).rejects.toThrow("Drawing non-existent-id not found");
    });

    it("should update modified timestamp", async () => {
      const data: CreateDrawingData = {
        name: "Timestamp Test",
        elements: [],
        appState: {},
      };

      const created = await storage.createDrawing(data);
      const originalModified = created.modified;

      // Wait a bit to ensure timestamp difference
      await new Promise((resolve) => setTimeout(resolve, 10));

      await storage.updateDrawing(created.id, { name: "Updated Name" });
      const updated = await storage.getDrawing(created.id);

      expect(updated?.modified).toBeGreaterThan(originalModified);
    });
  });

  describe("deleteDrawing", () => {
    it("should delete drawing and metadata files", async () => {
      const data: CreateDrawingData = {
        name: "Delete Test",
        elements: [],
        appState: {},
      };

      const created = await storage.createDrawing(data);
      await storage.deleteDrawing(created.id);

      const drawingPath = path.join(
        testBaseDir,
        "drawings",
        `${created.id}.excalidraw`
      );
      const metaPath = path.join(
        testBaseDir,
        "drawings",
        `${created.id}.meta.json`
      );

      const [drawingExists, metaExists] = await Promise.all([
        fs
          .access(drawingPath)
          .then(() => true)
          .catch(() => false),
        fs
          .access(metaPath)
          .then(() => true)
          .catch(() => false),
      ]);

      expect(drawingExists).toBe(false);
      expect(metaExists).toBe(false);
    });

    it("should not throw error when deleting non-existent drawing", async () => {
      await expect(
        storage.deleteDrawing("non-existent-id")
      ).resolves.not.toThrow();
    });
  });

  describe("listDrawings", () => {
    beforeEach(async () => {
      // Create multiple test drawings
      await storage.createDrawing({
        name: "Alpha Drawing",
        elements: [],
        appState: {},
      });

      await storage.createDrawing({
        name: "Beta Drawing",
        elements: [],
        appState: {},
      });

      await storage.createDrawing({
        name: "Gamma Drawing",
        elements: [],
        appState: {},
      });
    });

    it("should list all drawings", async () => {
      const drawings = await storage.listDrawings();
      expect(drawings).toHaveLength(3);
    });

    it("should filter drawings by search query", async () => {
      const drawings = await storage.listDrawings({ search: "Beta" });
      expect(drawings).toHaveLength(1);
      expect(drawings[0]?.name).toBe("Beta Drawing");
    });

    it("should sort drawings by name", async () => {
      const drawings = await storage.listDrawings({ sortBy: "name" });
      expect(drawings[0]?.name).toBe("Alpha Drawing");
      expect(drawings[1]?.name).toBe("Beta Drawing");
      expect(drawings[2]?.name).toBe("Gamma Drawing");
    });

    it("should sort drawings by modified date (default)", async () => {
      const drawings = await storage.listDrawings();
      // Most recently modified first
      expect(drawings[0]?.modified).toBeGreaterThanOrEqual(
        drawings[1]?.modified
      );
    });

    it("should limit number of results", async () => {
      const drawings = await storage.listDrawings({ limit: 2 });
      expect(drawings).toHaveLength(2);
    });

    it("should return empty array when no drawings exist", async () => {
      // Delete all drawings
      const allDrawings = await storage.listDrawings();
      for (const d of allDrawings) {
        await storage.deleteDrawing(d.id);
      }

      const drawings = await storage.listDrawings();
      expect(drawings).toEqual([]);
    });
  });

  describe("getBaseDir", () => {
    it("should return the base directory path", () => {
      const baseDir = storage.getBaseDir();
      expect(baseDir).toBe(testBaseDir);
    });
  });
});
