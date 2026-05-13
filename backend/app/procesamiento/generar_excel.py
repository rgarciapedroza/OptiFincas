import os
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
ESTILO_CABECERA = PatternFill(start_color="FFFF00", end_color="FFFF00", fill_type="solid")
ESTILO_BLANCO = PatternFill(start_color="FFFFFF", end_color="FFFFFF", fill_type="solid")
ESTILO_DIFERENCIA = PatternFill(start_color="9CB2D4", end_color="9CB2D4", fill_type="solid")

FUENTE_NEGRITA = Font(bold=True)
FUENTE_ROJA = Font(color="FF0000")
FUENTE_NEGRITA_ROJA = Font(bold=True, color="FF0000")
FUENTE_NORMAL = Font(bold=False)

ALINEACION_ESTANDAR = Alignment(wrap_text=True, vertical='top', horizontal='left')
ALINEACION_CENTRO = Alignment(horizontal='center', vertical='center', wrap_text=True)

BORDE_GRUESO = Border(
    left=Side(style='medium', color="000000"),
    right=Side(style='medium', color="000000"),
    top=Side(style='medium', color="000000"),
    bottom=Side(style='medium', color="000000")
)

def crear_excel_actualizado(
    contenido_excel: bytes,
    nombre_hoja: str,
    movimientos_nuevos: List[Dict],
    resultado_conciliacion: Dict,
    mes: int,
    año: int,
    nombre_documento: str = "",
    es_excel: bool = True
) -> bytes:
    # 1. Determinar nombre de hoja dinámico basado en las transacciones
    # IMPORTANTE: no reasignar nombre_hoja en modo histórico si venía ya calculado.
    # Si el string FECHA no corresponde al mes/año esperado, puedes acabar creando una hoja "incorrecta"
    # y el usuario percibe que el histórico "no se copia".
    if movimientos_nuevos and not nombre_hoja:
        for mov in movimientos_nuevos:
            fecha_str = mov.get("FECHA")
            if fecha_str and len(str(fecha_str)) >= 10:
                try:
                    dt = datetime.strptime(str(fecha_str), "%d/%m/%Y")
                    meses_esp = ["ENERO", "FEBRERO", "MARZO", "ABRIL", "MAYO", "JUNIO",
                                 "JULIO", "AGOSTO", "SEPTIEMBRE", "OCTUBRE", "NOVIEMBRE", "DICIEMBRE"]
                    nombre_hoja = f"{meses_esp[dt.month-1]} {dt.year}"
                    break
                except:
                    continue

    if not nombre_hoja:
        raise ValueError("nombre_hoja no puede estar vacío")


    # Si no se provee contenido, creamos un libro nuevo (Modo solo extracto)
    if not contenido_excel:
        workbook = openpyxl.Workbook()
        hoja = workbook.active
        hoja.title = nombre_hoja
    else:
        try:
            workbook = load_workbook(io.BytesIO(contenido_excel))
        except Exception as e:
            raise ValueError(f"Error al cargar Excel histórico: {str(e)}")
        
        # Determinar el nombre final de la hoja para evitar duplicados
        final_nombre_hoja = nombre_hoja
        if final_nombre_hoja in workbook.sheetnames:
            # Si la hoja ya existe, creamos una nueva con un sufijo para preservar la original
            counter = 1
            while f"{nombre_hoja} ({counter})" in workbook.sheetnames:
                counter += 1
            final_nombre_hoja = f"{nombre_hoja} ({counter})"
        
        # Siempre la creamos al final para que sea "la última" y contenga todas las originales
        hoja = workbook.create_sheet(final_nombre_hoja)

    # Establecer la hoja recién creada como activa para que el Excel se abra por ella
    workbook.active = workbook.index(hoja)

    # Títulos especiales antes de la cabecera (en columna OBSERVACIONES = 2)
    # El título del documento es el nombre del segundo archivo (histórico)
    # Nota: para modo histórico queremos que se vea la copia del histórico completo.
    # Este código solo añade una hoja nueva al final y NO borra las existentes.
    cell_doc = hoja.cell(row=1, column=2, value=os.path.splitext(nombre_documento)[0])

    cell_doc.font = Font(bold=True, size=16)
    cell_doc.alignment = ALINEACION_CENTRO

    cell_sheet = hoja.cell(row=2, column=2, value=nombre_hoja)
    cell_sheet.font = Font(bold=True, size=14)
    cell_sheet.alignment = ALINEACION_CENTRO

    # Definir encabezados dinámicamente según la presencia de ORDENANTE
    headers = ["FECHA", "OBSERVACIONES", "IMPORTE", "SALDO", "CONCEPTO"]
    if es_excel: # Si el archivo original era Excel, siempre incluimos ORDENANTE
        headers.insert(1, "ORDENANTE")

    for col_idx, text in enumerate(headers, 1):
        cell = hoja.cell(row=4, column=col_idx, value=text)
        cell.font = FUENTE_NEGRITA
        cell.alignment = ALINEACION_CENTRO
        cell.fill = ESTILO_CABECERA
        cell.border = BORDE_GRUESO

    # La cabecera termina en la fila 4, los datos empiezan en la 5
    ultima_fila = 4
    
    # Usar movimientos_nuevos directamente (los enviados desde la UI editada)
    for mov_extracto in movimientos_nuevos:
        if not mov_extracto:
            continue
        
        ultima_fila += 1
        
        is_gasto = float(mov_extracto.get("IMPORTE", 0)) < 0

        for col_idx, header in enumerate(headers, 1):
            val = mov_extracto.get(header, "")
            if header == "CONCEPTO" and (not val or str(val).lower() == "nan"):
                val = "Sin asignar"
            
            cell = hoja.cell(row=ultima_fila, column=col_idx, value=val)
            cell.fill = ESTILO_BLANCO
            cell.border = BORDE_GRUESO
            
            # Aplicar alineación según requerimiento:
            # Excel: ORDENANTE y OBSERVACIONES a la izquierda, resto centradas.
            # CSV: OBSERVACIONES a la izquierda, resto centradas.
            if header == "OBSERVACIONES" or (es_excel and header == "ORDENANTE"):
                cell.alignment = ALINEACION_ESTANDAR
            else:
                cell.alignment = ALINEACION_CENTRO
            
            # Estilos de fuente (Rojo para gastos, Negrita para concepto)
            is_col_concepto = (header == "CONCEPTO")
            if is_gasto:
                cell.font = FUENTE_NEGRITA_ROJA if is_col_concepto else FUENTE_ROJA
            elif is_col_concepto:
                cell.font = FUENTE_NEGRITA
            else:
                cell.font = FUENTE_NORMAL

    # Ajustar anchos de columna automáticamente
    for col in hoja.columns:
        max_length = 0
        column = col[0].column_letter
        for cell in col:
            if cell.value: max_length = max(max_length, len(str(cell.value)))
        hoja.column_dimensions[column].width = min(max_length + 2, 50)

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
    
    suma_importe = 0
    
    for row in range(2, fila_totales):
        imp_val = hoja.cell(row=row, column=3).value
        
        try:
            if imp_val:
                suma_importe += float(imp_val)
        except:
            pass
        
    # Mostrar el total de movimientos en la columna de importe
    hoja.cell(row=fila_totales, column=3, value=round(suma_importe, 2))
    hoja.cell(row=fila_totales, column=3).font = FUENTE_NEGRITA
    
    # El saldo final del periodo en la columna 4
    hoja.cell(row=fila_totales, column=4).font = FUENTE_NEGRITA
    
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