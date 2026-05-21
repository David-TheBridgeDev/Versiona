from fastapi import APIRouter, WebSocket, WebSocketDisconnect, Depends
from typing import Dict
import asyncio
from tasks import app as celery_app
from database import SessionLocal
import models

router = APIRouter(prefix="/ws", tags=["websockets"])

class ConnectionManager:
    def __init__(self):
        self.active_connections: Dict[int, WebSocket] = {}

    async def connect(self, song_id: int, websocket: WebSocket):
        await websocket.accept()
        self.active_connections[song_id] = websocket

    def disconnect(self, song_id: int):
        if song_id in self.active_connections:
            del self.active_connections[song_id]

    async def send_personal_message(self, message: dict, websocket: WebSocket):
        await websocket.send_json(message)

manager = ConnectionManager()

@router.websocket("/{song_id}")
async def websocket_endpoint(websocket: WebSocket, song_id: int):
    await manager.connect(song_id, websocket)
    db = SessionLocal()
    try:
        # Find the song and its associated task
        song = db.query(models.Song).filter(models.Song.id == song_id).first()
        
        if song and song.celery_task_id and song.status == "processing":
            # Start automatic monitoring if the song is processing
            asyncio.create_task(monitor_task(song.celery_task_id, websocket))
        
        while True:
            data = await websocket.receive_text()
            if data == "ping":
                await websocket.send_text("pong")
            
            # Allow manual tracking if a task_id is sent
            if data.startswith("track:"):
                task_id = data.split(":")[1]
                asyncio.create_task(monitor_task(task_id, websocket))

    except WebSocketDisconnect:
        manager.disconnect(song_id)
    finally:
        db.close()

async def monitor_task(task_id: str, websocket: WebSocket):
    from celery.result import AsyncResult
    from starlette.websockets import WebSocketState
    
    last_progress = -1
    try:
        while True:
            # Check if websocket is still connected
            if websocket.client_state == WebSocketState.DISCONNECTED:
                break
                
            res = AsyncResult(task_id, app=celery_app)
            if res.state == 'PROGRESS':
                progress = res.info.get('progress', 0)
                status = res.info.get('status', '')
                if progress != last_progress:
                    await websocket.send_json({"progress": progress, "status": status, "state": "PROGRESS"})
                    last_progress = progress
            elif res.ready():
                if res.successful():
                    await websocket.send_json({"progress": 100, "status": "Completed", "state": "SUCCESS"})
                else:
                    await websocket.send_json({"progress": 0, "status": str(res.result), "state": "FAILURE"})
                break
            await asyncio.sleep(0.5)
    except Exception as e:
        # Most common exception here is WebSocketDisconnect or RuntimeError due to closed connection
        print(f"Monitor task stopped for task {task_id}: {e}")
