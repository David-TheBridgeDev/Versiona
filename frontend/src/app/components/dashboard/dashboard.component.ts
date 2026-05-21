import { Component, computed, inject, OnDestroy, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { Song, SongService } from '../../services/song.service';
import { AuthService } from '../../services/auth.service';

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  templateUrl: './dashboard.component.html',
  styleUrl: './dashboard.component.scss',
})
export class DashboardComponent implements OnInit, OnDestroy {
  songService = inject(SongService);
  authService = inject(AuthService);

  songs = signal<Song[]>([]);
  showModal = signal(false);
  isUploading = signal(false);

  // Controls
  searchTerm = signal('');
  sortBy = signal<keyof Song>('created_at');
  sortOrder = signal<'asc' | 'desc'>('desc');

  // Dropdown
  activeDropdown = signal<number | null>(null);

  // Metadata Modal
  showInfoModal = signal(false);
  selectedSong = signal<Song | null>(null);
  editSong: Partial<Song> = {};

  // Retry Modal
  showRetryModal = signal(false);
  retryQualityMode = 'studio';

  // Form
  qualityMode = 'studio';
  selectedFile: File | null = null;

  private pollInterval: any;

  filteredAndSortedSongs = computed(() => {
    let list = [...this.songs()];
    const search = this.searchTerm().toLowerCase();

    // Filter
    if (search) {
      list = list.filter(
        (s) =>
          s.name.toLowerCase().includes(search) ||
          (s.artist && s.artist.toLowerCase().includes(search)) ||
          (s.genre && s.genre.toLowerCase().includes(search)),
      );
    }

    // Sort
    const key = this.sortBy();
    const order = this.sortOrder();

    list.sort((a, b) => {
      const valA = a[key];
      const valB = b[key];

      if (valA === valB) return 0;
      if (valA == null) return 1;
      if (valB == null) return -1;

      let result = 0;
      if (typeof valA === 'string' && typeof valB === 'string') {
        result = valA.localeCompare(valB);
      } else {
        result = (valA as any) > (valB as any) ? 1 : -1;
      }

      return order === 'asc' ? result : -result;
    });

    return list;
  });

  ngOnInit() {
    this.loadSongs();

    // Close dropdown on click outside
    document.addEventListener('click', () => {
      this.activeDropdown.set(null);
    });

    // Start polling for songs in process
    this.pollInterval = setInterval(() => {
      const hasProcessing = this.songs().some(
        (s) => s.status === 'processing' || s.status === 'pending',
      );
      if (hasProcessing) {
        this.loadSongs();
      }
    }, 5000);
  }

  ngOnDestroy() {
    if (this.pollInterval) {
      clearInterval(this.pollInterval);
    }
  }

  loadSongs() {
    this.songService.getSongs().subscribe((songs) => {
      this.songs.set(songs);
    });
  }

  toggleSortOrder() {
    this.sortOrder.update((o) => (o === 'asc' ? 'desc' : 'asc'));
  }

  toggleDropdown(songId: number) {
    this.activeDropdown.update((current) => (current === songId ? null : songId));
  }

  deleteSong(songId: number) {
    if (confirm('Are you sure you want to delete this song completely?')) {
      this.songService.deleteSong(songId).subscribe(() => {
        this.loadSongs();
        this.activeDropdown.set(null);
        this.closeRetryModal();
      });
    }
  }

  openInfoModal(song: Song) {
    this.selectedSong.set(song);
    this.editSong = { ...song };
    this.showInfoModal.set(true);
    this.activeDropdown.set(null);
  }

  closeInfoModal() {
    this.showInfoModal.set(false);
    this.selectedSong.set(null);
  }

  saveMetadata() {
    const song = this.selectedSong();
    if (song) {
      this.songService.updateSong(song.id, this.editSong).subscribe(() => {
        this.loadSongs();
        this.closeInfoModal();
      });
    }
  }

  openRetryModal(song: Song) {
    this.selectedSong.set(song);
    this.retryQualityMode = song.quality_mode;
    this.showRetryModal.set(true);
  }

  closeRetryModal() {
    this.showRetryModal.set(false);
  }

  retryProcessing() {
    const song = this.selectedSong();
    if (song) {
      this.songService.retrySong(song.id, this.retryQualityMode).subscribe(() => {
        this.loadSongs();
        this.closeRetryModal();
      });
    }
  }

  openModal() {
    this.showModal.set(true);
  }

  closeModal() {
    this.showModal.set(false);
    this.selectedFile = null;
  }

  onFileSelected(event: any) {
    this.selectedFile = event.target.files[0];
  }

  createSong() {
    if (!this.selectedFile) return;

    this.isUploading.set(true);
    // Note: We send null for name as backend will use metadata
    this.songService.createSong(null, this.qualityMode, this.selectedFile).subscribe({
      next: (response) => {
        this.isUploading.set(false);
        this.closeModal();
        this.loadSongs();
      },
      error: (err) => {
        this.isUploading.set(false);
        alert('Error uploading song');
      },
    });
  }

  formatDuration(seconds: number): string {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  }
}
