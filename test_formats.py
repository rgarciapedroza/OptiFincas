import requests

# Test with explicit content-type
print("=== Test 1: Default ===")
with open("test_extracto.csv", "rb") as f:
    resp = requests.post(
        "http://127.0.0.1:8000/api/descargar-extracto", files={"file": f}
    )
print("Status:", resp.status_code, resp.text[:100])

print("\n=== Test 2: With data param ===")
with open("test_extracto.csv", "rb") as f:
    resp = requests.post(
        "http://127.0.0.1:8000/api/descargar-extracto", data={"file": f}
    )
print("Status:", resp.status_code, resp.text[:100])

print("\n=== Test 3: Binary data ===")
with open("test_extracto.csv", "rb") as f:
    resp = requests.post("http://127.0.0.1:8000/api/descargar-extracto", data=f.read())
print("Status:", resp.status_code, resp.text[:100])

print("\n=== Test 4: curl format ===")
with open("test_extracto.csv", "rb") as f:
    content = f.read()
    resp = requests.post(
        "http://127.0.0.1:8000/api/descargar-extracto",
        data=content,
        headers={
            "Content-Type": "multipart/form-data; boundary=----WebKitFormBoundary7Ma4yG5fYcA9"
        },
    )
print("Status:", resp.status_code, resp.text[:100])
