import requests

with open("test_extracto.csv", "rb") as f:
    resp = requests.post(
        "http://127.0.0.1:8000/api/descargar-extracto", files={"file": f}
    )

print("Status:", resp.status_code)
print("Content-Type:", resp.headers.get("Content-Type"))
print("Content-Disposition:", resp.headers.get("Content-Disposition"))
print("First 500 chars:", resp.text[:500])
