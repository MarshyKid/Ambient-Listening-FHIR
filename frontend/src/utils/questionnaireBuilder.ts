export type BuilderQuestionType = "string" | "text" | "boolean" | "choice" | "integer" | "date" | "dateTime";

export interface BuilderChoiceOption {
  id: string;
  display: string;
  code: string;
}

export interface BuilderQuestion {
  id: string;
  linkId: string;
  text: string;
  type: BuilderQuestionType;
  required: boolean;
  options: BuilderChoiceOption[];
}

export interface BuilderState {
  title: string;
  slug: string;
  version: string;
  status: "draft";
  questions: BuilderQuestion[];
}

export interface BuilderValidationIssue {
  code: string;
  message: string;
  scope: "metadata" | "questions" | "question" | "option";
  questionId?: string;
  optionId?: string;
}

export interface QuestionnairePreviewResult {
  resource: Record<string, unknown> | null;
  omittedItems: string[];
}

export interface CreateQuestionnaireOptionRequest {
  fhirValueType: "valueCoding";
  system: string;
  code: string;
  display: string;
}

export interface CreateQuestionnaireItemRequest {
  linkId: string;
  text: string;
  type: BuilderQuestionType;
  required: boolean;
  options?: CreateQuestionnaireOptionRequest[];
}

export interface CreateQuestionnaireRequest {
  slug: string;
  version: string;
  title: string;
  status: "active";
  items: CreateQuestionnaireItemRequest[];
}

export const QUESTIONNAIRE_CANONICAL_BASE = "http://example.org/fhir/Questionnaire";
export const QUESTIONNAIRE_OPTION_CODE_SYSTEM = "http://example.org/fhir/CodeSystem/questionnaire-options";

const SUPPORTED_QUESTION_TYPES = new Set<BuilderQuestionType>([
  "string",
  "text",
  "boolean",
  "choice",
  "integer",
  "date",
  "dateTime"
]);

export function buildCanonicalUrl(slug: string): string | null {
  const normalizedSlug = slug.trim();
  return normalizedSlug ? `${QUESTIONNAIRE_CANONICAL_BASE}/${normalizedSlug}` : null;
}

export function slugifyIdentifier(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function generateUniqueLinkId(
  text: string,
  questions: BuilderQuestion[],
  currentQuestionId?: string
): string {
  const base = slugifyIdentifier(text) || "new-question";
  const existing = questions
    .filter((question) => question.id !== currentQuestionId)
    .map((question) => question.linkId);
  return uniqueValue(base, existing);
}

export function generateUniqueOptionCode(
  questionLinkId: string,
  display: string,
  options: BuilderChoiceOption[],
  currentOptionId?: string
): string {
  const questionPart = slugifyIdentifier(questionLinkId) || "question";
  const optionPart = slugifyIdentifier(display) || "option";
  const existing = options
    .filter((option) => option.id !== currentOptionId)
    .map((option) => option.code);
  return uniqueValue(`${questionPart}-${optionPart}`, existing);
}

export function validateBuilderState(state: BuilderState): BuilderValidationIssue[] {
  const issues: BuilderValidationIssue[] = [];

  if (!state.title.trim()) {
    issues.push({ code: "title-required", message: "Questionnaire title is required.", scope: "metadata" });
  }
  if (!state.slug.trim()) {
    issues.push({
      code: "canonical-required",
      message: "A canonical URL cannot be derived from the questionnaire title.",
      scope: "metadata"
    });
  }
  if (!state.version.trim()) {
    issues.push({ code: "version-required", message: "Questionnaire version is required.", scope: "metadata" });
  }
  if (state.questions.length === 0) {
    issues.push({ code: "questions-required", message: "Add at least one question.", scope: "questions" });
  }

  const linkIdCounts = countValues(state.questions.map((question) => question.linkId.trim()));

  for (const question of state.questions) {
    const questionName = question.text.trim() || question.linkId.trim() || "Untitled question";
    const linkId = question.linkId.trim();

    if (!question.text.trim()) {
      issues.push({
        code: "question-text-required",
        message: "Question text is required.",
        scope: "question",
        questionId: question.id
      });
    }
    if (!linkId) {
      issues.push({
        code: "question-link-id-required",
        message: `${questionName} needs a linkId.`,
        scope: "question",
        questionId: question.id
      });
    } else if ((linkIdCounts.get(linkId) ?? 0) > 1) {
      issues.push({
        code: "question-link-id-duplicate",
        message: `linkId "${linkId}" must be unique.`,
        scope: "question",
        questionId: question.id
      });
    }
    if (!SUPPORTED_QUESTION_TYPES.has(question.type)) {
      issues.push({
        code: "question-type-unsupported",
        message: `${questionName} uses an unsupported question type.`,
        scope: "question",
        questionId: question.id
      });
    }

    if (question.type !== "choice") continue;

    if (question.options.length === 0) {
      issues.push({
        code: "choice-options-required",
        message: "A choice question needs at least one option.",
        scope: "question",
        questionId: question.id
      });
      continue;
    }

    const codeCounts = countValues(question.options.map((option) => option.code.trim()));
    for (const option of question.options) {
      if (!option.display.trim()) {
        issues.push({
          code: "choice-display-required",
          message: "Choice option display text is required.",
          scope: "option",
          questionId: question.id,
          optionId: option.id
        });
      }
      const code = option.code.trim();
      if (!code) {
        issues.push({
          code: "choice-code-required",
          message: "Choice option code is required.",
          scope: "option",
          questionId: question.id,
          optionId: option.id
        });
      } else if ((codeCounts.get(code) ?? 0) > 1) {
        issues.push({
          code: "choice-code-duplicate",
          message: `Choice option code "${code}" must be unique within the question.`,
          scope: "option",
          questionId: question.id,
          optionId: option.id
        });
      }
    }
  }

  return issues;
}

export function buildQuestionnairePreview(
  state: BuilderState,
  issues = validateBuilderState(state)
): QuestionnairePreviewResult {
  const canonicalUrl = buildCanonicalUrl(state.slug);
  const metadataInvalid = issues.some((issue) => issue.scope === "metadata");
  if (metadataInvalid || !canonicalUrl) {
    return { resource: null, omittedItems: [] };
  }

  const invalidQuestionIds = new Set(
    issues
      .filter((issue) => issue.questionId)
      .map((issue) => issue.questionId as string)
  );
  const omittedItems = state.questions
    .filter((question) => invalidQuestionIds.has(question.id))
    .map((question) => {
      const label = question.text.trim() || question.linkId.trim() || "Untitled question";
      const reason = issues.find((issue) => issue.questionId === question.id)?.message ?? "The item is invalid.";
      return `"${label}" is omitted from the resource. ${reason}`;
    });

  const item = state.questions
    .filter((question) => !invalidQuestionIds.has(question.id))
    .map(buildQuestionnaireItem);

  return {
    resource: {
      resourceType: "Questionnaire",
      url: canonicalUrl,
      version: state.version.trim(),
      status: "active",
      title: state.title.trim(),
      item
    },
    omittedItems
  };
}

export function buildCreateQuestionnaireRequest(
  state: BuilderState,
  issues = validateBuilderState(state)
): CreateQuestionnaireRequest {
  if (issues.length > 0) {
    throw new Error("Questionnaire draft must be valid before it can be saved.");
  }

  return {
    slug: state.slug.trim(),
    version: state.version.trim(),
    title: state.title.trim(),
    status: "active",
    items: state.questions.map((question) => ({
      linkId: question.linkId.trim(),
      text: question.text.trim(),
      type: question.type,
      required: question.required,
      ...(question.type === "choice"
        ? {
            options: question.options.map((option) => ({
              fhirValueType: "valueCoding" as const,
              system: QUESTIONNAIRE_OPTION_CODE_SYSTEM,
              code: option.code.trim(),
              display: option.display.trim()
            }))
          }
        : {})
    }))
  };
}

function buildQuestionnaireItem(question: BuilderQuestion): Record<string, unknown> {
  const item: Record<string, unknown> = {
    linkId: question.linkId.trim(),
    text: question.text.trim(),
    type: question.type
  };

  if (question.required) {
    item.required = true;
  }
  if (question.type === "choice") {
    item.answerOption = question.options.map((option) => ({
      valueCoding: {
        system: QUESTIONNAIRE_OPTION_CODE_SYSTEM,
        code: option.code.trim(),
        display: option.display.trim()
      }
    }));
  }

  return item;
}

function countValues(values: string[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const value of values) {
    if (!value) continue;
    counts.set(value, (counts.get(value) ?? 0) + 1);
  }
  return counts;
}

function uniqueValue(base: string, existingValues: string[]): string {
  if (!existingValues.includes(base)) return base;
  let suffix = 2;
  while (existingValues.includes(`${base}-${suffix}`)) {
    suffix += 1;
  }
  return `${base}-${suffix}`;
}
