import type { IntakeQueryResult } from "../types";
import { apiBaseUrl } from "./config";
import { apiGet } from "./http";

export async function queryIntakes(requestUrl?: string): Promise<IntakeQueryResult> {
  const trimmedRequestUrl = requestUrl?.trim();
  try {
    return await apiGet<IntakeQueryResult>("/api/intakes", trimmedRequestUrl ? { requestUrl: trimmedRequestUrl } : undefined);
  } catch (error) {
    return {
      requestUrl: trimmedRequestUrl || `${apiBaseUrl}/api/intakes`,
      status: 400,
      statusText: "Bad Request",
      intakes: [],
      bundle: {
        resourceType: "Bundle",
        type: "searchset",
        total: 0,
        entry: []
      },
      error: error instanceof Error ? error.message : "Intake query failed."
    };
  }
}
