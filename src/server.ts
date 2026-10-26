import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { AirQualityApiClient } from "./client";
import type { FormattedAirQualityOutput } from "./types";

export function createAirQualityMcpServer(client: AirQualityApiClient = new AirQualityApiClient()): McpServer {
  const server = new McpServer({
    name: "air-quality",
    version: "0.2.0",
  });

  server.tool(
    "get_air_quality",
    "Get current air quality (AQI and pollutants) for a city. Use when the user asks about pollution, air quality, or whether to wear a mask in a city. Reply in the same language the user used.",
    {
      city: z.string().min(1).max(100).describe("City name, e.g. 'Jakarta' or 'Bandung'"),
    },
    async ({ city }) => {
      try {
        const data = await client.getAirQuality(city);

        const formattedOutput: FormattedAirQualityOutput = {
          location: data.location,
          measured_at: data.measured_at,
          aqi: data.aqi,
          pollutants: data.pollutants,
          advice: data.advice,
          station: data.station,
          source: data.source,
          validation: data.validation,
          stale: data.stale,
          guidelines_for_assistant: {
            language:
              "Reply in the same language as the user's question (Indonesian or English; default to Indonesian if ambiguous). Do not translate proper city or station names.",
            mask_guidance: data.advice.mask_recommended
              ? "Mask is recommended for general public (AQI > 150)."
              : "Mask is not strictly required for general public based solely on current AQI.",
            sensitive_groups_guidance: data.advice.sensitive_groups_warning
              ? "Sensitive groups (children, elderly, pregnant women, respiratory/heart conditions) should take precautions and reduce outdoor exertion."
              : "No specific elevated warning for sensitive groups.",
            freshness_note: data.stale
              ? "Data is older than 3 hours or retrieved from fallback cache; assistant must inform the user about the measurement time."
              : "Data is fresh.",
            validation_note:
              data.validation === "uncertain"
                ? "The cross-validation detected a discrepancy in reported pollutant calculations; assistant must mention that the measurement carries uncertainty."
                : "Cross-validation passed.",
            attribution: "Must attribute data source to WAQI (aqicn.org).",
            disclaimer:
              "Must include health disclaimer: General information only, does not replace medical advice from a doctor.",
          },
        };

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(formattedOutput, null, 2),
            },
          ],
        };
      } catch (err) {
        const errorMessage = (err as Error).message || "Unknown error occurred";
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                {
                  error: true,
                  message: errorMessage,
                  guidelines_for_assistant:
                    "Communicate honestly with the user in their language that air quality data for this location is currently unavailable. Example (ID): 'Data kualitas udara untuk saat ini belum tersedia, silakan coba lagi beberapa saat lagi.' Example (EN): 'Air quality data for this location is currently unavailable, please try again shortly.'",
                },
                null,
                2,
              ),
            },
          ],
        };
      }
    },
  );

  return server;
}

export async function startMcpServer(): Promise<void> {
  const server = createAirQualityMcpServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);
}
