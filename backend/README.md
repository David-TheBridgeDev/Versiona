# Versiona Backend

This directory contains the API and audio processing engine for Versiona, developed using **FastAPI** and **Celery**.

## 🛠️ Prerequisites

- **Python 3.10+**
- **FFmpeg** (Required for audio processing with Librosa and Demucs)
- **Redis** (As a broker for Celery)
- **PostgreSQL** (As the main database)

## 🚀 Local Environment Setup

If you wish to run the backend outside of Docker for development or debugging:

### 1. Create a virtual environment
```bash
python -m venv venv
# On Windows:
.\venv\Scripts\activate
# On Linux/macOS:
source venv/bin/activate
```

### 2. Install dependencies
```bash
pip install -r requirements.txt
```

### 3. Environment Variables
Create a `.env` file in this directory (or configure the variables in your terminal):
```env
DATABASE_URL=postgresql://user:password@localhost:5432/versionadb
REDIS_URL=redis://localhost:6379/0
SECRET_KEY=your-development-secret-key
```

## 🏃 Service Execution

For the backend to function fully, you need to run **two simultaneous processes**:

### A. The API (FastAPI)
Run the web server with automatic reload:
```bash
uvicorn main:app --reload --port 8000
```
Interactive documentation will be available at: [http://localhost:8000/docs](http://localhost:8000/docs)

### B. The Worker (Celery)
In a new terminal (with the virtual environment activated), run the task processor:
```bash
# Ensure Redis is running before this step
celery -A tasks worker --loglevel=info -P solo
```
*Note: The `-P solo` flag is recommended on Windows. On Linux/macOS, you can omit it.*

## 🧪 Technical Notes

- **AI Models:** The first time you process audio, Celery will download the Demucs models (several GB). Ensure you have a good connection.
- **Database:** SQLAlchemy models are automatically synchronized when the API starts if the database is available.
- **FFmpeg:** Ensure that `ffmpeg` is in your PATH; otherwise, stem separation will fail.
