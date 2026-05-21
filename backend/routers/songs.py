from fastapi import APIRouter, Depends, UploadFile, File, Form, HTTPException
from sqlalchemy.orm import Session
from database import get_db
from dependencies import get_current_user, get_verified_user
import models, schemas, tasks
import os
import shutil
import uuid
from typing import Optional

from mutagen import File as MutagenFile
from mutagen.mp3 import MP3
from mutagen.flac import FLAC
from mutagen.oggvorbis import OggVorbis
from mutagen.mp4 import MP4

router = APIRouter(prefix="/songs", tags=["songs"])

UPLOAD_DIR = "uploads"
if not os.path.exists(UPLOAD_DIR):
    os.makedirs(UPLOAD_DIR)

def get_metadata(file_path):
    filename = os.path.basename(file_path)
    title_default = os.path.splitext(filename)[0]
    metadata = {
        "title": title_default,
        "artist": "Unknown Artist",
        "genre": "Unknown Genre",
        "duration": 0
    }
    try:
        audio = MutagenFile(file_path)
        if audio:
            metadata["duration"] = int(audio.info.length)
            
            # Try to extract common tags
            if "tit2" in audio: metadata["title"] = str(audio["tit2"]) # MP3
            elif "title" in audio: metadata["title"] = str(audio["title"][0]) # FLAC/OGG
            
            if "tpe1" in audio: metadata["artist"] = str(audio["tpe1"]) # MP3
            elif "artist" in audio: metadata["artist"] = str(audio["artist"][0]) # FLAC/OGG

            if "tcon" in audio: metadata["genre"] = str(audio["tcon"]) # MP3
            elif "genre" in audio: metadata["genre"] = str(audio["genre"][0]) # FLAC/OGG
    except:
        pass
    return metadata

@router.post("/")
async def create_song(
    quality_mode: str = Form(...),
    file: UploadFile = File(...),
    name: Optional[str] = Form(None),
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_verified_user)
):
    # Validate quality_mode
    if quality_mode not in ["fast", "studio", "studio_pro"]:
        raise HTTPException(status_code=400, detail="Invalid quality mode")

    # Create user directory if it doesn't exist
    user_dir = os.path.join(UPLOAD_DIR, str(current_user.id))
    if not os.path.exists(user_dir):
        os.makedirs(user_dir)

    # Generate a unique ID for the song
    song_id_str = str(uuid.uuid4())
    song_dir = os.path.join(user_dir, song_id_str)
    os.makedirs(song_dir)

    # Save original file
    file_path = os.path.join(song_dir, file.filename)
    with open(file_path, "wb") as buffer:
        shutil.copyfileobj(file.file, buffer)

    # Extract metadata
    meta = get_metadata(file_path)
    
    # If name is not provided, use title from metadata or filename
    final_name = name if name else meta["title"]

    # Create database entry
    db_song = models.Song(
        name=final_name,
        artist=meta["artist"],
        genre=meta["genre"],
        duration=meta["duration"],
        original_filename=file.filename,
        quality_mode=quality_mode,
        user_id=current_user.id,
        status="pending",
        storage_path=song_dir
    )
    db.add(db_song)
    db.commit()
    db.refresh(db_song)

    # Trigger background processing task
    task = tasks.process_audio.delay(db_song.id, file_path)
    
    # Save celery task ID for tracking
    db_song.celery_task_id = task.id
    db.commit()
    db.refresh(db_song)

    return {"song": db_song, "task_id": task.id}

@router.get("/", response_model=list[schemas.SongResponse])
async def list_songs(
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_verified_user)
):
    return db.query(models.Song).filter(models.Song.user_id == current_user.id).all()

@router.get("/{song_id}", response_model=schemas.SongResponse)
async def get_song(
    song_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_verified_user)
):
    song = db.query(models.Song).filter(
        models.Song.id == song_id, 
        models.Song.user_id == current_user.id
    ).first()
    if not song:
        raise HTTPException(status_code=404, detail="Song not found")
    return song

@router.patch("/{song_id}", response_model=schemas.SongResponse)
async def update_song(
    song_id: int,
    song_update: schemas.SongUpdate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_verified_user)
):
    db_song = db.query(models.Song).filter(
        models.Song.id == song_id, 
        models.Song.user_id == current_user.id
    ).first()
    if not db_song:
        raise HTTPException(status_code=404, detail="Song not found")
    
    update_data = song_update.dict(exclude_unset=True)
    for key, value in update_data.items():
        setattr(db_song, key, value)
    
    db.commit()
    db.refresh(db_song)
    return db_song

@router.delete("/{song_id}")
async def delete_song(
    song_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_verified_user)
):
    db_song = db.query(models.Song).filter(
        models.Song.id == song_id, 
        models.Song.user_id == current_user.id
    ).first()
    if not db_song:
        raise HTTPException(status_code=404, detail="Song not found")
    
    song_dir = db_song.storage_path
    
    # Delete stems from DB
    db.query(models.Stem).filter(models.Stem.song_id == song_id).delete()
    
    # Delete song from DB
    db.delete(db_song)
    db.commit()
    
    # Delete files if directory exists
    if song_dir and os.path.exists(song_dir):
        shutil.rmtree(song_dir)
        
    return {"detail": "Song deleted"}

@router.post("/{song_id}/retry")
async def retry_song(
    song_id: int,
    quality_mode: Optional[str] = Form(None),
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_verified_user)
):
    db_song = db.query(models.Song).filter(
        models.Song.id == song_id, 
        models.Song.user_id == current_user.id
    ).first()
    if not db_song:
        raise HTTPException(status_code=404, detail="Song not found")
    
    if quality_mode:
        if quality_mode not in ["fast", "studio", "studio_pro"]:
            raise HTTPException(status_code=400, detail="Invalid quality mode")
        db_song.quality_mode = quality_mode
    
    db_song.status = "pending"
    db.commit()
    
    # Get original path using storage_path
    if not db_song.storage_path:
        raise HTTPException(status_code=400, detail="Storage path not set for this song")

    original_file_path = os.path.join(db_song.storage_path, db_song.original_filename)
            
    if not os.path.exists(original_file_path):
         raise HTTPException(status_code=404, detail="Original file not found on disk")

    task = tasks.process_audio.delay(db_song.id, original_file_path)
    db_song.celery_task_id = task.id
    db.commit()
    
    return {"song": db_song, "task_id": task.id}
