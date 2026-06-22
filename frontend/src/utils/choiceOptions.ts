import type { ChoiceOption } from "../types";

type LegacyChoiceOption = {
  fhirValueType?: string;
  valueType?: string;
  system?: unknown;
  code?: unknown;
  value?: unknown;
  display?: unknown;
};

export function normalizeChoiceOption(option: unknown): ChoiceOption | null {
  if (!option || typeof option !== "object") return null;
  const record = option as LegacyChoiceOption;
  const fhirValueType = record.fhirValueType ?? legacyFhirValueType(record.valueType);

  if (fhirValueType === "valueCoding" || (!fhirValueType && record.system && record.code)) {
    if (typeof record.system !== "string" || typeof record.code !== "string") return null;
    return {
      fhirValueType: "valueCoding",
      system: record.system,
      code: record.code,
      display: typeof record.display === "string" && record.display ? record.display : record.code
    };
  }

  if (fhirValueType === "valueString") {
    if (typeof record.value !== "string") return null;
    return {
      fhirValueType: "valueString",
      value: record.value,
      display: typeof record.display === "string" && record.display ? record.display : record.value
    };
  }

  return null;
}

export function choiceOptionKey(option: ChoiceOption, index: number): string {
  return `${choiceOptionIdentity(option)}:${index}`;
}

export function choiceOptionInputValue(option: ChoiceOption): string {
  return choiceOptionIdentity(option);
}

export function selectedChoiceInputValue(value: unknown, options: ChoiceOption[] | undefined): string {
  const selected = options?.find((option) => isSameChoiceOption(option, value));
  return selected ? choiceOptionInputValue(selected) : "";
}

export function isSameChoiceOption(option: ChoiceOption, value: unknown): value is ChoiceOption {
  if (!value || typeof value !== "object") return false;
  const normalized = normalizeChoiceOption(value);
  if (!normalized || option.fhirValueType !== normalized.fhirValueType) return false;

  if (option.fhirValueType === "valueCoding" && normalized.fhirValueType === "valueCoding") {
    return option.system === normalized.system && option.code === normalized.code;
  }

  if (option.fhirValueType === "valueString" && normalized.fhirValueType === "valueString") {
    return option.value === normalized.value;
  }

  return false;
}

export function choiceOptionDisplay(option: ChoiceOption): string {
  if (option.display) return option.display;
  return option.fhirValueType === "valueCoding" ? option.code : option.value;
}

export function isChoiceOption(value: unknown): value is ChoiceOption {
  return normalizeChoiceOption(value) !== null;
}

function choiceOptionIdentity(option: ChoiceOption): string {
  if (option.fhirValueType === "valueCoding") {
    return `valueCoding:${encodePart(option.system)}|${encodePart(option.code)}`;
  }
  return `valueString:${encodePart(option.value)}`;
}

function legacyFhirValueType(valueType: string | undefined): ChoiceOption["fhirValueType"] | undefined {
  if (valueType === "Coding") return "valueCoding";
  if (valueType === "string") return "valueString";
  return undefined;
}

function encodePart(value: string): string {
  return encodeURIComponent(value);
}
