import type { IntakeRecommendationRequest, IntakeRecommendationResponse, QuestionnaireSummary } from "../types";
import { apiPost } from "./http";

export async function getIntakeRecommendations(params: {
  patientId: string;
  questionnaires: QuestionnaireSummary[];
}): Promise<IntakeRecommendationResponse> {
  const request: IntakeRecommendationRequest = {
    patientId: params.patientId,
    questionnaireIds: params.questionnaires.map((questionnaire) => questionnaire.id)
  };
  return apiPost<IntakeRecommendationResponse>("/api/intake-recommendations", request);
}
