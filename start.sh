#!/bin/bash

# Railway startup script for Weather Engine Maritime
echo "🌊 Starting Weather Engine Maritime Backend..."

# Navigate to backend directory
cd backend

# Install dependencies
echo "📦 Installing Python dependencies..."
pip install -r requirements.txt

# Start the FastAPI application
echo "🚀 Starting FastAPI server..."
uvicorn src.main:app --host 0.0.0.0 --port ${PORT:-8000}
