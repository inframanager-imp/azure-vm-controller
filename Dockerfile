# Stage 1: Build the React application
FROM node:18-alpine AS builder

WORKDIR /frontend

# Copy package descriptors and install dependencies
COPY frontend/package*.json ./
RUN npm ci

# Copy frontend source files and compile
COPY frontend/ ./
RUN npm run build

# Stage 2: Serve using Python FastAPI
FROM python:3.11-slim

WORKDIR /app

# Install system dependencies if any are needed (e.g. for cryptography)
# Note: Cryptography, bcrypt, etc. have pre-compiled wheels, so build-essential is omitted.
# We do not run apt-get here to bypass the APT update/post-invoke issues.

# Copy and install python dependencies (using --progress-bar off to prevent thread limit crash)
COPY backend/requirements.txt .
RUN pip install --no-cache-dir --progress-bar off -r requirements.txt

# Copy backend app codebase
COPY backend/app/ app/

# Copy built frontend assets from builder stage into static/ directory
COPY --from=builder /frontend/dist/ static/

# Create database directory to persist SQLite
RUN mkdir -p db

# Port 8000 for the unified FastAPI + SPA web application
EXPOSE 8000

# Run uvicorn with single worker (APScheduler compatibility Correction #2)
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000", "--workers", "1"]
