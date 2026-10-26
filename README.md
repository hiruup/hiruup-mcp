# Hiruup Air Quality MCP Server (`hiruup-mcp`)

A dedicated Model Context Protocol (MCP) server providing real-time air quality information and health advice (e.g. mask recommendations) to LLMs and AI assistants like Claude Desktop, Cursor, and web-based MCP clients.

This MCP server acts as an adapter, hosting an MCP **Streamable HTTP** interface (with optional Stdio support) and communicating with the independently hosted **Hiruup Air Quality Backend REST API**.

---

## Features
- **Streamable HTTP Host**: Implements the modern MCP Streamable HTTP transport with SSE streaming and session management (`Mcp-Session-Id`).
- **Stdio Transport**: Available as an alternative runner for local desktop clients.
- **Air Quality Tool**: Exposes `get_air_quality` tool for natural language queries (AQI, PM2.5, PM10, mask recommendations, sensitive groups advice).
- **CORS Enabled**: Cross-origin requests supported for browser-based and remote MCP consumers.
- **Stateless & Stateful**: Handles stateful multi-session connections as well as stateless single-shot tool requests.

---

## Prerequisites
- [Bun](https://bun.sh/) (v1.1 or later)
- An active instance of the Hiruup Air Quality Backend service.

---

## Installation & Setup

1. **Install dependencies:**
   ```bash
   bun install
   ```

2. **Configure environment:**
   Copy `.env.example` to `.env`:
   ```bash
   cp .env.example .env
   ```
   Configure your environment variables:
   ```ini
   # Backend API URL
   AIR_QUALITY_API_URL=http://localhost:3001

   # Streamable HTTP Host
   MCP_PORT=3002
   MCP_HOST=0.0.0.0
   ```

---

## Running the Server

### 1. Streamable HTTP Host (Default)
Starts the Streamable HTTP server on `http://localhost:3002` (or configured `MCP_PORT`):
```bash
bun run start
```
Or with hot-reloading:
```bash
bun run dev
```

#### Endpoints
- **Streamable HTTP MCP Endpoint**: `http://localhost:3002/mcp`
  - `POST /mcp` — JSON-RPC request handling (initialization, tool calls)
  - `GET /mcp` — Server-Sent Events (SSE) notification stream
  - `DELETE /mcp` — Session termination
  - `OPTIONS /mcp` — CORS preflight
- **Health Check**: `http://localhost:3002/health`
  - Returns `200 OK` with service status and active session count.

### 2. Stdio Mode (CLI / Desktop)
If you need stdio transport for local desktop clients:
```bash
bun run start:stdio
```
Or via flag:
```bash
bun run src/index.ts --stdio
```

---

## Client Integration

### Streamable HTTP Clients (Remote / Web / Cursor)
Configure your MCP client with the Streamable HTTP URL:
```json
{
  "mcpServers": {
    "air-quality": {
      "url": "http://localhost:3002/mcp"
    }
  }
}
```

### Claude Desktop Integration (Stdio Mode)
To use stdio mode inside Claude Desktop, add to your `claude_desktop_config.json`:
```json
{
  "mcpServers": {
    "air-quality": {
      "command": "bun",
      "args": ["run", "D:/PROJECT/hiruup/mcp/src/stdio.ts"],
      "env": {
        "AIR_QUALITY_API_URL": "http://localhost:3001"
      }
    }
  }
}
```

---

## Running Tests
Run the automated test suite covering both Streamable HTTP and Stdio modes:
```bash
bun test
```
