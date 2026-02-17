#!/usr/bin/env node
/**
 * Excalidraw MCP - Collaboration Polling Hook
 *
 * PostToolUse hook that polls for collaboration requests after canvas tool usage.
 *
 * Flow:
 * 1. User uses a canvas tool (e.g., open_canvas, save_canvas)
 * 2. This hook starts polling collaboration-queue.json
 * 3. User goes to browser, edits drawing, clicks "Collaborate" button
 * 4. Widget adds request to queue
 * 5. Hook detects it (within 3 seconds)
 * 6. Hook returns additionalContext to trigger Claude's response
 *
 * UX Notes:
 * - Claude REPL will pause while hook polls (up to 30 min)
 * - User can press Ctrl-C to cancel and resume REPL immediately
 * - While polling, user is expected to be drawing (not using REPL)
 */

const fs = require('fs');
const path = require('path');
const os = require('os');

// Configuration
// XDG-compliant storage path
const XDG_DATA_HOME = process.env.XDG_DATA_HOME || path.join(os.homedir(), '.local', 'share');
const STORAGE_DIR = path.join(XDG_DATA_HOME, 'collaborative-canvas');
// IMPORTANT: Must poll hooks-queue.json, NOT collaboration-queue.json!
// Flow: Electron → collaboration-queue.json → MCP server → HooksStrategy → hooks-queue.json → Hook polls here
const QUEUE_FILE = path.join(STORAGE_DIR, 'hooks-queue.json');
const DRAWINGS_DIR = path.join(STORAGE_DIR, 'drawings');
// Note: LISTEN_STATE_FILE is now per-drawing, constructed dynamically

const MAX_WAIT_MS = 60 * 60 * 1000; // 60 minutes
const POLL_INTERVAL_MS = 3000; // 3 seconds
const REQUEST_EXPIRATION_MS = 5000; // 5 seconds - expire old collaboration requests
const STALE_REQUEST_THRESHOLD_MS = 60000; // 60 seconds - entries older than this are from a previous session

// CRITICAL: Read hook input from stdin FIRST
// Claude Code expects hooks to read stdin before doing anything else
// This is what makes Claude Code wait for the hook to complete
let hookInput = {};
let toolName = 'unknown';
let listenDrawingId = null;

try {
  hookInput = JSON.parse(fs.readFileSync(0, 'utf-8'));
  toolName = hookInput.tool_name || 'unknown';

  // Extract drawing ID from listen tool response
  const toolResult = hookInput.tool_response;
  const resultText = Array.isArray(toolResult?.content)
    ? toolResult.content.map(c => c.text || '').join('\n')
    : toolResult?.content?.text || '';

  // Match "ID: <uuid>" or drawingId pattern
  const drawingIdMatch = resultText.match(/ID:\s*`?([a-f0-9-]+)`?/i);
  listenDrawingId = drawingIdMatch ? drawingIdMatch[1] : null;
} catch (err) {
  // Fallback if stdin read fails
  console.error('[CanvasHook] Warning: Could not read stdin:', err.message);
}

const startTime = Date.now();

// Ensure logs directory exists
const LOGS_DIR = path.join(STORAGE_DIR, 'logs');
try {
  if (!fs.existsSync(LOGS_DIR)) {
    fs.mkdirSync(LOGS_DIR, { recursive: true });
  }
} catch (err) {
  // Silently fail
}

// Logging to stderr (stdout is for JSON response only) AND file
function log(message) {
  const timestamp = new Date().toISOString();
  const logMessage = `[CanvasHook] ${message}`;

  // Log to stderr (visible in terminal)
  console.error(logMessage);

  // Also append to log file for aggregation
  try {
    const logFilePath = path.join(LOGS_DIR, 'hooks.log');
    const logEntry = `${timestamp} ${logMessage}\n`;
    fs.appendFileSync(logFilePath, logEntry);
  } catch (err) {
    // Silently fail if log file can't be written
  }
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Read collaboration queue with auto-recovery from corruption
 */
function readCollaborationQueue() {
  try {
    if (!fs.existsSync(QUEUE_FILE)) {
      return [];
    }
    const content = fs.readFileSync(QUEUE_FILE, 'utf-8');
    return JSON.parse(content);
  } catch (err) {
    log(`Warning: Queue file corrupted (${err.message})`);
    log(`AUTO-RECOVERY: Resetting queue to []`);

    // AUTO-RECOVERY: Reset corrupted queue to empty array
    // This can happen when multiple MCP server instances write simultaneously without locking
    try {
      fs.writeFileSync(QUEUE_FILE, '[]', 'utf-8');
      log(`Queue file reset successfully`);
    } catch (writeErr) {
      log(`Failed to reset queue: ${writeErr.message}`);
    }

    return [];
  }
}

/**
 * Write collaboration queue (atomic operation)
 */
function writeCollaborationQueue(queue) {
  try {
    fs.writeFileSync(QUEUE_FILE, JSON.stringify(queue, null, 2), 'utf-8');
    return true;
  } catch (err) {
    log(`Error writing queue: ${err.message}`);
    return false;
  }
}

/**
 * Get drawing metadata (name, etc.)
 */
function getDrawingMetadata(drawingId) {
  try {
    const metaPath = path.join(DRAWINGS_DIR, `${drawingId}.meta.json`);
    if (!fs.existsSync(metaPath)) {
      log(`Warning: Metadata file not found for ${drawingId}`);
      return null;
    }
    const content = fs.readFileSync(metaPath, 'utf-8');
    return JSON.parse(content);
  } catch (err) {
    log(`Error reading metadata for ${drawingId}: ${err.message}`);
    return null;
  }
}

/**
 * Clear listen state to gray out buttons (per-drawing)
 */
function clearListenState(drawingId) {
  try {
    const listenStatePath = path.join(STORAGE_DIR, `listen-state-${drawingId}.json`);
    if (fs.existsSync(listenStatePath)) {
      fs.unlinkSync(listenStatePath);
      log(`Cleared listen state for ${drawingId} (buttons will gray out)`);
    }
  } catch (err) {
    log(`Warning: Failed to clear listen state: ${err.message}`);
  }
}

/**
 * Check if a specific drawing has an active listen state
 */
function hasActiveListenState(drawingId) {
  try {
    const listenStatePath = path.join(STORAGE_DIR, `listen-state-${drawingId}.json`);
    if (!fs.existsSync(listenStatePath)) {
      return false;
    }

    const content = fs.readFileSync(listenStatePath, 'utf-8');
    const state = JSON.parse(content);

    // Check if state is valid and not expired
    return state.drawingId === drawingId &&
           state.isListening === true &&
           Date.now() < state.expiresAt;
  } catch (err) {
    log(`Warning: Failed to check listen state for ${drawingId}: ${err.message}`);
    return false;
  }
}

/**
 * Clear all listen states (used on timeout/cancel when we don't know specific drawingId)
 */
function clearAllListenStates() {
  try {
    const files = fs.readdirSync(STORAGE_DIR);
    const listenStateFiles = files.filter(f => f.startsWith('listen-state-') && f.endsWith('.json'));

    let clearedCount = 0;
    for (const file of listenStateFiles) {
      try {
        fs.unlinkSync(path.join(STORAGE_DIR, file));
        clearedCount++;
      } catch (err) {
        log(`Warning: Failed to delete ${file}: ${err.message}`);
      }
    }

    if (clearedCount > 0) {
      log(`Cleared ${clearedCount} listen state file(s)`);
    }
  } catch (err) {
    log(`Warning: Failed to clear listen states: ${err.message}`);
  }
}

/**
 * Build collaboration prompt for Claude
 */
function buildCollaborationPrompt(request, metadata) {
  const drawingName = metadata?.name || 'Untitled Canvas';

  return `CRITICAL INSTRUCTION: User clicked "Collaborate" on their canvas "${drawingName}"!

You MUST immediately call get_canvas_state to view what they drew:

**Action**: Call get_canvas_state({ drawingId: "${request.drawingId}" })

Canvas Details:
- Name: ${drawingName}
- ID: ${request.drawingId}
- Elements: ${request.elementCount}

DO NOT skip reading the canvas. The user drew something and wants your feedback.

After reading the canvas state:
1. Analyze the diagram structure and content
2. Provide thoughtful feedback on layout, clarity, and completeness
3. Optionally make improvements using save_canvas

IMPORTANT: Always use the explicit drawing ID "${request.drawingId}" for all tool calls.`;
}

/**
 * Main polling loop
 */
async function pollForCollaboration() {
  log(`Started polling after tool: ${toolName}`);
  log(`Process PID: ${process.pid} (use to detect multiple concurrent hooks)`);
  if (listenDrawingId) {
    log(`Listening for drawing ID: ${listenDrawingId}`);
  }
  log(`Will poll for up to ${MAX_WAIT_MS / 1000} seconds (${MAX_WAIT_MS / 60000} minutes)`);
  log(`REPL is paused - go to browser to draw`);
  log(`Press Ctrl-C anytime to cancel and resume chat\n`);

  let iterations = 0;
  const HEARTBEAT_INTERVAL = 30; // Log heartbeat every 30 iterations (~90 seconds)

  while (Date.now() - startTime < MAX_WAIT_MS) {
    iterations++;
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);

    // Log heartbeat periodically (not every 3 seconds)
    if (iterations === 1 || iterations % HEARTBEAT_INTERVAL === 0) {
      log(`Poll #${iterations} (${elapsed}s elapsed) - hook alive, watching ${QUEUE_FILE}`);
    }

    const queue = readCollaborationQueue();

    // Only log queue contents when non-empty
    if (queue.length > 0) {
      log(`  Queue has ${queue.length} entries: ${JSON.stringify(queue)}`);
    }

    // Validate and filter queue entries
    const now = Date.now();
    let staleCount = 0;
    let expiredCount = 0;

    const validRequests = queue.filter(req => {
      // Check for missing or invalid timestamp
      if (!req.timestamp || typeof req.timestamp !== 'number') {
        log(`  Warning: Invalid entry (no timestamp): ${JSON.stringify(req)}`);
        return false;
      }

      const requestAge = now - req.timestamp;

      // Detect very old entries (likely from previous session)
      if (requestAge > STALE_REQUEST_THRESHOLD_MS) {
        log(`  Stale request (${(requestAge / 1000).toFixed(1)}s old, likely from previous session): ${req.drawingId || 'unknown'}`);
        staleCount++;
        return false;
      }

      // Filter out expired requests (older than 5 seconds)
      if (requestAge > REQUEST_EXPIRATION_MS) {
        log(`  Expired request (${(requestAge / 1000).toFixed(1)}s old): ${req.drawingId || 'unknown'}`);
        expiredCount++;
        return false;
      }

      return true;
    });

    // Update queue if we removed any invalid/expired requests
    if (validRequests.length < queue.length) {
      writeCollaborationQueue(validRequests);
      if (staleCount > 0) {
        log(`  Removed ${staleCount} stale request(s) from previous session`);
      }
      if (expiredCount > 0) {
        log(`  Removed ${expiredCount} expired request(s)`);
      }
    }

    if (validRequests.length > 0) {
      // Found a collaboration request!
      // Prefer entries with a type field, otherwise take first entry
      const request = validRequests.find(r => r.type) || validRequests[0];
      const requestType = request.type || 'collaborate'; // Default to 'collaborate' for backward compatibility

      log(`Found ${requestType} request!`);
      log(`  Drawing ID: ${request.drawingId}`);

      // Check if this drawing has an active listen state
      const hasListenState = hasActiveListenState(request.drawingId);
      if (!hasListenState) {
        log(`Warning: Drawing ${request.drawingId} has no active listen state (window may be closed)`);
        log(`  Removing stale request from queue...`);
        writeCollaborationQueue(validRequests.slice(1));
        continue;
      }
      log(`  Elements: ${request.elementCount}`);
      log(`  Type: ${requestType}`);

      // Get drawing metadata for name
      const metadata = getDrawingMetadata(request.drawingId);

      if (!metadata) {
        log(`Warning: Could not load drawing metadata, skipping...`);
        // Remove from queue anyway to prevent stuck loop
        writeCollaborationQueue(validRequests.slice(1));
        continue;
      }

      log(`  Canvas name: "${metadata.name}"`);

      // CRITICAL: Remove request from queue BEFORE returning
      // This prevents duplicate processing and retry loops
      const updatedQueue = validRequests.slice(1); // Remove first item
      const success = writeCollaborationQueue(updatedQueue);

      if (!success) {
        log(`Warning: Failed to update queue, aborting to prevent duplicates`);
        process.exit(1);
      }

      log(`  Removed from queue (${updatedQueue.length} remaining)`);
      log(`  Returning additionalContext to Claude`);

      // Clear listen state before returning
      clearListenState(request.drawingId);

      log(`Process ${process.pid} exiting (${requestType} detected)\n`);

      // Handle based on request type
      if (requestType === 'finished') {
        // User clicked "I'm Finished" - prompt Claude to close widget
        const response = {
          hookSpecificOutput: {
            hookEventName: "PostToolUse",
            additionalContext: `User has finished working on the canvas "${metadata.name}"!

The canvas session is complete and the user wants to close the widget.

Canvas Details:
- Name: ${metadata.name}
- ID: ${request.drawingId}
- Final Elements: ${request.elementCount}

CRITICAL INSTRUCTION: You MUST immediately call close_widget (no text response):

**Action**: Call close_widget({ drawingId: "${request.drawingId}" })

IMPORTANT: Use the explicit drawing ID "${request.drawingId}" to close THIS canvas's widget.

DO NOT:
- Call get_canvas_state
- Call save_canvas
- Respond with text first

ONLY call close_widget immediately. After the widget closes, then acknowledge completion in chat.`
          }
        };
        console.log(JSON.stringify(response));
        process.exit(0);
      }

      // Default: Collaborate request - prompt Claude for feedback
      const response = {
        hookSpecificOutput: {
          hookEventName: "PostToolUse",
          additionalContext: buildCollaborationPrompt(request, metadata)
        }
      };

      console.log(JSON.stringify(response));
      process.exit(0);
    }

    log(`  No collaboration requests yet, sleeping ${POLL_INTERVAL_MS}ms...\n`);
    await sleep(POLL_INTERVAL_MS);
  }

  // Timeout reached
  const totalTime = (MAX_WAIT_MS / 1000 / 60).toFixed(0);
  log(`Timeout reached (${totalTime} minutes)`);
  log(`No collaboration request detected`);

  // Clear all listen states on timeout
  clearAllListenStates();

  log(`Process ${process.pid} exiting (timeout)\n`);

  // Return empty response (no additional context)
  console.log(JSON.stringify({ decision: undefined }));
  process.exit(0);
}

/**
 * Handle graceful shutdown (Ctrl-C)
 */
process.on('SIGINT', () => {
  log('\nCancelled by user (Ctrl-C)');

  // Clear all listen states on cancel
  clearAllListenStates();

  log(`Process ${process.pid} exiting (user cancel)`);
  log('Resuming REPL without collaboration\n');
  console.log(JSON.stringify({ decision: undefined }));
  process.exit(0);
});

/**
 * Handle uncaught errors
 */
process.on('uncaughtException', (err) => {
  log(`Fatal error: ${err.message}`);
  log(`Stack: ${err.stack}`);
  console.log(JSON.stringify({ decision: undefined }));
  process.exit(1);
});

// Start polling
pollForCollaboration().catch(err => {
  log(`Polling failed: ${err.message}`);
  console.log(JSON.stringify({ decision: undefined }));
  process.exit(1);
});
