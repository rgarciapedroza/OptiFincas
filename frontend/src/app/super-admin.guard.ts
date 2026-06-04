import { Injectable } from '@angular/core';
import { CanActivate, Router, UrlTree } from '@angular/router';
import { SupabaseService } from './supabase.service';

@Injectable({
  providedIn: 'root'
})
export class SuperAdminGuard implements CanActivate {
  constructor(private supabase: SupabaseService, private router: Router) {}

  async canActivate(): Promise<boolean | UrlTree> {
    const session = await this.supabase.getSession();
    if (!session) return this.router.parseUrl('/login');

    const { data: profile } = await this.supabase.getProfile(session.user.id);
    
    if (profile && profile.role === 'superadmin') {
      return true;
    }

    // Si no es superadmin, lo mandamos a su zona de trabajo o landing
    return this.router.parseUrl('/comunidades');
  }
}