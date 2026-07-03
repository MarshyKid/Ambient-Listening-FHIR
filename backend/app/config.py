from functools import lru_cache
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from pydantic import Field, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    fhir_base_url: str = Field(default="http://localhost:8080/csp/healthshare/demo/fhir/r4", alias="FHIR_BASE_URL")
    fhir_username: str | None = Field(default=None, alias="FHIR_USERNAME")
    fhir_password: str | None = Field(default=None, alias="FHIR_PASSWORD")
    fhir_verify_ssl: bool = Field(default=False, alias="FHIR_VERIFY_SSL")

    fhir_mrn_system: str = Field(default="http://example.org/fhir/mrn", alias="FHIR_MRN_SYSTEM")
    fhir_staff_system: str = Field(default="http://example.org/staff-id", alias="FHIR_STAFF_SYSTEM")
    questionnaire_canonical_base: str = Field(
        default="http://example.org/fhir/Questionnaire",
        alias="QUESTIONNAIRE_CANONICAL_BASE",
    )

    default_practitioner_identifier: str = Field(default="nurse-demo", alias="DEFAULT_PRACTITIONER_IDENTIFIER")
    allowed_origins: str = Field(default="http://localhost:5173", alias="ALLOWED_ORIGINS")
    fhir_timeout_seconds: float = Field(default=10, alias="FHIR_TIMEOUT_SECONDS")
    enable_fhir_validate: bool = Field(default=False, alias="ENABLE_FHIR_VALIDATE")

    llm_provider: str = Field(default="mock", alias="LLM_PROVIDER")
    llm_model: str = Field(default="gpt-5.5", alias="LLM_MODEL")
    openai_api_key: str | None = Field(default=None, alias="OPENAI_API_KEY")
    llm_timeout_seconds: float = Field(default=45, alias="LLM_TIMEOUT_SECONDS")
    llm_reconciliation_planner_enabled: bool = Field(default=False, alias="LLM_RECONCILIATION_PLANNER_ENABLED")
    llm_reconciliation_semantic_compare_enabled: bool = Field(default=False, alias="LLM_RECONCILIATION_SEMANTIC_COMPARE_ENABLED")
    llm_intake_recommendation_enabled: bool = Field(default=False, alias="LLM_INTAKE_RECOMMENDATION_ENABLED")
    default_clinical_timezone: str = Field(default="Asia/Singapore", alias="DEFAULT_CLINICAL_TIMEZONE")

    @field_validator("fhir_base_url", "questionnaire_canonical_base")
    @classmethod
    def strip_trailing_slash(cls, value: str) -> str:
        return value.rstrip("/")

    @field_validator("default_clinical_timezone")
    @classmethod
    def validate_default_clinical_timezone(cls, value: str) -> str:
        try:
            ZoneInfo(value)
        except ZoneInfoNotFoundError as exc:
            raise ValueError(f"DEFAULT_CLINICAL_TIMEZONE is not a valid IANA timezone: {value}") from exc
        return value

    @property
    def cors_origins(self) -> list[str]:
        return [origin.strip() for origin in self.allowed_origins.split(",") if origin.strip()]

    @property
    def has_basic_auth(self) -> bool:
        return bool(self.fhir_username and self.fhir_password)


@lru_cache
def get_settings() -> Settings:
    return Settings()
