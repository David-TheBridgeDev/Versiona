import { inject } from '@angular/core';
import { Router, CanActivateFn } from '@angular/router';
import { AuthService } from '../services/auth.service';

export const authGuard: CanActivateFn = () => {
  const authService = inject(AuthService);
  const router = inject(Router);

  if (authService.isAuthenticated()) {
    const user = authService.currentUser();
    if (user && !user.is_verified) {
      router.navigate(['/auth/verify-email'], { queryParams: { email: user.email } });
      return false;
    }
    return true;
  }

  router.navigate(['/auth/login']);
  return false;
};
