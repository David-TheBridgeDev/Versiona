import { Component, inject, OnInit, signal } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { form, FormField, maxLength, minLength, required, submit } from '@angular/forms/signals';
import { AuthService } from '../../services/auth.service';
import { FormsModule } from '@angular/forms';

@Component({
  selector: 'app-verify',
  standalone: true,
  imports: [FormField, RouterLink, FormsModule],
  templateUrl: './verify.component.html',
})
export class VerifyComponent implements OnInit {
  private authService = inject(AuthService);
  private router = inject(Router);
  private route = inject(ActivatedRoute);

  error = signal<string>('');
  success = signal<string>('');
  email = signal<string>('');
  loading = signal<boolean>(false);

  model = signal({
    code: '',
  });

  verifyForm = form(this.model, (s) => {
    required(s.code, { message: 'Code is required' });
    minLength(s.code, 6, { message: 'Code must be 6 digits' });
    maxLength(s.code, 6, { message: 'Code must be 6 digits' });
  });

  ngOnInit() {
    this.route.queryParams.subscribe((params) => {
      if (params['email']) {
        this.email.set(params['email']);
      } else {
        // If no email in query params, redirect to login
        this.router.navigate(['/auth/login']);
      }
    });
  }

  onSubmit() {
    submit(this.verifyForm, async () => {
      this.error.set('');
      this.loading.set(true);

      this.authService.verifyCode(this.email(), this.model().code).subscribe({
        next: () => {
          this.success.set('Email successfully verified!');
          this.loading.set(false);
          setTimeout(() => {
            this.router.navigate(['/auth/complete-profile'], {
              queryParams: { email: this.email() },
            });
          }, 1500);
        },
        error: (err) => {
          this.error.set(err.error?.detail || 'Incorrect or expired verification code');
          this.loading.set(false);
        },
      });
    });
  }

  resendCode() {
    this.error.set('');
    this.success.set('');
    this.loading.set(true);

    this.authService.resendCode(this.email()).subscribe({
      next: () => {
        this.success.set('Code successfully resent. Check your inbox.');
        this.loading.set(false);
      },
      error: (err) => {
        this.error.set(err.error?.detail || 'Error resending code');
        this.loading.set(false);
      },
    });
  }
}
