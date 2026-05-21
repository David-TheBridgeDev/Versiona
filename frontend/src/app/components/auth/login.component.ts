import { Component, signal, inject } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { form, FormField, submit, required, email } from '@angular/forms/signals';
import { AuthService } from '../../services/auth.service';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [FormField, RouterLink],
  templateUrl: './login.component.html',
  styleUrl: './login.component.scss'
})
export class LoginComponent {
  private authService = inject(AuthService);
  private router = inject(Router);

  error = signal<string>('');

  model = signal({
    email: '',
    password: ''
  });

  loginForm = form(this.model, (s) => {
    required(s.email, { message: 'Email is required' });
    email(s.email, { message: 'Invalid email' });
    required(s.password, { message: 'Password is required' });
  });

  onSubmit() {
    submit(this.loginForm, async () => {
      this.error.set('');
      const formData = new FormData();
      formData.append('username', this.model().email);
      formData.append('password', this.model().password);

      this.authService.login(formData).subscribe({
        next: () => {
          this.router.navigate(['/']);
        },
        error: (err) => {
          if (err.status === 403) {
            this.router.navigate(['/auth/verify-email'], { queryParams: { email: this.model().email } });
          } else {
            this.error.set('Incorrect email or password');
          }
        }
      });
    });
  }
}
