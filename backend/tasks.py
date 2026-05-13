import json
import os
import shutil
import subprocess
import time
from pathlib import Path

import librosa
import models
import numpy as np
import scipy.ndimage
from celery import Celery
from database import SessionLocal
from config import settings

app = Celery("tasks", broker=settings.REDIS_URL, backend=settings.REDIS_URL)


def get_chord_templates():
    pitch_names = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"]
    major_template = [1, 0, 0, 0, 1, 0, 0, 1, 0, 0, 0, 0]
    minor_template = [1, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 0]

    chord_names = []
    templates = []
    for i, root in enumerate(pitch_names):
        chord_names.append(root)
        templates.append(np.roll(major_template, i))
        chord_names.append(root + "m")
        templates.append(np.roll(minor_template, i))
    return chord_names, np.array(templates)


CHORD_NAMES, CHORD_TEMPLATES_MAT = get_chord_templates()
PITCH_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"]
MAJOR_PROFILE = [6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88]
MINOR_PROFILE = [6.33, 2.68, 3.52, 5.38, 2.60, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17]


def normalize_profile(profile):
    p = np.array(profile)
    p = p - np.mean(p)
    norm = np.linalg.norm(p)
    return p / norm if norm > 0 else p


# Pre-compute and normalize all profiles for vectorized key detection
ALL_PROFILES_NORMALIZED = np.vstack(
    [
        [normalize_profile(np.roll(MAJOR_PROFILE, i)) for i in range(12)],
        [normalize_profile(np.roll(MINOR_PROFILE, i)) for i in range(12)],
    ]
)


@app.task(bind=True)
def process_audio(self, song_id: int, file_path: str):
    db = SessionLocal()
    song = None
    try:
        song = db.query(models.Song).filter(models.Song.id == song_id).first()
        if not song:
            return "Song not found"

        song.status = "processing"
        db.commit()

        # --- FASE 1: Análisis de Metadatos ---
        self.update_state(
            state="PROGRESS",
            meta={"progress": 10, "status": "Analyzing metadata (BPM, Key)..."},
        )
        y, sr = librosa.load(file_path)

        # Extracción de BPM
        tempo, _ = librosa.beat.beat_track(y=y, sr=sr)
        song.bpm = int(tempo)

        # Extracción de Tonalidad Mejorada
        self.update_state(
            state="PROGRESS",
            meta={"progress": 12, "status": "Estimating global Key and Scale..."},
        )

        # Generar waveform simplificada para el dashboard
        S = np.abs(librosa.stft(y))
        rms = librosa.feature.rms(S=S)[0]
        resample_factor = max(1, len(rms) // 100)
        waveform_summary = rms[::resample_factor].tolist()
        song.waveform_data = waveform_summary

        chroma = librosa.feature.chroma_cqt(y=y, sr=sr)

        mean_chroma = chroma.mean(axis=1)

        # Vectorized Key Detection
        mc = mean_chroma - np.mean(mean_chroma)
        mc_norm = np.linalg.norm(mc)
        if mc_norm > 0:
            mc /= mc_norm

        scores = np.dot(ALL_PROFILES_NORMALIZED, mc)
        best_idx = np.argmax(scores)

        if best_idx < 12:
            best_key = PITCH_NAMES[best_idx]
            best_scale = "Major"
        else:
            best_key = PITCH_NAMES[best_idx - 12]
            best_scale = "Minor"

        song.key = best_key
        song.scale = best_scale
        db.commit()
        # --- NUEVO: Extracción de Mapa de Acordes Mejorada (Beat-Sync) ---
        self.update_state(
            state="PROGRESS",
            meta={"progress": 15, "status": "Extracting beat-sync chord map..."},
        )

        # Extracción de Beats
        tempo, beat_frames = librosa.beat.beat_track(y=y, sr=sr)
        beat_times = librosa.frames_to_time(beat_frames, sr=sr)

        # Si no detecta beats suficientes, usar segmentos fijos como fallback
        if len(beat_frames) < 10:
            hop_length = 512
            segment_frames = int(0.5 * sr / hop_length)
            beat_frames = np.arange(0, chroma.shape[1], segment_frames)
            beat_times = librosa.frames_to_time(beat_frames, sr=sr)

        # Agregar croma por beats para mayor precisión rítmica
        chroma_sync = librosa.util.sync(chroma, beat_frames, aggregate=np.median)
        
        # Suavizar el croma a lo largo del tiempo para evitar fluctuaciones rápidas (ej. saltos de acordes incorrectos)
        chroma_sync = scipy.ndimage.median_filter(chroma_sync, size=(1, 9))

        chord_map = []
        last_chord = None

        for i in range(chroma_sync.shape[1]):
            mean_chroma = chroma_sync[:, i]

            # Normalizar croma
            if mean_chroma.max() > 0:
                mean_chroma /= mean_chroma.max()

            # Vectorized chord matching
            scores = np.dot(CHORD_TEMPLATES_MAT, mean_chroma)
            best_idx = np.argmax(scores)
            best_chord = CHORD_NAMES[best_idx] if scores[best_idx] > 0 else "N.C."

            # Solo añadir si el acorde cambia
            if best_chord != last_chord:
                timestamp = beat_times[i] if i < len(beat_times) else (i * 0.5)
                chord_map.append(
                    {"timestamp": round(float(timestamp), 2), "chord": best_chord}
                )
                last_chord = best_chord

        song.chords_json = chord_map
        db.commit()

        # --- FASE 2: Separación de Stems ---
        self.update_state(
            state="PROGRESS",
            meta={
                "progress": 20,
                "status": f"Initializing {song.quality_mode} separation...",
            },
        )

        output_dir = Path(file_path).parent
        # Configurar modelo según modo
        # fast -> mdx_extra_q (o similar ligero), studio -> hdemucs_mmi, studio_pro -> hdemucs_6stems
        model = "htdemucs"
        if song.quality_mode == "studio_pro":
            model = "htdemucs_6s"
        elif song.quality_mode == "fast":
            model = "mdx_extra_q"

        # Ejecutar demucs vía CLI para mayor estabilidad en el worker
        # demucs -n <model> <file> -o <output_dir>
        cmd = ["demucs", "-n", model, str(file_path), "-o", str(output_dir / "stems")]

        self.update_state(
            state="PROGRESS",
            meta={
                "progress": 30,
                "status": f"Running AI Model ({model}). This may take a few minutes...",
            },
        )

        process = subprocess.Popen(
            cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True
        )
        stdout, stderr = process.communicate()

        if process.returncode != 0:
            raise Exception(
                f"Demucs failed with exit code {process.returncode}. Error: {stderr}"
            )

        # --- FASE 3: Registrar Stems ---
        self.update_state(
            state="PROGRESS",
            meta={"progress": 90, "status": "Finalizing and registering stems..."},
        )

        # Demucs guarda en: <output_dir>/stems/<model>/<filename_without_ext>/<stem>.wav
        filename_stem = Path(file_path).stem
        stems_path = output_dir / "stems" / model / filename_stem

        for stem_file in stems_path.glob("*.wav"):
            stem_type = stem_file.stem  # vocals, drums, bass, etc.

            # Mover a la carpeta de la canción para limpieza
            final_path = output_dir / f"{stem_type}.wav"
            shutil.move(str(stem_file), str(final_path))

            db_stem = models.Stem(
                song_id=song.id, type=stem_type, file_path=str(final_path)
            )
            db.add(db_stem)

        # Limpiar carpetas temporales de demucs
        shutil.rmtree(str(output_dir / "stems"))

        song.status = "completed"
        db.commit()

        self.update_state(
            state="SUCCESS", meta={"progress": 100, "status": "Completed"}
        )
        return f"Song {song_id} processed successfully"

    except Exception as e:
        db.rollback()
        if song:
            song.status = "error"
            db.commit()
        return f"Error: {str(e)}"
    finally:
        db.close()
