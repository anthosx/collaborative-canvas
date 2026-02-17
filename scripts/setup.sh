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

# Step 1: Create XDG storage directory
echo ""
echo -e "${BLUE}━━━ Creating storage directory${NC}"
XDG_DATA_HOME="${XDG_DATA_HOME:-$HOME/.local/share}"
STORAGE_DIR="$XDG_DATA_HOME/collaborative-canvas"
mkdir -p "$STORAGE_DIR/drawings"
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
trap 'rm -rf "$TMPDIR"' EXIT

if command -v gh &> /dev/null; then
    echo "  Using GitHub CLI..."
    gh release download "$VERSION" --repo "$REPO" --pattern "$ASSET" --dir "$TMPDIR" 2>&1 || {
        echo -e "${RED}Failed to download from GitHub Releases.${NC}"
        echo -e "Make sure release ${BOLD}$VERSION${NC} exists at: https://github.com/$REPO/releases"
        exit 1
    }
else
    echo "  Using curl..."
    DOWNLOAD_URL="https://github.com/$REPO/releases/download/$VERSION/$ASSET"
    curl -fSL "$DOWNLOAD_URL" -o "$TMPDIR/$ASSET" 2>&1 || {
        echo -e "${RED}Failed to download: $DOWNLOAD_URL${NC}"
        echo -e "Make sure release ${BOLD}$VERSION${NC} exists at: https://github.com/$REPO/releases"
        exit 1
    }
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
