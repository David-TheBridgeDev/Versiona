# Versiona

Versiona is a SaaS platform designed for musicians that enables track separation (stems) from audio files and the extraction of musical metadata (BPM, Key, Chords) with high precision using Artificial Intelligence models.

## 🚀 Main Features

- **Stem Separation:** Support for Fast (Demucs Light), Studio (Demucs v4), and Studio Pro (6 stems) modes.
- **Pro Musical Analysis:** Beat-synced chord detection, Major/Minor distinction, and advanced global key estimation.
- **Cyber-Technical Mixer:** Professional interface with per-track waveforms, real-time harmonic viewer, and keyboard shortcuts.
- **PWA & Performance:** Full Progressive Web App support with intelligent audio caching and parallel track loading.

## 🛠️ Tech Stack

- **Frontend:** Angular 21, Tone.js, Tailwind CSS v4 (Custom @theme with brand #efbc21).
- **Backend:** FastAPI (Python), SQLAlchemy, PostgreSQL.
- **Processing:** Celery, Redis, Librosa, Demucs (v3 & v4).
- **PWA:** Angular Service Worker, Web Manifest.

## 📋 Prerequisites

- [Docker](https://docs.docker.com/get-docker/)
- [Docker Compose](https://docs.docker.com/compose/install/)

## 🛠️ Installation and Setup

Follow these steps to set up the full development environment:

1. **Clone the repository:**
   ```bash
   git clone <repository-url>
   cd Versiona
   ```

2. **Start services with Docker:**
   This command will build the necessary images and start all containers (API, Frontend, Worker, DB, and Redis) in the background.
   ```bash
   docker-compose up -d --build
   ```

3. **Verify service status:**
   ```bash
   docker ps
   ```

## 🔗 Quick Access

- **Frontend (User Interface):** [http://localhost:4200](http://localhost:4200)
- **Backend API:** [http://localhost:8000](http://localhost:8000)
- **API Documentation (Swagger):** [http://localhost:8000/docs](http://localhost:8000/docs)

## 🧪 Testing

I have included an automated testing system to ensure project stability:

- **Quick execution**: Use the `./utils/run_tests.ps1` (PowerShell) script to run Backend and Frontend tests simultaneously.
- **Backend**: Based on `pytest` with an isolated in-memory database.
- **Frontend**: Based on `vitest` for ultra-fast execution.

## 📁 Project Structure

- `/frontend`: Angular application.
- `/backend`: FastAPI API, data models, and processing logic.
- `/uploads`: Local directory for processed audio file storage.
- `docker-compose.yml`: Orchestration of all services.

## 📝 Development Notes

- Database tables are created automatically when starting the API for the first time.
- The `/uploads` directory is mounted as a volume to persist audio files between container restarts.

## 🛠️ Service Management with Docker

The project consists of 5 main services. You can manage them individually to save time during development.

### Available Services
- `api`: FastAPI Backend (Port 8000).
- `worker`: Celery task processor (shares code with `api`).
- `frontend`: Angular application (Port 4200).
- `db`: PostgreSQL database (Port 5432).
- `redis`: Message broker for Celery (Port 6379).

### Specific Management Commands

**1. Rebuild and restart a specific service:**
Use this command when you make changes to the code of a single component (e.g., the backend):
```bash
docker-compose up -d --build <service_name>
```

**2. Update the full backend (API + Worker):**
Since both share the same code, it's recommended to restart them together after a change in processing logic:
```bash
docker-compose up -d --build api worker
```

**3. View real-time logs for a service:**
```bash
docker-compose logs -f <service_name>
```

**4. Restart without rebuilding the image:**
Useful if you just want to refresh a service without waiting for the build process:
```bash
docker-compose restart <service_name>
```

## 🛠️ Troubleshooting

### Clean Rebuild (Docker Cache)
If you experience strange compilation errors in the frontend (such as modules not found) or inconsistencies in the backend after deep changes, it's recommended to perform a clean rebuild ignoring the Docker cache:

```bash
# 1. Stop and remove containers and volumes (CAUTION: Deletes local DB)
docker-compose down -v

# 2. Rebuild images from scratch without cache
docker-compose build --no-cache

# 3. Start services again
docker-compose up -d
```

### Issues with 'tone' Module
If you see TypeScript errors indicating that the `tone` module is not found, ensure that the `frontend/tsconfig.json` file has `"moduleResolution": "bundler"` configured and that a clean installation of dependencies has been performed (forced by the previous step).

### npm install ERESOLVE Error
Due to the recent version of Angular used, you may encounter `peerDependencies` conflicts. It is recommended to always use the legacy flag to install dependencies:
```bash
npm install --legacy-peer-deps
```
