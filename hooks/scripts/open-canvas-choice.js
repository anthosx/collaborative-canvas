#!/usr/bin/env node

/**
 * PostToolUse hook for open_canvas
 * Forces Claude to immediately call either 'listen' or 'save_canvas'
 *
 * Per official docs: https://docs.claude.com/en/docs/claude-code/hooks.md
 * - Receives JSON via stdin with tool_name, tool_input, tool_response
 * - Outputs JSON to stdout with hookSpecificOutput.additionalContext
 */

const fs = require('fs');

try {
  // Read hook input from stdin
  const hookInput = JSON.parse(fs.readFileSync(0, 'utf-8'));

  // Extract drawing ID from tool response
  const toolResult = hookInput.tool_response;
  const resultText = Array.isArray(toolResult.content)
    ? toolResult.content.map(c => c.text || '').join('\n')
    : toolResult.content?.text || '';

  // Match "ID: <uuid>" pattern from open_canvas response
  const drawingIdMatch = resultText.match(/ID:\s*(\S+)/i);
  const drawingId = drawingIdMatch ? drawingIdMatch[1] : null;

  if (!drawingId) {
    console.error('[open-canvas-choice] Warning: Could not extract drawing ID from response');
  }

  // Build response with explicit drawing ID
  const response = {
    hookSpecificOutput: {
      hookEventName: "PostToolUse",
      additionalContext:
        "CRITICAL INSTRUCTION: The open_canvas tool just completed successfully.\n\n" +
        (drawingId ? `Drawing ID: ${drawingId}\n\n` : '') +
        "You MUST immediately make ONE tool call (no text response):\n\n" +
        "Option 1: Call the 'listen' tool if the user will draw/edit\n" +
        "   - Use this for new canvases where user creates content\n" +
        "   - Tool name: mcp__canvas__listen\n" +
        (drawingId ? `   - Explicit call: listen({ drawingId: "${drawingId}" })\n\n` : '   - Required parameter: drawingId\n\n') +
        "Option 2: Call the 'save_canvas' tool if you want to add elements\n" +
        "   - Use this when you're creating diagram content for the user\n" +
        "   - Tool name: mcp__canvas__save_canvas\n" +
        (drawingId ? `   - Explicit call: save_canvas({ drawingId: "${drawingId}", elements: [...] })\n\n` : '   - Required parameters: drawingId, elements\n\n') +
        (drawingId ? `IMPORTANT: Use the explicit drawing ID "${drawingId}" to ensure you're working with THIS canvas.\n\n` : '') +
        "DO NOT respond with any text. Make the tool call immediately."
    }
  };

  // Output to stdout per official documentation
  console.log(JSON.stringify(response));
  process.exit(0);

} catch (error) {
  console.error('[open-canvas-choice] Error:', error.message);
  // Fallback response without ID
  const response = {
    hookSpecificOutput: {
      hookEventName: "PostToolUse",
      additionalContext:
        "CRITICAL INSTRUCTION: The open_canvas tool just completed successfully.\n\n" +
        "You MUST immediately call either 'listen' or 'save_canvas' with the drawingId from the result."
    }
  };
  console.log(JSON.stringify(response));
  process.exit(0);
}
