import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


AUDIT_LOG = Path(__file__).resolve().parents[2] / "audit.log"


def write_save_audit(record: dict[str, Any]) -> None:
    payload = {
        "timestamp": datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z"),
        **record,
    }
    with AUDIT_LOG.open("a", encoding="utf-8") as handle:
        handle.write(json.dumps(payload, separators=(",", ":")) + "\n")
