import { CollaborationStrategy } from "./CollaborationStrategy.js";
import { existsSync, writeFileSync, readFileSync, mkdirSync } from "fs";
import path from "path";
import { homedir } from "os";
import lockfile from "proper-lockfile";

/**
 * Hooks-based collaboration strategy for Claude Code.
 *
 * This strategy adds collaboration requests to a queue file that is checked
 * by a PostToolUse hook. When any draw tool is used, the hook injects the
 * collaboration prompt into the conversation via additionalContext.
 *
 * Setup required:
 * 1. Plugin hooks configured in hooks/hooks.json
 * 2. Hook scripts in hooks/scripts/
 * 3. PostToolUse hooks for canvas tools
 */
export class HooksStrategy implements CollaborationStrategy {
  private queueFilePath: string;

  constructor() {
    const homeDir = homedir();
    // XDG-compliant storage path
    const xdgDataHome = process.env.XDG_DATA_HOME || path.join(homeDir, '.local', 'share');
    const canvasDir = path.join(xdgDataHome, 'collaborative-canvas');

    // Ensure directory exists
    if (!existsSync(canvasDir)) {
      mkdirSync(canvasDir, { recursive: true });
    }

    // Use separate hooks queue file (not the same as DrawingStorage queue)
    this.queueFilePath = path.join(canvasDir, 'hooks-queue.json');
  }

  async notify(drawingId: string, drawingName: string, elementCount: number, type?: 'collaborate' | 'finished'): Promise<void> {
    let release: (() => Promise<void>) | undefined;

    try {
      // Ensure queue file exists before attempting to lock
      if (!existsSync(this.queueFilePath)) {
        writeFileSync(this.queueFilePath, '[]', 'utf8');
      }

      // Acquire exclusive lock with retry logic
      // This prevents race conditions when multiple MCP server instances write simultaneously
      release = await lockfile.lock(this.queueFilePath, {
        retries: {
          retries: 10,
          minTimeout: 100,
          maxTimeout: 1000
        },
        stale: 10000 // 10s stale lock timeout (in case process crashes while holding lock)
      });

      // Critical section - read, modify, write with lock held
      let queue: Array<{
        drawingId: string;
        drawingName: string;
        elementCount: number;
        timestamp: number;
        type?: 'collaborate' | 'finished';
      }> = [];

      const content = readFileSync(this.queueFilePath, 'utf8');
      queue = JSON.parse(content);

      // Add new request to queue (at the beginning for FIFO)
      queue.unshift({
        drawingId,
        drawingName,
        elementCount,
        timestamp: Date.now(),
        type: type || 'collaborate'
      });

      // Write queue back atomically
      writeFileSync(this.queueFilePath, JSON.stringify(queue, null, 2));

      console.error(`\n${'='.repeat(80)}`);
      console.error(`🪝 HOOKS STRATEGY - Collaboration Request Queued (with file lock)`);
      console.error(`${'='.repeat(80)}`);
      console.error(`Drawing: ${drawingName} (${drawingId})`);
      console.error(`Elements: ${elementCount}`);
      console.error(`Type: ${type || 'collaborate'}`);
      console.error(`Queue file: ${this.queueFilePath}`);
      console.error(`🔒 File lock acquired and released successfully`);
      console.error(``);
      console.error(`📋 Next steps:`);
      console.error(`   1. PostToolUse hook will check queue when any draw tool is used`);
      console.error(`   2. Hook will inject collaboration prompt into conversation`);
      console.error(`   3. Claude will automatically respond with feedback`);
      console.error(`${'='.repeat(80)}\n`);
    } catch (error) {
      console.error(`❌ HooksStrategy failed:`, error);
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

  getName(): string {
    return "hooks";
  }

  isAvailable(): boolean {
    // DISABLED: Electron now writes directly to hooks-queue.json for Claude Code.
    // This avoids race conditions when multiple MCP server processes are running.
    // The MCP server should only use notifications/sampling strategies.
    // See: electron-app/main/ipc-handlers.ts writeToHooksQueue()
    return false;
  }
}
