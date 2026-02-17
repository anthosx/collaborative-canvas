#!/usr/bin/env node

/**
 * PostToolUse Hook: get_canvas_state Decision Enforcer
 *
 * Triggers after: mcp__canvas__get_canvas_state
 *
 * Purpose: Enforces the principle "reply IN the canvas" when visual
 * communication is needed. Forces Claude to choose:
 *
 * 1. CLOSE & RESPOND IN CHAT - When canvas doesn't need visual response
 *    (e.g., you understand and agree with user's drawing)
 *
 * 2. SAVE_CANVAS - When canvas needs visual response
 *    (e.g., you disagree, need clarification, want to add notes)
 *
 * The hook analyzes the drawing content and conversation context to guide
 * this decision.
 */

const fs = require('fs');
const path = require('path');
const os = require('os');

// Configuration
// XDG-compliant storage path
const XDG_DATA_HOME = process.env.XDG_DATA_HOME || path.join(os.homedir(), '.local', 'share');
const STORAGE_DIR = path.join(XDG_DATA_HOME, 'collaborative-canvas');
const LOGS_DIR = path.join(STORAGE_DIR, 'logs');

// Ensure logs directory exists
try {
  fs.mkdirSync(LOGS_DIR, { recursive: true });
} catch (err) {
  // Silently fail
}

// Logging to stderr (stdout is for JSON response only) AND file
function log(message) {
  const timestamp = new Date().toISOString();
  const logMessage = `[GetCanvasStateDecision] ${message}`;

  // Log to stderr (visible in terminal)
  console.error(logMessage);

  // Also append to log file
  try {
    const logFilePath = path.join(LOGS_DIR, 'hooks.log');
    const logEntry = `${timestamp} ${logMessage}\n`;
    fs.appendFileSync(logFilePath, logEntry);
  } catch (err) {
    // Silently fail if log file can't be written
  }
}

/**
 * Main hook logic
 */
function main() {
  try {
    log('get_canvas_state hook triggered');

    // Read raw stdin for diagnostic purposes
    const rawInput = fs.readFileSync(0, 'utf-8');
    log(`Raw stdin length: ${rawInput.length} chars`);
    log(`Raw stdin preview: ${rawInput.substring(0, 500)}...`);

    // Parse JSON
    const hookInput = JSON.parse(rawInput);
    log(`Parsed hookInput keys: ${Object.keys(hookInput).join(', ')}`);
    log(`tool_name: ${hookInput.tool_name}`);
    log(`tool_input keys: ${hookInput.tool_input ? Object.keys(hookInput.tool_input).join(', ') : 'null'}`);
    log(`tool_response exists: ${!!hookInput.tool_response}`);

    // tool_response IS the content array (not tool_response.content)!
    const toolResult = hookInput.tool_response;

    if (!toolResult || !Array.isArray(toolResult)) {
      log('tool_response is not an array!');
      log(`   Received type: ${typeof toolResult}`);
      outputResponse({});
      return;
    }

    log(`tool_response is array, length: ${toolResult.length}`);
    toolResult.forEach((item, i) => {
      log(`   [${i}] type: ${item.type}, keys: ${Object.keys(item || {}).join(', ')}`);
    });

    // Extract text from the array items
    const resultText = toolResult
      .map(item => item.text || '')
      .join('\n');

    if (!resultText) {
      log('No text content in tool result, exiting gracefully');
      outputResponse({});
      return;
    }

    log(`Canvas state retrieved (${resultText.length} chars)`);

    // Extract drawing ID if available
    // Format: (ID: `6517a789-4a91-45d0-87b5-9b9c148f33da`)
    const drawingIdMatch = resultText.match(/\(ID: `([^`]+)`\)/) || resultText.match(/Drawing ID: (\S+)/);
    const drawingId = drawingIdMatch ? drawingIdMatch[1] : null;

    // Count elements to understand drawing complexity
    // Format: "Total Elements: 20 (11 user, 9 Claude)" or "Elements: 20"
    const elementMatch = resultText.match(/Total Elements: (\d+)/i) || resultText.match(/Elements: (\d+)/i) || resultText.match(/(\d+) elements/i);
    const elementCount = elementMatch ? parseInt(elementMatch[1]) : 0;

    log(`Canvas: ${drawingId || 'unknown'}, Elements: ${elementCount}`);

    // Build the decision prompt for Claude
    const decisionPrompt = buildDecisionPrompt(drawingId, elementCount, resultText);

    log('Returning decision prompt to Claude');

    // Return as additionalContext with proper hook format
    outputResponse({
      hookSpecificOutput: {
        hookEventName: "PostToolUse",
        additionalContext: decisionPrompt
      }
    });

  } catch (error) {
    log(`Error: ${error.message}`);
    // Return empty response on error (graceful degradation)
    outputResponse({});
  }
}

/**
 * Build the decision-forcing prompt
 */
function buildDecisionPrompt(drawingId, elementCount, drawingContent) {
  return `
CANVAS RESPONSE DECISION REQUIRED

You just retrieved the state of a canvas (${elementCount} elements).

**Core Principle: Reply IN the canvas when visual communication is needed.**

You MUST now choose ONE of the following actions:

OPTION 1: CLOSE & RESPOND IN CHAT

Choose this when:
- You understand and AGREE with the user's drawing
- The drawing fully answers the conversation need
- No visual clarification or additions are needed
- A text response is more appropriate

Example scenarios:
- User drew system architecture, you understand it -> close and confirm
- User sketched a concept, it's clear -> close and acknowledge
- Drawing is complete and answers the question -> close and discuss

**Action**: ${drawingId ? `Call close_widget({ drawingId: "${drawingId}" })` : 'Use close_widget tool'}, then respond in chat confirming your understanding.

OPTION 2: SAVE_CANVAS (Reply IN the canvas)

Choose this when:
- You DISAGREE with something in the drawing
- You need to ADD clarifying notes or annotations
- The drawing is incomplete or unclear
- You want to propose alternative visual elements
- The conversation would benefit from your visual additions

Example scenarios:
- User's architecture has a flaw -> add a note/correction to the canvas
- User's diagram needs clarification -> add text annotations
- You want to suggest alternatives -> add new elements with notes
- User's concept could be improved -> draw additions with explanations

**Action**: ${drawingId ? `Call save_canvas({ drawingId: "${drawingId}", elements: [...] })` : 'Use save_canvas'} to add:
- Text notes with your feedback
- Arrows pointing to areas of concern
- New elements showing alternatives
- Annotations explaining your thinking

DECISION CRITERIA

Ask yourself:
1. Does the conversation context + this canvas require my VISUAL input?
2. Would my response be clearer as visual elements vs text?
3. Do I disagree with or need to clarify anything shown?
4. Would the user benefit from seeing my thoughts IN the canvas?

**If YES to any -> Use save_canvas (Option 2)**
**If NO to all -> Use close_widget (Option 1)**

Drawing ID: ${drawingId || 'N/A'}
Current element count: ${elementCount}

${drawingId ? `\nIMPORTANT: Always use the explicit drawing ID "${drawingId}" for all tool calls to ensure you're working with THIS canvas.\n` : ''}

IMPORTANT: Do NOT just respond in chat without making this decision.
Choose your action NOW and execute it.
`;
}

/**
 * Output JSON response to stdout
 */
function outputResponse(response) {
  console.log(JSON.stringify(response, null, 2));
}

// Run main
try {
  main();
} catch (error) {
  log(`Fatal error: ${error.message}`);
  outputResponse({});
  process.exit(0); // Exit gracefully even on error
}
