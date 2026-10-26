import { describe, test, expect, mock } from "bun:test";
import { createAirQualityMcpServer } from "../src/server";
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
    value: 160,
    category: "unhealthy",
    scale: "US-EPA",
  },
  pollutants: {
    pm25: 160,
    pm10: 95,
  },
  advice: {
    mask_recommended: true,
    sensitive_groups_warning: true,
  },
  station: "Kemayoran, Indonesia",
  source: "WAQI (aqicn.org)",
  validation: "ok",
  stale: false,
};

describe("Air Quality MCP Server", () => {
  test("creates MCP server instance", () => {
    const server = createAirQualityMcpServer();
    expect(server).toBeDefined();
  });

  describe("AirQualityApiClient", () => {
    test("successfully fetches air quality data from backend endpoint", async () => {
      const originalFetch = globalThis.fetch;
      globalThis.fetch = mock(async (url: string | URL | Request) => {
        expect(url.toString()).toContain("/v1/air-quality?city=Jakarta");
        return new Response(JSON.stringify(mockAirQualityData), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }) as unknown as typeof fetch;

      try {
        const client = new AirQualityApiClient("http://mock-backend:3001");
        const result = await client.getAirQuality("Jakarta");

        expect(result.location.query).toBe("Jakarta");
        expect(result.aqi.value).toBe(160);
        expect(result.advice.mask_recommended).toBe(true);
      } finally {
        globalThis.fetch = originalFetch;
      }
    });

    test("handles backend error responses with error message", async () => {
      const originalFetch = globalThis.fetch;
      globalThis.fetch = mock(async () => {
        return new Response(
          JSON.stringify({
            error: {
              code: "CITY_NOT_FOUND",
              message: "City 'Atlantis' not found",
            },
          }),
          {
            status: 404,
            headers: { "Content-Type": "application/json" },
          },
        );
      }) as unknown as typeof fetch;

      try {
        const client = new AirQualityApiClient("http://mock-backend:3001");
        await expect(client.getAirQuality("Atlantis")).rejects.toThrow(
          "City 'Atlantis' not found",
        );
      } finally {
        globalThis.fetch = originalFetch;
      }
    });

    test("handles unreachable backend network error", async () => {
      const originalFetch = globalThis.fetch;
      globalThis.fetch = mock(async () => {
        throw new Error("Connection refused");
      }) as unknown as typeof fetch;

      try {
        const client = new AirQualityApiClient("http://unreachable-backend:3001");
        await expect(client.getAirQuality("Jakarta")).rejects.toThrow(
          "Failed to reach Air Quality Backend service",
        );
      } finally {
        globalThis.fetch = originalFetch;
      }
    });
  });
});
