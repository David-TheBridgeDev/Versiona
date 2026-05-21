import { Component, signal, inject } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { form, FormField, submit, required, email, minLength } from '@angular/forms/signals';
import { AuthService } from '../../services/auth.service';

@Component({
  selector: 'app-register',
  standalone: true,
  imports: [FormField, RouterLink],
  templateUrl: './register.component.html'
})
export class RegisterComponent {
  private authService = inject(AuthService);
  private router = inject(Router);

  error = signal<string>('');
  loading = signal<boolean>(false);

  model = signal({
    email: ''
  });

  registerForm = form(this.model, (s) => {
    required(s.email, { message: 'Email is required' });
    email(s.email, { message: 'Invalid email' });
  });

  onSubmit() {
    submit(this.registerForm, async () => {
      this.error.set('');
      this.loading.set(true);
      
      this.authService.requestVerification(this.model().email).subscribe({
        next: () => {
          this.loading.set(false);
          this.router.navigate(['/auth/verify-email'], { queryParams: { email: this.model().email } });
        },
        error: (err) => {
          this.error.set(err.error?.detail || 'Error requesting verification');
          this.loading.set(false);
        }
      });
    });
  }
}
