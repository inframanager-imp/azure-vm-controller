# Use slim Python 3.11 base image
FROM python:3.11-slim

WORKDIR /app

# Install system dependencies if any are needed (e.g. for build tools if required by dependencies)
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    && rm -rf /var/lib/apt/lists/*

# Copy and install Python dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy backend codebase
COPY app/ app/

# Create database directory to persist SQLite
RUN mkdir -p db

# Port 8000 for FastAPI backend
EXPOSE 8000

# Single worker command (Uvicorn Correction #2)
# We run uvicorn with '--workers 1' because APScheduler runs in-process.
# Running multiple workers would instantiate multiple scheduler instances in separate processes,
# causing scheduled jobs to execute multiple times.
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000", "--workers", "1"]
