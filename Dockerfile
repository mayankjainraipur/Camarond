# syntax=docker/dockerfile:1

# --- Stage 1: build the React/Vite frontend -----------------------------
FROM node:20-slim AS frontend
WORKDIR /app/frontend

# Install deps first for better layer caching.
COPY frontend/package*.json ./
RUN npm ci

# Build the production bundle -> /app/frontend/dist
COPY frontend/ ./
RUN npm run build

# --- Stage 2: backend + built frontend ----------------------------------
FROM python:3.12-slim AS runtime
WORKDIR /app/backend

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    FRONTEND_DIST=/app/static \
    DATABASE_URL=sqlite:///./data/camarond.db

# Backend Python dependencies (pandas/openpyxl ship manylinux wheels, so no
# build toolchain is needed on python:3.12-slim).
COPY backend/requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

# Backend source.
COPY backend/ ./

# Built frontend from stage 1.
COPY --from=frontend /app/frontend/dist /app/static

# Where the SQLite DB lives (mounted as a volume by docker-compose).
RUN mkdir -p /app/backend/data

EXPOSE 8000

# Single ASGI process serves /api, /socket.io, and the SPA on one port.
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
