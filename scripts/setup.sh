#!/bin/bash
#
# Collaborative Canvas Plugin - Setup Script
#
# Installs dependencies and builds all components:
# 1. MCP server (Node.js/TypeScript)
# 2. Electron app (desktop client)
#
# Usage: ./scripts/setup.sh
#
# After setup: Enable the plugin in Claude Code and restart.
#

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
BOLD='\033[1m'
NC='\033[0m' # No Color

# Get the directory where this script is located
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PLUGIN_DIR="$(dirname "$SCRIPT_DIR")"

# Track timing
START_TIME=$(date +%s)

echo ""
echo -e "${BOLD}${BLUE}╔════════════════════════════════════════════════════════════╗${NC}"
echo -e "${BOLD}${BLUE}║        Collaborative Canvas Plugin - Setup                 ║${NC}"
echo -e "${BOLD}${BLUE}╚════════════════════════════════════════════════════════════╝${NC}"
echo ""
echo -e "Plugin directory: ${BOLD}$PLUGIN_DIR${NC}"
echo ""

# Function to print step headers
step() {
    echo ""
    echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo -e "${BOLD}Step $1: $2${NC}"
    echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
}

# Function to check if command exists
check_command() {
    if ! command -v "$1" &> /dev/null; then
        echo -e "${RED}Error: $1 is not installed${NC}"
        echo "Please install $1 and try again."
        exit 1
    fi
}

# Pre-flight checks
echo -e "${YELLOW}Running pre-flight checks...${NC}"
check_command "node"
check_command "npm"

NODE_VERSION=$(node --version)
echo -e "  Node.js: ${GREEN}$NODE_VERSION${NC}"

NPM_VERSION=$(npm --version)
echo -e "  npm: ${GREEN}v$NPM_VERSION${NC}"

# Check Node.js version (need 18+)
NODE_MAJOR=$(echo "$NODE_VERSION" | sed 's/v//' | cut -d. -f1)
if [ "$NODE_MAJOR" -lt 18 ]; then
    echo -e "${RED}Error: Node.js 18+ required (found $NODE_VERSION)${NC}"
    exit 1
fi

echo -e "  ${GREEN}Pre-flight checks passed!${NC}"

# Create XDG data directory if it doesn't exist
XDG_DATA_HOME="${XDG_DATA_HOME:-$HOME/.local/share}"
STORAGE_DIR="$XDG_DATA_HOME/collaborative-canvas"
if [ ! -d "$STORAGE_DIR" ]; then
    echo -e "${YELLOW}Creating storage directory: $STORAGE_DIR${NC}"
    mkdir -p "$STORAGE_DIR/drawings"
fi

# Step 1: Install MCP server dependencies
step "1/4" "Installing MCP server dependencies"
cd "$PLUGIN_DIR/mcp-server"
echo "Running npm install in mcp-server/..."
npm install --silent
echo -e "${GREEN}MCP server dependencies installed${NC}"

# Step 2: Build MCP server
step "2/4" "Building MCP server"
echo "Running npm run build in mcp-server/..."
npm run build --silent
echo -e "${GREEN}MCP server built successfully${NC}"

# Step 3: Install Electron app dependencies
step "3/4" "Installing Electron app dependencies"
cd "$PLUGIN_DIR/electron-app"
echo "Running npm install in electron-app/..."
npm install --silent
echo -e "${GREEN}Electron app dependencies installed${NC}"

# Step 4: Build and package Electron app
step "4/4" "Building and packaging Electron app"
echo "Running npm run build in electron-app/..."
npm run build --silent
echo -e "${GREEN}Electron app built${NC}"

echo "Running npm run package:dir in electron-app/..."
npm run package:dir --silent 2>/dev/null || npm run package:dir
echo -e "${GREEN}Electron app packaged${NC}"

# Verify the packaged app exists
if [ -d "$PLUGIN_DIR/electron-app/release/mac/Collaborative Canvas.app" ]; then
    echo -e "  App location: ${BOLD}electron-app/release/mac/Collaborative Canvas.app${NC}"
elif [ -d "$PLUGIN_DIR/electron-app/release/mac-arm64/Collaborative Canvas.app" ]; then
    echo -e "  App location: ${BOLD}electron-app/release/mac-arm64/Collaborative Canvas.app${NC}"
else
    echo -e "${YELLOW}  Note: Packaged app location may vary by platform${NC}"
fi

# Calculate elapsed time
END_TIME=$(date +%s)
ELAPSED=$((END_TIME - START_TIME))
MINUTES=$((ELAPSED / 60))
SECONDS=$((ELAPSED % 60))

# Final summary
echo ""
echo -e "${BOLD}${GREEN}╔════════════════════════════════════════════════════════════╗${NC}"
echo -e "${BOLD}${GREEN}║                 Setup Complete!                            ║${NC}"
echo -e "${BOLD}${GREEN}╚════════════════════════════════════════════════════════════╝${NC}"
echo ""
echo -e "Time elapsed: ${BOLD}${MINUTES}m ${SECONDS}s${NC}"
echo ""
echo -e "${YELLOW}${BOLD}Next steps:${NC}"
echo ""
echo "1. Install the plugin:"
echo -e "   ${BOLD}claude plugin install $PLUGIN_DIR --scope user${NC}"
echo ""
echo "2. Restart Claude Code to load the plugin"
echo ""
echo "3. Use the canvas:"
echo -e "   ${BOLD}/canvas My Diagram${NC}"
echo ""
echo "What was installed:"
echo -e "  ${GREEN}✓${NC} MCP server (mcp-server/dist/)"
echo -e "  ${GREEN}✓${NC} Electron app (electron-app/release/)"
echo -e "  ${GREEN}✓${NC} Storage directory ($STORAGE_DIR)"
echo ""
echo "Configuration files:"
echo -e "  - Plugin manifest: ${BOLD}.claude-plugin/plugin.json${NC}"
echo -e "  - MCP config: ${BOLD}.mcp.json${NC}"
echo -e "  - Hooks config: ${BOLD}hooks/hooks.json${NC}"
echo ""
