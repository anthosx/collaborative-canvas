#!/usr/bin/env node

/**
 * SessionStart hook for Collaborative Canvas
 * Checks environment readiness at session start and returns a systemMessage
 * so Claude knows the setup state before the user asks about canvas.
 */

const fs = require('fs');
const path = require('path');
const os = require('os');

// Resolve plugin root from env or script location
const pluginRoot = process.env.CLAUDE_PLUGIN_ROOT || path.resolve(__dirname, '../..');
const electronAppPath = path.join(pluginRoot, 'electron-app');

/**
 * Get the storage directory for the current platform
 */
function getStorageDir() {
  if (process.platform === 'win32') {
    const localAppData = process.env.LOCALAPPDATA
      || path.join(os.homedir(), 'AppData', 'Local');
    return path.join(localAppData, 'collaborative-canvas');
  }
  const xdgDataHome = process.env.XDG_DATA_HOME
    || path.join(os.homedir(), '.local', 'share');
  return path.join(xdgDataHome, 'collaborative-canvas');
}

/**
 * Check if the packaged Electron binary exists
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

  const seen = new Set();
  for (const candidate of candidates) {
    if (seen.has(candidate)) continue;
    seen.add(candidate);
    if (fs.existsSync(candidate)) return true;
  }
  return false;
}

try {
  const issues = [];

  // Check storage directory
  const storageDir = getStorageDir();
  if (!fs.existsSync(storageDir)) {
    issues.push('storage directory missing');
  }

  // Check Electron binary
  if (!hasElectronApp()) {
    issues.push('Electron app not downloaded');
  }

  if (issues.length > 0) {
    const setupCmd = process.platform === 'win32'
      ? `powershell -ExecutionPolicy Bypass -File "${path.join(pluginRoot, 'scripts', 'setup.ps1')}"`
      : `bash "${path.join(pluginRoot, 'scripts', 'setup.sh')}"`;

    console.log(JSON.stringify({
      systemMessage:
        `[Collaborative Canvas] Setup incomplete (${issues.join(', ')}). ` +
        `If the user wants to use the canvas, run the setup script first: ${setupCmd}`
    }));
  } else {
    // Everything looks good -- no message needed
    console.log(JSON.stringify({}));
  }

  process.exit(0);
} catch (error) {
  // Don't crash on errors -- just skip the check
  console.error('[check-environment] Error:', error.message);
  console.log(JSON.stringify({}));
  process.exit(0);
}
