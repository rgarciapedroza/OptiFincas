import { Component, OnInit } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { SupabaseService } from './supabase.service';
import { ModalService } from './modal.service';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { lastValueFrom } from 'rxjs';
import { RegexRule } from './models';

// Define an interface for category rules, assuming backend returns community_id
interface CategoriaRegla {
  id?: number;
  palabra_clave: string;
  categoria_asignada: string;
  tipo: 'ingreso' | 'gasto';
  community_id?: number | null;
}

@Component({
  selector: 'app-comunidad-config',
  template: `
    <div class="card-container" style="max-width: 900px; margin: 0 auto;">
      <div class="header-section">
        <h2 style="margin-bottom: 5px;">Configuración</h2>
        <p style="color: #64748b; font-size: 0.9rem;">
          Personaliza cómo el sistema detecta automáticamente los pisos en los extractos bancarios de esta comunidad.
        </p>
      </div>

      <!-- Estilos de la interfaz -->
      <style>
        .modal-overlay{position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(15,23,42,0.55);display:flex;align-items:center;justify-content:center;z-index:9999;padding:16px;}
        .modal-card{background:#ffffff;border-radius:14px;box-shadow:0 20px 50px rgba(0,0,0,0.25);width:100%;max-width:500px;overflow:hidden;}
        .modal-header{display:flex;align-items:center;justify-content:space-between;padding:18px 25px;border-bottom:1px solid #e5e7eb;}
        .modal-body{padding:25px;}
        .modal-footer{display:flex;gap:12px;justify-content:flex-end;padding:16px 25px;border-top:1px solid #e5e7eb;}
        .tabs-nav { display: flex; gap: 8px; margin-bottom: 25px; border-bottom: 1px solid #e2e8f0; padding-bottom: 12px; }
        .tab-btn { padding: 10px 18px; border: none; background: none; cursor: pointer; font-weight: 700; color: #64748b; border-radius: 10px; font-size: 0.9rem; transition: all 0.2s; }
        .tab-btn:hover { background: #f1f5f9; color: #1e293b; }
        .tab-btn.active { background: #eef2ff; color: #4f46e5; }
        .btn-action{background:transparent;border:none;cursor:pointer;display:flex;align-items:center;justify-content:center;padding:8px;border-radius:10px;transition:all 0.2s;}
        .btn-action:hover{background:#f1f5f9;}
        .admin-badge { background: #fee2e2; color: #ef4444; padding: 4px 10px; border-radius: 20px; font-size: 0.7rem; font-weight: 800; text-transform: uppercase; }
        .table-admin { width: 100%; border-collapse: collapse; margin-top: 15px; font-size: 0.85rem; background: white; border-radius: 12px; overflow: hidden; box-shadow: 0 1px 3px rgba(0,0,0,0.05); }
        .table-admin th { text-align: left; padding: 12px 15px; background: #f8fafc; border-bottom: 2px solid #e2e8f0; color: #64748b; font-weight: 600; }
        .table-admin td { padding: 12px 15px; border-bottom: 1px solid #f1f5f9; vertical-align: middle; }
        .input-inline { border: 1px solid #e2e8f0; border-radius: 8px; padding: 8px 10px; width: 100%; font-size: 0.85rem; transition: all 0.2s; }
        .input-inline:focus { outline: none; border-color: #6366f1; box-shadow: 0 0 0 2px rgba(99,102,241,0.1); }
        .btn-primary { background: #6366f1; border: none; color: white; padding: 10px 20px; border-radius: 10px; font-weight: 600; cursor: pointer; transition: all 0.2s; }
        .btn-primary:hover { background: #4f46e5; transform: translateY(-1px); }
        .btn-secondary { background: #f1f5f9; border: 1px solid #e2e8f0; color: #334155; padding: 10px 20px; border-radius: 10px; font-weight: 600; cursor: pointer; transition: all 0.2s; }
        .btn-secondary:hover { background: #e2e8f0; }
        .btn-danger { background: #fee2e2; border: 1px solid #fecaca; color: #dc2626; padding: 8px 16px; border-radius: 10px; font-weight: 600; cursor: pointer; transition: all 0.2s; font-size: 0.85rem; }
        .btn-danger:hover { background: #fecaca; border-color: #fca5a5; }
        .btn-success { background: #10b981; border: none; color: white; padding: 10px 20px; border-radius: 10px; font-weight: 600; cursor: pointer; transition: all 0.2s; }
        .btn-success:hover { background: #059669; }
        .spinner{border:3px solid rgba(255,255,255,0.35);border-top-color:#fff;border-radius:50%;animation:spin 0.7s linear infinite;display:inline-block;}
        @keyframes spin{to{transform:rotate(360deg)}}
        .form-group { margin-bottom: 20px; }
        .form-group label { display: block; font-size: 0.85rem; font-weight: 700; color: #334155; margin-bottom: 8px; }
        .form-control { width: 100%; padding: 10px 12px; border: 1px solid #e2e8f0; border-radius: 10px; font-size: 0.9rem; transition: all 0.2s; }
        .form-control:focus { outline: none; border-color: #6366f1; box-shadow: 0 0 0 3px rgba(99,102,241,0.1); }
        select.form-control { background-color: white; cursor: pointer; }
        .badge-ingreso { background: #d1fae5; color: #065f46; padding: 4px 8px; border-radius: 6px; font-size: 0.7rem; font-weight: 600; display: inline-block; }
        .badge-gasto { background: #fee2e2; color: #991b1b; padding: 4px 8px; border-radius: 6px; font-size: 0.7rem; font-weight: 600; display: inline-block; }
        .badge-global { background: #e2e8f0; color: #475569; padding: 4px 8px; border-radius: 6px; font-size: 0.7rem; font-weight: 600; display: inline-block; }
        .rules-list { display: flex; flex-direction: column; gap: 10px; max-height: 300px; overflow-y: auto; padding-right: 5px; }
        .rule-item { padding: 12px 18px; background: #ffffff; border-radius: 10px; border: 1px solid #eef2f7; color: #475569; font-size: 0.85rem; display: flex; align-items: flex-start; gap: 12px; box-shadow: 0 1px 2px rgba(0,0,0,0.02); }
        .rule-check { width: 16px; height: 16px; margin-top: 2px; color: #10b981; flex-shrink: 0; }
        .btn-icon-disabled { opacity: 0.5; cursor: not-allowed; }
      </style>

      <!-- Navegación por Pestañas -->
      <div class="tabs-nav">
        <button class="tab-btn" [class.active]="activeTab === 'comunidad'" (click)="activeTab = 'comunidad'">
          Patrones Regex (Admin)
        </button>
        <button class="tab-btn" [class.active]="activeTab === 'categorias'" (click)="activeTab = 'categorias'">
          Palabras Clave (Admin)
        </button>
        <div style="flex: 1;"></div>
        <button class="btn-action" (click)="recargarClasificador()" [disabled]="loading" title="Recargar motor de reglas" style="color: #6366f1;">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M23 4v6h-6"></path><path d="M1 20v-6h6"></path><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"></path></svg>
        </button>
      </div>

      <!-- TAB: PATRONES REGEX (COMUNIDAD) -->
      <div *ngIf="activeTab === 'comunidad'">
        <!-- Botón para abrir el Asistente IA -->
        <div class="config-section" style="margin-top: 20px; background: linear-gradient(135deg, #f5f3ff 0%, #ffffff 100%); padding: 25px; border-radius: 12px; border: 1px solid #c7d2fe; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);">
          <h3 style="font-size: 1rem; margin-bottom: 15px; display: flex; align-items: center; gap: 8px;">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2a10 10 0 1 0 10 10H12V2z"></path><path d="M12 12L2.69 7"></path><path d="M12 12l5.63 8.04"></path><path d="M22 12a10 10 0 0 0-10-10"></path></svg>
            Asistente de Configuración
          </h3>
          <p style="font-size: 0.85rem; color: #4b5563; margin-bottom: 15px;">Describe cómo aparecen los pisos en tus extractos y la IA generará la regla técnica por ti.</p>
          <div style="display: flex; gap: 10px;">
            <button class="btn-primary" (click)="abrirModalGenerarRegla()" style="width: 100%;">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="display: inline-block; margin-right: 8px;"><path d="M12 5v14M5 12h14"></path></svg>
              Generar Regla con IA
            </button>
          </div>
        </div>

        <!-- Casos Cubiertos por el Sistema (Global) -->
        <div class="config-section" style="margin-top: 30px; background: white; padding: 25px; border-radius: 12px; border: 1px solid #e2e8f0;">
          <h3 style="font-size: 1rem; margin-bottom: 20px; display: flex; align-items: center; gap: 8px;">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="16" x2="12" y2="12"></line><line x1="12" y1="8" x2="12.01" y2="8"></line></svg>
            Casos Cubiertos por el Sistema (Global)
          </h3>
          <div class="rules-list">
            <div class="rule-item">
              <svg class="rule-check" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><polyline points="20 6 9 17 4 11"></polyline></svg>
              <span>Detecta PISO, PIZO o PIS0</span>
            </div>
            <div class="rule-item">
              <svg class="rule-check" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><polyline points="20 6 9 17 4 11"></polyline></svg>
              <span>Detecta PLANTA, PLNTA o PLTA</span>
            </div>
            <div class="rule-item">
              <svg class="rule-check" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><polyline points="20 6 9 17 4 11"></polyline></svg>
              <span>Detecta P. o P</span>
            </div>
            <div class="rule-item">
              <svg class="rule-check" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><polyline points="20 6 9 17 4 11"></polyline></svg>
              <span>Detecta PL. o PL</span>
            </div>
            <div class="rule-item">
              <svg class="rule-check" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><polyline points="20 6 9 17 4 11"></polyline></svg>
              <span>Detecta 4-J, 4/J</span>
            </div>
            <div class="rule-item">
              <svg class="rule-check" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><polyline points="20 6 9 17 4 11"></polyline></svg>
              <span>Detecta 4J, 4 J</span>
            </div>
          </div>
        </div>

        <!-- Mis Reglas Personalizadas -->
        <div class="config-section" style="margin-top: 30px; background: white; padding: 25px; border-radius: 12px; border: 1px solid #e2e8f0;">
          <h3 style="font-size: 1rem; margin-bottom: 20px; display: flex; align-items: center; gap: 8px;">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"></path><polyline points="3.27 6.96 12 12.01 20.73 6.96"></polyline><line x1="12" y1="22.08" x2="12" y2="12"></line></svg>
            Mis Reglas Personalizadas (Esta Comunidad)
          </h3>

          <div class="rules-list" style="display: flex; flex-direction: column; gap: 10px;">
            <div *ngFor="let rule of patrones; let i = index" style="display: flex; gap: 15px; align-items: center; background: #f8fafc; padding: 15px; border-radius: 12px; border: 1px solid #e2e8f0;">
              <div [style.background]="rule.is_system ? '#94a3b8' : '#6366f1'" style="color: white; width: 28px; height: 28px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 0.75rem; font-weight: 800; flex-shrink: 0;">
                {{ i + 1 }}
              </div>
              <div style="flex: 1;">
                <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 4px;">
                  <label style="font-size: 0.7rem; color: #94a3b8; text-transform: uppercase; font-weight: 700;">Casos que identifica esta regla:</label>
                  <span *ngIf="rule.is_system" class="badge-global" style="font-size: 0.6rem;">SISTEMA</span>
                </div>
                <input [(ngModel)]="patrones[i].description" [disabled]="rule.is_system" class="input-standard" style="font-family: inherit; font-size: 0.95rem; border: none; background: transparent; width: 100%; padding: 0; font-weight: 600; color: #1e293b;" placeholder="Describe qué detecta esta regla...">
                <div *ngIf="patrones[i].assigned_value" style="margin-top: 8px; font-size: 0.8rem; color: #475569; display: flex; align-items: center; gap: 5px; background: #eef2f7; padding: 4px 8px; border-radius: 6px;">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"></path><polyline points="13 2 13 9 20 9"></polyline></svg>
                  Asigna: <span style="font-weight: 700;">{{ patrones[i].assigned_value }}</span>
                </div>
              </div>
              <button *ngIf="!rule.is_system" class="btn-action" (click)="eliminarRegla(i)" style="color: #ef4444;" title="Eliminar regla">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
              </button>
            </div>
            <div *ngIf="patrones.length === 0" style="text-align: center; padding: 20px; border: 2px dashed #f1f5f9; border-radius: 8px; color: #94a3b8; font-size: 0.85rem;">
              No has añadido reglas personalizadas aún.
            </div>
          </div>

          <div style="margin-top: 30px; padding-top: 20px; border-top: 1px solid #f1f5f9; display: flex; justify-content: flex-end; gap: 10px;">
            <button class="btn-success" (click)="guardar()">Guardar Cambios</button>
            <button class="btn-danger" *ngIf="patrones.length > 0" (click)="restaurarDefault()">
              Borrar personalización
            </button>
          </div>
        </div>
      </div>

      <!-- ==================== TAB: PALABRAS CLAVE (ADMIN) ==================== -->
      <div *ngIf="activeTab === 'categorias'">
        <div class="admin-section">
          <div style="display: flex; align-items: center; gap: 10px; margin-bottom: 15px;">
            <h3 style="font-size: 1rem; margin: 0;">Gestión de Categorías y Palabras Clave</h3>
            <span class="admin-badge">Admin</span>
          </div>
          
          <div class="config-section" style="background: white; padding: 20px; border-radius: 12px; border: 1px solid #e2e8f0;">
            <table class="table-admin">
              <thead>
                <tr>
                  <th>Palabra Clave</th>
                  <th>Categoría Asignada</th>
                  <th>Tipo</th>
                  <th>Origen</th>
                  <th style="width: 100px;">Acciones</th>
                </tr>
              </thead>
              <tbody>
                <tr *ngFor="let regla of reglasCategorias">
                  <td style="font-weight: 500;">{{ regla.palabra_clave }}</td>
                  <td>{{ regla.categoria_asignada }}</td>
                  <td>
                    <span [class.badge-ingreso]="regla.tipo === 'ingreso'" [class.badge-gasto]="regla.tipo === 'gasto'">
                      {{ regla.tipo === 'ingreso' ? 'Ingreso' : 'Gasto' }}
                    </span>
                  </td>
                  <td>
                    <span class="badge-global" *ngIf="regla.community_id === null || regla.community_id === undefined">
                      Sistema
                    </span>
                    <span class="badge-ingreso" *ngIf="regla.community_id !== null && regla.community_id !== undefined && regla.community_id === Number(communityId)" style="background: #dbeafe; color: #1e40af;">
                      Personalizada
                    </span>
                  </td>
                  <td style="display: flex; gap: 8px;">
                    <button *ngIf="regla.community_id === Number(communityId)" class="btn-action" (click)="abrirModalEditarCategoria(regla)" title="Editar">
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#6366f1" stroke-width="2"><path d="M17 3l4 4-7 7H10v-4l7-7z"></path><path d="M4 20h16"></path></svg>
                    </button>
                    <button *ngIf="regla.community_id === Number(communityId)" class="btn-action" (click)="eliminarReglaCategoria(regla.id)" title="Eliminar">
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#ef4444" stroke-width="2"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
                    </button>
                  </td>
                </tr>
                <tr *ngIf="reglasCategorias.length === 0">
                  <td colspan="5" style="text-align: center; color: #94a3b8;">No hay reglas de categorías definidas.</td>
                </tr>
              </tbody>
            </table>
            <button class="btn-secondary" (click)="abrirModalNuevaCategoria()" style="margin-top: 20px; width: 100%; display: flex; align-items: center; justify-content: center; gap: 8px;">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 5v14M5 12h14"></path></svg>
              Añadir Palabra Clave Personalizada
            </button>
          </div>
        </div>
      </div>
    </div>

    <!-- Modal para Editar/Nueva Categoría -->
    <div class="modal-overlay" *ngIf="modalCategoriaVisible" (click)="cerrarModalCategoria()">
      <div class="modal-card" (click)="$event.stopPropagation()">
        <div class="modal-header">
          <h3>{{ categoriaEditandoOriginalId ? 'Editar Palabra Clave' : 'Nueva Palabra Clave' }}</h3>
          <button class="btn-action" (click)="cerrarModalCategoria()">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
          </button>
        </div>
        <div class="modal-body">
          <div class="form-group">
            <label>Palabra Clave</label>
            <input [(ngModel)]="categoriaEditando.palabra_clave" class="form-control" placeholder="Ej: SUPERMERCADO">
          </div>
          <div class="form-group">
            <label>Categoría Asignada</label>
            <input [(ngModel)]="categoriaEditando.categoria_asignada" class="form-control" placeholder="Ej: ALIMENTACIÓN">
          </div>
          <div class="form-group">
            <label>Tipo</label>
            <select [(ngModel)]="categoriaEditando.tipo" class="form-control">
              <option value="gasto">Gasto</option>
              <option value="ingreso">Ingreso</option>
            </select>
          </div>
        </div>
        <div class="modal-footer">
          <button class="btn-secondary" (click)="cerrarModalCategoria()">Cancelar</button>
          <button class="btn-success" (click)="guardarCategoriaDesdeModal()">Guardar</button>
        </div>
      </div>
    </div>

    <!-- Modal para Generar Regla con IA -->
    <div class="modal-overlay" *ngIf="mostrarModalGenerarRegla" (click)="cerrarModalGenerarRegla()">
      <div class="modal-card" style="max-width: 600px;" (click)="$event.stopPropagation()">
        <div class="modal-header">
          <h3>Asistente de Configuración IA</h3>
          <button class="btn-action" (click)="cerrarModalGenerarRegla()"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg></button>
        </div>
        <div class="modal-body">
          <div class="form-group">
            <label>¿Qué quieres identificar?</label>
            <input [(ngModel)]="promptIA" placeholder="Ej: Detecta la palabra 'Ayuntamiento' y asigna 'PLAZAS GARAJE'" class="form-control">
            <small style="color: #64748b; margin-top: 8px; display: block;">Explica en lenguaje natural qué texto aparece en el banco y qué piso quieres asignar.</small>
          </div>

          <button class="btn-primary" (click)="generarReglaConIA()" [disabled]="loadingIA || !promptIA" style="width: 100%; margin-bottom: 20px; height: 48px;">
            <span *ngIf="!loadingIA">Generar Regla Inteligente</span>
            <span *ngIf="loadingIA" class="spinner" style="width: 20px; height: 20px; border-width: 2px;"></span>
          </button>

          <div *ngIf="ruleBeingGenerated.pattern" style="padding: 20px; background: #f8fafc; border-radius: 12px;">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 15px;">
              <span style="font-size: 0.7rem; font-weight: 800; color: #64748b;">Regla Propuesta</span>
              <div *ngIf="ruleBeingGenerated.assigned_value" style="background: #e0e7ff; padding: 4px 10px; border-radius: 8px; font-size: 0.75rem; font-weight: 700; color: #4338ca;">
                Asigna: {{ ruleBeingGenerated.assigned_value }}
              </div>
            </div>
            <div class="form-group">
              <label>Expresión Regular</label>
              <code style="display: block; background: #1e293b; color: #e2e8f0; padding: 10px; border-radius: 8px; font-family: monospace; font-size: 0.8rem; word-break: break-all;">{{ ruleBeingGenerated.pattern }}</code>
            </div>
            <div class="form-group">
              <label>Prueba la detección:</label>
              <div style="display: flex; gap: 8px;">
                <input [(ngModel)]="textoPrueba" placeholder="Pega aquí un concepto del banco..." class="form-control">
                <button class="btn-secondary" (click)="probarReglas()" [disabled]="!textoPrueba">Validar</button>
              </div>
            </div>
            <div *ngIf="resultadoPrueba" 
                 [style.background]="pisoDetectadoPrueba ? '#f0fdf4' : '#fef2f2'" 
                 [style.border-color]="pisoDetectadoPrueba ? '#10b981' : '#f43f5e'"
                 style="padding: 12px; border-radius: 8px; border: 1px solid;">
              <p [style.color]="pisoDetectadoPrueba ? '#166534' : '#991b1b'" style="margin: 0; font-weight: 500;">
                {{ resultadoPrueba }}
              </p>
            </div>
          </div>
        </div>
        <div class="modal-footer">
          <button class="btn-secondary" (click)="cerrarModalGenerarRegla()">Cancelar</button>
          <button class="btn-success" (click)="guardarReglaDesdeModal()" [disabled]="!ruleBeingGenerated.pattern">
            Guardar Regla
          </button>
        </div>
      </div>
    </div>
  `
})
export class ComunidadConfigComponent implements OnInit {
  communityId: string | null = null;
  patrones: RegexRule[] = [];
  patronesGlobales: RegexRule[] = [];
  activeTab: 'comunidad' | 'categorias' = 'comunidad';

  // Exponer Number para evitar TypeError en plantillas minificadas
  public Number = Number;

  // Administración Global
  reglasCategorias: CategoriaRegla[] = [];
  patronesPisoAdmin: any[] = [];

  // Modal Categorías
  modalCategoriaVisible = false;
  categoriaEditando: any = { palabra_clave: '', categoria_asignada: '', tipo: 'gasto' };
  categoriaEditandoOriginalId: number | null = null;

  // Modal IA
  loading = false;
  loadingIA = false;
  promptIA = '';
  mostrarModalGenerarRegla = false;
  ruleBeingGenerated: RegexRule = { description: '', pattern: '' };
  textoPrueba: string = '';
  resultadoPrueba: string | null = null;
  pisoDetectadoPrueba: string | null = null;

  constructor(
    private route: ActivatedRoute,
    private http: HttpClient,
    private supabase: SupabaseService,
    private modalService: ModalService
  ) {}

  async ngOnInit() {
    this.communityId = this.route.parent?.snapshot.paramMap.get('id') || null;
    if (this.communityId) {
      await this.cargarConfiguracion();
      this.cargarAdminData();
    }
  }

  async cargarConfiguracion() {
    this.loading = true;
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

  // --- Métodos de Administración Global ---
  
  private async getAdminHeaders(): Promise<HttpHeaders> {
    const session = await this.supabase.getSession();
    return new HttpHeaders().set('Authorization', `Bearer ${session?.access_token}`);
  }

  async cargarAdminData() {
    try {
      const headers = await this.getAdminHeaders();
      
      // Cargar categorías
      const allCategoryRules: CategoriaRegla[] = await lastValueFrom(this.http.get<CategoriaRegla[]>('/api/admin/reglas-categorias', { headers }));
      // Mostrar todas las reglas (globales + las de esta comunidad)
      this.reglasCategorias = allCategoryRules.filter(r => r.community_id === null || r.community_id === undefined || r.community_id === Number(this.communityId));
      
      // Cargar patrones regex
      this.patronesPisoAdmin = await lastValueFrom(this.http.get<any[]>('/api/admin/patrones-piso', { headers }));
    } catch (e) {
      console.warn('No se pudieron cargar los datos administrativos (posible falta de permisos).');
    }
  }

  async recargarClasificador() {
    this.loading = true;
    try {
      const headers = await this.getAdminHeaders();
      await lastValueFrom(this.http.post('/api/admin/recargar-clasificador', {}, { headers }));
      this.modalService.showAlert('Motor Actualizado', 'El clasificador ha recargado todas las reglas de la base de datos.');
    } catch (e) {
      this.modalService.showAlert('Error', 'No se pudo recargar el clasificador.');
    } finally {
      this.loading = false;
    }
  }

  // CRUD Categorías con Modal
  abrirModalNuevaCategoria() {
    this.categoriaEditando = { palabra_clave: '', categoria_asignada: '', tipo: 'gasto', community_id: Number(this.communityId) };
    this.categoriaEditandoOriginalId = null;
    this.modalCategoriaVisible = true;
  }

  abrirModalEditarCategoria(regla: any) {
    // Solo permitir editar si es una regla personalizada de esta comunidad
    if (regla.community_id === Number(this.communityId)) {
      this.categoriaEditando = { ...regla };
      this.categoriaEditandoOriginalId = regla.id;
      this.modalCategoriaVisible = true;
    }
  }

  cerrarModalCategoria() {
    this.modalCategoriaVisible = false;
    this.categoriaEditando = { palabra_clave: '', categoria_asignada: '', tipo: 'gasto' };
    this.categoriaEditandoOriginalId = null;
  }

  async guardarCategoriaDesdeModal() {
    if (!this.categoriaEditando.palabra_clave || !this.categoriaEditando.categoria_asignada) {
      this.modalService.showAlert('Error', 'La palabra clave y la categoría son obligatorias.');
      return;
    }

    try {
      const headers = await this.getAdminHeaders();
      
      if (this.categoriaEditandoOriginalId) {
        // Editar existente
        const payload = { ...this.categoriaEditando };
        await lastValueFrom(this.http.put(`/api/admin/reglas-categorias/${this.categoriaEditandoOriginalId}`, payload, { headers }));
        const index = this.reglasCategorias.findIndex(r => r.id === this.categoriaEditandoOriginalId);
        if (index !== -1) {
          this.reglasCategorias[index] = { ...this.categoriaEditando, id: this.categoriaEditandoOriginalId };
        }
        this.modalService.showAlert('Éxito', 'Regla actualizada correctamente.');
      } else {
        // Crear nueva
        const res: any = await lastValueFrom(this.http.post('/api/admin/reglas-categorias', this.categoriaEditando, { headers }));
        this.reglasCategorias.push({ ...this.categoriaEditando, id: res[0].id });
        this.modalService.showAlert('Éxito', 'Regla creada correctamente.');
      }
      this.cerrarModalCategoria();
    } catch (e) {
      this.modalService.showAlert('Error', 'No se pudo guardar la regla.');
    }
  }

  async eliminarReglaCategoria(id: number) {
    if (!id) return;
    
    // Buscar la regla para verificar si es editable
    const regla = this.reglasCategorias.find(r => r.id === id);
    if (!regla || regla.community_id !== Number(this.communityId)) {
      this.modalService.showAlert('Acción denegada', 'Solo puedes eliminar tus propias reglas personalizadas.');
      return;
    }
    
    const confirm = await this.modalService.showConfirm('Eliminar', '¿Borrar esta palabra clave?');
    if (!confirm) return;
    try {
      const headers = await this.getAdminHeaders();
      await lastValueFrom(this.http.delete(`/api/admin/reglas-categorias/${id}`, { headers }));
      this.reglasCategorias = this.reglasCategorias.filter(r => r.id !== id);
      this.modalService.showAlert('Éxito', 'Regla eliminada correctamente.');
    } catch (e) {
      this.modalService.showAlert('Error', 'No se pudo eliminar.');
    }
  }

  // CRUD Patrones Piso (Admin)
  nuevoPatronPiso() {
    this.patronesPisoAdmin.push({ 
      description: '', 
      pattern: '', 
      priority: 0, 
      active: true, 
      community_id: null 
    });
  }

  async guardarPatronPiso(p: any) {
    try {
      const headers = await this.getAdminHeaders();
      const payload = { ...p };
      if (payload.id) {
        await lastValueFrom(this.http.put(`/api/admin/patrones-piso/${p.id}`, payload, { headers }));
      } else {
        const res: any = await lastValueFrom(this.http.post('/api/admin/patrones-piso', payload, { headers }));
        p.id = res[0].id;
      }
      this.modalService.showAlert('Guardado', 'Patrón Regex global actualizado.');
    } catch (e) {
      this.modalService.showAlert('Error', 'No se pudo guardar el patrón.');
    }
  }

  async eliminarPatronPiso(id: number) {
    if (!id) { this.patronesPisoAdmin = this.patronesPisoAdmin.filter(p => p.id); return; }
    const confirm = await this.modalService.showConfirm('Eliminar', '¿Borrar este patrón Regex globalmente?');
    if (!confirm) return;
    try {
      const headers = await this.getAdminHeaders();
      await lastValueFrom(this.http.delete(`/api/admin/patrones-piso/${id}`, { headers }));
      this.patronesPisoAdmin = this.patronesPisoAdmin.filter(p => p.id !== id);
    } catch (e) {
      this.modalService.showAlert('Error', 'No se pudo eliminar.');
    }
  }

  // --- Fin Métodos Admin ---

  // --- Métodos IA y Reglas Personalizadas ---
  abrirModalGenerarRegla() {
    this.mostrarModalGenerarRegla = true;
    this.ruleBeingGenerated = { description: '', pattern: '', assigned_value: undefined };
    this.textoPrueba = '';
    this.resultadoPrueba = null;
    this.pisoDetectadoPrueba = null;
    this.promptIA = '';
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
        let regexGenerada = res.regex.trim().replace(/\\\\/g, '\\');
        let assignedValue = res.assigned_value ? res.assigned_value.trim().toUpperCase() : undefined;

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
      }
    } catch (err: any) {
      this.modalService.showAlert('Error', 'No se pudo contactar con la IA.');
    } finally {
      this.loadingIA = false;
    }
  }

  probarReglas() {
    if (!this.textoPrueba) return;
    const ruleToTest = this.ruleBeingGenerated;
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
            this.pisoDetectadoPrueba = ruleToTest.assigned_value;
          } else {
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

  async guardarReglaDesdeModal() {
    if (!this.ruleBeingGenerated.pattern || !this.ruleBeingGenerated.description) {
      this.modalService.showAlert('Error', 'La regla debe tener una descripción y un patrón Regex.');
      return;
    }

    this.patrones.unshift({ ...this.ruleBeingGenerated });
    this.cerrarModalGenerarRegla();

    // IMPORTANTE: Solo guardamos las que NO son de sistema
    const patronesLimpios = this.patrones.filter(p => !p.is_system && p.description && p.description.trim() !== '');
    const invalidPatterns = patronesLimpios.filter(p => !p.pattern || p.pattern.trim() === '');
    if (invalidPatterns.length > 0) {
      this.modalService.showAlert('Error', 'Todas las reglas deben tener un patrón Regex válido.');
      return;
    }

    this.loading = true;
    try {
      const { error } = await this.supabase.updateComunidad(this.communityId!, { patrones_piso: patronesLimpios });
      if (error) throw error;

      this.modalService.showAlert('Éxito', 'Regla guardada correctamente.');
      await this.cargarConfiguracion();
    } catch (e: any) {
      this.modalService.showAlert('Error', 'Error al guardar la regla: ' + (e?.message ?? 'desconocido'));
    } finally {
      this.loading = false;
    }
  }

  async eliminarRegla(index: number) {
    const confirm = await this.modalService.showConfirm(
      'Eliminar regla',
      '¿Estás seguro de que quieres eliminar esta regla personalizada?'
    );
    if (!confirm) return;

    const regla = this.patrones[index];
    if (regla.is_system) {
      this.modalService.showAlert('Acción denegada', 'No puedes eliminar reglas del sistema.');
      return;
    }

    this.patrones = this.patrones.filter((_, i) => i !== index);
    await this.guardar(); // Guardamos tras eliminar
    this.modalService.showAlert('Eliminada', 'La regla se ha eliminado correctamente.');
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
    // IMPORTANTE: Solo guardamos en la comunidad las reglas que NO son de sistema
    const patronesLimpios = this.patrones.filter(p => !p.is_system && p.description && p.description.trim() !== '');
    this.loading = true;
    const invalidPatterns = patronesLimpios.filter(p => !p.pattern || p.pattern.trim() === '');
    if (invalidPatterns.length > 0) {
      this.modalService.showAlert('Error', 'Todas las reglas deben tener un patrón Regex válido.');
      this.loading = false;
      return;
    }
    try {
      const { data, error } = await this.supabase.updateComunidad(this.communityId!, { 
        patrones_piso: patronesLimpios
      });
      if (error) throw error;
      
      if (!data || data.length === 0) {
        throw new Error('No se pudo guardar en la base de datos.');
      }

      this.modalService.showAlert('Éxito', 'Configuración guardada correctamente.');
      await this.cargarConfiguracion();
    } catch (e: any) {
      this.modalService.showAlert('Error', 'Error al guardar la configuración: ' + e.message);
    } finally {
      this.loading = false;
    }
  }
}