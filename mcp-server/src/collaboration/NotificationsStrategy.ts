import { CollaborationStrategy } from "./CollaborationStrategy.js";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";

/**
 * MCP Notifications-based collaboration strategy for Claude Desktop and Claude.ai.
 *
 * This strategy uses the MCP protocol's notifications/message feature to send
 * log messages to the client. Claude Desktop and Claude.ai are expected to
 * display these notifications to the user.
 *
 * Note: Claude Code receives these notifications but doesn't display them (GitHub #3174).
 */
export class NotificationsStrategy implements CollaborationStrategy {
  private server: Server;

  constructor(server: Server) {
    this.server = server;
  }

  async notify(drawingId: string, drawingName: string, elementCount: number, type?: 'collaborate' | 'finished'): Promise<void> {
    try {
      const actionType = type || 'collaborate';
      const message = actionType === 'finished'
        ? `✅ User finished drawing "${drawingName}"! Use close_widget to acknowledge completion.`
        : `🎨 User clicked Collaborate on drawing "${drawingName}"! Please use get_drawing_state tool to review their work and provide feedback.`;
      const suggestedAction = actionType === 'finished'
        ? 'Use close_widget to acknowledge completion'
        : 'Use get_drawing_state to view the drawing and provide feedback';

      await this.server.sendLoggingMessage({
        level: 'info',
        logger: 'excalidraw-collaboration',
        data: {
          type: 'collaboration_request',
          message,
          drawingId,
          drawingName,
          elementCount,
          actionType,
          timestamp: Date.now(),
          suggestedAction
        }
      });

      console.error(`\n${'='.repeat(80)}`);
      console.error(`📬 NOTIFICATIONS STRATEGY - Collaboration Request Sent`);
      console.error(`${'='.repeat(80)}`);
      console.error(`Drawing: ${drawingName} (${drawingId})`);
      console.error(`Elements: ${elementCount}`);
      console.error(`Type: ${actionType}`);
      console.error(`Method: MCP notifications/message`);
      console.error(``);
      console.error(`📋 Expected behavior:`);
      console.error(`   • Claude Desktop/ai: Should display notification to user`);
      console.error(`   • Claude Code: Receives but doesn't display (known limitation)`);
      console.error(`${'='.repeat(80)}\n`);
    } catch (error) {
      console.error(`❌ NotificationsStrategy failed:`, error);
      throw error;
    }
  }

  getName(): string {
    return "notifications";
  }

  isAvailable(): boolean {
    // Server is always available once connected
    return true;
  }
}
