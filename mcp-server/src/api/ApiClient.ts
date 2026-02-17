/**
 * HTTP client for MCP server to communicate with Express API server
 * Enables real-time updates to the browser widget
 */

export class ApiClient {
  private baseUrl: string;
  private timeout: number;

  constructor(baseUrl: string = "http://localhost:3721", timeout: number = 5000) {
    this.baseUrl = baseUrl;
    this.timeout = timeout;
  }

  /**
   * Update drawing elements in the widget (real-time visual update)
   */
  async updateElements(
    drawingId: string,
    options: {
      elements?: any[];
      appState?: any;
      replace?: boolean;
    }
  ): Promise<{ success: boolean }> {
    const response = await this.request(`/api/drawings/${drawingId}/elements`, {
      method: "PUT",
      body: JSON.stringify({
        elements: options.elements,
        appState: options.appState,
        replace: options.replace || false,
      }),
    });

    if (!response.ok) {
      throw new Error(`Failed to update elements: ${response.statusText}`);
    }

    return response.json() as Promise<{ success: boolean }>;
  }

  /**
   * Close drawing widget by sending close signal
   */
  async closeDrawing(drawingId: string): Promise<{ success: boolean }> {
    const response = await this.request(`/api/drawings/${drawingId}/close-signal`, {
      method: "POST",
    });

    if (!response.ok) {
      throw new Error(`Failed to send close signal: ${response.statusText}`);
    }

    return response.json() as Promise<{ success: boolean }>;
  }

  /**
   * Get current drawing state from widget (if open)
   */
  async getDrawingState(drawingId: string): Promise<any> {
    const response = await this.request(`/api/drawings/${drawingId}`, {
      method: "GET",
    });

    if (!response.ok) {
      throw new Error(`Failed to get drawing state: ${response.statusText}`);
    }

    return response.json();
  }

  /**
   * Check if widget server is running
   */
  async healthCheck(): Promise<boolean> {
    try {
      const response = await this.request("/api/health", {
        method: "GET",
      });
      return response.ok;
    } catch (error) {
      return false;
    }
  }

  /**
   * Internal request wrapper with timeout and error handling
   */
  private async request(
    path: string,
    options: RequestInit
  ): Promise<Response> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeout);

    try {
      const response = await fetch(`${this.baseUrl}${path}`, {
        ...options,
        headers: {
          "Content-Type": "application/json",
          ...options.headers,
        },
        signal: controller.signal,
      });

      clearTimeout(timeoutId);
      return response;
    } catch (error) {
      clearTimeout(timeoutId);

      if (error instanceof Error && error.name === "AbortError") {
        throw new Error(`Request timeout after ${this.timeout}ms`);
      }

      throw error;
    }
  }
}

// Singleton instance for use across MCP server
export const apiClient = new ApiClient();
