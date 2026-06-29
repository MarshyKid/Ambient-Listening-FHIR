from app.config import Settings
from app.schemas.reconcile import ReconcileRequest, ReconcileResponse
from app.services.fhir_client import FhirClient
from app.services.record_snapshot_service import RecordSnapshotService
from app.services.reconciliation_agent_service import ReconciliationAgentService
from app.services.reconciliation_graph import ReconciliationGraph
from app.services.reconciliation_planner_service import ReconciliationPlannerService
from app.services.reconciliation_semantic_comparator_service import ReconciliationSemanticComparatorService


class ReconciliationService:
    def __init__(self, client: FhirClient, settings: Settings) -> None:
        self.snapshot_service = RecordSnapshotService(client)
        self.agent = ReconciliationAgentService()
        self.planner = ReconciliationPlannerService(settings) if settings.llm_reconciliation_planner_enabled else None
        self.semantic_comparator = (
            ReconciliationSemanticComparatorService(settings)
            if settings.llm_reconciliation_semantic_compare_enabled
            else None
        )
        self.graph = ReconciliationGraph(self.snapshot_service, self.agent, self.planner, self.semantic_comparator)

    async def reconcile(self, request: ReconcileRequest) -> ReconcileResponse:
        return await self.graph.ainvoke(request)
