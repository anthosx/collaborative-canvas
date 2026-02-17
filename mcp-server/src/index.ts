#!/usr/bin/env node
/**
 * Entry point for Excalidraw MCP Server
 */

import { ExcalidrawMCPServer } from "./server.js";

async function main() {
  const server = new ExcalidrawMCPServer();
  await server.start();
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
