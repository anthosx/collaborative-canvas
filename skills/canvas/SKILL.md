---
name: canvas
description: Use when the user asks to draw diagrams, create flowcharts, sketch architecture, visualize concepts, make a canvas, open Excalidraw, or mentions visual collaboration. Provides AI-powered visual collaboration using Excalidraw.
version: 1.0.0
allowed-tools: [mcp__plugin_collaborative-canvas_canvas__open_canvas, mcp__plugin_collaborative-canvas_canvas__close_canvas, mcp__plugin_collaborative-canvas_canvas__list_canvases, mcp__plugin_collaborative-canvas_canvas__save_canvas, mcp__plugin_collaborative-canvas_canvas__get_canvas_state, mcp__plugin_collaborative-canvas_canvas__update_canvas, mcp__plugin_collaborative-canvas_canvas__export_canvas, mcp__plugin_collaborative-canvas_canvas__delete_canvases, mcp__plugin_collaborative-canvas_canvas__listen, mcp__plugin_collaborative-canvas_canvas__add_to_canvas, mcp__plugin_collaborative-canvas_canvas__close_widget, mcp__plugin_collaborative-canvas_canvas__capture_screenshot]
---

# Canvas - Visual Collaboration

## Overview

Canvas provides AI-powered visual collaboration using Excalidraw. Create diagrams, flowcharts, system architectures, and visual documentation with Claude's assistance.

## When to Use

- Create diagrams or flowcharts
- Sketch system architecture
- Visualize concepts or ideas
- Make technical drawings
- Visual collaboration on designs

## Workflow

1. **Open canvas**: `open_canvas({ name: "My Diagram" })`
2. **Wait for user**: `listen({ drawingId: "..." })`
3. User draws in the Excalidraw window
4. User clicks **Collaborate** for feedback
5. **Review**: `get_canvas_state({ drawingId: "..." })`
6. **Add elements**: `save_canvas({ drawingId: "...", elements: [...] })`
7. Repeat until user clicks **Finish**
8. **Close**: `close_widget({ drawingId: "..." })`

## Key Tools

| Tool | Purpose |
|------|---------|
| `open_canvas` | Create or open a drawing |
| `listen` | Wait for user collaboration |
| `save_canvas` | Save elements to canvas |
| `get_canvas_state` | View current drawing state |
| `add_to_canvas` | Add elements programmatically |
| `close_widget` | Close the Excalidraw window |
| `list_canvases` | List all saved drawings |
| `capture_screenshot` | Capture canvas as image |

## Best Practices

1. **Always call listen** after opening or saving a canvas to wait for user input
2. **Use compact element format** for large diagrams to stay within token limits
3. **Respond visually** - add annotations and elements when collaborating
4. **Close properly** - call close_widget when finished to clean up

## Element Format

When adding elements, use compact format:

```json
{
  "elements": [
    { "type": "rectangle", "x": 100, "y": 100, "width": 200, "height": 100 },
    { "type": "text", "x": 150, "y": 130, "text": "Hello" },
    { "type": "arrow", "x": 300, "y": 150, "points": [[0, 0], [100, 50]] }
  ]
}
```

IDs are auto-generated if not provided.

## Storage Location

Drawings are saved to `~/.local/share/collaborative-canvas/drawings/` with metadata.
