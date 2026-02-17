/**
 * MCP-specific type definitions
 */

export interface ToolResponse {
  content: ContentBlock[];
  isError?: boolean;
}

export interface ContentBlock {
  type: "text" | "resource";
  text?: string;
  resource?: ResourceReference;
}

export interface ResourceReference {
  uri: string;
  mimeType: string;
  text?: string;
  blob?: string;
}

export interface ToolDefinition {
  name: string;
  description: string;
  inputSchema: {
    type: "object";
    properties: Record<string, any>;
    required?: string[];
    oneOf?: any[];
  };
}

export interface ResourceDefinition {
  uri: string;
  name: string;
  description?: string;
  mimeType?: string;
}
