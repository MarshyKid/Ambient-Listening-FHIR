import { useMemo, useState } from "react";
import { createQuestionnaire } from "../api/questionnaires";
import {
  buildCanonicalUrl,
  buildCreateQuestionnaireRequest,
  buildQuestionnairePreview,
  generateUniqueLinkId,
  generateUniqueOptionCode,
  slugifyIdentifier,
  validateBuilderState,
  type BuilderChoiceOption,
  type BuilderQuestion,
  type BuilderQuestionType,
  type BuilderState,
  type BuilderValidationIssue,
  type QuestionnairePreviewResult
} from "../utils/questionnaireBuilder";

interface QuestionnaireBuilderPageProps {
  onBack: () => void;
  onSaved: () => void;
}

type PreviewTab = "nurse" | "fhir";

const QUESTION_TYPES: Array<{ value: BuilderQuestionType; label: string }> = [
  { value: "string", label: "Short text" },
  { value: "text", label: "Long text" },
  { value: "boolean", label: "Yes / No" },
  { value: "choice", label: "Choice" },
  { value: "integer", label: "Number" },
  { value: "date", label: "Date" },
  { value: "dateTime", label: "Date/time" }
];

export default function QuestionnaireBuilderPage({ onBack, onSaved }: QuestionnaireBuilderPageProps) {
  const [previewTab, setPreviewTab] = useState<PreviewTab>("nurse");
  const [draft, setDraft] = useState<BuilderState>(createInitialQuestionnaireBuilderState);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const validationIssues = useMemo(() => validateBuilderState(draft), [draft]);
  const previewResult = useMemo(
    () => buildQuestionnairePreview(draft, validationIssues),
    [draft, validationIssues]
  );
  const canonicalUrl = buildCanonicalUrl(draft.slug);
  const canSave = validationIssues.length === 0 && !saving;

  async function saveQuestionnaire() {
    if (!canSave) return;
    setSaving(true);
    setSaveError(null);
    try {
      const request = buildCreateQuestionnaireRequest(draft, validationIssues);
      await createQuestionnaire(request);
      onSaved();
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : "Unable to save questionnaire.");
    } finally {
      setSaving(false);
    }
  }

  function updateTitle(title: string) {
    setDraft((current) => ({
      ...current,
      title,
      slug: slugifyIdentifier(title)
    }));
  }

  function updateQuestion(questionId: string, changes: Partial<BuilderQuestion>) {
    setDraft((current) => ({
      ...current,
      questions: current.questions.map((question) =>
        question.id === questionId ? { ...question, ...changes } : question
      )
    }));
  }

  function updateQuestionText(questionId: string, text: string) {
    setDraft((current) => {
      const question = current.questions.find((item) => item.id === questionId);
      if (!question) return current;

      const linkId = generateUniqueLinkId(text, current.questions, questionId);
      const options = regenerateAllOptionCodes(linkId, question.options);
      return {
        ...current,
        questions: current.questions.map((item) =>
          item.id === questionId ? { ...item, text, linkId, options } : item
        )
      };
    });
  }

  function changeQuestionType(questionId: string, type: BuilderQuestionType) {
    setDraft((current) => ({
      ...current,
      questions: current.questions.map((question) => {
        if (question.id !== questionId) return question;
        return {
          ...question,
          type,
          options: type === "choice" ? question.options : []
        };
      })
    }));
  }

  function addQuestion() {
    setDraft((current) => {
      const linkId = "";
      return {
        ...current,
        questions: [
          ...current.questions,
          {
            id: createInternalId("question"),
            linkId,
            text: "",
            type: "string",
            required: false,
            options: []
          }
        ]
      };
    });
  }

  function removeQuestion(questionId: string) {
    setDraft((current) => ({
      ...current,
      questions: current.questions.filter((question) => question.id !== questionId)
    }));
  }

  function addOption(questionId: string) {
    setDraft((current) => ({
      ...current,
      questions: current.questions.map((question) => {
        if (question.id !== questionId) return question;
        return {
          ...question,
          options: [
            ...question.options,
            {
              id: createInternalId("option"),
              display: "",
              code: ""
            }
          ]
        };
      })
    }));
  }

  function updateOption(questionId: string, optionId: string, display: string) {
    setDraft((current) => ({
      ...current,
      questions: current.questions.map((question) =>
        question.id === questionId
          ? {
              ...question,
              options: question.options.map((option) =>
                option.id === optionId
                  ? {
                      ...option,
                      display,
                      code: generateUniqueOptionCode(question.linkId, display, question.options, optionId)
                    }
                  : option
              )
            }
          : question
      )
    }));
  }

  function removeOption(questionId: string, optionId: string) {
    setDraft((current) => ({
      ...current,
      questions: current.questions.map((question) =>
        question.id === questionId
          ? { ...question, options: question.options.filter((option) => option.id !== optionId) }
          : question
      )
    }));
  }

  return (
    <section className="questionnaire-builder-page">
      <nav className="questionnaire-builder-breadcrumb" aria-label="Breadcrumb">
        <button type="button" onClick={onBack}>
          Questionnaires
        </button>
        <span aria-hidden="true">/</span>
        <span>New questionnaire</span>
      </nav>

      <header className="questionnaire-builder-header">
        <div className="questionnaire-builder-title-wrap">
          <span className="questionnaire-builder-title-pencil" aria-hidden="true">
            &#9998;
          </span>
          <input
            className="questionnaire-builder-title"
            aria-label="Questionnaire title"
            value={draft.title}
            onChange={(event) => updateTitle(event.target.value)}
            placeholder="Name this questionnaire..."
          />
        </div>
        <div className="questionnaire-builder-actions">
          <span className="questionnaire-status-badge draft">{draft.status}</span>
          <button
            className="primary-button"
            type="button"
            disabled={!canSave}
            onClick={() => void saveQuestionnaire()}
          >
            {saving ? "Saving..." : "Save questionnaire"}
          </button>
        </div>
      </header>

      <BuilderValidationNotice issues={validationIssues} />
      {saveError && (
        <div className="questionnaire-builder-save-error" role="alert">
          <strong>Unable to save questionnaire.</strong>
          <span>{saveError}</span>
        </div>
      )}

      <BuilderMetadataStrip
        canonicalUrl={canonicalUrl}
        version={draft.version}
        onVersionChange={(version) => setDraft((current) => ({ ...current, version }))}
      />

      <div className="questionnaire-builder-workspace">
        <section aria-labelledby="builder-questions-title">
          <div className="questionnaire-builder-pane-heading">
            <h2 id="builder-questions-title">Questions</h2>
            <span>{itemCountText(draft.questions.length)}</span>
          </div>

          <div className="questionnaire-builder-items">
            {draft.questions.map((question) => (
              <BuilderQuestionCard
                key={question.id}
                question={question}
                issues={validationIssues.filter((issue) => issue.questionId === question.id)}
                onChange={(changes) => updateQuestion(question.id, changes)}
                onTextChange={(text) => updateQuestionText(question.id, text)}
                onTypeChange={(type) => changeQuestionType(question.id, type)}
                onDelete={() => removeQuestion(question.id)}
                onAddOption={() => addOption(question.id)}
                onUpdateOption={(optionId, display) => updateOption(question.id, optionId, display)}
                onRemoveOption={(optionId) => removeOption(question.id, optionId)}
              />
            ))}
            <button className="questionnaire-builder-add" type="button" onClick={addQuestion}>
              + Add question
            </button>
          </div>
        </section>

        <BuilderPreviewPanel
          activeTab={previewTab}
          onTabChange={setPreviewTab}
          questions={draft.questions}
          previewResult={previewResult}
        />
      </div>

      <p className="questionnaire-builder-footnote">
        Demo environment
      </p>
    </section>
  );
}

interface BuilderMetadataStripProps {
  canonicalUrl: string | null;
  version: string;
  onVersionChange: (version: string) => void;
}

function BuilderMetadataStrip({ canonicalUrl, version, onVersionChange }: BuilderMetadataStripProps) {
  return (
    <dl className="questionnaire-builder-metadata">
      <div>
        <dt>Canonical URL</dt>
        <dd>
          {canonicalUrl ?? "Unavailable until a valid title is entered"}
          <span>from title - fixed after first save</span>
        </dd>
      </div>
      <div>
        <dt>Version</dt>
        <dd>
          <input
            className="questionnaire-builder-version"
            aria-label="Questionnaire version"
            value={version}
            onChange={(event) => onVersionChange(event.target.value)}
            placeholder="Unversioned"
          />
        </dd>
      </div>
      <div>
        <dt>Status</dt>
        <dd>active on save</dd>
      </div>
    </dl>
  );
}

interface BuilderQuestionCardProps {
  question: BuilderQuestion;
  issues: BuilderValidationIssue[];
  onChange: (changes: Partial<BuilderQuestion>) => void;
  onTextChange: (text: string) => void;
  onTypeChange: (type: BuilderQuestionType) => void;
  onDelete: () => void;
  onAddOption: () => void;
  onUpdateOption: (optionId: string, display: string) => void;
  onRemoveOption: (optionId: string) => void;
}

function BuilderQuestionCard({
  question,
  issues,
  onChange,
  onTextChange,
  onTypeChange,
  onDelete,
  onAddOption,
  onUpdateOption,
  onRemoveOption
}: BuilderQuestionCardProps) {
  const invalidQuestion = issues.length > 0;

  return (
    <article className={`questionnaire-builder-question ${invalidQuestion ? "invalid" : ""}`}>
      <div className="questionnaire-builder-question-top">
        <span className="questionnaire-builder-grip" aria-hidden="true">::</span>
        <input
          aria-label="Question text"
          value={question.text}
          onChange={(event) => onTextChange(event.target.value)}
          placeholder="Untitled question"
        />
        <select
          aria-label="Question type"
          value={question.type}
          onChange={(event) => onTypeChange(event.target.value as BuilderQuestionType)}
        >
          {QUESTION_TYPES.map((type) => (
            <option key={type.value} value={type.value}>
              {type.label}
            </option>
          ))}
        </select>
        <button className="questionnaire-builder-delete" type="button" aria-label="Delete question" onClick={onDelete}>
          x
        </button>
      </div>

      <div className="questionnaire-builder-question-details">
        <label className="questionnaire-builder-required">
          <input
            type="checkbox"
            checked={question.required}
            onChange={(event) => onChange({ required: event.target.checked })}
          />
          Required
        </label>
      </div>

      {question.type === "choice" && (
        <div className="questionnaire-builder-options">
          {question.options.map((option) => (
            <BuilderChoiceOptionRow
              key={option.id}
              questionText={question.text}
              option={option}
              onDisplayChange={(display) => onUpdateOption(option.id, display)}
              onDelete={() => onRemoveOption(option.id)}
            />
          ))}
          <button type="button" onClick={onAddOption}>+ Add option</button>
        </div>
      )}

      {issues.length > 0 && (
        <ul className="questionnaire-builder-card-issues">
          {issues.map((issue) => (
            <li key={`${issue.code}:${issue.optionId ?? ""}`}>{issue.message}</li>
          ))}
        </ul>
      )}
    </article>
  );
}

interface BuilderChoiceOptionRowProps {
  questionText: string;
  option: BuilderChoiceOption;
  onDisplayChange: (display: string) => void;
  onDelete: () => void;
}

function BuilderChoiceOptionRow({
  questionText,
  option,
  onDisplayChange,
  onDelete
}: BuilderChoiceOptionRowProps) {
  return (
    <div className="questionnaire-builder-option-row">
      <input
        aria-label={`${questionText || "Question"} option`}
        value={option.display}
        onChange={(event) => onDisplayChange(event.target.value)}
        placeholder="Option label"
      />
      <button type="button" aria-label={`Delete option ${option.display || "Untitled option"}`} onClick={onDelete}>
        x
      </button>
    </div>
  );
}

interface BuilderPreviewPanelProps {
  activeTab: PreviewTab;
  onTabChange: (tab: PreviewTab) => void;
  questions: BuilderQuestion[];
  previewResult: QuestionnairePreviewResult;
}

function BuilderPreviewPanel({ activeTab, onTabChange, questions, previewResult }: BuilderPreviewPanelProps) {
  return (
    <aside className="questionnaire-builder-preview" aria-labelledby="builder-preview-title">
      <div className="questionnaire-builder-pane-heading">
        <h2 id="builder-preview-title">Live preview</h2>
      </div>
      <div className="questionnaire-builder-preview-shell">
        <div className="questionnaire-builder-preview-tabs" role="tablist" aria-label="Questionnaire preview">
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === "nurse"}
            onClick={() => onTabChange("nurse")}
          >
            Nurse view
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === "fhir"}
            onClick={() => onTabChange("fhir")}
          >
            FHIR view
          </button>
        </div>

        {activeTab === "nurse" ? (
          <NursePreview questions={questions} />
        ) : (
          <FhirPreview previewResult={previewResult} />
        )}

        <p className="questionnaire-builder-preview-hint">
          Live preview from the local questionnaire draft
        </p>
      </div>
      <p className="questionnaire-builder-preview-note">
        This Questionnaire will be created as active.
      </p>
    </aside>
  );
}

function NursePreview({ questions }: { questions: BuilderQuestion[] }) {
  return (
    <div className="questionnaire-builder-preview-body">
      {questions.length === 0 ? (
        <p className="questionnaire-builder-preview-empty">Add a question to start the nurse preview.</p>
      ) : (
        questions.map((question) => (
          <div key={question.id} className="questionnaire-builder-preview-question">
            <strong>
              {question.text.trim() || "Untitled question"}
              {question.required && <span className="questionnaire-builder-required-mark"> required</span>}
            </strong>
            <QuestionPreviewControl question={question} />
          </div>
        ))
      )}
    </div>
  );
}

function QuestionPreviewControl({ question }: { question: BuilderQuestion }) {
  if (question.type === "boolean") {
    return (
      <div className="questionnaire-builder-segments">
        <span>Yes</span>
        <span>No</span>
      </div>
    );
  }

  if (question.type === "choice") {
    return question.options.length > 0 ? (
      <select className="questionnaire-builder-preview-select" aria-label={`${question.text || "Question"} preview`} disabled>
        <option>Select...</option>
        {question.options.map((option) => (
          <option key={option.id}>{option.display || "Untitled option"}</option>
        ))}
      </select>
    ) : (
      <div className="questionnaire-builder-preview-invalid">
        {"No options to show yet \u2014 add options to this choice question."}
      </div>
    );
  }

  if (question.type === "text") {
    return <textarea className="questionnaire-builder-preview-input" rows={3} placeholder="Long text answer" disabled />;
  }

  const inputType =
    question.type === "integer"
      ? "number"
      : question.type === "dateTime"
        ? "datetime-local"
        : question.type === "date"
          ? "date"
          : "text";
  const placeholder = question.type === "string" ? "Short text answer" : undefined;
  return (
    <input
      className="questionnaire-builder-preview-input"
      type={inputType}
      placeholder={placeholder}
      disabled
    />
  );
}

function FhirPreview({ previewResult }: { previewResult: QuestionnairePreviewResult }) {
  return (
    <div className="questionnaire-builder-preview-body">
      {previewResult.resource ? (
        <pre className="questionnaire-builder-fhir">{JSON.stringify(previewResult.resource, null, 2)}</pre>
      ) : (
        <p className="questionnaire-builder-preview-unavailable">
          FHIR preview unavailable until required metadata is provided.
        </p>
      )}
      {previewResult.omittedItems.length > 0 && (
        <div className="questionnaire-builder-omitted-items" role="note">
          {previewResult.omittedItems.map((message) => (
            <p key={message}>{message}</p>
          ))}
        </div>
      )}
    </div>
  );
}

function BuilderValidationNotice({ issues }: { issues: BuilderValidationIssue[] }) {
  const valid = issues.length === 0;
  return (
    <div className={`questionnaire-builder-notice ${valid ? "success" : "error"}`} role="status">
      <span className="questionnaire-builder-notice-icon" aria-hidden="true">{valid ? "OK" : "!"}</span>
      {valid ? (
        <span>
          <strong>Ready to save.</strong> The Questionnaire will be created as active.
        </span>
      ) : (
        <div>
          <strong>{issues.length} {issues.length === 1 ? "issue" : "issues"} need attention.</strong>
          <ul>
            {issues.map((issue, index) => (
              <li key={`${issue.code}:${issue.questionId ?? ""}:${issue.optionId ?? ""}:${index}`}>{issue.message}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function createInternalId(prefix: string): string {
  return globalThis.crypto?.randomUUID?.() ?? `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function regenerateAllOptionCodes(
  questionLinkId: string,
  options: BuilderChoiceOption[]
): BuilderChoiceOption[] {
  const regenerated: BuilderChoiceOption[] = [];
  for (const option of options) {
    regenerated.push({
      ...option,
      code: generateUniqueOptionCode(questionLinkId, option.display, regenerated)
    });
  }
  return regenerated;
}

function createInitialQuestionnaireBuilderState(): BuilderState {
  return {
    title: "",
    slug: "",
    version: "1.0.0",
    status: "draft",
    questions: [
      {
        id: createInternalId("question"),
        linkId: "",
        text: "",
        type: "string",
        required: false,
        options: []
      }
    ]
  };
}

function itemCountText(count: number): string {
  return count === 1 ? "1 item" : `${count} items`;
}
