import { Component, inject, OnInit, signal } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { form, FormField, minLength, required, submit } from '@angular/forms/signals';
import { AuthService } from '../../services/auth.service';

@Component({
  selector: 'app-complete-profile',
  standalone: true,
  imports: [FormField],
  templateUrl: './complete-profile.component.html',
  styleUrl: './complete-profile.component.scss',
})
export class CompleteProfileComponent implements OnInit {
  private authService = inject(AuthService);
  private router = inject(Router);
  private route = inject(ActivatedRoute);

  error = signal<string>('');
  email = signal<string>('');
  loading = signal<boolean>(false);

  model = signal({
    full_name: '',
    password: '',
    confirmPassword: '',
  });

  profileForm = form(this.model, (s) => {
    required(s.full_name, { message: 'El nombre es obligatorio' });
    required(s.password, { message: 'La contraseña es obligatoria' });
    minLength(s.password, 8, { message: 'Mínimo 8 caracteres' });
    required(s.confirmPassword, { message: 'Repite la contraseña' });
  });

  ngOnInit() {
    this.route.queryParams.subscribe((params) => {
      if (params['email']) {
        this.email.set(params['email']);
      } else {
        this.router.navigate(['/auth/register']);
      }
    });
  }

  onSubmit() {
    submit(this.profileForm, async () => {
      if (this.model().password !== this.model().confirmPassword) {
        this.error.set('Las contraseñas no coinciden');
        return;
      }

      this.error.set('');
      this.loading.set(true);

      this.authService
        .completeRegistration({
          email: this.email(),
          full_name: this.model().full_name,
          password: this.model().password,
        })
        .subscribe({
          next: () => {
            this.loading.set(false);
            this.router.navigate(['/auth/login']);
          },
          error: (err) => {
            this.error.set(err.error?.detail || 'Error al completar el perfil');
            this.loading.set(false);
          },
        });
    });
  }
}
