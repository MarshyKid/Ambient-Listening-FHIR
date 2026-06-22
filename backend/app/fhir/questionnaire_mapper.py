from urllib.parse import urlparse

from app.fhir.constants import ANSWERABLE_QUESTIONNAIRE_ITEM_TYPES, SUPPORTED_QUESTIONNAIRE_ITEM_TYPES
from app.schemas.questionnaires import ChoiceOption, QuestionnaireDetail, QuestionnaireItem, QuestionnaireSummary


def derive_slug(url: str | None) -> str:
    if not url:
        raise ValueError("Questionnaire.url is required.")
    parsed = urlparse(url)
    path = parsed.path.rstrip("/")
    slug = path.split("/")[-1] if path else ""
    if not slug:
        raise ValueError(f"Could not derive questionnaire slug from URL: {url}")
    return slug


def require_questionnaire_url_version(resource: dict) -> tuple[str, str]:
    url = resource.get("url", _require_id(resource))
    version = resource.get("version") or (resource.get("meta") or {}).get("versionId")
    if not url:
        raise ValueError("Questionnaire.url is required.")
    if not version:
        raise ValueError("Questionnaire.version is required.")
    return str(url), str(version)


def map_questionnaire_summary(resource: dict, item_count: int | None = None) -> QuestionnaireSummary:
    fhir_id = _require_id(resource)
    url, version = require_questionnaire_url_version(resource)
    return QuestionnaireSummary(
        id=fhir_id,
        fhirId=fhir_id,
        slug=derive_slug(url),
        url=url,
        version=version,
        title=str(resource.get("title") or resource.get("name") or fhir_id),
        description=resource.get("description"),
        status=str(resource.get("status") or "unknown"),
        itemCount=item_count if item_count is not None else count_answerable_items(resource.get("item") or []),
    )


def map_questionnaire_detail(resource: dict) -> QuestionnaireDetail:
    summary = map_questionnaire_summary(resource, item_count=count_answerable_items(resource.get("item") or []))
    return QuestionnaireDetail(
        id=summary.id,
        fhirId=summary.fhirId,
        slug=summary.slug,
        url=summary.url,
        version=summary.version,
        title=summary.title,
        description=summary.description,
        status=summary.status,
        items=[map_questionnaire_item(item) for item in resource.get("item") or []],
    )


def map_questionnaire_item(item: dict) -> QuestionnaireItem:
    item_type = item.get("type")
    if item_type not in SUPPORTED_QUESTIONNAIRE_ITEM_TYPES:
        raise ValueError(f"Unsupported Questionnaire item type for Phase 1/2: {item_type}")
    return QuestionnaireItem(
        linkId=str(item.get("linkId") or ""),
        text=str(item.get("text") or item.get("linkId") or ""),
        type=str(item_type),
        options=_choice_options(item) if item_type == "choice" else None,
        items=[map_questionnaire_item(child) for child in item.get("item") or []] if item_type == "group" else None,
    )


def questionnaire_items_by_link_id(resource: dict) -> dict[str, dict]:
    by_link_id: dict[str, dict] = {}
    _collect_items_by_link_id(resource.get("item") or [], by_link_id)
    return by_link_id


def count_answerable_items(items: list[dict]) -> int:
    total = 0
    for item in items:
        item_type = item.get("type")
        if item_type == "group":
            total += count_answerable_items(item.get("item") or [])
        elif item_type in ANSWERABLE_QUESTIONNAIRE_ITEM_TYPES:
            total += 1
    return total


def find_choice_coding(item: dict, system: str, code: str) -> dict | None:
    for option in item.get("answerOption") or []:
        coding = option.get("valueCoding") or {}
        if coding.get("system") == system and coding.get("code") == code:
            return {key: value for key, value in coding.items() if value is not None}
    return None


def find_choice_answer(item: dict, value: dict) -> tuple[str, dict | str] | None:
    fhir_value_type = value.get("fhirValueType")

    if fhir_value_type == "valueCoding" or (not fhir_value_type and value.get("system") and value.get("code")):
        system = value.get("system")
        code = value.get("code")
        if not system or not code:
            return None
        coding = find_choice_coding(item, str(system), str(code))
        return ("valueCoding", coding) if coding else None

    if fhir_value_type == "valueString":
        submitted = value.get("value")
        if not isinstance(submitted, str):
            return None
        for option in item.get("answerOption") or []:
            if option.get("valueString") == submitted:
                return "valueString", submitted
        return None

    return None


def _choice_options(item: dict) -> list[ChoiceOption] | None:
    options: list[ChoiceOption] = []

    for option in item.get("answerOption") or []:
        if "valueCoding" in option:
            coding = option.get("valueCoding") or {}
            if coding.get("system") and coding.get("code"):
                options.append(
                    ChoiceOption(
                        fhirValueType="valueCoding",
                        system=str(coding["system"]),
                        code=str(coding["code"]),
                        display=str(coding.get("display") or coding["code"]),
                    )
                )

        elif "valueString" in option:
            value = str(option["valueString"])
            options.append(
                ChoiceOption(
                    fhirValueType="valueString",
                    value=value,
                    display=value,
                )
            )

        elif "valueInteger" in option:
            raise ValueError("Unsupported Questionnaire answerOption type for Phase 1/2: valueInteger")

        elif "valueDate" in option:
            raise ValueError("Unsupported Questionnaire answerOption type for Phase 1/2: valueDate")

    return options or None


def _collect_items_by_link_id(items: list[dict], by_link_id: dict[str, dict]) -> None:
    for item in items:
        if item.get("linkId"):
            by_link_id[str(item["linkId"])] = item
        if item.get("type") == "group":
            _collect_items_by_link_id(item.get("item") or [], by_link_id)


def _require_id(resource: dict) -> str:
    fhir_id = resource.get("id")
    if not fhir_id:
        raise ValueError("FHIR Questionnaire is missing id.")
    return str(fhir_id)
