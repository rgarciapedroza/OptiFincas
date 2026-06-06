import { Component, OnInit } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { SupabaseService } from './supabase.service';
import { ModalService } from './modal.service';
import { HttpClient } from '@angular/common/http';
import { lastValueFrom } from 'rxjs';
import { RegexRule } from './models';

@Component({
  selector: 'app-comunidad-config',
  template: `
    <div class="card-container" style="max-width: 800px; margin: 0 auto;">
      <div class="header-section">

      <!-- Estilos básicos de modales -->
      <style>
        .modal-overlay{position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(15,23,42,0.55);display:flex;align-items:center;justify-content:center;z-index:9999;padding:16px;}
        .modal-card{background:#ffffff;border-radius:14px;box-shadow:0 20px 50px rgba(0,0,0,0.25);width:100%;overflow:hidden;}
        .modal-header{display:flex;align-items:center;justify-content:space-between;padding:18px 18px;border-bottom:1px solid #e5e7eb;}
        .modal-body{padding:20px;}
        .modal-footer{display:flex;gap:12px;justify-content:flex-end;padding:16px 18px;border-top:1px solid #e5e7eb;}
        .btn-action{background:transparent;border:none;cursor:pointer;display:flex;align-items:center;justify-content:center;padding:8px;border-radius:10px;}
        .btn-action:hover{background:#f1f5f9;}
        .spinner{border:3px solid rgba(255,255,255,0.35);border-top-color:#fff;border-radius:50%;animation:spin 0.7s linear infinite;display:inline-block;}
        @keyframes spin{to{transform:rotate(360deg)}}
      </style>
        <h2 style="margin-bottom: 5px;">Configuración de Inteligencia Artificial</h2>
        <p style="color: #64748b; font-size: 0.9rem;">
          Personaliza cómo el sistema detecta automáticamente los pisos en los extractos bancarios de esta comunidad.
        </p>
      </div>

      <!-- Botón para abrir el Asistente IA -->
      <div class="config-section" style="margin-top: 20px; background: linear-gradient(135deg, #f5f3ff 0%, #ffffff 100%); padding: 25px; border-radius: 12px; border: 1px solid #c7d2fe; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);">
        <h3 style="font-size: 1rem; margin-bottom: 15px; display: flex; align-items: center; gap: 8px;">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2a10 10 0 1 0 10 10H12V2z"></path><path d="M12 12L2.69 7"></path><path d="M12 12l5.63 8.04"></path><path d="M22 12a10 10 0 0 0-10-10"></path></svg>
          Asistente de Configuración IA
        </h3>
        <p style="font-size: 0.85rem; color: #4b5563; margin-bottom: 15px;">Describe cómo aparecen los pisos en tus extractos y la IA generará la regla técnica por ti.</p>
        <div style="display: flex; gap: 10px;">
          <button class="btn btn-primary" (click)="abrirModalGenerarRegla()" style="width: 100%; background: #6366f1; border: none;">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 5v14M5 12h14"></path></svg>
            Añadir/Generar Regla con IA
          </button>
        </div>
      </div>
      
      <!-- Reglas del Sistema (Globales) -->
      <div class="config-section" style="margin-top: 30px; background: white; padding: 25px; border-radius: 12px; border: 1px solid #e2e8f0;">
        <h3 style="font-size: 1rem; margin-bottom: 20px; display: flex; align-items: center; gap: 8px;">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="16" x2="12" y2="12"></line><line x1="12" y1="8" x2="12.01" y2="8"></line></svg>
          Casos Cubiertos por el Sistema (Global)
        </h3>
        <div class="rules-list" style="display: flex; flex-direction: column; gap: 10px; max-height: 300px; overflow-y: auto; padding-right: 5px;">
          <div *ngFor="let global of patronesGlobales" 
               style="padding: 12px 18px; background: #ffffff; border-radius: 10px; border: 1px solid #eef2f7; color: #475569; font-size: 0.85rem; display: flex; align-items: flex-start; gap: 12px; box-shadow: 0 1px 2px rgba(0,0,0,0.02);">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#10b981" stroke-width="3" style="margin-top: 2px;"><polyline points="20 6 9 17 4 11"></polyline></svg>
            <span style="line-height: 1.4;">{{ global.description }}</span>
          </div>
        </div>
        <div *ngIf="!loading && patronesGlobales.length === 0" style="color: #94a3b8; font-size: 0.85rem; font-style: italic; padding: 10px;">
          No se han encontrado reglas globales definidas en el sistema.
        </div>
      </div>

      <!-- Mis Reglas Personalizadas -->
      <div class="config-section" style="margin-top: 30px; background: white; padding: 25px; border-radius: 12px; border: 1px solid #e2e8f0;">
        <h3 style="font-size: 1rem; margin-bottom: 20px; display: flex; align-items: center; gap: 8px;">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"></path><polyline points="3.27 6.96 12 12.01 20.73 6.96"></polyline><line x1="12" y1="22.08" x2="12" y2="12"></line></svg>
          Mis Reglas Personalizadas
        </h3>

        <!-- Listado de reglas de la comunidad -->
        <div class="rules-list" style="display: flex; flex-direction: column; gap: 10px;">
          <div *ngFor="let rule of patrones; let i = index" style="display: flex; gap: 15px; align-items: center; background: #f8fafc; padding: 15px; border-radius: 12px; border: 1px solid #e2e8f0; position: relative;">
            <div style="background: #6366f1; color: white; width: 28px; height: 28px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 0.75rem; font-weight: 800; flex-shrink: 0;">
              {{ i + 1 }}
            </div>
            <div style="flex: 1;">
              <label style="display: block; font-size: 0.7rem; color: #94a3b8; text-transform: uppercase; font-weight: 700; margin-bottom: 4px;">Casos que identifica esta regla:</label>
              <input [(ngModel)]="patrones[i].description" class="input-standard" style="font-family: inherit; font-size: 0.95rem; border: none; background: transparent; width: 100%; padding: 0; font-weight: 600; color: #1e293b;" placeholder="Describe qué detecta esta regla...">
              <div *ngIf="patrones[i].assigned_value" style="margin-top: 8px; font-size: 0.8rem; color: #475569; display: flex; align-items: center; gap: 5px; background: #eef2f7; padding: 4px 8px; border-radius: 6px;">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"></path><polyline points="13 2 13 9 20 9"></polyline></svg>
                Asigna: <span style="font-weight: 700;">{{ patrones[i].assigned_value }}</span>
              </div>
            </div>
            <button class="btn-action" (click)="eliminarRegla(i)" style="color: #ef4444;" title="Eliminar regla">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
            </button>
          </div>
          <div *ngIf="patrones.length === 0" style="text-align: center; padding: 20px; border: 2px dashed #f1f5f9; border-radius: 8px; color: #94a3b8; font-size: 0.85rem;">
            No has añadido reglas personalizadas aún.
          </div>
        </div>

          <div style="margin-top: 30px; padding-top: 20px; border-top: 1px solid #f1f5f9; display: flex; justify-content: space-between;">
          <button class="btn btn-danger" *ngIf="patrones.length > 0" (click)="restaurarDefault()" style="font-size: 0.85rem;">
            Borrar personalización
          </button>
          </div>
      </div>

      <!-- Modal para Generar y Probar Regla -->
      <div class="modal-overlay" *ngIf="mostrarModalGenerarRegla">
        <div class="modal-card" style="max-width: 600px;">
          <div class="modal-header">
            <h3>Asistente de Configuración IA</h3>
            <button class="btn-action" (click)="cerrarModalGenerarRegla()"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg></button>
          </div>
          <div class="modal-body" style="background: white; padding: 30px;">
            <!-- SECCIÓN GENERACIÓN -->
            <div class="form-group" style="margin-bottom: 25px;">
              <label>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="margin-right: 8px;"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path></svg>
                ¿Qué quieres identificar?
              </label>
              <input [(ngModel)]="promptIA" placeholder="Ej: Detecta la palabra 'Ayuntamiento' y asigna 'PLAZAS GARAJE'" class="input-concepto-edit" style="font-size: 0.95rem;">
              <small style="color: #64748b; margin-top: 8px; display: block; line-height: 1.4;">Explica en lenguaje natural qué texto aparece en el banco y qué piso o categoría quieres que se asigne.</small>
            </div>

            <button class="btn btn-primary" (click)="generarReglaConIA()" [disabled]="loadingIA || !promptIA" style="width: 100%; margin-bottom: 30px; height: 48px; background: #6366f1;">
               <span *ngIf="!loadingIA" style="display: flex; align-items: center; gap: 8px; justify-content: center;">
                 <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2a10 10 0 1 0 10 10H12V2z"></path><path d="M12 12L2.69 7"></path><path d="M12 12l5.63 8.04"></path><path d="M22 12a10 10 0 0 0-10-10"></path></svg>
                 Generar Regla Inteligente
               </span>
               <span *ngIf="loadingIA" class="spinner" style="width: 20px; height: 20px; border-width: 2px; margin: 0;"></span>
            </button>

            <!-- RESULTADO Y PRUEBA -->
          <div *ngIf="ruleBeingGenerated.pattern" style="margin-bottom: 10px; padding: 25px; background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 16px; animation: slideUp 0.3s ease-out;">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px;">
              <span style="font-size: 0.7rem; font-weight: 800; color: #64748b; text-transform: uppercase; letter-spacing: 0.05em;">Regla Propuesta por la IA</span>
              <div *ngIf="ruleBeingGenerated.assigned_value" style="display: flex; align-items: center; gap: 6px; background: #e0e7ff; color: #4338ca; padding: 4px 10px; border-radius: 8px; font-size: 0.75rem; font-weight: 700;">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"></path><polyline points="13 2 13 9 20 9"></polyline></svg>
                Asigna: {{ ruleBeingGenerated.assigned_value }}
              </div>
            </div>

            <div class="form-group" style="margin-bottom: 20px;">
              <label style="font-size: 0.8rem; font-weight: 700;">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="margin-right: 6px;"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg>
                Prueba la detección:
              </label>
              <div style="display: flex; gap: 8px;">
                <input [(ngModel)]="textoPrueba" placeholder="Pega aquí un concepto del banco..." class="input-concepto-edit" style="flex: 1; background: white;">
                <button class="btn btn-secondary" (click)="probarReglas()" [disabled]="!textoPrueba" style="padding: 0 15px;">Validar</button>
              </div>
            </div>

            <div *ngIf="resultadoPrueba" 
                 [style.background]="pisoDetectadoPrueba ? '#f0fdf4' : '#fef2f2'" 
                 [style.border-color]="pisoDetectadoPrueba ? '#10b981' : '#f43f5e'"
                 style="padding: 15px; border-radius: 12px; border: 1px solid; font-size: 0.85rem; display: flex; align-items: center; gap: 12px; animation: fadeIn 0.2s ease;">
              <div *ngIf="pisoDetectadoPrueba" style="color: #10b981; display: flex; align-items: center; justify-content: center; width: 24px; height: 24px; background: white; border-radius: 50%; border: 1px solid #10b981;">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="4"><polyline points="20 6 9 17 4 11"></polyline></svg>
              </div>
              <div *ngIf="!pisoDetectadoPrueba" style="color: #ef4444; display: flex; align-items: center; justify-content: center; width: 24px; height: 24px; background: white; border-radius: 50%; border: 1px solid #ef4444;">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="4"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
              </div>
              <div style="flex: 1;">
                <p [style.color]="pisoDetectadoPrueba ? '#166534' : '#991b1b'" style="margin: 0; font-weight: 700;">
                  {{ resultadoPrueba }}
                </p>
                <p *ngIf="pisoDetectadoPrueba" style="margin: 4px 0 0 0; color: #166534; font-size: 0.8rem;">
                  Valor extraído: <span style="font-weight: 800; font-size: 0.95rem;">{{ pisoDetectadoPrueba }}</span>
                </p>
              </div>
            </div>
          </div>
          </div>
          <div class="modal-footer">
            <button class="btn btn-secondary" (click)="cerrarModalGenerarRegla()">Cancelar</button>
            <button class="btn btn-success" (click)="guardarReglaDesdeModal()" [disabled]="!ruleBeingGenerated.pattern || !ruleBeingGenerated.description">
              Guardar Regla
            </button>
          </div>
        </div>
      </div>
    </div>
  `
})
export class ComunidadConfigComponent implements OnInit {
  communityId: string | null = null;
  patrones: RegexRule[] = [];
  patronesGlobales: RegexRule[] = [];
  
  loading = false;
  loadingIA = false;
  promptIA = '';
  mostrarModalGenerarRegla = false;
  ruleBeingGenerated: RegexRule = { description: '', pattern: '' };

  // Estado para la herramienta de pruebas
  textoPrueba: string = '';
  resultadoPrueba: string | null = null;
  pisoDetectadoPrueba: string | null = null;

  constructor(
    private route: ActivatedRoute,
    private http: HttpClient,
    private supabase: SupabaseService, // Asegúrate de que SupabaseService está inyectado
    private modalService: ModalService
  ) {}

  async ngOnInit() {
    this.communityId = this.route.parent?.snapshot.paramMap.get('id') || null;
    if (this.communityId) {
      await this.cargarConfiguracion();
    }
  }

  async cargarConfiguracion() {
    this.loading = true;
    
    // Cargar reglas globales para referencia
    const { data: globalConfig } = await this.supabase.getGlobalConfig('patrones_piso'); // Esto debería devolver [{description, pattern}]
    this.patronesGlobales = globalConfig || [];

    // Cargar reglas específicas de la comunidad
    const { data } = await this.supabase.getComunidadById(this.communityId!);
    if (data) {
      if (data.patrones_piso && Array.isArray(data.patrones_piso)) {
        this.patrones = data.patrones_piso;
      } else {
        this.patrones = [];
      }
    }
    this.loading = false;
  }

  abrirModalGenerarRegla() {
    this.mostrarModalGenerarRegla = true;
    this.ruleBeingGenerated = { description: this.promptIA, pattern: '', assigned_value: undefined }; // Resetear para nueva regla
    this.resultadoPrueba = null;
    this.pisoDetectadoPrueba = null;
  }

  cerrarModalGenerarRegla() {
    this.mostrarModalGenerarRegla = false;
    this.promptIA = '';
    this.ruleBeingGenerated = { description: '', pattern: '', assigned_value: undefined };
  }

  async generarReglaConIA() {
    if (!this.promptIA.trim()) return;
    this.loadingIA = true;

    try {
      const res: any = await lastValueFrom(
        this.http.post('/api/ia/generar-regla', { prompt: this.promptIA })
      );

      if (res && res.regex) {
        let regexGenerada = res.regex.trim().replace(/\\\\/g, '\\'); // Corregir doble escape
        let assignedValue = res.assigned_value ? res.assigned_value.trim().toUpperCase() : undefined;

        // Si la IA no devuelve un assigned_value pero el prompt lo implicaba, podemos intentar inferirlo
        if (!assignedValue && this.promptIA.toLowerCase().includes('asigna')) {
          const match = this.promptIA.match(/asigna\s+['"]?([^'"]+)['"]?/i);
          if (match && match[1]) assignedValue = match[1].trim().toUpperCase();
        }

        this.ruleBeingGenerated = {
          description: this.promptIA, 
          pattern: regexGenerada,
          assigned_value: assignedValue
        };
        this.promptIA = '';
        this.modalService.showAlert('Éxito', 'Se ha generado una nueva regla.');
      }
    } catch (err: any) {
      this.modalService.showAlert('Error', 'No se pudo contactar con la IA.');
    } finally {
      this.loadingIA = false;
    }
  }

  async guardarReglaDesdeModal() {
    if (!this.ruleBeingGenerated.pattern || !this.ruleBeingGenerated.description || this.ruleBeingGenerated.description.trim() === '') {
      this.modalService.showAlert('Error', 'La regla debe tener una descripción y un patrón Regex.');
      return;
    }

    // Insertar en la lista local
    this.patrones.unshift({ ...this.ruleBeingGenerated });
    this.cerrarModalGenerarRegla();

    // Persistir automáticamente en DB (sin necesidad de botón "Guardar Configuración")
    const patronesLimpios = this.patrones.filter(p => p.description && p.description.trim() !== '');
    const invalidPatterns = patronesLimpios.filter(p => !p.pattern || p.pattern.trim() === '');
    if (invalidPatterns.length > 0) {
      this.modalService.showAlert('Error', 'Todas las reglas deben tener un patrón Regex válido.');
      return;
    }

    this.loading = true;
    try {
      const { error } = await this.supabase.updateComunidad(this.communityId!, { patrones_piso: patronesLimpios });
      if (error) throw error;

      this.modalService.showAlert('Éxito', 'Regla guardada y configuración actualizada.');
      await this.cargarConfiguracion();
    } catch (e: any) {
      this.modalService.showAlert('Error', 'Error al guardar la regla: ' + (e?.message ?? 'desconocido'));
    } finally {
      this.loading = false;
    }
  }

  probarReglas() {
    if (!this.textoPrueba) return;
    const ruleToTest = this.ruleBeingGenerated; // Solo probamos la regla que se está generando/editando en el modal
    let encontrado = false;
    this.resultadoPrueba = 'Probando...';
    this.pisoDetectadoPrueba = null;
    
    if (ruleToTest.pattern) {
      try {
        const cleanedPattern = ruleToTest.pattern.replace(/\\\\/g, '\\');
        const regex = new RegExp(cleanedPattern, 'i');
        const match = this.textoPrueba.match(regex);
        
        if (match) {
          if (ruleToTest.assigned_value) {
            this.pisoDetectadoPrueba = ruleToTest.assigned_value; // Si tiene assigned_value, lo usamos
          } else {
            // Buscamos el primer grupo de captura que no sea nulo (el identificador)
            const groupMatch = match.find((val, idx) => idx > 0 && val !== undefined && val !== null && val.trim() !== '');
            this.pisoDetectadoPrueba = groupMatch || match[0];
          }
          this.resultadoPrueba = `¡Detectado por la regla: "${ruleToTest.description}"!`;
          encontrado = true;
        }
      } catch (e) { console.error('Regex inválido:', ruleToTest.pattern); }
    }
    if (!encontrado) {
      this.resultadoPrueba = 'Ninguna regla detectó este texto.';
    }
  }

  async eliminarRegla(index: number) {
    const confirm = await this.modalService.showConfirm(
      'Eliminar regla',
      '¿Estás seguro de que quieres eliminar esta regla personalizada?'
    );
    if (!confirm) return;

    this.patrones.splice(index, 1);

    this.loading = true;
    try {
      const { error } = await this.supabase.updateComunidad(this.communityId!, { 
        patrones_piso: this.patrones 
      });
      if (error) throw error;
      
      this.modalService.showAlert('Eliminada', 'La regla se ha eliminado correctamente.');
    } catch (e: any) {
      this.modalService.showAlert('Error', 'No se pudo eliminar la regla en el servidor: ' + (e?.message ?? 'desconocido'));
      await this.cargarConfiguracion(); // Recargamos para recuperar la regla si hubo error
    } finally {
      this.loading = false;
    }
  }

  async restaurarDefault() {
    const confirm = await this.modalService.showConfirm('Restaurar Reglas', '¿Quieres borrar todas tus reglas personalizadas y usar solo las del sistema?');
    if (!confirm) return;

    this.loading = true;
    try {
      const { error } = await this.supabase.updateComunidad(this.communityId!, { patrones_piso: null });
      if (error) throw error;
      await this.cargarConfiguracion();
      this.patrones = [];
      this.modalService.showAlert('Éxito', 'Se han restaurado las reglas globales.');
    } catch (e: any) {
      this.modalService.showAlert('Error', 'No se pudieron restaurar las reglas: ' + e.message);
    } finally {
      this.loading = false;
    }
  }

  async guardar() {
    const patronesLimpios = this.patrones.filter(p => p.description && p.description.trim() !== '');
    this.loading = true;
    // Basic validation for patterns
    const invalidPatterns = patronesLimpios.filter(p => !p.pattern || p.pattern.trim() === '');
    if (invalidPatterns.length > 0) {
      this.modalService.showAlert('Error', 'Todas las reglas deben tener un patrón Regex válido.');
      this.loading = false;
      return;
    }
    try {
      const { data, error } = await this.supabase.updateComunidad(this.communityId!, { patrones_piso: patronesLimpios });
      if (error) throw error;
      
      if (!data || data.length === 0) {
        throw new Error('No se pudo guardar en la base de datos. Es posible que no tenga permisos de edición para esta comunidad.');
      }

      this.modalService.showAlert('Éxito', 'Configuración de IA guardada correctamente.');
      await this.cargarConfiguracion(); // Reload configuration after successful save
    } catch (e: any) {
      this.modalService.showAlert('Error', 'Error al guardar la configuración: ' + e.message);
    } finally {
      this.loading = false;
    }
  }
}