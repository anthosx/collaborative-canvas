# Collaborative Canvas for Claude Code

**Chat. Draw. Diagram. Claude.**

**Freely collaborate with Claude Code on an infinite canvas.**

**Powered by Excalidraw.**

---

Prefer to communicate through flowcharts or graphs? Want to sketch an idea for Claude instead of writing a prompt? Want Claude to sketch a rocket ship with your five year old?

**Collaborative Canvas** empowers you to share messages and drawings with Claude via an open Excalidraw canvas. Claude will listen for your work whenever you press **collaborate**, and then **write/draw you messages directly back on the canvas.**

Simply ask Claude to start a new drawing (you can specify too what you want that drawing to be), and it'll open a new drawing session.

---

## Features

- **Real-time collaboration** - Claude can see your drawings and provide feedback
- **Visual feedback** - Claude adds elements, annotations, and suggestions directly to your canvas
- **Native desktop app** - Electron-based Excalidraw canvas with native menus and export
- **Auto-save** - Changes are automatically saved as you draw
- **Multiple canvases** - Create and manage multiple drawings

---

## Installation

### Prerequisites

- Node.js 18+
- npm

### Setup

1. Clone or download this plugin:
   ```bash
   git clone https://github.com/anthosx/collaborative-canvas.git
   cd collaborative-canvas
   ```

2. Run the setup script:
   ```bash
   ./scripts/setup.sh
   ```

3. Install the plugin in Claude Code:
   ```bash
   claude plugin install /path/to/collaborative-canvas --scope user
   ```

4. Restart Claude Code to load the plugin.

---

## Usage

### Quick Start

```
"Let's start a new drawing"
```

This opens a new canvas. The Excalidraw window will open automatically.

### Workflow

1. **Create a canvas**: Tell Claude to open a canvas
2. **Draw your content**: Use Excalidraw tools to create your diagram
3. **Click Collaborate**: When you want Claude's feedback
4. **Review suggestions**: Claude analyzes your drawing and adds elements
5. **Continue editing**: Make changes and collaborate again
6. **Click Finish**: When done, to close the canvas

### Commands

- `/canvas <name>` - Create a new canvas with the given name
- `/canvas --list` - List all saved canvases
- `/canvas --open <id>` - Open an existing canvas by ID

### Tools

The plugin provides these MCP tools:

| Tool | Description |
|------|-------------|
| `open_canvas` | Create or open a drawing |
| `listen` | Wait for user collaboration |
| `save_canvas` | Save elements to canvas |
| `get_canvas_state` | View current drawing state |
| `add_to_canvas` | Add elements programmatically |
| `close_widget` | Close the Excalidraw window |
| `list_canvases` | List all saved drawings |
| `delete_canvases` | Delete drawings |
| `capture_screenshot` | Capture canvas as image |

## Storage

Drawings are stored in XDG-compliant location:

```
~/.local/share/collaborative-canvas/
├── drawings/
│   ├── {uuid}.excalidraw    # Drawing files
│   └── {uuid}.meta.json     # Metadata
├── hooks-queue.json         # Collaboration queue
└── screenshots/             # Captured screenshots
```

## Architecture

```
collaborative-canvas/
├── .claude-plugin/          # Plugin manifest
├── .mcp.json               # MCP server config
├── hooks/                   # PostToolUse hooks
│   ├── hooks.json          # Hook configuration
│   └── scripts/            # Hook scripts
├── skills/                  # Auto-activating skills
├── commands/               # Slash commands
├── mcp-server/             # MCP server (Node.js)
└── electron-app/           # Electron app
```

## Development

### Building

```bash
# Build MCP server
cd mcp-server && npm run build

# Build Electron app
cd electron-app && npm run build && npm run package:dir
```

### Development Mode

Set `EXCALIDRAW_DEV=1` before starting Claude Code to enable hot reload:

```bash
export EXCALIDRAW_DEV=1
claude
```

Then in a separate terminal, start the Vite dev server:

```bash
cd electron-app && npm run dev:renderer
```

## License

This project is dual-licensed:

- **Open Source**: [AGPL-3.0](LICENSES/AGPL-3.0.txt) - Free for open source use
- **Commercial**: [Contact for licensing](LICENSE-COMMERCIAL.md) - For proprietary use

This project uses [Excalidraw](https://github.com/excalidraw/excalidraw) (MIT License).
See [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md) for full attribution.
