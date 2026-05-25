import { Component, OnInit } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { SupabaseService } from './supabase.service';
import { Piso } from './models';
import * as CryptoJS from 'crypto-js';

const ENCRYPT_KEY = CryptoJS.enc.Utf8.parse('OptiFincasSecretKey2024_Security');
const ENCRYPT_IV = CryptoJS.enc.Utf8.parse('OptiFincas_IV_16');

@Component({
  selector: 'app-censo',
  templateUrl: './censo.component.html', // Crea este archivo pegando el HTML de propietarios
  styleUrls: ['./comunidades.component.css']
})
export class CensoComponent implements OnInit {
  pisos: Piso[] = [];
  communityId: string | null = null;
  loading = false;
  pisoForm: Piso = { community_id: 0, codigo: '' };
  editandoPisoId: number | null = null;
  mostrarModalEdicionPiso = false;

  constructor(private route: ActivatedRoute, private supabase: SupabaseService) {}

  async ngOnInit() {
    this.communityId = this.route.parent?.snapshot.paramMap.get('id') || null;
    if (this.communityId) {
      await this.cargarPisos();
    }
  }

  async cargarPisos() {
    if (!this.communityId) return;
    const { data } = await this.supabase.getPisos(this.communityId);
    if (data) {
      this.pisos = data.map((p: any) => ({
        ...p,
        propietario: this.decryptVal(p.propietario),
        telefono1: this.decryptVal(p.telefono1),
        telefono2: this.decryptVal(p.telefono2),
        observaciones: this.decryptVal(p.observaciones),
      }));
    }
  }

  decryptVal(ciphertext: string): string {
    if (!ciphertext || ciphertext === '-' || ciphertext === 'nan') return '';
    try {
      const decrypted = CryptoJS.AES.decrypt(ciphertext, ENCRYPT_KEY, {
        iv: ENCRYPT_IV,
        mode: CryptoJS.mode.CBC,
        padding: CryptoJS.pad.Pkcs7
      });
      return decrypted.toString(CryptoJS.enc.Utf8) || ciphertext;
    } catch (e) { console.error("Decryption error:", e); return ''; }
  }

  prepararNuevoPiso() {
    this.editandoPisoId = null;
    this.pisoForm = { community_id: parseInt(this.communityId!), codigo: '' };
    this.mostrarModalEdicionPiso = true;
  }

  prepararEdicionPiso(p: Piso) {
    this.pisoForm = { ...p };
    this.editandoPisoId = p.id || null;
    this.mostrarModalEdicionPiso = true;
  }

  async guardarPiso() {
    this.loading = true;
    try {
      const { id, created_at, ...datos } = this.pisoForm as any;
      if (this.editandoPisoId) {
        await this.supabase.updatePiso(this.editandoPisoId, datos);
      } else {
        await this.supabase.createPiso(datos);
      }
      this.mostrarModalEdicionPiso = false;
      await this.cargarPisos();
    } catch (e: any) { alert(e.message); }
    finally { this.loading = false; }
  }

  async eliminarPiso(id: number) {
    if (confirm('¿Borrar propietario?')) {
      await this.supabase.deletePiso(id);
      await this.cargarPisos();
    }
  }
}