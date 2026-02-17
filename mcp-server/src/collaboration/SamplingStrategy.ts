import { CollaborationStrategy } from "./CollaborationStrategy.js";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";

/**
 * Sampling-based collaboration strategy (FUTURE).
 *
 * This strategy uses the MCP sampling/createMessage feature to directly inject
 * prompts into the conversation. This is the most powerful method but is not
 * currently supported by any Claude client.
 *
 * Status:
 * - ❌ Claude Code: Not supported (as of v0.2.x)
 * - ❌ Claude Desktop: Not supported
 * - ❌ Claude.ai: Not supported
 *
 * This implementation is kept for future when support is added.
 */
export class SamplingStrategy implements CollaborationStrategy {
  private server: Server;

  constructor(server: Server) {
    this.server = server;
  }

  async notify(drawingId: string, drawingName: string, elementCount: number, type?: 'collaborate' | 'finished'): Promise<void> {
    const actionType = type || 'collaborate';
    try {
      const messageText = actionType === 'finished'
        ? `✅ User finished drawing "${drawingName}" (${drawingId})!

The drawing contains ${elementCount} element${elementCount === 1 ? '' : 's'}.

Please use the close_widget tool to acknowledge completion.`
        : `🎨 User clicked Collaborate on drawing "${drawingName}" (${drawingId})!

The drawing contains ${elementCount} element${elementCount === 1 ? '' : 's'}.

Please:
1. Use the get_drawing_state tool to view the current drawing
2. Provide thoughtful feedback on the design
3. Suggest improvements or additions if appropriate
4. Use save_drawing tool to add new elements if needed`;

      // Attempt sampling/createMessage
      await (this.server as any).request({
        method: "sampling/createMessage",
        params: {
          messages: [
            {
              role: "user",
              content: {
                type: "text",
                text: messageText,
              },
            },
          ],
          maxTokens: 4000,
        },
      });

      console.error(`\n${'='.repeat(80)}`);
      console.error(`✨ SAMPLING STRATEGY - Collaboration Request Sent`);
      console.error(`${'='.repeat(80)}`);
      console.error(`Drawing: ${drawingName} (${drawingId})`);
      console.error(`Elements: ${elementCount}`);
      console.error(`Type: ${actionType}`);
      console.error(`Method: MCP sampling/createMessage`);
      console.error(`Status: ✅ SUCCESS (client supports sampling!)`);
      console.error(`${'='.repeat(80)}\n`);
    } catch (error) {
      // Expected to fail with current clients
      const errorMessage = error instanceof Error ? error.message : String(error);

      console.error(`\n${'='.repeat(80)}`);
      console.error(`⏳ SAMPLING STRATEGY - Not Yet Supported`);
      console.error(`${'='.repeat(80)}`);
      console.error(`Drawing: ${drawingName} (${drawingId}}`);
      console.error(`Type: ${actionType}`);
      console.error(`Method: MCP sampling/createMessage`);
      console.error(`Status: ❌ ${errorMessage}`);
      console.error(``);
      console.error(`📝 Note: This feature will auto-enable when client adds support`);
      console.error(`${'='.repeat(80)}\n`);

      // Don't throw - this is expected behavior
    }
  }

  getName(): string {
    return "sampling";
  }

  isAvailable(): boolean {
    // Currently always returns false as no client supports it
    // In the future, check client capabilities for sampling support
    const capabilities = this.server.getClientCapabilities();
    return capabilities?.sampling !== undefined;
  }
}
