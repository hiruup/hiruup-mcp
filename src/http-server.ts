import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { createAirQualityMcpServer } from "./server";
import { AirQualityApiClient } from "./client";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

export interface SessionRecord {
  transport: WebStandardStreamableHTTPServerTransport;
  server: McpServer;
  lastActive: number;
}

export interface HttpServerOptions {
  port?: number;
  host?: string;
  maxSessions?: number;
  idleMs?: number;
  client?: AirQualityApiClient;
}

export class StreamableHttpServer {
  private sessions = new Map<string, SessionRecord>();
  private statelessTransport: WebStandardStreamableHTTPServerTransport;
  private statelessServer: McpServer;
  private maxSessions: number;
  private idleMs: number;
  private cleanupInterval?: ReturnType<typeof setInterval>;
  private client: AirQualityApiClient;
  private serverInstance?: ReturnType<typeof Bun.serve>;

  constructor(options: HttpServerOptions = {}) {
    this.maxSessions = options.maxSessions ?? 1000;
    this.idleMs = options.idleMs ?? 30 * 60 * 1000;
    this.client = options.client ?? new AirQualityApiClient();

    // Prepare stateless transport and server for single-shot / stateless requests
    this.statelessTransport = new WebStandardStreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
    });
    this.statelessServer = createAirQualityMcpServer(this.client);
    this.statelessServer.connect(this.statelessTransport);
  }

  private startIdleCleanup(): void {
    if (this.cleanupInterval) return;
    this.cleanupInterval = setInterval(() => {
      const cutoff = Date.now() - this.idleMs;
      for (const [id, session] of this.sessions.entries()) {
        if (session.lastActive < cutoff) {
          session.transport.close().catch(() => {});
          this.sessions.delete(id);
        }
      }
    }, 60 * 1000);
    if (this.cleanupInterval.unref) {
      this.cleanupInterval.unref();
    }
  }

  public getSessionsCount(): number {
    return this.sessions.size;
  }

  public async handleRequest(req: Request): Promise<Response> {
    const url = new URL(req.url);

    // Standard CORS headers
    const corsHeaders: Record<string, string> = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Accept, Mcp-Session-Id",
      "Access-Control-Expose-Headers": "Mcp-Session-Id",
    };

    // Preflight OPTIONS request
    if (req.method === "OPTIONS") {
      return new Response(null, {
        status: 204,
        headers: corsHeaders,
      });
    }

    // Health check endpoint
    if (url.pathname === "/health") {
      return Response.json(
        {
          status: "ok",
          service: "hiruup-mcp",
          active_sessions: this.sessions.size,
          timestamp: new Date().toISOString(),
        },
        { headers: corsHeaders },
      );
    }

    // MCP Streamable HTTP endpoint
    if (url.pathname === "/mcp") {
      const response = await this.handleMcpRequest(req);
      // Merge CORS headers into response
      for (const [key, val] of Object.entries(corsHeaders)) {
        response.headers.set(key, val);
      }
      return response;
    }

    return new Response("Not Found", {
      status: 404,
      headers: corsHeaders,
    });
  }

  private async handleMcpRequest(req: Request): Promise<Response> {
    const sessionId = req.headers.get("mcp-session-id");

    // Parse JSON body for POST requests if applicable
    let parsedBody: unknown = undefined;
    if (req.method === "POST") {
      try {
        parsedBody = await req.json();
      } catch {
        // Body is either not JSON or empty
      }
    }

    // 1. Existing Session Route
    if (sessionId) {
      const session = this.sessions.get(sessionId);
      if (!session) {
        return Response.json(
          {
            jsonrpc: "2.0",
            error: { code: -32001, message: "Session not found" },
            id: null,
          },
          { status: 404 },
        );
      }

      session.lastActive = Date.now();
      return session.transport.handleRequest(req, { parsedBody });
    }

    // 2. Detect Initialization Request (method === "initialize")
    const isInit =
      parsedBody &&
      (typeof parsedBody === "object" &&
        (("method" in (parsedBody as Record<string, unknown>) &&
          (parsedBody as { method: string }).method === "initialize") ||
          (Array.isArray(parsedBody) &&
            parsedBody.some(
              (m) => typeof m === "object" && m !== null && m.method === "initialize",
            ))));

    if (isInit) {
      if (this.sessions.size >= this.maxSessions) {
        return Response.json(
          {
            jsonrpc: "2.0",
            error: { code: -32000, message: "Too many open sessions" },
            id: null,
          },
          { status: 503 },
        );
      }

      const transport = new WebStandardStreamableHTTPServerTransport({
        sessionIdGenerator: () => crypto.randomUUID(),
        onsessioninitialized: (id) => {
          this.sessions.set(id, {
            transport,
            server,
            lastActive: Date.now(),
          });
        },
      });

      transport.onclose = () => {
        if (transport.sessionId) {
          this.sessions.delete(transport.sessionId);
        }
      };

      const server = createAirQualityMcpServer(this.client);
      await server.connect(transport);

      return transport.handleRequest(req, { parsedBody });
    }

    // 3. Fallback: Stateless tool calls / inspection (supports single-shot requests without session)
    if (req.method === "POST" && parsedBody) {
      return this.statelessTransport.handleRequest(req, { parsedBody });
    }

    // 4. Missing Session ID on non-init GET or DELETE
    return Response.json(
      {
        jsonrpc: "2.0",
        error: { code: -32000, message: "Bad Request: Session ID required" },
        id: null,
      },
      { status: 400 },
    );
  }

  public listen(port: number = 3002, host: string = "0.0.0.0"): ReturnType<typeof Bun.serve> {
    this.startIdleCleanup();
    const self = this;
    this.serverInstance = Bun.serve({
      port,
      hostname: host,
      fetch(req: Request) {
        return self.handleRequest(req);
      },
    });

    console.log(`Hiruup MCP Streamable HTTP host listening on http://${host}:${port}/mcp`);
    console.log(`Health check available at http://${host}:${port}/health`);
    return this.serverInstance;
  }

  public async stop(): Promise<void> {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = undefined;
    }

    for (const session of this.sessions.values()) {
      await session.transport.close().catch(() => {});
    }
    this.sessions.clear();

    if (this.serverInstance) {
      this.serverInstance.stop();
      this.serverInstance = undefined;
    }
  }
}
