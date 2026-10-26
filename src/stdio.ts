#!/usr/bin/env bun
import "dotenv/config";
import { startMcpServer } from "./server";

startMcpServer().catch((err) => {
  console.error("Fatal error starting Air Quality MCP stdio server:", err);
  process.exit(1);
});
