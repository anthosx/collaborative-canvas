#!/bin/bash
#
# Collaborative Canvas Plugin - Setup Script
#
# Downloads the packaged Electron app from GitHub Releases.
# The MCP server bundle is pre-committed to git (no build step needed).
#
# Usage: ./scripts/setup.sh
#

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
BOLD='\033[1m'
NC='\033[0m'

# Get the directory where this script is located
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PLUGIN_DIR="$(dirname "$SCRIPT_DIR")"

# Read version from plugin manifest
VERSION="v$(node -p "require('$PLUGIN_DIR/.claude-plugin/plugin.json').version" 2>/dev/null || echo '1.0.0')"
REPO="anthosx/collaborative-canvas"

echo ""
echo -e "${BOLD}${BLUE}╔════════════════════════════════════════════════════════════╗${NC}"
echo -e "${BOLD}${BLUE}║        Collaborative Canvas - Setup                        ║${NC}"
echo -e "${BOLD}${BLUE}╚════════════════════════════════════════════════════════════╝${NC}"
echo ""

# Pre-flight: check node version (needed for MCP runtime)
if ! command -v node &> /dev/null; then
    echo -e "${RED}Error: Node.js is not installed${NC}"
    exit 1
fi

NODE_MAJOR=$(node --version | sed 's/v//' | cut -d. -f1)
if [ "$NODE_MAJOR" -lt 18 ]; then
    echo -e "${RED}Error: Node.js 18+ required (found $(node --version))${NC}"
    exit 1
fi
echo -e "  Node.js: ${GREEN}$(node --version)${NC}"

# Step 1: Create XDG storage directory and queue files
echo ""
echo -e "${BLUE}━━━ Creating storage directory${NC}"
XDG_DATA_HOME="${XDG_DATA_HOME:-$HOME/.local/share}"
STORAGE_DIR="$XDG_DATA_HOME/collaborative-canvas"
mkdir -p "$STORAGE_DIR/drawings" "$STORAGE_DIR/logs" "$STORAGE_DIR/screenshots" "$STORAGE_DIR/exports" "$STORAGE_DIR/thumbnails"

# Ensure queue files exist (prevents MCP server crash on first launch)
for QUEUE_FILE in "collaboration-queue.json" "hooks-queue.json"; do
    if [ ! -f "$STORAGE_DIR/$QUEUE_FILE" ]; then
        echo '[]' > "$STORAGE_DIR/$QUEUE_FILE"
    fi
done
echo -e "  ${GREEN}✓${NC} $STORAGE_DIR"

# Step 2: Detect platform and architecture
echo ""
echo -e "${BLUE}━━━ Detecting platform${NC}"
PLATFORM="$(uname -s)"
ARCH="$(uname -m)"

case "$PLATFORM" in
    Darwin)
        case "$ARCH" in
            arm64)  ASSET="collaborative-canvas-mac-arm64.tar.gz" ;;
            x86_64) ASSET="collaborative-canvas-mac-x64.tar.gz" ;;
            *) echo -e "${RED}Unsupported architecture: $ARCH${NC}"; exit 1 ;;
        esac
        DEST_DIR="$PLUGIN_DIR/electron-app/release/mac"
        ;;
    Linux)
        ASSET="collaborative-canvas-linux-x86_64.tar.gz"
        DEST_DIR="$PLUGIN_DIR/electron-app/release/linux"
        ;;
    MINGW*|MSYS*|CYGWIN*)
        ASSET="collaborative-canvas-win-x64.zip"
        DEST_DIR="$PLUGIN_DIR/electron-app/release/win"
        ;;
    *)
        echo -e "${RED}Unsupported platform: $PLATFORM${NC}"
        exit 1
        ;;
esac
echo -e "  Platform: ${GREEN}$PLATFORM ($ARCH)${NC}"
echo -e "  Asset: ${GREEN}$ASSET${NC}"

# Step 3: Download Electron app from GitHub Releases
echo ""
echo -e "${BLUE}━━━ Downloading Electron app ($VERSION)${NC}"

mkdir -p "$DEST_DIR"
TMPDIR=$(mktemp -d)
# Clean up temp dir on exit (using rm is fine for temp dirs we just created)
cleanup() { [ -d "$TMPDIR" ] && rm -rf "$TMPDIR"; }
trap cleanup EXIT

DOWNLOAD_OK=false

if command -v gh &> /dev/null; then
    echo "  Using GitHub CLI..."
    if gh release download "$VERSION" --repo "$REPO" --pattern "$ASSET" --dir "$TMPDIR" 2>&1; then
        DOWNLOAD_OK=true
    fi
else
    echo "  Using curl..."
    DOWNLOAD_URL="https://github.com/$REPO/releases/download/$VERSION/$ASSET"
    if curl -fSL "$DOWNLOAD_URL" -o "$TMPDIR/$ASSET" 2>&1; then
        DOWNLOAD_OK=true
    fi
fi

if [ "$DOWNLOAD_OK" = false ]; then
    echo ""
    echo -e "${RED}Could not download: ${BOLD}$ASSET${NC}"
    echo -e "${YELLOW}The release may not include a build for your platform ($PLATFORM $ARCH).${NC}"
    echo ""
    echo -e "Available assets at: https://github.com/$REPO/releases/tag/$VERSION"
    echo ""
    echo -e "${BLUE}To build from source instead:${NC}"
    echo -e "  cd $PLUGIN_DIR/electron-app"
    echo -e "  npm install"
    echo -e "  npm run build"
    echo -e "  npx electron-builder --dir"
    echo -e "  # Then move the app to: $DEST_DIR/"
    echo ""
    exit 1
fi

echo -e "  ${GREEN}✓${NC} Downloaded $ASSET"

# Step 4: Extract
echo ""
echo -e "${BLUE}━━━ Extracting${NC}"
case "$ASSET" in
    *.tar.gz)
        tar -xzf "$TMPDIR/$ASSET" -C "$DEST_DIR"
        ;;
    *.zip)
        unzip -qo "$TMPDIR/$ASSET" -d "$DEST_DIR"
        ;;
esac

# Strip macOS quarantine attribute
if [ "$PLATFORM" = "Darwin" ]; then
    xattr -rd com.apple.quarantine "$DEST_DIR/Collaborative Canvas.app" 2>/dev/null || true
fi

echo -e "  ${GREEN}✓${NC} Extracted to $DEST_DIR"

# Step 5: Pre-approve MCP tool permissions
echo ""
echo -e "${BLUE}━━━ Configuring tool permissions${NC}"
SETTINGS_FILE="$HOME/.claude/settings.json"
TOOL_RULE="mcp__plugin_collaborative-canvas_canvas__*"

if [ -f "$SETTINGS_FILE" ]; then
    # Check if the rule already exists
    if node -e "
      const s = require('$SETTINGS_FILE');
      const allow = s.permissions?.allow || [];
      process.exit(allow.some(r => r === '$TOOL_RULE') ? 0 : 1);
    " 2>/dev/null; then
        echo -e "  ${GREEN}✓${NC} Tool permissions already configured"
    else
        # Inject the rule into permissions.allow using Node.js for safe JSON manipulation
        if node -e "
          const fs = require('fs');
          const p = '$SETTINGS_FILE';
          const s = JSON.parse(fs.readFileSync(p, 'utf-8'));
          if (!s.permissions) s.permissions = {};
          if (!s.permissions.allow) s.permissions.allow = [];
          s.permissions.allow.push('$TOOL_RULE');
          fs.writeFileSync(p, JSON.stringify(s, null, 2) + '\n');
        " 2>/dev/null; then
            echo -e "  ${GREEN}✓${NC} Added tool pre-approval to settings"
        else
            echo -e "  ${YELLOW}⚠${NC} Could not auto-configure permissions"
            echo -e "  Add this to ~/.claude/settings.json permissions.allow:"
            echo -e "  ${BOLD}\"$TOOL_RULE\"${NC}"
        fi
    fi
else
    echo -e "  ${YELLOW}⚠${NC} ~/.claude/settings.json not found"
    echo -e "  After first Claude Code launch, add to permissions.allow:"
    echo -e "  ${BOLD}\"$TOOL_RULE\"${NC}"
fi

# Done
echo ""
echo -e "${BOLD}${GREEN}╔════════════════════════════════════════════════════════════╗${NC}"
echo -e "${BOLD}${GREEN}║                 Setup Complete!                            ║${NC}"
echo -e "${BOLD}${GREEN}╚════════════════════════════════════════════════════════════╝${NC}"
echo ""
echo -e "  ${GREEN}✓${NC} Storage directory: $STORAGE_DIR"
echo -e "  ${GREEN}✓${NC} MCP server: pre-bundled (mcp-server/dist/bundle.cjs)"
echo -e "  ${GREEN}✓${NC} Electron app: $DEST_DIR"
echo ""
echo -e "${YELLOW}Restart Claude Code to load the plugin, then use:${NC}"
echo -e "  ${BOLD}/canvas My Diagram${NC}"
echo ""
