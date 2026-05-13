from sqlalchemy import Column, Integer, String, ForeignKey, DateTime, JSON, Boolean
from sqlalchemy.orm import relationship
import datetime
from database import Base

class User(Base):
    __tablename__ = "users"
    id = Column(Integer, primary_key=True, index=True)
    email = Column(String, unique=True, index=True)
    full_name = Column(String, nullable=True)
    hashed_password = Column(String, nullable=True)
    is_verified = Column(Boolean, default=False)
    verification_code = Column(String, nullable=True)
    verification_code_expires_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, default=datetime.datetime.utcnow)
    
    songs = relationship("Song", back_populates="owner")

class Song(Base):
    __tablename__ = "songs"
    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"))
    name = Column(String)
    artist = Column(String, nullable=True)
    genre = Column(String, nullable=True)
    duration = Column(Integer, nullable=True) # Duration in seconds
    original_filename = Column(String)
    status = Column(String, default="pending") # pending, processing, completed, error
    bpm = Column(Integer, nullable=True)
    key = Column(String, nullable=True)
    scale = Column(String, nullable=True)
    chords_json = Column(JSON, nullable=True)
    waveform_data = Column(JSON, nullable=True)
    quality_mode = Column(String) # fast, studio, studio_pro
    celery_task_id = Column(String, nullable=True)
    storage_path = Column(String, nullable=True) # Directory containing original file and stems
    created_at = Column(DateTime, default=datetime.datetime.utcnow)
    
    owner = relationship("User", back_populates="songs")
    stems = relationship("Stem", back_populates="song")

class Stem(Base):
    __tablename__ = "stems"
    id = Column(Integer, primary_key=True, index=True)
    song_id = Column(Integer, ForeignKey("songs.id"))
    type = Column(String) # vocals, drums, bass, other, piano, guitar
    file_path = Column(String)
    
    song = relationship("Song", back_populates="stems")
