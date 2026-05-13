import { Routes } from '@angular/router';
import { LoginComponent } from './components/auth/login.component';
import { RegisterComponent } from './components/auth/register.component';
import { VerifyComponent } from './components/auth/verify.component';
import { CompleteProfileComponent } from './components/auth/complete-profile.component';

import { ProfileComponent } from './components/profile/profile.component';
import { authGuard } from './guards/auth.guard';
import { DashboardComponent } from './components/dashboard/dashboard.component';
import { MixerComponent } from './components/mixer/mixer.component';

export const routes: Routes = [
  { path: '', component: DashboardComponent, canActivate: [authGuard] },
  { path: 'mixer/:id', component: MixerComponent, canActivate: [authGuard] },
  { path: 'profile', component: ProfileComponent, canActivate: [authGuard] },
  { path: 'auth/login', component: LoginComponent },
  { path: 'auth/register', component: RegisterComponent },
  { path: 'auth/verify-email', component: VerifyComponent },
  { path: 'auth/complete-profile', component: CompleteProfileComponent },
  { path: '**', redirectTo: '' },
];
