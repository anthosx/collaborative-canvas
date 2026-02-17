/**
 * Base interface for collaboration notification strategies
 */
export interface CollaborationStrategy {
  /**
   * Send a collaboration notification for the given drawing
   * @param drawingId - The ID of the drawing to collaborate on
   * @param drawingName - The name of the drawing
   * @param elementCount - Number of elements in the drawing
   * @param type - Type of collaboration request (collaborate or finished)
   * @returns Promise that resolves when notification is sent
   */
  notify(drawingId: string, drawingName: string, elementCount: number, type?: 'collaborate' | 'finished'): Promise<void>;

  /**
   * Get the name of this strategy
   */
  getName(): string;

  /**
   * Check if this strategy is available/supported
   */
  isAvailable(): boolean;
}
