import pandas as pd
import openpyxl
from openpyxl import load_workbook
from openpyxl.styles import Font, PatternFill, Alignment, Border, Side
from openpyxl.utils import get_column_letter
import io
from typing import Dict, List, Optional, Tuple
from datetime import datetime

ESTILO_CONCILIADO = PatternFill(start_color="C6EFCE", end_color="C6EFCE", fill_type="solid")
ESTILO_NO_CONCILIADO = PatternFill(start_color="FFC7CE", end_color="FFC7CE", fill_type="solid")
ESTILO_NUEVO = PatternFill(start_color="FFEB9C", end_color="FFEB9C", fill_type="solid")
ESTILO_DIFERENCIA = PatternFill(start_color="9CB2D4", end_color="9CB2D4", fill_type="solid")

FUENTE_NEGRITA = Font(bold=True)
BORDE_FINO = Border(
    left=Side(style='thin'),
    right=Side(style='thin'),
    top=Side(style='thin'),
    bottom=Side(style='thin')
)

def crear_excel_actualizado(
    contenido_excel: bytes,
    nombre_hoja: str,
    movimientos_nuevos: List[Dict],
    resultado_conciliacion: Dict,
    mes: int,
    año: int
) -> bytes:
    try:
        workbook = load_workbook(io.BytesIO(contenido_excel))
    except Exception as e:
        raise ValueError(f"Error al cargar Excel: {str(e)}")
    
    if nombre_hoja not in workbook.sheetnames:
        workbook.create_sheet(nombre_hoja)
    
    hoja = workbook[nombre_hoja]
    ultima_fila = hoja.max_row if hoja.max_row > 1 else 1
    
    df_existente = None
    try:
        df_existente = pd.read_excel(io.BytesIO(contenido_excel), sheet_name=nombre_hoja)
    except:
        pass
    
    if df_existente is not None and not df_existente.empty:
        if "Estado_Conciliacion" not in df_existente.columns:
            df_existente["Estado_Conciliacion"] = ""
        if "ID_Extracto" not in df_existente.columns:
            df_existente["ID_Extracto"] = ""
        
        conciliados = resultado_conciliacion.get("conciliados", [])
        
        for idx, _ in df_existente.iterrows():
            encontrado = False
            for conc in conciliados:
                mov_contable = conc.get("movimiento_contable", {})
                if mov_contable.get("id") == idx:
                    df_existente.at[idx, "Estado_Conciliacion"] = "CONCILIADO"
                    encontrado = True
                    break
            
            if not encontrado:
                df_existente.at[idx, "Estado_Conciliacion"] = ""
    
    no_conciliados = resultado_conciliacion.get("no_conciliados", [])
    
    for mov in no_conciliados:
        mov_extracto = mov.get("movimiento", {})
        
        if not mov_extracto:
            continue
        
        ultima_fila += 1
        
        fecha = mov_extracto.get("fecha", "")
        concepto = mov_extracto.get("concepto", "")
        importe = mov_extracto.get("importe", 0)
        tipo = mov_extracto.get("tipo", "")
        categoria = mov_extracto.get("categoria", "")
        
        hoja.cell(row=ultima_fila, column=1, value=fecha)
        hoja.cell(row=ultima_fila, column=2, value=concepto)
        
        if tipo == "gasto":
            hoja.cell(row=ultima_fila, column=3, value=abs(importe) if importe < 0 else 0)
            hoja.cell(row=ultima_fila, column=4, value=0)
        else:
            hoja.cell(row=ultima_fila, column=3, value=0)
            hoja.cell(row=ultima_fila, column=4, value=abs(importe) if importe > 0 else 0)
        
        hoja.cell(row=ultima_fila, column=5, value=categoria)
        hoja.cell(row=ultima_fila, column=6, value="PENDIENTE")
        hoja.cell(row=ultima_fila, column=7, value=mov_extracto.get("id_original", "NUEVO"))
        
        for col in range(1, 8):
            hoja.cell(row=ultima_fila, column=col).fill = ESTILO_NUEVO
    
    hoja = recalcular_totales(hoja)
    
    output = io.BytesIO()
    workbook.save(output)
    output.seek(0)
    
    return output.getvalue()

def recalcular_totales(hoja: openpyxl.worksheet.worksheet.Worksheet) -> openpyxl.worksheet.worksheet.Worksheet:
    ultima_fila = hoja.max_row
    
    fila_totales = None
    for row in range(1, ultima_fila + 1):
        valor = hoja.cell(row=row, column=1).value
        if valor and "TOTAL" in str(valor).upper():
            fila_totales = row
            break
    
    if not fila_totales:
        fila_totales = ultima_fila + 2
        hoja.cell(row=fila_totales, column=1, value="TOTALES")
        hoja.cell(row=fila_totales, column=1).font = FUENTE_NEGRITA
    
    suma_debe = 0
    suma_haber = 0
    
    for row in range(2, fila_totales):
        debe_val = hoja.cell(row=row, column=3).value
        haber_val = hoja.cell(row=row, column=4).value
        
        try:
            if debe_val:
                suma_debe += float(debe_val)
        except:
            pass
        
        try:
            if haber_val:
                suma_haber += float(haber_val)
        except:
            pass
    
    hoja.cell(row=fila_totales, column=3, value=round(suma_debe, 2))
    hoja.cell(row=fila_totales, column=4, value=round(suma_haber, 2))
    hoja.cell(row=fila_totales, column=3).font = FUENTE_NEGRITA
    hoja.cell(row=fila_totales, column=4).font = FUENTE_NEGRITA
    
    saldo = suma_haber - suma_debe
    hoja.cell(row=fila_totales, column=5, value=round(saldo, 2))
    hoja.cell(row=fila_totales, column=5).font = FUENTE_NEGRITA
    
    return hoja

def crear_excel_resumen(
    mes: int,
    año: int,
    resultado_conciliacion: Dict
) -> bytes:
    from openpyxl import Workbook
    from openpyxl.styles import Font, PatternFill
    
    wb = Workbook()
    ws = wb.active
    ws.title = "Resumen Conciliación"
    
    meses = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
             "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"]
    
    ws.cell(row=1, column=1, value=f"Resumen de Conciliación - {meses[mes-1]} {año}")
    ws.cell(row=1, column=1).font = Font(bold=True, size=14)
    
    resumen = resultado_conciliacion.get("resumen", {})
    
    row = 3
    ws.cell(row=row, column=1, value="CONCILIADOS")
    ws.cell(row=row, column=1).font = Font(bold=True)
    
    row += 1
    ws.cell(row=row, column=1, value="Movimientos conciliados:")
    ws.cell(row=row, column=2, value=resumen.get("conciliados", 0))
    
    row += 1
    ws.cell(row=row, column=1, value="Ingresos conciliados:")
    ws.cell(row=row, column=2, value=resumen.get("ingresos_conciliados", 0))
    
    row += 1
    ws.cell(row=row, column=1, value="Gastos conciliados:")
    ws.cell(row=row, column=2, value=resumen.get("gastos_conciliados", 0))
    
    row += 2
    ws.cell(row=row, column=1, value="NO CONCILIADOS")
    ws.cell(row=row, column=1).font = Font(bold=True)
    
    row += 1
    ws.cell(row=row, column=1, value="Movimientos nuevos:")
    ws.cell(row=row, column=2, value=resumen.get("no_conciliados", 0))
    
    row += 1
    ws.cell(row=row, column=1, value="Ingresos nuevos:")
    ws.cell(row=row, column=2, value=resumen.get("ingresos_nuevos", 0))
    
    row += 1
    ws.cell(row=row, column=1, value="Gastos nuevos:")
    ws.cell(row=row, column=2, value=resumen.get("gastos_nuevos", 0))
    
    row += 2
    ws.cell(row=row, column=1, value="DIFERENCIAS")
    ws.cell(row=row, column=1).font = Font(bold=True)
    
    row += 1
    ws.cell(row=row, column=1, value="Diferencias encontradas:")
    ws.cell(row=row, column=2, value=resumen.get("diferencias", 0))
    
    ws.column_dimensions['A'].width = 30
    ws.column_dimensions['B'].width = 20
    
    output = io.BytesIO()
    wb.save(output)
    output.seek(0)
    
    return output.getvalue()

def generar_excel_descarga(
    contenido_excel: bytes,
    nombre_hoja: str,
    resultado_conciliacion: Dict,
    movimientos_extracto: List[Dict],
    mes: int,
    año: int
) -> Tuple[bytes, str]:
    excel_bytes = crear_excel_actualizado(
        contenido_excel,
        nombre_hoja,
        [],
        resultado_conciliacion,
        mes,
        año
    )
    
    meses = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
            "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"]
    
    nombre_archivo = f"Contabilidad_{meses[mes-1]}_{año}_Actualizado.xlsx"
    
    return excel_bytes, nombre_archivo

GenerarExcelActualizado = crear_excel_actualizado
GenerarExcelResumen = crear_excel_resumen