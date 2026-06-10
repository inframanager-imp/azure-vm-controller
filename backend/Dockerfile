# Use slim Python 3.11 base image
FROM python:3.11-slim

WORKDIR /app


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
