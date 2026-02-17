/**
 * Export cache manager - handles caching of exported drawing files
 */

import fs from "fs/promises";
import path from "path";

export class ExportCache {
  private baseDir: string;

  constructor(baseDir: string) {
    this.baseDir = path.join(baseDir, "exports");
  }

  /**
   * Save an export to cache
   * @returns Path to the saved export file
   */
  async saveExport(
    drawingId: string,
    format: string,
    data: string | Buffer
  ): Promise<string> {
    const drawingExportsDir = path.join(this.baseDir, drawingId);
    await fs.mkdir(drawingExportsDir, { recursive: true });

    const timestamp = new Date().toISOString().replace(/:/g, "-").split(".")[0];
    const filename = `${timestamp}.${format}`;
    const filePath = path.join(drawingExportsDir, filename);

    if (typeof data === "string") {
      await fs.writeFile(filePath, data, "utf-8");
    } else {
      await fs.writeFile(filePath, data);
    }

    // Create symlink to latest
    const latestPath = path.join(drawingExportsDir, `latest.${format}`);
    try {
      await fs.unlink(latestPath);
    } catch (err) {
      // Ignore if doesn't exist
    }

    try {
      await fs.symlink(filename, latestPath);
    } catch (err) {
      // Symlinks might not work on all systems, that's okay
      console.warn(`Could not create symlink for ${format} export:`, err);
    }

    return filePath;
  }

  /**
   * Get the latest export for a format
   */
  async getLatestExport(
    drawingId: string,
    format: string
  ): Promise<Buffer | null> {
    const latestPath = path.join(
      this.baseDir,
      drawingId,
      `latest.${format}`
    );

    try {
      return await fs.readFile(latestPath);
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === "ENOENT") {
        return null;
      }
      throw err;
    }
  }

  /**
   * List all exports for a drawing
   */
  async listExports(drawingId: string): Promise<string[]> {
    const drawingExportsDir = path.join(this.baseDir, drawingId);

    try {
      const files = await fs.readdir(drawingExportsDir);
      return files.filter((f) => !f.startsWith("latest."));
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === "ENOENT") {
        return [];
      }
      throw err;
    }
  }

  /**
   * Get the full path to a specific export
   */
  getExportPath(drawingId: string, filename: string): string {
    return path.join(this.baseDir, drawingId, filename);
  }

  /**
   * Delete all exports for a drawing
   */
  async deleteExports(drawingId: string): Promise<void> {
    const drawingExportsDir = path.join(this.baseDir, drawingId);
    try {
      await fs.rm(drawingExportsDir, { recursive: true, force: true });
    } catch (err) {
      // Ignore errors
    }
  }
}
