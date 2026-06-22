import type {
  ChoiceOption,
  Questionnaire,
  QuestionnaireItem,
  QuestionnaireQueryResult,
  QuestionnaireSummary,
  QuestionnaireItemType
} from "../types";
import { apiGet } from "./http";
import { flattenAnswerableItems } from "../utils/questionnaireItems";
import { normalizeChoiceOption } from "../utils/choiceOptions";

type QuestionnaireStatus = QuestionnaireSummary["status"];

interface BackendQuestionnaireSummary {
  id: string;
  fhirId?: string;
  slug?: string;
  url: string;
  version: string;
  title: string;
  description?: string | null;
  status?: string | null;
  itemCount?: number | null;
}

interface BackendQuestionnaireItem {
  linkId: string;
  text: string;
  type: string;
  options?: unknown[] | null;
  items?: BackendQuestionnaireItem[] | null;
}

interface BackendQuestionnaireDetail extends Omit<BackendQuestionnaireSummary, "itemCount"> {
  items: BackendQuestionnaireItem[];
}

interface BackendQuestionnaireQueryResult extends Omit<QuestionnaireQueryResult, "questionnaires"> {
  questionnaires: BackendQuestionnaireSummary[];
}

interface BackendQuestionnaireDetailResult {
  questionnaire: BackendQuestionnaireDetail;
}

export async function queryQuestionnairesFhir(requestUrl: string): Promise<QuestionnaireQueryResult> {
  try {
    const result = await apiGet<BackendQuestionnaireQueryResult>("/api/questionnaires", { requestUrl });
    return {
      ...result,
      questionnaires: result.questionnaires.map(normalizeSummary)
    };
  } catch (error) {
    return {
      requestUrl,
      status: 400,
      statusText: "Bad Request",
      bundle: {
        resourceType: "Bundle",
        type: "searchset",
        total: 0,
        link: [{ relation: "self", url: requestUrl }]
      },
      questionnaires: [],
      error: error instanceof Error ? error.message : "Questionnaire query failed."
    };
  }
}

export async function getQuestionnaire(id: string): Promise<Questionnaire> {
  const result = await apiGet<BackendQuestionnaireDetailResult>(`/api/questionnaires/${encodeURIComponent(id)}`);
  return normalizeDetail(result.questionnaire);
}

function normalizeSummary(questionnaire: BackendQuestionnaireSummary): QuestionnaireSummary {
  return {
    id: questionnaire.id,
    url: questionnaire.url,
    version: questionnaire.version,
    title: questionnaire.title,
    description: questionnaire.description ?? "",
    status: normalizeStatus(questionnaire.status),
    itemCount: questionnaire.itemCount ?? 0
  };
}

function normalizeDetail(questionnaire: BackendQuestionnaireDetail): Questionnaire {
  const items = questionnaire.items.map(normalizeItem);
  return {
    ...normalizeSummary({ ...questionnaire, itemCount: flattenAnswerableItems(items).length }),
    items
  };
}

function normalizeItem(item: BackendQuestionnaireItem): QuestionnaireItem {
  return {
    linkId: item.linkId,
    text: item.text,
    type: normalizeItemType(item.type),
    options: normalizeOptions(item.options),
    items: item.items?.map(normalizeItem)
  };
}

function normalizeOptions(options: unknown[] | null | undefined): ChoiceOption[] | undefined {
  const normalized = options?.flatMap((option) => {
    const choice = normalizeChoiceOption(option);
    return choice ? [choice] : [];
  });
  return normalized?.length ? normalized : undefined;
}

function normalizeStatus(status: string | null | undefined): QuestionnaireStatus {
  if (status === "draft" || status === "active" || status === "retired") return status;
  return "active";
}

function normalizeItemType(type: string): QuestionnaireItemType {
  if (
    type === "string" ||
    type === "text" ||
    type === "boolean" ||
    type === "choice" ||
    type === "integer" ||
    type === "date" ||
    type === "dateTime" ||
    type === "group"
  ) {
    return type;
  }
  return "text";
}
