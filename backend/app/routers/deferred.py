from fastapi import APIRouter
from fastapi.responses import JSONResponse

router = APIRouter(prefix="/api", tags=["deferred"])

@router.post("/transcribe")
async def transcribe_stub() -> dict:
    return JSONResponse(status_code=501, content={"message": "Audio transcription is deferred."})
