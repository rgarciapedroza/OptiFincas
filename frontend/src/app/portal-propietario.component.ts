import { Component, OnInit } from '@angular/core';
import { SupabaseService } from './supabase.service';

@Component({
  selector: 'app-portal-propietario',
  templateUrl: './portal-propietario.component.html',
  styleUrls: ['./portal-propietario.component.css']
})
export class PortalPropietarioComponent implements OnInit {
  userPiso: any = null;

  constructor(private supabase: SupabaseService) {}

  async ngOnInit() {
    const session = await this.supabase.getSession();
    if (session?.user?.email) {
      const { data } = await this.supabase.buscarPisoPorEmail(session.user.email);
      if (data && data.length > 0) {
        this.userPiso = data[0];
      }
    }
  }
}