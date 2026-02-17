import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { EnvironmentDetector, ClientType } from "./EnvironmentDetector.js";
import { CollaborationStrategy } from "./CollaborationStrategy.js";
import { HooksStrategy } from "./HooksStrategy.js";
import { NotificationsStrategy } from "./NotificationsStrategy.js";
import { SamplingStrategy } from "./SamplingStrategy.js";

/**
 * Orchestrates collaboration notifications across different Claude clients.
 *
 * Intelligently detects the client environment (Claude Code, Claude Desktop, Claude.ai)
 * and routes collaboration requests to the appropriate notification strategy:
 *
 * - Claude Code: PostToolUse hooks (deprecated - no longer used)
 * - Claude Desktop/ai: Uses MCP notifications/message
 * - Unknown/Future: Attempts sampling/createMessage + fallbacks
 */
export class CollaborationManager {
  private environmentDetector: EnvironmentDetector;
  private strategies: Map<string, CollaborationStrategy>;
  private initialized: boolean = false;

  constructor(
    server: Server
  ) {
    this.environmentDetector = new EnvironmentDetector(server);
    this.strategies = new Map();

    // Initialize all strategies
    this.strategies.set('hooks', new HooksStrategy());
    this.strategies.set('notifications', new NotificationsStrategy(server));
    this.strategies.set('sampling', new SamplingStrategy(server));
  }

  /**
   * Initialize the collaboration manager (detect environment)
   */
  async initialize(): Promise<void> {
    if (this.initialized) {
      return;
    }

    console.error('\n🔍 Detecting Claude client environment...');
    await this.environmentDetector.detect();

    const clientType = this.environmentDetector.getClientType();
    console.error(`✅ Client type: ${clientType}\n`);

    this.initialized = true;
  }

  /**
   * Send collaboration notification using the appropriate strategy
   */
  async notifyCollaboration(drawingId: string, drawingName: string, elementCount: number, type?: 'collaborate' | 'finished'): Promise<void> {
    // Ensure initialized
    if (!this.initialized) {
      await this.initialize();
    }

    const clientType = this.environmentDetector.getClientType();

    console.error(`\n${'='.repeat(80)}`);
    console.error(`🤖 COLLABORATION REQUEST RECEIVED`);
    console.error(`${'='.repeat(80)}`);
    console.error(`Drawing: ${drawingName}`);
    console.error(`ID: ${drawingId}`);
    console.error(`Elements: ${elementCount}`);
    console.error(`Client: ${clientType}`);
    console.error(`${'='.repeat(80)}\n`);

    // Select strategy based on client type
    const strategyResults: Array<{ name: string; success: boolean; error?: string }> = [];

    switch (clientType) {
      case 'claude-code':
        await this.executeStrategy('hooks', drawingId, drawingName, elementCount, type, strategyResults);
        break;

      case 'claude-desktop':
      case 'claude-ai':
        await this.executeStrategy('notifications', drawingId, drawingName, elementCount, type, strategyResults);
        // Also try sampling (future-proofing)
        await this.executeStrategy('sampling', drawingId, drawingName, elementCount, type, strategyResults);
        break;

      case 'unknown':
        // Try all strategies (belt and suspenders approach)
        console.error(`⚠️  Client type unknown - attempting all notification methods...\n`);
        await this.executeStrategy('hooks', drawingId, drawingName, elementCount, type, strategyResults);
        await this.executeStrategy('notifications', drawingId, drawingName, elementCount, type, strategyResults);
        await this.executeStrategy('sampling', drawingId, drawingName, elementCount, type, strategyResults);
        break;
    }

    // Summary
    console.error(`\n${'='.repeat(80)}`);
    console.error(`📊 COLLABORATION NOTIFICATION SUMMARY`);
    console.error(`${'='.repeat(80)}`);
    strategyResults.forEach(result => {
      const status = result.success ? '✅' : '❌';
      const details = result.error ? ` (${result.error})` : '';
      console.error(`${status} ${result.name}${details}`);
    });
    console.error(`${'='.repeat(80)}\n`);
  }

  /**
   * Execute a specific strategy and record the result
   */
  private async executeStrategy(
    strategyName: string,
    drawingId: string,
    drawingName: string,
    elementCount: number,
    type: 'collaborate' | 'finished' | undefined,
    results: Array<{ name: string; success: boolean; error?: string }>
  ): Promise<void> {
    const strategy = this.strategies.get(strategyName);

    if (!strategy) {
      console.error(`⚠️  Strategy "${strategyName}" not found`);
      results.push({ name: strategyName, success: false, error: 'Strategy not found' });
      return;
    }

    if (!strategy.isAvailable()) {
      console.error(`⏭️  Skipping "${strategyName}" strategy (not available)`);
      results.push({ name: strategyName, success: false, error: 'Not available' });
      return;
    }

    try {
      await strategy.notify(drawingId, drawingName, elementCount, type);
      results.push({ name: strategyName, success: true });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error(`❌ Strategy "${strategyName}" failed: ${errorMessage}`);
      results.push({ name: strategyName, success: false, error: errorMessage });
    }
  }

  /**
   * Get the detected client type
   */
  getClientType(): ClientType {
    return this.environmentDetector.getClientType();
  }

  /**
   * Check if a specific strategy is available
   */
  isStrategyAvailable(strategyName: string): boolean {
    const strategy = this.strategies.get(strategyName);
    return strategy ? strategy.isAvailable() : false;
  }
}
