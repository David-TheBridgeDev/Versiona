import { Component, signal, inject, effect, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, RouterLink } from '@angular/router';
import { form, FormField, submit, required, email, minLength } from '@angular/forms/signals';
import { AuthService } from '../../services/auth.service';

@Component({
  selector: 'app-profile',
  standalone: true,
  imports: [CommonModule, FormField, RouterLink],
  templateUrl: './profile.component.html',
  styleUrl: './profile.component.scss'
})
export class ProfileComponent {
  private authService = inject(AuthService);
  private router = inject(Router);

  currentUser = this.authService.currentUser;
  error = signal<string>('');
  modalError = signal<string>('');
  success = signal<string>('');
  showDeleteConfirm = signal<boolean>(false);
  showPasswordModal = signal<boolean>(false);

  model = signal({
    email: '',
    full_name: ''
  });

  passwordModel = signal({
    current_password: '',
    new_password: '',
    confirm_password: ''
  });

  // Validaciones cruzadas con computed
  passwordsMatch = computed(() => {
    const { new_password, confirm_password } = this.passwordModel();
    return !confirm_password || new_password === confirm_password;
  });

  passwordIsDifferent = computed(() => {
    const { current_password, new_password } = this.passwordModel();
    return !new_password || !current_password || current_password !== new_password;
  });

  profileForm = form(this.model, (s) => {
    required(s.full_name, { message: 'Name is required' });
  });

  passwordForm = form(this.passwordModel, (s) => {
    required(s.current_password, { message: 'Current password required' });
    required(s.new_password, { message: 'New password required' });
    minLength(s.new_password, 8, { message: 'Minimum 8 characters' });
    required(s.confirm_password, { message: 'Repeat the new password' });
  });

  constructor() {
    // Fill model when user is available
    effect(() => {
      const user = this.currentUser();
      if (user) {
        this.model.set({
          email: user.email,
          full_name: user.full_name || ''
        });
      }
    });
  }

  onSubmit() {
    submit(this.profileForm, async () => {
      this.error.set('');
      this.success.set('');
      
      this.authService.updateMe({
        full_name: this.model().full_name
      }).subscribe({
        next: () => {
          this.success.set('Profile updated successfully');
        },
        error: (err) => {
          this.error.set(err.error?.detail || 'Error updating profile');
        }
      });
    });
  }

  openPasswordModal() {
    this.passwordModel.set({
      current_password: '',
      new_password: '',
      confirm_password: ''
    });
    this.modalError.set('');
    this.showPasswordModal.set(true);
  }

  closePasswordModal() {
    this.showPasswordModal.set(false);
    this.modalError.set('');
  }

  onChangePassword() {
    submit(this.passwordForm, async () => {
      if (!this.passwordsMatch()) {
        this.modalError.set('The new passwords do not match');
        return;
      }

      if (!this.passwordIsDifferent()) {
        this.modalError.set('The new password must be different from the current one');
        return;
      }

      this.modalError.set('');
      this.authService.changePassword({
        current_password: this.passwordModel().current_password,
        new_password: this.passwordModel().new_password
      }).subscribe({
        next: () => {
          this.success.set('Password changed successfully');
          this.closePasswordModal();
          this.error.set(''); // Clear any old profile errors
        },
        error: (err) => {
          this.modalError.set(err.error?.detail || 'Error changing password');
        }
      });
    });
  }

  onLogout() {
    this.authService.logout();
  }

  confirmDelete() {
    this.showDeleteConfirm.set(true);
  }

  cancelDelete() {
    this.showDeleteConfirm.set(false);
  }

  onDeleteAccount() {
    this.authService.deleteAccount().subscribe({
      next: () => {
        this.router.navigate(['/auth/login']);
      },
      error: (err) => {
        this.error.set('Error deleting account');
      }
    });
  }
}
