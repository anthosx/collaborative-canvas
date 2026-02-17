import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { existsSync } from "fs";
import { homedir } from "os";
import path from "path";

/**
 * Client environment types
 */
export type ClientType = 'claude-code' | 'claude-desktop' | 'claude-ai' | 'unknown';

/**
 * Detects which MCP client is connected (Claude Code, Claude Desktop, or Claude.ai)
 * to enable intelligent routing of collaboration notifications.
 */
export class EnvironmentDetector {
  private server: Server;
  private detectedType: ClientType | null = null;

  constructor(server: Server) {
    this.server = server;
  }

  /**
   * Detect the client environment using multiple strategies
   */
  async detect(): Promise<ClientType> {
    if (this.detectedType) {
      return this.detectedType;
    }

    // Strategy 1: Check client version from MCP initialization
    const clientInfo = this.server.getClientVersion();
    if (clientInfo?.name) {
      const name = clientInfo.name.toLowerCase();

      if (name.includes('code') || name.includes('cli')) {
        this.detectedType = 'claude-code';
        console.error(`✅ Environment detected: Claude Code (from client name: ${clientInfo.name})`);
        return this.detectedType;
      }

      if (name.includes('desktop')) {
        this.detectedType = 'claude-desktop';
        console.error(`✅ Environment detected: Claude Desktop (from client name: ${clientInfo.name})`);
        return this.detectedType;
      }

      if (name.includes('web') || name.includes('ai') || name.includes('cloud')) {
        this.detectedType = 'claude-ai';
        console.error(`✅ Environment detected: Claude.ai (from client name: ${clientInfo.name})`);
        return this.detectedType;
      }
    }

    // Strategy 2: Check capabilities (hooks support suggests Claude Code)
    const capabilities = this.server.getClientCapabilities();
    if (capabilities) {
      // Claude Code might have specific capability patterns
      // This is speculative - adjust based on actual capability differences
      const capsString = JSON.stringify(capabilities);
      console.error(`📊 Client capabilities: ${capsString.substring(0, 200)}...`);
    }

    // Strategy 3: File system detection (fallback)
    const homeDir = homedir();

    // Check for Claude Code config
    const claudeCodeConfigLocal = path.join(homeDir, '.claude', 'settings.json');

    // Check for Claude Desktop config (macOS)
    const claudeDesktopConfigMac = path.join(
      homeDir,
      'Library/Application Support/Claude/claude_desktop_config.json'
    );

    // Check for Claude Desktop config (Windows)
    const appData = process.env.APPDATA || '';
    const claudeDesktopConfigWin = path.join(appData, 'Claude/claude_desktop_config.json');

    if (existsSync(claudeCodeConfigLocal)) {
      this.detectedType = 'claude-code';
      console.error(`✅ Environment detected: Claude Code (from config file: ${claudeCodeConfigLocal})`);
      return this.detectedType;
    }

    if (existsSync(claudeDesktopConfigMac) || existsSync(claudeDesktopConfigWin)) {
      this.detectedType = 'claude-desktop';
      console.error(`✅ Environment detected: Claude Desktop (from config file)`);
      return this.detectedType;
    }

    // Default: unknown
    this.detectedType = 'unknown';
    console.error(`⚠️  Environment detection uncertain - will try all methods`);
    return this.detectedType;
  }

  /**
   * Get the detected client type (cached)
   */
  getClientType(): ClientType {
    return this.detectedType || 'unknown';
  }

  /**
   * Check if the current client supports hooks
   */
  supportsHooks(): boolean {
    return this.detectedType === 'claude-code';
  }

  /**
   * Check if the current client supports MCP notifications
   */
  supportsNotifications(): boolean {
    return this.detectedType === 'claude-desktop' || this.detectedType === 'claude-ai';
  }

  /**
   * Check if the current client supports sampling
   */
  supportsSampling(): boolean {
    // Currently no client supports this, but keep for future
    return false;
  }
}
