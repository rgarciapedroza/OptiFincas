from fastapi import FastAPI, UploadFile, File
import pandas as pd
import io

app = FastAPI()

@app.post("/api/procesar-extracto")
async def procesar_extracto(file: UploadFile = File(...)):
    # Leer el archivo subido
    contenido = await file.read()
    
    # Intentar leer como CSV o Excel
    try:
        if file.filename.endswith('.csv'):
            df = pd.read_csv(io.StringIO(contenido.decode('latin-1')))
        else:
            df = pd.read_excel(io.BytesIO(contenido))
    except:
        return {"error": "No se pudo leer el archivo"}
    
    # Mostrar información básica
    resultado = {
        "nombre_archivo": file.filename,
        "columnas": list(df.columns),
        "filas": len(df),
        "primeras_filas": df.head(3).to_dict(orient="records")
    }
    
    return resultado