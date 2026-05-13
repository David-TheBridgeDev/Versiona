import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';

export interface Stem {
  id: number;
  type: string;
}

export interface Song {
  id: number;
  name: string;
  artist?: string;
  genre?: string;
  duration?: number;
  original_filename: string;
  status: string;
  bpm?: number;
  key?: string;
  scale?: string;
  chords_json?: { timestamp: number, chord: string }[];
  waveform_data?: number[];
  quality_mode: string;
  celery_task_id?: string;
  created_at: string;
  stems: Stem[];
}

@Injectable({
  providedIn: 'root'
})
export class SongService {
  private apiUrl = `${environment.apiUrl}/songs`;
  private stemsUrl = `${environment.apiUrl}/stems`;
  private wsUrl = `${environment.wsUrl}/ws`;

  constructor(private http: HttpClient) {}

  getSongs(): Observable<Song[]> {
    return this.http.get<Song[]>(this.apiUrl);
  }

  getSong(id: number): Observable<Song> {
    return this.http.get<Song>(`${this.apiUrl}/${id}`);
  }

  createSong(name: string | null, quality_mode: string, file: File): Observable<any> {
    const formData = new FormData();
    if (name) formData.append('name', name);
    formData.append('quality_mode', quality_mode);
    formData.append('file', file);
    return this.http.post<any>(this.apiUrl, formData);
  }

  updateSong(id: number, data: Partial<Song>): Observable<Song> {
    return this.http.patch<Song>(`${this.apiUrl}/${id}`, data);
  }

  deleteSong(id: number): Observable<any> {
    return this.http.delete(`${this.apiUrl}/${id}`);
  }

  retrySong(id: number, qualityMode?: string): Observable<any> {
    const formData = new FormData();
    if (qualityMode) formData.append('quality_mode', qualityMode);
    return this.http.post(`${this.apiUrl}/${id}/retry`, formData);
  }

  getSongWebSocket(songId: number): WebSocket {
    return new WebSocket(`${this.wsUrl}/${songId}`);
  }

  getStemUrl(stemId: number): string {
    return `${this.stemsUrl}/${stemId}`;
  }
}
