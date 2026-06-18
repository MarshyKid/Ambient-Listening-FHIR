from fastapi import APIRouter
from fastapi.responses import JSONResponse

router = APIRouter(prefix="/api", tags=["deferred"])


@router.post("/extract")
async def extract_stub() -> dict:
    return JSONResponse(status_code=501, content={"message": "AI extraction is deferred to Phase 3."})


@router.post("/transcribe")
async def transcribe_stub() -> dict:
    return JSONResponse(status_code=501, content={"message": "Audio transcription is deferred."})
