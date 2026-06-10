# Single-stage build: Python FastAPI with Jinja2 templates (no React)
FROM python:3.11-slim

WORKDIR /app

# Copy and install python dependencies
COPY backend/requirements.txt .
RUN pip install --no-cache-dir --progress-bar off -r requirements.txt

# Copy backend app codebase
COPY backend/app/ app/

# Copy Jinja2 templates
COPY backend/templates/ templates/

# Copy static assets (CSS, JS)
COPY backend/static/ static/

# Create database directory to persist SQLite
RUN mkdir -p db

# Port 8000 for the unified FastAPI + Jinja2 web application
EXPOSE 8000

# Run uvicorn with single worker (APScheduler compatibility)
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000", "--workers", "1"]
