from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session
from database import get_db
from dependencies import get_current_user
import models
import os

router = APIRouter(prefix="/stems", tags=["stems"])

@router.get("/{stem_id}")
async def get_stem_file(
    stem_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user)
):
    # Buscar el stem y verificar propiedad a través de la canción
    stem = db.query(models.Stem).join(models.Song).filter(
        models.Stem.id == stem_id,
        models.Song.user_id == current_user.id
    ).first()

    if not stem:
        raise HTTPException(status_code=404, detail="Stem not found or access denied")

    if not os.path.exists(stem.file_path):
        raise HTTPException(status_code=404, detail="Audio file not found on server")

    return FileResponse(
        path=stem.file_path,
        media_type="audio/wav",
        filename=f"{stem.type}.wav"
    )
