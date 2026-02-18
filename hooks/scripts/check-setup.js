#!/usr/bin/env node

/**
 * PreToolUse hook for open_canvas
 * Blocks the tool if the Electron app hasn't been downloaded yet,
 * giving Claude a clear instruction to run setup.sh first.
 *
 * This prevents the silent ~30s stall that occurs when openCanvas.ts
 * auto-downloads the Electron app inside the MCP tool call.
 */

const fs = require('fs');
const path = require('path');

// Resolve plugin root from env (set by Claude Code for plugin hooks)
// or from this script's location (hooks/scripts/ -> plugin root)
const pluginRoot = process.env.CLAUDE_PLUGIN_ROOT || path.resolve(__dirname, '../..');
const electronAppPath = path.join(pluginRoot, 'electron-app');

/**
 * Check if the packaged Electron binary exists for the current platform.
 * Mirrors the candidate paths in openCanvas.ts findElectronApp().
 */
function hasElectronApp() {
  const platform = process.platform;
  const arch = process.arch;
  let candidates = [];

  if (platform === 'darwin') {
    const appName = 'Collaborative Canvas.app';
    candidates = [
      path.join(electronAppPath, 'release/mac', appName),
      path.join(electronAppPath, `release/mac-${arch}`, appName),
      path.join(electronAppPath, 'release/mac-arm64', appName),
      path.join(electronAppPath, 'release/mac-x64', appName),
    ];
  } else if (platform === 'linux') {
    candidates = [
      path.join(electronAppPath, 'release/linux-unpacked/collaborative-canvas'),
      path.join(electronAppPath, 'release/linux-unpacked/Collaborative Canvas'),
    ];
  } else if (platform === 'win32') {
    candidates = [
      path.join(electronAppPath, 'release/win-unpacked/Collaborative Canvas.exe'),
    ];
  }

  // Deduplicate and check
  const seen = new Set();
  for (const candidate of candidates) {
    if (seen.has(candidate)) continue;
    seen.add(candidate);
    if (fs.existsSync(candidate)) return true;
  }

  return false;
}

try {
  // Read hook input from stdin (PreToolUse provides tool_name, tool_input)
  const hookInput = JSON.parse(fs.readFileSync(0, 'utf-8'));

  if (!hasElectronApp()) {
    // Determine the correct setup command for this platform
    const setupScript = process.platform === 'win32'
      ? path.join(pluginRoot, 'scripts', 'setup.ps1')
      : path.join(pluginRoot, 'scripts', 'setup.sh');

    const setupCmd = process.platform === 'win32'
      ? `powershell -ExecutionPolicy Bypass -File "${setupScript}"`
      : `bash "${setupScript}"`;

    console.log(JSON.stringify({
      decision: "block",
      reason:
        "The Collaborative Canvas desktop app hasn't been downloaded yet. " +
        "Run the setup script to download it (~100MB), then retry:\n\n" +
        `  ${setupCmd}\n\n` +
        "Setup takes about 30 seconds. It will download the Electron app " +
        "from GitHub Releases and configure tool permissions."
    }));
  } else {
    // Electron exists -- allow the tool to proceed
    console.log(JSON.stringify({}));
  }

  process.exit(0);
} catch (error) {
  // On any error, allow the tool to proceed (don't block on hook failure)
  console.error('[check-setup] Error:', error.message);
  console.log(JSON.stringify({}));
  process.exit(0);
}
