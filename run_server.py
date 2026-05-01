import uvicorn
import sys
import os

# Add project root to path
project_root = os.path.dirname(os.path.abspath("."))
if project_root not in sys.path:
    sys.path.insert(0, project_root)

# Add backend folder to path for imports
backend_path = os.path.join(project_root, "backend")
if backend_path not in sys.path:
    sys.path.insert(0, backend_path)

from backend.app.main import app

if __name__ == "__main__":
    uvicorn.run(app, host="127.0.0.1", port=8000)
