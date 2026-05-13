import { Injectable, signal, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Router } from '@angular/router';
import { Observable, tap, switchMap } from 'rxjs';
import { environment } from '../../environments/environment';

export interface User {
  id: number;
  email: string;
  full_name?: string;
  is_verified: boolean;
  created_at: string;
}

export interface TokenResponse {
  access_token: string;
  token_type: string;
}

@Injectable({
  providedIn: 'root'
})
export class AuthService {
  private http = inject(HttpClient);
  private router = inject(Router);
  private apiUrl = environment.apiUrl;

  currentUser = signal<User | null>(null);
  isAuthenticated = signal<boolean>(!!localStorage.getItem('access_token'));

  constructor() {
    this.checkAuth();
  }

  private checkAuth() {
    const token = localStorage.getItem('access_token');
    if (token) {
      this.getMe().subscribe({
        next: (user) => {
          this.currentUser.set(user);
          this.isAuthenticated.set(true);
        },
        error: () => {
          this.logout(false);
        }
      });
    }
  }

  requestVerification(email: string): Observable<any> {
    return this.http.post(`${this.apiUrl}/auth/request-verification`, { email });
  }

  completeRegistration(data: any): Observable<User> {
    return this.http.post<User>(`${this.apiUrl}/auth/complete-registration`, data);
  }

  register(data: any): Observable<User> {
    return this.http.post<User>(`${this.apiUrl}/auth/register`, data);
  }

  login(data: FormData): Observable<User> {
    return this.http.post<TokenResponse>(`${this.apiUrl}/auth/login`, data).pipe(
      tap(res => {
        localStorage.setItem('access_token', res.access_token);
        this.isAuthenticated.set(true);
      }),
      switchMap(() => this.getMe()),
      tap(user => this.currentUser.set(user))
    );
  }

  logout(redirect = true) {
    localStorage.removeItem('access_token');
    this.currentUser.set(null);
    this.isAuthenticated.set(false);
    if (redirect) {
      this.router.navigate(['/auth/login']);
    }
  }

  getMe(): Observable<User> {
    return this.http.get<User>(`${this.apiUrl}/users/me`);
  }

  updateMe(data: any): Observable<User> {
    return this.http.patch<User>(`${this.apiUrl}/users/me`, data).pipe(
      tap(user => this.currentUser.set(user))
    );
  }

  changePassword(data: any): Observable<any> {
    return this.http.post(`${this.apiUrl}/users/me/change-password`, data);
  }

  deleteAccount(): Observable<any> {
    return this.http.delete(`${this.apiUrl}/users/me`).pipe(
      tap(() => this.logout())
    );
  }

  verifyCode(email: string, code: string): Observable<any> {
    return this.http.post(`${this.apiUrl}/auth/verify-code`, { email, code });
  }

  resendCode(email: string): Observable<any> {
    return this.http.post(`${this.apiUrl}/auth/resend-code`, null, { params: { email } });
  }
}
