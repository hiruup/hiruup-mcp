import type { AirQualityResponse, BackendErrorResponse } from "./types";

export class AirQualityApiClient {
  private baseUrl: string;

  constructor(baseUrl?: string) {
    const rawUrl = baseUrl || process.env.AIR_QUALITY_API_URL || "http://localhost:3001";
    this.baseUrl = rawUrl.replace(/\/+$/, "");
  }

  async getAirQuality(city: string): Promise<AirQualityResponse> {
    const endpoint = `${this.baseUrl}/api/v1/air-quality?city=${encodeURIComponent(city)}`;

    let response: Response;
    try {
      response = await fetch(endpoint, {
        method: "GET",
        headers: {
          Accept: "application/json",
        },
      });
    } catch (err) {
      throw new Error(
        `Failed to reach Air Quality Backend service at ${this.baseUrl}: ${(err as Error).message}`,
      );
    }

    if (!response.ok) {
      let errorBody: BackendErrorResponse | undefined;
      try {
        errorBody = (await response.json()) as BackendErrorResponse;
      } catch {
        // response was not JSON
      }

      if (errorBody?.error?.message) {
        throw new Error(errorBody.error.message);
      }

      throw new Error(
        `Backend service responded with HTTP status ${response.status} (${response.statusText})`,
      );
    }

    const data = (await response.json()) as AirQualityResponse;
    return data;
  }
}
