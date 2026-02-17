#!/usr/bin/env node
/**
 * Entry point for Collaborative Canvas MCP Server
 */

import { ExcalidrawMCPServer } from "./server.js";

// Node 18+ required for fs/promises, fetch, structuredClone, etc.
const major = parseInt(process.versions.node!.split(".")[0], 10);
if (major < 18) {
  console.error(`Collaborative Canvas requires Node.js 18+ (found ${process.version})`);
  process.exit(1);
}

async function main() {
  const server = new ExcalidrawMCPServer();
  await server.start();
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
