import { describe, test, expect, mock, afterEach } from "bun:test";
import { StreamableHttpServer } from "../src/http-server";
import { AirQualityApiClient } from "../src/client";
import type { AirQualityResponse } from "../src/types";

const mockAirQualityData: AirQualityResponse = {
  location: {
    query: "Jakarta",
    resolved: "Daerah Khusus Ibukota Jakarta, Indonesia",
    lat: -6.1754,
    lon: 106.8272,
  },
  measured_at: "2026-10-25T23:00:00+07:00",
  aqi: {
    value: 120,
    category: "unhealthy for sensitive groups",
    scale: "US-EPA",
  },
  pollutants: {
    pm25: 120,
    pm10: 80,
  },
  advice: {
    mask_recommended: false,
    sensitive_groups_warning: true,
  },
  station: "Kemayoran, Indonesia",
  source: "WAQI (aqicn.org)",
  validation: "ok",
  stale: false,
};

describe("StreamableHttpServer", () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  test("GET /health returns 200 and healthy status", async () => {
    const server = new StreamableHttpServer();
    const res = await server.handleRequest(new Request("http://localhost:3002/health", { method: "GET" }));

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.status).toBe("ok");
    expect(body.service).toBe("hiruup-mcp");
    expect(body.active_sessions).toBe(0);
  });

  test("OPTIONS /mcp returns 204 with CORS headers", async () => {
    const server = new StreamableHttpServer();
    const res = await server.handleRequest(new Request("http://localhost:3002/mcp", { method: "OPTIONS" }));

    expect(res.status).toBe(204);
    expect(res.headers.get("Access-Control-Allow-Origin")).toBe("*");
    expect(res.headers.get("Access-Control-Allow-Methods")).toContain("POST");
  });

  test("POST /mcp initialize creates a session and returns session ID header", async () => {
    const server = new StreamableHttpServer();

    const initReq = new Request("http://localhost:3002/mcp", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        accept: "application/json, text/event-stream",
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "initialize",
        params: {
          protocolVersion: "2024-11-05",
          capabilities: {},
          clientInfo: { name: "test-client", version: "1.0.0" },
        },
      }),
    });

    const initRes = await server.handleRequest(initReq);
    expect(initRes.status).toBe(200);
    const sessionId = initRes.headers.get("mcp-session-id");
    expect(sessionId).toBeDefined();
    expect(typeof sessionId).toBe("string");
    expect(server.getSessionsCount()).toBe(1);

    // List tools using the initialized session
    const listReq = new Request("http://localhost:3002/mcp", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        accept: "application/json, text/event-stream",
        "mcp-session-id": sessionId!,
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 2,
        method: "tools/list",
        params: {},
      }),
    });

    const listRes = await server.handleRequest(listReq);
    expect(listRes.status).toBe(200);
    const text = await listRes.text();
    expect(text).toContain("get_air_quality");

    // DELETE session closes and removes it
    const delReq = new Request("http://localhost:3002/mcp", {
      method: "DELETE",
      headers: {
        "mcp-session-id": sessionId!,
      },
    });

    const delRes = await server.handleRequest(delReq);
    expect(delRes.status).toBe(200);
    expect(server.getSessionsCount()).toBe(0);
  });

  test("POST /mcp handles tools/call for get_air_quality with mocked backend client", async () => {
    const mockClient = new AirQualityApiClient("http://mock-backend:3001");
    mockClient.getAirQuality = mock(async () => mockAirQualityData);

    const server = new StreamableHttpServer({ client: mockClient });

    // Call tool via stateless POST
    const callReq = new Request("http://localhost:3002/mcp", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        accept: "application/json, text/event-stream",
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 10,
        method: "tools/call",
        params: {
          name: "get_air_quality",
          arguments: { city: "Jakarta" },
        },
      }),
    });

    const callRes = await server.handleRequest(callReq);
    expect(callRes.status).toBe(200);
    const bodyText = await callRes.text();
    expect(bodyText).toContain("Jakarta");
    expect(bodyText).toContain("guidelines_for_assistant");
  });

  test("Returns 404 for unknown session ID", async () => {
    const server = new StreamableHttpServer();
    const req = new Request("http://localhost:3002/mcp", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        accept: "application/json, text/event-stream",
        "mcp-session-id": "unknown-session-12345",
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "tools/list",
        params: {},
      }),
    });

    const res = await server.handleRequest(req);
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error?.message).toContain("Session not found");
  });

  test("Returns 400 for GET/DELETE without session ID", async () => {
    const server = new StreamableHttpServer();
    const req = new Request("http://localhost:3002/mcp", {
      method: "GET",
      headers: {
        accept: "text/event-stream",
      },
    });

    const res = await server.handleRequest(req);
    expect(res.status).toBe(400);
  });

  test("Returns 404 for unmatched routes", async () => {
    const server = new StreamableHttpServer();
    const res = await server.handleRequest(new Request("http://localhost:3002/non-existent", { method: "GET" }));
    expect(res.status).toBe(404);
  });
});
