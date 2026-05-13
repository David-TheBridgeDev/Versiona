from fastapi import FastAPI, Depends
from fastapi.middleware.cors import CORSMiddleware
from database import engine, Base
import models, schemas
from routers import auth, users, songs, websockets, stems
from dependencies import get_current_user

# Crear las tablas en la base de datos
models.Base.metadata.create_all(bind=engine)

app = FastAPI(title="Versiona API", version="1.0.0")

# CORS configuration
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router)
app.include_router(users.router)
app.include_router(songs.router)
app.include_router(websockets.router)
app.include_router(stems.router)

@app.get("/")
async def root():
    return {"message": "Welcome to Versiona API", "status": "online"}
