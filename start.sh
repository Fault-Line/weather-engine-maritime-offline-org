#!/bin/bash
# Navigate to backend and run FastAPI
cd backend/src
uvicorn main:app --host 0.0.0.0 --port 8000
