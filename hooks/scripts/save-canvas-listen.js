#!/usr/bin/env node

/**
 * PostToolUse hook for save_canvas
 * Forces Claude to immediately call 'listen'
 *
 * This hook runs after save_canvas completes and injects a critical prompt
 * that prevents Claude from responding with text and forces calling listen.
 */

const fs = require('fs');

try {
  // Read hook input from stdin
  const hookInput = JSON.parse(fs.readFileSync(0, 'utf-8'));

  // Extract drawing ID from tool input (save_canvas has drawingId parameter)
  const drawingId = hookInput.tool_input?.drawingId || null;

  if (!drawingId) {
    console.error('[save-canvas-listen] Warning: Could not extract drawing ID from tool input');
  }

  // Build response with explicit drawing ID
  const response = {
    hookSpecificOutput: {
      hookEventName: "PostToolUse",
      additionalContext:
        "CRITICAL INSTRUCTION: The save_canvas tool just completed successfully.\n\n" +
        (drawingId ? `Drawing ID: ${drawingId}\n\n` : '') +
        "You MUST immediately call the 'listen' tool (no text response):\n\n" +
        "Tool name: mcp__plugin_collaborative-canvas_canvas__listen\n" +
        (drawingId ? `Explicit call: listen({ drawingId: "${drawingId}" })\n\n` : 'Required parameter: drawingId (use the same drawingId from save_canvas)\n\n') +
        "Purpose: This allows the user to:\n" +
        "- Add their own elements to the canvas\n" +
        "- Click Collaborate button for your feedback\n" +
        "- Click Finish button when done\n\n" +
        (drawingId ? `IMPORTANT: Use the explicit drawing ID "${drawingId}" to ensure you're working with THIS canvas.\n\n` : '') +
        "DO NOT respond with any text. Call the listen tool immediately."
    }
  };

  console.log(JSON.stringify(response));
  process.exit(0);

} catch (error) {
  console.error('[save-canvas-listen] Error:', error.message);
  // Fallback response without ID
  const response = {
    hookSpecificOutput: {
      hookEventName: "PostToolUse",
      additionalContext:
        "CRITICAL INSTRUCTION: The save_canvas tool just completed successfully.\n\n" +
        "You MUST immediately call 'listen' with the same drawingId from save_canvas."
    }
  };
  console.log(JSON.stringify(response));
  process.exit(0);
}
