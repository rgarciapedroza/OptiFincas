import uvicorn
import sys
import os

sys.path.insert(0, os.path.dirname(os.path.abspath(".")))

from backend.app.main import app

if __name__ == "__main__":
    uvicorn.run(app, host="127.0.0.1", port=8000)
