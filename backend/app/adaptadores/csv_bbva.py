import pandas as pd
import io

def leer_extracto_csv(upload_file):

    contenido = upload_file.file.read()

    try:
        df = pd.read_csv(io.StringIO(contenido.decode("latin-1")))
    except:
        df = pd.read_csv(io.StringIO(contenido.decode("utf-8")))

    df.columns = [str(c).strip() for c in df.columns]
    
    return df
