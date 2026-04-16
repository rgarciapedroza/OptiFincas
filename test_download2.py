import urllib.request
import urllib.parse

with open("test_extracto.csv", "rb") as f:
    data = f.read()

req = urllib.request.Request(
    "http://127.0.0.1:8000/api/descargar-extracto", data=data, method="POST"
)
req.add_header("Content-Type", "multipart/form-data; boundary=----WebKitFormBoundary")

try:
    response = urllib.request.urlopen(req)
    print("Status:", response.status)
    print("Content:", response.read().decode()[:500])
except urllib.error.HTTPError as e:
    print("Status:", e.code)
    print("Error:", e.read().decode()[:500])
