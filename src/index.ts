#!/usr/bin/env bun
import "dotenv/config";
import { StreamableHttpServer } from "./http-server";
import { startMcpServer } from "./server";

const args = process.argv.slice(2);

if (args.includes("--stdio")) {
  startMcpServer().catch((err) => {
    console.error("Fatal error starting Air Quality MCP stdio server:", err);
    process.exit(1);
  });
} else {
  const port = Number(process.env.MCP_PORT || process.env.PORT || 3002);
  const host = process.env.MCP_HOST || "0.0.0.0";

  const server = new StreamableHttpServer();
  server.listen(port, host);
}
