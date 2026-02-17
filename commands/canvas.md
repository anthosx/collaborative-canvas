---
description: Open or create a visual canvas for diagramming and collaboration
argument-hint: [name|--list|--open <id>]
allowed-tools: [mcp__plugin_collaborative-canvas_canvas__open_canvas, mcp__plugin_collaborative-canvas_canvas__close_canvas, mcp__plugin_collaborative-canvas_canvas__list_canvases, mcp__plugin_collaborative-canvas_canvas__save_canvas, mcp__plugin_collaborative-canvas_canvas__get_canvas_state, mcp__plugin_collaborative-canvas_canvas__update_canvas, mcp__plugin_collaborative-canvas_canvas__export_canvas, mcp__plugin_collaborative-canvas_canvas__delete_canvases, mcp__plugin_collaborative-canvas_canvas__listen, mcp__plugin_collaborative-canvas_canvas__add_to_canvas, mcp__plugin_collaborative-canvas_canvas__close_widget, mcp__plugin_collaborative-canvas_canvas__capture_screenshot]
---

# Canvas Command

Opens or creates a collaborative canvas for visual diagramming with Claude.

## Arguments

$ARGUMENTS

## Instructions

1. **If arguments contain `--list`**:
   - Call `mcp__plugin_collaborative-canvas_canvas__list_canvases` to show all saved drawings
   - Display results in a formatted table with ID, name, and element count

2. **If arguments contain `--open <id>`**:
   - Extract the drawing ID from arguments
   - Call `mcp__plugin_collaborative-canvas_canvas__open_canvas` with `drawingId` parameter
   - After canvas opens, immediately call `mcp__plugin_collaborative-canvas_canvas__listen` to wait for user

3. **Otherwise (default - create new)**:
   - Use arguments as the canvas name (or "Untitled Canvas" if empty)
   - Call `mcp__plugin_collaborative-canvas_canvas__open_canvas` with `name` parameter
   - After canvas opens, immediately call `mcp__plugin_collaborative-canvas_canvas__listen` to wait for user

## Examples

```
/canvas Architecture Diagram
/canvas --list
/canvas --open 6517a789-4a91-45d0-87b5-9b9c148f33da
```

## Notes

- After opening a canvas, always call `listen` to enable the Collaborate/Finish buttons
- The Excalidraw window will open automatically
- User can click **Collaborate** to request feedback or **Finish** when done
