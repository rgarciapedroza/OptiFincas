import requests

# First test the procesar endpoint
print("=== Testing procesar endpoint ===")
with open("test_extracto.csv", "rb") as f:
    resp = requests.post(
        "http://127.0.0.1:8000/api/procesar-extracto", files={"file": f}
    )
print("Status:", resp.status_code)
if resp.status_code == 200:
    print("Success!")
    d = resp.json()
    print("Total:", d["total_movimientos"])
else:
    print("Error:", resp.text)

# Now test the descargar endpoint
print("\n=== Testing descargar endpoint ===")
with open("test_extracto.csv", "rb") as f:
    resp = requests.post(
        "http://127.0.0.1:8000/api/descargar-extracto", files={"file": f}
    )
print("Status:", resp.status_code)
print("Content:", resp.text[:500])
