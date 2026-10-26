export interface LocationInfo {
  query: string;
  resolved: string;
  lat: number;
  lon: number;
}

export interface AqiInfo {
  value: number;
  category: string;
  scale: "US-EPA";
}

export interface PollutantsInfo {
  pm25?: number;
  pm10?: number;
  no2?: number;
  o3?: number;
}

export interface AdviceInfo {
  mask_recommended: boolean;
  sensitive_groups_warning: boolean;
}

export interface AirQualityResponse {
  location: LocationInfo;
  measured_at: string;
  aqi: AqiInfo;
  pollutants: PollutantsInfo;
  advice: AdviceInfo;
  station: string;
  source: string;
  validation: "ok" | "uncertain";
  stale: boolean;
}

export interface AssistantGuidelines {
  language: string;
  mask_guidance: string;
  sensitive_groups_guidance: string;
  freshness_note: string;
  validation_note: string;
  attribution: string;
  disclaimer: string;
}

export interface FormattedAirQualityOutput extends AirQualityResponse {
  guidelines_for_assistant: AssistantGuidelines;
}

export interface BackendErrorResponse {
  error: {
    code: string;
    message: string;
    details?: Record<string, unknown>;
  };
}
