from app.schemas.reconcile import ReconcileRequest, ReconcileResponse
from app.services.fhir_client import FhirClient
from app.services.record_snapshot_service import RecordSnapshotService
from app.services.reconciliation_agent_service import ReconciliationAgentService
from app.services.reconciliation_graph import ReconciliationGraph


class ReconciliationService:
    def __init__(self, client: FhirClient) -> None:
        self.snapshot_service = RecordSnapshotService(client)
        self.agent = ReconciliationAgentService()
        self.graph = ReconciliationGraph(self.snapshot_service, self.agent)

    async def reconcile(self, request: ReconcileRequest) -> ReconcileResponse:
        return await self.graph.ainvoke(request)
