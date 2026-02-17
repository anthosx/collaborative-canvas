# Collaborative Canvas - Developer Documentation

**Version 1.0.0** - Claude Code Plugin for Visual Collaboration

> AI-powered visual collaboration powered by Excalidraw. Create diagrams, flowcharts, and architecture sketches with Claude's assistance. Or just draw with Claude for fun.

## ⚠️ Build Required Before Distribution

This plugin must be built before installation or distribution. Run the setup script:

```bash
./scripts/setup.sh
```

This builds:
- MCP server → `mcp-server/dist/`
- Electron app → `electron-app/release/mac/Collaborative Canvas.app`

Without building, the plugin will fail to load (missing compiled JavaScript and packaged app).

---

## System Overview

### Purpose

Collaborative Canvas enables visual collaboration between users and Claude. Users draw diagrams in a native Excalidraw window, click "Collaborate" for Claude's feedback, and Claude can analyze and add elements to the canvas.

### Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        Claude Code                               │
│                                                                  │
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────┐      │
│  │   Hooks      │    │  MCP Client  │    │   Plugin     │      │
│  │  (PostTool)  │◄──►│              │◄──►│   Config     │      │
│  └──────────────┘    └──────────────┘    └──────────────┘      │
│         │                   │                                    │
└─────────┼───────────────────┼────────────────────────────────────┘
          │                   │ stdio (JSON-RPC)
          │                   ▼
          │         ┌──────────────────┐
          │         │   MCP Server     │
          │         │   (Node.js)      │
          │         └──────────────────┘
          │                   │
          │                   ▼
          │         ┌──────────────────┐
          │         │  DrawingStorage  │◄─────────────────┐
          │         │  (File-based)    │                  │
          │         └──────────────────┘                  │
          │                   │                           │
          ▼                   │                           │
┌─────────────────┐           │                           │
│   Hook Queue    │◄──────────┼───────────────────────────┤
│  (JSON file)    │           │                           │
└─────────────────┘           │                           │
          ▲                   ▼                           │
          │         ┌──────────────────┐                  │
          └─────────┤  Electron App    │──────────────────┘
                    │  (Excalidraw)    │
                    └──────────────────┘
```

### Components

| Component | Technology | Purpose |
|-----------|------------|---------|
| MCP Server | Node.js/TypeScript | Provides tools to Claude via MCP protocol |
| Electron App | Electron/React | Native Excalidraw editor window |
| Hook Scripts | Node.js | PostToolUse hooks for collaboration workflow |
| Storage | JSON files | Persists drawings and queue state |

## Directory Structure

```
collaborative-canvas/
├── .claude-plugin/
│   └── plugin.json              # Plugin manifest (name, version, etc.)
├── .mcp.json                    # MCP server configuration
├── hooks/
│   ├── hooks.json               # Hook event configuration
│   └── scripts/
│       ├── open-canvas-choice.js    # Force listen/save after open
│       ├── save-canvas-listen.js    # Auto-trigger listen after save
│       ├── collaboration-poll.js    # 30-min polling for buttons
│       └── get-canvas-state-decision.js  # Force close/save decision
├── skills/
│   └── canvas/
│       └── SKILL.md             # Auto-activating skill definition
├── commands/
│   └── canvas.md                # /canvas slash command
├── mcp-server/
│   ├── package.json
│   ├── tsconfig.json
│   ├── src/
│   │   ├── index.ts             # Entry point
│   │   ├── server.ts            # MCP server (11 tools, 3 resources)
│   │   ├── storage/
│   │   │   └── DrawingStorage.ts    # File-based CRUD
│   │   ├── tools/
│   │   │   ├── openCanvas.ts    # Create/open + launch Electron
│   │   │   ├── saveCanvas.ts    # Persist elements
│   │   │   ├── getCanvasState.ts    # Compact JSON format
│   │   │   ├── addToCanvas.ts   # Add elements
│   │   │   ├── listen.ts        # Wait for collaboration
│   │   │   ├── closeWidget.ts   # Close Electron window
│   │   │   └── ...              # Other tools
│   │   ├── collaboration/       # Strategy pattern (future)
│   │   ├── api/                 # HTTP client (browser fallback)
│   │   └── types/               # TypeScript definitions
│   └── dist/                    # Compiled output
├── electron-app/
│   ├── package.json
│   ├── main/
│   │   ├── main.ts              # Electron entry point
│   │   ├── WindowManager.ts     # Window lifecycle
│   │   ├── ipc-handlers.ts      # IPC + direct hook queue writes
│   │   └── storage/             # Bundled DrawingStorage
│   ├── renderer/
│   │   ├── App.tsx              # React main component
│   │   └── components/
│   │       ├── ExcalidrawCanvas.tsx
│   │       ├── Toolbar.tsx
│   │       └── SaveConfirmDialog.tsx
│   ├── dist/                    # Built output
│   └── release/                 # Packaged app (.app, .exe)
├── scripts/
│   └── setup.sh                 # Build script
├── package.json                 # Root package.json
├── README.md                    # User documentation
└── CLAUDE.md                    # This file
```

## Storage

### XDG-Compliant Path

```
~/.local/share/collaborative-canvas/
├── drawings/
│   ├── {uuid}.excalidraw        # Drawing files (JSON)
│   └── {uuid}.meta.json         # Metadata (name, dates, tags)
├── hooks-queue.json             # Collaboration request queue
├── listen-state-{id}.json       # Per-drawing listen state
├── collaboration-status.json    # Retry tracking
├── logs/                        # Log files
└── screenshots/                 # Captured canvas images
```

### Key Files

| File | Purpose |
|------|---------|
| `drawings/*.excalidraw` | Excalidraw scene (elements, appState) |
| `drawings/*.meta.json` | Metadata (name, timestamps, elementCount) |
| `hooks-queue.json` | Queue for Collaborate/Finish button clicks |
| `listen-state-{id}.json` | Tracks active listen state per drawing |

## Data Flows

### 1. Opening a Canvas

```
User: "Open a new canvas called Architecture"
    │
    ▼
Claude calls open_canvas({ name: "Architecture" })
    │
    ▼
MCP Server:
    ├── DrawingStorage.createDrawing()
    ├── Save to ~/.local/share/collaborative-canvas/drawings/
    └── spawn Electron app with drawing ID
    │
    ▼
Electron opens with drawing ID in URL
    │
    ▼
PostToolUse hook: open-canvas-choice.js
    │
    ▼
Returns additionalContext: "Call listen or save_canvas"
    │
    ▼
Claude calls listen({ drawingId: "..." })
    │
    ▼
PostToolUse hook: collaboration-poll.js starts polling
```

### 2. Collaboration Flow

```
User draws in Excalidraw, clicks "Collaborate"
    │
    ▼
Electron IPC: writeToHooksQueue()
    ├── Acquires file lock
    ├── Writes to ~/.local/share/collaborative-canvas/hooks-queue.json
    └── { drawingId, elementCount, timestamp, type: 'collaborate' }
    │
    ▼
collaboration-poll.js (polling every 3 seconds)
    ├── Detects request in queue
    ├── Validates listen-state file exists
    ├── Atomically removes request from queue
    └── Returns additionalContext with instruction
    │
    ▼
Claude receives: "CRITICAL INSTRUCTION: Call get_canvas_state..."
    │
    ▼
Claude calls get_canvas_state({ drawingId: "..." })
    │
    ▼
Returns compact JSON of elements (~4.9x compression)
    │
    ▼
Claude analyzes diagram, optionally calls save_canvas to add elements
    │
    ▼
Claude calls listen() again to wait for next interaction
```

### 3. Element Update Flow (Claude → Widget)

```
Claude calls save_canvas({ drawingId, elements: [...] })
    │
    ▼
MCP Server:
    ├── Normalizes elements (auto-generates IDs)
    ├── Sets customData.createdBy = 'claude'
    └── DrawingStorage.updateDrawing()
    │
    ▼
Writes to ~/.local/share/collaborative-canvas/drawings/{id}.excalidraw
    │
    ▼
Electron polling (every 2 seconds)
    ├── Compares file modification time
    ├── If newer: IPC load-drawing
    └── React state update
    │
    ▼
Excalidraw re-renders with Claude's additions
```

### 4. Finish Flow

```
User clicks "Finish" button
    │
    ▼
Electron IPC: writeToHooksQueue({ type: 'finished' })
    │
    ▼
collaboration-poll.js detects { type: 'finished' }
    │
    ▼
Returns additionalContext: "Call close_widget..."
    │
    ▼
Claude calls close_widget({ drawingId: "..." })
    │
    ▼
MCP Server writes close-signal-{id}.json
    │
    ▼
Electron polling detects close signal
    │
    ▼
Window closes gracefully
```

## MCP Tools

| Tool | Purpose |
|------|---------|
| `open_canvas` | Create/open drawing, launch Electron |
| `save_canvas` | Save elements with optional Mermaid |
| `get_canvas_state` | Get compact JSON of elements |
| `add_to_canvas` | Add elements (supports compact format) |
| `update_canvas` | Update metadata (name, tags) |
| `list_canvases` | List all drawings with filtering |
| `delete_canvases` | Two-step delete with preview |
| `listen` | Wait for Collaborate/Finish buttons |
| `close_widget` | Close Electron window |
| `capture_screenshot` | Capture canvas as PNG |
| `export_canvas` | Export (placeholder for Phase 3) |

## MCP Resources

| Resource | Description |
|----------|-------------|
| `drawing://list` | List all drawings with metadata |
| `drawing://{id}` | Get specific drawing state |
| `drawing://active` | Get current active drawing |

## Hook Configuration

### hooks/hooks.json

```json
{
  "hooks": {
    "PostToolUse": [
      { "matcher": "mcp__canvas__open_canvas", "hooks": [...] },
      { "matcher": "mcp__canvas__save_canvas", "hooks": [...] },
      { "matcher": "mcp__canvas__listen", "hooks": [...] },
      { "matcher": "mcp__canvas__get_canvas_state", "hooks": [...] }
    ]
  }
}
```

### Hook Scripts

| Script | Trigger | Timeout | Purpose |
|--------|---------|---------|---------|
| `open-canvas-choice.js` | After open_canvas | 10s | Force listen/save decision |
| `save-canvas-listen.js` | After save_canvas | 10s | Auto-trigger listen |
| `collaboration-poll.js` | After listen | 30 min | Poll for button clicks |
| `get-canvas-state-decision.js` | After get_canvas_state | 10s | Force close/save decision |

## Key Design Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Storage path | `~/.local/share/collaborative-canvas/` | XDG compliance, Electron standard |
| MCP server name | `canvas` | Short tool prefixes (`mcp__canvas__*`) |
| Direct hook queue | Electron writes to hooks-queue.json | Avoids race conditions with multiple MCP instances |
| Compact JSON | ~4.9x compression | Prevents token limit issues |
| Listen timeout | 30 minutes | Long collaboration sessions |
| File locking | proper-lockfile | Atomic queue operations |

## Development

### Building

```bash
# Full setup
./scripts/setup.sh

# Individual components
cd mcp-server && npm run build
cd electron-app && npm run build && npm run package:dir
```

### Development Mode

```bash
# Enable hot reload
export EXCALIDRAW_DEV=1

# Start Vite dev server
cd electron-app && npm run dev:renderer

# Then use Claude Code normally
claude
```

### Testing

```bash
# After plugin is installed
/canvas Test Diagram
```

## Troubleshooting

### Electron not opening

1. Check packaged app exists: `ls electron-app/release/mac/`
2. Verify CANVAS_PLUGIN_ROOT is set in MCP env
3. Check MCP server logs for spawn errors

### Buttons not working

1. Verify `listen` was called (creates listen-state file)
2. Check hooks-queue.json for pending requests
3. Look for stale requests (>60 seconds old)

### Elements not appearing

1. Check drawing file exists in storage
2. Verify element IDs are unique
3. Check for sanitization filtering in Electron

## Version History

- **1.0.0** - Initial plugin release
  - Full MCP server with 11 tools
  - Electron desktop app
  - PostToolUse hooks for collaboration
  - XDG-compliant storage
