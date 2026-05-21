import {
  AfterViewInit,
  Component,
  ElementRef,
  HostListener,
  inject,
  OnDestroy,
  OnInit,
  QueryList,
  signal,
  ViewChildren,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { HttpClient } from '@angular/common/http';
import * as Tone from 'tone';
import { firstValueFrom, Subject, takeUntil } from 'rxjs';
import { Song, SongService, Stem } from '../../services/song.service';

const STEM_ORDER: Record<string, number> = {
  vocals: 1,
  drums: 2,
  bass: 3,
  guitar: 4,
  piano: 5,
};

interface StemTrack {
  type: string;
  player: Tone.Player;
  volume: Tone.Volume;
  panner: Tone.Panner;
  pitchShift: Tone.PitchShift;
  isMuted: boolean;
  isSolo: boolean;
  pan: number;
  waveformData: number[];
}

@Component({
  selector: 'app-mixer',
  standalone: true,
  imports: [CommonModule, RouterLink],
  templateUrl: './mixer.component.html',
})
export class MixerComponent implements OnInit, OnDestroy, AfterViewInit {
  @ViewChildren('trackCanvas') canvasRefs!: QueryList<ElementRef<HTMLCanvasElement>>;
  @ViewChildren('globalCanvas') globalCanvasRefs!: QueryList<ElementRef<HTMLCanvasElement>>;

  private route = inject(ActivatedRoute);
  private songService = inject(SongService);
  private http = inject(HttpClient);

  song = signal<Song | null>(null);
  tracks = signal<StemTrack[]>([]);
  isPlaying = signal(false);
  isLoaded = signal(false);
  previousChord = signal('');
  currentChord = signal('--');
  nextChord = signal('');

  currentTime = signal(0);
  duration = signal(0);
  progressPercent = signal(0);

  progressValue = signal(0);
  progressStatus = signal('Waiting...');

  // Audio Loading Progress
  audioLoadingProgress = signal(0);
  audioLoadingStatus = signal('');

  // New features
  pitch = signal(0);
  metronomeEnabled = signal(false);
  metronomeVolume = signal(-12);
  masterVolume = signal(80);
  globalWaveformData = signal<number[]>([]);
  activePanTrack = signal<string | null>(null);

  private ws?: WebSocket;
  private blobUrls: string[] = [];
  private animationId?: number;
  private destroy$ = new Subject<void>();
  private songCleanup$ = new Subject<void>();
  private activeSongId?: number;

  private metronomeSynth?: Tone.MembraneSynth;
  private metronomeLoop?: Tone.Loop;
  private masterVolNode?: Tone.Volume;

  @HostListener('document:click')
  onDocumentClick() {
    this.activePanTrack.set(null);
  }

  togglePanModal(trackType: string, event: Event) {
    event.stopPropagation();
    if (this.activePanTrack() === trackType) {
      this.activePanTrack.set(null);
    } else {
      this.activePanTrack.set(trackType);
    }
  }

  @HostListener('window:keydown', ['$event'])
  handleKeyboardEvent(event: KeyboardEvent) {
    // Avoid triggering if the user is in an input
    const target = event.target as HTMLElement;
    if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') return;

    if (event.code === 'Space') {
      event.preventDefault();
      if (this.isLoaded()) this.togglePlay();
    } else if (event.code === 'KeyM') {
      // Metronome shortcut (Alt+M to not interfere with track Mute)
      if (event.altKey) {
        event.preventDefault();
        this.toggleMetronome();
      }
    } else if (event.code === 'Escape') {
      this.stopPlayback();
    }
  }

  ngOnInit() {
    this.route.paramMap.pipe(takeUntil(this.destroy$)).subscribe((params) => {
      const id = params.get('id');
      if (id) {
        this.loadSong(+id);
      }
    });
  }

  ngAfterViewInit() {
    this.canvasRefs.changes.pipe(takeUntil(this.destroy$)).subscribe(() => {
      this.renderWaveforms();
    });
    this.globalCanvasRefs.changes.pipe(takeUntil(this.destroy$)).subscribe(() => {
      this.renderGlobalWaveform();
    });
  }

  loadSong(id: number) {
    this.songCleanup$.next();
    this.cleanup();
    this.activeSongId = id;

    this.songService
      .getSong(id)
      .pipe(takeUntil(this.songCleanup$), takeUntil(this.destroy$))
      .subscribe((song) => {
        if (this.activeSongId !== id) return;
        this.song.set(song);
        if (song.status === 'completed') {
          this.initAudio(song.stems, id);
        } else if (song.status === 'processing') {
          this.setupWebSocket(id);
        }
      });
  }

  setupWebSocket(songId: number) {
    this.ws = this.songService.getSongWebSocket(songId);
    this.ws.onmessage = (event) => {
      const data = JSON.parse(event.data);
      if (data.progress) this.progressValue.set(data.progress);
      if (data.status) this.progressStatus.set(data.status);

      if (data.state === 'SUCCESS') {
        if (this.activeSongId === songId) {
          this.loadSong(songId);
        }
        this.ws?.close();
      }
    };
  }

  async initAudio(stems: Stem[], songId: number) {
    if (this.activeSongId !== songId) return;

    this.audioLoadingProgress.set(5);
    this.audioLoadingStatus.set('Initializing audio engine...');

    // Non-blocking Tone.start()
    Tone.start().catch(() => {
      console.warn('AudioContext failed to start. User interaction required.');
    });

    this.masterVolNode = new Tone.Volume(0).toDestination();
    this.initMetronome();

    const tracks: StemTrack[] = [];
    const allWaveforms: number[][] = [];
    let loadedCount = 0;

    // Sort stems by preferred order
    const sortedStems = [...stems].sort((a, b) => {
      const orderA = STEM_ORDER[a.type.toLowerCase()] || 99;
      const orderB = STEM_ORDER[b.type.toLowerCase()] || 99;
      return orderA - orderB;
    });

    this.audioLoadingStatus.set(`Loading tracks (0/${sortedStems.length})...`);

    const stemPromises = sortedStems.map(async (stem) => {
      if (this.activeSongId !== songId) return;
      const url = this.songService.getStemUrl(stem.id);
      try {
        const response = await firstValueFrom(
          this.http
            .get(url, { responseType: 'blob' })
            .pipe(takeUntil(this.songCleanup$), takeUntil(this.destroy$)),
        );
        if (this.activeSongId !== songId) return;
        const blobUrl = URL.createObjectURL(response);
        this.blobUrls.push(blobUrl);

        const buffer = await new Tone.ToneAudioBuffer().load(blobUrl);
        if (this.activeSongId !== songId) return;

        loadedCount++;
        const progress = 5 + (loadedCount / sortedStems.length) * 85;
        this.audioLoadingProgress.set(progress);
        this.audioLoadingStatus.set(`Loading tracks (${loadedCount}/${sortedStems.length})...`);

        const waveformData = this.extractWaveformData(buffer);

        const stemIndex = sortedStems.indexOf(stem);

        const panner = new Tone.Panner(0);
        const vol = new Tone.Volume(this.percentToDb(80));
        const pitchShift = new Tone.PitchShift(0);
        const player = new Tone.Player(buffer);

        if (this.masterVolNode) {
          player.chain(pitchShift, vol, panner, this.masterVolNode);
        } else {
          player.chain(pitchShift, vol, panner, Tone.getDestination());
        }
        player.sync().start(0);

        return {
          index: stemIndex,
          track: {
            type: stem.type,
            player,
            volume: vol,
            panner,
            pitchShift,
            isMuted: false,
            isSolo: false,
            pan: 0,
            waveformData,
          }
        };
      } catch (err) {
        console.error(`Failed to load stem ${stem.type}:`, err);
        return null;
      }
    });

    const results = await Promise.all(stemPromises);
    if (this.activeSongId !== songId) return;

    // Filter out nulls and sort by original index
    const sortedResults = results
      .filter((r): r is { index: number; track: StemTrack } => r !== null)
      .sort((a, b) => a.index - b.index);

    const finalTracks = sortedResults.map(r => r.track);
    const finalWaveforms = finalTracks.map(t => t.waveformData);

    if (finalTracks.length > 0) {
      const firstBuffer = finalTracks[0].player.buffer;
      this.duration.set(firstBuffer.duration);
      if (this.song()?.bpm) {
        Tone.Transport.bpm.value = this.song()!.bpm!;
      }

      // Generate global waveform
      const globalWave = finalWaveforms[0].map((_, i) => {
        let sum = 0;
        finalWaveforms.forEach((w) => (sum += w[i]));
        return sum / finalWaveforms.length;
      });
      this.globalWaveformData.set(globalWave);
    }

    this.audioLoadingProgress.set(100);
    this.audioLoadingStatus.set('Ready!');

    this.tracks.set(finalTracks);
    this.isLoaded.set(true);
    this.startTransportUpdate();

    if (Tone.getContext().state === 'running') {
      Tone.Transport.start();
      this.isPlaying.set(true);
    }
  }

  initMetronome() {
    this.metronomeSynth = new Tone.MembraneSynth({
      pitchDecay: 0.05,
      octaves: 2,
      oscillator: { type: 'sine' },
      envelope: { attack: 0.001, decay: 0.2, sustain: 0.01, release: 0.1 },
    }).toDestination();
    this.metronomeSynth.volume.value = this.metronomeVolume();

    this.metronomeLoop = new Tone.Loop((time) => {
      this.metronomeSynth?.triggerAttackRelease('C4', '16n', time);
    }, '4n');
  }

  toggleMetronome() {
    this.metronomeEnabled.update((v) => !v);
    if (this.metronomeEnabled()) {
      this.metronomeLoop?.start(0);
    } else {
      this.metronomeLoop?.stop();
    }
  }

  changePitch(delta: number) {
    this.pitch.update((p) => {
      const newPitch = p + delta;
      return Math.max(-12, Math.min(12, newPitch));
    });
    this.tracks().forEach((t) => {
      t.pitchShift.pitch = this.pitch();
    });
  }

  onMasterVolumeChange(event: any) {
    const val = parseInt(event.target.value);
    this.masterVolume.set(val);
    if (this.masterVolNode) this.masterVolNode.volume.value = this.percentToDb(val);
  }

  getCurrentKey(): string {
    const song = this.song();
    if (!song || !song.key) return '--';
    
    if (this.pitch() === 0) return song.key;

    const keys = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
    const currentKey = song.key.toUpperCase().trim();
    const currentIdx = keys.indexOf(currentKey);
    
    if (currentIdx === -1) return song.key; 

    let newIdx = (currentIdx + this.pitch()) % 12;
    if (newIdx < 0) newIdx += 12;
    
    return keys[newIdx];
  }

  extractWaveformData(buffer: Tone.ToneAudioBuffer, samples = 200): number[] {
    const rawData = buffer.getChannelData(0);
    if (!rawData || rawData.length === 0) return Array(samples).fill(0);

    const blockSize = Math.floor(rawData.length / samples);
    const peaks = [];
    for (let i = 0; i < samples; i++) {
      let max = 0;
      for (let j = 0; j < blockSize; j++) {
        const val = Math.abs(rawData[i * blockSize + j]);
        if (val > max) max = val;
      }
      peaks.push(max);
    }
    return peaks;
  }

  startTransportUpdate() {
    const update = () => {
      this.animationId = requestAnimationFrame(update);
      const time = Tone.Transport.seconds;

      if (this.duration() > 0 && time >= this.duration()) {
        this.stopPlayback();
        return;
      }

      this.currentTime.set(time);
      this.progressPercent.set((time / this.duration()) * 100);

      this.renderWaveforms();
      this.renderGlobalWaveform();

      const chords = this.song()?.chords_json;
      if (chords && chords.length > 0) {
        const activeChordIndex = chords.findIndex((curr, i) => {
          const next = chords[i + 1];
          return curr.timestamp <= time && (!next || next.timestamp > time);
        });
        
        if (activeChordIndex !== -1) {
          this.previousChord.set(activeChordIndex > 0 ? chords[activeChordIndex - 1].chord : '');
          this.currentChord.set(chords[activeChordIndex].chord);
          this.nextChord.set(activeChordIndex < chords.length - 1 ? chords[activeChordIndex + 1].chord : '');
        } else {
          this.previousChord.set('');
          this.currentChord.set('--');
          this.nextChord.set(chords[0].chord || '');
        }
      }
    };
    update();
  }

  stopPlayback() {
    Tone.Transport.stop();
    this.isPlaying.set(false);
    this.currentTime.set(0);
    this.progressPercent.set(0);
    this.renderWaveforms();
    this.renderGlobalWaveform();
  }

  renderWaveforms() {
    if (!this.canvasRefs || this.canvasRefs.length === 0) return;

    this.canvasRefs.forEach((canvasRef, index) => {
      const track = this.tracks()[index];
      if (!track || !track.waveformData) return;

      const canvas = canvasRef.nativeElement;
      const ctx = canvas.getContext('2d')!;

      const rectWidth = canvas.offsetWidth;
      const rectHeight = canvas.offsetHeight;

      if (canvas.width !== rectWidth || canvas.height !== rectHeight) {
        canvas.width = rectWidth;
        canvas.height = rectHeight;
      }

      const width = canvas.width;
      const height = canvas.height;

      ctx.clearRect(0, 0, width, height);

      const peaks = track.waveformData;
      const barWidth = width / peaks.length;
      const progressX = (this.currentTime() / this.duration()) * width;

      peaks.forEach((peak, i) => {
        const x = i * barWidth;
        const barHeight = Math.max(2, peak * height * 0.8);
        const y = (height - barHeight) / 2;

        ctx.fillStyle = x < progressX ? '#efbc21' : '#555';
        this.drawRoundedRect(ctx, x + 1, y, Math.max(1, barWidth - 2), barHeight, 2);
      });
    });
  }

  renderGlobalWaveform() {
    if (!this.globalCanvasRefs || this.globalCanvasRefs.length === 0) return;

    this.globalCanvasRefs.forEach((canvasRef) => {
      const canvas = canvasRef.nativeElement;
      const ctx = canvas.getContext('2d')!;

      const rectWidth = canvas.offsetWidth;
      const rectHeight = canvas.offsetHeight;

      if (canvas.width !== rectWidth || canvas.height !== rectHeight) {
        canvas.width = rectWidth;
        canvas.height = rectHeight;
      }

      const width = canvas.width;
      const height = canvas.height;

      ctx.clearRect(0, 0, width, height);

      const peaks = this.globalWaveformData();
      if (peaks.length === 0) return;

      const barWidth = width / peaks.length;
      const progressX = (this.currentTime() / this.duration()) * width;

      peaks.forEach((peak, i) => {
        const x = i * barWidth;
        const barHeight = Math.max(2, peak * height * 0.8);
        const y = (height - barHeight) / 2;

        ctx.fillStyle = x < progressX ? '#efbc21' : '#555';
        this.drawRoundedRect(ctx, x + 1, y, Math.max(1, barWidth - 2), barHeight, 2);
      });
    });
  }

  drawRoundedRect(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    w: number,
    h: number,
    r: number,
  ) {
    if (w < 2 * r) r = w / 2;
    if (h < 2 * r) r = h / 2;
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
    ctx.fill();
  }

  formatTime(seconds: number): string {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  }

  async togglePlay() {
    if (this.isPlaying()) {
      Tone.Transport.pause();
      this.isPlaying.set(false);
    } else {
      await Tone.start();
      Tone.Transport.start();
      this.isPlaying.set(true);
    }
  }

  seek(event: MouseEvent) {
    const container = event.currentTarget as HTMLElement;
    const rect = container.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const percent = x / rect.width;
    const seekTime = percent * this.duration();
    Tone.Transport.seconds = seekTime;
  }

  onVolumeChange(event: any, track: StemTrack) {
    const val = parseInt(event.target.value);
    const db = this.percentToDb(val);
    track.volume.volume.value = db;
    this.tracks.update((t) => [...t]);
  }

  resetVolume(track: StemTrack) {
    const defaultVal = 80;
    track.volume.volume.value = this.percentToDb(defaultVal);
    this.tracks.update((t) => [...t]);
  }

  percentToDb(percent: number): number {
    if (percent <= 0) return -100;
    // Quadratic curve (exponent 2): less sensitive than cubic and more balanced.
    // 80% corresponds to 0dB (original volume).
    // 100% gives a boost of +3.8dB.
    const gain = Math.pow(percent / 80, 2);
    return 20 * Math.log10(gain);
  }

  dbToPercent(db: number): number {
    if (db <= -70) return 0;
    // Inverse of quadratic curve: percent = 80 * sqrt(gain)
    const gain = Math.pow(10, db / 20);
    const percent = 80 * Math.sqrt(gain);
    return Math.max(0, Math.min(100, percent));
  }

  getVolumePercent(track: StemTrack): number {
    return this.dbToPercent(track.volume.volume.value);
  }

  getVolumeLevel(track: StemTrack): number {
    return Math.round(this.getVolumePercent(track));
  }

  onPanChange(event: any, track: StemTrack) {
    const pan = parseFloat(event.target.value);
    this.setPan(track, pan);
  }

  getPanLabel(pan: number): string {
    if (pan === 0) return 'C';
    return pan < 0 ? `${Math.abs(Math.round(pan * 100))}L` : `${Math.abs(Math.round(pan * 100))}R`;
  }

  setPan(track: StemTrack, value: number) {
    track.pan = value;
    track.panner.pan.value = value;
    this.tracks.update((t) => [...t]);
  }

  toggleMute(track: StemTrack) {
    track.isMuted = !track.isMuted;
    this.updateAudioStates();
  }

  toggleSolo(track: StemTrack) {
    track.isSolo = !track.isSolo;
    this.updateAudioStates();
  }

  updateAudioStates() {
    const tracks = this.tracks();
    const soloTracks = tracks.filter((t) => t.isSolo);
    const isAnySolo = soloTracks.length > 0;

    tracks.forEach((t) => {
      // A track is silent if:
      // 1. It is explicitly muted
      // 2. OR There is at least one track in solo, and this track is NOT in solo
      const shouldBeMuted = t.isMuted || (isAnySolo && !t.isSolo);
      t.player.mute = shouldBeMuted;
    });

    // Trigger signal update for UI classes
    this.tracks.update((t) => [...t]);
  }

  getTrackIcon(type: string): string {
    switch (type.toLowerCase()) {
      case 'bass':
        return '<svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor"><path d="M6 3v15.5a2.5 2.5 0 1 0 2 2.45V11h9v7.5a2.5 2.5 0 1 0 2 2.45V3H6z"/></svg>';
      case 'drums':
        return '<svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor"><circle cx="12" cy="12" r="10"/><path d="M7 12h10M12 7v10"/></svg>';
      case 'vocals':
        return '<svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor"><path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2M12 19v3M8 22h8"/></svg>';
      case 'guitar':
        return '<svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor"><path d="M12 3L4 11v8l8 2 8-2v-8l-8-8zM7 12l5-5 5 5-5 5-5-5z"/></svg>';
      case 'piano':
        return '<svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor"><path d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm-8 15H5v-2h6v2zm0-4H5v-2h6v2zm0-4H5V8h6v2zm8 8h-6v-2h6v2zm0-4h-6v-2h6v2zm0-4h-6V8h6v2z"/></svg>';
      default:
        return '<svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor"><path d="M12 3v10.55c-.59-.34-1.27-.55-2-.55-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z"/></svg>';
    }
  }

  ngOnDestroy() {
    this.destroy$.next();
    this.destroy$.complete();
    this.cleanup();
  }

  private cleanup() {
    this.ws?.close();
    this.ws = undefined;
    this.activeSongId = undefined;

    Tone.Transport.stop();
    Tone.Transport.cancel();
    Tone.Transport.seconds = 0;

    if (this.animationId) {
      cancelAnimationFrame(this.animationId);
      this.animationId = undefined;
    }

    this.tracks().forEach((t) => {
      t.player.dispose();
      t.volume.dispose();
      t.panner.dispose();
      t.pitchShift.dispose();
    });
    this.tracks.set([]);

    this.metronomeSynth?.dispose();
    this.metronomeLoop?.dispose();
    this.masterVolNode?.dispose();

    this.blobUrls.forEach((url) => URL.revokeObjectURL(url));
    this.blobUrls = [];

    this.song.set(null);
    this.isPlaying.set(false);
    this.isLoaded.set(false);
    this.previousChord.set('');
    this.currentChord.set('--');
    this.nextChord.set('');
    this.currentTime.set(0);
    this.duration.set(0);
    this.progressPercent.set(0);
    this.progressValue.set(0);
    this.progressStatus.set('Waiting...');
  }
}
