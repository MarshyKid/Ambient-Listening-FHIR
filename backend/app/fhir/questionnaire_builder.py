import re

from app.fhir.constants import SUPPORTED_QUESTIONNAIRE_ITEM_TYPES
from app.schemas.questionnaires import CreateQuestionnaireRequest


SLUG_PATTERN = re.compile(r"^[a-z0-9][a-z0-9-]{0,78}[a-z0-9]$")


def build_questionnaire_resource(*, canonical_base: str, request: CreateQuestionnaireRequest) -> dict:
    _validate_request(request)
    slug = request.slug.strip()
    resource = {
        "resourceType": "Questionnaire",
        "url": f"{canonical_base.rstrip('/')}/{slug}",
        "version": request.version.strip(),
        "name": (request.name or _pascal_name(slug)).strip(),
        "title": request.title.strip(),
        "status": request.status,
        "item": [_build_item(item) for item in request.items],
    }
    if request.description is not None and request.description.strip():
        resource["description"] = request.description.strip()
    return resource


def _validate_request(request: CreateQuestionnaireRequest) -> None:
    if not SLUG_PATTERN.fullmatch(request.slug.strip()):
        raise ValueError("Questionnaire slug must be lowercase letters, numbers, and hyphens, and start/end with a letter or number.")
    if not request.version.strip():
        raise ValueError("Questionnaire version is required.")
    if not request.title.strip():
        raise ValueError("Questionnaire title is required.")
    if request.status not in {"draft", "active", "retired"}:
        raise ValueError("Questionnaire status must be draft, active, or retired.")
    if not request.items:
        raise ValueError("Questionnaire requires at least one item.")

    seen_link_ids: set[str] = set()
    for item in request.items:
        link_id = item.linkId.strip()
        if not link_id:
            raise ValueError("Questionnaire item linkId is required.")
        if link_id in seen_link_ids:
            raise ValueError(f"Duplicate Questionnaire item linkId: {link_id}")
        seen_link_ids.add(link_id)
        if not item.text.strip():
            raise ValueError(f"Questionnaire item text is required for {link_id}.")
        if item.type not in SUPPORTED_QUESTIONNAIRE_ITEM_TYPES:
            raise ValueError(f"Unsupported Questionnaire item type for Phase 1/2: {item.type}")
        if item.type == "group":
            if not item.items:
                raise ValueError(f"Group item {link_id} requires at least one child item.")
            if item.options:
                raise ValueError(f"Group item {link_id} cannot include options.")
            _validate_request(
                CreateQuestionnaireRequest(
                    slug=request.slug,
                    version=request.version,
                    title=request.title,
                    status=request.status,
                    items=item.items,
                )
            )
        elif item.type == "choice":
            if not item.options:
                raise ValueError(f"Choice item {link_id} requires at least one option.")
            for option in item.options:
                if not option.system.strip() or not option.code.strip() or not option.display.strip():
                    raise ValueError(f"Choice item {link_id} options require system, code, and display.")
        elif item.options:
            raise ValueError(f"Only choice items can include options: {link_id}")


def _build_item(item) -> dict:
    resource_item = {
        "linkId": item.linkId.strip(),
        "text": item.text.strip(),
        "type": item.type,
    }
    if item.required is not None:
        resource_item["required"] = item.required
    if item.type == "choice":
        resource_item["answerOption"] = [
            {"valueCoding": {"system": option.system.strip(), "code": option.code.strip(), "display": option.display.strip()}}
            for option in item.options or []
        ]
    if item.type == "group":
        resource_item["item"] = [_build_item(child) for child in item.items or []]
    return resource_item


def _pascal_name(slug: str) -> str:
    return "".join(part.capitalize() for part in slug.split("-") if part) or "Questionnaire"
