import requests

with open("test_extracto.csv", "rb") as f:
    resp = requests.post(
        "http://127.0.0.1:8000/api/procesar-extracto", files={"file": f}
    )

print("Status:", resp.status_code)
if resp.status_code != 200:
    print("Error:", resp.text[:500])
    exit(1)
data = resp.json()
print("Ingresos:", data["resumen_general"]["total_ingresos"])
print("Gastos:", data["resumen_general"]["total_gastos"])
print("Movimientos:", data["total_movimientos"])
print("Categorias:", list(data["resumen_categorias"].keys()))
