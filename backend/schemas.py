from pydantic import BaseModel, EmailStr
from datetime import datetime
from typing import Optional

class UserBase(BaseModel):
    email: EmailStr
    full_name: Optional[str] = None

class UserCreate(UserBase):
    password: str

class EmailRequest(BaseModel):
    email: EmailStr

class UserComplete(BaseModel):
    email: EmailStr
    full_name: str
    password: str

class UserResponse(UserBase):
    id: int
    is_verified: bool
    created_at: datetime

    class Config:
        from_attributes = True

class UserUpdate(BaseModel):
    full_name: Optional[str] = None
    email: Optional[EmailStr] = None

class PasswordChange(BaseModel):
    current_password: str
    new_password: str

class Token(BaseModel):
    access_token: str
    token_type: str

class TokenData(BaseModel):
    email: Optional[str] = None

class VerifyCode(BaseModel):
    email: EmailStr
    code: str

class StemResponse(BaseModel):
    id: int
    type: str
    
    class Config:
        from_attributes = True

class SongResponse(BaseModel):
    id: int
    name: str
    artist: Optional[str] = None
    genre: Optional[str] = None
    duration: Optional[int] = None
    original_filename: str
    status: str
    bpm: Optional[int] = None
    key: Optional[str] = None
    scale: Optional[str] = None
    chords_json: Optional[list] = None
    waveform_data: Optional[list[float]] = None
    quality_mode: str
    celery_task_id: Optional[str] = None
    created_at: datetime
    stems: list[StemResponse] = []

    class Config:
        from_attributes = True

class SongUpdate(BaseModel):
    name: Optional[str] = None
    artist: Optional[str] = None
    genre: Optional[str] = None
    bpm: Optional[int] = None
    key: Optional[str] = None
    scale: Optional[str] = None
